import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CashRegistersService } from './cash-registers.service';
import * as PDFDocument from 'pdfkit';

// Columnas del reporte GLOBAL de movimientos (A4 horizontal, area util 40..802)
const G_PAY_COLS = [
  { label: 'Fecha / Hora', x: 40, width: 72 },
  { label: 'Caja', x: 114, width: 70 },
  { label: 'Cajero', x: 186, width: 88 },
  { label: 'Factura', x: 276, width: 78 },
  { label: 'Cliente', x: 356, width: 142 },
  { label: 'Referencia', x: 500, width: 120 },
  { label: 'USD', x: 622, width: 78, align: 'right' },
  { label: 'Bs', x: 702, width: 100, align: 'right' },
];

const G_MOV_COLS = [
  { label: 'Fecha / Hora', x: 40, width: 72 },
  { label: 'Caja', x: 114, width: 70 },
  { label: 'Cajero', x: 186, width: 88 },
  { label: 'Tipo', x: 276, width: 60 },
  { label: 'Concepto', x: 338, width: 160 },
  { label: 'Usuario', x: 500, width: 120 },
  { label: 'USD', x: 622, width: 78, align: 'right' },
  { label: 'Bs', x: 702, width: 100, align: 'right' },
];

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly cashService: CashRegistersService,
  ) {}

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

  private drawTableHeader(doc: any, y: number, columns: any[], rightX = 555): number {
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');
    for (const col of columns) {
      const opts: any = { width: col.width };
      if ((col as any).align === 'right') opts.align = 'right';
      doc.text(col.label, col.x, y, opts);
    }
    doc.fillColor('#000');
    y += 13;
    doc.moveTo(40, y).lineTo(rightX, y).stroke('#e2e8f0');
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
      // Incluye devueltas: el pago original entro a la caja (ver cash-registers.service).
      status: { in: ['PAID', 'PARTIAL_RETURN', 'RETURNED'] },
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

  private shortDateTime(d: Date): string {
    return new Date(d).toLocaleString('es-VE', {
      timeZone: 'America/Caracas', day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }

  /**
   * Reporte GLOBAL de movimientos de caja (cruza cajas/sesiones), agrupado por
   * metodo de pago, respetando los mismos filtros que la pantalla.
   */
  async generateGlobalReport(filters: {
    cashRegisterId?: string;
    userId?: string;
    from?: string;
    to?: string;
    methodIds?: string[];
  }): Promise<Buffer> {
    const { rows, summary, meta } = await this.cashService.getGlobalMovementsData(filters);

    const config = await this.prisma.companyConfig.findFirst();
    const company = config?.companyName || 'Trinity ERP';

    const RIGHT = 802;
    const payments = rows.filter((r) => r.kind === 'PAYMENT');
    const movements = rows.filter((r) => r.kind === 'MOVEMENT');

    // Agrupar pagos por metodo
    const groupsMap = new Map<string, any>();
    for (const p of payments) {
      if (!groupsMap.has(p.methodName)) {
        groupsMap.set(p.methodName, { methodName: p.methodName, rows: [] as any[], totalUsd: 0, totalBs: 0 });
      }
      const g = groupsMap.get(p.methodName);
      g.rows.push(p);
      g.totalUsd += p.amountUsd;
      g.totalBs += p.amountBs;
    }
    const groups = Array.from(groupsMap.values()).sort((a, b) => a.methodName.localeCompare(b.methodName));

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 40, bottom: 40, left: 40, right: 40 } });

    // Encabezado
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text('Movimientos de caja', 40, 60);
    doc.fontSize(9).font('Helvetica').fillColor('#334155');
    const period =
      meta.from || meta.to
        ? `${meta.from || '...'}  a  ${meta.to || '...'}`
        : 'Todas las fechas';
    const filtros: string[] = [`Periodo: ${period}`];
    filtros.push(`Caja: ${meta.registerName || 'Todas'}`);
    filtros.push(`Cajero: ${meta.cashierName || 'Todos'}`);
    if (meta.methodNames && meta.methodNames.length) {
      filtros.push(`Metodos: ${meta.methodNames.join(', ')}`);
    }
    doc.text(filtros.join('     '), 40, 80, { width: RIGHT - 40 });
    doc.text(`Generado: ${this.dateTime(new Date())}`, 40, 94);
    doc.fillColor('#000');
    doc.moveTo(40, 110).lineTo(RIGHT, 110).stroke('#94a3b8');
    let y = 118;

    // Pagos por metodo
    doc.fontSize(10).font('Helvetica-Bold').text('PAGOS POR METODO', 40, y);
    y += 18;

    if (groups.length === 0) {
      doc.fontSize(9).font('Helvetica').fillColor('#64748b').text('No hay pagos con los filtros aplicados.', 40, y);
      doc.fillColor('#000');
      y += 16;
    }

    for (const g of groups) {
      y = this.checkPage(doc, y, 60);
      doc.rect(40, y - 2, RIGHT - 40, 16).fill('#f1f5f9');
      doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold');
      doc.text(`${g.methodName}  (${g.rows.length})`, 46, y + 1, { width: 400, lineBreak: false });
      doc.text(`$${this.fmt(g.totalUsd)}   /   Bs ${this.fmt(g.totalBs)}`, 402, y + 1, { width: RIGHT - 402 - 6, align: 'right' });
      doc.fillColor('#000');
      y += 20;

      y = this.drawTableHeader(doc, y, G_PAY_COLS, RIGHT);
      for (const p of g.rows) {
        y = this.checkPage(doc, y, 30);
        if (y === 40) y = this.drawTableHeader(doc, y, G_PAY_COLS, RIGHT);
        y = this.drawRow(doc, y, G_PAY_COLS, [
          this.shortDateTime(p.date),
          p.cashRegisterName || '—',
          p.cashierName || '—',
          p.invoiceNumber || 'S/N',
          p.customerName || 'Sin cliente',
          p.reference || '—',
          `$${this.fmt(p.amountUsd)}`,
          this.fmt(p.amountBs),
        ]);
      }
      doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#cbd5e1');
      y += 3;
      y = this.drawRow(doc, y, G_PAY_COLS, ['', '', '', '', '', 'Subtotal', `$${this.fmt(g.totalUsd)}`, this.fmt(g.totalBs)], true);
      y += 8;
    }

    if (groups.length > 0) {
      y = this.checkPage(doc, y, 30);
      doc.rect(40, y - 2, RIGHT - 40, 16).fill('#0f172a');
      doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
      doc.text(`TOTAL PAGOS  (${summary.paymentCount})`, 46, y + 1, { width: 300, lineBreak: false });
      doc.text(`$${this.fmt(summary.paymentUsd)}   /   Bs ${this.fmt(summary.paymentBs)}`, 402, y + 1, { width: RIGHT - 402 - 6, align: 'right' });
      doc.fillColor('#000');
      y += 26;
    }

    // Movimientos manuales (solo si no se filtro por metodo)
    if (!(filters.methodIds && filters.methodIds.length)) {
      y = this.checkPage(doc, y, 70);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('MOVIMIENTOS MANUALES DE CAJA (ingresos / egresos / gastos / anticipos)', 40, y);
      y += 18;

      if (movements.length === 0) {
        doc.fontSize(9).font('Helvetica').fillColor('#64748b').text('Sin movimientos manuales con los filtros aplicados.', 40, y);
        doc.fillColor('#000');
        y += 16;
      } else {
        y = this.drawTableHeader(doc, y, G_MOV_COLS, RIGHT);
        for (const m of movements) {
          y = this.checkPage(doc, y, 30);
          if (y === 40) y = this.drawTableHeader(doc, y, G_MOV_COLS, RIGHT);
          const isIncome = m.movementType === 'INCOME';
          y = this.drawRow(doc, y, G_MOV_COLS, [
            this.shortDateTime(m.date),
            m.cashRegisterName || '—',
            m.cashierName || '—',
            isIncome ? 'Ingreso' : 'Egreso',
            m.concept || '—',
            m.userName || '',
            `${isIncome ? '' : '-'}$${this.fmt(m.amountUsd)}`,
            `${isIncome ? '' : '-'}${this.fmt(m.amountBs)}`,
          ]);
        }
        doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#cbd5e1');
        y += 3;
        y = this.drawRow(doc, y, G_MOV_COLS, ['', '', '', '', '', 'Ingresos', `$${this.fmt(summary.incomeUsd)}`, this.fmt(summary.incomeBs)], true);
        y = this.drawRow(doc, y, G_MOV_COLS, ['', '', '', '', '', 'Egresos', `-$${this.fmt(summary.expenseUsd)}`, this.fmt(summary.expenseBs)], true);
      }
    }

    return this.toBuffer(doc);
  }

  /**
   * Reporte RESUMIDO de movimientos de caja: NO lista cada movimiento, solo
   * totaliza cobros por metodo de pago (+ por caja) y el neto de los movimientos
   * manuales. Respeta los mismos filtros que la pantalla. Carta vertical.
   */
  async generateGlobalSummaryReport(filters: {
    cashRegisterId?: string;
    userId?: string;
    from?: string;
    to?: string;
    methodIds?: string[];
  }): Promise<Buffer> {
    const { rows, summary, meta } = await this.cashService.getGlobalMovementsData(filters);

    const config = await this.prisma.companyConfig.findFirst();
    const company = config?.companyName || 'Trinity ERP';

    const RIGHT = 555;
    const payments = rows.filter((r) => r.kind === 'PAYMENT');

    // Columnas del resumen (carta vertical, area util 40..555)
    const SUM_COLS = [
      { label: 'Metodo de pago', x: 40, width: 250 },
      { label: 'Movs', x: 300, width: 50, align: 'right' },
      { label: 'Total USD', x: 356, width: 95, align: 'right' },
      { label: 'Total Bs', x: 455, width: 100, align: 'right' },
    ];
    const CAJA_COLS = [
      { label: 'Caja', x: 40, width: 250 },
      { label: 'Movs', x: 300, width: 50, align: 'right' },
      { label: 'Total USD', x: 356, width: 95, align: 'right' },
      { label: 'Total Bs', x: 455, width: 100, align: 'right' },
    ];

    // Agrupar cobros por metodo (mayor monto primero)
    const byMethod = new Map<string, { name: string; count: number; usd: number; bs: number }>();
    for (const p of payments) {
      const k = p.methodName || '—';
      const g = byMethod.get(k) || { name: k, count: 0, usd: 0, bs: 0 };
      g.count++; g.usd += p.amountUsd; g.bs += p.amountBs;
      byMethod.set(k, g);
    }
    const methodGroups = Array.from(byMethod.values()).sort((a, b) => b.usd - a.usd);

    // Agrupar cobros por caja
    const byCaja = new Map<string, { name: string; count: number; usd: number; bs: number }>();
    for (const p of payments) {
      const k = p.cashRegisterName || '—';
      const g = byCaja.get(k) || { name: k, count: 0, usd: 0, bs: 0 };
      g.count++; g.usd += p.amountUsd; g.bs += p.amountBs;
      byCaja.set(k, g);
    }
    const cajaGroups = Array.from(byCaja.values()).sort((a, b) => b.usd - a.usd);

    const doc = new PDFDocument({ size: 'LETTER', layout: 'portrait', margins: { top: 40, bottom: 40, left: 40, right: 40 }, bufferPages: true });

    // Encabezado
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text('Resumen de movimientos de caja', 40, 60);
    doc.fontSize(9).font('Helvetica').fillColor('#334155');
    const period = meta.from || meta.to ? `${meta.from || '...'}  a  ${meta.to || '...'}` : 'Todas las fechas';
    const filtros: string[] = [`Periodo: ${period}`, `Caja: ${meta.registerName || 'Todas'}`, `Cajero: ${meta.cashierName || 'Todos'}`];
    if (meta.methodNames && meta.methodNames.length) filtros.push(`Metodos: ${meta.methodNames.join(', ')}`);
    doc.text(filtros.join('     '), 40, 80, { width: RIGHT - 40 });
    doc.text(`Generado: ${this.dateTime(new Date())}`, 40, 94);
    doc.fillColor('#000');
    doc.moveTo(40, 110).lineTo(RIGHT, 110).stroke('#94a3b8');
    let y = 118;

    // ═══ Cobros por metodo de pago ═══
    doc.fontSize(10).font('Helvetica-Bold').text('COBROS POR METODO DE PAGO', 40, y);
    y += 18;
    if (methodGroups.length === 0) {
      doc.fontSize(9).font('Helvetica').fillColor('#64748b').text('No hay cobros con los filtros aplicados.', 40, y);
      doc.fillColor('#000');
      y += 16;
    } else {
      y = this.drawTableHeader(doc, y, SUM_COLS, RIGHT);
      for (const g of methodGroups) {
        y = this.checkPage(doc, y, 24);
        if (y === 40) y = this.drawTableHeader(doc, y, SUM_COLS, RIGHT);
        y = this.drawRow(doc, y, SUM_COLS, [g.name, String(g.count), `$${this.fmt(g.usd)}`, this.fmt(g.bs)]);
      }
      // Total cobros (barra oscura)
      y += 2;
      doc.rect(40, y - 2, RIGHT - 40, 16).fill('#0f172a');
      doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
      doc.text(`TOTAL COBROS  (${summary.paymentCount})`, 46, y + 1, { width: 250, lineBreak: false });
      doc.text(`$${this.fmt(summary.paymentUsd)}   /   Bs ${this.fmt(summary.paymentBs)}`, 300, y + 1, { width: RIGHT - 300 - 6, align: 'right' });
      doc.fillColor('#000');
      y += 26;
    }

    // ═══ Movimientos manuales (solo si no se filtro por metodo) ═══
    if (!(filters.methodIds && filters.methodIds.length)) {
      y = this.checkPage(doc, y, 70);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('MOVIMIENTOS MANUALES DE CAJA', 40, y);
      y += 18;
      if (summary.movementCount === 0) {
        doc.fontSize(9).font('Helvetica').fillColor('#64748b').text('Sin movimientos manuales con los filtros aplicados.', 40, y);
        doc.fillColor('#000');
        y += 16;
      } else {
        y = this.drawTableHeader(doc, y, SUM_COLS, RIGHT);
        const netoUsd = summary.incomeUsd - summary.expenseUsd;
        const netoBs = summary.incomeBs - summary.expenseBs;
        y = this.drawRow(doc, y, SUM_COLS, [`Ingresos (${summary.movementCount} movs)`, '', `$${this.fmt(summary.incomeUsd)}`, this.fmt(summary.incomeBs)]);
        y = this.drawRow(doc, y, SUM_COLS, ['Egresos', '', `-$${this.fmt(summary.expenseUsd)}`, `-${this.fmt(summary.expenseBs)}`]);
        doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#cbd5e1');
        y += 3;
        y = this.drawRow(doc, y, SUM_COLS, ['Neto manual', '', `$${this.fmt(netoUsd)}`, this.fmt(netoBs)], true);
        y += 12;
      }
    }

    // ═══ Cobros por caja (solo si hay mas de una) ═══
    if (cajaGroups.length > 1) {
      y = this.checkPage(doc, y, 60);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('COBROS POR CAJA', 40, y);
      y += 18;
      y = this.drawTableHeader(doc, y, CAJA_COLS, RIGHT);
      for (const g of cajaGroups) {
        y = this.checkPage(doc, y, 24);
        if (y === 40) y = this.drawTableHeader(doc, y, CAJA_COLS, RIGHT);
        y = this.drawRow(doc, y, CAJA_COLS, [g.name, String(g.count), `$${this.fmt(g.usd)}`, this.fmt(g.bs)]);
      }
    }

    // Paginacion al pie
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

    return this.toBuffer(doc);
  }
}
