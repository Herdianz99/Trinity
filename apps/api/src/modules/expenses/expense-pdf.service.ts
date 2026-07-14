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
      // Media carta = mitad EXACTA de una LETTER (612x792 -> 612x396): ancho completo
      // de la carta, mitad del alto. Dos comprobantes apilados llenan una hoja carta,
      // asi que se imprimen 2 gastos por hoja. El contenido va derecho (no rotado);
      // la pagina solo es ancha y baja (la mitad superior/inferior de la carta).
      const doc = new PDFDocument({ size: [612, 396], margins: { top: 30, left: 30, right: 30, bottom: 6 } });
      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const left = 30;
      const pageWidth = doc.page.width - 60; // 552
      const rightEdge = left + pageWidth;
      let y = 28;

      // ========== HEADER (empresa izquierda / titulo + datos derecha) ==========
      let logoBottom = y;
      if (config?.logo) {
        try {
          const base64Data = config.logo.replace(/^data:image\/\w+;base64,/, '');
          doc.image(Buffer.from(base64Data, 'base64'), left, y, { height: 40 });
          logoBottom = y + 44;
        } catch {
          doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000').text(config?.companyName || 'Trinity ERP', left, y);
          logoBottom = y + 18;
        }
      } else {
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000').text(config?.companyName || 'Trinity ERP', left, y);
        let ly = y + 18;
        doc.fontSize(8).font('Helvetica').fillColor('#333333');
        if (config?.rif) { doc.text(`RIF: ${config.rif}`, left, ly); ly += 11; }
        if (config?.address) { doc.text(config.address, left, ly, { width: 260 }); ly += 11; }
        if (config?.phone) { doc.text(`Tel: ${config.phone}`, left, ly); ly += 11; }
        logoBottom = ly;
      }

      // Titulo + datos del comprobante (derecha)
      const rightX = 320;
      let ry = 28;
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000')
        .text('COMPROBANTE DE GASTO', rightX, ry, { width: rightEdge - rightX, align: 'right' });
      ry += 18;
      doc.fontSize(8).font('Helvetica').fillColor('#555555');
      doc.text(`Fecha del gasto: ${new Date(expense.date).toLocaleDateString('es-VE', { timeZone: 'UTC' })}`, rightX, ry, { width: rightEdge - rightX, align: 'right' }); ry += 10;
      doc.text(`Generado: ${new Date().toLocaleString('es-VE')}`, rightX, ry, { width: rightEdge - rightX, align: 'right' }); ry += 10;
      doc.text(`ID: ${expense.id}`, rightX, ry, { width: rightEdge - rightX, align: 'right' });

      y = Math.max(logoBottom, ry) + 10;
      doc.moveTo(left, y).lineTo(rightEdge, y).stroke('#cccccc');
      y += 12;

      // ========== DATOS DEL GASTO ==========
      const labelW = 120;
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

      const col1 = left + 20;
      const col2 = left + pageWidth / 3 + 10;
      const col3 = left + (pageWidth * 2) / 3;
      const cy = boxTop + 12;

      doc.fontSize(8).font('Helvetica').fillColor('#888888');
      doc.text('MONTO USD', col1, cy);
      doc.text('TASA (Bs/USD)', col2, cy);
      doc.text('MONTO Bs', col3, cy);

      doc.fontSize(15).font('Helvetica-Bold').fillColor('#b91c1c');
      doc.text(`$ ${this.fmt(expense.amountUsd)}`, col1, cy + 14);
      doc.fillColor('#000000').fontSize(12);
      doc.text(this.fmt(expense.exchangeRate), col2, cy + 16);
      doc.fillColor('#b91c1c').fontSize(15);
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
      const sigGap = 40;
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
