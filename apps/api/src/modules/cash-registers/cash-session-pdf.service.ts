import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

// Columnas de la tabla de pagos (A4 vertical, area util 40..555)
const PAY_COLS = [
  { label: 'Hora', x: 40, width: 45 },
  { label: 'Factura', x: 88, width: 78 },
  { label: 'Cliente', x: 168, width: 150 },
  { label: 'Referencia', x: 320, width: 100 },
  { label: 'USD', x: 422, width: 58, align: 'right' },
  { label: 'Bs', x: 482, width: 73, align: 'right' },
];

const MOV_COLS = [
  { label: 'Hora', x: 40, width: 45 },
  { label: 'Tipo', x: 88, width: 58 },
  { label: 'Concepto', x: 148, width: 170 },
  { label: 'Usuario', x: 320, width: 100 },
  { label: 'USD', x: 422, width: 58, align: 'right' },
  { label: 'Bs', x: 482, width: 73, align: 'right' },
];

const VUELTO_COLS = [
  { label: 'Factura', x: 40, width: 120 },
  { label: 'Metodo de vuelto', x: 170, width: 250 },
  { label: 'Bs', x: 482, width: 73, align: 'right' },
];

@Injectable()
export class CashSessionPdfService {
  constructor(private readonly prisma: PrismaService) {}

