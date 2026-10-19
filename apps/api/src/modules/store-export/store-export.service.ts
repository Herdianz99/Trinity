import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SpacesService } from '../product-images/spaces.service';
import { buildSnapshotData, type ExportBanner, type RawProduct, type SnapshotBuild } from './store-export.builder';
import { caracasDateKey } from '../../common/timezone';
import { productSearchTsQuery } from '../../common/product-search';
import type { ComplementRule } from './store-complements';

@Injectable()
export class StoreExportService {
  private readonly logger = new Logger(StoreExportService.name);
  private exportTimer: NodeJS.Timeout | null = null;

  constructor(
    private prisma: PrismaService,
    private spaces: SpacesService,
  ) {}

  /**
   * Programa un export en `delayMs` (debounced). Colapsa ráfagas de cambios (ej. un
   * ajuste masivo de precios) en un solo export, ~8s después del último cambio.
   * Se llama desde los puntos donde cambian precio/stock/showInStore.
   */
  scheduleExport(delayMs = 8000): void {
    if (this.exportTimer) clearTimeout(this.exportTimer);
    this.exportTimer = setTimeout(() => {
      this.exportTimer = null;
      this.exportCatalog().catch((e) =>
        this.logger.error(`Export por evento falló: ${(e as Error).message}`),
      );
    }, delayMs);
    this.exportTimer.unref?.(); // no mantener vivo el proceso por este timer
  }

  /** Lee el "chrome" administrable: iconos de categoría (emoji) y logos de marca (URL). */
  private async fetchChrome(): Promise<{
    catIcons: Record<string, string | null>;
    brandLogos: Record<string, string | null>;
  }> {
    const [cats, brands] = await Promise.all([
      this.prisma.category.findMany({ select: { name: true, icon: true } }),
      this.prisma.brand.findMany({ select: { name: true, logoKey: true } }),
    ]);
    const catIcons: Record<string, string | null> = {};
    for (const c of cats) if (c.icon) catIcons[c.name] = c.icon;
    const brandLogos: Record<string, string | null> = {};
    for (const b of brands) if (b.logoKey) brandLogos[b.name] = this.spaces.cdnUrl(b.logoKey);
    return { catIcons, brandLogos };
  }

