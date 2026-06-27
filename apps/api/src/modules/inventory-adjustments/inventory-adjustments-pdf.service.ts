import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

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
              select: { code: true, name: true, supplierRef: true, costUsd: true },
            },
          },
          orderBy: { product: { name: 'asc' } },
        },
      },
    });

    if (!adjustment) throw new NotFoundException('Ajuste no encontrado');

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
        totalImporte += item.quantity * item.product.costUsd;
        totalUnidades += item.quantity;
      }

      const drawHeader = (y: number): number => {
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000');
        doc.text('REPORTE DE AJUSTE DE INVENTARIO', 40, y, {
          width: pageWidth,
          align: 'center',
        });
        y += 20;

        doc.fontSize(9).font('Helvetica').fillColor('#333333');
        doc.text(`Almacen: ${adjustment.warehouse.name}`, 40, y);
        doc.text(
          `Fecha: ${new Date(adjustment.createdAt).toLocaleDateString('es-VE')}`,
          350,
          y,
        );
        y += 14;
        doc.text(`Tipo: ${typeLabel}`, 40, y);
        doc.text(`Estado: ${statusLabel}`, 350, y);
        y += 14;
        if (adjustment.supplier?.name || adjustment.customer?.name) {
          doc.text(
            `${adjustment.supplier ? 'Proveedor' : 'Cliente'}: ${
              adjustment.supplier?.name || adjustment.customer?.name
            }`,
            40,
            y,
          );
          y += 14;
        }
        if (adjustment.description) {
          doc.text(`Descripcion: ${adjustment.description}`, 40, y, {
            width: pageWidth,
          });
          y += 14;
        }
        doc.text(`Total de productos: ${adjustment.items.length}`, 40, y);
        y += 18;
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
          if (y > pageHeight - 90) {
            doc.addPage();
            y = 40;
            y = drawTableHeader(y);
            doc.fontSize(7.5).font('Helvetica');
          }

          const importe = item.quantity * item.product.costUsd;

          doc.fillColor('#000000');
          doc.text(String(idx + 1), col.num, y, { width: colWidths.num, align: 'center' });
          doc.text(item.product.code, col.code, y, { width: colWidths.code });
          doc.text(item.product.supplierRef || '', col.ref, y, { width: colWidths.ref });
          doc.text(item.product.name, col.product, y, { width: colWidths.product });
          doc.text(String(item.quantity), col.qty, y, {
            width: colWidths.qty,
            align: 'right',
          });
          doc.text(`$${item.product.costUsd.toFixed(2)}`, col.cost, y, {
            width: colWidths.cost,
            align: 'right',
          });
          doc.text(`$${importe.toFixed(2)}`, col.importe, y, {
            width: colWidths.importe,
            align: 'right',
          });

          y += 14;
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
}
