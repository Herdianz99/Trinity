import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReceivablesService } from './receivables.service';
import { QueryReceivablesDto } from './dto/query-receivables.dto';
import * as PDFDocument from 'pdfkit';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Pagado',
  OVERDUE: 'Vencido',
};

// Carta horizontal, area util 40..752
const COLS = [
  { label: 'Cliente / Plataforma', x: 40, width: 210 },
  { label: 'Documento', x: 254, width: 110 },
  { label: 'Vence', x: 368, width: 80 },
  { label: 'Monto USD', x: 452, width: 90, align: 'right' as const },
  { label: 'Saldo USD', x: 546, width: 90, align: 'right' as const },
  { label: 'Estado', x: 640, width: 112 },
];
const RIGHT = 752;

@Injectable()
export class ReceivablesPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receivablesService: ReceivablesService,
  ) {}

  private fmt(n: number): string {
    return (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private dueDate(d: Date | string | null): string {
    if (!d) return '—';
    // dueDate es date-only (medianoche UTC): formatear en UTC para no correr el dia.
    return new Date(d).toLocaleDateString('es-VE', { timeZone: 'UTC' });
  }

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

  async generate(query: QueryReceivablesDto): Promise<Buffer> {
    const rows = await this.receivablesService.findAllForReport(query);
    const config = await this.prisma.companyConfig.findFirst();
    const company = config?.companyName || 'Trinity ERP';

    const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margins: { top: 40, bottom: 40, left: 40, right: 40 }, bufferPages: true });

    // Encabezado
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text('Cuentas por Cobrar', 40, 60);

    let modo = 'Todas';
    if (query.overdue) modo = 'Solo vencidas';
    else if (query.dueWithinDays !== undefined && query.dueWithinDays !== null && !Number.isNaN(query.dueWithinDays)) {
      modo = `Proximas a vencer (proximos ${query.dueWithinDays} dias)`;
    }
    const filtros: string[] = [modo];
    if (query.status) filtros.push(`Estado: ${STATUS_LABELS[query.status] || query.status}`);
    if (query.type) filtros.push(`Tipo: ${query.type}`);
    if (query.from || query.to) filtros.push(`Fechas: ${query.from || '...'} a ${query.to || '...'}`);
    doc.fontSize(9).font('Helvetica').fillColor('#334155');
    doc.text(filtros.join('     '), 40, 80, { width: RIGHT - 40 });
    doc.text(`Generado: ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })}   |   ${rows.length} documentos`, 40, 94);
    doc.fillColor('#000');
    doc.moveTo(40, 110).lineTo(RIGHT, 110).stroke('#94a3b8');
    let y = 118;

    y = this.drawHeaderRow(doc, y);

    let totalMonto = 0;
    let totalSaldo = 0;
    doc.fontSize(8).font('Helvetica');
    for (const r of rows as any[]) {
      if (y > doc.page.height - doc.page.margins.bottom - 24) {
        doc.addPage();
        y = 40;
        y = this.drawHeaderRow(doc, y);
        doc.fontSize(8).font('Helvetica');
      }
      totalMonto += r.amountUsd || 0;
      totalSaldo += r.balanceUsd || 0;
      const nombre = r.customer?.name || r.platformName || '—';
      const documento = r.number || r.invoice?.number || r.documentNumber || '—';
      const values = [
        nombre,
        String(documento),
        this.dueDate(r.dueDate),
        `$${this.fmt(r.amountUsd)}`,
        `$${this.fmt(r.balanceUsd)}`,
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

    // Totales
    doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#cbd5e1');
    y += 4;
    doc.rect(40, y - 2, RIGHT - 40, 16).fill('#0f172a');
    doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
    doc.text('TOTAL', 46, y + 1, { width: 300, lineBreak: false });
    doc.text(`Monto: $${this.fmt(totalMonto)}     Saldo: $${this.fmt(totalSaldo)}`, 402, y + 1, { width: RIGHT - 402 - 6, align: 'right' });
    doc.fillColor('#000');

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
