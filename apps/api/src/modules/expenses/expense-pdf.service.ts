import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

@Injectable()
export class ExpensePdfService {
  constructor(private readonly prisma: PrismaService) {}

  private fmt(n: number): string {
    return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Comprobante de UN gasto individual (para archivar).
  async generateOne(id: string): Promise<Buffer> {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        category: { select: { name: true } },
        createdBy: { select: { name: true } },
        method: { select: { name: true } },
        supplier: { select: { name: true, rif: true } },
        cashSession: { select: { cashRegister: { select: { name: true, code: true } } } },
        payable: { select: { dueDate: true, status: true, paidAmountUsd: true, netPayableUsd: true } },
      },
    });
    if (!expense) throw new NotFoundException('Gasto no encontrado');

    const config = await this.prisma.companyConfig.findFirst();

    return new Promise((resolve, reject) => {
      // Media carta VERTICAL (retrato): 396x612 pt = 5.5" x 8.5" ("media carta"),
      // la mitad de una LETTER pero manteniendo orientacion vertical (NO apaisada).
      // Dos comprobantes entran por hoja carta con impresion 2-en-1 para ahorrar papel.
      const doc = new PDFDocument({ size: [396, 612], margins: { top: 30, left: 30, right: 30, bottom: 6 } });
      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const left = 30;
      const pageWidth = doc.page.width - 60; // 336
      const rightEdge = left + pageWidth;
      let y = 30;

      // ========== TITULO ==========
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000')
        .text('COMPROBANTE DE GASTO', left, y, { width: pageWidth, align: 'center' });
      y += 22;

      // ========== HEADER (empresa izquierda / datos derecha) ==========
      const headerTop = y;
      const compW = 180;
      let ly = headerTop;
      if (config?.logo) {
        try {
          const base64Data = config.logo.replace(/^data:image\/\w+;base64,/, '');
          doc.image(Buffer.from(base64Data, 'base64'), left, ly, { height: 38 });
          ly += 42;
        } catch {
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000').text(config?.companyName || 'Trinity ERP', left, ly, { width: compW });
          ly += doc.heightOfString(config?.companyName || 'Trinity ERP', { width: compW });
        }
      } else {
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000').text(config?.companyName || 'Trinity ERP', left, ly, { width: compW });
        ly += doc.heightOfString(config?.companyName || 'Trinity ERP', { width: compW }) + 2;
        doc.fontSize(8).font('Helvetica').fillColor('#333333');
        if (config?.rif) { doc.text(`RIF: ${config.rif}`, left, ly, { width: compW }); ly += 11; }
        if (config?.address) { doc.text(config.address, left, ly, { width: compW }); ly += doc.heightOfString(config.address, { width: compW }); }
        if (config?.phone) { doc.text(`Tel: ${config.phone}`, left, ly, { width: compW }); ly += 11; }
      }

      // Datos del comprobante (derecha, alineados a la derecha)
      const metaX = left + compW + 10;
      const metaW = rightEdge - metaX;
      let ry = headerTop;
      doc.fontSize(8).font('Helvetica').fillColor('#555555');
      doc.text(`Fecha del gasto: ${new Date(expense.date).toLocaleDateString('es-VE', { timeZone: 'UTC' })}`, metaX, ry, { width: metaW, align: 'right' }); ry += 11;
      doc.text(`Generado: ${new Date().toLocaleString('es-VE')}`, metaX, ry, { width: metaW, align: 'right' }); ry += 11;
      doc.text(`ID: ${expense.id}`, metaX, ry, { width: metaW, align: 'right' }); ry += doc.heightOfString(`ID: ${expense.id}`, { width: metaW });

      y = Math.max(ly, ry) + 10;
      doc.moveTo(left, y).lineTo(rightEdge, y).stroke('#cccccc');
      y += 12;

      // ========== DATOS DEL GASTO ==========
      const labelW = 105;
      const valueX = left + labelW;
      const valueW = pageWidth - labelW;

      const row = (label: string, value: string) => {
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#555555').text(label, left, y, { width: labelW - 8 });
        doc.fontSize(8.5).font('Helvetica').fillColor('#000000');
        const h = doc.heightOfString(value || '-', { width: valueW });
        doc.text(value || '-', valueX, y, { width: valueW });
        y += Math.max(13, h + 3);
      };

      row('Categoria', expense.category.name);
      row('Descripcion', expense.description);
      row('Referencia', expense.reference || '-');

      if (expense.isCredit) {
        row('Condicion', 'A CREDITO (cuenta por pagar)');
        if (expense.supplier?.name) {
          row('Proveedor', `${expense.supplier.name}${expense.supplier.rif ? ` (${expense.supplier.rif})` : ''}`);
        }
        if (expense.payable?.dueDate) {
          const paid = (expense.payable.paidAmountUsd || 0) >= (expense.payable.netPayableUsd || 0) - 0.01;
          const estado = paid ? 'PAGADO' : (expense.payable.status === 'PARTIAL' ? 'ABONADO' : 'PENDIENTE');
          row('Vencimiento', `${new Date(expense.payable.dueDate).toLocaleDateString('es-VE', { timeZone: 'UTC' })}  —  ${estado}`);
        }
      } else {
        row('Condicion', 'Contado');
        const cajaLabel = expense.cashSession?.cashRegister
          ? `${expense.cashSession.cashRegister.name || expense.cashSession.cashRegister.code || 'Caja'}`
          : null;
        if (cajaLabel) row('Pagado desde caja', cajaLabel);
        if (expense.method?.name) row('Metodo de pago', expense.method.name);
      }
      row('Registrado por', expense.createdBy.name);

      y += 5;
      doc.moveTo(left, y).lineTo(rightEdge, y).stroke('#eeeeee');
      y += 10;

      // ========== MONTOS ==========
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#555555').text('MONTO DEL GASTO', left, y);
      y += 15;

      // Caja de montos
      const boxTop = y;
      const boxH = 56;
      doc.save();
      doc.roundedRect(left, boxTop, pageWidth, boxH, 6).fill('#f8f9fa');
      doc.restore();

      const col1 = left + 14;
      const col2 = left + pageWidth / 3 + 6;
      const col3 = left + (pageWidth * 2) / 3;
      const cy = boxTop + 12;

      doc.fontSize(7.5).font('Helvetica').fillColor('#888888');
      doc.text('MONTO USD', col1, cy);
      doc.text('TASA (Bs/USD)', col2, cy);
      doc.text('MONTO Bs', col3, cy);

      doc.fontSize(14).font('Helvetica-Bold').fillColor('#b91c1c');
      doc.text(`$ ${this.fmt(expense.amountUsd)}`, col1, cy + 14);
      doc.fillColor('#000000').fontSize(11);
      doc.text(this.fmt(expense.exchangeRate), col2, cy + 16);
      doc.fillColor('#b91c1c').fontSize(14);
      doc.text(`Bs ${this.fmt(expense.amountBs)}`, col3, cy + 14);

      y = boxTop + boxH + 12;

      // ========== NOTAS ==========
      if (expense.notes) {
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#555555').text('Notas', left, y);
        y += 12;
        doc.fontSize(8.5).font('Helvetica').fillColor('#000000');
        const h = doc.heightOfString(expense.notes, { width: pageWidth });
        doc.text(expense.notes, left, y, { width: pageWidth });
        y += h + 8;
      }

      // ========== FIRMA ==========
      y = Math.max(y + 6, boxTop + boxH + 22);
      const sigGap = 26;
      const sigW = (pageWidth - sigGap) / 2;
      doc.moveTo(left, y).lineTo(left + sigW, y).stroke('#999999');
      doc.moveTo(left + sigW + sigGap, y).lineTo(rightEdge, y).stroke('#999999');
      y += 4;
      doc.fontSize(8).font('Helvetica').fillColor('#555555');
      doc.text('Elaborado por', left, y, { width: sigW, align: 'center' });
      doc.text('Autorizado por', left + sigW + sigGap, y, { width: sigW, align: 'center' });

      // ========== FOOTER ==========
      const footerY = doc.page.height - 24;
      doc.moveTo(left, footerY).lineTo(rightEdge, footerY).stroke('#cccccc');
      doc.fontSize(6.5).font('Helvetica').fillColor('#888888').text(
        `${config?.companyName || 'Trinity ERP'} - Comprobante de gasto - Generado el ${new Date().toLocaleString('es-VE')}`,
        left, footerY + 6, { width: pageWidth, align: 'center' },
      );

      doc.end();
    });
  }
}
