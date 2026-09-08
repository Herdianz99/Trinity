import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';

const EXPENSE_TYPE_LABELS: Record<string, string> = {
  FIXED: 'Fijo',
  EXTRAORDINARY: 'Extraordinario',
};

// Excel PLANO del reporte de gastos (/expenses): una fila por gasto, respetando los MISMOS
// filtros del listado (rango de fechas anclado a Caracas sobre Expense.date + categoria) que
// el PDF. Los montos van como numeros reales con formato #,##0.00, asi Excel maneja montos en
// Bs de cualquier magnitud sin recortes. Incluye desglose Gastos propios vs "vienen de CxP".
@Injectable()
export class ExpenseReportExcelService {
  constructor(private readonly prisma: PrismaService) {}

  private caracasDateTime(d: Date): string {
    return new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(d));
  }

  private caracasDate(d: Date): string {
    return new Date(d).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' });
  }

  async generate(filters: { from?: string; to?: string; categoryId?: string }): Promise<Buffer> {
    const where: any = {};
    if (filters.from || filters.to) {
      where.date = {};
      if (filters.from) where.date.gte = caracasDayStart(filters.from);
      if (filters.to) where.date.lte = caracasDayEnd(filters.to);
    }
    if (filters.categoryId) where.categoryId = filters.categoryId;

    const [config, expenses] = await Promise.all([
      this.prisma.companyConfig.findFirst().catch(() => null),
      this.prisma.expense.findMany({
        where,
        include: {
          category: { select: { name: true, expenseType: true } },
          supplier: { select: { name: true } },
          method: { select: { name: true } },
          payable: { select: { id: true, number: true } },
        },
        orderBy: { date: 'asc' },
      }),
    ]);
    const company = config?.companyName || 'Trinity ERP';

    const fromLabel = filters.from
      ? this.caracasDate(caracasDayStart(filters.from)) : '...';
    const toLabel = filters.to
      ? this.caracasDate(caracasDayStart(filters.to)) : '...';

    // Bloque de encabezado (filas informativas antes de la tabla).
    const aoa: any[][] = [];
    aoa.push([company]);
    aoa.push(['Reporte de Gastos']);
    aoa.push([`Periodo: ${fromLabel}  a  ${toLabel}`]);
    aoa.push([`Generado: ${this.caracasDateTime(new Date())}     ${expenses.length} gasto${expenses.length !== 1 ? 's' : ''}`]);
    aoa.push([]); // fila en blanco

    const HEADER = [
      'Fecha', 'Clasificacion', 'Categoria', 'Descripcion', 'Referencia',
      'Proveedor', 'Origen', 'Tasa', 'Monto USD', 'Monto Bs', 'Viene de CxP',
    ];
    const headerRowIdx = aoa.length; // 0-based, para el formato numerico
    aoa.push(HEADER);

    // Indices (0-based) de columnas numericas para el formato.
    const RATE = 7, USD = 8, BS = 9;

    let grandUsd = 0, grandBs = 0;
    let cxpUsd = 0, cxpBs = 0;
    for (const exp of expenses) {
      const clasif = EXPENSE_TYPE_LABELS[exp.category?.expenseType === 'FIXED' ? 'FIXED' : 'EXTRAORDINARY'];
      grandUsd += exp.amountUsd; grandBs += exp.amountBs;
      if (exp.payable) { cxpUsd += exp.amountUsd; cxpBs += exp.amountBs; }
      const origen = exp.isCredit
        ? `Credito${exp.payable?.number ? ' (CxP ' + exp.payable.number + ')' : ''}`
        : (exp.method?.name || 'Contado');
      aoa.push([
        this.caracasDate(exp.date),
        clasif,
        exp.category?.name || '—',
        exp.description || '',
        exp.reference || '',
        exp.supplier?.name || '',
        origen,
        exp.exchangeRate || null,
        exp.amountUsd || 0,
        exp.amountBs || 0,
        exp.payable ? 'Si' : '',
      ]);
    }

    // Fila(s) de TOTALES + desglose de CxP para no duplicar al sumar Gastos + CxP.
    if (expenses.length > 0) {
      const totalRow = new Array(HEADER.length).fill(null);
      totalRow[3] = 'TOTAL GENERAL';
      totalRow[USD] = Math.round(grandUsd * 100) / 100;
      totalRow[BS] = Math.round(grandBs * 100) / 100;
      aoa.push([]);
      aoa.push(totalRow);

      if (cxpUsd > 0) {
        const propioUsd = Math.round((grandUsd - cxpUsd) * 100) / 100;
        const propioBs = Math.round((grandBs - cxpBs) * 100) / 100;
        const propioRow = new Array(HEADER.length).fill(null);
        propioRow[3] = 'Gastos propios (sin CxP)';
        propioRow[USD] = propioUsd;
        propioRow[BS] = propioBs;
        aoa.push(propioRow);

        const cxpRow = new Array(HEADER.length).fill(null);
        cxpRow[3] = 'Vienen de CxP (ya contados en Cuentas por Pagar)';
        cxpRow[USD] = Math.round(cxpUsd * 100) / 100;
        cxpRow[BS] = Math.round(cxpBs * 100) / 100;
        aoa.push(cxpRow);
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 11 }, { wch: 14 }, { wch: 26 }, { wch: 40 }, { wch: 16 },
      { wch: 26 }, { wch: 22 }, { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 12 },
    ];

    // Formato numerico (#,##0.00) a las columnas de tasa/monto de la tabla y los totales.
    const range = XLSX.utils.decode_range(ws['!ref'] as string);
    for (let R = headerRowIdx + 1; R <= range.e.r; R++) {
      for (const C of [RATE, USD, BS]) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[addr];
        if (cell && cell.t === 'n') cell.z = '#,##0.00';
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Gastos');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
