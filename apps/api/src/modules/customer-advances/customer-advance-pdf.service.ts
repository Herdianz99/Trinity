import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomerAdvancesService } from './customer-advances.service';
import * as PDFDocument from 'pdfkit';

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Disponible',
  PARTIAL: 'Parcial',
  CONSUMED: 'Consumido',
};

// Reporte de lista (carta horizontal, area util 40..752). Cliente = encabezado de grupo.
const COLS = [
  { label: 'Fecha', x: 40, width: 62 },
  { label: 'Referencia', x: 104, width: 118 },
  { label: 'Metodo', x: 224, width: 92 },
  { label: 'Monto USD', x: 318, width: 95, align: 'right' as const },
  { label: 'Consumido', x: 415, width: 95, align: 'right' as const },
  { label: 'Restante', x: 512, width: 95, align: 'right' as const },
  { label: 'Estado', x: 609, width: 143 },
];
const RIGHT = 752;

@Injectable()
export class CustomerAdvancePdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly service: CustomerAdvancesService,
  ) {}

  private fmt(n: number): string {
    return (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private dateStr(d: Date | string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' });
  }

  // ======================= PDF INDIVIDUAL (comprobante + historial) =======================
  async generateOne(id: string): Promise<Buffer> {
    const advance: any = await this.service.findOneForPdf(id);
    const config = await this.prisma.companyConfig.findFirst();
    const remainingUsd = Math.round((advance.amountUsd - advance.paidAmountUsd) * 100) / 100;
    const remainingBs = Math.round((advance.amountBs - advance.paidAmountBs) * 100) / 100;

    return new Promise((resolve, reject) => {
      // Comprobante en la MITAD SUPERIOR de una hoja carta VERTICAL (612x792), con las
      // mismas proporciones que el comprobante de gasto: media carta, sin linea de corte
      // ni footer. La mitad inferior queda libre.
      const doc = new PDFDocument({ size: 'LETTER', layout: 'portrait', margins: { top: 30, left: 30, right: 30, bottom: 30 } });
      const HALF = doc.page.height / 2; // 396 = mitad del alto de la carta
      const buffers: Buffer[] = [];
      doc.on('data', (c: Buffer) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const left = 30;
      const pageWidth = doc.page.width - 60; // 552
      const rightEdge = left + pageWidth;
      let y = 28;

      // ---------- HEADER ----------
      let logoBottom = y;
      if (config?.logo) {
        try {
          const base64 = config.logo.replace(/^data:image\/\w+;base64,/, '');
          doc.image(Buffer.from(base64, 'base64'), left, y, { height: 40 });
          logoBottom = y + 44;
        } catch {
          doc.fontSize(14).font('Helvetica-Bold').fillColor('#000').text(config?.companyName || 'Trinity ERP', left, y);
          logoBottom = y + 18;
        }
      } else {
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#000').text(config?.companyName || 'Trinity ERP', left, y);
        let ly = y + 18;
        doc.fontSize(8).font('Helvetica').fillColor('#333');
        if (config?.rif) { doc.text(`RIF: ${config.rif}`, left, ly); ly += 11; }
        if (config?.address) { doc.text(config.address, left, ly, { width: 260 }); ly += 11; }
        if (config?.phone) { doc.text(`Tel: ${config.phone}`, left, ly); ly += 11; }
        logoBottom = ly;
      }

      const rightX = 320;
      let ry = 28;
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#000')
        .text('COMPROBANTE DE ANTICIPO', rightX, ry, { width: rightEdge - rightX, align: 'right' });
      ry += 18;
      doc.fontSize(8).font('Helvetica').fillColor('#555');
      doc.text('Cuenta por Cobrar (Cliente)', rightX, ry, { width: rightEdge - rightX, align: 'right' }); ry += 10;
      doc.text(`Fecha: ${this.dateStr(advance.createdAt)}`, rightX, ry, { width: rightEdge - rightX, align: 'right' }); ry += 10;
      doc.text(`ID: ${advance.id}`, rightX, ry, { width: rightEdge - rightX, align: 'right' });

      y = Math.max(logoBottom, ry) + 10;
      doc.moveTo(left, y).lineTo(rightEdge, y).stroke('#ccc');
      y += 12;

      // ---------- DATOS ----------
      const labelW = 120;
      const valueX = left + labelW;
      const valueW = pageWidth - labelW;
      const row = (label: string, value: string) => {
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#555').text(label, left, y, { width: labelW - 8 });
        doc.fontSize(8.5).font('Helvetica').fillColor('#000');
        const h = doc.heightOfString(value || '-', { width: valueW });
        doc.text(value || '-', valueX, y, { width: valueW });
        y += Math.max(13, h + 3);
      };
      row('Cliente', `${advance.customer?.name || '-'}${advance.customer?.rif ? `  (${advance.customer.rif})` : ''}`);
      row('Metodo de pago', advance.method?.name || '-');
      row('Estado', STATUS_LABELS[advance.status] || advance.status);
      row('Referencia', advance.reference || '-');
      row('Registrado por', advance.createdBy?.name || '-');

      y += 5;
      doc.moveTo(left, y).lineTo(rightEdge, y).stroke('#eee');
      y += 10;

      // ---------- MONTOS ----------
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#555').text('MONTO DEL ANTICIPO', left, y);
      y += 15;
      const boxTop = y;
      const boxH = 76;
      doc.save();
      doc.roundedRect(left, boxTop, pageWidth, boxH, 6).fill('#f8f9fa');
      doc.restore();

      const col1 = left + 20;
      const col2 = left + pageWidth / 3 + 10;
      const col3 = left + (pageWidth * 2) / 3;
      let cy = boxTop + 10;
      doc.fontSize(8).font('Helvetica').fillColor('#888');
      doc.text('MONTO USD', col1, cy);
      doc.text('TASA (Bs/USD)', col2, cy);
      doc.text('MONTO Bs', col3, cy);
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f766e');
      doc.text(`$ ${this.fmt(advance.amountUsd)}`, col1, cy + 12);
      doc.fillColor('#000').fontSize(11);
      doc.text(this.fmt(advance.exchangeRate), col2, cy + 14);
      doc.fillColor('#0f766e').fontSize(14);
      doc.text(`Bs ${this.fmt(advance.amountBs)}`, col3, cy + 12);

      cy = boxTop + 44;
      doc.fontSize(8).font('Helvetica').fillColor('#888');
      doc.text('CONSUMIDO USD', col1, cy);
      doc.text('RESTANTE USD', col2, cy);
      doc.text('RESTANTE Bs', col3, cy);
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#b45309');
      doc.text(`$ ${this.fmt(advance.paidAmountUsd)}`, col1, cy + 12);
      doc.fillColor('#166534');
      doc.text(`$ ${this.fmt(remainingUsd)}`, col2, cy + 12);
      doc.text(`Bs ${this.fmt(remainingBs)}`, col3, cy + 12);

      y = boxTop + boxH + 12;

      // ---------- NOTAS ----------
      if (advance.notes) {
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#555').text('Notas', left, y);
        y += 12;
        doc.fontSize(8.5).font('Helvetica').fillColor('#000');
        const h = doc.heightOfString(advance.notes, { width: pageWidth });
        doc.text(advance.notes, left, y, { width: pageWidth });
        y += h + 8;
      }

      // ---------- FIRMA ----------
      y = Math.max(y + 6, boxTop + boxH + 22, HALF - 66);
      const sigGap = 40;
      const sigW = (pageWidth - sigGap) / 2;
      doc.moveTo(left, y).lineTo(left + sigW, y).stroke('#999');
      doc.moveTo(left + sigW + sigGap, y).lineTo(rightEdge, y).stroke('#999');
      y += 4;
      doc.fontSize(8).font('Helvetica').fillColor('#555');
      doc.text('Elaborado por', left, y, { width: sigW, align: 'center' });
      doc.text('Recibi conforme', left + sigW + sigGap, y, { width: sigW, align: 'center' });

      doc.end();
    });
  }

  // ======================= PDF REPORTE DE LISTA =======================
  private drawHeaderRow(doc: any, y: number): number {
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');
    for (const c of COLS) {
      const opts: any = { width: c.width };
      if (c.align === 'right') opts.align = 'right';
      doc.text(c.label, c.x, y, opts);
    }
    doc.fillColor('#000');
    y += 13;
    doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#e2e8f0');
    return y + 4;
  }

  private drawClientBar(
    doc: any, y: number, name: string, rif: string | null,
    count: number, monto: number, consumido: number, restante: number, cont = false,
  ): number {
    doc.rect(40, y - 2, RIGHT - 40, 15).fill('#d1fae5');
    doc.fillColor('#065f46').fontSize(8.5).font('Helvetica-Bold');
    const title = `${name}${rif ? '  ·  ' + rif : ''}  (${count})${cont ? '  — cont.' : ''}`;
    doc.text(title, 46, y + 1, { width: 380, lineBreak: false, ellipsis: true });
    doc.text(`Monto $${this.fmt(monto)}   Consumido $${this.fmt(consumido)}   Restante $${this.fmt(restante)}`, RIGHT - 366, y + 1, { width: 360, align: 'right', lineBreak: false });
    doc.fillColor('#000');
    return y + 18;
  }

  async generateReport(query: { customerId?: string; status?: string; from?: string; to?: string; reference?: string }): Promise<Buffer> {
    const rows: any[] = await this.service.findAllForReport(query);
    const config = await this.prisma.companyConfig.findFirst();
    const company = config?.companyName || 'Trinity ERP';

    const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margins: { top: 40, bottom: 40, left: 40, right: 40 }, bufferPages: true });

    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text('Anticipos de Clientes (CxC)', 40, 60);

    const filtros: string[] = [];
    if (query.status) filtros.push(`Estado: ${STATUS_LABELS[query.status] || query.status}`);
    if (query.reference) filtros.push(`Ref: ${query.reference}`);
    if (query.from || query.to) filtros.push(`Fechas: ${query.from || '...'} a ${query.to || '...'}`);
    doc.fontSize(9).font('Helvetica').fillColor('#334155');
    doc.text(filtros.length ? filtros.join('     ') : 'Todos los anticipos', 40, 80, { width: RIGHT - 40 });
    doc.text(`Generado: ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })}   |   ${rows.length} anticipos`, 40, 94);
    doc.fillColor('#000');
    doc.moveTo(40, 110).lineTo(RIGHT, 110).stroke('#94a3b8');
    let y = 118;

    // Agrupar por cliente, ordenado alfabeticamente.
    const groups = new Map<string, { name: string; rif: string | null; rows: any[] }>();
    for (const r of rows) {
      const name = r.customer?.name || 'Sin cliente';
      const key = r.customer?.id ? `c:${r.customer.id}` : `x:${name}`;
      if (!groups.has(key)) groups.set(key, { name, rif: r.customer?.rif || null, rows: [] });
      groups.get(key)!.rows.push(r);
    }
    const ordered = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));

    let tMonto = 0, tCons = 0, tRest = 0;
    for (const g of ordered) {
      let gMonto = 0, gCons = 0, gRest = 0;
      for (const r of g.rows) { gMonto += r.amountUsd || 0; gCons += r.paidAmountUsd || 0; gRest += r.remainingUsd || 0; }

      if (y > doc.page.height - doc.page.margins.bottom - 60) { doc.addPage(); y = 40; }
      y = this.drawClientBar(doc, y, g.name, g.rif, g.rows.length, gMonto, gCons, gRest);
      y = this.drawHeaderRow(doc, y);

      doc.fontSize(8).font('Helvetica');
      for (const r of g.rows) {
        if (y > doc.page.height - doc.page.margins.bottom - 24) {
          doc.addPage(); y = 40;
          y = this.drawClientBar(doc, y, g.name, g.rif, g.rows.length, gMonto, gCons, gRest, true);
          y = this.drawHeaderRow(doc, y);
          doc.fontSize(8).font('Helvetica');
        }
        tMonto += r.amountUsd || 0; tCons += r.paidAmountUsd || 0; tRest += r.remainingUsd || 0;
        const values = [
          this.dateStr(r.createdAt),
          r.reference || '—',
          r.method?.name || '—',
          `$${this.fmt(r.amountUsd)}`,
          `$${this.fmt(r.paidAmountUsd)}`,
          `$${this.fmt(r.remainingUsd)}`,
          STATUS_LABELS[r.status] || r.status,
        ];
        doc.fillColor('#1e293b');
        for (let i = 0; i < COLS.length; i++) {
          const opts: any = { width: COLS[i].width, lineBreak: false, ellipsis: true };
          if (COLS[i].align === 'right') opts.align = 'right';
          doc.text(values[i] || '', COLS[i].x, y, opts);
        }
        doc.fillColor('#000');
        y += 13;
      }
      y += 5;
    }

    if (y > doc.page.height - doc.page.margins.bottom - 24) { doc.addPage(); y = 40; }
    doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#cbd5e1');
    y += 4;
    doc.rect(40, y - 2, RIGHT - 40, 16).fill('#0f172a');
    doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
    doc.text(`TOTAL  (${ordered.length} clientes)`, 46, y + 1, { width: 260, lineBreak: false });
    doc.text(`Monto: $${this.fmt(tMonto)}    Consumido: $${this.fmt(tCons)}    Restante: $${this.fmt(tRest)}`, 320, y + 1, { width: RIGHT - 320 - 6, align: 'right' });
    doc.fillColor('#000');

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
