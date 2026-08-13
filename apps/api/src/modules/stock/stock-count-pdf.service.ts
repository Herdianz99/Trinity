import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

@Injectable()
export class StockCountPdfService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Hoja de INVENTARIO FÍSICO de un almacén: lista los productos del almacén agrupados por
   * categoría, con la existencia del sistema y una columna en blanco para anotar el conteo físico.
   * Por defecto solo incluye los que tienen existencia (quantity != 0); con includeZero=true
   * se listan también los que están en 0.
   */
  async generateCountSheet(warehouseId: string, includeZero = false): Promise<Buffer> {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundException('Almacén no encontrado');

    const config = await this.prisma.companyConfig.findUnique({ where: { id: 'singleton' } });

    const rows = await this.prisma.stock.findMany({
      where: { warehouseId },
      select: {
        quantity: true,
        product: {
          select: { code: true, name: true, saleUnit: true, isActive: true, category: { select: { name: true } } },
        },
      },
    });

    // Solo productos activos; por defecto solo con existencia (quantity != 0). Ordenados por
    // categoría y luego por nombre (para recorrer el almacén).
    const items = rows
      .filter((r) => r.product.isActive && (includeZero || r.quantity !== 0))
      .map((r) => ({
        code: r.product.code,
        name: r.product.name,
        unit: r.product.saleUnit || '',
        category: r.product.category?.name || 'Sin categoría',
        quantity: r.quantity,
      }))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
      const buffers: Buffer[] = [];
      doc.on('data', (c: Buffer) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Columnas (LETTER: contenido 40..572)
      const COL = { code: 40, name: 105, unit: 360, sys: 400, count: 460 };
      const W = { code: 60, name: 250, unit: 38, sys: 58, count: 112 };
      const RIGHT = 572;
      const BOTTOM = 740;

      const drawPageHeader = (): number => {
        let y = 40;
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000');
        doc.text((config?.companyName || 'Trinity').toUpperCase(), 40, y, { width: RIGHT - 40, align: 'center' });
        y += 17;
        doc.fontSize(12).font('Helvetica-Bold');
        doc.text('HOJA DE INVENTARIO FÍSICO', 40, y, { width: RIGHT - 40, align: 'center' });
        y += 18;
        doc.fontSize(9).font('Helvetica').fillColor('#333333');
        const scope = includeZero ? 'Todos los productos' : 'Solo con existencia';
        doc.text(`Almacén: ${warehouse.name}  ·  ${scope}`, 40, y);
        doc.text(`Fecha: ____ / ____ / ______`, 360, y, { width: RIGHT - 360, align: 'right' });
        y += 13;
        doc.text('Contó: ______________________________', 40, y);
        doc.text('Revisó: ______________________', 360, y, { width: RIGHT - 360, align: 'right' });
        y += 16;
        return y;
      };

      const drawTableHeader = (y: number): number => {
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000');
        doc.text('Código', COL.code, y, { width: W.code });
        doc.text('Producto', COL.name, y, { width: W.name });
        doc.text('Und', COL.unit, y, { width: W.unit });
        doc.text('Sistema', COL.sys, y, { width: W.sys, align: 'right' });
        doc.text('Conteo físico', COL.count, y, { width: W.count, align: 'center' });
        y += 11;
        doc.moveTo(40, y).lineTo(RIGHT, y).strokeColor('#999999').lineWidth(0.5).stroke();
        return y + 4;
      };

      let y = drawPageHeader();
      y = drawTableHeader(y);

      let currentCat: string | null = null;
      let totalUnidades = 0;
      let totalRenglones = 0;

      const ensureSpace = (needed: number) => {
        if (y + needed > BOTTOM) {
          doc.addPage();
          y = drawPageHeader();
          y = drawTableHeader(y);
          currentCat = null; // re-imprimir subtítulo de categoría en la página nueva
        }
      };

      for (const it of items) {
        // Subtítulo de categoría
        if (it.category !== currentCat) {
          ensureSpace(20);
          currentCat = it.category;
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000');
          doc.text(currentCat, COL.code, y, { width: RIGHT - COL.code });
          y += 14;
        }

        ensureSpace(16);
        doc.fontSize(8).font('Helvetica').fillColor('#000000');
        doc.text(it.code, COL.code, y, { width: W.code });
        doc.text(it.name, COL.name, y, { width: W.name, ellipsis: true, height: 10 });
        doc.text(String(it.unit), COL.unit, y, { width: W.unit });
        doc.text(fmtQty(it.quantity), COL.sys, y, { width: W.sys, align: 'right' });
        // Caja para escribir el conteo físico
        doc.rect(COL.count + 6, y - 1, W.count - 12, 11).strokeColor('#cccccc').lineWidth(0.5).stroke();
        doc.fillColor('#000000');
        y += 14;

        totalUnidades += it.quantity;
        totalRenglones += 1;
      }

      // Totales
      ensureSpace(24);
      y += 4;
      doc.moveTo(40, y).lineTo(RIGHT, y).strokeColor('#999999').lineWidth(0.5).stroke();
      y += 6;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000');
      doc.text(`Renglones: ${totalRenglones}`, COL.code, y, { width: 200 });
      doc.text(`Total unidades (sistema): ${fmtQty(totalUnidades)}`, COL.name, y, { width: RIGHT - COL.name, align: 'right' });

      // Numeración de páginas
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        doc.fontSize(7).font('Helvetica').fillColor('#666666');
        doc.text(`Página ${i + 1} de ${range.count}`, 40, 755, { width: RIGHT - 40, align: 'right' });
      }

      doc.end();
    });
  }
}
