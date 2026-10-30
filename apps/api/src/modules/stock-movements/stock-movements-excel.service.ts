import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { StockMovementsService } from './stock-movements.service';

const TYPE_LABELS: Record<string, string> = {
  PURCHASE: 'Compra',
  SALE: 'Venta',
  ADJUSTMENT_IN: 'Ajuste +',
  ADJUSTMENT_OUT: 'Ajuste -',
  TRANSFER_IN: 'Transfer. entrada',
  TRANSFER_OUT: 'Transfer. salida',
  COUNT_ADJUST: 'Ajuste conteo',
  RETURN_IN: 'Devolucion +',
  RETURN_OUT: 'Devolucion -',
  REPLACEMENT_IN: 'Reemplazo +',
  REPLACEMENT_OUT: 'Reemplazo -',
};

// Caracas es UTC-4 fijo (sin horario de verano).
const CARACAS_OFFSET_MS = 4 * 3600 * 1000;

// Excel PLANO de /inventory/movements: una fila por movimiento con los mismos filtros del
// listado y autofiltro en los encabezados, para filtrar/ordenar por columna en Excel.
@Injectable()
export class StockMovementsExcelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movements: StockMovementsService,
  ) {}

  async generate(filters: {
    productId?: string;
    warehouseId?: string;
    type?: string;
    supplierId?: string;
    search?: string;
    from?: string;
    to?: string;
    serie?: string;
  }): Promise<Buffer> {
    const [{ rows, summary }, config] = await Promise.all([
      this.movements.getExcelRows(filters),
      this.prisma.companyConfig.findFirst().catch(() => null),
    ]);
    const company = config?.companyName || 'Trinity ERP';

    const filterParts: string[] = [];
    if (summary.from || summary.to) filterParts.push(`Fechas: ${summary.from || '…'} a ${summary.to || '…'}`);
    if (summary.type) filterParts.push(`Tipo: ${TYPE_LABELS[summary.type] || summary.type}`);
    if (summary.warehouseName) filterParts.push(`Almacén: ${summary.warehouseName}`);
    if (summary.supplierName) filterParts.push(`Proveedor: ${summary.supplierName}`);
    if (summary.product) filterParts.push(`Producto: ${summary.product}`);
    if (summary.serie) filterParts.push(summary.serie);
    if (filters.search?.trim()) filterParts.push(`Búsqueda: "${filters.search.trim()}"`);

    const aoa: any[][] = [];
    aoa.push([company]);
    aoa.push(['Movimientos de Stock']);
    aoa.push([filterParts.length ? filterParts.join('   •   ') : 'Sin filtros (todos los movimientos)']);
    aoa.push([`${rows.length} movimiento${rows.length !== 1 ? 's' : ''}. Fechas en horario Caracas. Costo = costo + brecha (ventas: el del momento de facturar).`]);
    aoa.push([]);

    const HEADER = [
      'Fecha', 'Hora', 'Tipo', 'Entrada/Salida', 'Código', 'Producto', 'Categoría', 'Marca',
      'Proveedor (ficha)', 'Almacén', 'Cantidad', 'Existencia después', 'Documento', 'Serie', 'Fiscal',
      'Cliente / Proveedor', 'Vendedor', 'Usuario', 'Motivo', 'Costo unit. USD', 'Costo total USD',
      'Precio venta unit. USD', 'Descuento %', 'Total venta USD',
    ];
    const headerRowIdx = aoa.length;
    aoa.push(HEADER);

    for (const r of rows) {
      // Fecha como número de serie de Excel (no un Date: SheetJS lo corre según la zona horaria).
      const c = new Date(r.createdAt.getTime() - CARACAS_OFFSET_MS);
      const serial =
        (Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86400000;
      const hora = `${String(c.getUTCHours()).padStart(2, '0')}:${String(c.getUTCMinutes()).padStart(2, '0')}`;
      aoa.push([
        serial, hora, TYPE_LABELS[r.type] || r.type, r.direction, r.code, r.name, r.category, r.brand,
        r.productSupplier, r.warehouse, r.quantity, r.stockAfter, r.reference, r.serie, r.fiscal,
        r.party, r.seller, r.user, r.reason, r.unitCost, r.lineCost,
        r.salePrice, r.discountPct, r.saleTotal,
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({ s: { r: headerRowIdx, c: 0 }, e: { r: aoa.length - 1, c: HEADER.length - 1 } }),
    };
    ws['!cols'] = [
      { wch: 11 }, { wch: 6 }, { wch: 16 }, { wch: 9 }, { wch: 12 }, { wch: 45 }, { wch: 22 }, { wch: 14 },
      { wch: 24 }, { wch: 16 }, { wch: 10 }, { wch: 11 }, { wch: 16 }, { wch: 12 }, { wch: 7 },
      { wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 30 }, { wch: 12 }, { wch: 13 },
      { wch: 12 }, { wch: 10 }, { wch: 13 },
    ];

    // Formatos: fecha, cantidades y montos (los vacíos de columnas de venta quedan en blanco).
    const FECHA = 0, QTY = [10, 11], MONEY = [19, 20, 21, 23], PCT = 22;
    for (let R = headerRowIdx + 1; R < aoa.length; R++) {
      const cell = (C: number) => ws[XLSX.utils.encode_cell({ r: R, c: C })];
      const f = cell(FECHA);
      if (f) f.z = 'dd/mm/yyyy';
      for (const C of QTY) { const x = cell(C); if (x && x.t === 'n') x.z = '#,##0.##'; }
      for (const C of MONEY) { const x = cell(C); if (x && x.t === 'n') x.z = '#,##0.00'; }
      const p = cell(PCT);
      if (p && p.t === 'n') p.z = '0.##';
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true, bookSST: true }) as Buffer;
  }
}
