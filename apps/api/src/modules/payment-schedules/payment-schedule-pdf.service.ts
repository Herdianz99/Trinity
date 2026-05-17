import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

@Injectable()
export class PaymentSchedulePdfService {
  constructor(private readonly prisma: PrismaService) {}

  private fmt(n: number): string {
    return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async generate(scheduleId: string): Promise<Buffer> {
    const schedule = await this.prisma.paymentSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        createdBy: { select: { name: true } },
        items: {
          include: {
            payable: {
              select: {
                dueDate: true,
                purchaseOrder: { select: { number: true } },
              },
            },
            creditDebitNote: {
              select: { number: true, type: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!schedule) throw new NotFoundException('Programación no encontrada');
    const config = await this.prisma.companyConfig.findFirst();

    // Group items by supplier
    const groups: Record<string, {
      supplierName: string;
      totalUsd: number;
      totalBs: number;
      items: typeof schedule.items;
    }> = {};

    for (const item of schedule.items) {
      if (!groups[item.supplierName]) {
        groups[item.supplierName] = { supplierName: item.supplierName, totalUsd: 0, totalBs: 0, items: [] };
      }
      groups[item.supplierName].totalUsd += item.plannedAmountUsd;
      groups[item.supplierName].totalBs += item.plannedAmountBs;
      groups[item.supplierName].items.push(item);
    }

    const supplierGroups = Object.values(groups);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 80;
      let y = 40;

      // ============ HEADER ============
      if (config?.logo) {
        try {
          const base64Data = config.logo.replace(/^data:image\/\w+;base64,/, '');
          const logoBuffer = Buffer.from(base64Data, 'base64');
          doc.image(logoBuffer, 40, y, { height: 50 });
          y += 55;
        } catch {
          doc.fontSize(14).font('Helvetica-Bold').text(config?.companyName || 'Trinity ERP', 40, y);
          y += 18;
        }
      } else {
        doc.fontSize(14).font('Helvetica-Bold').text(config?.companyName || 'Trinity ERP', 40, y);
        y += 18;
        doc.fontSize(8).font('Helvetica');
        if (config?.rif) { doc.text(`RIF: ${config.rif}`, 40, y); y += 11; }
        if (config?.address) { doc.text(config.address, 40, y); y += 11; }
        if (config?.phone) { doc.text(`Tel: ${config.phone}`, 40, y); y += 11; }
      }

      // Document title (right)
      const rightX = 340;
      let ry = 40;
      doc.fontSize(13).font('Helvetica-Bold').text('PROGRAMACIÓN DE PAGOS', rightX, ry, { width: pageWidth - rightX + 40, align: 'right' });
      ry += 20;
      doc.fontSize(9).font('Helvetica');
      doc.text(`No: ${schedule.number}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' }); ry += 13;
      doc.text(`Fecha: ${new Date(schedule.createdAt).toLocaleDateString('es-VE')}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' }); ry += 13;
      doc.text(`Tasa: Bs ${this.fmt(schedule.exchangeRate)}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' }); ry += 13;

      const statusLabels: Record<string, string> = {
        DRAFT: 'Borrador',
        APPROVED: 'Aprobado',
        EXECUTED: 'Ejecutado',
        CANCELLED: 'Cancelado',
      };
      doc.text(`Estado: ${statusLabels[schedule.status] || schedule.status}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' });

      y = Math.max(y, ry) + 20;

      // Separator
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 10;

      // Title and notes
      doc.fontSize(11).font('Helvetica-Bold').text(schedule.title, 40, y);
      y += 16;
      if (schedule.notes) {
        doc.fontSize(8).font('Helvetica').text(schedule.notes, 40, y, { width: pageWidth });
        y += 14;
      }

      // ============ BUDGET SUMMARY ============
      if (schedule.budgetUsd && schedule.budgetUsd > 0) {
        y += 5;
        doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#eeeeee');
        y += 8;

        const diffUsd = schedule.budgetUsd - schedule.totalUsd;
        const exceeded = diffUsd < 0;

        doc.fontSize(9).font('Helvetica-Bold').text('Presupuesto:', 40, y);
        doc.font('Helvetica').text(`$${this.fmt(schedule.budgetUsd)}`, 140, y);
        if (schedule.budgetBs) {
          doc.text(`/ Bs ${this.fmt(schedule.budgetBs)}`, 220, y);
        }
        y += 14;

        doc.font('Helvetica-Bold').text('Total a pagar:', 40, y);
        doc.font('Helvetica').text(`$${this.fmt(schedule.totalUsd)}  /  Bs ${this.fmt(schedule.totalBs)}`, 140, y);
        y += 14;

        doc.font('Helvetica-Bold').text('Diferencia:', 40, y);
        const diffLabel = exceeded
          ? `-$${this.fmt(Math.abs(diffUsd))} (EXCEDIDO)`
          : `+$${this.fmt(diffUsd)}`;
        doc.font('Helvetica').text(diffLabel, 140, y);
        y += 14;

        doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#eeeeee');
        y += 8;
      }

      // ============ ITEMS BY SUPPLIER ============
      for (const group of supplierGroups) {
        // Check if we need a new page
        if (y > 700) {
          doc.addPage();
          y = 40;
        }

        // Supplier header
        y += 5;
        doc.rect(40, y, pageWidth, 18).fill('#f0f0f0');
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000');
        doc.text(group.supplierName, 45, y + 4);
        doc.text(`$${this.fmt(group.totalUsd)}  |  Bs ${this.fmt(group.totalBs)}`, 350, y + 4, { width: pageWidth - 315, align: 'right' });
        y += 22;

        // Table header
        const colX = { ref: 45, type: 170, due: 230, balance: 310, usd: 390, bs: 460 };
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#555555');
        doc.text('Referencia', colX.ref, y);
        doc.text('Tipo', colX.type, y);
        doc.text('Vencimiento', colX.due, y);
        doc.text('Saldo Total', colX.balance, y);
        doc.text('A Pagar USD', colX.usd, y);
        doc.text('A Pagar Bs', colX.bs, y);
        y += 12;
        doc.moveTo(45, y).lineTo(40 + pageWidth - 5, y).stroke('#dddddd');
        y += 4;

        // Items
        doc.fontSize(8).font('Helvetica').fillColor('#000000');
        for (const item of group.items) {
          if (y > 740) {
            doc.addPage();
            y = 40;
          }

          const type = item.creditDebitNoteId ? 'NDC' : 'CxP';
          const dueDate = item.payable?.dueDate
            ? new Date(item.payable.dueDate).toLocaleDateString('es-VE')
            : '-';

          if (item.isPaid) {
            doc.rect(45, y - 2, pageWidth - 10, 14).fill('#e8f5e9');
            doc.fillColor('#000000');
          }

          doc.text(item.description, colX.ref, y, { width: 120 });
          doc.text(type, colX.type, y);
          doc.text(dueDate, colX.due, y);
          doc.text(`$${this.fmt(item.totalAmountUsd)}`, colX.balance, y);
          doc.text(`$${this.fmt(item.plannedAmountUsd)}`, colX.usd, y);
          doc.text(`Bs ${this.fmt(item.plannedAmountBs)}`, colX.bs, y);
          y += 14;
        }

        // Supplier subtotal
        doc.moveTo(colX.usd, y).lineTo(40 + pageWidth - 5, y).stroke('#cccccc');
        y += 4;
        doc.fontSize(8).font('Helvetica-Bold');
        doc.text(`Subtotal: $${this.fmt(group.totalUsd)}`, colX.usd, y);
        doc.text(`Bs ${this.fmt(group.totalBs)}`, colX.bs, y);
        y += 16;
      }

      // ============ GRAND TOTAL ============
      if (y > 720) {
        doc.addPage();
        y = 40;
      }
      y += 5;
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#333333');
      y += 8;
      doc.fontSize(11).font('Helvetica-Bold');
      doc.text('TOTAL:', 40, y);
      doc.text(`$${this.fmt(schedule.totalUsd)}`, 350, y, { width: pageWidth - 315, align: 'right' });
      y += 14;
      doc.fontSize(10).font('Helvetica');
      doc.text(`Bs ${this.fmt(schedule.totalBs)}`, 350, y, { width: pageWidth - 315, align: 'right' });
      y += 14;
      doc.text(`(${schedule.items.length} documentos)`, 40, y);

      // ============ FOOTER ============
      y += 30;
      doc.fontSize(7).font('Helvetica').fillColor('#888888');
      doc.text(`Creado por: ${schedule.createdBy.name}`, 40, y);
      y += 10;
      doc.text(`Generado el ${new Date().toLocaleString('es-VE')}`, 40, y);
      y += 10;
      if (config?.companyName) {
        doc.text(`${config.companyName}${config.rif ? ` — RIF: ${config.rif}` : ''}`, 40, y);
      }

      doc.end();
    });
  }
}
