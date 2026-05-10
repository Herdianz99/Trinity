import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

const IVA_LABELS: Record<string, string> = {
  EXEMPT: 'Exento',
  REDUCED: 'Reducido 8%',
  GENERAL: 'General 16%',
  SPECIAL: 'Especial 31%',
};

@Injectable()
export class QuotationPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generatePdf(quotationId: string): Promise<Buffer> {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        customer: true,
        items: true,
      },
    });

    if (!quotation) throw new NotFoundException('Cotizacion no encontrada');

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
      if (config?.email) { doc.text(`Email: ${config.email}`, 40, y); y += 12; }

      // Quotation info (right side)
      const rightX = 350;
      let ry = 40;
      doc.fontSize(12).font('Helvetica-Bold').text('COTIZACION', rightX, ry, { width: pageWidth - rightX + 40, align: 'right' });
      ry += 18;
      doc.fontSize(9).font('Helvetica');
      doc.text(`No: ${quotation.number}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' }); ry += 12;
      doc.text(`Fecha: ${new Date(quotation.createdAt).toLocaleDateString('es-VE')}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' }); ry += 12;
      if (quotation.expiresAt) {
        doc.text(`Vence: ${new Date(quotation.expiresAt).toLocaleDateString('es-VE')}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' }); ry += 12;
      }

      y = Math.max(y, ry) + 20;

      // Separator
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 10;

      // Customer info
      doc.fontSize(10).font('Helvetica-Bold').text('CLIENTE', 40, y);
      y += 14;
      doc.fontSize(9).font('Helvetica');
      if (quotation.customer) {
        doc.text(`Nombre: ${quotation.customer.name}`, 40, y); y += 12;
        if (quotation.customer.rif) { doc.text(`RIF: ${quotation.customer.documentType}-${quotation.customer.rif}`, 40, y); y += 12; }
        if (quotation.customer.phone) { doc.text(`Tel: ${quotation.customer.phone}`, 40, y); y += 12; }
        if (quotation.customer.address) { doc.text(`Direccion: ${quotation.customer.address}`, 40, y); y += 12; }
      } else {
        doc.text('Cliente: General / Consumidor Final', 40, y); y += 12;
      }

      y += 10;

      // Items table header
      const colX = { code: 40, desc: 110, qty: 310, price: 360, iva: 420, total: 480 };
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 5;
      doc.fontSize(8).font('Helvetica-Bold');
      doc.text('Codigo', colX.code, y);
      doc.text('Descripcion', colX.desc, y);
      doc.text('Cant.', colX.qty, y, { width: 40, align: 'right' });
      doc.text('P. Unit. USD', colX.price, y, { width: 55, align: 'right' });
      doc.text('% IVA', colX.iva, y, { width: 50, align: 'right' });
      doc.text('Total USD', colX.total, y, { width: 80, align: 'right' });
      y += 14;
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 5;

      // Items
      doc.fontSize(8).font('Helvetica');
      for (const item of quotation.items) {
        if (y > 680) {
          doc.addPage();
          y = 40;
        }
        doc.text(item.productCode, colX.code, y, { width: 65 });
        doc.text(item.productName, colX.desc, y, { width: 195 });
        doc.text(item.quantity.toString(), colX.qty, y, { width: 40, align: 'right' });
        doc.text(`$${item.unitPriceUsd.toFixed(2)}`, colX.price, y, { width: 55, align: 'right' });
        doc.text(IVA_LABELS[item.ivaType] || item.ivaType, colX.iva, y, { width: 50, align: 'right' });
        doc.text(`$${item.totalUsd.toFixed(2)}`, colX.total, y, { width: 80, align: 'right' });
        y += 14;
      }

      y += 5;
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 10;

      // IVA breakdown
      const ivaByType: Record<string, number> = {};
      for (const item of quotation.items) {
        ivaByType[item.ivaType] = (ivaByType[item.ivaType] || 0) + item.ivaAmount;
      }

      const totalsX = 380;
      doc.fontSize(9).font('Helvetica');
      doc.text('Subtotal:', totalsX, y); doc.text(`$${quotation.subtotalUsd.toFixed(2)}`, colX.total, y, { width: 80, align: 'right' }); y += 14;

      for (const [type, amount] of Object.entries(ivaByType)) {
        if (amount > 0) {
          doc.text(`IVA ${IVA_LABELS[type] || type}:`, totalsX, y); doc.text(`$${amount.toFixed(2)}`, colX.total, y, { width: 80, align: 'right' }); y += 14;
        }
      }

      y += 2;
      doc.moveTo(totalsX, y).lineTo(40 + pageWidth, y).stroke('#333333');
      y += 5;
      doc.fontSize(11).font('Helvetica-Bold');
      doc.text('TOTAL USD:', totalsX, y); doc.text(`$${quotation.totalUsd.toFixed(2)}`, colX.total, y, { width: 80, align: 'right' }); y += 20;

      // Note
      y += 10;
      doc.fontSize(8).font('Helvetica').fillColor('#555555');
      doc.text(
        'Precios en USD. Al momento de facturar se calculara el equivalente en Bs segun tasa BCV vigente.',
        40, y, { width: pageWidth, align: 'center' },
      );
      y += 20;

      if (quotation.notes) {
        doc.fillColor('#000000');
        doc.fontSize(9).font('Helvetica-Bold').text('Notas:', 40, y);
        y += 14;
        doc.fontSize(9).font('Helvetica').text(quotation.notes, 40, y, { width: pageWidth });
        y += 20;
      }

      // Footer
      y += 10;
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 8;
      doc.fontSize(7).font('Helvetica').fillColor('#888888');
      const footerParts = [config?.companyName || 'Trinity ERP'];
      if (config?.phone) footerParts.push(`Tel: ${config.phone}`);
      if (config?.email) footerParts.push(config.email);
      doc.text(footerParts.join(' | '), 40, y, { width: pageWidth, align: 'center' });

      doc.end();
    });
  }
}
