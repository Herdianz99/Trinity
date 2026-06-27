import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

@Injectable()
export class InventoryReplacementsPdfService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reporte de reemplazo de inventario — 2 columnas (SALIO | ENTRO).
   * SALIO: codigo, nombre, cantidad. ENTRO: codigo, nombre, cantidad y costo asignado.
   * Administracion valida con las CANTIDADES (no hay robo / error de carga).
   * El costo del que entra se deriva del valor del que sale (valor sale / cantidad entra).
   */
  async generateReport(id: string): Promise<Buffer> {
    const repl = await this.prisma.inventoryReplacement.findUnique({
      where: { id },
      include: {
        warehouse: true,
        items: {
          include: {
            outProduct: { select: { code: true, name: true, costUsd: true } },
            inProduct: { select: { code: true, name: true, costUsd: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!repl) throw new NotFoundException('Reemplazo no encontrado');

    const statusLabel =
      repl.status === 'DRAFT'
        ? 'Borrador'
        : repl.status === 'PROCESSED'
          ? 'Procesado'
          : 'Cancelado';

    // costo asignado al que entra: congelado si ya se proceso; si no, preview (valor sale / cant entra)
    const assignedCostOf = (it: (typeof repl.items)[number]): number => {
      if (it.inCostUsd > 0) return it.inCostUsd;
      if (it.inQuantity <= 0) return 0;
      return (it.outQuantity * it.outProduct.costUsd) / it.inQuantity;
    };

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
      const buffers: Buffer[] = [];
      doc.on('data', (c: Buffer) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 80; // 532
      const pageHeight = doc.page.height;
      const midX = 258;

      // Columnas — SALIO (izquierda) | ENTRO (derecha, con costo asignado)
      const out = { code: 40, name: 86, qty: 210 };
      const outW = { code: 44, name: 120, qty: 38 };
      const inn = { code: 272, name: 318, qty: 440, cost: 484 };
      const innW = { code: 44, name: 118, qty: 38, cost: 84 };

      const drawHeader = (y: number): number => {
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000');
        doc.text('REPORTE DE REEMPLAZO DE INVENTARIO', 40, y, {
          width: pageWidth,
          align: 'center',
        });
        y += 20;
        doc.fontSize(9).font('Helvetica').fillColor('#333333');
        doc.text(`N°: ${repl.number}`, 40, y);
        doc.text(
          `Fecha: ${new Date(repl.date).toLocaleDateString('es-VE', { timeZone: 'UTC' })}`,
          350,
          y,
        );
        y += 14;
        doc.text(`Almacen: ${repl.warehouse.name}`, 40, y);
        doc.text(`Estado: ${statusLabel}`, 350, y);
        y += 14;
        if (repl.notes) {
          doc.text(`Observacion: ${repl.notes}`, 40, y, { width: pageWidth });
          y += 14;
        }
        doc.text(`Total de lineas: ${repl.items.length}`, 40, y);
        y += 16;
        doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#999999');
        y += 8;
        return y;
      };

      const drawTableHeader = (y: number): number => {
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#000000');
        doc.text('SALIDA', out.code, y);
        doc.text('ENTRADA', inn.code, y);
        y += 13;
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#555555');
        doc.text('Codigo', out.code, y, { width: outW.code });
        doc.text('Articulo', out.name, y, { width: outW.name });
        doc.text('Cant.', out.qty, y, { width: outW.qty, align: 'right' });
        doc.text('Codigo', inn.code, y, { width: innW.code });
        doc.text('Articulo', inn.name, y, { width: innW.name });
        doc.text('Cant.', inn.qty, y, { width: innW.qty, align: 'right' });
        doc.text('Costo asign.', inn.cost, y, { width: innW.cost, align: 'right' });
        y += 12;
        doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#999999');
        y += 4;
        return y;
      };

      let y = drawHeader(40);

      if (repl.items.length === 0) {
        y += 20;
        doc.fontSize(10).font('Helvetica').fillColor('#333333');
        doc.text('Este reemplazo no tiene lineas.', 40, y, {
          width: pageWidth,
          align: 'center',
        });
      } else {
        y = drawTableHeader(y);

        repl.items.forEach((it) => {
          doc.fontSize(7.5).font('Helvetica');
          const hOut = doc.heightOfString(it.outProduct.name, { width: outW.name });
          const hIn = doc.heightOfString(it.inProduct.name, { width: innW.name });
          const rowH = Math.max(hOut, hIn, 12) + 4;

          if (y + rowH > pageHeight - 70) {
            doc.addPage();
            y = 40;
            y = drawTableHeader(y);
            doc.fontSize(7.5).font('Helvetica');
          }

          const cost = assignedCostOf(it);

          doc.fillColor('#000000');
          // SALIO
          doc.text(it.outProduct.code, out.code, y, { width: outW.code });
          doc.text(it.outProduct.name, out.name, y, { width: outW.name });
          doc.text(String(it.outQuantity), out.qty, y, { width: outW.qty, align: 'right' });
          // flecha
          doc.fillColor('#888888').text('→', midX, y);
          doc.fillColor('#000000');
          // ENTRO
          doc.text(it.inProduct.code, inn.code, y, { width: innW.code });
          doc.text(it.inProduct.name, inn.name, y, { width: innW.name });
          doc.text(String(it.inQuantity), inn.qty, y, { width: innW.qty, align: 'right' });
          doc.text(`$${cost.toFixed(4)}`, inn.cost, y, { width: innW.cost, align: 'right' });

          y += rowH;
        });

        y += 6;
        doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
        y += 10;
      }

      // Firma / responsable (declaracion a administracion)
      if (y > pageHeight - 70) {
        doc.addPage();
        y = 40;
      }
      doc.fontSize(9).font('Helvetica').fillColor('#000000');
      doc.text('Responsable: ___________________________', 40, y);
      doc.text('Firma: ___________________________', 320, y);
      y += 24;
      doc.fontSize(7).font('Helvetica').fillColor('#888888');
      doc.text(`Generado el ${new Date().toLocaleString('es-VE')} — Trinity ERP`, 40, y, {
        width: pageWidth,
        align: 'center',
      });

      doc.end();
    });
  }
}
