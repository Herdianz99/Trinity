import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SupplierAdvancesService } from './supplier-advances.service';
import * as PDFDocument from 'pdfkit';

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Disponible',
  PARTIAL: 'Parcial',
  CONSUMED: 'Consumido',
};

// Reporte de lista (carta horizontal, area util 40..752). Proveedor = encabezado de grupo.
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
export class SupplierAdvancePdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly service: SupplierAdvancesService,
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

    const consumos = (advance.receiptItems || [])
      .filter((it: any) => it.receipt && it.receipt.status !== 'CANCELLED')
      .map((it: any) => ({
        number: it.receipt.number,
        date: it.receipt.createdAt,
        usd: Math.abs(it.amountUsd || 0),
        bs: Math.abs(it.amountBsHistoric || 0),
      }))
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', layout: 'portrait', margin: 40 });
      const buffers: Buffer[] = [];
      doc.on('data', (c: Buffer) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const left = 40;
      const pageWidth = doc.page.width - 80;
      const rightEdge = left + pageWidth;
      let y = 40;

      // ---------- HEADER ----------
      let logoBottom = y;
      if (config?.logo) {
        try {
          const base64 = config.logo.replace(/^data:image\/\w+;base64,/, '');
          doc.image(Buffer.from(base64, 'base64'), left, y, { height: 50 });
          logoBottom = y + 55;
        } catch {
          doc.fontSize(16).font('Helvetica-Bold').fillColor('#000').text(config?.companyName || 'Trinity ERP', left, y);
          logoBottom = y + 20;
        }
      } else {
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#000').text(config?.companyName || 'Trinity ERP', left, y);
        let ly = y + 20;
        doc.fontSize(9).font('Helvetica').fillColor('#333');
        if (config?.rif) { doc.text(`RIF: ${config.rif}`, left, ly); ly += 12; }
        if (config?.address) { doc.text(config.address, left, ly, { width: 260 }); ly += 12; }
        logoBottom = ly;
      }

      const rightX = 320;
      let ry = 40;
      doc.fontSize(15).font('Helvetica-Bold').fillColor('#000')
        .text('COMPROBANTE DE ANTICIPO', rightX, ry, { width: rightEdge - rightX, align: 'right' });
      ry += 20;
      doc.fontSize(9).font('Helvetica').fillColor('#555');
      doc.text('Cuenta por Pagar (Proveedor)', rightX, ry, { width: rightEdge - rightX, align: 'right' }); ry += 12;
      doc.text(`Fecha: ${this.dateStr(advance.createdAt)}`, rightX, ry, { width: rightEdge - rightX, align: 'right' }); ry += 12;
      doc.text(`ID: ${advance.id}`, rightX, ry, { width: rightEdge - rightX, align: 'right' });

      y = Math.max(logoBottom, ry) + 18;
      doc.moveTo(left, y).lineTo(rightEdge, y).stroke('#ccc');
      y += 18;

      // ---------- DATOS ----------
      const labelW = 130;
      const valueX = left + labelW;
      const valueW = pageWidth - labelW;
      const row = (label: string, value: string) => {
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#555').text(label, left, y, { width: labelW - 8 });
        doc.fontSize(9.5).font('Helvetica').fillColor('#000');
        const h = doc.heightOfString(value || '-', { width: valueW });
        doc.text(value || '-', valueX, y, { width: valueW });
        y += Math.max(17, h + 5);
      };
      row('Proveedor', `${advance.supplier?.name || '-'}${advance.supplier?.rif ? `  (${advance.supplier.rif})` : ''}`);
      row('Metodo de pago', advance.method?.name || '-');
      row('Estado', STATUS_LABELS[advance.status] || advance.status);
      row('Referencia', advance.reference || '-');
      row('Registrado por', advance.createdBy?.name || '-');

      y += 6;
      doc.moveTo(left, y).lineTo(rightEdge, y).stroke('#eee');
      y += 16;

      // ---------- MONTOS ----------
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#555').text('MONTO DEL ANTICIPO', left, y);
      y += 20;
      const boxTop = y;
      const boxH = 96;
      doc.save();
      doc.roundedRect(left, boxTop, pageWidth, boxH, 6).fill('#f8f9fa');
      doc.restore();

      const col1 = left + 20;
      const col2 = left + pageWidth / 3 + 10;
      const col3 = left + (pageWidth * 2) / 3;
      let cy = boxTop + 14;
      doc.fontSize(8).font('Helvetica').fillColor('#888');
      doc.text('MONTO USD', col1, cy);
      doc.text('TASA (Bs/USD)', col2, cy);
      doc.text('MONTO Bs', col3, cy);
      doc.fontSize(15).font('Helvetica-Bold').fillColor('#0f766e');
      doc.text(`$ ${this.fmt(advance.amountUsd)}`, col1, cy + 14);
      doc.fillColor('#000').fontSize(13);
      doc.text(this.fmt(advance.exchangeRate), col2, cy + 15);
      doc.fillColor('#0f766e').fontSize(15);
      doc.text(`Bs ${this.fmt(advance.amountBs)}`, col3, cy + 14);

      cy = boxTop + 56;
      doc.fontSize(8).font('Helvetica').fillColor('#888');
      doc.text('CONSUMIDO USD', col1, cy);
      doc.text('RESTANTE USD', col2, cy);
      doc.text('RESTANTE Bs', col3, cy);
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#b45309');
      doc.text(`$ ${this.fmt(advance.paidAmountUsd)}`, col1, cy + 13);
      doc.fillColor('#166534');
      doc.text(`$ ${this.fmt(remainingUsd)}`, col2, cy + 13);
      doc.text(`Bs ${this.fmt(remainingBs)}`, col3, cy + 13);

      y = boxTop + boxH + 20;

      // ---------- HISTORIAL DE CONSUMO ----------
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#555').text('HISTORIAL DE CONSUMO', left, y);
      y += 18;
      if (consumos.length === 0) {
        doc.fontSize(9).font('Helvetica-Oblique').fillColor('#888')
          .text('Sin consumos — el anticipo esta disponible en su totalidad.', left, y, { width: pageWidth });
        y += 18;
      } else {
        const cH = [
          { label: 'Fecha', x: left, w: 110 },
          { label: 'Recibo', x: left + 120, w: 200 },
          { label: 'Monto USD', x: left + 330, w: 90, align: 'right' as const },
          { label: 'Monto Bs', x: left + 430, w: pageWidth - 430, align: 'right' as const },
        ];
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#334155');
        for (const c of cH) doc.text(c.label, c.x, y, { width: c.w, align: c.align || 'left' });
        y += 13;
        doc.moveTo(left, y).lineTo(rightEdge, y).stroke('#e2e8f0');
        y += 4;
        doc.fontSize(9).font('Helvetica').fillColor('#1e293b');
        for (const c of consumos) {
          if (y > doc.page.height - 90) { doc.addPage(); y = 40; }
          doc.text(this.dateStr(c.date), cH[0].x, y, { width: cH[0].w });
          doc.text(c.number || '—', cH[1].x, y, { width: cH[1].w, lineBreak: false, ellipsis: true });
          doc.text(`$ ${this.fmt(c.usd)}`, cH[2].x, y, { width: cH[2].w, align: 'right' });
          doc.text(`Bs ${this.fmt(c.bs)}`, cH[3].x, y, { width: cH[3].w, align: 'right' });
          y += 14;
        }
        y += 2;
        doc.moveTo(left, y).lineTo(rightEdge, y).stroke('#cbd5e1');
        y += 4;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
        doc.text('Total consumido', left + 120, y, { width: 200 });
        doc.text(`$ ${this.fmt(advance.paidAmountUsd)}`, left + 330, y, { width: 90, align: 'right' });
        doc.text(`Bs ${this.fmt(advance.paidAmountBs)}`, left + 430, y, { width: pageWidth - 430, align: 'right' });
        y += 18;
      }

      // ---------- NOTAS ----------
      if (advance.notes) {
        y += 4;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#555').text('Notas', left, y);
        y += 14;
        doc.fontSize(9).font('Helvetica').fillColor('#000');
        const h = doc.heightOfString(advance.notes, { width: pageWidth });
        doc.text(advance.notes, left, y, { width: pageWidth });
        y += h + 10;
      }

      // ---------- FIRMA ----------
      y = Math.max(y + 30, doc.page.height - 120);
      const sigW = (pageWidth - 40) / 2;
      doc.moveTo(left, y).lineTo(left + sigW, y).stroke('#999');
      doc.moveTo(left + sigW + 40, y).lineTo(rightEdge, y).stroke('#999');
      y += 4;
      doc.fontSize(8).font('Helvetica').fillColor('#555');
      doc.text('Elaborado por', left, y, { width: sigW, align: 'center' });
      doc.text('Autorizado por', left + sigW + 40, y, { width: sigW, align: 'center' });

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

  private drawSupplierBar(
    doc: any, y: number, name: string, rif: string | null,
    count: number, monto: number, consumido: number, restante: number, cont = false,
  ): number {
    doc.rect(40, y - 2, RIGHT - 40, 15).fill('#dbeafe');
    doc.fillColor('#1e3a8a').fontSize(8.5).font('Helvetica-Bold');
    const title = `${name}${rif ? '  ·  ' + rif : ''}  (${count})${cont ? '  — cont.' : ''}`;
    doc.text(title, 46, y + 1, { width: 380, lineBreak: false, ellipsis: true });
    doc.text(`Monto $${this.fmt(monto)}   Consumido $${this.fmt(consumido)}   Restante $${this.fmt(restante)}`, RIGHT - 366, y + 1, { width: 360, align: 'right', lineBreak: false });
    doc.fillColor('#000');
    return y + 18;
  }

  async generateReport(query: { supplierId?: string; status?: string; from?: string; to?: string; reference?: string }): Promise<Buffer> {
    const rows: any[] = await this.service.findAllForReport(query);
    const config = await this.prisma.companyConfig.findFirst();
    const company = config?.companyName || 'Trinity ERP';

    const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margins: { top: 40, bottom: 40, left: 40, right: 40 }, bufferPages: true });

    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text('Anticipos a Proveedores (CxP)', 40, 60);

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

    const groups = new Map<string, { name: string; rif: string | null; rows: any[] }>();
    for (const r of rows) {
      const name = r.supplier?.name || 'Sin proveedor';
      const key = r.supplier?.id ? `s:${r.supplier.id}` : `x:${name}`;
      if (!groups.has(key)) groups.set(key, { name, rif: r.supplier?.rif || null, rows: [] });
      groups.get(key)!.rows.push(r);
    }
    const ordered = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));

    let tMonto = 0, tCons = 0, tRest = 0;
    for (const g of ordered) {
      let gMonto = 0, gCons = 0, gRest = 0;
      for (const r of g.rows) { gMonto += r.amountUsd || 0; gCons += r.paidAmountUsd || 0; gRest += r.remainingUsd || 0; }

      if (y > doc.page.height - doc.page.margins.bottom - 60) { doc.addPage(); y = 40; }
      y = this.drawSupplierBar(doc, y, g.name, g.rif, g.rows.length, gMonto, gCons, gRest);
      y = this.drawHeaderRow(doc, y);

      doc.fontSize(8).font('Helvetica');
      for (const r of g.rows) {
        if (y > doc.page.height - doc.page.margins.bottom - 24) {
          doc.addPage(); y = 40;
          y = this.drawSupplierBar(doc, y, g.name, g.rif, g.rows.length, gMonto, gCons, gRest, true);
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
    doc.text(`TOTAL  (${ordered.length} proveedores)`, 46, y + 1, { width: 260, lineBreak: false });
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
