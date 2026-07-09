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
        cashSession: { select: { cashRegister: { select: { name: true, code: true } } } },
      },
    });
    if (!expense) throw new NotFoundException('Gasto no encontrado');

    const config = await this.prisma.companyConfig.findFirst();

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const left = 40;
      const pageWidth = doc.page.width - 80;
      const rightEdge = left + pageWidth;
      let y = 40;

      // ========== HEADER ==========
      let logoBottom = y;
      if (config?.logo) {
        try {
          const base64Data = config.logo.replace(/^data:image\/\w+;base64,/, '');
          doc.image(Buffer.from(base64Data, 'base64'), left, y, { height: 50 });
          logoBottom = y + 55;
        } catch {
          doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000').text(config?.companyName || 'Trinity ERP', left, y);
          logoBottom = y + 20;
        }
      } else {
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000').text(config?.companyName || 'Trinity ERP', left, y);
        let ly = y + 20;
        doc.fontSize(9).font('Helvetica').fillColor('#333333');
        if (config?.rif) { doc.text(`RIF: ${config.rif}`, left, ly); ly += 12; }
        if (config?.address) { doc.text(config.address, left, ly, { width: 260 }); ly += 12; }
        if (config?.phone) { doc.text(`Tel: ${config.phone}`, left, ly); ly += 12; }
        logoBottom = ly;
      }

      // Título (derecha)
      const rightX = 340;
      let ry = 40;
      doc.fontSize(15).font('Helvetica-Bold').fillColor('#000000')
        .text('COMPROBANTE DE GASTO', rightX, ry, { width: rightEdge - rightX, align: 'right' });
      ry += 22;
      doc.fontSize(9).font('Helvetica').fillColor('#555555');
      doc.text(`Fecha del gasto: ${new Date(expense.date).toLocaleDateString('es-VE', { timeZone: 'UTC' })}`, rightX, ry, { width: rightEdge - rightX, align: 'right' }); ry += 12;
      doc.text(`Generado: ${new Date().toLocaleString('es-VE')}`, rightX, ry, { width: rightEdge - rightX, align: 'right' }); ry += 12;
      doc.text(`ID: ${expense.id}`, rightX, ry, { width: rightEdge - rightX, align: 'right' });

      y = Math.max(logoBottom, ry) + 18;
      doc.moveTo(left, y).lineTo(rightEdge, y).stroke('#cccccc');
      y += 20;

      // ========== DATOS DEL GASTO ==========
      const labelW = 130;
      const valueX = left + labelW;
      const valueW = pageWidth - labelW;

      const row = (label: string, value: string) => {
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#555555').text(label, left, y, { width: labelW - 8 });
        doc.fontSize(9).font('Helvetica').fillColor('#000000');
        const h = doc.heightOfString(value || '-', { width: valueW });
        doc.text(value || '-', valueX, y, { width: valueW });
        y += Math.max(16, h + 4);
      };

      row('Categoria', expense.category.name);
      row('Descripcion', expense.description);
      row('Referencia', expense.reference || '-');
      const cajaLabel = expense.cashSession?.cashRegister
        ? `${expense.cashSession.cashRegister.name || expense.cashSession.cashRegister.code || 'Caja'}`
        : null;
      if (cajaLabel) row('Pagado desde caja', cajaLabel);
      if (expense.method?.name) row('Metodo de pago', expense.method.name);
      row('Registrado por', expense.createdBy.name);

      y += 8;
      doc.moveTo(left, y).lineTo(rightEdge, y).stroke('#eeeeee');
      y += 16;

      // ========== MONTOS ==========
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#555555').text('MONTO DEL GASTO', left, y);
      y += 20;

      // Caja de montos
      const boxTop = y;
      const boxH = 74;
      doc.save();
      doc.roundedRect(left, boxTop, pageWidth, boxH, 6).fill('#f8f9fa');
      doc.restore();

      const col1 = left + 20;
      const col2 = left + pageWidth / 3 + 10;
      const col3 = left + (pageWidth * 2) / 3;
      const cy = boxTop + 16;

      doc.fontSize(8).font('Helvetica').fillColor('#888888');
      doc.text('MONTO USD', col1, cy);
      doc.text('TASA (Bs/USD)', col2, cy);
      doc.text('MONTO Bs', col3, cy);

      doc.fontSize(16).font('Helvetica-Bold').fillColor('#b91c1c');
      doc.text(`$ ${this.fmt(expense.amountUsd)}`, col1, cy + 16);
      doc.fillColor('#000000').fontSize(13);
      doc.text(this.fmt(expense.exchangeRate), col2, cy + 18);
      doc.fillColor('#b91c1c').fontSize(16);
      doc.text(`Bs ${this.fmt(expense.amountBs)}`, col3, cy + 16);

      y = boxTop + boxH + 20;

      // ========== NOTAS ==========
      if (expense.notes) {
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#555555').text('Notas', left, y);
        y += 14;
        doc.fontSize(9).font('Helvetica').fillColor('#000000');
        const h = doc.heightOfString(expense.notes, { width: pageWidth });
        doc.text(expense.notes, left, y, { width: pageWidth });
        y += h + 10;
      }

      // ========== FIRMA ==========
      y = Math.max(y, boxTop + boxH + 70);
      const sigW = (pageWidth - 40) / 2;
      doc.moveTo(left, y).lineTo(left + sigW, y).stroke('#999999');
      doc.moveTo(left + sigW + 40, y).lineTo(rightEdge, y).stroke('#999999');
      y += 4;
      doc.fontSize(8).font('Helvetica').fillColor('#555555');
      doc.text('Elaborado por', left, y, { width: sigW, align: 'center' });
      doc.text('Autorizado por', left + sigW + 40, y, { width: sigW, align: 'center' });

      // ========== FOOTER ==========
      const footerY = doc.page.height - 60;
      doc.moveTo(left, footerY).lineTo(rightEdge, footerY).stroke('#cccccc');
      doc.fontSize(7).font('Helvetica').fillColor('#888888').text(
        `${config?.companyName || 'Trinity ERP'} - Comprobante de gasto - Generado el ${new Date().toLocaleString('es-VE')}`,
        left, footerY + 8, { width: pageWidth, align: 'center' },
      );

      doc.end();
    });
  }
}
