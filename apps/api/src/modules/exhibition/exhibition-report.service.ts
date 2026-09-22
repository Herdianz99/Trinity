import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';

type ActivityRow = {
  createdAt: Date;
  action: 'PLACED' | 'REMOVED';
  quantity: number;
  isAutomatic: boolean;
  location: string | null;
  reason: string | null;
  createdBy: { name: string } | null;
  product: { code: string; name: string; category: { name: string } | null } | null;
};

type ActivityQuery = { from?: string; to?: string; action?: string };

const ACTION_LABEL: Record<string, string> = { PLACED: 'Puesto', REMOVED: 'Retirado' };
const REASON_LABEL: Record<string, string> = {
  SOLD: 'Vendido',
  DAMAGED: 'Dañado',
  ROTATION: 'Rotación',
  OTHER: 'Otro',
};

// Carta vertical, area util 40..572.
const COLS = [
  { label: 'Fecha', x: 40, width: 70 },
  { label: 'Código', x: 112, width: 44 },
  { label: 'Artículo', x: 158, width: 118 },
  { label: 'Cant', x: 278, width: 26 },
  { label: 'Acción', x: 306, width: 44 },
  { label: 'Ubicación', x: 352, width: 58 },
  { label: 'Motivo', x: 412, width: 74 },
  { label: 'Usuario', x: 488, width: 84 },
] as const;
const RIGHT = 572;

@Injectable()
export class ExhibitionReportService {
  constructor(private readonly prisma: PrismaService) {}

  private fmtDate(d: Date): string {
    return new Date(d).toLocaleString('es-VE', {
      timeZone: 'America/Caracas',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  // Trunca midiendo el ancho REAL (con la fuente/tamaño actual) hasta que quepa en una
  // sola linea. Necesario porque lineBreak:false no siempre evita el wrap en pdfkit.
  private fit(doc: any, text: string, width: number): string {
    if (doc.widthOfString(text) <= width) return text;
    let s = text;
    while (s.length > 1 && doc.widthOfString(s + '…') > width) s = s.slice(0, -1);
    return s + '…';
  }

  buildXlsx(rows: ActivityRow[]): Buffer {
    const data = rows.map((r) => ({
      'Fecha': this.fmtDate(r.createdAt),
      'Código': r.product?.code ?? '',
      'Artículo': r.product?.name ?? '',
      'Categoría': r.product?.category?.name ?? '',
      'Cant.': r.quantity ?? '',
      'Acción': ACTION_LABEL[r.action] ?? r.action,
      'Automático': r.isAutomatic ? 'Sí' : '',
      'Ubicación': r.location ?? '',
      'Motivo': r.reason ? (REASON_LABEL[r.reason] ?? r.reason) : '',
      'Usuario': r.createdBy?.name ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 18 }, { wch: 12 }, { wch: 40 }, { wch: 18 }, { wch: 6 },
      { wch: 10 }, { wch: 11 }, { wch: 18 }, { wch: 12 }, { wch: 20 },
    ];
    if (data.length) ws['!autofilter'] = { ref: `A1:J${data.length + 1}` };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Exhibición');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  private drawHeaderRow(doc: any, y: number): number {
    // Barra de encabezado con color (oscuro + texto blanco), estilo de los reportes del sistema.
    doc.rect(40, y - 2, RIGHT - 40, 15).fill('#0f172a');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
    for (const c of COLS) {
      doc.text(c.label, c.x + 2, y + 1.5, { width: c.width, lineBreak: false });
    }
    doc.fillColor('#000');
    return y + 17;
  }

  async buildPdf(rows: ActivityRow[], query: ActivityQuery = {}): Promise<Buffer> {
    const config = await this.prisma.companyConfig.findFirst();
    const company = config?.companyName || 'Trinity ERP';

    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'portrait',
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      bufferPages: true,
    });

    // Encabezado
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text('Reporte de Exhibición', 40, 60);

    const filtros: string[] = [];
    if (query.from || query.to) filtros.push(`Rango: ${query.from || '...'} a ${query.to || '...'}`);
    else filtros.push('Rango: Todas las fechas');
    if (query.action) filtros.push(`Acción: ${ACTION_LABEL[query.action] || query.action}`);
    doc.fontSize(9).font('Helvetica').fillColor('#334155');
    doc.text(filtros.join('     '), 40, 80, { width: RIGHT - 40 });

    const placed = rows.filter((r) => r.action === 'PLACED').length;
    const removed = rows.filter((r) => r.action === 'REMOVED').length;
    doc.text(
      `Generado: ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })}   |   ${rows.length} movimientos  (Puestas: ${placed}  ·  Retiros: ${removed})`,
      40, 94, { width: RIGHT - 40 },
    );
    doc.fillColor('#000');
    doc.moveTo(40, 110).lineTo(RIGHT, 110).stroke('#94a3b8');
    let y = 118;

    y = this.drawHeaderRow(doc, y);

    doc.fontSize(8).font('Helvetica');
    for (const r of rows) {
      if (y > doc.page.height - doc.page.margins.bottom - 24) {
        doc.addPage();
        y = 40;
        y = this.drawHeaderRow(doc, y);
        doc.fontSize(8).font('Helvetica');
      }
      const motivo = r.reason ? (REASON_LABEL[r.reason] ?? r.reason) : '—';
      const values = [
        this.fmtDate(r.createdAt),
        r.product?.code ?? '',
        r.product?.name ?? '',
        String(r.quantity ?? ''),
        ACTION_LABEL[r.action] ?? r.action,
        r.location ?? '—',
        r.isAutomatic ? `${motivo} (auto)` : motivo,
        r.createdBy?.name ?? '',
      ];
      // La accion resalta: verde puesto, rojo retirado. El motivo automatico va en ambar.
      for (let i = 0; i < COLS.length; i++) {
        if (i === 4) doc.fillColor(r.action === 'PLACED' ? '#16a34a' : '#dc2626');
        else if (i === 6 && r.isAutomatic) doc.fillColor('#b45309');
        else doc.fillColor('#1e293b');
        const text = this.fit(doc, String(values[i] ?? ''), COLS[i].width - 3);
        doc.text(text, COLS[i].x, y, { width: COLS[i].width, lineBreak: false });
      }
      doc.fillColor('#000');
      y += 13;
    }

    if (rows.length === 0) {
      doc.fontSize(9).font('Helvetica').fillColor('#64748b')
        .text('Sin actividad de exhibición en el rango seleccionado.', 40, y + 6, { width: RIGHT - 40 });
      doc.fillColor('#000');
    }

    // Paginacion
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const oldBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fontSize(8).font('Helvetica').fillColor('#64748b')
        .text(`Página ${i + 1} de ${range.count}`, 40, doc.page.height - 28, { align: 'center', width: doc.page.width - 80 });
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
