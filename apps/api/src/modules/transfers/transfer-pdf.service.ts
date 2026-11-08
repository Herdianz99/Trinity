import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  CANCELLED: 'Cancelada',
};

// Carta vertical, area util 40..572. Mismo estilo que el PDF de traslados entre empresas.
const COLS = [
  { label: '#', x: 40, width: 22, align: 'right' as const },
  { label: 'Código', x: 68, width: 90 },
  { label: 'Ref. proveedor', x: 160, width: 90 },
  { label: 'Artículo', x: 252, width: 255 },
  { label: 'Cantidad', x: 509, width: 63, align: 'right' as const },
];
const RIGHT = 572;

@Injectable()
export class TransferPdfService {
  constructor(private readonly prisma: PrismaService) {}

  private qty(n: number): string {
    return (n ?? 0).toLocaleString('es-VE', { maximumFractionDigits: 3 });
  }

  private caracas(d: Date): string {
    return new Date(d).toLocaleString('es-VE', { timeZone: 'America/Caracas' });
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

  async generate(id: string): Promise<{ buffer: Buffer; number: string }> {
    const rec = await this.prisma.transfer.findUnique({
      where: { id },
      include: {
        items: { include: { product: { select: { code: true, name: true, supplierRef: true } } } },
        fromWarehouse: { select: { name: true } },
        toWarehouse: { select: { name: true } },
      },
    });
    if (!rec) throw new NotFoundException('Transferencia no encontrada');

    const config = await this.prisma.companyConfig.findFirst();
    const company = config?.companyName || 'Trinity ERP';

    // createdById / approvedById no tienen relacion Prisma: se resuelven aparte.
    const userIds = [rec.createdById, rec.approvedById].filter(Boolean) as string[];
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [];
    const userName = (uid?: string | null) => (uid ? users.find((u) => u.id === uid)?.name || '—' : null);

    const number = rec.number || rec.id.slice(-8);
    // Orden alfabetico por codigo para que el almacen lo ubique facil al despachar/recibir.
    const items = [...rec.items].sort((a, b) => a.product.code.localeCompare(b.product.code));
    const totalUnits = items.reduce((s, i) => s + i.quantity, 0);

    const doc = new PDFDocument({ size: 'LETTER', layout: 'portrait', margins: { top: 40, bottom: 40, left: 40, right: 40 }, bufferPages: true });

    // Encabezado
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text(`Transferencia entre almacenes  ${number}`, 40, 60);

    // Ficha de datos
    doc.fontSize(9).font('Helvetica').fillColor('#334155');
    // Linea 1: de donde a donde (lo mas importante para el almacen). Linea 2: estado y responsables.
    doc.font('Helvetica-Bold').fillColor('#0f172a')
      .text(`Origen: ${rec.fromWarehouse.name}   ->   Destino: ${rec.toWarehouse.name}`, 40, 80, { width: RIGHT - 40 });
    doc.font('Helvetica').fillColor('#334155');
    const info: string[] = [
      `Estado: ${STATUS_LABELS[rec.status] || rec.status}`,
      `Creada: ${this.caracas(rec.createdAt)}${userName(rec.createdById) ? ` por ${userName(rec.createdById)}` : ''}`,
    ];
    if (rec.status === 'APPROVED' && rec.approvedById) info.push(`Aprobada por: ${userName(rec.approvedById)}`);
    const infoText = info.join('     ');
    doc.text(infoText, 40, 94, { width: RIGHT - 40 });
    let y = 94 + doc.heightOfString(infoText, { width: RIGHT - 40 }) + 4;

    if (rec.notes) {
      doc.fillColor('#334155').text(`Notas: ${rec.notes}`, 40, y, { width: RIGHT - 40 });
      y += doc.heightOfString(`Notas: ${rec.notes}`, { width: RIGHT - 40 }) + 2;
    }
    doc.text(`Generado: ${this.caracas(new Date())}   |   ${items.length} artículos`, 40, y);
    y += 12;
    doc.fillColor('#000');
    doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#94a3b8');
    y += 8;

    // Tabla de items
    y = this.drawHeaderRow(doc, y);
    const bottomLimit = () => doc.page.height - doc.page.margins.bottom;

    doc.fontSize(8).font('Helvetica');
    const NAME = 3; // columna Artículo: el nombre largo baja a otra linea en vez de pisar la fila siguiente
    items.forEach((i, idx) => {
      const rowH = Math.max(13, doc.heightOfString(i.product.name, { width: COLS[NAME].width }) + 3);
      if (y + rowH > bottomLimit() - 12) {
        doc.addPage();
        y = 40;
        y = this.drawHeaderRow(doc, y);
        doc.fontSize(8).font('Helvetica');
      }
      const values = [String(idx + 1), i.product.code, i.product.supplierRef || '—', i.product.name, this.qty(i.quantity)];
      doc.fillColor('#1e293b');
      for (let c = 0; c < COLS.length; c++) {
        const opts: any = c === NAME
          ? { width: COLS[c].width }
          : { width: COLS[c].width, height: 10, lineBreak: false, ellipsis: true };
        if (COLS[c].align === 'right') opts.align = 'right';
        doc.text(values[c] || '', COLS[c].x, y, opts);
      }
      doc.fillColor('#000');
      y += rowH;
      // separador tenue entre filas para seguir la linea al contar
      doc.moveTo(40, y - 2).lineTo(RIGHT, y - 2).lineWidth(0.4).stroke('#e2e8f0').lineWidth(1);
    });

    // Totales
    if (y > bottomLimit() - 24) { doc.addPage(); y = 40; }
    doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#cbd5e1');
    y += 4;
    doc.rect(40, y - 2, RIGHT - 40, 16).fill('#0f172a');
    doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
    doc.text(`TOTAL  (${items.length} artículos)`, COLS[1].x, y + 1, { width: 250, lineBreak: false });
    doc.text(this.qty(totalUnits), COLS[4].x - 20, y + 1, { width: COLS[4].width + 20, align: 'right', lineBreak: false });
    doc.fillColor('#000');
    y += 22;

    if (rec.status === 'CANCELLED') {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#b91c1c')
        .text('TRANSFERENCIA CANCELADA: no movió inventario.', 40, y, { width: RIGHT - 40 });
      doc.fillColor('#000');
      y += 16;
    }

    // Firmas: quien despacha (origen) y quien recibe (destino)
    if (y > bottomLimit() - 70) { doc.addPage(); y = 40; }
    y += 40;
    const sigW = 200;
    const sigs = [
      { x: 60, label: 'Entregado por', sub: rec.fromWarehouse.name },
      { x: RIGHT - 20 - sigW, label: 'Recibido por', sub: rec.toWarehouse.name },
    ];
    for (const s of sigs) {
      doc.moveTo(s.x, y).lineTo(s.x + sigW, y).stroke('#64748b');
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155').text(s.label, s.x, y + 4, { width: sigW, align: 'center' });
      doc.font('Helvetica').fillColor('#64748b').text(s.sub, s.x, y + 15, { width: sigW, align: 'center', lineBreak: false, ellipsis: true });
    }
    doc.fillColor('#000');

    // Paginacion
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const oldBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fontSize(8).font('Helvetica').fillColor('#64748b')
        .text(`${number}  -  Página ${i + 1} de ${range.count}`, 40, doc.page.height - 28, { align: 'center', width: doc.page.width - 80 });
      doc.fillColor('#000');
      doc.page.margins.bottom = oldBottom;
    }

    doc.end();
    const buffer = await new Promise<Buffer>((resolve) => {
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
    return { buffer, number };
  }
}
