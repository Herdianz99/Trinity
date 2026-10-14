import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';

// Bitacora de costos y precios (Sesion 162). Las filas las escribe el trigger product_price_log_trg;
// aqui solo se consultan.

export interface PriceLogQuery {
  from?: string;
  to?: string;
  userId?: string;
  productId?: string;
  categoryId?: string;
  source?: string;
  search?: string;
  onlyManual?: string;
  batchId?: string;
  page?: string;
  limit?: string;
}

// "Solo cambios manuales": lo que una persona decidio directamente (no recalculos automaticos).
const MANUAL_SOURCES = ['MANUAL_EDIT', 'PRICE_ADJUSTMENT', 'DIRECT_DB'];

export const PRICE_LOG_SOURCE_LABELS: Record<string, string> = {
  CREATE: 'Creación del producto',
  MANUAL_EDIT: 'Edición en ficha',
  PRICE_ADJUSTMENT: 'Ajuste masivo',
  PURCHASE: 'Compra',
  GLOBAL_BREGA: 'Cambio de brecha global',
  CATEGORY_BREGA: 'Cambio de brecha de categoría',
  IMPORT: 'Importación',
  INTEGRATION: 'Integración con empresa socia',
  PARTNER_TRANSFER: 'Traslado entre empresas',
  INVENTORY_REPLACEMENT: 'Reemplazo de inventario',
  DIRECT_DB: 'Directo en base de datos',
};

const SELECT_ROW = Prisma.sql`
  l.id, l."productId", l."userId", l.source, l.reference, l."batchId",
  l."oldCostUsd", l."newCostUsd", l."oldPriceDetal", l."newPriceDetal", l."oldPriceMayor", l."newPriceMayor",
  l."oldGananciaPct", l."newGananciaPct", l."oldGananciaMayorPct", l."newGananciaMayorPct",
  l."oldManualPrice", l."newManualPrice", l."exchangeRate", l."newCostBs", l."newPriceDetalBs", l."newPriceMayorBs",
  l."createdAt", p.code AS "productCode", p.name AS "productName", u.name AS "userName"`;

@Injectable()
export class PriceLogService {
  constructor(private prisma: PrismaService) {}

  private where(q: PriceLogQuery): Prisma.Sql {
    const c: Prisma.Sql[] = [Prisma.sql`TRUE`];
    // createdAt es TIMESTAMP: rango anclado al dia-calendario de Caracas.
    if (q.from) c.push(Prisma.sql`l."createdAt" >= ${caracasDayStart(q.from)}`);
    if (q.to) c.push(Prisma.sql`l."createdAt" <= ${caracasDayEnd(q.to)}`);
    if (q.userId === 'none') c.push(Prisma.sql`l."userId" IS NULL`);
    else if (q.userId) c.push(Prisma.sql`l."userId" = ${q.userId}`);
    if (q.productId) c.push(Prisma.sql`l."productId" = ${q.productId}`);
    if (q.categoryId) {
      c.push(Prisma.sql`p."categoryId" IN (SELECT id FROM "Category" WHERE id = ${q.categoryId} OR "parentId" = ${q.categoryId})`);
    }
    if (q.source) c.push(Prisma.sql`l.source = ${q.source}`);
    if (q.onlyManual === 'true') c.push(Prisma.sql`l.source IN (${Prisma.join(MANUAL_SOURCES)})`);
    if (q.batchId) c.push(Prisma.sql`l."batchId" = ${q.batchId}`);
    if (q.search?.trim()) {
      const like = `%${q.search.trim()}%`;
      c.push(Prisma.sql`(p.code ILIKE ${like} OR p.name ILIKE ${like} OR l.reference ILIKE ${like})`);
    }
    return Prisma.join(c, ' AND ');
  }

  private paging(q: PriceLogQuery) {
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
    const page = Math.max(Number(q.page) || 1, 1);
    return { limit, page, offset: (page - 1) * limit };
  }

