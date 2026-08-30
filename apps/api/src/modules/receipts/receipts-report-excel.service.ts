import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { ReceiptsService } from './receipts.service';
import { QueryReceiptsDto } from './dto/query-receipts.dto';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  POSTED: 'Procesado',
  CANCELLED: 'Cancelado',
};

// Excel PLANO del reporte de recibos (pantallas /receipts/collection y /receipts/payment):
// una fila por recibo, respetando EXACTAMENTE los mismos filtros de la lista (misma fuente
// que el PDF resumen: receiptsService.reportList) + una fila de TOTALES al final.
@Injectable()
export class ReceiptsReportExcelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receiptsService: ReceiptsService,
  ) {}

  // documentDate es date-only (medianoche UTC de la fecha-Caracas) -> se formatea en UTC,
  // igual que la lista, o la fecha se corre un dia. Si falta, cae a createdAt en Caracas.
  private receiptDate(r: any): string {
    if (r.documentDate) {
      return new Date(r.documentDate).toLocaleDateString('es-VE', { timeZone: 'UTC' });
    }
    return new Date(r.createdAt).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' });
  }

  private caracasDateTime(d: Date): string {
    return new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(d));
  }

  async generate(query: QueryReceiptsDto): Promise<Buffer> {
    const isPayment = query.type === 'PAYMENT';
    const [config, receipts] = await Promise.all([
      this.prisma.companyConfig.findFirst().catch(() => null),
      this.receiptsService.reportList(query),
    ]);
    const company = config?.companyName || 'Trinity ERP';
    const entityHeader = isPayment ? 'Proveedor' : 'Cliente';
    const title = isPayment ? 'Reporte de Recibos de Pago' : 'Reporte de Recibos de Cobro';

    // Descripcion de los filtros aplicados (constancia en el encabezado).
    const filtros: string[] = [];
    if (query.search) filtros.push(`Busqueda: "${query.search}"`);
    filtros.push(query.status ? `Estado: ${STATUS_LABELS[query.status] || query.status}` : 'Todos los estados');
    if (query.from || query.to) filtros.push(`Fechas: ${query.from || '...'} a ${query.to || '...'}`);

    // Bloque de encabezado (filas informativas antes de la tabla).
    const aoa: any[][] = [];
    aoa.push([company]);
    aoa.push([title]);
    aoa.push([filtros.join('     ')]);
    aoa.push([`Generado: ${this.caracasDateTime(new Date())}     ${receipts.length} recibo${receipts.length !== 1 ? 's' : ''}`]);
    aoa.push([]); // fila en blanco

    const HEADER = [
      'N° Recibo', entityHeader, 'RIF', 'Vendedor', 'Fecha', 'Estado', 'Tasa',
      'Total USD', 'Total Bs hist.', 'Total Bs hoy', 'Diferencial Bs',
    ];
    aoa.push(HEADER);

    // Indices de columnas numericas (para formato #,##0.00).
    const RATE = 6, USD = 7, BS_HIST = 8, BS_TODAY = 9, DIFF = 10;

    let totalUsd = 0, totalBsHist = 0, totalBsToday = 0, totalDiff = 0;
    for (const r of receipts as any[]) {
      const entity = (isPayment ? r.supplier : r.customer) || r.customer || r.supplier;
      totalUsd += r.totalUsd || 0;
      totalBsHist += r.totalBsHistoric || 0;
      totalBsToday += r.totalBsToday || 0;
      totalDiff += r.differentialBs || 0;
      aoa.push([
        r.number,
        entity?.name || r.platformName || '—',
        entity?.rif || '',
        r.seller?.name || '',
        this.receiptDate(r),
        STATUS_LABELS[r.status] || r.status,
        r.exchangeRate || null,
        r.totalUsd || 0,
        r.totalBsHistoric || 0,
        r.totalBsToday || 0,
        r.hasDifferential ? (r.differentialBs || 0) : null,
      ]);
    }

    // Fila de TOTALES.
    if (receipts.length > 0) {
      const totalRow = new Array(HEADER.length).fill(null);
      totalRow[5] = 'TOTALES';
      totalRow[USD] = Math.round(totalUsd * 100) / 100;
      totalRow[BS_HIST] = Math.round(totalBsHist * 100) / 100;
      totalRow[BS_TODAY] = Math.round(totalBsToday * 100) / 100;
      totalRow[DIFF] = Math.round(totalDiff * 100) / 100;
      aoa.push([]);
      aoa.push(totalRow);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 22 }, { wch: 11 }, { wch: 11 },
      { wch: 11 }, { wch: 13 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
    ];

    // Formato numerico (#,##0.00) a las columnas de monto/tasa.
    const range = XLSX.utils.decode_range(ws['!ref'] as string);
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (const C of [RATE, USD, BS_HIST, BS_TODAY, DIFF]) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[addr];
        if (cell && cell.t === 'n') cell.z = '#,##0.00';
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isPayment ? 'Recibos de pago' : 'Recibos de cobro');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
