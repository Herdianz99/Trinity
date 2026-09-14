import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { caracasParts } from '../../common/timezone';

type ActivityRow = {
  createdAt: Date;
  action: 'PLACED' | 'REMOVED';
  location: string | null;
  reason: string | null;
  createdBy: { name: string } | null;
  product: { code: string; name: string; category: { name: string } | null } | null;
};

const ACTION_LABEL: Record<string, string> = { PLACED: 'Puesto', REMOVED: 'Retirado' };
const REASON_LABEL: Record<string, string> = {
  SOLD: 'Vendido',
  DAMAGED: 'Dañado',
  ROTATION: 'Rotación',
  OTHER: 'Otro',
};

@Injectable()
export class ExhibitionReportService {
  private fmtDate(d: Date): string {
    const { ymd, hour } = caracasParts(new Date(d));
    const hh = String(hour).padStart(2, '0');
    return `${ymd} ${hh}:00`;
  }

  buildXlsx(rows: ActivityRow[]): Buffer {
    const aoa = [
      ['Fecha', 'Código', 'Artículo', 'Categoría', 'Acción', 'Ubicación', 'Motivo', 'Usuario'],
      ...rows.map((r) => [
        this.fmtDate(r.createdAt),
        r.product?.code ?? '',
        r.product?.name ?? '',
        r.product?.category?.name ?? '',
        ACTION_LABEL[r.action] ?? r.action,
        r.location ?? '',
        r.reason ? (REASON_LABEL[r.reason] ?? r.reason) : '',
        r.createdBy?.name ?? '',
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Exhibición');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  buildPdf(rows: ActivityRow[]): Promise<Buffer> {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      doc.fontSize(14).text('Reporte de Exhibición', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(8);
      rows.forEach((r) => {
        const line = [
          this.fmtDate(r.createdAt),
          r.product?.code ?? '',
          (r.product?.name ?? '').slice(0, 40),
          ACTION_LABEL[r.action] ?? r.action,
          r.location ?? '',
          r.reason ? (REASON_LABEL[r.reason] ?? r.reason) : '',
          r.createdBy?.name ?? '',
        ].join('  |  ');
        doc.text(line);
      });
      if (rows.length === 0) doc.text('Sin actividad en el rango seleccionado.');
      doc.end();
    });
  }
}