  /**
   * Reporte general. Un cambio masivo (mismo batchId, varios productos) sale como UN evento con
   * `count` > 1; el detalle se pide con `batchId`. Cuando se filtra por batchId se listan las filas.
   */
  async findAll(q: PriceLogQuery) {
    const { limit, page, offset } = this.paging(q);
    const where = this.where(q);
    if (q.batchId) {
      const [rows, total] = await Promise.all([
        this.prisma.$queryRaw<any[]>`
          SELECT ${SELECT_ROW}, 1::int AS count FROM "ProductPriceLog" l
          JOIN "Product" p ON p.id = l."productId" LEFT JOIN "User" u ON u.id = l."userId"
          WHERE ${where} ORDER BY p.code LIMIT ${limit} OFFSET ${offset}`,
        this.countRows(where),
      ]);
      return { data: rows.map(norm), total, page, limit };
    }
    const [rows, totalRows] = await Promise.all([
      this.prisma.$queryRaw<any[]>`
        WITH f AS (
          SELECT ${SELECT_ROW}, COALESCE(l."batchId", l.id) AS k
          FROM "ProductPriceLog" l
          JOIN "Product" p ON p.id = l."productId" LEFT JOIN "User" u ON u.id = l."userId"
          WHERE ${where}
        ), ev AS (
          SELECT DISTINCT ON (k) f.*, COUNT(*) OVER (PARTITION BY k)::int AS count
          FROM f ORDER BY k, "createdAt", "productCode"
        )
        SELECT * FROM ev ORDER BY "createdAt" DESC, id LIMIT ${limit} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(DISTINCT COALESCE(l."batchId", l.id))::int AS n FROM "ProductPriceLog" l
        JOIN "Product" p ON p.id = l."productId" WHERE ${where}`,
    ]);
    return { data: rows.map(norm), total: totalRows[0]?.n ?? 0, page, limit };
  }

  /** Historial de un producto (pestaña de la ficha): filas sueltas, mas nuevas primero. */
  async findByProduct(productId: string, q: PriceLogQuery) {
    const { limit, page, offset } = this.paging(q);
    const where = this.where({ ...q, productId });
    const [rows, total] = await Promise.all([
      this.prisma.$queryRaw<any[]>`
        SELECT ${SELECT_ROW}, 1::int AS count FROM "ProductPriceLog" l
        JOIN "Product" p ON p.id = l."productId" LEFT JOIN "User" u ON u.id = l."userId"
        WHERE ${where} ORDER BY l."createdAt" DESC, l.id LIMIT ${limit} OFFSET ${offset}`,
      this.countRows(where),
    ]);
    return { data: rows.map(norm), total, page, limit };
  }

  /** Usuarios que aparecen en la bitacora (para el filtro). */
  async users() {
    return this.prisma.$queryRaw<{ id: string; name: string }[]>`
      SELECT DISTINCT u.id, u.name FROM "ProductPriceLog" l JOIN "User" u ON u.id = l."userId" ORDER BY u.name`;
  }

  /** Excel con todas las filas (sin agrupar) que cumplen los filtros. Tope 50.000 filas. */
  async exportExcel(q: PriceLogQuery): Promise<Buffer> {
    const where = this.where(q);
    const rows = (await this.prisma.$queryRaw<any[]>`
      SELECT ${SELECT_ROW} FROM "ProductPriceLog" l
      JOIN "Product" p ON p.id = l."productId" LEFT JOIN "User" u ON u.id = l."userId"
      WHERE ${where} ORDER BY l."createdAt" DESC, p.code LIMIT 50000`).map(norm);
    const fmt = new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
    });
    const data = rows.map((r) => ({
      'Fecha (Caracas)': fmt.format(new Date(r.createdAt)),
      Usuario: r.userName ?? (r.source === 'DIRECT_DB' ? '(sin usuario)' : ''),
      Origen: PRICE_LOG_SOURCE_LABELS[r.source] ?? r.source,
      Documento: r.reference ?? '',
      Codigo: r.productCode,
      Producto: r.productName,
      'Costo antes $': r.oldCostUsd, 'Costo después $': r.newCostUsd,
      'Detal antes $': r.oldPriceDetal, 'Detal después $': r.newPriceDetal,
      'Var. detal %': r.oldPriceDetal ? round2(((r.newPriceDetal - r.oldPriceDetal) / r.oldPriceDetal) * 100) : null,
      'Mayor antes $': r.oldPriceMayor, 'Mayor después $': r.newPriceMayor,
      '% Gan. detal antes': r.oldGananciaPct, '% Gan. detal después': r.newGananciaPct,
      '% Gan. mayor antes': r.oldGananciaMayorPct, '% Gan. mayor después': r.newGananciaMayorPct,
      'Precio manual': r.newManualPrice === null ? '' : r.newManualPrice ? 'Sí' : 'No',
      Tasa: r.exchangeRate,
      'Detal después Bs': r.newPriceDetalBs,
      'Mayor después Bs': r.newPriceMayorBs,
      'Costo después Bs': r.newCostBs,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [18, 20, 26, 22, 14, 44, 11, 11, 11, 11, 10, 11, 11, 10, 10, 10, 10, 9, 10, 13, 13, 13].map((wch) => ({ wch }));
    if (ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bitacora de precios');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  private async countRows(where: Prisma.Sql) {
    const r = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM "ProductPriceLog" l JOIN "Product" p ON p.id = l."productId" WHERE ${where}`;
    return r[0]?.n ?? 0;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function norm(r: any) {
  return { ...r, count: Number(r.count ?? 1), sourceLabel: PRICE_LOG_SOURCE_LABELS[r.source] ?? r.source };
}
