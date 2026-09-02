import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';

// Excel del Analisis de Inventario (pantalla /purchases/analysis). Un libro con una hoja
// por seccion: Resumen, Clasificacion ABC, Rotacion, Rentabilidad y Sugerencias de compra.
// Los datos ya vienen calculados por InventoryAnalysisService (mismas fuentes que la UI).
@Injectable()
export class InventoryAnalysisExportExcelService {
  constructor(private readonly prisma: PrismaService) {}

  private async getCompanyName(): Promise<string> {
    const config = await this.prisma.companyConfig.findFirst().catch(() => null);
    return config?.companyName || 'Trinity ERP';
  }

  private caracasDateTime(d: Date): string {
    return new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);
  }

  // Aplica formato #,##0.00 a las columnas numericas indicadas (por indice).
  private formatNumericCols(ws: XLSX.WorkSheet, cols: number[], fmt = '#,##0.00') {
    if (!ws['!ref']) return;
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (const C of cols) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell && cell.t === 'n') cell.z = fmt;
      }
    }
  }

  private rotationAlertLabel(p: any): string {
    const tags: string[] = [];
    if (p.reorderAlert) tags.push('Stock bajo');
    if (p.excessStockAlert) tags.push('Exceso');
    if (p.deadStockAlert) tags.push('Sin movimiento');
    return tags.join(', ');
  }

  async generate(
    from: string,
    to: string,
    data: { summary: any; abc: any[]; rotation: any[]; profitability: any[]; suggestions: any },
  ): Promise<Buffer> {
    const company = await this.getCompanyName();
    const wb = XLSX.utils.book_new();
    const { summary, abc, rotation, profitability, suggestions } = data;

    // ── Hoja 1: Resumen ──────────────────────────────────
    const resumen: any[][] = [
      [company],
      ['Analisis de Inventario'],
      [`Periodo: ${from} a ${to}`],
      [`Generado: ${this.caracasDateTime(new Date())}`],
      [],
      ['Productos analizados', summary?.totalProducts ?? 0],
      ['Valor inventario (USD)', summary?.totalInventoryValueUsd ?? 0],
      ['Productos con alerta de stock', summary?.productsWithAlert ?? 0],
      ['Productos stock muerto', summary?.deadStockProducts ?? 0],
      ['Productos exceso de stock', summary?.excessStockProducts ?? 0],
      [],
      ['Clasificacion', 'Productos', '% de ventas'],
      ['Clase A', summary?.classA?.count ?? 0, summary?.classA?.salesPct ?? 0],
      ['Clase B', summary?.classB?.count ?? 0, summary?.classB?.salesPct ?? 0],
      ['Clase C', summary?.classC?.count ?? 0, summary?.classC?.salesPct ?? 0],
      [],
      ['Producto top', summary?.topProduct?.name ?? '—', summary?.topProduct?.salesUsd ?? 0],
      ['Mas rentable', summary?.mostProfitable?.name ?? '—', summary?.mostProfitable?.marginPct ?? 0],
    ];
    const wsResumen = XLSX.utils.aoa_to_sheet(resumen);
    wsResumen['!cols'] = [{ wch: 32 }, { wch: 22 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

    // ── Hoja 2: Clasificacion ABC ────────────────────────
    const abcAoa: any[][] = [[
      'Clase', 'Codigo', 'Producto', 'Categoria', 'Ventas USD', 'Uds. vendidas',
      '% total', '% acumulado', 'Stock', 'Stock min.', 'Costo USD', 'Precio detal',
      'Margen %', 'Valor inv. USD',
    ]];
    for (const p of abc || []) {
      abcAoa.push([
        p.classification, p.productCode, p.productName, p.category,
        p.totalSalesUsd, p.totalUnitsSold, p.salesPct, p.cumulativePct,
        p.currentStock, p.minStock, p.costUsd, p.priceDetal,
        p.grossMarginPct, p.inventoryValueUsd,
      ]);
    }
    const wsAbc = XLSX.utils.aoa_to_sheet(abcAoa);
    wsAbc['!cols'] = [
      { wch: 6 }, { wch: 14 }, { wch: 40 }, { wch: 20 }, { wch: 13 }, { wch: 12 },
      { wch: 9 }, { wch: 12 }, { wch: 9 }, { wch: 10 }, { wch: 11 }, { wch: 12 },
      { wch: 9 }, { wch: 14 },
    ];
    this.formatNumericCols(wsAbc, [4, 6, 7, 10, 11, 12, 13]);
    XLSX.utils.book_append_sheet(wb, wsAbc, 'ABC');

    // ── Hoja 3: Rotacion ─────────────────────────────────
    const rotAoa: any[][] = [[
      'Codigo', 'Producto', 'Categoria', 'Stock', 'Stock min.', 'Ventas periodo',
      'Rotacion', 'Dias inventario', 'Venta/dia', 'Costo USD', 'Valor inv. USD', 'Alertas',
    ]];
    for (const p of rotation || []) {
      rotAoa.push([
        p.productCode, p.productName, p.category, p.currentStock, p.minStock, p.unitsSold,
        p.rotationRate, p.daysOfInventory > 9000 ? 'Sin rotacion' : p.daysOfInventory,
        p.dailySalesAvg, p.costUsd, p.inventoryValueUsd, this.rotationAlertLabel(p),
      ]);
    }
    const wsRot = XLSX.utils.aoa_to_sheet(rotAoa);
    wsRot['!cols'] = [
      { wch: 14 }, { wch: 40 }, { wch: 20 }, { wch: 9 }, { wch: 10 }, { wch: 13 },
      { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 11 }, { wch: 14 }, { wch: 28 },
    ];
    this.formatNumericCols(wsRot, [6, 8, 9, 10]);
    XLSX.utils.book_append_sheet(wb, wsRot, 'Rotacion');

    // ── Hoja 4: Rentabilidad ─────────────────────────────
    const profAoa: any[][] = [[
      'Codigo', 'Producto', 'Categoria', 'Ventas USD', 'Costo USD', 'Ganancia USD', 'Margen %', 'Uds.',
    ]];
    let tRev = 0, tCost = 0, tProfit = 0;
    for (const p of profitability || []) {
      tRev += p.revenue; tCost += p.cost; tProfit += p.grossProfit;
      profAoa.push([
        p.productCode, p.productName, p.category, p.revenue, p.cost, p.grossProfit,
        p.grossMarginPct, p.unitsSold,
      ]);
    }
    if ((profitability || []).length > 0) {
      profAoa.push([]);
      profAoa.push(['TOTAL', '', '', Math.round(tRev * 100) / 100, Math.round(tCost * 100) / 100, Math.round(tProfit * 100) / 100, '', '']);
    }
    const wsProf = XLSX.utils.aoa_to_sheet(profAoa);
    wsProf['!cols'] = [
      { wch: 14 }, { wch: 40 }, { wch: 20 }, { wch: 13 }, { wch: 12 }, { wch: 13 }, { wch: 9 }, { wch: 8 },
    ];
    this.formatNumericCols(wsProf, [3, 4, 5, 6]);
    XLSX.utils.book_append_sheet(wb, wsProf, 'Rentabilidad');

    // ── Hoja 5: Sugerencias de compra ────────────────────
    const sugAoa: any[][] = [[
      'Proveedor', 'Codigo', 'Producto', 'Stock', 'Stock min.', 'Sugerido', 'Costo unit. USD', 'Costo total USD',
    ]];
    for (const g of suggestions?.suppliers || []) {
      for (const it of g.items || []) {
        sugAoa.push([
          g.supplierName, it.productCode, it.productName, it.currentStock, it.minStock,
          it.suggestedQty, it.costUsd, it.estimatedCost,
        ]);
      }
    }
    if ((suggestions?.suppliers || []).length > 0) {
      sugAoa.push([]);
      sugAoa.push(['INVERSION TOTAL ESTIMADA', '', '', '', '', '', '', suggestions?.grandTotal ?? 0]);
    }
    const wsSug = XLSX.utils.aoa_to_sheet(sugAoa);
    wsSug['!cols'] = [
      { wch: 28 }, { wch: 14 }, { wch: 40 }, { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 16 },
    ];
    this.formatNumericCols(wsSug, [6, 7]);
    XLSX.utils.book_append_sheet(wb, wsSug, 'Sugerencias compra');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
