import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';
import { computePayrollLine, buildEngineParams, DEFAULT_PAYROLL_PARAM, PayrollParams } from './payroll-calc';

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: Date) => new Date(d).toLocaleDateString('es-VE', { timeZone: 'UTC' });
const TYPE_LABEL: Record<string, string> = { WEEKLY: 'Semanal', BIWEEKLY: 'Quincenal' };

type RunWithLines = Awaited<ReturnType<PayrollPdfService['loadRun']>>;
type Line = RunWithLines['lines'][number];

@Injectable()
export class PayrollPdfService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadRun(id: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            employee: {
              include: {
                customer: { select: { name: true, documentType: true, rif: true } },
                department: { select: { name: true } },
                position: { select: { name: true } },
              },
            },
          },
          orderBy: [{ employee: { code: 'asc' } }],
        },
      },
    });
    if (!run) throw new NotFoundException('Corrida no encontrada');
    return run;
  }

  private async company() {
    const c = await this.prisma.companyConfig.findUnique({ where: { id: 'singleton' }, select: { companyName: true, rif: true } });
    return { name: c?.companyName || 'Trinity', rif: c?.rif || '' };
  }

  // Parámetros del motor para la frecuencia de la corrida (para desglosar cada concepto).
  private async engineFor(type: string): Promise<PayrollParams> {
    const param = (await this.prisma.payrollParam.findUnique({ where: { id: 'singleton' } })) ?? DEFAULT_PAYROLL_PARAM;
    return buildEngineParams(type, param);
  }

  // ------- Recibo de pago (un empleado por página) -------

  private drawReceipt(doc: PDFKit.PDFDocument, run: RunWithLines, line: Line, company: { name: string; rif: string }, top: number, eng: PayrollParams, includeOvertime: boolean): number {
    const L = 40, W = doc.page.width - 80; // 532
    let y = top;

    // Encabezado empresa
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#000').text(company.name, L, y, { width: W, align: 'center' });
    y += 15;
    if (company.rif) { doc.fontSize(8).font('Helvetica').fillColor('#333').text(`RIF: ${company.rif}`, L, y, { width: W, align: 'center' }); y += 12; }
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#000').text('RECIBO DE PAGO DE NOMINA', L, y, { width: W, align: 'center' });
    y += 16;
    doc.moveTo(L, y).lineTo(L + W, y).stroke('#999'); y += 8;

    // Datos empleado + período
    const cust = line.employee.customer;
    doc.fontSize(9).font('Helvetica').fillColor('#333');
    const rowL = (label: string, value: string, yy: number) => { doc.font('Helvetica-Bold').text(label, L, yy, { width: 90 }); doc.font('Helvetica').text(value, L + 92, yy, { width: 174 }); };
    const rowR = (label: string, value: string, yy: number) => { doc.font('Helvetica-Bold').text(label, L + 280, yy, { width: 90 }); doc.font('Helvetica').text(value, L + 372, yy, { width: 160 }); };
    rowL('Empleado:', cust.name, y); rowR('Recibo:', run.number || '-', y); y += 13;
    rowL('C.I./RIF:', `${cust.documentType || ''}${cust.rif ? '-' + cust.rif : ''}`, y); rowR('Codigo:', line.employee.code || '-', y); y += 13;
    rowL('Departamento:', line.employee.department?.name || '-', y); rowR('Frecuencia:', TYPE_LABEL[run.type] || run.type, y); y += 13;
    rowL('Cargo:', line.employee.position?.name || '-', y); rowR('Periodo:', `${fmtDate(run.periodFrom)} - ${fmtDate(run.periodTo)}`, y); y += 13;
    rowL('', '', y); rowR('Tasa BCV:', `${fmt(run.exchangeRate)} Bs/$`, y); y += 16;

    // Devengado
    const box = (title: string, yy: number) => { doc.fontSize(9).font('Helvetica-Bold').fillColor('#000').text(title, L, yy); return yy + 13; };
    const money = (label: string, value: number, yy: number, bold = false) => {
      doc.fontSize(9).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#000');
      doc.text(label, L + 10, yy, { width: 380 });
      doc.text(`${fmt(value)} Bs`, L + 390, yy, { width: 142, align: 'right' });
      return yy + 13;
    };

    // Desglose por concepto: cada entrada editable en su propia línea (nunca agrupada).
    const c = computePayrollLine({
      salaryBaseUsd: line.salaryBaseUsd,
      daysWorked: line.daysWorked,
      daysRest: line.daysRest,
      overtimeDayHours: line.overtimeDayHours,
      overtimeNightHours: line.overtimeNightHours,
      manualDeductionUsd: line.manualDeductionUsd,
      creditDeductionBs: line.creditDeductionBs,
      rate: run.exchangeRate,
    }, eng);
    const workedBs = r2(line.daysWorked * c.dailyUsd * run.exchangeRate);
    const restBs = r2(line.daysRest * c.dailyUsd * run.exchangeRate);

    // Sin horas extra: el total/neto se recalcula solo con salario + deducciones
    // (las HE se pagan aparte). Con horas extra: se usa el gross/neto completo.
    const grossBs = includeOvertime ? c.grossBs : c.salaryBs;
    const netBs = includeOvertime ? c.netBs : r2(c.salaryBs - c.totalDeductionsBs);
    const netUsd = run.exchangeRate > 0 ? r2(netBs / run.exchangeRate) : 0;

    y = box('ASIGNACIONES', y);
    y = money(`Dias trabajados (${line.daysWorked})`, workedBs, y);
    y = money(`Dias de descanso (${line.daysRest})`, restBs, y);
    if (includeOvertime && line.overtimeDayHours > 0) y = money(`Horas extra diurnas (${line.overtimeDayHours})`, c.otDayTotalBs, y);
    if (includeOvertime && line.overtimeNightHours > 0) y = money(`Horas extra nocturnas (${line.overtimeNightHours})`, c.otNightTotalBs, y);
    y = money('Total asignaciones', grossBs, y, true);
    y += 6;

    y = box('DEDUCCIONES', y);
    if (c.ivssBs > 0) y = money('IVSS', c.ivssBs, y);
    if (c.faovBs > 0) y = money('FAOV', c.faovBs, y);
    if (c.incesBs > 0) y = money('INCES', c.incesBs, y);
    if (c.manualDeductionBs > 0) y = money('Deduccion manual', c.manualDeductionBs, y);
    if (c.creditDeductionBs > 0) y = money('Deduccion de credito (CxC)', c.creditDeductionBs, y);
    y = money('Total deducciones', line.totalDeductionsBs, y, true);
    y += 6;

    doc.moveTo(L, y).lineTo(L + W, y).stroke('#999'); y += 8;
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#000');
    doc.text(includeOvertime ? 'NETO A PAGAR' : 'NETO A PAGAR (sin horas extra)', L + 10, y, { width: 300 });
    doc.text(`${fmt(netBs)} Bs`, L + 310, y, { width: 222, align: 'right' });
    y += 15;
    doc.fontSize(9).font('Helvetica').fillColor('#333').text(`Equivalente: $${fmt(netUsd)}`, L + 260, y, { width: 272, align: 'right' });
    y += 40;

    // Firmas
    doc.fontSize(8).fillColor('#000');
    doc.moveTo(L + 20, y).lineTo(L + 200, y).stroke('#333');
    doc.moveTo(L + 330, y).lineTo(L + 510, y).stroke('#333');
    y += 4;
    doc.text('Recibi conforme', L + 20, y, { width: 180, align: 'center' });
    doc.text('Por la empresa', L + 330, y, { width: 180, align: 'center' });
    y += 20;
    return y;
  }

  async generateReceipt(runId: string, lineId: string, includeOvertime = true): Promise<Buffer> {
    const run = await this.loadRun(runId);
    const line = run.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException('Línea no encontrada en esta corrida');
    const company = await this.company();
    const eng = await this.engineFor(run.type);
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
      const buffers: Buffer[] = [];
      doc.on('data', (c: Buffer) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
      this.drawReceipt(doc, run, line, company, 40, eng, includeOvertime);
      doc.end();
    });
  }

  // Todos los recibos de la corrida, 2 por página.
  async generateAllReceipts(runId: string, includeOvertime = true): Promise<Buffer> {
    const run = await this.loadRun(runId);
    const company = await this.company();
    const eng = await this.engineFor(run.type);
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
      const buffers: Buffer[] = [];
      doc.on('data', (c: Buffer) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
      const half = doc.page.height / 2;
      run.lines.forEach((line, i) => {
        if (i > 0 && i % 2 === 0) doc.addPage();
        const top = i % 2 === 0 ? 40 : half + 10;
        if (i % 2 === 1) doc.moveTo(40, half).lineTo(doc.page.width - 40, half).dash(3, { space: 3 }).stroke('#bbb').undash();
        this.drawReceipt(doc, run, line, company, top, eng, includeOvertime);
      });
      doc.end();
    });
  }

  // ------- Relación por departamento -------

  async generateRelation(runId: string): Promise<Buffer> {
    const run = await this.loadRun(runId);
    const company = await this.company();
    const eng = await this.engineFor(run.type);

    // Agrupar por departamento
    const groups = new Map<string, Line[]>();
    for (const l of run.lines) {
      const k = l.employee.department?.name || '(sin departamento)';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(l);
    }

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 36 });
      const buffers: Buffer[] = [];
      doc.on('data', (c: Buffer) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const L = 36, W = doc.page.width - 72; // 720
      const pageH = doc.page.height;

      // Modelo de columnas: emp (izquierda) + 8 numéricas (derecha). Orden pedido por RRHH:
      // Salario, IVSS, FAOV, Otras, Total neto (salario − deducciones), HE diurna, HE nocturna,
      // Total (salario + HE, sin deducciones). Anchos suman ≤ W.
      const NUM_W = { sal: 70, ivss: 52, faov: 52, otras: 58, neto: 78, heDia: 62, heNoc: 62, total: 78 };
      const NUM_KEYS = ['sal', 'ivss', 'faov', 'otras', 'neto', 'heDia', 'heNoc', 'total'] as const;
      const NUM_HEAD = { sal: 'Salario', ivss: 'IVSS', faov: 'FAOV', otras: 'Otras', neto: 'Total neto', heDia: 'HE Diurna', heNoc: 'HE Noct.', total: 'Total' };
      const empW = W - NUM_KEYS.reduce((s, k) => s + NUM_W[k], 0); // ancho de la columna empleado
      const colX: Record<string, number> = {};
      let acc = L + empW;
      for (const k of NUM_KEYS) { colX[k] = acc; acc += NUM_W[k]; }
      const colEnd = L + W;
      // Dibuja las 7 celdas numéricas de una fila (right-aligned).
      const numCells = (vals: Record<string, number>, y: number) => {
        for (const k of NUM_KEYS) doc.text(fmt(vals[k]), colX[k], y, { width: NUM_W[k], align: 'right' });
      };

      const header = (y: number): number => {
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#000').text(company.name, L, y, { width: W, align: 'center' }); y += 15;
        doc.fontSize(10).font('Helvetica-Bold').text('RELACION DE NOMINA', L, y, { width: W, align: 'center' }); y += 14;
        doc.fontSize(8).font('Helvetica').fillColor('#333');
        doc.text(`${run.number || ''}  ·  ${TYPE_LABEL[run.type]}  ·  Periodo ${fmtDate(run.periodFrom)} - ${fmtDate(run.periodTo)}  ·  Tasa ${fmt(run.exchangeRate)} Bs/$`, L, y, { width: W, align: 'center' });
        y += 16;
        return y;
      };
      const tableHead = (y: number): number => {
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000');
        doc.text('Empleado', L, y, { width: empW - 4 });
        for (const k of NUM_KEYS) doc.text(NUM_HEAD[k], colX[k], y, { width: NUM_W[k], align: 'right' });
        y += 11;
        doc.moveTo(L, y).lineTo(colEnd, y).stroke('#999'); y += 3;
        return y;
      };

      let y = header(40);
      y = tableHead(y);

      const g = { sal: 0, ivss: 0, faov: 0, otras: 0, neto: 0, heDia: 0, heNoc: 0, total: 0 };

      for (const [dept, lines] of groups) {
        if (y > pageH - 70) { doc.addPage(); y = tableHead(40); }
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#1a4d2e').text(dept.toUpperCase(), L, y); y += 12;

        const s = { sal: 0, ivss: 0, faov: 0, otras: 0, neto: 0, heDia: 0, heNoc: 0, total: 0 };
        doc.fontSize(7.5).font('Helvetica').fillColor('#000');
        for (const l of lines) {
          if (y > pageH - 60) { doc.addPage(); y = tableHead(40); }
          const otras = Math.round((l.totalDeductionsBs - l.ivssBs - l.faovBs) * 100) / 100;
          // Total neto = salario − deducciones (SIN horas extra). Total = salario + HE (SIN deducciones).
          const netoSinHE = Math.round((l.salaryBs - l.totalDeductionsBs) * 100) / 100;
          const c = computePayrollLine({
            salaryBaseUsd: l.salaryBaseUsd, daysWorked: l.daysWorked, daysRest: l.daysRest,
            overtimeDayHours: l.overtimeDayHours, overtimeNightHours: l.overtimeNightHours,
            manualDeductionUsd: l.manualDeductionUsd, creditDeductionBs: l.creditDeductionBs,
            rate: run.exchangeRate,
          }, eng);
          const vals = {
            sal: l.salaryBs, ivss: l.ivssBs, faov: l.faovBs, otras, neto: netoSinHE,
            heDia: c.otDayTotalBs, heNoc: c.otNightTotalBs, total: l.grossBs,
          };
          doc.font('Helvetica').fillColor('#000');
          doc.text(`${l.employee.code || ''} ${l.employee.customer.name}`.trim(), L, y, { width: empW - 4, ellipsis: true, lineBreak: false });
          numCells(vals, y);
          y += 11;
          for (const k of NUM_KEYS) s[k] += vals[k];
        }
        // Subtotal departamento
        doc.moveTo(colX.sal, y).lineTo(colEnd, y).stroke('#ccc'); y += 2;
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#333');
        doc.text(`Subtotal ${dept} (${lines.length})`, L, y, { width: empW - 4 });
        numCells(s, y);
        y += 16;
        for (const k of NUM_KEYS) g[k] += s[k];
      }

      // Total general
      if (y > pageH - 50) { doc.addPage(); y = 40; }
      doc.moveTo(L, y).lineTo(colEnd, y).stroke('#000'); y += 4;
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#000');
      doc.text(`TOTAL GENERAL (${run.lines.length})`, L, y, { width: empW - 4 });
      numCells(g, y);

      doc.end();
    });
  }
}
