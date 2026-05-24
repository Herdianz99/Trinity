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
    for (let i = 0; i < columns.length; i++) {
      const opts: any = { width: columns[i].width };
      if (columns[i].align === 'right') opts.align = 'right';
      doc.text(values[i] || '', columns[i].x, y, opts);
    }
    doc.fillColor('#000');
    return y + 14;
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
}