  /** Lee los banners activos y resuelve sus imágenes a URL de CDN. */
  private async fetchBanners(): Promise<ExportBanner[]> {
    const rows = await this.prisma.storeBanner.findMany({
      where: { isActive: true },
      orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((b) => ({
      id: b.id,
      placement: b.placement,
      title: b.title,
      subtitle: b.subtitle,
      tag: b.tag,
      imageUrl: b.imageKey ? this.spaces.cdnUrl(b.imageKey) : null,
      linkUrl: b.linkUrl,
      linkLabel: b.linkLabel,
      order: b.sortOrder,
    }));
  }

  /**
   * Reglas ACTIVAS de venta cruzada del chatbot resueltas a codigos de productos publicados: quien las dispara
   * (mismo tsquery y exclusiones que el bot) y, por termino, quien lo cumple sin disparar la regla.
   */
  private async fetchComplementRules(): Promise<ComplementRule[]> {
    const rules = await this.prisma.chatbotCrossSellRule.findMany({
      where: { status: 'ACTIVE' },
      select: { trigger: true, offerTerms: true, excludeTerms: true, useMeasure: true },
    });
    const orTsQuery = (terms: string[]) =>
      terms.map(productSearchTsQuery).filter(Boolean).map((q) => `(${q})`).join(' | ');
    const codes = async (tsq: string, notTsq: string): Promise<Set<string>> => {
      const not = notTsq ? Prisma.sql`AND NOT (p."searchVector" @@ to_tsquery('spanish', ${notTsq}))` : Prisma.empty;
      const rows = await this.prisma.$queryRaw<{ code: string }[]>`
        SELECT p.code FROM "Product" p
        WHERE p."isActive" AND p."showInStore" AND NOT p."saleBlocked"
          AND p."searchVector" @@ to_tsquery('spanish', ${tsq}) ${not}`;
      return new Set(rows.map((r) => r.code));
    };
    // code -> facturas (180 dias) en que el candidato salio junto a algun producto que dispara la regla.
    const pairCounts = async (triggers: Set<string>, candidates: Set<string>): Promise<Map<string, number>> => {
      if (!triggers.size || !candidates.size) return new Map();
      const rows = await this.prisma.$queryRaw<{ code: string; n: number }[]>`
        SELECT c.code, COUNT(DISTINCT i.id)::int AS n
        FROM "Invoice" i
        JOIN "InvoiceItem" ti ON ti."invoiceId" = i.id JOIN "Product" t ON t.id = ti."productId"
        JOIN "InvoiceItem" ci ON ci."invoiceId" = i.id JOIN "Product" c ON c.id = ci."productId"
        WHERE i.type = 'SALE' AND i.status IN ('PAID', 'PARTIAL_RETURN') AND i."createdAt" >= now() - interval '180 days'
          AND t.code = ANY(${[...triggers]}::text[]) AND c.code = ANY(${[...candidates]}::text[]) AND c.id <> t.id
        GROUP BY c.code`;
      return new Map(rows.map((r) => [r.code, Number(r.n)]));
    };
    const out: ComplementRule[] = [];
    for (const r of rules) {
      const trig = productSearchTsQuery(r.trigger);
      if (!trig) continue;
      const triggerCodes = await codes(trig, orTsQuery(r.excludeTerms));
      const offers: ComplementRule['offers'] = [];
      for (const term of r.offerTerms) {
        const tsq = productSearchTsQuery(term);
        if (tsq) offers.push({ term, candidates: await pairCounts(triggerCodes, await codes(tsq, trig)) });
      }
      out.push({ useMeasure: r.useMeasure, triggerCodes, offers });
    }
    return out;
  }

  /** Lee los productos publicables + la tasa del día (para el builder). */
  private async fetchData(): Promise<{ products: RawProduct[]; rate: number }> {
    // "Última tasa con fecha <= hoy (Caracas)": ignora una tasa futura pre-cargada
    // por el cron (la de mañana) hasta que su fecha llegue, y si BCV falló usa la
    // última buena (nunca Bs 0). Cambia sola a medianoche en el próximo export.
    const rateRow = await this.prisma.exchangeRate.findFirst({
      where: { date: { lte: caracasDateKey() } },
      orderBy: { date: 'desc' },
    });
    const rate = rateRow?.rate ?? 0;

    const rows = await this.prisma.product.findMany({
      // Bloqueados para la venta no se publican: al facturar el pedido se omitirian.
      where: { isActive: true, showInStore: true, saleBlocked: false },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        searchKeywords: true,
        priceDetal: true,
        storeFeatured: true,
        isOnSale: true,
        primaryImageThumbUrl: true,
        primaryImageMediumUrl: true,
        images: {
          select: { mediumKey: true },
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
        },
        category: { select: { name: true } },
        brand: { select: { name: true } },
        stock: { where: { warehouse: { countsForSale: true } }, select: { quantity: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Apartado en facturas en espera (igual que InvoicesService.getReservedStock) y facturas de 90 dias
    // (igual que el "mas vendido" del chatbot: facturas, no unidades, para no inflar lo que se vende por kilo).
    const [reservedRows, soldRows] = await Promise.all([
      this.prisma.invoiceItem.groupBy({
        by: ['productId'],
        where: { invoice: { status: 'PENDING' } },
        _sum: { quantity: true },
      }),
      this.prisma.$queryRaw<{ productId: string; n: number }[]>`
        SELECT ii."productId", COUNT(DISTINCT ii."invoiceId")::int AS n
        FROM "InvoiceItem" ii JOIN "Invoice" i ON i.id = ii."invoiceId"
        WHERE i.type = 'SALE' AND i.status IN ('PAID', 'PARTIAL_RETURN') AND i."createdAt" >= now() - interval '90 days'
        GROUP BY 1`,
    ]);
    const reserved = new Map(reservedRows.map((g) => [g.productId, Math.max(0, g._sum.quantity || 0)]));
    const sold = new Map(soldRows.map((s) => [s.productId, Number(s.n)]));

    // Resuelve las keys de Spaces a URLs de CDN (la principal queda primera).
    const products: RawProduct[] = rows.map((r) => ({
      code: r.code,
      name: r.name,
      description: r.description,
      searchKeywords: r.searchKeywords,
      priceDetal: r.priceDetal,
      storeFeatured: r.storeFeatured,
      isOnSale: r.isOnSale,
      primaryImageThumbUrl: r.primaryImageThumbUrl,
      primaryImageMediumUrl: r.primaryImageMediumUrl,
      images: r.images.map((i) => this.spaces.cdnUrl(i.mediumKey)),
      category: r.category,
      brand: r.brand,
      stock: r.stock,
      reservedQty: reserved.get(r.id) ?? 0,
      sold90: sold.get(r.id) ?? 0,
    }));
    return { products, rate };
  }

  /** Construye y sube store/catalog.json + store/meta.json. Devuelve un resumen. */
  async exportCatalog(): Promise<SnapshotBuild['summary']> {
    const [{ products, rate }, banners, chrome, complementRules] = await Promise.all([
      this.fetchData(),
      this.fetchBanners(),
      this.fetchChrome(),
      this.fetchComplementRules(),
    ]);
    const { catalog, meta, summary } = buildSnapshotData(
      products,
      rate,
      new Date().toISOString(),
      banners,
      chrome.catIcons,
      chrome.brandLogos,
      complementRules,
    );

    // Prefijo de la ruta del snapshot. En prod queda 'store'; en local se puede
    // apuntar a 'store-local' (STORE_SNAPSHOT_PREFIX) para NO pisar el snapshot real.
    const prefix = (process.env.STORE_SNAPSHOT_PREFIX || 'store').replace(/\/+$/, '');
    await this.spaces.uploadJson(`${prefix}/catalog.json`, catalog, 60);
    await this.spaces.uploadJson(`${prefix}/meta.json`, meta, 60);

    this.logger.log(`Snapshot tienda subido a "${prefix}/": ${JSON.stringify(summary)}`);
    return summary;
  }
}
