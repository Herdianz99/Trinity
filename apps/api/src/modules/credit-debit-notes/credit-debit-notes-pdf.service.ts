import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

const TYPE_LABELS: Record<string, string> = {
  NCV: 'NOTA DE CREDITO - VENTA',
  NDV: 'NOTA DE DEBITO - VENTA',
  NCC: 'NOTA DE CREDITO - COMPRA',
  NDC: 'NOTA DE DEBITO - COMPRA',
};

@Injectable()
export class CreditDebitNotesPdfService {
  constructor(private readonly prisma: PrismaService) {}

  private fmt(n: number): string {
    return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async generate(noteId: string): Promise<Buffer> {
    const note = await this.prisma.creditDebitNote.findUnique({
      where: { id: noteId },
      include: {
        invoice: {
          select: {
            number: true,
            customer: { select: { name: true, rif: true, phone: true, address: true } },
          },
        },
        purchaseOrder: {
          select: {
            number: true,
            supplier: { select: { name: true, rif: true, phone: true, address: true } },
          },
        },
        items: true,
      },
    });

    if (!note) throw new NotFoundException('Nota no encontrada');

    const config = await this.prisma.companyConfig.findFirst();
    const isSale = ['NCV', 'NDV'].includes(note.type);
    const entity = isSale ? note.invoice?.customer : note.purchaseOrder?.supplier;
    const parentNumber = isSale ? note.invoice?.number : note.purchaseOrder?.number;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 80;
      let y = 40;

      // Header
      doc.fontSize(14).font('Helvetica-Bold').text(config?.companyName || 'Trinity ERP', 40, y);
      y += 18;
      if (config?.rif) {
        doc.fontSize(9).font('Helvetica').text(`RIF: ${config.rif}`, 40, y);
        y += 12;
      }
      if (config?.address) {
        doc.fontSize(8).font('Helvetica').text(config.address, 40, y);
        y += 12;
      }

      // Title
      y += 10;
      doc.fontSize(13).font('Helvetica-Bold').text(TYPE_LABELS[note.type] || 'NOTA', 40, y, { align: 'center', width: pageWidth });
      y += 22;

      // Note info
      doc.fontSize(9).font('Helvetica-Bold').text('Numero:', 40, y);
      doc.font('Helvetica').text(note.number, 110, y);
      doc.font('Helvetica-Bold').text('Fecha:', 300, y);
      doc.font('Helvetica').text(new Date(note.createdAt).toLocaleDateString('es-VE'), 345, y);
      y += 14;
      doc.font('Helvetica-Bold').text('Documento ref.:', 40, y);
      doc.font('Helvetica').text(parentNumber || '—', 130, y);
      doc.font('Helvetica-Bold').text('Tasa:', 300, y);
      doc.font('Helvetica').text(`Bs ${this.fmt(note.exchangeRate)}`, 335, y);
      y += 14;
      doc.font('Helvetica-Bold').text('Origen:', 40, y);
      doc.font('Helvetica').text(note.origin === 'MERCHANDISE' ? 'Devolución de mercancía' : 'Ajuste manual', 100, y);
      y += 20;

      // Separator
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor('#999').lineWidth(0.5).stroke();
      y += 10;

      // Entity info
      if (entity) {
        doc.fontSize(9).font('Helvetica-Bold').text(isSale ? 'Cliente:' : 'Proveedor:', 40, y);
        doc.font('Helvetica').text(entity.name || '—', 110, y);
        y += 13;
        doc.font('Helvetica-Bold').text('RIF:', 40, y);
        doc.font('Helvetica').text(entity.rif || '—', 110, y);
        y += 18;
      }

      if (note.origin === 'MERCHANDISE' && note.items.length > 0) {
        // Items table header
        doc.fontSize(8).font('Helvetica-Bold');
        doc.text('Producto', 40, y, { width: 180 });
        doc.text('Cant.', 220, y, { width: 40, align: 'right' });
        doc.text('P.Unit $', 265, y, { width: 60, align: 'right' });
        doc.text('IVA $', 330, y, { width: 55, align: 'right' });
        doc.text('Total $', 390, y, { width: 60, align: 'right' });
        doc.text('Total Bs', 455, y, { width: 70, align: 'right' });
        y += 12;
        doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor('#ccc').lineWidth(0.3).stroke();
        y += 5;

        // Items
        doc.font('Helvetica').fontSize(8);
        for (const item of note.items) {
          if (y > 700) {
            doc.addPage();
            y = 40;
          }
          doc.text(item.productName.substring(0, 35), 40, y, { width: 180 });
          doc.text(String(item.quantity), 220, y, { width: 40, align: 'right' });
          doc.text(this.fmt(item.unitPriceUsd), 265, y, { width: 60, align: 'right' });
          doc.text(this.fmt(item.ivaAmount), 330, y, { width: 55, align: 'right' });
          doc.text(this.fmt(item.totalUsd), 390, y, { width: 60, align: 'right' });
          doc.text(this.fmt(item.totalBs), 455, y, { width: 70, align: 'right' });
          y += 13;
        }
        y += 5;
      } else if (note.origin === 'MANUAL') {
        doc.fontSize(9).font('Helvetica');
        if (note.manualPct) {
          doc.text(`Porcentaje aplicado: ${note.manualPct}% sobre documento ${parentNumber}`, 40, y);
        } else {
          doc.text(`Monto manual: $ ${this.fmt(note.manualAmountUsd || 0)}`, 40, y);
        }
        y += 20;
      }

      // Separator
      y += 5;
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor('#999').lineWidth(0.5).stroke();
      y += 12;

      // Totals
      const totalsX = 350;
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('Subtotal USD:', totalsX, y); doc.font('Helvetica').text(`$ ${this.fmt(note.subtotalUsd)}`, totalsX + 100, y); y += 14;
      doc.font('Helvetica-Bold').text('IVA USD:', totalsX, y); doc.font('Helvetica').text(`$ ${this.fmt(note.ivaUsd)}`, totalsX + 100, y); y += 14;
      doc.font('Helvetica-Bold').text('Total USD:', totalsX, y); doc.font('Helvetica').text(`$ ${this.fmt(note.totalUsd)}`, totalsX + 100, y); y += 14;
      doc.font('Helvetica-Bold').text('Total Bs:', totalsX, y); doc.font('Helvetica').text(`Bs ${this.fmt(note.totalBs)}`, totalsX + 100, y); y += 20;

      // Notes
      if (note.notes) {
        doc.fontSize(8).font('Helvetica-Bold').text('Observaciones:', 40, y);
        y += 12;
        doc.font('Helvetica').text(note.notes, 40, y, { width: pageWidth });
      }

      doc.end();
    });
  }
}
