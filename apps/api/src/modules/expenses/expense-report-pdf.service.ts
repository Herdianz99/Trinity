import { Injectable } from '@nestjs/common';
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

  // Reporte DETALLADO agrupado por categoria: por cada categoria una banda-encabezado con
  // el nombre y el total, y debajo TODOS sus gastos (fecha, descripcion, ref, USD, Bs).
  // Respeta el rango de fechas (sobre Expense.date, anclado a Caracas como el dashboard) y el
  // filtro de categoria. Categorias ordenadas de mayor a menor gasto.
  async generateReport(filters: {
    from?: string;
    to?: string;
    categoryId?: string;
  }): Promise<Buffer> {
    const where: any = {};
    if (filters.from || filters.to) {
      where.date = {};
      if (filters.from) where.date.gte = caracasDayStart(filters.from);
      if (filters.to) where.date.lte = caracasDayEnd(filters.to);
    }
    if (filters.categoryId) where.categoryId = filters.categoryId;

    const expenses = await this.prisma.expense.findMany({
      where,
      include: { category: { select: { name: true } } },
      orderBy: { date: 'asc' },
    });
    const config = await this.prisma.companyConfig.findFirst();
    const company = config?.companyName || 'Trinity ERP';

    // Agrupar por categoria, conservando los gastos de cada una.
    type ExpRow = (typeof expenses)[number];
    type Cat = { name: string; count: number; totalUsd: number; totalBs: number; items: ExpRow[] };
    const catMap = new Map<string, Cat>();
    let grandUsd = 0, grandBs = 0;
    for (const exp of expenses) {
      if (!catMap.has(exp.categoryId)) {
        catMap.set(exp.categoryId, { name: exp.category.name, count: 0, totalUsd: 0, totalBs: 0, items: [] });
      }
      const c = catMap.get(exp.categoryId)!;
      c.count += 1; c.totalUsd += exp.amountUsd; c.totalBs += exp.amountBs; c.items.push(exp);
      grandUsd += exp.amountUsd; grandBs += exp.amountBs;
    }
    const cats = Array.from(catMap.values()).sort((a, b) => b.totalUsd - a.totalUsd);

    const fromLabel = filters.from ? new Date(caracasDayStart(filters.from)).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }) : '—';
    const toLabel = filters.to ? new Date(caracasDayStart(filters.to)).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }) : '—';

    const RIGHT = 572;
    const doc = new PDFDocument({ size: 'LETTER', layout: 'portrait', margins: { top: 40, bottom: 40, left: 40, right: 40 }, bufferPages: true });

    // Columnas del detalle
    const cDate = { x: 46, w: 60 };
    const cDesc = { x: 110, w: 244 };
    const cRef = { x: 358, w: 74 };
    const cUsd = { x: 436, w: 66 };
    const cBs = { x: 506, w: 66 };
    const bottom = () => doc.page.height - doc.page.margins.bottom;

    // Encabezado
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text('Reporte de Gastos por Categoria', 40, 60);
    doc.fontSize(9).font('Helvetica').fillColor('#334155');
    doc.text(`Periodo: ${fromLabel}  a  ${toLabel}`, 40, 80);
    doc.text(`Generado: ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })}   |   ${expenses.length} gasto${expenses.length !== 1 ? 's' : ''} · ${cats.length} categoria${cats.length !== 1 ? 's' : ''}`, 40, 94);
    doc.fillColor('#000');
    doc.moveTo(40, 110).lineTo(RIGHT, 110).stroke('#94a3b8');
    let y = 118;

    const drawColHeader = () => {
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');
      doc.text('Fecha', cDate.x, y, { width: cDate.w });
      doc.text('Descripcion', cDesc.x, y, { width: cDesc.w });
      doc.text('Ref.', cRef.x, y, { width: cRef.w });
      doc.text('USD', cUsd.x, y, { width: cUsd.w, align: 'right' });
      doc.text('Bs', cBs.x, y, { width: cBs.w, align: 'right' });
      doc.fillColor('#000');
      y += 12;
      doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#e2e8f0');
      y += 4;
    };

    const drawCatBand = (c: Cat) => {
      doc.rect(40, y - 2, RIGHT - 40, 17).fill('#1e3a5f');
      doc.fillColor('#fff').fontSize(9.5).font('Helvetica-Bold');
      doc.text(`${c.name}  (${c.count} gasto${c.count !== 1 ? 's' : ''})`, 46, y + 1.5, { width: 300, lineBreak: false, ellipsis: true });
      doc.text(`$${this.fmt(c.totalUsd)}`, cUsd.x, y + 1.5, { width: cUsd.w, align: 'right', lineBreak: false });
      doc.text(`Bs ${this.fmt(c.totalBs)}`, cBs.x, y + 1.5, { width: cBs.w, align: 'right', lineBreak: false });
      doc.fillColor('#000');
      y += 20;
    };

    if (expenses.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#64748b')
        .text('No hay gastos en el periodo seleccionado.', 40, y + 10, { width: RIGHT - 40, align: 'center' });
      doc.fillColor('#000');
    }

    for (const c of cats) {
      // Evitar que la banda de categoria quede sola al pie de la pagina.
      if (y > bottom() - 60) { doc.addPage(); y = 40; }
      drawCatBand(c);
      drawColHeader();
      doc.fontSize(8).font('Helvetica');
      let stripe = false;
      for (const exp of c.items) {
        const descText = exp.description || '';
        const descH = doc.heightOfString(descText, { width: cDesc.w });
        const rowH = Math.max(13, descH) + 2;
        if (y + rowH > bottom()) { doc.addPage(); y = 40; drawColHeader(); doc.fontSize(8).font('Helvetica'); stripe = false; }
        if (stripe) { doc.save(); doc.rect(40, y - 1, RIGHT - 40, rowH).fill('#f8fafc'); doc.restore(); doc.fillColor('#000'); }
        stripe = !stripe;
        const dateStr = new Date(exp.date).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' });
        doc.fillColor('#1e293b');
        doc.text(dateStr, cDate.x, y, { width: cDate.w, lineBreak: false });
        doc.text(descText, cDesc.x, y, { width: cDesc.w });
        doc.text(exp.reference || '-', cRef.x, y, { width: cRef.w, lineBreak: false, ellipsis: true });
        doc.text(`$${this.fmt(exp.amountUsd)}`, cUsd.x, y, { width: cUsd.w, align: 'right', lineBreak: false });
        doc.text(`Bs ${this.fmt(exp.amountBs)}`, cBs.x, y, { width: cBs.w, align: 'right', lineBreak: false });
        doc.fillColor('#000');
        y += rowH;
      }
      y += 8; // espacio entre categorias
    }

    // Total general
    if (expenses.length > 0) {
      if (y + 20 > bottom()) { doc.addPage(); y = 40; }
      doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#94a3b8');
      y += 4;
      doc.rect(40, y - 2, RIGHT - 40, 17).fill('#0f172a');
      doc.fillColor('#fff').fontSize(9.5).font('Helvetica-Bold');
      doc.text(`TOTAL GENERAL  (${expenses.length} gasto${expenses.length !== 1 ? 's' : ''})`, 46, y + 1.5, { width: 260, lineBreak: false });
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
}
