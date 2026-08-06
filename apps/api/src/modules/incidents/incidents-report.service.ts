import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';
import { QueryIncidentsDto } from './dto/query-incidents.dto';
import * as PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';

const SEVERITY_LABELS: Record<string, string> = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta' };
const SEVERITY_COLORS: Record<string, string> = { LOW: '#16a34a', MEDIUM: '#d97706', HIGH: '#dc2626' };

@Injectable()
export class IncidentsReportService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(query: QueryIncidentsDto) {
    const where: any = {};
    if (query.typeId) where.typeId = query.typeId;
    if (query.severity) where.severity = query.severity;
    if (query.from || query.to) {
      where.occurredAt = {};
      if (query.from) where.occurredAt.gte = caracasDayStart(query.from);
      if (query.to) where.occurredAt.lte = caracasDayEnd(query.to);
    }
    if (query.search) {
      where.OR = [
        { description: { contains: query.search, mode: 'insensitive' } },
        { involvedName: { contains: query.search, mode: 'insensitive' } },
        { number: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private async load(query: QueryIncidentsDto) {
    return this.prisma.incident.findMany({
      where: this.buildWhere(query),
      include: { type: { select: { name: true } }, createdBy: { select: { name: true } } },
      orderBy: [{ typeId: 'asc' }, { occurredAt: 'desc' }],
    });
  }

  private dt(d: Date | string): string {
    return new Date(d).toLocaleString('es-VE', { timeZone: 'America/Caracas' });
  }

  // Reporte PDF agrupado por TIPO de incidencia, con subtotal por tipo y total general.
  async generatePdf(query: QueryIncidentsDto): Promise<Buffer> {
    const incidents = await this.load(query);
    const config = await this.prisma.companyConfig.findFirst();
    const company = config?.companyName || 'Trinity ERP';

    // Agrupar por tipo
    const groups = new Map<string, any[]>();
    for (const i of incidents) {
      const t = i.type.name;
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t)!.push(i);
    }
    const ordered = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);

    const RIGHT = 572;
    const doc = new PDFDocument({ size: 'LETTER', layout: 'portrait', margins: { top: 40, bottom: 40, left: 40, right: 40 }, bufferPages: true });

    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text('Reporte de Incidencias — por tipo', 40, 60);
    const filtros: string[] = [];
    if (query.from || query.to) filtros.push(`Fechas: ${query.from || '...'} a ${query.to || '...'}`);
    if (query.severity) filtros.push(`Gravedad: ${SEVERITY_LABELS[query.severity] || query.severity}`);
    if (query.search) filtros.push(`Búsqueda: "${query.search}"`);
    doc.fontSize(9).font('Helvetica').fillColor('#334155');
    doc.text(filtros.length ? filtros.join('     ') : 'Todas', 40, 80, { width: RIGHT - 40 });
    doc.text(`Generado: ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })}   |   ${incidents.length} incidencia${incidents.length !== 1 ? 's' : ''}`, 40, 94);
    doc.fillColor('#000');
    doc.moveTo(40, 110).lineTo(RIGHT, 110).stroke('#94a3b8');
    let y = 118;

    const cNum = { x: 44, w: 48 };
    const cDate = { x: 94, w: 92 };
    const cSev = { x: 188, w: 46 };
    const cWho = { x: 236, w: 96 };
    const cDesc = { x: 334, w: 238 };
    const bottom = () => doc.page.height - doc.page.margins.bottom;

    const drawColHeader = () => {
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#334155');
      doc.text('N°', cNum.x, y, { width: cNum.w });
      doc.text('Fecha / hora', cDate.x, y, { width: cDate.w });
      doc.text('Gravedad', cSev.x, y, { width: cSev.w });
      doc.text('Involucrado', cWho.x, y, { width: cWho.w });
      doc.text('Observación', cDesc.x, y, { width: cDesc.w });
      doc.fillColor('#000');
      y += 11;
      doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#e2e8f0');
      y += 4;
    };

    if (incidents.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#64748b')
        .text('No hay incidencias en el período seleccionado.', 40, y + 10, { width: RIGHT - 40, align: 'center' });
      doc.fillColor('#000');
    }

    for (const [typeName, rows] of ordered) {
      if (y > bottom() - 60) { doc.addPage(); y = 40; }
      // Barra del tipo
      doc.rect(40, y - 2, RIGHT - 40, 16).fill('#334155');
      doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
      doc.text(`${typeName}  (${rows.length})`, 46, y + 1.5, { width: RIGHT - 90, lineBreak: false });
      doc.fillColor('#000');
      y += 19;
      drawColHeader();

      doc.fontSize(7.5).font('Helvetica');
      for (const i of rows) {
        const descH = doc.heightOfString(i.description || '', { width: cDesc.w });
        const rowH = Math.max(12, descH) + 3;
        if (y + rowH > bottom()) { doc.addPage(); y = 40; drawColHeader(); doc.fontSize(7.5).font('Helvetica'); }
        doc.fillColor('#1e293b').text(i.number, cNum.x, y, { width: cNum.w, lineBreak: false });
        doc.text(this.dt(i.occurredAt), cDate.x, y, { width: cDate.w, lineBreak: false });
        doc.fillColor(SEVERITY_COLORS[i.severity] || '#334155').font('Helvetica-Bold')
          .text(SEVERITY_LABELS[i.severity] || i.severity, cSev.x, y, { width: cSev.w, lineBreak: false });
        doc.fillColor('#334155').font('Helvetica').text(i.involvedName || '—', cWho.x, y, { width: cWho.w, lineBreak: false, ellipsis: true });
        doc.fillColor('#1e293b').text(i.description || '', cDesc.x, y, { width: cDesc.w });
        doc.fillColor('#000');
        y += rowH;
      }
      // Subtotal del tipo
      if (y + 14 > bottom()) { doc.addPage(); y = 40; }
      doc.rect(40, y - 1, RIGHT - 40, 14).fill('#e2e8f0');
      doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold');
      doc.text(`Subtotal ${typeName}: ${rows.length}`, 46, y + 1.5, { width: RIGHT - 90, lineBreak: false });
      doc.fillColor('#000');
      y += 20;
    }

    if (incidents.length > 0) {
      if (y + 20 > bottom()) { doc.addPage(); y = 40; }
      doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#94a3b8');
      y += 4;
      doc.rect(40, y - 2, RIGHT - 40, 16).fill('#0f172a');
      doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
      doc.text(`TOTAL GENERAL: ${incidents.length} incidencias  (${ordered.length} tipos)`, 46, y + 1.5, { width: RIGHT - 90, lineBreak: false });
      doc.fillColor('#000');
    }

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

  // Exporta la lista a Excel (plana, mismos filtros).
  async generateXlsx(query: QueryIncidentsDto): Promise<Buffer> {
    const incidents = await this.load(query);
    const rows = incidents.map((i) => {
      const d = new Date(i.occurredAt);
      return {
        'N°': i.number,
        'Fecha': d.toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }),
        'Hora': d.toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit' }),
        'Tipo': i.type.name,
        'Gravedad': SEVERITY_LABELS[i.severity] || i.severity,
        'Involucrado': i.involvedName || '',
        'Observación': i.description || '',
        'Registrado por': i.createdBy?.name || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 18 }, { wch: 10 }, { wch: 24 }, { wch: 60 }, { wch: 22 }];
    if (rows.length) ws['!autofilter'] = { ref: `A1:H${rows.length + 1}` };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Incidencias');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
