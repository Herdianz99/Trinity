import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

const STATUS_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente', EN_PROCESO: 'En proceso', PROCESADO: 'Procesado', ANULADO: 'Anulado',
};

@Injectable()
export class DamageReportPdfService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reporte de daños en PDF: los artículos dañados + la SOLUCIÓN aplicada por el auditor
   * (reemplazo con su tabla salida→entrada, o merma como ajuste de salida).
   */
  async generateReport(id: string): Promise<Buffer> {
    const report = await this.prisma.damageReport.findUnique({
      where: { id },
      include: {
        warehouse: { select: { name: true } },
        createdBy: { select: { name: true } },
        processedBy: { select: { name: true } },
        items: { orderBy: { id: 'asc' } },
        replacement: {
          include: {
            items: {
              include: {
                outProduct: { select: { code: true, name: true } },
                inProduct: { select: { code: true, name: true } },
              },
              orderBy: { id: 'asc' },
            },
          },
        },
      },
    });
    if (!report) throw new NotFoundException('Reporte de daños no encontrado');

    const config = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
      select: { companyName: true },
    });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
      const buffers: Buffer[] = [];
      doc.on('data', (c: Buffer) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const left = 40;
      const pageWidth = doc.page.width - 80; // 532
      const pageHeight = doc.page.height;
      const right = left + pageWidth;

      const hr = (y: number, color = '#999999') => { doc.moveTo(left, y).lineTo(right, y).stroke(color); };
      const ensureSpace = (y: number, need: number): number => {
        if (y + need > pageHeight - 60) { doc.addPage(); return 40; }
        return y;
      };

      // ── Encabezado ──
      let y = 40;
      if (config?.companyName) {
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000').text(config.companyName, left, y, { width: pageWidth, align: 'center' });
        y += 16;
      }
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000');
      doc.text('REPORTE DE DAÑOS DE INVENTARIO', left, y, { width: pageWidth, align: 'center' });
      y += 22;

      doc.fontSize(9).font('Helvetica').fillColor('#333333');
      doc.text(`N°: ${report.number}`, left, y);
      doc.text(`Fecha: ${new Date(report.date).toLocaleDateString('es-VE', { timeZone: 'UTC' })}`, 300, y);
      y += 14;
      doc.text(`Zona: ${report.zone}`, left, y);
      doc.text(`Almacen: ${report.warehouse?.name || '—'}`, 300, y);
      y += 14;
      doc.text(`Estado: ${STATUS_LABEL[report.status] || report.status}`, left, y);
      doc.text(`Reporto: ${report.createdBy?.name || '—'}`, 300, y);
      y += 14;
      if (report.notes) {
        doc.text(`Nota: ${report.notes}`, left, y, { width: pageWidth });
        y += doc.heightOfString(`Nota: ${report.notes}`, { width: pageWidth }) + 2;
      }
      y += 4;
      hr(y); y += 10;

      // ── Artículos dañados ──
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text('ARTICULOS DAÑADOS', left, y);
      y += 16;
      const col = { code: left, name: left + 90, qty: left + 300, note: left + 350 };
      const colW = { code: 85, name: 205, qty: 45, note: 182 };
      const drawItemsHeader = (yy: number): number => {
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#555555');
        doc.text('Codigo', col.code, yy, { width: colW.code });
        doc.text('Articulo', col.name, yy, { width: colW.name });
        doc.text('Cant.', col.qty, yy, { width: colW.qty, align: 'right' });
        doc.text('Nota', col.note, yy, { width: colW.note });
        yy += 12; hr(yy, '#cccccc'); return yy + 4;
      };
      y = drawItemsHeader(y);

      doc.fontSize(8).font('Helvetica').fillColor('#000000');
      report.items.forEach((it) => {
        const hName = doc.heightOfString(it.productName, { width: colW.name });
        const hNote = doc.heightOfString(it.note || '', { width: colW.note });
        const rowH = Math.max(hName, hNote, 11) + 4;
        y = ensureSpace(y, rowH);
        doc.fillColor('#000000');
        doc.text(it.productCode || '—', col.code, y, { width: colW.code });
        doc.text(it.productName, col.name, y, { width: colW.name });
        doc.text(String(it.quantity), col.qty, y, { width: colW.qty, align: 'right' });
        doc.fillColor('#555555').text(it.note || '', col.note, y, { width: colW.note });
        y += rowH;
      });
      y += 8; hr(y); y += 12;

      // ── Solución ──
      y = ensureSpace(y, 40);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text('SOLUCION', left, y);
      y += 16;
      doc.fontSize(9).font('Helvetica').fillColor('#333333');

      if (report.status !== 'PROCESADO') {
        doc.text(
          report.status === 'EN_PROCESO'
            ? `Reemplazo en curso${report.replacement ? ` (${report.replacement.number}, en borrador)` : ''} — aun no finalizado.`
            : report.status === 'ANULADO' ? 'Reporte anulado.' : 'Pendiente de resolver.',
          left, y, { width: pageWidth },
        );
        y += 18;
      } else if (report.resolution === 'MERMA') {
        doc.font('Helvetica-Bold').fillColor('#000000').text('MERMA (ajuste de salida de inventario)', left, y);
        y += 14;
        doc.font('Helvetica').fillColor('#333333').text(
          `Se descontó del inventario la cantidad dañada de cada artículo (movimiento de ajuste de salida).` +
          (report.processedBy ? ` Procesado por ${report.processedBy.name}.` : ''),
          left, y, { width: pageWidth },
        );
        y += 24;
      } else if (report.resolution === 'REEMPLAZO' && report.replacement) {
        doc.font('Helvetica-Bold').fillColor('#000000').text(`REEMPLAZO ${report.replacement.number}`, left, y);
        y += 16;
        // Tabla salida → entrada
        const r = { oc: left, on: left + 70, oq: left + 200, ic: left + 250, in: left + 320, iq: right - 40 };
        const rw = { oc: 66, on: 125, oq: 40, ic: 66, in: 125, iq: 40 };
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#555555');
        doc.text('SALIDA', r.oc, y); doc.text('ENTRADA', r.ic, y); y += 11;
        doc.text('Codigo', r.oc, y, { width: rw.oc });
        doc.text('Articulo', r.on, y, { width: rw.on });
        doc.text('Cant.', r.oq, y, { width: rw.oq, align: 'right' });
        doc.text('Codigo', r.ic, y, { width: rw.ic });
        doc.text('Articulo', r.in, y, { width: rw.in });
        doc.text('Cant.', r.iq, y, { width: rw.iq, align: 'right' });
        y += 11; hr(y, '#cccccc'); y += 4;
        doc.fontSize(7.5).font('Helvetica');
        report.replacement.items.forEach((it) => {
          const h = Math.max(
            doc.heightOfString(it.outProduct.name, { width: rw.on }),
            doc.heightOfString(it.inProduct.name, { width: rw.in }), 11,
          ) + 4;
          y = ensureSpace(y, h);
          doc.fillColor('#000000');
          doc.text(it.outProduct.code, r.oc, y, { width: rw.oc });
          doc.text(it.outProduct.name, r.on, y, { width: rw.on });
          doc.text(String(it.outQuantity), r.oq, y, { width: rw.oq, align: 'right' });
          doc.text(it.inProduct.code, r.ic, y, { width: rw.ic });
          doc.text(it.inProduct.name, r.in, y, { width: rw.in });
          doc.text(String(it.inQuantity), r.iq, y, { width: rw.iq, align: 'right' });
          y += h;
        });
        if (report.processedBy) { y += 4; doc.fontSize(8).fillColor('#333333').text(`Procesado por ${report.processedBy.name}.`, left, y); y += 14; }
      }

      // ── Pie ──
      y = ensureSpace(y, 40);
      y += 10;
      doc.fontSize(9).font('Helvetica').fillColor('#000000');
      doc.text('Responsable: ___________________________', left, y);
      doc.text('Firma: ___________________________', 320, y);
      y += 24;
      doc.fontSize(7).font('Helvetica').fillColor('#888888');
      doc.text(`Generado el ${new Date().toLocaleString('es-VE')} — Trinity ERP`, left, y, { width: pageWidth, align: 'center' });

      doc.end();
    });
  }
}
