import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

@Injectable()
export class InventoryCountsPdfService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Hoja de conteo fisico — para imprimir ANTES de ir a contar.
   * Columnas en blanco para escribir a mano la cantidad contada (2 conteos).
   */
  async generateCountSheet(id: string): Promise<Buffer> {
    const count = await this.prisma.inventoryCount.findUnique({
      where: { id },
      include: {
        warehouse: true,
        items: {
          include: {
            product: { select: { code: true, name: true, supplierRef: true } },
          },
          orderBy: { product: { name: 'asc' } },
        },
      },
    });

    if (!count) throw new NotFoundException('Conteo no encontrado');

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 40 });
      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 80; // margins
      const pageHeight = doc.page.height;

      const drawHeader = (y: number): number => {
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000');
        doc.text('HOJA DE CONTEO FISICO', 40, y, { width: pageWidth, align: 'center' });
        y += 22;

        doc.fontSize(9).font('Helvetica').fillColor('#333333');
        doc.text(`Almacen: ${count.warehouse.name}`, 40, y);
        doc.text(`Fecha: ${new Date(count.createdAt).toLocaleDateString('es-VE')}`, 350, y);
        y += 14;
        if (count.notes) {
          doc.text(`Notas: ${count.notes}`, 40, y);
          y += 14;
        }
        doc.text(`Total de productos: ${count.items.length}`, 40, y);
        y += 18;

        // Separator
        doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#999999');
        y += 8;
        return y;
      };

      // Column positions (landscape LETTER = 792 x 612)
      const col = {
        num: 40,
        code: 70,
        ref: 170,
        product: 280,
        count1: 560,
        count2: 660,
      };
      const colWidths = {
        num: 25,
        code: 95,
        ref: 105,
        product: 275,
        count1: 90,
        count2: 90,
      };

      const drawTableHeader = (y: number): number => {
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000');
        doc.text('#', col.num, y, { width: colWidths.num, align: 'center' });
        doc.text('Codigo', col.code, y, { width: colWidths.code });
        doc.text('Ref. Proveedor', col.ref, y, { width: colWidths.ref });
        doc.text('Producto', col.product, y, { width: colWidths.product });
        doc.text('Conteo 1', col.count1, y, { width: colWidths.count1, align: 'center' });
        doc.text('Conteo 2', col.count2, y, { width: colWidths.count2, align: 'center' });
        y += 14;
        doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#999999');
        y += 4;
        return y;
      };

      let y = drawHeader(40);
      y = drawTableHeader(y);

      doc.fontSize(8).font('Helvetica').fillColor('#000000');

      count.items.forEach((item, idx) => {
        // Check for page break (leave room for footer)
        if (y > pageHeight - 80) {
          doc.addPage();
          y = drawHeader(40);
          y = drawTableHeader(y);
          doc.fontSize(8).font('Helvetica').fillColor('#000000');
        }

        const rowY = y;
        doc.text(String(idx + 1), col.num, rowY, { width: colWidths.num, align: 'center' });
        doc.text(item.product.code, col.code, rowY, { width: colWidths.code });
        doc.text(item.product.supplierRef || '', col.ref, rowY, { width: colWidths.ref });
        doc.text(item.product.name, col.product, rowY, { width: colWidths.product });

        // Empty cells with underline for handwriting
        const lineY = rowY + 10;
        doc.moveTo(col.count1 + 5, lineY).lineTo(col.count1 + colWidths.count1 - 5, lineY).stroke('#cccccc');
        doc.moveTo(col.count2 + 5, lineY).lineTo(col.count2 + colWidths.count2 - 5, lineY).stroke('#cccccc');

        y += 16;
      });

      // Footer: signature line
      y += 20;
      if (y > pageHeight - 60) {
        doc.addPage();
        y = 40;
      }
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 15;
      doc.fontSize(9).font('Helvetica').fillColor('#000000');
      doc.text('Responsable: ___________________________', 40, y);
      doc.text('Firma: ___________________________', 400, y);
      y += 20;
      doc.fontSize(7).fillColor('#888888');
      doc.text(`Generado el ${new Date().toLocaleString('es-VE')} — Trinity ERP`, 40, y, {
        width: pageWidth,
        align: 'center',
      });

      doc.end();
    });
  }

  /**
   * Reporte de diferencias — para imprimir DESPUES de aprobar.
   * Solo productos con diferencia != 0, incluye costos.
   */
  async generateDifferencesReport(id: string): Promise<Buffer> {
    const count = await this.prisma.inventoryCount.findUnique({
      where: { id },
      include: {
        warehouse: true,
        items: {
          include: {
            product: { select: { code: true, name: true, costUsd: true } },
          },
          orderBy: { product: { name: 'asc' } },
        },
      },
    });

    if (!count) throw new NotFoundException('Conteo no encontrado');

    // Filter only items with difference != 0 and != null
    const diffItems = count.items.filter(
      (item) => item.difference !== null && item.difference !== 0,
    );

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 80;
      const pageHeight = doc.page.height;

      // Aggregation
      let totalSobrante = 0;
      let totalFaltante = 0;
      let costoFaltantes = 0;

      for (const item of diffItems) {
        const diff = item.difference!;
        if (diff > 0) totalSobrante += diff;
        else {
          totalFaltante += Math.abs(diff);
          costoFaltantes += Math.abs(diff) * item.product.costUsd;
        }
      }

      const drawHeader = (y: number): number => {
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000');
        doc.text('REPORTE DE DIFERENCIAS - CONTEO FISICO', 40, y, {
          width: pageWidth,
          align: 'center',
        });
        y += 20;

        doc.fontSize(9).font('Helvetica').fillColor('#333333');
        doc.text(`Almacen: ${count.warehouse.name}`, 40, y);
        doc.text(`Fecha: ${new Date(count.createdAt).toLocaleDateString('es-VE')}`, 350, y);
        y += 14;
        if (count.notes) {
          doc.text(`Notas: ${count.notes}`, 40, y);
          y += 14;
        }
        doc.text(
          `Productos con diferencia: ${diffItems.length} de ${count.items.length} total`,
          40,
          y,
        );
        y += 18;
        doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#999999');
        y += 8;
        return y;
      };

      // Column positions (portrait LETTER = 612 x 792)
      const col = {
        num: 40,
        code: 60,
        product: 130,
        system: 300,
        counted: 350,
        diff: 400,
        costUnit: 450,
        costTotal: 500,
      };
      const colWidths = {
        num: 18,
        code: 65,
        product: 168,
        system: 45,
        counted: 45,
        diff: 45,
        costUnit: 48,
        costTotal: 60,
      };

      const drawTableHeader = (y: number): number => {
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#000000');
        doc.text('#', col.num, y, { width: colWidths.num, align: 'center' });
        doc.text('Codigo', col.code, y, { width: colWidths.code });
        doc.text('Producto', col.product, y, { width: colWidths.product });
        doc.text('Sistema', col.system, y, { width: colWidths.system, align: 'right' });
        doc.text('Contado', col.counted, y, { width: colWidths.counted, align: 'right' });
        doc.text('Difer.', col.diff, y, { width: colWidths.diff, align: 'right' });
        doc.text('Costo USD', col.costUnit, y, { width: colWidths.costUnit, align: 'right' });
        doc.text('Costo Dif.', col.costTotal, y, { width: colWidths.costTotal, align: 'right' });
        y += 14;
        doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#999999');
        y += 4;
        return y;
      };

      let y = drawHeader(40);

      if (diffItems.length === 0) {
        y += 20;
        doc.fontSize(10).font('Helvetica').fillColor('#333333');
        doc.text('No se encontraron diferencias en este conteo.', 40, y, {
          width: pageWidth,
          align: 'center',
        });
      } else {
        y = drawTableHeader(y);
        doc.fontSize(7).font('Helvetica');

        diffItems.forEach((item, idx) => {
          if (y > pageHeight - 100) {
            doc.addPage();
            y = 40;
            y = drawTableHeader(y);
            doc.fontSize(7).font('Helvetica');
          }

          const diff = item.difference!;
          const costTotalDiff = Math.abs(diff) * item.product.costUsd;

          doc.fillColor('#000000');
          doc.text(String(idx + 1), col.num, y, { width: colWidths.num, align: 'center' });
          doc.text(item.product.code, col.code, y, { width: colWidths.code });
          doc.text(item.product.name, col.product, y, { width: colWidths.product });
          doc.text(String(item.systemQuantity), col.system, y, {
            width: colWidths.system,
            align: 'right',
          });
          doc.text(String(item.countedQuantity ?? 0), col.counted, y, {
            width: colWidths.counted,
            align: 'right',
          });

          // Difference with color
          doc.fillColor(diff > 0 ? '#0066cc' : '#cc0000');
          doc.text(`${diff > 0 ? '+' : ''}${diff}`, col.diff, y, {
            width: colWidths.diff,
            align: 'right',
          });

          doc.fillColor('#000000');
          doc.text(`$${item.product.costUsd.toFixed(2)}`, col.costUnit, y, {
            width: colWidths.costUnit,
            align: 'right',
          });
          doc.text(`$${costTotalDiff.toFixed(2)}`, col.costTotal, y, {
            width: colWidths.costTotal,
            align: 'right',
          });

          y += 14;
        });

        // Summary
        y += 8;
        doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#999999');
        y += 10;

        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000');
        doc.text('RESUMEN', 40, y);
        y += 16;

        doc.fontSize(9).font('Helvetica');
        doc.fillColor('#0066cc');
        doc.text(`Sobrante total: +${totalSobrante} unidades`, 40, y);
        y += 14;

        doc.fillColor('#cc0000');
        doc.text(`Faltante total: -${totalFaltante} unidades`, 40, y);
        y += 14;

        doc.fillColor('#cc0000');
        doc.font('Helvetica-Bold');
        doc.text(`Costo total de faltantes: $${costoFaltantes.toFixed(2)}`, 40, y);
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
}
