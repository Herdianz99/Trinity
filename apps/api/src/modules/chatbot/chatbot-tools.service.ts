import { Injectable } from '@nestjs/common';
import { ChatbotConfig } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { productSearchTsQuery } from '../../common/product-search';
import { caracasDateKey } from '../../common/timezone';

const MAX_RESULTS = 10;
const CANDIDATES = 200;
// Variantes defectuosas que existen como producto aparte (saco roto, segunda): van al final.
// OJO: (B) y (D) NO son variantes: en la grande el cemento que se vende es "SELLADO (B)" / "(D)".
const VARIANT_RE = /\((ROTO|ROTA|SEGUNDA|SEG|DEFECTO|MUESTRA)\)|\bSEGUNDA\b/i;

export interface BotProduct {
  codigo: string;
  nombre: string;
  marca: string | null;
  categoria: string | null;
  precio_bcv: string;
  precio_divisas: string;
  disponible: boolean;
  en_oferta: boolean;
  variante: boolean;
  tiene_foto: boolean;
}

export interface ProductImageOut {
  code: string;
  name: string;
  url: string;
}

// Palabras de relleno del cliente que no describen el producto ("precio del cemento" -> "cemento").
// El buscador exige TODAS las palabras, asi que estas harian fallar la busqueda.
const FILLER = new Set([
  'precio', 'precios', 'costo', 'cuesta', 'cuestan', 'vale', 'valen', 'cuanto', 'cuantos', 'cuanta',
  'tienen', 'tiene', 'tendran', 'tendra', 'hay', 'venden', 'vende', 'busco', 'buscando', 'necesito',
  'quiero', 'quisiera', 'me', 'por', 'favor', 'porfa', 'info', 'informacion', 'disponible', 'disponibilidad',
  'buenas', 'buenos', 'dias', 'tardes', 'noches', 'hola', 'saludos', 'amigo', 'amiga', 'del', 'de', 'la', 'el',
  'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'que', 'en', 'para', 'con', 'es', 'son', 'su', 'sus',
]);

function normalizeWords(s: string): string[] {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9/#.-]+/).filter(Boolean);
}

