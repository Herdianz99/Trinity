import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

@Injectable()
export class ReportsPdfService {
  constructor(private readonly prisma: PrismaService) {}

  private fmt(n: number): string {
    return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private async getCompanyName(): Promise<string> {
    const config = await this.prisma.companyConfig.findFirst();
    return config?.companyName || 'Trinity ERP';
  }

  private createDoc(landscape = true): typeof PDFDocument {
    return new PDFDocument({
      size: 'A4',
      layout: landscape ? 'landscape' : 'portrait',
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
    });
  }

  private drawHeader(doc: any, title: string, company: string, period: string) {
    doc.fontSize(16).font('Helvetica-Bold').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text(title, 40, 60);
    doc.fontSize(9).font('Helvetica').text(`Periodo: ${period}`, 40, 76);
    doc.text(`Generado: ${new Date().toLocaleDateString('es-VE')}`, 40, 88);
    doc.moveTo(40, 104).lineTo(doc.page.width - 40, 104).stroke('#94a3b8');
    return 114;
  }

  private drawTableHeader(doc: any, y: number, columns: { label: string; x: number; width: number; align?: string }[]) {
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');
    for (const col of columns) {
      const opts: any = { width: col.width };
      if (col.align === 'right') opts.align = 'right';
      doc.text(col.label, col.x, y, opts);
    }
    doc.fillColor('#000');
    y += 14;
    doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke('#e2e8f0');
    return y + 4;
  }

  private drawTableRow(doc: any, y: number, columns: { x: number; width: number; align?: string }[], values: string[], bold = false) {
    doc.fontSize(8).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#1e293b');
    // Altura dinamica: las columnas de texto (no alineadas a la derecha) pueden
    // envolver a 2+ lineas; las de monto quedan en 1 linea para no descuadrar.
    let rowH = 11;
    for (let i = 0; i < columns.length; i++) {
      if (columns[i].align === 'right') continue;
      const h = doc.heightOfString(values[i] || '', { width: columns[i].width });
      if (h > rowH) rowH = h;
    }
    for (let i = 0; i < columns.length; i++) {
      const opts: any = { width: columns[i].width };
      if (columns[i].align === 'right') { opts.align = 'right'; opts.lineBreak = false; }
      doc.text(values[i] || '', columns[i].x, y, opts);
    }
    doc.fillColor('#000');
    return y + Math.max(14, rowH + 2);
  }

  private checkPage(doc: any, y: number, needed = 30): number {
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

  // ── Sales by Period PDF ────────────────────────────────
  async generateSalesByPeriodPdf(data: any, from: string, to: string, groupBy: string): Promise<Buffer> {
    const company = await this.getCompanyName();
    const doc = this.createDoc();
    const groupLabels: Record<string, string> = { hour: 'hora', day: 'dia', week: 'semana', month: 'mes' };
    let y = this.drawHeader(doc, `Ventas por ${groupLabels[groupBy] || 'periodo'}`, company, `${from} al ${to}`);

    // KPIs
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text(`Total USD: $${this.fmt(data.totals.totalUsd)}`, 40, y);
    doc.text(`Facturas: ${data.totals.invoiceCount}`, 250, y);
    doc.text(`Ticket Prom: $${this.fmt(data.totals.avgTicketUsd)}`, 420, y);
    doc.text(`Mejor: ${data.bestPeriod}`, 590, y);
    y += 20;

    const cols = [
      { label: 'Periodo', x: 40, width: 160 },
      { label: 'Facturas', x: 200, width: 60, align: 'right' },
      { label: 'Subtotal USD', x: 270, width: 90, align: 'right' },
      { label: 'IVA USD', x: 370, width: 80, align: 'right' },
      { label: 'Total USD', x: 460, width: 90, align: 'right' },
      { label: 'Total Bs', x: 560, width: 90, align: 'right' },
      { label: 'Ticket Prom', x: 660, width: 80, align: 'right' },
    ];

    y = this.drawTableHeader(doc, y, cols);

    for (const row of data.rows) {
      y = this.checkPage(doc, y);
      y = this.drawTableRow(doc, y, cols, [
        row.label, String(row.invoiceCount), `$${this.fmt(row.subtotalUsd)}`,
        `$${this.fmt(row.ivaUsd)}`, `$${this.fmt(row.totalUsd)}`,
        `Bs ${this.fmt(row.totalBs)}`, `$${this.fmt(row.avgTicketUsd)}`,
      ]);
    }

    // Totals
    y += 4;
    doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke('#94a3b8');
    y += 6;
    y = this.drawTableRow(doc, y, cols, [
      'TOTAL', String(data.totals.invoiceCount), `$${this.fmt(data.totals.subtotalUsd)}`,
      `$${this.fmt(data.totals.ivaUsd)}`, `$${this.fmt(data.totals.totalUsd)}`,
      `Bs ${this.fmt(data.totals.totalBs)}`, `$${this.fmt(data.totals.avgTicketUsd)}`,
    ], true);

    return this.toBuffer(doc);
  }

  // ── Sales by Seller PDF ────────────────────────────────
  async generateSalesBySellerPdf(data: any, from: string, to: string): Promise<Buffer> {
    const company = await this.getCompanyName();
    const doc = this.createDoc();
    let y = this.drawHeader(doc, 'Ventas por Vendedor', company, `${from} al ${to}`);

    const cols = [
      { label: 'Codigo', x: 40, width: 70 },
      { label: 'Vendedor', x: 110, width: 160 },
      { label: 'Facturas', x: 280, width: 60, align: 'right' },
      { label: 'Total USD', x: 350, width: 100, align: 'right' },
      { label: 'Ticket Prom', x: 460, width: 90, align: 'right' },
      { label: 'Devol.', x: 560, width: 50, align: 'right' },
      { label: 'Devol. USD', x: 620, width: 90, align: 'right' },
    ];

    y = this.drawTableHeader(doc, y, cols);

    for (const row of data.rows) {
      y = this.checkPage(doc, y);
      y = this.drawTableRow(doc, y, cols, [
        row.sellerCode, row.sellerName, String(row.invoiceCount),
        `$${this.fmt(row.totalUsd)}`, `$${this.fmt(row.avgTicketUsd)}`,
        String(row.returnCount), `$${this.fmt(row.returnAmountUsd)}`,
      ]);
    }

    return this.toBuffer(doc);
  }

  // ── Sales by Customer PDF ─────────────────────────────
  async generateSalesByCustomerPdf(data: any, from: string, to: string): Promise<Buffer> {
    const company = await this.getCompanyName();
    const doc = this.createDoc();
    let y = this.drawHeader(doc, 'Ventas por Cliente', company, `${from} al ${to}`);

    const cols = [
      { label: 'Cliente', x: 40, width: 180 },
      { label: 'RIF', x: 220, width: 100 },
      { label: 'Facturas', x: 330, width: 60, align: 'right' },
      { label: 'Total USD', x: 400, width: 100, align: 'right' },
      { label: 'Ticket Prom', x: 510, width: 90, align: 'right' },
      { label: 'CxC Pend.', x: 610, width: 90, align: 'right' },
    ];

    y = this.drawTableHeader(doc, y, cols);

    for (const row of data.rows) {
      y = this.checkPage(doc, y);
      y = this.drawTableRow(doc, y, cols, [
        row.customerName, row.customerRif, String(row.invoiceCount),
        `$${this.fmt(row.totalUsd)}`, `$${this.fmt(row.avgTicketUsd)}`,
        `$${this.fmt(row.pendingCxcUsd)}`,
      ]);
    }

    return this.toBuffer(doc);
  }

  // ── Sales by Product PDF ──────────────────────────────
  async generateSalesByProductPdf(data: any, from: string, to: string): Promise<Buffer> {
    const company = await this.getCompanyName();
    const doc = this.createDoc();
    let y = this.drawHeader(doc, 'Ventas por Producto', company, `${from} al ${to}`);

    const cols = [
      { label: 'Codigo', x: 40, width: 70 },
      { label: 'Producto', x: 110, width: 150 },
      { label: 'Categoria', x: 260, width: 100 },
      { label: 'Unidades', x: 370, width: 60, align: 'right' },
      { label: 'Total USD', x: 440, width: 80, align: 'right' },
      { label: 'Costo USD', x: 530, width: 80, align: 'right' },
      { label: 'Ganancia', x: 620, width: 70, align: 'right' },
      { label: 'Margen%', x: 700, width: 50, align: 'right' },
    ];

    y = this.drawTableHeader(doc, y, cols);

    for (const row of data.rows) {
      y = this.checkPage(doc, y);
      y = this.drawTableRow(doc, y, cols, [
        row.productCode, row.productName, row.category,
        String(row.unitsSold), `$${this.fmt(row.totalUsd)}`,
        `$${this.fmt(row.costUsd)}`, `$${this.fmt(row.grossProfitUsd)}`,
        `${row.grossMarginPct}%`,
      ]);
    }

    return this.toBuffer(doc);
  }

  // ── Profit Margin PDF ─────────────────────────────────
  async generateProfitMarginPdf(data: any, from: string, to: string): Promise<Buffer> {
    const company = await this.getCompanyName();
    const doc = this.createDoc();
    let y = this.drawHeader(doc, 'Margen de Ganancia', company, `${from} al ${to}`);

    doc.fontSize(9).font('Helvetica-Bold');
    doc.text(`Margen Promedio: ${data.totals.avgMarginPct}%`, 40, y);
    doc.text(`Ganancia Total: $${this.fmt(data.totals.totalProfitUsd)}`, 250, y);
    doc.text(`Mas Rentable: ${data.mostProfitable}`, 480, y);
    y += 20;

    const cols = [
      { label: 'Codigo', x: 40, width: 70 },
      { label: 'Producto', x: 110, width: 180 },
      { label: 'Categoria', x: 290, width: 100 },
      { label: 'Ventas USD', x: 400, width: 90, align: 'right' },
      { label: 'Costo USD', x: 500, width: 90, align: 'right' },
      { label: 'Ganancia', x: 600, width: 80, align: 'right' },
      { label: 'Margen%', x: 690, width: 60, align: 'right' },
    ];

    y = this.drawTableHeader(doc, y, cols);

    for (const row of data.rows) {
      y = this.checkPage(doc, y);
      y = this.drawTableRow(doc, y, cols, [
        row.productCode, row.productName, row.category,
        `$${this.fmt(row.salesUsd)}`, `$${this.fmt(row.costUsd)}`,
        `$${this.fmt(row.profitUsd)}`, `${row.marginPct}%`,
      ]);
    }

    return this.toBuffer(doc);
  }

  // ── Comisiones por Vendedor PDF ───────────────────────
  async generateCommissionPdf(data: any, sellerName: string, from: string, to: string): Promise<Buffer> {
    const company = await this.getCompanyName();
    const doc = this.createDoc();
    let y = this.drawHeader(doc, `Reporte de Comisiones — ${sellerName}`, company, `${from} al ${to}`);

    // KPIs
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text(`Total vendido: $${this.fmt(data.totalSoldUsd)}`, 40, y);
    doc.text(`Total comision: $${this.fmt(data.totalCommissionUsd)}`, 220, y);
    doc.text(`Total IVA Notas: $${this.fmt(data.totalIvaNotasUsd)}`, 400, y);
    doc.text(`Facturas: ${data.invoiceCount}`, 580, y);
    y += 14;
    doc.text(`Vendido al grupo (no comisiona): $${this.fmt(data.totalGroupSoldUsd)} (${data.groupInvoiceCount} fact.)`, 40, y);
    y += 20;

    // Category breakdown
    doc.fontSize(10).font('Helvetica-Bold').text('Resumen por categoria', 40, y);
    y += 16;

    const cols = [
      { label: 'Categoria', x: 40, width: 180 },
      { label: 'Unidades', x: 220, width: 70, align: 'right' },
      { label: 'Base USD', x: 300, width: 90, align: 'right' },
      { label: 'Comision %', x: 400, width: 70, align: 'right' },
      { label: 'IVA Notas', x: 480, width: 90, align: 'right' },
      { label: 'Comision USD', x: 580, width: 100, align: 'right' },
    ];

    y = this.drawTableHeader(doc, y, cols);

    let tUnits = 0, tBase = 0, tIva = 0, tComm = 0;
    for (const cat of data.categories || []) {
      y = this.checkPage(doc, y);
      tUnits += cat.units; tBase += cat.baseUsd; tIva += cat.ivaNotasUsd; tComm += cat.commissionUsd;
      y = this.drawTableRow(doc, y, cols, [
        cat.categoryName, String(cat.units), `$${this.fmt(cat.baseUsd)}`,
        `${cat.commissionPct.toFixed(2)}%`, `$${this.fmt(cat.ivaNotasUsd)}`,
        `$${this.fmt(cat.commissionUsd)}`,
      ]);
    }

    // Totals
    y += 4;
    doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke('#94a3b8');
    y += 6;
    y = this.drawTableRow(doc, y, cols, [
      'TOTAL', String(tUnits), `$${this.fmt(tBase)}`, '',
      `$${this.fmt(tIva)}`, `$${this.fmt(tComm)}`,
    ], true);

    // Invoice list
    const invoices = data.invoices || [];
    if (invoices.length > 0) {
      y += 18;
      y = this.checkPage(doc, y, 60);
      doc.fontSize(10).font('Helvetica-Bold').text('Facturas cobradas', 40, y);
      y += 16;

      const invCols = [
        { label: '# Factura', x: 40, width: 100 },
        { label: 'Cliente', x: 140, width: 320 },
        { label: 'Total USD', x: 470, width: 110, align: 'right' },
        { label: 'Fecha cobro', x: 590, width: 110 },
      ];
      y = this.drawTableHeader(doc, y, invCols);

      for (const inv of invoices) {
        y = this.checkPage(doc, y);
        const cliente = (inv.customer?.name || 'Sin cliente') + (inv.isGroup ? ' (Grupo)' : '');
        const fecha = inv.paidAt ? new Date(inv.paidAt).toLocaleDateString('es-VE') : '';
        y = this.drawTableRow(doc, y, invCols, [
          inv.number || 'Sin numero', cliente, `$${this.fmt(inv.totalUsd)}`, fecha,
        ]);
      }
    }

    return this.toBuffer(doc);
  }

  // ── Comisiones — TODOS los vendedores PDF ─────────────
  async generateCommissionAllPdf(data: any, from: string, to: string): Promise<Buffer> {
    const company = await this.getCompanyName();
    const doc = this.createDoc();
    let y = this.drawHeader(doc, 'Comisiones por Vendedor (todos)', company, `${from} al ${to}`);

    const cols = [
      { label: 'Categoria', x: 40, width: 200 },
      { label: 'Base USD', x: 240, width: 100, align: 'right' },
      { label: 'IVA Notas', x: 350, width: 100, align: 'right' },
      { label: 'Comision %', x: 460, width: 70, align: 'right' },
      { label: 'Comision USD', x: 540, width: 120, align: 'right' },
    ];

    for (const seller of data.sellers || []) {
      // Espacio para encabezado + cabecera de tabla + al menos una fila
      y = this.checkPage(doc, y, 70);
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f172a')
        .text(`${seller.sellerCode} — ${seller.sellerName}`, 40, y);
      doc.fillColor('#000');
      y += 16;

      y = this.drawTableHeader(doc, y, cols);

      for (const cat of seller.categories || []) {
        y = this.checkPage(doc, y);
        y = this.drawTableRow(doc, y, cols, [
          cat.categoryName, `$${this.fmt(cat.baseUsd)}`, `$${this.fmt(cat.ivaNotasUsd)}`,
          `${cat.commissionPct.toFixed(2)}%`, `$${this.fmt(cat.commissionUsd)}`,
        ]);
      }

      // Subtotal del vendedor
      y += 2;
      doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke('#cbd5e1');
      y += 4;
      y = this.drawTableRow(doc, y, cols, [
        `Total ${seller.sellerName}`, `$${this.fmt(seller.totalSoldUsd)}`,
        `$${this.fmt(seller.totalIvaNotasUsd)}`, '', `$${this.fmt(seller.totalCommissionUsd)}`,
      ], true);

      if (seller.groupInvoiceCount > 0) {
        doc.fontSize(7).font('Helvetica-Oblique').fillColor('#b45309')
          .text(`Vendido al grupo (no comisiona): $${this.fmt(seller.totalGroupSoldUsd)} (${seller.groupInvoiceCount} fact.)`, 40, y);
        doc.fillColor('#000');
        y += 12;
      }
      y += 10;
    }

    // TOTAL GENERAL
    const gt = data.grandTotals || {};
    y = this.checkPage(doc, y, 30);
    doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke('#0f172a');
    y += 6;
    y = this.drawTableRow(doc, y, cols, [
      'TOTAL GENERAL', `$${this.fmt(gt.totalSoldUsd || 0)}`,
      `$${this.fmt(gt.totalIvaNotasUsd || 0)}`, '', `$${this.fmt(gt.totalCommissionUsd || 0)}`,
    ], true);

    return this.toBuffer(doc);
  }
}
