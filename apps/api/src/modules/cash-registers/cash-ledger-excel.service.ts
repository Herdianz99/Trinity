import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { CashRegistersService } from './cash-registers.service';
import { PrismaService } from '../../prisma/prisma.service';

// Etiquetas humanas del origen de cada fila (espejo de la pantalla /cash/ledger/entries).
const SOURCE_LABELS: Record<string, string> = {
  SALE_PAYMENT: 'Venta',
  CHANGE: 'Vuelto',
  RECEIPT_COLLECTION: 'Cobro CxC',
  RECEIPT_PAYMENT: 'Pago CxP',
  EXPENSE: 'Gasto',
  CUSTOMER_ADVANCE: 'Anticipo cliente',
  SUPPLIER_ADVANCE: 'Anticipo proveedor',
  MANUAL: 'Mov. manual',
  REINTEGRO: 'Reintegro',
};

@Injectable()
export class CashLedgerExcelService {
  constructor(
    private readonly cashService: CashRegistersService,
    private readonly prisma: PrismaService,
  ) {}

  // Fecha-hora en Caracas (el negocio opera en UTC-4). Nunca toISOString (cae al dia siguiente).
  private caracasDateTime(d: Date): string {
    return new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(d));
  }

  /**
   * Excel PLANO y editable del libro mayor de caja: una fila por movimiento, respetando
   * exactamente los mismos filtros de la pantalla (misma fuente que el PDF detallado).
   * Los montos van con SIGNO segun la direccion (egreso negativo) para que sumen el neto,
   * cada uno en la columna de su moneda.
   */
  async generateLedgerExcel(filters: {
    cashRegisterId?: string; userIds?: string[]; sessionId?: string;
    from?: string; to?: string; methodIds?: string[];
    sourceType?: string; currency?: string; onlyCash?: boolean;
  }): Promise<Buffer> {
    const { rows, summary, meta } = await this.cashService.getLedgerEntriesForReport(filters);

    const config = await this.prisma.companyConfig.findFirst().catch(() => null);
    const company = config?.companyName || 'Trinity ERP';

    const period = meta.from || meta.to ? `${meta.from || '...'} a ${meta.to || '...'}` : 'Todas las fechas';
    const filtros: string[] = [`Caja: ${meta.registerName}`, `Cajero: ${meta.cashierName}`];
    if (meta.methodNames.length) filtros.push(`Metodos: ${meta.methodNames.join(', ')}`);
    if (meta.sourceType) filtros.push(`Origen: ${SOURCE_LABELS[meta.sourceType] || meta.sourceType}`);
    if (meta.currency) filtros.push(`Moneda: ${meta.currency}`);
    if (meta.onlyCash) filtros.push('Solo efectivo de gaveta');

    // Bloque de encabezado (filas informativas antes de la tabla).
    const aoa: any[][] = [];
    aoa.push([company]);
    aoa.push(['Libro mayor de caja']);
    aoa.push([`Periodo: ${period}`]);
    aoa.push([filtros.join('     ')]);
    aoa.push([`Generado: ${this.caracasDateTime(new Date())}`]);
    aoa.push([]); // fila en blanco

    const HEADER = [
      'Fecha y hora', 'Caja', 'Cajero', 'Origen', 'Documento', 'Tercero / Cliente',
      'Referencia', 'Metodo', 'Tipo', 'Moneda', 'Monto USD', 'Monto Bs',
    ];
    aoa.push(HEADER);

    const USD = 10, BS = 11; // indices de columnas de monto
    for (const r of rows) {
      const isOut = r.direction === 'OUT';
      const signedUsd = isOut ? -r.amountUsd : r.amountUsd;
      const signedBs = isOut ? -r.amountBs : r.amountBs;
      aoa.push([
        this.caracasDateTime(r.createdAt),
        r.registerName || '',
        r.cashierName || '',
        SOURCE_LABELS[r.sourceType] || r.sourceType || '',
        r.docNumber && r.docNumber !== '—' ? r.docNumber : '',
        r.partyName || '',
        r.reference && r.reference !== '—' ? r.reference : '',
        r.methodName || '',
        isOut ? 'Egreso' : 'Ingreso',
        r.currency,
        r.currency === 'USD' ? signedUsd : null,
        r.currency === 'BS' ? signedBs : null,
      ]);
    }

    // Totales (respetan filtros). Egresos en negativo para cuadrar con la columna con signo.
    aoa.push([]);
    const totalLabel = (label: string, u: number | null, b: number | null) => {
      const row = new Array(12).fill(null);
      row[9] = label;
      row[USD] = u;
      row[BS] = b;
      return row;
    };
    aoa.push(totalLabel('Ingresos', summary.inUsd, summary.inBs));
    aoa.push(totalLabel('Egresos', -summary.outUsd, -summary.outBs));
    aoa.push(totalLabel('Neto', summary.netUsd, summary.netBs));
    aoa.push(totalLabel('Neto efectivo (gaveta)', summary.cashNetUsd, summary.cashNetBs));

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Ancho de columnas
    ws['!cols'] = [
      { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 16 },
      { wch: 26 }, { wch: 16 }, { wch: 18 }, { wch: 9 }, { wch: 8 },
      { wch: 14 }, { wch: 16 },
    ];

    // Formato numerico (#,##0.00) a las columnas de monto.
    const range = XLSX.utils.decode_range(ws['!ref'] as string);
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (const C of [USD, BS]) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[addr];
        if (cell && cell.t === 'n') cell.z = '#,##0.00';
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Libro mayor');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
