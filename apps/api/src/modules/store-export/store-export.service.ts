import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SpacesService } from '../product-images/spaces.service';
import { buildSnapshotData, type RawProduct, type SnapshotBuild } from './store-export.builder';
import { caracasDateKey } from '../../common/timezone';

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
      where: { isActive: true, showInStore: true },
      select: {
        code: true,
        name: true,
        description: true,
        priceDetal: true,
        storeFeatured: true,
        primaryImageThumbUrl: true,
        primaryImageMediumUrl: true,
        images: {
          select: { mediumKey: true },
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
        },
        category: { select: { name: true } },
        brand: { select: { name: true } },
        stock: { select: { quantity: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Resuelve las keys de Spaces a URLs de CDN (la principal queda primera).
    const products: RawProduct[] = rows.map((r) => ({
      code: r.code,
      name: r.name,
      description: r.description,
      priceDetal: r.priceDetal,
      storeFeatured: r.storeFeatured,
      primaryImageThumbUrl: r.primaryImageThumbUrl,
      primaryImageMediumUrl: r.primaryImageMediumUrl,
      images: r.images.map((i) => this.spaces.cdnUrl(i.mediumKey)),
      category: r.category,
      brand: r.brand,
      stock: r.stock,
    }));
    return { products, rate };
  }

  /** Construye y sube store/catalog.json + store/meta.json. Devuelve un resumen. */
  async exportCatalog(): Promise<SnapshotBuild['summary']> {
    const { products, rate } = await this.fetchData();
    const { catalog, meta, summary } = buildSnapshotData(products, rate, new Date().toISOString());

    await this.spaces.uploadJson('store/catalog.json', catalog, 60);
    await this.spaces.uploadJson('store/meta.json', meta, 60);

    this.logger.log(`Snapshot tienda subido: ${JSON.stringify(summary)}`);
    return summary;
  }
}
