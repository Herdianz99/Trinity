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

  private fmt(n: number): string {
    return (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private caracasDateTime(d: Date): string {
    return new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(d));
  }

  // Nombre del TIPO de documento de un item (espejo del PDF detallado).
  private itemTypeName(itemType: string): string {
    switch (itemType) {
      case 'RECEIVABLE':
      case 'PAYABLE': return 'Factura';
      case 'CREDIT_NOTE': return 'Nota de Credito';
      case 'DEBIT_NOTE': return 'Nota de Debito';
      case 'IVA_RETENTION':
      case 'SALES_IVA_RETENTION':
      case 'PURCHASE_IVA_RETENTION': return 'Retencion IVA';
      case 'PURCHASE_ISLR_RETENTION': return 'Retencion ISLR';
      case 'CUSTOMER_ADVANCE':
      case 'SUPPLIER_ADVANCE': return 'Anticipo';
      case 'DIFFERENTIAL': return 'Diferencial';
      default: return '';
    }
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

  // Excel DETALLADO: una fila por documento cobrado/pagado (factura -> HABER, nota/retencion
  // -> DEBE), con los datos del recibo repetidos en cada fila para poder filtrar/ordenar en
  // Excel. El neto del recibo y los metodos de pago van solo en la primera fila del recibo.
  // Misma fuente y filtros que el PDF detallado (receiptsService.reportListDetailed).
  async generateDetailed(query: QueryReceiptsDto): Promise<Buffer> {
    const isPayment = query.type === 'PAYMENT';
    const [config, receiptsRaw] = await Promise.all([
      this.prisma.companyConfig.findFirst().catch(() => null),
      this.receiptsService.reportListDetailed(query),
    ]);
    const company = config?.companyName || 'Trinity ERP';
    const entityHeader = isPayment ? 'Proveedor' : 'Cliente';
    const title = isPayment ? 'Listado detallado de Recibos de Pago' : 'Listado detallado de Recibos de Cobro';

    // Mas reciente primero (igual que el PDF detallado).
    const receipts = [...(receiptsRaw as any[])].sort((a, b) => {
      const da = new Date(a.documentDate ?? a.createdAt).getTime();
      const db = new Date(b.documentDate ?? b.createdAt).getTime();
      return db - da;
    });

    const filtros: string[] = [];
    if (query.search) filtros.push(`Busqueda: "${query.search}"`);
    filtros.push(query.status ? `Estado: ${STATUS_LABELS[query.status] || query.status}` : 'Todos los estados');
    if (query.from || query.to) filtros.push(`Fechas: ${query.from || '...'} a ${query.to || '...'}`);

    const aoa: any[][] = [];
    aoa.push([company]);
    aoa.push([title]);
    aoa.push([filtros.join('     ')]);
    aoa.push([`Generado: ${this.caracasDateTime(new Date())}     ${receipts.length} recibo${receipts.length !== 1 ? 's' : ''}`]);
    aoa.push([]);

    const HEADER = [
      'Fecha', 'N° Recibo', entityHeader, 'RIF', 'Estado', 'Tipo', 'N° Documento',
      'Debe USD', 'Haber USD', 'Neto recibo USD', 'Metodos de pago',
    ];
    const headerRowIdx = aoa.length; // 0-based, para el formato numerico
    aoa.push(HEADER);

    // Indices (0-based) de columnas numericas.
    const DEBE = 7, HABER = 8, NETO = 9;

    let gDebe = 0, gHaber = 0;
    for (const r of receipts) {
      const entity = r.customer || r.supplier;
      const rif = entity?.rif ? `${entity.documentType ? entity.documentType + '-' : ''}${entity.rif}` : '';
      const estado = STATUS_LABELS[r.status] || r.status;
      const fecha = this.receiptDate(r);

      const items = (r.items || [])
        .filter((it: any) => Math.abs(it.amountUsd || 0) > 0.0001)
        .sort((a: any, b: any) => (b.sign || 1) - (a.sign || 1));
      let rDebe = 0, rHaber = 0;
      for (const it of items) {
        if ((it.sign || 1) < 0) rDebe += Math.abs(it.amountUsd || 0);
        else rHaber += Math.abs(it.amountUsd || 0);
      }
      const rNet = Math.round((rHaber - rDebe) * 100) / 100;
      gDebe += rDebe; gHaber += rHaber;

      const pays = (r.payments || []).filter((p: any) => (p.amountUsd || 0) > 0.0001);
      const metodos = pays.map((p: any) => `${p.method?.name || 'Pago'} $${this.fmt(p.amountUsd)}`).join('  ·  ');

      if (items.length === 0) {
        // Recibo sin items con monto: al menos una fila con el neto.
        aoa.push([fecha, r.number, entity?.name || r.platformName || '—', rif, estado, '', '', null, null, rNet, metodos]);
        continue;
      }
      items.forEach((it: any, i: number) => {
        const neg = (it.sign || 1) < 0;
        const monto = Math.abs(it.amountUsd || 0);
        aoa.push([
          fecha, r.number, entity?.name || r.platformName || '—', rif, estado,
          this.itemTypeName(it.itemType), it.description || '',
          neg ? monto : null,
          neg ? null : monto,
          i === 0 ? rNet : null,       // neto del recibo solo en la 1a fila
          i === 0 ? metodos : '',      // metodos de pago solo en la 1a fila
        ]);
      });
    }

    // Fila de TOTALES generales.
    if (receipts.length > 0) {
      const totalRow = new Array(HEADER.length).fill(null);
      totalRow[5] = 'TOTALES';
      totalRow[DEBE] = Math.round(gDebe * 100) / 100;
      totalRow[HABER] = Math.round(gHaber * 100) / 100;
      totalRow[NETO] = Math.round((gHaber - gDebe) * 100) / 100;
      aoa.push([]);
      aoa.push(totalRow);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 11 }, { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 11 }, { wch: 16 }, { wch: 22 },
      { wch: 13 }, { wch: 13 }, { wch: 15 }, { wch: 34 },
    ];

    const range = XLSX.utils.decode_range(ws['!ref'] as string);
    for (let R = headerRowIdx + 1; R <= range.e.r; R++) {
      for (const C of [DEBE, HABER, NETO]) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[addr];
        if (cell && cell.t === 'n') cell.z = '#,##0.00';
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isPayment ? 'Recibos pago (det)' : 'Recibos cobro (det)');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
