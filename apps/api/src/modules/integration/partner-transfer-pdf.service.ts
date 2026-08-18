import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

const STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Solicitado',
  APPROVED: 'Aprobado',
  SENT: 'Enviado',
  PENDING_RECEIPT: 'Por recibir',
  RECEIVED: 'Recibido',
  REJECTED: 'Rechazado',
  CANCELLED: 'Anulado',
};

interface TItem {
  code: string;
  name?: string;
  quantity: number;
  requestedQuantity?: number;
  unitCost?: number;
}

// Carta vertical, area util 40..572.
const COLS = [
  { label: 'Codigo', x: 40, width: 90 },
  { label: 'Articulo', x: 132, width: 230 },
  { label: 'Solicitado', x: 364, width: 55, align: 'right' as const },
  { label: 'Enviado', x: 421, width: 45, align: 'right' as const },
  { label: 'Costo unit. $', x: 468, width: 50, align: 'right' as const },
  { label: 'Subtotal $', x: 520, width: 52, align: 'right' as const },
];
const RIGHT = 572;

@Injectable()
export class PartnerTransferPdfService {
  constructor(private readonly prisma: PrismaService) {}

  private fmt(n: number): string {
    return (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private tipoLabel(kind: string, direction: string): string {
    if (kind === 'SEND') return direction === 'OUTGOING' ? 'Envio (salida de mi inventario)' : 'Envio recibido';
    return direction === 'OUTGOING' ? 'Solicitud mia' : 'Solicitud recibida';
  }

  private drawHeaderRow(doc: any, y: number): number {
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');
    for (const c of COLS) {
      const opts: any = { width: c.width, lineBreak: false, ellipsis: true };
      if (c.align === 'right') opts.align = 'right';
      doc.text(c.label, c.x, y, opts);
    }
    doc.fillColor('#000');
    y += 13;
    doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#e2e8f0');
    return y + 4;
  }

  async generate(key: string): Promise<{ buffer: Buffer; number: string }> {
    const rec = await this.prisma.partnerTransfer.findFirst({
      where: { OR: [{ id: key }, { number: key }] },
    });
    if (!rec) throw new NotFoundException('Traslado no encontrado');

    const config = await this.prisma.companyConfig.findFirst();
    const company = config?.companyName || 'Trinity ERP';

    // Nombres de almacenes (origen/destino) si existen.
    const whIds = [rec.fromWarehouseId, rec.toWarehouseId].filter(Boolean) as string[];
    const whs = whIds.length
      ? await this.prisma.warehouse.findMany({ where: { id: { in: whIds } }, select: { id: true, name: true } })
      : [];
    const whName = (id?: string | null) => (id ? whs.find((w) => w.id === id)?.name || '—' : null);

    const items = (rec.items as unknown as TItem[]) || [];
    const totalReq = items.reduce((s, i) => s + (i.requestedQuantity ?? i.quantity), 0);
    const totalSent = items.reduce((s, i) => s + i.quantity, 0);
    const totalUsd = items.reduce((s, i) => s + (i.unitCost || 0) * i.quantity, 0);

    const doc = new PDFDocument({ size: 'LETTER', layout: 'portrait', margins: { top: 40, bottom: 40, left: 40, right: 40 }, bufferPages: true });

    // Encabezado
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text(`Traslado entre empresas  ${rec.number}`, 40, 60);

    // Ficha de datos
    doc.fontSize(9).font('Helvetica').fillColor('#334155');
    const info: string[] = [
      `Tipo: ${this.tipoLabel(rec.kind, rec.direction)}`,
      `Estado: ${STATUS_LABELS[rec.status] || rec.status}`,
      `Empresa socia: ${rec.partnerName}`,
    ];
    const wOrigen = whName(rec.fromWarehouseId);
    const wDestino = whName(rec.toWarehouseId);
    if (wOrigen) info.push(`Almacen origen: ${wOrigen}`);
    if (wDestino) info.push(`Almacen destino: ${wDestino}`);
    info.push(`Creado: ${new Date(rec.createdAt).toLocaleString('es-VE', { timeZone: 'America/Caracas' })}`);
    doc.text(info.join('     '), 40, 80, { width: RIGHT - 40 });
    let y = 80 + doc.heightOfString(info.join('     '), { width: RIGHT - 40 }) + 4;

    if (rec.notes) {
      doc.fillColor('#334155').text(`Notas: ${rec.notes}`, 40, y, { width: RIGHT - 40 });
      y += doc.heightOfString(`Notas: ${rec.notes}`, { width: RIGHT - 40 }) + 2;
    }
    if (rec.sendNote) {
      doc.fillColor('#334155').text(`Nota del envio: ${rec.sendNote}`, 40, y, { width: RIGHT - 40 });
      y += doc.heightOfString(`Nota del envio: ${rec.sendNote}`, { width: RIGHT - 40 }) + 2;
    }
    doc.text(`Generado: ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })}   |   ${items.length} articulos`, 40, y);
    y += 12;
    doc.fillColor('#000');
    doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#94a3b8');
    y += 8;

    // Tabla de items
    y = this.drawHeaderRow(doc, y);
    const bottomLimit = () => doc.page.height - doc.page.margins.bottom;

    doc.fontSize(8).font('Helvetica');
    for (const i of items) {
      if (y > bottomLimit() - 24) {
        doc.addPage();
        y = 40;
        y = this.drawHeaderRow(doc, y);
        doc.fontSize(8).font('Helvetica');
      }
      const requested = i.requestedQuantity ?? i.quantity;
      const values = [
        i.code,
        i.name || '—',
        String(requested),
        String(i.quantity),
        i.unitCost != null ? `$${this.fmt(i.unitCost)}` : '—',
        i.unitCost != null ? `$${this.fmt(i.unitCost * i.quantity)}` : '—',
      ];
      doc.fillColor('#1e293b');
      for (let c = 0; c < COLS.length; c++) {
        const opts: any = { width: COLS[c].width, lineBreak: false, ellipsis: true };
        if (COLS[c].align === 'right') opts.align = 'right';
        doc.text(values[c] || '', COLS[c].x, y, opts);
      }
      doc.fillColor('#000');
      y += 13;
    }

    // Totales
    if (y > bottomLimit() - 24) { doc.addPage(); y = 40; }
    doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#cbd5e1');
    y += 4;
    doc.rect(40, y - 2, RIGHT - 40, 16).fill('#0f172a');
    doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
    doc.text('TOTALES', COLS[0].x + 6, y + 1, { width: 180, lineBreak: false });
    doc.text(String(totalReq), COLS[2].x, y + 1, { width: COLS[2].width, align: 'right', lineBreak: false });
    doc.text(String(totalSent), COLS[3].x, y + 1, { width: COLS[3].width, align: 'right', lineBreak: false });
    doc.text(`$${this.fmt(totalUsd)}`, COLS[5].x - 20, y + 1, { width: COLS[5].width + 20, align: 'right', lineBreak: false });
    doc.fillColor('#000');
    y += 22;

    doc.fontSize(8).font('Helvetica').fillColor('#64748b');
    doc.text('Al enviarse genera Cuenta por Cobrar al socio; al recibirse genera Cuenta por Pagar (a costo).', 40, y, { width: RIGHT - 40 });
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
    const buffer = await new Promise<Buffer>((resolve) => {
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
    return { buffer, number: rec.number };
  }
}
