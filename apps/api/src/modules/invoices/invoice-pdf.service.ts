import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

const IVA_LABELS: Record<string, string> = {
  EXEMPT: 'Exento',
  REDUCED: 'Reducido 8%',
  GENERAL: 'General 16%',
  SPECIAL: 'Especial 31%',
};

const METHOD_LABELS: Record<string, string> = {
  CASH_USD: 'Efectivo USD',
  CASH_BS: 'Efectivo Bs',
  PUNTO_DE_VENTA: 'Punto de Venta',
  PAGO_MOVIL: 'Pago Movil',
  ZELLE: 'Zelle',
  TRANSFERENCIA: 'Transferencia',
  CASHEA: 'Cashea',
  CREDIAGRO: 'Crediagro',
};

@Injectable()
export class InvoicePdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generatePdf(invoiceId: string): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        cashRegister: true,
        items: true,
        payments: true,
      },
    });

    if (!invoice) throw new NotFoundException('Factura no encontrada');

    const config = await this.prisma.companyConfig.findFirst();

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 80;
      let y = 40;

      // Header - Company info
      doc.fontSize(16).font('Helvetica-Bold').text(config?.companyName || 'Trinity ERP', 40, y);
      y += 20;
      doc.fontSize(9).font('Helvetica');
      if (config?.rif) { doc.text(`RIF: ${config.rif}`, 40, y); y += 12; }
      if (config?.address) { doc.text(config.address, 40, y); y += 12; }
      if (config?.phone) { doc.text(`Tel: ${config.phone}`, 40, y); y += 12; }

      // Invoice info (right side)
      const rightX = 350;
      let ry = 40;
      doc.fontSize(12).font('Helvetica-Bold').text('FACTURA', rightX, ry, { width: pageWidth - rightX + 40, align: 'right' });
      ry += 18;
      doc.fontSize(9).font('Helvetica');
      doc.text(`No: ${invoice.number}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' }); ry += 12;
      if (invoice.controlNumber) { doc.text(`Control: ${invoice.controlNumber}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' }); ry += 12; }
      doc.text(`Fecha: ${new Date(invoice.createdAt).toLocaleDateString('es-VE')}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' }); ry += 12;
      doc.text(`Tasa: Bs ${invoice.exchangeRate.toFixed(2)}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' }); ry += 12;
      doc.text(`Estado: ${invoice.status}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' });

      y = Math.max(y, ry) + 20;

      // Separator
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 10;

      // Customer info
      doc.fontSize(10).font('Helvetica-Bold').text('CLIENTE', 40, y);
      y += 14;
      doc.fontSize(9).font('Helvetica');
      if (invoice.customer) {
        doc.text(`Nombre: ${invoice.customer.name}`, 40, y); y += 12;
        if (invoice.customer.rif) { doc.text(`RIF: ${invoice.customer.rif}`, 40, y); y += 12; }
        if (invoice.customer.address) { doc.text(`Direccion: ${invoice.customer.address}`, 40, y); y += 12; }
      } else {
        doc.text('Cliente: General / Consumidor Final', 40, y); y += 12;
      }

      y += 10;

      // Items table header
      const colX = { code: 40, desc: 100, qty: 320, price: 370, iva: 430, total: 490 };
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 5;
      doc.fontSize(8).font('Helvetica-Bold');
      doc.text('Codigo', colX.code, y);
      doc.text('Descripcion', colX.desc, y);
      doc.text('Cant.', colX.qty, y, { width: 40, align: 'right' });
      doc.text('P. Unit.', colX.price, y, { width: 50, align: 'right' });
      doc.text('% IVA', colX.iva, y, { width: 50, align: 'right' });
      doc.text('Total USD', colX.total, y, { width: 70, align: 'right' });
      y += 14;
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 5;

      // Items
      doc.fontSize(8).font('Helvetica');
      for (const item of invoice.items) {
        if (y > 680) {
          doc.addPage();
          y = 40;
        }
        doc.text(item.productId.slice(0, 8), colX.code, y, { width: 55 });
        doc.text(item.productName, colX.desc, y, { width: 215 });
        doc.text(item.quantity.toString(), colX.qty, y, { width: 40, align: 'right' });
        doc.text(`$${item.unitPrice.toFixed(2)}`, colX.price, y, { width: 50, align: 'right' });
        doc.text(IVA_LABELS[item.ivaType] || item.ivaType, colX.iva, y, { width: 50, align: 'right' });
        doc.text(`$${item.totalUsd.toFixed(2)}`, colX.total, y, { width: 70, align: 'right' });
        y += 14;
      }

      y += 5;
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 10;

      // IVA breakdown
      const ivaByType: Record<string, number> = {};
      for (const item of invoice.items) {
        ivaByType[item.ivaType] = (ivaByType[item.ivaType] || 0) + item.ivaAmount;
      }

      const totalsX = 380;
      doc.fontSize(9).font('Helvetica');
      doc.text('Subtotal:', totalsX, y); doc.text(`$${invoice.subtotalUsd.toFixed(2)}`, colX.total, y, { width: 70, align: 'right' }); y += 14;

      for (const [type, amount] of Object.entries(ivaByType)) {
        if (amount > 0) {
          doc.text(`IVA ${IVA_LABELS[type] || type}:`, totalsX, y); doc.text(`$${amount.toFixed(2)}`, colX.total, y, { width: 70, align: 'right' }); y += 14;
        }
      }

      // IGTF line (if applicable)
      if (invoice.igtfUsd > 0) {
        doc.text(`IGTF (3%):`, totalsX, y); doc.text(`$${invoice.igtfUsd.toFixed(2)}`, colX.total, y, { width: 70, align: 'right' }); y += 14;
      }

      y += 2;
      doc.moveTo(totalsX, y).lineTo(40 + pageWidth, y).stroke('#333333');
      y += 5;
      doc.fontSize(11).font('Helvetica-Bold');
      doc.text('TOTAL USD:', totalsX, y); doc.text(`$${invoice.totalUsd.toFixed(2)}`, colX.total, y, { width: 70, align: 'right' }); y += 16;
      doc.fontSize(9).font('Helvetica');
      doc.text('TOTAL Bs:', totalsX, y); doc.text(`Bs ${invoice.totalBs.toFixed(2)}`, colX.total, y, { width: 70, align: 'right' }); y += 20;

      // Payments
      if (invoice.payments.length > 0) {
        doc.fontSize(10).font('Helvetica-Bold').text('METODOS DE PAGO', 40, y);
        y += 14;
        doc.fontSize(9).font('Helvetica');
        for (const p of invoice.payments) {
          const label = METHOD_LABELS[p.method] || p.method;
          doc.text(`${label}: $${p.amountUsd.toFixed(2)} / Bs ${p.amountBs.toFixed(2)}${p.reference ? ` (Ref: ${p.reference})` : ''}`, 40, y);
          y += 12;
        }
      }

      // Footer
      y += 20;
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 8;
      doc.fontSize(7).font('Helvetica').fillColor('#888888');
      doc.text(`${config?.companyName || 'Trinity ERP'} - Generado el ${new Date().toLocaleString('es-VE')}`, 40, y, { width: pageWidth, align: 'center' });

      doc.end();
    });
  }
}
