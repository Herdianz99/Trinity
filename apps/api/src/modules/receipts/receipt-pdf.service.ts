import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

@Injectable()
export class ReceiptPdfService {
  constructor(private readonly prisma: PrismaService) {}

  private fmt(n: number): string {
    return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async generatePdf(receiptId: string): Promise<Buffer> {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
      include: {
        customer: true,
        supplier: true,
        items: {
          include: {
            receivable: { select: { invoice: { select: { number: true, createdAt: true } } } },
            payable: { select: { purchaseOrder: { select: { number: true, createdAt: true } } } },
          },
        },
        payments: { include: { method: true } },
      },
    });

    if (!receipt) throw new NotFoundException('Recibo no encontrado');
    if (receipt.status !== 'POSTED') throw new NotFoundException('Solo se pueden imprimir recibos procesados');

    const config = await this.prisma.companyConfig.findFirst();
    const isCollection = receipt.type === 'COLLECTION';
    const entity = isCollection ? receipt.customer : receipt.supplier;
    const typeLabel = isCollection ? 'RECIBO DE COBRO' : 'RECIBO DE PAGO';

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

      // Receipt info (right side)
      const rightX = 350;
      let ry = 40;
      doc.fontSize(13).font('Helvetica-Bold').text(typeLabel, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' });
      ry += 20;
      doc.fontSize(9).font('Helvetica');
      doc.text(`No: ${receipt.number}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' }); ry += 12;
      doc.text(`Fecha: ${new Date(receipt.createdAt).toLocaleDateString('es-VE')}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' }); ry += 12;
      doc.text(`Tasa: Bs ${this.fmt(receipt.exchangeRate)}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' }); ry += 12;
      doc.text(`Estado: ${receipt.status === 'POSTED' ? 'Procesado' : receipt.status}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' });

      y = Math.max(y, ry) + 20;

      // Separator
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 10;

      // Entity info
      doc.fontSize(10).font('Helvetica-Bold').text(isCollection ? 'CLIENTE' : 'PROVEEDOR', 40, y);
      y += 14;
      doc.fontSize(9).font('Helvetica');
      if (entity) {
        doc.text(`Nombre: ${entity.name}`, 40, y); y += 12;
        if (entity.rif) { doc.text(`RIF: ${entity.rif}`, 40, y); y += 12; }
      }

      y += 10;

      // Documents table
      const colX = { num: 40, desc: 60, date: 250, usd: 320, bsHist: 390, bsHoy: 470 };
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 5;
      doc.fontSize(8).font('Helvetica-Bold');
      doc.text('N', colX.num, y, { width: 18, align: 'center' });
      doc.text('Descripcion', colX.desc, y);
      doc.text('Fecha', colX.date, y, { width: 60, align: 'center' });
      doc.text('USD', colX.usd, y, { width: 60, align: 'right' });
      doc.text('Bs (fecha doc.)', colX.bsHist, y, { width: 70, align: 'right' });
      doc.text('Bs (hoy)', colX.bsHoy, y, { width: 70, align: 'right' });
      y += 14;
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 5;

      // Items
      doc.fontSize(8).font('Helvetica');
      let itemNum = 0;
      for (const item of receipt.items) {
        if (y > 680) { doc.addPage(); y = 40; }
        itemNum++;

        if (item.itemType === 'DIFFERENTIAL') {
          doc.fillColor('#996600');
          doc.text(String(itemNum), colX.num, y, { width: 18, align: 'center' });
          doc.text('Diferencial Cambiario', colX.desc, y);
          doc.text('—', colX.usd, y, { width: 60, align: 'right' });
          doc.text('—', colX.bsHist, y, { width: 70, align: 'right' });
          doc.text(`${this.fmt(item.differentialBs)}`, colX.bsHoy, y, { width: 70, align: 'right' });
          doc.fillColor('#000000');
        } else {
          const docDate = item.receivable?.invoice?.createdAt || item.payable?.purchaseOrder?.createdAt;
          const sign = item.sign === 1 ? '' : '(-)';
          doc.text(String(itemNum), colX.num, y, { width: 18, align: 'center' });
          doc.text(`${sign} ${item.description}`, colX.desc, y);
          doc.text(docDate ? new Date(docDate).toLocaleDateString('es-VE') : '', colX.date, y, { width: 60, align: 'center' });
          doc.text(`$${this.fmt(item.amountUsd)}`, colX.usd, y, { width: 60, align: 'right' });
          doc.text(`${this.fmt(item.amountBsHistoric)}`, colX.bsHist, y, { width: 70, align: 'right' });
          doc.text(`${this.fmt(item.amountBsToday)}`, colX.bsHoy, y, { width: 70, align: 'right' });
        }
        y += 14;
      }

      y += 5;
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 10;

      // Totals
      const totalsX = 350;
      doc.fontSize(9).font('Helvetica');
      doc.text('Total USD:', totalsX, y); doc.text(`$${this.fmt(receipt.totalUsd)}`, colX.bsHoy, y, { width: 70, align: 'right' }); y += 14;
      doc.text('Total Bs historico:', totalsX, y); doc.text(`${this.fmt(receipt.totalBsHistoric)}`, colX.bsHoy, y, { width: 70, align: 'right' }); y += 14;
      doc.text('Total Bs hoy:', totalsX, y); doc.text(`${this.fmt(receipt.totalBsToday)}`, colX.bsHoy, y, { width: 70, align: 'right' }); y += 14;

      if (receipt.hasDifferential) {
        doc.font('Helvetica-Bold');
        doc.text('Diferencial cambiario:', totalsX, y); doc.text(`${this.fmt(receipt.differentialBs)} Bs`, colX.bsHoy, y, { width: 70, align: 'right' }); y += 14;
        doc.font('Helvetica');
      }

      y += 2;
      doc.moveTo(totalsX, y).lineTo(40 + pageWidth, y).stroke('#333333');
      y += 5;
      doc.fontSize(11).font('Helvetica-Bold');
      doc.text('SALDO NETO USD:', totalsX, y); doc.text(`$${this.fmt(Math.abs(receipt.totalUsd))}`, colX.bsHoy, y, { width: 70, align: 'right' }); y += 16;
      doc.fontSize(9).font('Helvetica');
      const bsNeto = Math.abs(receipt.totalUsd) * receipt.exchangeRate;
      doc.text('Bs a pagar/cobrar:', totalsX, y); doc.text(`${this.fmt(bsNeto)} Bs`, colX.bsHoy, y, { width: 70, align: 'right' }); y += 20;

      // Payments
      if (receipt.payments.length > 0) {
        doc.fontSize(10).font('Helvetica-Bold').text('METODOS DE PAGO', 40, y);
        y += 14;
        doc.fontSize(9).font('Helvetica');
        for (const p of receipt.payments) {
          const label = p.method?.name || 'Metodo';
          doc.text(`${label}: $${this.fmt(p.amountUsd)} / Bs ${this.fmt(p.amountBs)}${p.reference ? ` (Ref: ${p.reference})` : ''}`, 40, y);
          y += 12;
        }
      }

      // Footer
      y += 30;
      if (y > 680) { doc.addPage(); y = 40; }

      // Signature line
      doc.moveTo(40, y).lineTo(200, y).stroke('#cccccc');
      doc.moveTo(340, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 5;
      doc.fontSize(8).font('Helvetica');
      doc.text('Firma autorizada', 40, y, { width: 160, align: 'center' });
      doc.text('Recibido por', 340, y, { width: pageWidth - 300, align: 'center' });

      y += 30;
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 8;
      doc.fontSize(7).fillColor('#888888');
      doc.text(`${config?.companyName || 'Trinity ERP'} - Generado el ${new Date().toLocaleString('es-VE')}`, 40, y, { width: pageWidth, align: 'center' });

      doc.end();
    });
  }
}
