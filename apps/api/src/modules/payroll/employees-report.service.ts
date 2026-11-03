import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { EmployeesService } from './employees.service';
import { QueryEmployeesDto } from './dto/set-employee-status.dto';
import { EMPLOYEE_STATUS_KEYS, statusLabel } from './employee-status';

const FREQ_LABEL: Record<string, string> = { WEEKLY: 'Semanal', BIWEEKLY: 'Quincenal' };
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#16a34a', VACATION: '#0284c7', MEDICAL_LEAVE: '#d97706', SPECIAL_LEAVE: '#7c3aed',
  INACTIVE: '#64748b', VOLUNTARY_RESIGNATION: '#dc2626', JUSTIFIED_DISMISSAL: '#991b1b',
};
const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// statusFrom/statusTo son fechas-calendario guardadas a medianoche UTC → formatear en UTC.
const fmtDate = (d: Date | null) => (d ? new Date(d).toLocaleDateString('es-VE', { timeZone: 'UTC' }) : '');

@Injectable()
export class EmployeesReportService {
  constructor(private readonly prisma: PrismaService, private readonly employees: EmployeesService) {}

  private async load(query: QueryEmployeesDto) {
    const rows = await this.prisma.employee.findMany({
      where: this.employees.buildWhere(query),
      include: {
        customer: { select: { name: true, documentType: true, rif: true, phone: true } },
        department: { select: { name: true } },
        position: { select: { name: true } },
      },
      orderBy: [{ code: 'asc' }],
    });
    // Agrupar en el orden oficial de los estados
    const order = (s: string) => { const i = (EMPLOYEE_STATUS_KEYS as string[]).indexOf(s); return i < 0 ? 99 : i; };
    return rows.sort((a, b) => order(a.status) - order(b.status));
  }

  private filtersText(query: QueryEmployeesDto, departmentName?: string) {
    const f: string[] = [];
    const st = (query.status || '').split(',').filter(Boolean);
    f.push(st.length ? `Estado: ${st.map(statusLabel).join(', ')}` : 'Estado: todos');
    if (departmentName) f.push(`Departamento: ${departmentName}`);
    if (query.search) f.push(`Búsqueda: "${query.search}"`);
    return f.join('     ');
  }

  private cedula(c: { documentType: string | null; rif: string | null }) {
    return `${c.documentType || ''}${c.rif ? `-${c.rif}` : ''}`;
  }

