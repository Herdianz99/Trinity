import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';
import { resolveBregaPct, effectiveCost as effCost } from '../../common/pricing';
import { buildCategoryBregaMap } from '../../common/category-brega';
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';

@Injectable()
export class InventoryAdjustmentsPdfService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reporte del ajuste de inventario.
   * Columnas: Codigo, Ref. Proveedor, Producto, Cantidad, Costo, Importe + total al final.
   */
  async generateReport(id: string): Promise<Buffer> {
    const adjustment = await this.prisma.inventoryAdjustment.findUnique({
      where: { id },
      include: {
        warehouse: true,
        supplier: { select: { name: true } },
        customer: { select: { name: true } },
        items: {
          include: {
            product: {
              select: { code: true, name: true, supplierRef: true, costUsd: true, bregaApplies: true, categoryId: true },
            },
          },
          // Mismo orden que la pantalla: en el que se agregaron (id cuid cronológico), no alfabético.
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!adjustment) throw new NotFoundException('Ajuste no encontrado');

    // Modo de costo del reporte: 'BREGA' suma la brecha global a los productos con bregaApplies;
    // 'COST' usa el costo puro. La brecha es la misma que se usa al calcular precios.
    const useBrega = adjustment.costMode !== 'COST';
    const config = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
      select: { bregaGlobalPct: true },
    });
    const bregaGlobalPct = config?.bregaGlobalPct ?? 0;
    const catBregaMap = await buildCategoryBregaMap(this.prisma);
    // Costo efectivo por item: el editado a mano (unitCostUsd) manda; si no, costo (+ brecha).
    const effectiveCost = (it: {
      unitCostUsd: number | null;
      product: { costUsd: number; bregaApplies: boolean; categoryId: string | null };
    }): number => {
      if (it.unitCostUsd != null) return it.unitCostUsd;
      const bregaPct = useBrega
        ? resolveBregaPct({
            bregaApplies: it.product.bregaApplies,
            categoryBregaPct: it.product.categoryId ? (catBregaMap.get(it.product.categoryId) ?? 0) : 0,
            bregaGlobalPct,
          })
        : 0;
      return effCost(it.product.costUsd, bregaPct);
    };
    // La brecha ahora puede variar por categoría → no mostramos un % único en la etiqueta.
    const costModeLabel = useBrega ? 'Costo + Brecha' : 'Costo';

    const typeLabel = adjustment.type === 'IN' ? 'Entrada' : 'Salida';
    const statusLabel =
      adjustment.status === 'DRAFT'
        ? 'Borrador'
        : adjustment.status === 'PROCESSED'
          ? 'Procesado'
          : 'Cancelado';

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 80; // 532
      const pageHeight = doc.page.height;

      // Total general (importe = cantidad * costo)
      let totalImporte = 0;
      let totalUnidades = 0;
      for (const item of adjustment.items) {
        totalImporte += item.quantity * effectiveCost(item);
        totalUnidades += item.quantity;
      }

      const drawHeader = (y: number): number => {
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000');
        doc.text('REPORTE DE AJUSTE DE INVENTARIO', 40, y, {
          width: pageWidth,
          align: 'center',
        });
        y += 18;

        if (adjustment.number) {
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000');
          doc.text(adjustment.number, 40, y, { width: pageWidth, align: 'center' });
          y += 16;
        }

        doc.fontSize(9).font('Helvetica').fillColor('#333333');
        // Ancho de la columna izquierda: hasta antes de la columna derecha (x=350),
        // asi un nombre de almacen/proveedor largo envuelve en vez de invadir la derecha.
        const leftW = 300;
        // Escribe una fila de 2 columnas y avanza y por la altura de la mas alta.
        const twoCol = (left: string, right: string) => {
          const lh = doc.heightOfString(left, { width: leftW });
          const rh = doc.heightOfString(right, { width: pageWidth - 310 });
          doc.text(left, 40, y, { width: leftW });
          doc.text(right, 350, y, { width: pageWidth - 310 });
          y += Math.max(14, lh, rh);
        };
        // Escribe una fila de 1 columna (ancho completo) con altura dinamica.
        const fullRow = (text: string) => {
          const h = doc.heightOfString(text, { width: pageWidth });
          doc.text(text, 40, y, { width: pageWidth });
          y += Math.max(14, h);
        };
        twoCol(
          `Almacen: ${adjustment.warehouse.name}`,
          `Fecha: ${new Date(adjustment.createdAt).toLocaleDateString('es-VE')}`,
        );
        twoCol(`Tipo: ${typeLabel}`, `Estado: ${statusLabel}`);
        if (adjustment.supplier?.name || adjustment.customer?.name) {
          fullRow(
            `${adjustment.supplier ? 'Proveedor' : 'Cliente'}: ${
              adjustment.supplier?.name || adjustment.customer?.name
            }`,
          );
        }
        if (adjustment.description) {
          fullRow(`Descripcion: ${adjustment.description}`);
        }
        twoCol(
          `Total de productos: ${adjustment.items.length}`,
          `Costo usado: ${costModeLabel}`,
        );
        y += 4;
        doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#999999');
        y += 8;
        return y;
      };

      // Column positions (portrait LETTER = 612 x 792, table 40..572)
      const col = {
        num: 40,
        code: 60,
        ref: 130,
        product: 222,
        qty: 392,
        cost: 442,
        importe: 500,
      };
      const colWidths = {
        num: 18,
        code: 68,
        ref: 90,
        product: 168,
        qty: 48,
        cost: 55,
        importe: 72,
      };

      const drawTableHeader = (y: number): number => {
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000000');
        doc.text('#', col.num, y, { width: colWidths.num, align: 'center' });
        doc.text('Codigo', col.code, y, { width: colWidths.code });
        doc.text('Ref. Proveedor', col.ref, y, { width: colWidths.ref });
        doc.text('Producto', col.product, y, { width: colWidths.product });
        doc.text('Cantidad', col.qty, y, { width: colWidths.qty, align: 'right' });
        doc.text('Costo', col.cost, y, { width: colWidths.cost, align: 'right' });
        doc.text('Importe', col.importe, y, { width: colWidths.importe, align: 'right' });
        y += 14;
        doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#999999');
        y += 4;
        return y;
      };

      let y = drawHeader(40);

      if (adjustment.items.length === 0) {
        y += 20;
        doc.fontSize(10).font('Helvetica').fillColor('#333333');
        doc.text('Este ajuste no tiene productos.', 40, y, {
          width: pageWidth,
          align: 'center',
        });
      } else {
        y = drawTableHeader(y);
        doc.fontSize(7.5).font('Helvetica');

        adjustment.items.forEach((item, idx) => {
          // Altura dinamica: el nombre (o la ref.) puede ocupar 2 lineas.
          doc.fontSize(7.5).font('Helvetica');
          const nameH = doc.heightOfString(item.product.name, { width: colWidths.product });
          const refH = doc.heightOfString(item.product.supplierRef || '', { width: colWidths.ref });
          const rowH = Math.max(14, nameH, refH) + 2;

          if (y > pageHeight - 90 - rowH) {
            doc.addPage();
            y = 40;
            y = drawTableHeader(y);
            doc.fontSize(7.5).font('Helvetica');
          }

          const unitCost = effectiveCost(item);
          const importe = item.quantity * unitCost;

          doc.fillColor('#000000');
          doc.text(String(idx + 1), col.num, y, { width: colWidths.num, align: 'center' });
          doc.text(item.product.code, col.code, y, { width: colWidths.code });
          doc.text(item.product.supplierRef || '', col.ref, y, { width: colWidths.ref });
          doc.text(item.product.name, col.product, y, { width: colWidths.product });
          doc.text(String(item.quantity), col.qty, y, {
            width: colWidths.qty,
            align: 'right',
          });
          doc.text(`$${unitCost.toFixed(2)}`, col.cost, y, {
            width: colWidths.cost,
            align: 'right',
          });
          doc.text(`$${importe.toFixed(2)}`, col.importe, y, {
            width: colWidths.importe,
            align: 'right',
          });

          y += rowH;
        });

        // Totals row
        y += 4;
        doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#999999');
        y += 8;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000');
        doc.text('TOTAL', col.product, y, { width: colWidths.product });
        doc.text(String(totalUnidades), col.qty, y, {
          width: colWidths.qty,
          align: 'right',
        });
        doc.text(`$${totalImporte.toFixed(2)}`, col.importe, y, {
          width: colWidths.importe,
          align: 'right',
        });
        y += 20;
      }

      // Footer
      if (y > pageHeight - 40) {
        doc.addPage();
        y = 40;
      }
      doc.fontSize(7).font('Helvetica').fillColor('#888888');
      doc.text(`Generado el ${new Date().toLocaleString('es-VE')} — Trinity ERP`, 40, y, {
        width: pageWidth,
        align: 'center',
      });

      doc.end();
    });
  }

  /**
   * Reporte AGRUPADO POR DESTINATARIA (cliente/proveedor) que respeta los mismos filtros
   * del listado (status, warehouseId, type, search, from, to). Una fila por ajuste con
   * fecha, correlativo, tipo, estado, nº de ítems y monto (mismo costo efectivo que la CxC/CxP);
   * subtotal por destinataria y total general.
   */
  async generateGroupedReport(filters: {
    status?: string;
    warehouseId?: string;
    type?: string;
    search?: string;
    from?: string;
    to?: string;
  }): Promise<Buffer> {
    // WHERE: mismo criterio que InventoryAdjustmentsService.findAll
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.warehouseId) where.warehouseId = filters.warehouseId;
    if (filters.type) where.type = filters.type;
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = caracasDayStart(filters.from);
      if (filters.to) where.createdAt.lte = caracasDayEnd(filters.to);
    }
    const search = filters.search?.trim();
    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const adjustments = await this.prisma.inventoryAdjustment.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, rif: true } },
        supplier: { select: { id: true, name: true, rif: true } },
        items: {
          include: { product: { select: { costUsd: true, bregaApplies: true, categoryId: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const config = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
      select: { bregaGlobalPct: true, companyName: true },
    });
    const bregaGlobalPct = config?.bregaGlobalPct ?? 0;
    const company = (config as any)?.companyName || 'Trinity ERP';
    const catBregaMap = await buildCategoryBregaMap(this.prisma);

    // Monto del ajuste = suma(cantidad * costo efectivo). Mismo cálculo que el reporte por-ajuste.
    const amountOf = (adj: (typeof adjustments)[number]): number => {
      const useBrega = adj.costMode !== 'COST';
      let total = 0;
      for (const it of adj.items) {
        let unit = it.unitCostUsd;
        if (unit == null) {
          const bregaPct = useBrega
            ? resolveBregaPct({
                bregaApplies: it.product.bregaApplies,
                categoryBregaPct: it.product.categoryId ? (catBregaMap.get(it.product.categoryId) ?? 0) : 0,
                bregaGlobalPct,
              })
            : 0;
          unit = effCost(it.product.costUsd, bregaPct);
        }
        total += it.quantity * (unit || 0);
      }
      return Math.round(total * 100) / 100;
    };

    // Fecha en horario Caracas (UTC-4) → DD/MM/YYYY
    const fmtDate = (d: Date): string => {
      const c = new Date(new Date(d).getTime() - 4 * 3600 * 1000);
      const dd = String(c.getUTCDate()).padStart(2, '0');
      const mm = String(c.getUTCMonth() + 1).padStart(2, '0');
      return `${dd}/${mm}/${c.getUTCFullYear()}`;
    };
    const money = (n: number) =>
      n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Agrupar por destinataria (cliente o proveedor). Sin entidad → "Sin destinatario".
    type Row = { fecha: string; number: string; type: string; status: string; items: number; total: number };
    const groups = new Map<string, { name: string; rif: string; rows: Row[] }>();
    for (const a of adjustments) {
      const ent = a.customer || a.supplier;
      const key = ent ? ent.id : '__none__';
      if (!groups.has(key)) groups.set(key, { name: ent?.name || 'Sin destinatario', rif: (ent as any)?.rif || '', rows: [] });
      groups.get(key)!.rows.push({
        fecha: fmtDate(a.processedAt || a.createdAt),
        number: a.number || 's/n',
        type: a.type,
        status: a.status,
        items: a.items.length,
        total: amountOf(a),
      });
    }
    const ordered = [...groups.values()].sort((x, y) => x.name.localeCompare(y.name));

    // Resumen de filtros aplicados (para documentar el alcance del reporte)
    const statusLabelMap: Record<string, string> = { DRAFT: 'Borrador', PROCESSED: 'Procesado', CANCELLED: 'Cancelado' };
    const filterParts: string[] = [];
    if (filters.from || filters.to) filterParts.push(`Fechas: ${filters.from || '…'} a ${filters.to || '…'}`);
    if (filters.status) filterParts.push(`Estado: ${statusLabelMap[filters.status] || filters.status}`);
    if (filters.type) filterParts.push(`Tipo: ${filters.type === 'IN' ? 'Entrada' : 'Salida'}`);
    if (search) filterParts.push(`Búsqueda: "${search}"`);
    const filterLine = filterParts.length ? filterParts.join('   •   ') : 'Sin filtros (todos los ajustes)';

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
      const buffers: Buffer[] = [];
      doc.on('data', (c: Buffer) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const L = 40;
      const R = doc.page.width - 40; // 572
      const bottom = doc.page.height - 50;
      const cols = { fecha: L + 4, num: L + 78, tipo: L + 168, estado: L + 228, items: L + 320, monto: L + 380 };
      const wMonto = R - cols.monto - 4;

      const tableHeader = (y: number): number => {
        doc.rect(L, y - 2, R - L, 16).fill('#1f4e79');
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
        doc.text('FECHA', cols.fecha, y + 2, { width: 70 });
        doc.text('TRASLADO', cols.num, y + 2, { width: 85 });
        doc.text('TIPO', cols.tipo, y + 2, { width: 55 });
        doc.text('ESTADO', cols.estado, y + 2, { width: 90 });
        doc.text('ÍTEMS', cols.items, y + 2, { width: 50, align: 'right' });
        doc.text('MONTO USD', cols.monto, y + 2, { width: wMonto, align: 'right' });
        return y + 18;
      };

      // Encabezado del documento
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#111111').text(company, L, 40);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#333333').text('Reporte de Ajustes de Inventario — por destinataria', L, 60);
      doc.font('Helvetica').fontSize(8).fillColor('#666666').text(filterLine, L, 78, { width: R - L });
      doc.text(`Generado: ${fmtDate(new Date())}`, L, 90);
      doc.moveTo(L, 104).lineTo(R, 104).strokeColor('#cccccc').stroke();

      let y = 116;
      let grand = 0;
      let grandCount = 0;

      if (ordered.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor('#666666').text('No hay ajustes que coincidan con los filtros.', L, y + 20, { width: R - L, align: 'center' });
      }

      for (const g of ordered) {
        if (y > bottom - 70) { doc.addPage(); y = 50; }
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#1f4e79').text(g.name, L, y);
        if (g.rif) doc.font('Helvetica').fontSize(7.5).fillColor('#888888').text(`RIF ${g.rif}`, L, y + 14);
        y += g.rif ? 28 : 18;
        y = tableHeader(y);

        let sub = 0;
        doc.font('Helvetica').fontSize(8.5);
        g.rows.forEach((r, i) => {
          if (y > bottom) { doc.addPage(); y = 50; y = tableHeader(y); doc.font('Helvetica').fontSize(8.5); }
          if (i % 2 === 0) doc.rect(L, y - 2, R - L, 15).fill('#f2f6fb');
          doc.fillColor(r.status === 'PROCESSED' ? '#111111' : r.status === 'CANCELLED' ? '#b91c1c' : '#b45309');
          doc.text(r.fecha, cols.fecha, y, { width: 70 });
          doc.text(r.number, cols.num, y, { width: 85 });
          doc.text(r.type === 'IN' ? 'Entrada' : 'Salida', cols.tipo, y, { width: 55 });
          doc.text(r.status === 'PROCESSED' ? 'Procesado' : r.status === 'CANCELLED' ? 'Cancelado' : 'Borrador', cols.estado, y, { width: 90 });
          doc.text(String(r.items), cols.items, y, { width: 50, align: 'right' });
          doc.text(money(r.total), cols.monto, y, { width: wMonto, align: 'right' });
          y += 15;
          sub += r.total;
        });
        sub = Math.round(sub * 100) / 100;
        doc.moveTo(L, y).lineTo(R, y).strokeColor('#999999').stroke();
        y += 4;
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111111');
        doc.text(`Subtotal — ${g.rows.length} traslado(s)`, cols.estado, y, { width: 160 });
        doc.text(`USD ${money(sub)}`, cols.monto, y, { width: wMonto, align: 'right' });
        y += 26;
        grand += sub;
        grandCount += g.rows.length;
      }

      if (ordered.length > 0) {
        if (y > bottom - 30) { doc.addPage(); y = 50; }
        doc.rect(L, y, R - L, 24).fill('#1f4e79');
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#ffffff');
        doc.text(`TOTAL GENERAL — ${grandCount} traslado(s)`, L + 8, y + 7);
        doc.text(`USD ${money(Math.round(grand * 100) / 100)}`, cols.monto, y + 7, { width: wMonto, align: 'right' });
        y += 30;
        doc.font('Helvetica-Oblique').fontSize(7).fillColor('#999999')
          .text('Montos al costo efectivo del artículo en USD. Los ajustes en "Borrador"/"Cancelado" son informativos. Fechas en horario Caracas. — Trinity ERP', L, y, { width: R - L });
      }

      doc.end();
    });
  }
}
