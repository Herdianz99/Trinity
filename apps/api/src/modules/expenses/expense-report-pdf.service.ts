import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';
import * as PDFDocument from 'pdfkit';

const EXPENSE_TYPE_LABELS: Record<string, string> = {
  FIXED: 'GASTOS FIJOS',
  EXTRAORDINARY: 'GASTOS EXTRAORDINARIOS',
};

@Injectable()
export class ExpenseReportPdfService {
  constructor(private readonly prisma: PrismaService) {}

  private fmt(n: number): string {
    return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Reporte AGRUPADO en 2 niveles: primero por clasificacion (Fijo / Extraordinario) de la
  // categoria, luego por categoria, con subtotal por tipo y TOTAL GENERAL. Respeta el rango
  // de fechas (sobre Expense.date, anclado a Caracas como el dashboard) y el filtro de categoria.
  async generateGroupedReport(filters: { from?: string; to?: string; categoryId?: string }): Promise<Buffer> {
    const where: any = {};
    if (filters.from || filters.to) {
      where.date = {};
      if (filters.from) where.date.gte = caracasDayStart(filters.from);
      if (filters.to) where.date.lte = caracasDayEnd(filters.to);
    }
    if (filters.categoryId) where.categoryId = filters.categoryId;

    const expenses = await this.prisma.expense.findMany({
      where,
      include: { category: { select: { name: true, expenseType: true } } },
      orderBy: { date: 'asc' },
    });
    const config = await this.prisma.companyConfig.findFirst();
    const company = config?.companyName || 'Trinity ERP';

    // Agrupar: tipo -> categoria
    type Cat = { name: string; count: number; totalUsd: number; totalBs: number };
    type Group = { type: string; cats: Map<string, Cat>; count: number; totalUsd: number; totalBs: number };
    const groups = new Map<string, Group>();
    let grandUsd = 0, grandBs = 0;
    for (const exp of expenses) {
      const type = exp.category?.expenseType === 'FIXED' ? 'FIXED' : 'EXTRAORDINARY';
      if (!groups.has(type)) groups.set(type, { type, cats: new Map(), count: 0, totalUsd: 0, totalBs: 0 });
      const g = groups.get(type)!;
      if (!g.cats.has(exp.categoryId)) g.cats.set(exp.categoryId, { name: exp.category.name, count: 0, totalUsd: 0, totalBs: 0 });
      const c = g.cats.get(exp.categoryId)!;
      c.count += 1; c.totalUsd += exp.amountUsd; c.totalBs += exp.amountBs;
      g.count += 1; g.totalUsd += exp.amountUsd; g.totalBs += exp.amountBs;
      grandUsd += exp.amountUsd; grandBs += exp.amountBs;
    }
    // Fijos primero, luego extraordinarios.
    const ordered = Array.from(groups.values()).sort((a, b) => (a.type === 'FIXED' ? -1 : 1) - (b.type === 'FIXED' ? -1 : 1));

    const fromLabel = filters.from ? new Date(caracasDayStart(filters.from)).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }) : '—';
    const toLabel = filters.to ? new Date(caracasDayStart(filters.to)).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }) : '—';

    const RIGHT = 572;
    const doc = new PDFDocument({ size: 'LETTER', layout: 'portrait', margins: { top: 40, bottom: 40, left: 40, right: 40 }, bufferPages: true });

    // Encabezado
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text('Reporte de Gastos — Fijos vs Extraordinarios', 40, 60);
    doc.fontSize(9).font('Helvetica').fillColor('#334155');
    doc.text(`Periodo: ${fromLabel}  a  ${toLabel}`, 40, 80);
    doc.text(`Generado: ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })}   |   ${expenses.length} gasto${expenses.length !== 1 ? 's' : ''}`, 40, 94);
    doc.fillColor('#000');
    doc.moveTo(40, 110).lineTo(RIGHT, 110).stroke('#94a3b8');
    let y = 118;

    // Columnas
    const cName = { x: 48, w: 250 };
    const cCant = { x: 330, w: 48 };
    const cUsd = { x: 384, w: 88 };
    const cBs = { x: 476, w: 96 };
    const bottom = () => doc.page.height - doc.page.margins.bottom;

    const drawColHeader = () => {
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');
      doc.text('Categoria', cName.x, y, { width: cName.w });
      doc.text('Cant.', cCant.x, y, { width: cCant.w, align: 'right' });
      doc.text('Total USD', cUsd.x, y, { width: cUsd.w, align: 'right' });
      doc.text('Total Bs', cBs.x, y, { width: cBs.w, align: 'right' });
      doc.fillColor('#000');
      y += 12;
      doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#e2e8f0');
      y += 4;
    };

    if (expenses.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#64748b')
        .text('No hay gastos en el periodo seleccionado.', 40, y + 10, { width: RIGHT - 40, align: 'center' });
      doc.fillColor('#000');
    }

    for (const g of ordered) {
      if (y > bottom() - 70) { doc.addPage(); y = 40; }
      // Barra del tipo (Fijo / Extraordinario)
      doc.rect(40, y - 2, RIGHT - 40, 17).fill(g.type === 'FIXED' ? '#1e3a5f' : '#5b3a1e');
      doc.fillColor('#fff').fontSize(9.5).font('Helvetica-Bold');
      doc.text(`${EXPENSE_TYPE_LABELS[g.type]}  (${g.cats.size} categorias · ${g.count} gastos)`, 46, y + 1.5, { width: RIGHT - 200, lineBreak: false });
      doc.text(`$${this.fmt(g.totalUsd)}`, cUsd.x, y + 1.5, { width: cUsd.w + cBs.w - 4, align: 'right', lineBreak: false });
      doc.fillColor('#000');
      y += 20;

      drawColHeader();

      const cats = Array.from(g.cats.values()).sort((a, b) => b.totalUsd - a.totalUsd);
      doc.fontSize(8).font('Helvetica');
      for (const c of cats) {
        if (y + 13 > bottom()) { doc.addPage(); y = 40; drawColHeader(); doc.fontSize(8).font('Helvetica'); }
        doc.fillColor('#1e293b');
        doc.text(c.name, cName.x, y, { width: cName.w, lineBreak: false, ellipsis: true });
        doc.text(String(c.count), cCant.x, y, { width: cCant.w, align: 'right' });
        doc.text(`$${this.fmt(c.totalUsd)}`, cUsd.x, y, { width: cUsd.w, align: 'right' });
        doc.text(`Bs ${this.fmt(c.totalBs)}`, cBs.x, y, { width: cBs.w, align: 'right' });
        doc.fillColor('#000');
        y += 13;
      }

      // Subtotal del tipo
      if (y + 16 > bottom()) { doc.addPage(); y = 40; }
      doc.rect(40, y - 1, RIGHT - 40, 15).fill('#e2e8f0');
      doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold');
      doc.text(`Subtotal ${EXPENSE_TYPE_LABELS[g.type]}`, cName.x, y + 1.5, { width: cName.w, lineBreak: false });
      doc.text(String(g.count), cCant.x, y + 1.5, { width: cCant.w, align: 'right' });
      doc.text(`$${this.fmt(g.totalUsd)}`, cUsd.x, y + 1.5, { width: cUsd.w, align: 'right' });
      doc.text(`Bs ${this.fmt(g.totalBs)}`, cBs.x, y + 1.5, { width: cBs.w, align: 'right' });
      doc.fillColor('#000');
      y += 22;
    }

    // Total general
    if (expenses.length > 0) {
      if (y + 20 > bottom()) { doc.addPage(); y = 40; }
      doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#94a3b8');
      y += 4;
      doc.rect(40, y - 2, RIGHT - 40, 17).fill('#0f172a');
      doc.fillColor('#fff').fontSize(9.5).font('Helvetica-Bold');
      doc.text(`TOTAL GENERAL  (${expenses.length} gastos)`, 46, y + 1.5, { width: 260, lineBreak: false });
      doc.text(`$${this.fmt(grandUsd)}`, cUsd.x, y + 1.5, { width: cUsd.w, align: 'right' });
      doc.text(`Bs ${this.fmt(grandBs)}`, cBs.x, y + 1.5, { width: cBs.w, align: 'right' });
      doc.fillColor('#000');
    }

    // Paginacion
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const oldBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fontSize(8).font('Helvetica').fillColor('#64748b')
        .text(`Pagina ${i + 1} de ${range.count}`, 40, doc.page.height - 28, { align: 'center', width: doc.page.width - 80 });
      doc.fillColor('#000');
      doc.page.margins.bottom = oldBottom;
    }

    doc.end();
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
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
