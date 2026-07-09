import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

@Injectable()
export class ExpenseReportPdfService {
  constructor(private readonly prisma: PrismaService) {}

  private fmt(n: number): string {
    return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async generateReport(filters: {
    from?: string;
    to?: string;
    categoryId?: string;
  }): Promise<Buffer> {
    const where: any = {};

    if (filters.from || filters.to) {
      where.date = {};
      if (filters.from) {
        const fromDate = new Date(filters.from);
        fromDate.setUTCHours(0, 0, 0, 0);
        where.date.gte = fromDate;
      }
      if (filters.to) {
        const toDate = new Date(filters.to);
        toDate.setUTCHours(23, 59, 59, 999);
        where.date.lte = toDate;
      }
    }

    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }

    const expenses = await this.prisma.expense.findMany({
      where,
      include: {
        category: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { date: 'asc' },
    });

    if (expenses.length === 0) {
      throw new BadRequestException('No hay gastos en el periodo seleccionado');
    }

    const config = await this.prisma.companyConfig.findFirst();

    // Calculate summary by category
    const byCategoryMap: Record<string, { name: string; count: number; totalUsd: number; totalBs: number }> = {};
    let grandTotalUsd = 0;
    let grandTotalBs = 0;

    for (const exp of expenses) {
      grandTotalUsd += exp.amountUsd;
      grandTotalBs += exp.amountBs;
      if (!byCategoryMap[exp.categoryId]) {
        byCategoryMap[exp.categoryId] = { name: exp.category.name, count: 0, totalUsd: 0, totalBs: 0 };
      }
      byCategoryMap[exp.categoryId].count += 1;
      byCategoryMap[exp.categoryId].totalUsd += exp.amountUsd;
      byCategoryMap[exp.categoryId].totalBs += exp.amountBs;
    }

    const byCategory = Object.values(byCategoryMap).sort((a, b) => b.totalUsd - a.totalUsd);

    // Format date range label
    const fromLabel = filters.from
      ? new Date(filters.from).toLocaleDateString('es-VE')
      : '—';
    const toLabel = filters.to
      ? new Date(filters.to).toLocaleDateString('es-VE')
      : '—';

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 80;
      let y = 40;

      // ========== HEADER ==========
      if (config?.logo) {
        try {
          const base64Data = config.logo.replace(/^data:image\/\w+;base64,/, '');
          const logoBuffer = Buffer.from(base64Data, 'base64');
          doc.image(logoBuffer, 40, y, { height: 50 });
          y += 55;
        } catch {
          doc.fontSize(16).font('Helvetica-Bold').text(config?.companyName || 'Trinity ERP', 40, y);
          y += 20;
        }
      } else {
        doc.fontSize(16).font('Helvetica-Bold').text(config?.companyName || 'Trinity ERP', 40, y);
        y += 20;
        doc.fontSize(9).font('Helvetica');
        if (config?.rif) { doc.text(`RIF: ${config.rif}`, 40, y); y += 12; }
        if (config?.address) { doc.text(config.address, 40, y); y += 12; }
        if (config?.phone) { doc.text(`Tel: ${config.phone}`, 40, y); y += 12; }
      }

      // Report title (right side)
      const rightX = 350;
      let ry = 40;
      doc.fontSize(13).font('Helvetica-Bold').text('REPORTE DE GASTOS', rightX, ry, { width: pageWidth - rightX + 40, align: 'right' });
      ry += 20;
      doc.fontSize(9).font('Helvetica');
      doc.text(`Periodo: ${fromLabel} al ${toLabel}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' }); ry += 12;
      doc.text(`Generado: ${new Date().toLocaleString('es-VE')}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' }); ry += 12;
      doc.text(`Total gastos: ${expenses.length}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' });

      y = Math.max(y, ry) + 20;

      // Separator
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 15;

      // ========== SUMMARY BY CATEGORY ==========
      doc.fontSize(11).font('Helvetica-Bold').text('RESUMEN POR CATEGORIA', 40, y);
      y += 18;

      // Table header
      const catColX = { name: 40, count: 250, usd: 330, bs: 430 };
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#555555');
      doc.text('Categoria', catColX.name, y);
      doc.text('Cant.', catColX.count, y, { width: 50, align: 'right' });
      doc.text('Total USD', catColX.usd, y, { width: 80, align: 'right' });
      doc.text('Total Bs', catColX.bs, y, { width: 100, align: 'right' });
      y += 14;
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#dddddd');
      y += 5;

      doc.fontSize(8).font('Helvetica').fillColor('#000000');
      for (const cat of byCategory) {
        // Altura dinamica: el nombre de categoria puede ocupar 2 lineas.
        doc.fontSize(8).font('Helvetica');
        const nameH = doc.heightOfString(cat.name, { width: 200 });
        const rowH = Math.max(14, nameH + 2);
        doc.text(cat.name, catColX.name, y, { width: 200 });
        doc.text(cat.count.toString(), catColX.count, y, { width: 50, align: 'right', lineBreak: false });
        doc.text(`$${this.fmt(cat.totalUsd)}`, catColX.usd, y, { width: 80, align: 'right', lineBreak: false });
        doc.text(`Bs ${this.fmt(cat.totalBs)}`, catColX.bs, y, { width: 100, align: 'right', lineBreak: false });
        y += rowH;
      }

      // Category totals
      y += 2;
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#333333');
      y += 5;
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('TOTAL', catColX.name, y);
      doc.text(expenses.length.toString(), catColX.count, y, { width: 50, align: 'right' });
      doc.text(`$${this.fmt(grandTotalUsd)}`, catColX.usd, y, { width: 80, align: 'right' });
      doc.text(`Bs ${this.fmt(grandTotalBs)}`, catColX.bs, y, { width: 100, align: 'right' });
      y += 25;

      // ========== DETAILED LIST ==========
      doc.fontSize(11).font('Helvetica-Bold').text('DETALLE DE GASTOS', 40, y);
      y += 18;

      // Detail table header
      const detColX = { date: 40, cat: 100, desc: 200, ref: 340, usd: 400, bs: 470 };
      doc.fontSize(7).font('Helvetica-Bold').fillColor('#555555');
      doc.text('Fecha', detColX.date, y);
      doc.text('Categoria', detColX.cat, y, { width: 95 });
      doc.text('Descripcion', detColX.desc, y, { width: 135 });
      doc.text('Ref.', detColX.ref, y, { width: 55 });
      doc.text('USD', detColX.usd, y, { width: 60, align: 'right' });
      doc.text('Bs', detColX.bs, y, { width: 70, align: 'right' });
      y += 12;
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#dddddd');
      y += 4;

      doc.fontSize(7).font('Helvetica').fillColor('#000000');
      let stripe = false;

      for (const exp of expenses) {
        // Altura dinamica: el nombre de categoria o la descripcion pueden ocupar 2 lineas.
        doc.fontSize(7).font('Helvetica');
        const catH = doc.heightOfString(exp.category.name, { width: 95 });
        const descH = doc.heightOfString(exp.description.substring(0, 60), { width: 135 });
        const rowH = Math.max(13, catH, descH) + 2;

        // Page break check
        if (y + rowH > 720) {
          doc.addPage();
          y = 40;

          // Repeat header on new page
          doc.fontSize(7).font('Helvetica-Bold').fillColor('#555555');
          doc.text('Fecha', detColX.date, y);
          doc.text('Categoria', detColX.cat, y, { width: 95 });
          doc.text('Descripcion', detColX.desc, y, { width: 135 });
          doc.text('Ref.', detColX.ref, y, { width: 55 });
          doc.text('USD', detColX.usd, y, { width: 60, align: 'right' });
          doc.text('Bs', detColX.bs, y, { width: 70, align: 'right' });
          y += 12;
          doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#dddddd');
          y += 4;
          doc.fontSize(7).font('Helvetica').fillColor('#000000');
        }

        // Alternating row background
        if (stripe) {
          doc.save();
          doc.rect(40, y - 1, pageWidth, rowH).fill('#f8f9fa');
          doc.restore();
          doc.fillColor('#000000');
        }
        stripe = !stripe;

        const dateStr = new Date(exp.date).toLocaleDateString('es-VE');
        doc.text(dateStr, detColX.date, y, { width: 55, lineBreak: false });
        doc.text(exp.category.name, detColX.cat, y, { width: 95 });
        doc.text(exp.description.substring(0, 60), detColX.desc, y, { width: 135 });
        doc.text(exp.reference || '-', detColX.ref, y, { width: 55, lineBreak: false });
        doc.text(`$${this.fmt(exp.amountUsd)}`, detColX.usd, y, { width: 60, align: 'right', lineBreak: false });
        doc.text(`Bs ${this.fmt(exp.amountBs)}`, detColX.bs, y, { width: 70, align: 'right', lineBreak: false });
        y += rowH;
      }

      // Grand total at the bottom of the detail
      y += 3;
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#333333');
      y += 5;
      doc.fontSize(8).font('Helvetica-Bold');
      doc.text(`TOTAL (${expenses.length} gastos)`, detColX.date, y);
      doc.text(`$${this.fmt(grandTotalUsd)}`, detColX.usd, y, { width: 60, align: 'right' });
      doc.text(`Bs ${this.fmt(grandTotalBs)}`, detColX.bs, y, { width: 70, align: 'right' });

      // Footer
      y += 25;
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 8;
      doc.fontSize(7).font('Helvetica').fillColor('#888888');
      doc.text(
        `${config?.companyName || 'Trinity ERP'} - Reporte de Gastos - Generado el ${new Date().toLocaleString('es-VE')}`,
        40, y, { width: pageWidth, align: 'center' },
      );

      doc.end();
    });
  }
}