// Quita el relleno; si no queda nada, deja la consulta como vino.
export function cleanBotQuery(raw: string): string {
  const words = normalizeWords(raw);
  const kept = words.filter((w) => !FILLER.has(w));
  return (kept.length ? kept : words).join(' ');
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const usd = (n: number) => `${r2(n).toFixed(2)}$`;

// Herramientas del bot: SOLO LECTURA. Lo que devuelven es lo unico que el bot puede afirmar.
@Injectable()
export class ChatbotToolsService {
  constructor(
    private prisma: PrismaService,
    private invoices: InvoicesService,
  ) {}

  private isDivisaException(cfg: ChatbotConfig, p: { id: string; categoryId: string | null }) {
    return cfg.divisaExceptionProductIds.includes(p.id)
      || (!!p.categoryId && cfg.divisaExceptionCategoryIds.includes(p.categoryId));
  }

  divisaPrice(cfg: ChatbotConfig, p: { id: string; categoryId: string | null; priceDetal: number }): string {
    if (this.isDivisaException(cfg, p)) return 'lo confirma un asesor';
    return `${usd(p.priceDetal * (1 - cfg.divisaDiscountPct / 100))} en divisas`;
  }

  // Mismo motor que el POS (searchVector con sinonimos y fracciones + codigos), ordenado para chat:
  // nombre que empieza por lo buscado, normal antes que variante, MAS VENDIDO (nº de facturas en 90 dias, no unidades: los productos por kilo inflarian la cuenta; "cemento" -> el saco
  // de cemento gris), disponible, relevancia y oferta.
  // (Un producto principal AGOTADO no debe quedar fuera: el bot tiene que poder decir que esta agotado.)
  // conversationId null = prueba desde la pantalla (no se registra en el reporte de "sin resultado").
  async searchProducts(cfg: ChatbotConfig, conversationId: string | null, consulta: string) {
    const q = cleanBotQuery(consulta || '').slice(0, 120);
    // Prefijo de la primera palabra (sin plural): "plantas" -> "planta", para priorizar nombres que empiezan asi.
    const head = (q.split(' ')[0] || '').replace(/(es|s)$/, '');
    const tsq = productSearchTsQuery(q);
    let rows: any[] = [];
    if (tsq) {
      const like = `%${q}%`;
      const headLike = `${head}%`;
      rows = await this.prisma.$queryRaw<any[]>`
        SELECT p.id, p.code, p.name, p."priceDetal", p."isOnSale", p."isService", p."categoryId",
          p."primaryImageMediumUrl", p."primaryImageThumbUrl", b.name AS brand, c.name AS category,
          COALESCE((SELECT SUM(s.quantity) FROM "Stock" s JOIN "Warehouse" w ON w.id = s."warehouseId"
                    WHERE s."productId" = p.id AND w."countsForSale" = true), 0)::float AS stock,
          ts_rank(p."searchVector", to_tsquery('spanish', ${tsq})) AS rank,
          COALESCE((SELECT COUNT(DISTINCT ii."invoiceId") FROM "InvoiceItem" ii JOIN "Invoice" i ON i.id = ii."invoiceId"
                    WHERE ii."productId" = p.id AND i.status IN ('PAID', 'PARTIAL_RETURN')
                      AND i."createdAt" >= now() - interval '90 days'), 0)::float AS sold
        FROM "Product" p
        LEFT JOIN "Brand" b ON b.id = p."brandId"
        LEFT JOIN "Category" c ON c.id = p."categoryId"
        WHERE p."isActive" AND NOT p."saleBlocked" AND p."priceDetal" > 0
          AND (p."searchVector" @@ to_tsquery('spanish', ${tsq})
               OR p.code ILIKE ${like} OR p.barcode ILIKE ${like})
        ORDER BY (lower(unaccent(p.name)) LIKE ${headLike}) DESC, rank DESC, p.name
        LIMIT ${CANDIDATES}`;
    }
    const reserved = rows.length ? await this.invoices.getReservedStock() : {};

    const ranked = rows
      .map((r) => {
        const available = r.isService || Number(r.stock) - (reserved[r.id] || 0) > 0;
        const name = normalizeWords(r.name).join(' ');
        return { r, available, variant: VARIANT_RE.test(r.name), starts: head.length >= 3 && name.startsWith(head) };
      })
      .sort((a, b) =>
        Number(b.starts) - Number(a.starts)
        || Number(a.variant) - Number(b.variant)
        || Number(b.r.sold) - Number(a.r.sold)
        || Number(b.available) - Number(a.available)
        || Number(b.r.rank) - Number(a.r.rank)
        || Number(b.r.isOnSale) - Number(a.r.isOnSale)
        || a.r.name.localeCompare(b.r.name))
      .slice(0, MAX_RESULTS);

    if (conversationId) {
      await this.prisma.chatbotSearchLog.create({
        data: { conversationId, query: q, resultCount: rows.length },
      });
    }

    const productos: BotProduct[] = ranked.map(({ r, available, variant }) => ({
      codigo: r.code,
      nombre: r.name,
      marca: r.brand ?? null,
      categoria: r.category ?? null,
      precio_bcv: `${usd(Number(r.priceDetal))} bcv`,
      precio_divisas: this.divisaPrice(cfg, { id: r.id, categoryId: r.categoryId, priceDetal: Number(r.priceDetal) }),
      disponible: available,
      en_oferta: !!r.isOnSale,
      variante: variant,
      tiene_foto: !!(r.primaryImageMediumUrl || r.primaryImageThumbUrl),
    }));
    return { consulta: q, total_encontrados: rows.length, productos };
  }

  async productImage(codigo: string): Promise<ProductImageOut | null> {
    const p = await this.prisma.product.findFirst({
      where: { code: (codigo || '').trim(), isActive: true },
      select: { code: true, name: true, primaryImageMediumUrl: true, primaryImageThumbUrl: true },
    });
    const url = p?.primaryImageMediumUrl || p?.primaryImageThumbUrl;
    return p && url ? { code: p.code, name: p.name, url } : null;
  }

  // Bs con la tasa BCV GUARDADA del dia (regla del proyecto: nunca calcular la tasa en el momento).
  async toBolivares(montoUsd?: number, codigo?: string) {
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: caracasDateKey() } });
    if (!rate) return { error: 'Todavía no está cargada la tasa BCV de hoy. Un asesor puede dar el monto en bolívares.' };
    let amount = Number(montoUsd);
    let producto: string | undefined;
    if (codigo) {
      const p = await this.prisma.product.findFirst({
        where: { code: codigo.trim(), isActive: true },
        select: { name: true, priceDetal: true },
      });
      if (!p) return { error: `No existe el producto ${codigo}` };
      amount = p.priceDetal;
      producto = p.name;
    }
    if (!Number.isFinite(amount) || amount <= 0) return { error: 'Indique un monto en dólares o un código de producto' };
    const bs = r2(amount * rate.rate);
    return {
      producto,
      monto_usd: usd(amount),
      tasa_bcv: rate.rate,
      monto_bs: `Bs ${bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    };
  }
}