  private fmt(n: number): string {
    return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private time(d: Date): string {
    return new Date(d).toLocaleTimeString('es-VE', {
      timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit',
    });
  }

  private dateTime(d: Date): string {
    return new Date(d).toLocaleString('es-VE', {
      timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  private drawTableHeader(doc: any, y: number, columns: any[]): number {
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');
    for (const col of columns) {
      const opts: any = { width: col.width };
      if ((col as any).align === 'right') opts.align = 'right';
      doc.text(col.label, col.x, y, opts);
    }
    doc.fillColor('#000');
    y += 13;
    doc.moveTo(40, y).lineTo(555, y).stroke('#e2e8f0');
    return y + 4;
  }

  private drawRow(doc: any, y: number, columns: any[], values: string[], bold = false): number {
    doc.fontSize(8).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#1e293b');
    for (let i = 0; i < columns.length; i++) {
      const opts: any = { width: columns[i].width, lineBreak: false, ellipsis: true };
      if ((columns[i] as any).align === 'right') opts.align = 'right';
      doc.text(values[i] || '', columns[i].x, y, opts);
    }
    doc.fillColor('#000');
    return y + 13;
  }

  private checkPage(doc: any, y: number, needed = 40): number {
    if (y > doc.page.height - doc.page.margins.bottom - needed) {
      doc.addPage();
      return 40;
    }
    return y;
  }

  private toBuffer(doc: any): Promise<Buffer> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.end();
    });
  }

  async generate(sessionId: string): Promise<Buffer> {
    const data = await this.prisma.cashSession.findUnique({
      where: { id: sessionId },
      include: {
        cashRegister: { select: { name: true, code: true } },
        openedBy: { select: { name: true } },
        closedBy: { select: { name: true } },
      },
    });
    if (!data) throw new Error('Sesion no encontrada');

    const config = await this.prisma.companyConfig.findFirst();
    const company = config?.companyName || 'Trinity ERP';

    // Pagos de la sesion (mismo criterio que el arqueo: por paidAt dentro de la ventana)
    const invoiceWhere: any = {
      cashRegisterId: data.cashRegisterId,
      paidAt: { gte: data.openedAt },
      status: 'PAID',
    };
    if (data.closedAt) invoiceWhere.paidAt.lte = data.closedAt;
    const invoices = await this.prisma.invoice.findMany({ where: invoiceWhere, select: { id: true } });
    const invoiceIds = invoices.map((i) => i.id);

    const payments = await this.prisma.payment.findMany({
      where: { invoiceId: { in: invoiceIds } },
      include: {
        method: { select: { name: true } },
        changeMethod: { select: { name: true } },
        invoice: { select: { number: true, customer: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Vueltos / cambios entregados (egresos)
    const vueltos = payments
      .filter((p) => p.changeAmountBs > 0)
      .map((p) => ({
        invoiceNumber: p.invoice?.number || 'S/N',
        methodName: p.changeMethod?.name || 'Efectivo Bs',
        changeBs: p.changeAmountBs,
      }));
    const totalChangeBs = vueltos.reduce((s, v) => s + v.changeBs, 0);

    // Agrupar por metodo
    const groupsMap = new Map<string, any>();
    for (const p of payments) {
      const name = p.method?.name || p.methodId;
      if (!groupsMap.has(name)) {
        groupsMap.set(name, { methodName: name, rows: [] as any[], totalUsd: 0, totalBs: 0 });
      }
      const g = groupsMap.get(name);
      g.rows.push(p);
      g.totalUsd += p.amountUsd;
      g.totalBs += p.amountBs;
    }
    const groups = Array.from(groupsMap.values()).sort((a, b) => a.methodName.localeCompare(b.methodName));
    const grandUsd = payments.reduce((s, p) => s + p.amountUsd, 0);
    const grandBs = payments.reduce((s, p) => s + p.amountBs, 0);

    // Movimientos de caja (ingresos/egresos/gastos manuales)
    const movements = await this.prisma.cashMovement.findMany({
      where: { cashSessionId: sessionId },
      include: {
        createdBy: { select: { name: true } },
        expense: { select: { description: true, category: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // ── Render ─────────────────────────────────────────────
    const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margins: { top: 40, bottom: 40, left: 40, right: 40 } });

    // Encabezado
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text('Cierre de caja — Movimientos detallados', 40, 60);
    doc.fontSize(9).font('Helvetica').fillColor('#334155');
    const period = data.closedAt
      ? `${this.dateTime(data.openedAt)}  a  ${this.dateTime(data.closedAt)}`
      : `${this.dateTime(data.openedAt)}  (sesion abierta)`;
    doc.text(`Caja: ${data.cashRegister?.name || ''} (${data.cashRegister?.code || ''})`, 40, 78);
    doc.text(`Periodo: ${period}`, 40, 90);
    doc.text(`Abrio: ${data.openedBy?.name || '-'}${data.closedBy ? `   Cerro: ${data.closedBy.name}` : ''}`, 40, 102);
    doc.text(`Generado: ${this.dateTime(new Date())}`, 40, 114);
    doc.fillColor('#000');
    doc.moveTo(40, 130).lineTo(555, 130).stroke('#94a3b8');
    let y = 138;

    // Seccion de pagos por metodo
    doc.fontSize(10).font('Helvetica-Bold').text('PAGOS POR METODO', 40, y);
    y += 18;

    if (groups.length === 0) {
      doc.fontSize(9).font('Helvetica').fillColor('#64748b').text('No hay pagos en esta sesion.', 40, y);
      doc.fillColor('#000');
      y += 16;
    }

    for (const g of groups) {
      y = this.checkPage(doc, y, 60);
      // Barra del metodo
      doc.rect(40, y - 2, 515, 16).fill('#f1f5f9');
      doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold');
      doc.text(`${g.methodName}  (${g.rows.length})`, 46, y + 1, { width: 300, lineBreak: false });
      doc.text(`$${this.fmt(g.totalUsd)}   /   Bs ${this.fmt(g.totalBs)}`, 255, y + 1, { width: 300, align: 'right' });
      doc.fillColor('#000');
      y += 20;

      y = this.drawTableHeader(doc, y, PAY_COLS);
      for (const p of g.rows) {
        y = this.checkPage(doc, y, 30);
        if (y === 40) y = this.drawTableHeader(doc, y, PAY_COLS);
        y = this.drawRow(doc, y, PAY_COLS, [
          this.time(p.createdAt),
          p.invoice?.number || 'S/N',
          p.invoice?.customer?.name || 'Sin cliente',
          p.reference || '—',
          `$${this.fmt(p.amountUsd)}`,
          this.fmt(p.amountBs),
        ]);
      }
      // Subtotal del metodo
      doc.moveTo(40, y).lineTo(555, y).stroke('#cbd5e1');
      y += 3;
      y = this.drawRow(doc, y, PAY_COLS, ['', '', '', 'Subtotal', `$${this.fmt(g.totalUsd)}`, this.fmt(g.totalBs)], true);
      y += 8;
    }

    // Total general de pagos
    if (groups.length > 0) {
      y = this.checkPage(doc, y, 30);
      doc.rect(40, y - 2, 515, 16).fill('#0f172a');
      doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
      doc.text('TOTAL PAGOS', 46, y + 1, { width: 200, lineBreak: false });
      doc.text(`$${this.fmt(grandUsd)}   /   Bs ${this.fmt(grandBs)}`, 255, y + 1, { width: 300, align: 'right' });
      doc.fillColor('#000');
      y += 26;
    }

    // Seccion de vueltos / cambios entregados
    if (vueltos.length > 0) {
      y = this.checkPage(doc, y, 60);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('VUELTOS / CAMBIOS ENTREGADOS', 40, y);
      y += 18;
      y = this.drawTableHeader(doc, y, VUELTO_COLS);
      for (const v of vueltos) {
        y = this.checkPage(doc, y, 30);
        if (y === 40) y = this.drawTableHeader(doc, y, VUELTO_COLS);
        y = this.drawRow(doc, y, VUELTO_COLS, [v.invoiceNumber, v.methodName, `-${this.fmt(v.changeBs)}`]);
      }
      doc.moveTo(40, y).lineTo(555, y).stroke('#cbd5e1');
      y += 3;
      y = this.drawRow(doc, y, VUELTO_COLS, ['', 'Total vueltos', `-${this.fmt(totalChangeBs)}`], true);
      y += 12;
    }

    // Seccion de movimientos de caja
    y = this.checkPage(doc, y, 70);
    doc.fontSize(10).font('Helvetica-Bold').text('MOVIMIENTOS DE CAJA (ingresos / egresos / gastos)', 40, y);
    y += 18;

    if (movements.length === 0) {
      doc.fontSize(9).font('Helvetica').fillColor('#64748b').text('Sin movimientos manuales de caja en esta sesion.', 40, y);
      doc.fillColor('#000');
      y += 16;
    } else {
      y = this.drawTableHeader(doc, y, MOV_COLS);
      let inUsd = 0, inBs = 0, outUsd = 0, outBs = 0;
      for (const m of movements) {
        y = this.checkPage(doc, y, 30);
        if (y === 40) y = this.drawTableHeader(doc, y, MOV_COLS);
        const isIncome = m.type === 'INCOME';
        if (isIncome) { inUsd += m.amountUsd; inBs += m.amountBs; } else { outUsd += m.amountUsd; outBs += m.amountBs; }
        const concepto = m.reason || m.expense?.description || m.expense?.category?.name || '—';
        const usd = `${isIncome ? '' : '-'}$${this.fmt(m.amountUsd)}`;
        const bs = `${isIncome ? '' : '-'}${this.fmt(m.amountBs)}`;
        y = this.drawRow(doc, y, MOV_COLS, [
          this.time(m.createdAt),
          isIncome ? 'Ingreso' : 'Egreso',
          concepto,
          m.createdBy?.name || '',
          usd,
          bs,
        ]);
      }
      doc.moveTo(40, y).lineTo(555, y).stroke('#cbd5e1');
      y += 3;
      y = this.drawRow(doc, y, MOV_COLS, ['', '', '', 'Ingresos', `$${this.fmt(inUsd)}`, this.fmt(inBs)], true);
      y = this.drawRow(doc, y, MOV_COLS, ['', '', '', 'Egresos', `-$${this.fmt(outUsd)}`, this.fmt(outBs)], true);
    }

    return this.toBuffer(doc);
  }
}