  async generatePdf(query: QueryEmployeesDto): Promise<Buffer> {
    const rows = await this.load(query);
    const config = await this.prisma.companyConfig.findFirst({ select: { companyName: true, rif: true } });
    const dept = query.departmentId
      ? await this.prisma.department.findUnique({ where: { id: query.departmentId }, select: { name: true } })
      : null;

    const L = 30, RIGHT = 762; // carta horizontal (792 x 612)
    const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margins: { top: 30, bottom: 36, left: L, right: 30 }, bufferPages: true });
    const bottom = () => doc.page.height - doc.page.margins.bottom;

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000').text(config?.companyName || 'Trinity ERP', L, 30);
    if (config?.rif) doc.fontSize(8).font('Helvetica').fillColor('#334155').text(`RIF: ${config.rif}`, L, 47);
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#000').text('Reporte de empleados por estado', L, 60);
    doc.fontSize(8.5).font('Helvetica').fillColor('#334155');
    doc.text(this.filtersText(query, dept?.name), L, 77, { width: RIGHT - L });
    doc.text(`Generado: ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })}   |   ${rows.length} empleado${rows.length !== 1 ? 's' : ''}`, L, 89);
    doc.moveTo(L, 103).lineTo(RIGHT, 103).stroke('#94a3b8');
    let y = 110;

    const cols = [
      { k: 'code', t: 'Código', x: 32, w: 50 },
      { k: 'name', t: 'Empleado', x: 84, w: 140 },
      { k: 'ced', t: 'Cédula', x: 226, w: 62 },
      { k: 'dept', t: 'Departamento', x: 290, w: 80 },
      { k: 'pos', t: 'Cargo', x: 372, w: 86 },
      { k: 'freq', t: 'Frec.', x: 460, w: 44 },
      { k: 'sal', t: 'Sueldo USD', x: 506, w: 52, right: true },
      { k: 'bon', t: 'Bono USD', x: 560, w: 46, right: true },
      { k: 'from', t: 'Desde', x: 616, w: 44 },
      { k: 'to', t: 'Hasta', x: 662, w: 44 },
      { k: 'note', t: 'Observación', x: 708, w: 54 },
    ] as const;

    const drawHeader = () => {
      doc.fontSize(7).font('Helvetica-Bold').fillColor('#334155');
      for (const c of cols) doc.text(c.t, c.x, y, { width: c.w, align: (c as any).right ? 'right' : 'left', lineBreak: false });
      y += 10;
      doc.moveTo(L, y).lineTo(RIGHT, y).stroke('#e2e8f0');
      y += 3;
    };

    if (rows.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#64748b').text('No hay empleados con los filtros seleccionados.', L, y + 10, { width: RIGHT - L, align: 'center' });
    }

    const groups = new Map<string, typeof rows>();
    for (const r of rows) { if (!groups.has(r.status)) groups.set(r.status, []); groups.get(r.status)!.push(r); }

    let totalSal = 0, totalBon = 0;
    for (const [status, list] of groups) {
      if (y > bottom() - 50) { doc.addPage(); y = 30; }
      doc.rect(L, y - 2, RIGHT - L, 15).fill(STATUS_COLOR[status] || '#334155');
      doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold').text(`${statusLabel(status)}  (${list.length})`, L + 6, y + 1.5, { width: RIGHT - L - 12, lineBreak: false });
      y += 18;
      drawHeader();

      let sal = 0, bon = 0;
      for (const e of list) {
        doc.fontSize(7).font('Helvetica');
        // El nombre y la observación pueden ocupar varias líneas: la fila toma la más alta.
        const nameH = doc.heightOfString(e.customer.name, { width: cols[1].w });
        const noteH = e.statusNote ? doc.heightOfString(e.statusNote, { width: cols[10].w }) : 0;
        const rowH = Math.max(11, nameH, noteH) + 3;
        if (y + rowH > bottom()) { doc.addPage(); y = 30; drawHeader(); doc.fontSize(7).font('Helvetica'); }
        const v: Record<string, string> = {
          code: e.code || '—', name: e.customer.name, ced: this.cedula(e.customer),
          dept: e.department?.name || '—', pos: e.position?.name || '—', freq: FREQ_LABEL[e.frequency] || e.frequency,
          sal: fmt(e.salaryBaseUsd), bon: fmt(e.bonusUsd), from: fmtDate(e.statusFrom), to: fmtDate(e.statusTo),
        };
        doc.fillColor('#1e293b');
        for (const c of cols) {
          if (c.k === 'note') continue;
          if (c.k === 'name') { doc.text(v.name, c.x, y, { width: c.w }); continue; }
          doc.text(v[c.k], c.x, y, { width: c.w, height: 10, align: (c as any).right ? 'right' : 'left', lineBreak: false, ellipsis: true });
        }
        if (e.statusNote) doc.fillColor('#475569').text(e.statusNote, cols[10].x, y, { width: cols[10].w });
        y += rowH;
        sal += e.salaryBaseUsd; bon += e.bonusUsd;
      }
      totalSal += sal; totalBon += bon;
      if (y + 14 > bottom()) { doc.addPage(); y = 30; }
      doc.rect(L, y - 1, RIGHT - L, 13).fill('#e2e8f0');
      doc.fillColor('#0f172a').fontSize(7.5).font('Helvetica-Bold');
      doc.text(`Subtotal ${statusLabel(status)}: ${list.length}`, L + 6, y + 2, { width: 300, lineBreak: false });
      doc.text(fmt(sal), cols[6].x, y + 2, { width: cols[6].w, align: 'right', lineBreak: false });
      doc.text(fmt(bon), cols[7].x, y + 2, { width: cols[7].w, align: 'right', lineBreak: false });
      y += 20;
    }

    if (rows.length > 0) {
      if (y + 18 > bottom()) { doc.addPage(); y = 30; }
      doc.rect(L, y - 2, RIGHT - L, 15).fill('#0f172a');
      doc.fillColor('#fff').fontSize(8.5).font('Helvetica-Bold');
      doc.text(`TOTAL: ${rows.length} empleados  (${groups.size} estado${groups.size !== 1 ? 's' : ''})`, L + 6, y + 1.5, { width: 400, lineBreak: false });
      doc.text(fmt(totalSal), cols[6].x, y + 1.5, { width: cols[6].w, align: 'right', lineBreak: false });
      doc.text(fmt(totalBon), cols[7].x, y + 1.5, { width: cols[7].w, align: 'right', lineBreak: false });
    }

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const oldBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fontSize(7.5).font('Helvetica').fillColor('#64748b')
        .text(`Página ${i + 1} de ${range.count}`, L, doc.page.height - 24, { align: 'center', width: RIGHT - L });
      doc.page.margins.bottom = oldBottom;
    }

    doc.end();
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  async generateXlsx(query: QueryEmployeesDto): Promise<Buffer> {
    const rows = await this.load(query);
    const data = rows.map((e) => ({
      'Código': e.code || '',
      'Empleado': e.customer.name,
      'Cédula': this.cedula(e.customer),
      'Teléfono': e.customer.phone || '',
      'Departamento': e.department?.name || '',
      'Cargo': e.position?.name || '',
      'Frecuencia': FREQ_LABEL[e.frequency] || e.frequency,
      'Banco': e.bank || '',
      'Sueldo base USD': Math.round(e.salaryBaseUsd * 100) / 100,
      'Bono USD': Math.round(e.bonusUsd * 100) / 100,
      'Estado': statusLabel(e.status),
      'Desde': fmtDate(e.statusFrom),
      'Hasta': fmtDate(e.statusTo),
      'Observación': e.statusNote || '',
      'En nómina': e.isActive ? 'Sí' : 'No',
    }));
    const ws = XLSX.utils.json_to_sheet(data, {
      header: ['Código', 'Empleado', 'Cédula', 'Teléfono', 'Departamento', 'Cargo', 'Frecuencia', 'Banco', 'Sueldo base USD', 'Bono USD', 'Estado', 'Desde', 'Hasta', 'Observación', 'En nómina'],
    });
    ws['!cols'] = [10, 32, 14, 14, 18, 20, 11, 16, 14, 11, 20, 11, 11, 40, 10].map((wch) => ({ wch }));
    if (data.length) ws['!autofilter'] = { ref: `A1:O${data.length + 1}` };

    // Resumen por estado
    const summary: { 'Estado': string; 'Empleados': number; 'Sueldo base USD': number; 'Bono USD': number }[] = EMPLOYEE_STATUS_KEYS.map((s) => {
      const list = rows.filter((r) => r.status === s);
      return {
        'Estado': statusLabel(s),
        'Empleados': list.length,
        'Sueldo base USD': Math.round(list.reduce((a, r) => a + r.salaryBaseUsd, 0) * 100) / 100,
        'Bono USD': Math.round(list.reduce((a, r) => a + r.bonusUsd, 0) * 100) / 100,
      };
    }).filter((r) => r.Empleados > 0);
    summary.push({
      'Estado': 'TOTAL',
      'Empleados': rows.length,
      'Sueldo base USD': Math.round(rows.reduce((a, r) => a + r.salaryBaseUsd, 0) * 100) / 100,
      'Bono USD': Math.round(rows.reduce((a, r) => a + r.bonusUsd, 0) * 100) / 100,
    });
    const ws2 = XLSX.utils.json_to_sheet(summary);
    ws2['!cols'] = [{ wch: 22 }, { wch: 11 }, { wch: 16 }, { wch: 12 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Empleados');
    XLSX.utils.book_append_sheet(wb, ws2, 'Resumen por estado');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
