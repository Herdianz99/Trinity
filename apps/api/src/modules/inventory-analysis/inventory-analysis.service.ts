import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDayStart, caracasDayEnd, caracasDateKey } from '../../common/timezone';
import { resolveBregaPct, effectiveCost, round2 } from '../../common/pricing';
import { buildCategoryBregaMap } from '../../common/category-brega';

// Umbrales de clasificación de alertas de inventario (fijos en código).
// Para cambiarlos: ajustar aquí y actualizar el texto en apps/web/src/lib/metrics-help.ts
const DIAS_RECIEN_INGRESADO = 10; // < 10 días sin ventas => "Recién ingresado" (neutro)
const DIAS_STOCK_MUERTO = 28;     // > 28 días sin ventas => "Stock muerto" (rojo); intermedio => "Nuevo sin rotación" (naranja)
const DIAS_EXCESO = 180;          // > 180 días de inventario (vendiendo) => "Exceso"

// Urgencia de compra por COBERTURA (días que dura el stock al ritmo de venta del período).
// Solo cuenta para productos que rotan; un producto en 0 que no se vende no es urgente.
const DIAS_COBERTURA_CRITICA = 7;  // <= 7 días => "Crítico"
const DIAS_COBERTURA_BAJA = 15;    // <= 15 días => "Bajo"
const DIAS_COBERTURA_OBJETIVO = 30; // la sugerencia de compra repone para 30 días
const DIAS_HISTORIA_AGOTADOS = 180; // si estuvo agotado todo el período, su ritmo se toma de los últimos 180 días

export type StockUrgency = 'AGOTADO' | 'CRITICO' | 'BAJO';

/** Urgencia y cobertura (días) de un producto. dailySales = unidades/día. */
function stockUrgency(stock: number, minStock: number, dailySales: number): { urgency: StockUrgency | null; daysOfCoverage: number | null } {
  if (dailySales > 0) {
    if (stock <= 0) return { urgency: 'AGOTADO', daysOfCoverage: 0 };
    const days = stock / dailySales;
    const urgency = days <= DIAS_COBERTURA_CRITICA ? 'CRITICO'
      : days <= DIAS_COBERTURA_BAJA || (minStock > 0 && stock <= minStock) ? 'BAJO' : null;
    return { urgency, daysOfCoverage: Math.round(days * 10) / 10 };
  }
  // Sin ventas: solo alerta si tiene un minimo cargado y esta por debajo.
  if (minStock > 0 && stock <= minStock) return { urgency: stock <= 0 ? 'AGOTADO' : 'BAJO', daysOfCoverage: null };
  return { urgency: null, daysOfCoverage: null };
}

@Injectable()
export class InventoryAnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  /** Unidades vendidas por producto (neto de devoluciones) en un rango. */
  private async unitsSoldByProduct(fromDate: Date, toDate: Date): Promise<Map<string, number>> {
    const items = await this.prisma.invoiceItem.findMany({
      where: {
        invoice: {
          status: { in: ['PAID', 'PARTIAL_RETURN'] },
          type: 'SALE',
          createdAt: { gte: fromDate, lte: toDate },
        },
      },
      select: { productId: true, quantity: true, returnedQty: true },
    });
    const map = new Map<string, number>();
    for (const item of items) {
      const effectiveQty = item.quantity - (item.returnedQty || 0);
      if (effectiveQty <= 0) continue;
      map.set(item.productId, (map.get(item.productId) || 0) + effectiveQty);
    }
    return map;
  }

  /**
   * Venta diaria de cada producto: la del período; si no vendió nada en el período y está
   * agotado (no pudo vender), se usa su ritmo de los últimos DIAS_HISTORIA_AGOTADOS días.
   */
  private async dailySalesRates(fromDate: Date, toDate: Date, periodDays: number) {
    const histFrom = new Date(Math.min(fromDate.getTime(), toDate.getTime() - DIAS_HISTORIA_AGOTADOS * 86400000));
    const [period, history] = await Promise.all([
      this.unitsSoldByProduct(fromDate, toDate),
      this.unitsSoldByProduct(histFrom, toDate),
    ]);
    const histDays = Math.max(1, Math.round((toDate.getTime() - histFrom.getTime()) / 86400000));
    return {
      period,
      /** rate(productId, stock) -> { daily, fromHistory } */
      rate: (productId: string, stock: number) => {
        const sold = period.get(productId) || 0;
        if (sold > 0) return { daily: sold / periodDays, fromHistory: false };
        if (stock <= 0) {
          const h = history.get(productId) || 0;
          if (h > 0) return { daily: h / histDays, fromHistory: true };
        }
        return { daily: 0, fromHistory: false };
      },
    };
  }

  /**
   * ABC Classification: Products ranked by sales contribution
   */
  async getAbcClassification(from: string, to: string) {
    const fromDate = caracasDayStart(from);
    const toDate = caracasDayEnd(to);
    const periodDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)));

    // Get all invoice items in period from PAID invoices (type SALE)
    const items = await this.prisma.invoiceItem.findMany({
      where: {
        invoice: {
          status: { in: ['PAID', 'PARTIAL_RETURN'] },
          type: 'SALE',
          createdAt: { gte: fromDate, lte: toDate },
        },
      },
      select: {
        productId: true,
        productName: true,
        quantity: true,
        totalUsd: true,
        ivaAmount: true,
        returnedQty: true,
        invoice: { select: { serie: { select: { isFiscal: true } } } },
      },
    });

    // Aggregate by product (using effective quantity = quantity - returnedQty)
    // Rule: if serie is fiscal, IVA goes to SENIAT (subtract from revenue). If non-fiscal, IVA is profit.
    const productMap = new Map<string, { productId: string; productName: string; totalSalesUsd: number; totalUnitsSold: number }>();
    for (const item of items) {
      const effectiveQty = item.quantity - (item.returnedQty || 0);
      if (effectiveQty <= 0) continue;
      const isFiscal = item.invoice?.serie?.isFiscal ?? false;
      const baseAmount = isFiscal ? item.totalUsd - (item.ivaAmount || 0) : item.totalUsd;
      const effectiveRevenue = baseAmount * (effectiveQty / item.quantity);
      const existing = productMap.get(item.productId);
      if (existing) {
        existing.totalSalesUsd += effectiveRevenue;
        existing.totalUnitsSold += effectiveQty;
      } else {
        productMap.set(item.productId, {
          productId: item.productId,
          productName: item.productName,
          totalSalesUsd: effectiveRevenue,
          totalUnitsSold: effectiveQty,
        });
      }
    }

    // Sort by sales DESC
    const sorted = Array.from(productMap.values()).sort((a, b) => b.totalSalesUsd - a.totalSalesUsd);
    const grandTotal = sorted.reduce((s, p) => s + p.totalSalesUsd, 0);

    // Get product details (stock, cost, prices, category)
    const productIds = sorted.map((p) => p.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        code: true,
        name: true,
        costUsd: true,
        priceDetal: true,
        minStock: true,
        isService: true,
        isActive: true,
        category: { select: { name: true } },
        stock: { select: { quantity: true } },
      },
    });
    const productDetailsMap = new Map(products.map((p) => [p.id, p]));

    // Classify ABC
    let cumulativePct = 0;
    return sorted.map((p) => {
      const salesPct = grandTotal > 0 ? (p.totalSalesUsd / grandTotal) * 100 : 0;
      cumulativePct += salesPct;
      const classification = cumulativePct <= 80 ? 'A' : cumulativePct <= 95 ? 'B' : 'C';

      const detail = productDetailsMap.get(p.productId);
      const currentStock = detail?.stock?.reduce((s, st) => s + st.quantity, 0) || 0;
      const costUsd = detail?.costUsd || 0;
      const priceDetal = detail?.priceDetal || 0;
      const grossMarginPct = priceDetal > 0 ? ((priceDetal - costUsd) / priceDetal) * 100 : 0;
      const dailySalesAvg = p.totalUnitsSold / periodDays;
      // Servicios y productos desactivados no se compran: sin urgencia
      const { urgency, daysOfCoverage } = !detail || detail.isService || !detail.isActive
        ? { urgency: null, daysOfCoverage: null }
        : stockUrgency(currentStock, detail?.minStock || 0, dailySalesAvg);

      return {
        productId: p.productId,
        productCode: detail?.code || '',
        productName: detail?.name || p.productName,
        category: detail?.category?.name || '',
        classification,
        totalSalesUsd: Math.round(p.totalSalesUsd * 100) / 100,
        totalUnitsSold: Math.round(p.totalUnitsSold * 100) / 100,
        salesPct: Math.round(salesPct * 100) / 100,
        cumulativePct: Math.round(cumulativePct * 100) / 100,
        currentStock,
        minStock: detail?.minStock || 0,
        costUsd,
        priceDetal,
        grossMarginPct: Math.round(grossMarginPct * 100) / 100,
        inventoryValueUsd: Math.round(currentStock * costUsd * 100) / 100,
        dailySalesAvg: Math.round(dailySalesAvg * 100) / 100,
        daysOfCoverage,
        urgency,
      };
    });
  }

  /** Clase ABC por producto (solo los que vendieron en el período). */
  private async abcClassMap(from: string, to: string): Promise<Map<string, 'A' | 'B' | 'C'>> {
    const abc = await this.getAbcClassification(from, to);
    return new Map(abc.map((p) => [p.productId, p.classification as 'A' | 'B' | 'C']));
  }

  /**
   * Rotation analysis: How fast products sell relative to stock
   */
  async getRotation(from: string, to: string, abcPrecomputed?: { productId: string; classification: string }[]) {
    const fromDate = caracasDayStart(from);
    const toDate = caracasDayEnd(to);

    const periodDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)));

    // Ventas del período (+ ritmo histórico para los que estuvieron agotados) y clase ABC
    // (si quien llama ya calculó el ABC, se reusa para no repetir la consulta).
    const [{ period: salesMap, rate }, classMap] = await Promise.all([
      this.dailySalesRates(fromDate, toDate, periodDays),
      abcPrecomputed
        ? Promise.resolve(new Map(abcPrecomputed.map((p) => [p.productId, p.classification as 'A' | 'B' | 'C'])))
        : this.abcClassMap(from, to),
    ]);

    // Get all active non-service products with stock
    const products = await this.prisma.product.findMany({
      where: { isActive: true, isService: false },
      select: {
        id: true,
        code: true,
        name: true,
        costUsd: true,
        minStock: true,
        category: { select: { name: true } },
        stock: { select: { quantity: true } },
      },
    });

    return products.map((p) => {
      const currentStock = p.stock.reduce((s, st) => s + st.quantity, 0);
      const unitsSold = salesMap.get(p.id) || 0;
      const avgStock = Math.max(currentStock, 0.01); // avoid division by zero
      const rotationRate = unitsSold / avgStock;
      const daysOfInventory = rotationRate > 0 ? periodDays / rotationRate : currentStock > 0 ? 9999 : 0;
      const { daily: dailySalesAvg, fromHistory } = rate(p.id, currentStock);
      const { urgency, daysOfCoverage } = stockUrgency(currentStock, p.minStock, dailySalesAvg);
      const classification = classMap.get(p.id) ?? null;

      return {
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        category: p.category?.name || '',
        classification,
        currentStock,
        minStock: p.minStock,
        unitsSold: Math.round(unitsSold * 100) / 100,
        rotationRate: Math.round(rotationRate * 100) / 100,
        daysOfInventory: Math.round(daysOfInventory),
        dailySalesAvg: Math.round(dailySalesAvg * 100) / 100,
        salesFromHistory: fromHistory,
        daysOfCoverage,
        urgency,
        costUsd: p.costUsd,
        inventoryValueUsd: Math.round(currentStock * p.costUsd * 100) / 100,
        // Alerta de reposicion = producto que rota y se esta acabando (o bajo su minimo).
        // Antes era "stock <= minimo", y como casi nadie tiene minimo cargado marcaba todo lo que estaba en 0.
        reorderAlert: urgency !== null,
        deadStockAlert: unitsSold === 0 && currentStock > 0,
        excessStockAlert: daysOfInventory > 180,
      };
    }).sort((a, b) => a.daysOfInventory - b.daysOfInventory);
  }

  /**
   * Profitability: Revenue vs cost per product
   */
  async getProfitability(from: string, to: string) {
    const fromDate = caracasDayStart(from);
    const toDate = caracasDayEnd(to);

    const items = await this.prisma.invoiceItem.findMany({
      where: {
        invoice: {
          status: { in: ['PAID', 'PARTIAL_RETURN'] },
          type: 'SALE',
          createdAt: { gte: fromDate, lte: toDate },
        },
      },
      select: {
        productId: true,
        productName: true,
        quantity: true,
        totalUsd: true,
        ivaAmount: true,
        costUsd: true,
        returnedQty: true,
        invoice: { select: { serie: { select: { isFiscal: true } } } },
      },
    });

    // Aggregate by product (using effective quantity = quantity - returnedQty)
    // Rule: if serie is fiscal, IVA goes to SENIAT (subtract from revenue). If non-fiscal, IVA is profit.
    const productMap = new Map<string, { productId: string; productName: string; revenue: number; cost: number; unitsSold: number }>();
    for (const item of items) {
      const effectiveQty = item.quantity - (item.returnedQty || 0);
      if (effectiveQty <= 0) continue;
      const isFiscal = item.invoice?.serie?.isFiscal ?? false;
      const baseAmount = isFiscal ? item.totalUsd - (item.ivaAmount || 0) : item.totalUsd;
      const effectiveRevenue = baseAmount * (effectiveQty / item.quantity);
      const effectiveCost = item.costUsd * effectiveQty;
      const existing = productMap.get(item.productId);
      if (existing) {
        existing.revenue += effectiveRevenue;
        existing.cost += effectiveCost;
        existing.unitsSold += effectiveQty;
      } else {
        productMap.set(item.productId, {
          productId: item.productId,
          productName: item.productName,
          revenue: effectiveRevenue,
          cost: effectiveCost,
          unitsSold: effectiveQty,
        });
      }
    }

    // Get product codes
    const productIds = Array.from(productMap.keys());
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, code: true, name: true, category: { select: { name: true } } },
    });
    const codeMap = new Map(products.map((p) => [p.id, { code: p.code, name: p.name, category: p.category?.name || '' }]));

    return Array.from(productMap.values())
      .map((p) => {
        const grossProfit = p.revenue - p.cost;
        const grossMarginPct = p.revenue > 0 ? (grossProfit / p.revenue) * 100 : 0;
        const detail = codeMap.get(p.productId);

        return {
          productId: p.productId,
          productCode: detail?.code || '',
          productName: detail?.name || p.productName,
          category: detail?.category || '',
          revenue: Math.round(p.revenue * 100) / 100,
          cost: Math.round(p.cost * 100) / 100,
          grossProfit: Math.round(grossProfit * 100) / 100,
          grossMarginPct: Math.round(grossMarginPct * 100) / 100,
          unitsSold: Math.round(p.unitsSold * 100) / 100,
        };
      })
      .sort((a, b) => b.grossProfit - a.grossProfit);
  }

  /**
   * Executive summary
   */
  async getSummary(from: string, to: string) {
    const [abc, profitability] = await Promise.all([
      this.getAbcClassification(from, to),
      this.getProfitability(from, to),
    ]);
    const rotation = await this.getRotation(from, to, abc);

    const classA = abc.filter((p) => p.classification === 'A');
    const classB = abc.filter((p) => p.classification === 'B');
    const classC = abc.filter((p) => p.classification === 'C');

    const totalInventoryValueUsd = rotation.reduce((s, p) => s + p.inventoryValueUsd, 0);
    const productsWithAlert = rotation.filter((p) => p.reorderAlert).length;
    const deadStockProducts = rotation.filter((p) => p.deadStockAlert).length;
    const excessStockProducts = rotation.filter((p) => p.excessStockAlert).length;

    const topProduct = abc.length > 0 ? { name: abc[0].productName, salesUsd: abc[0].totalSalesUsd } : null;

    // Most profitable
    const mostProfitable = profitability.length > 0 ? { name: profitability[0].productName, marginPct: profitability[0].grossMarginPct } : null;

    return {
      totalProducts: abc.length,
      classA: { count: classA.length, salesPct: classA.reduce((s, p) => s + p.salesPct, 0) },
      classB: { count: classB.length, salesPct: classB.reduce((s, p) => s + p.salesPct, 0) },
      classC: { count: classC.length, salesPct: classC.reduce((s, p) => s + p.salesPct, 0) },
      totalInventoryValueUsd: Math.round(totalInventoryValueUsd * 100) / 100,
      productsWithAlert,
      deadStockProducts,
      excessStockProducts,
      topProduct,
      mostProfitable,
    };
  }

  /**
   * Resumen gerencial de inventario (una sola llamada). 3 bloques:
   *  - salud: Índice 5S (promedio + por zona) y daños/merma del período (módulo de almacén)
   *  - alertasRotacion: valor de inventario, bajo mínimo y stock muerto (top listas)
   *  - exactitud: diferencias del último conteo físico aprobado (unidades y $)
   * Gateado solo por AuthGuard (como el resto de analysis); mezcla datos de módulos con
   * permisos distintos, por eso se resuelve server-side en un endpoint gerencial.
   */
  async getManagerSummary(from: string, to: string) {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const fromKey = caracasDateKey(from);
    const toKey = caracasDateKey(to);

    // ── Salud: Auditoría 5S ──
    const audits = await this.prisma.audit5S.findMany({
      where: { date: { gte: fromKey, lte: toKey } },
      select: { zone: true, scoreCleanliness: true, scoreOrder: true, scoreSafety: true },
    });
    const idxOf = (a: { scoreCleanliness: number; scoreOrder: number; scoreSafety: number }) =>
      Math.round(((a.scoreCleanliness + a.scoreOrder + a.scoreSafety) / 15) * 100);
    const audit5sAvg = audits.length ? Math.round(audits.reduce((s, a) => s + idxOf(a), 0) / audits.length) : null;
    const zoneMap: Record<string, { sum: number; n: number }> = {};
    for (const a of audits) {
      const z = zoneMap[a.zone] || { sum: 0, n: 0 };
      z.sum += idxOf(a); z.n += 1; zoneMap[a.zone] = z;
    }
    const audit5sByZone = Object.entries(zoneMap)
      .map(([zone, { sum, n }]) => ({ zone, avgIndex: Math.round(sum / n), count: n }))
      .sort((a, b) => a.avgIndex - b.avgIndex);

    // ── Salud: Reportes de daño / merma ──
    const reports = await this.prisma.damageReport.findMany({
      where: { date: { gte: fromKey, lte: toKey } },
      select: {
        status: true, resolution: true,
        items: { select: { quantity: true, product: { select: { costUsd: true } } } },
      },
    });
    const byStatus: Record<string, number> = {};
    let damagedUnits = 0, mermaUnits = 0, mermaCostUsd = 0, mermaCount = 0, reemplazoCount = 0;
    for (const rep of reports) {
      byStatus[rep.status] = (byStatus[rep.status] || 0) + 1;
      const units = rep.items.reduce((s, i) => s + i.quantity, 0);
      damagedUnits += units;
      if (rep.status === 'PROCESADO' && rep.resolution === 'MERMA') {
        mermaCount += 1; mermaUnits += units;
        mermaCostUsd += rep.items.reduce((s, i) => s + i.quantity * (i.product?.costUsd || 0), 0);
      }
      if (rep.status === 'PROCESADO' && rep.resolution === 'REEMPLAZO') reemplazoCount += 1;
    }

    // ── Alertas y rotación (reusa getRotation) ──
    const rotation = await this.getRotation(from, to);
    const totalInventoryValueUsd = r2(rotation.reduce((s, p) => s + p.inventoryValueUsd, 0));
    const lowStock = rotation.filter((p) => p.reorderAlert);
    const deadStock = rotation.filter((p) => p.deadStockAlert);
    const topDeadStock = [...deadStock]
      .sort((a, b) => b.inventoryValueUsd - a.inventoryValueUsd)
      .slice(0, 5)
      .map((p) => ({ code: p.productCode, name: p.productName, stock: p.currentStock, valueUsd: p.inventoryValueUsd }));
    const topLowStock = lowStock
      .slice(0, 5)
      .map((p) => ({ code: p.productCode, name: p.productName, stock: p.currentStock, minStock: p.minStock }));

    // ── Exactitud: último conteo físico aprobado ──
    const lastCount = await this.prisma.inventoryCount.findFirst({
      where: { status: 'APPROVED' },
      orderBy: { updatedAt: 'desc' },
      select: {
        updatedAt: true,
        warehouse: { select: { name: true } },
        items: { select: { systemQuantity: true, countedQuantity: true, product: { select: { costUsd: true } } } },
      },
    });
    let exactitud: any = null;
    if (lastCount) {
      let itemsCounted = 0, withDiff = 0, faltUnits = 0, sobrUnits = 0, faltUsd = 0, sobrUsd = 0;
      for (const it of lastCount.items) {
        if (it.countedQuantity == null) continue;
        itemsCounted += 1;
        const diff = it.countedQuantity - it.systemQuantity;
        const cost = it.product?.costUsd || 0;
        if (diff < 0) { faltUnits += -diff; faltUsd += -diff * cost; withDiff += 1; }
        else if (diff > 0) { sobrUnits += diff; sobrUsd += diff * cost; withDiff += 1; }
      }
      exactitud = {
        date: lastCount.updatedAt,
        warehouse: lastCount.warehouse?.name || null,
        itemsCounted, withDiff,
        faltUnits: r2(faltUnits), sobrUnits: r2(sobrUnits),
        faltUsd: r2(faltUsd), sobrUsd: r2(sobrUsd), netUsd: r2(sobrUsd - faltUsd),
      };
    }

    return {
      period: { from, to },
      salud: {
        audit5sAvg, audit5sCount: audits.length, audit5sByZone,
        damage: {
          totalReports: reports.length, byStatus,
          damagedUnits: r2(damagedUnits),
          mermaCount, mermaUnits: r2(mermaUnits), mermaCostUsd: r2(mermaCostUsd),
          reemplazoCount,
        },
      },
      alertasRotacion: { totalInventoryValueUsd, lowStockCount: lowStock.length, deadStockCount: deadStock.length, topLowStock, topDeadStock },
      exactitud,
    };
  }

  /**
   * Sugerencias de compra: productos que ROTAN y se están acabando (agotados, cobertura
   * <= 15 días) o bajo su mínimo, ordenados por prioridad (urgencia + clase ABC) y
   * agrupados por proveedor. Reponen para DIAS_COBERTURA_OBJETIVO días descontando el stock.
   */
  async getPurchaseSuggestions(from: string, to: string, abcPrecomputed?: { productId: string; classification: string }[]) {
    const fromDate = caracasDayStart(from);
    const toDate = caracasDayEnd(to);
    const periodDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)));

    const [{ rate }, classMap] = await Promise.all([
      this.dailySalesRates(fromDate, toDate, periodDays),
      abcPrecomputed
        ? Promise.resolve(new Map(abcPrecomputed.map((p) => [p.productId, p.classification as 'A' | 'B' | 'C'])))
        : this.abcClassMap(from, to),
    ]);

    const products = await this.prisma.product.findMany({
      where: { isActive: true, isService: false },
      select: {
        id: true,
        code: true,
        name: true,
        costUsd: true,
        minStock: true,
        supplierId: true,
        supplier: { select: { id: true, name: true } },
        stock: { select: { quantity: true } },
      },
    });

    const suggestions: {
      productId: string;
      productCode: string;
      productName: string;
      currentStock: number;
      minStock: number;
      suggestedQty: number;
      costUsd: number;
      estimatedCost: number;
      supplierId: string | null;
      supplierName: string;
      classification: 'A' | 'B' | 'C' | null;
      dailySalesAvg: number;
      salesFromHistory: boolean;
      daysOfCoverage: number | null;
      urgency: StockUrgency;
    }[] = [];

    for (const p of products) {
      const currentStock = p.stock.reduce((s, st) => s + st.quantity, 0);
      const { daily: dailySalesAvg, fromHistory } = rate(p.id, currentStock);
      const { urgency, daysOfCoverage } = stockUrgency(currentStock, p.minStock, dailySalesAvg);
      if (!urgency) continue;

      // Reponer para 30 dias de venta descontando lo que hay (o hasta el minimo, lo que sea mayor)
      const suggestedQty = Math.max(
        1,
        Math.ceil(dailySalesAvg * DIAS_COBERTURA_OBJETIVO - Math.max(currentStock, 0)),
        Math.ceil(p.minStock - currentStock),
      );
      const classification = classMap.get(p.id) ?? null;

      suggestions.push({
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        currentStock,
        minStock: p.minStock,
        suggestedQty,
        costUsd: p.costUsd,
        estimatedCost: Math.round(suggestedQty * p.costUsd * 100) / 100,
        supplierId: p.supplierId,
        supplierName: p.supplier?.name || 'Sin proveedor',
        classification,
        dailySalesAvg: Math.round(dailySalesAvg * 100) / 100,
        salesFromHistory: fromHistory,
        daysOfCoverage,
        urgency,
      });
    }

    // Group by supplier
    const supplierMap = new Map<string, { supplierId: string | null; supplierName: string; items: typeof suggestions; totalEstimated: number }>();
    for (const s of suggestions) {
      const key = s.supplierId || '__none__';
      const existing = supplierMap.get(key);
      if (existing) {
        existing.items.push(s);
        existing.totalEstimated += s.estimatedCost;
      } else {
        supplierMap.set(key, {
          supplierId: s.supplierId,
          supplierName: s.supplierName,
          items: [s],
          totalEstimated: s.estimatedCost,
        });
      }
    }

    const grouped = Array.from(supplierMap.values()).sort((a, b) => b.totalEstimated - a.totalEstimated);
    const grandTotal = grouped.reduce((s, g) => s + g.totalEstimated, 0);

    return { suppliers: grouped, grandTotal: Math.round(grandTotal * 100) / 100 };
  }

  /**
   * Inventory alerts: agotados, bajo mínimo, sin rotación (por antigüedad de última compra), exceso.
   * Devuelve una sola lista; el frontend filtra por reporte. El período solo afecta el cálculo de Exceso.
   */
  async getInventoryAlerts(from: string, to: string) {
    const fromDate = caracasDayStart(from);
    const toDate = caracasDayEnd(to);
    const periodDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)));
    const now = new Date();

    // 1. Productos activos no-servicio con stock, costo, proveedor, categoría
    const products = await this.prisma.product.findMany({
      where: { isActive: true, isService: false },
      select: {
        id: true,
        code: true,
        name: true,
        supplierRef: true,
        costUsd: true,
        minStock: true,
        createdAt: true,
        supplierId: true,
        categoryId: true,
        bregaApplies: true,
        supplier: { select: { name: true } },
        category: { select: { name: true } },
        stock: { select: { quantity: true } },
      },
    });
    const productIds = products.map((p) => p.id);

    // Brecha: para valorar el exceso/stock muerto al costo real (costo + brecha).
    // Misma fórmula centralizada que precios (bregaApplies + brecha de categoría raíz o global).
    const config = await this.prisma.companyConfig.findUnique({ where: { id: 'singleton' } });
    const bregaGlobalPct = config?.bregaGlobalPct || 0;
    const catBregaMap = await buildCategoryBregaMap(this.prisma);

    // 2. Última compra por producto (StockMovement tipo PURCHASE)
    const lastPurchases = await this.prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { type: 'PURCHASE', productId: { in: productIds } },
      _max: { createdAt: true },
    });
    const lastPurchaseMap = new Map<string, Date>();
    for (const lp of lastPurchases) {
      if (lp._max.createdAt) lastPurchaseMap.set(lp.productId, lp._max.createdAt);
    }

    // 3. Última venta por producto (StockMovement tipo SALE)
    const lastSales = await this.prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { type: 'SALE', productId: { in: productIds } },
      _max: { createdAt: true },
    });
    const lastSaleMap = new Map<string, Date>();
    for (const ls of lastSales) {
      if (ls._max.createdAt) lastSaleMap.set(ls.productId, ls._max.createdAt);
    }

    // 3b. Último movimiento de stock de cualquier tipo (para la "fecha de agotamiento"):
    // en un producto agotado (stock <= 0), el movimiento más reciente es justo el que lo
    // dejó en ese nivel, así que su fecha es cuándo quedó (y sigue) agotado.
    const lastMovements = await this.prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _max: { createdAt: true },
    });
    const lastMovementMap = new Map<string, Date>();
    for (const lm of lastMovements) {
      if (lm._max.createdAt) lastMovementMap.set(lm.productId, lm._max.createdAt);
    }

    // 4. Ventas del período seleccionado (para rotación => Exceso)
    const periodItems = await this.prisma.invoiceItem.findMany({
      where: {
        invoice: {
          status: { in: ['PAID', 'PARTIAL_RETURN'] },
          type: 'SALE',
          createdAt: { gte: fromDate, lte: toDate },
        },
      },
      select: { productId: true, quantity: true, returnedQty: true },
    });
    const periodSalesMap = new Map<string, number>();
    for (const it of periodItems) {
      const eff = it.quantity - (it.returnedQty || 0);
      if (eff <= 0) continue;
      periodSalesMap.set(it.productId, (periodSalesMap.get(it.productId) || 0) + eff);
    }

    const MS_DAY = 1000 * 60 * 60 * 24;

    const items = products.map((p) => {
      const currentStock = p.stock.reduce((s, st) => s + st.quantity, 0);

      // Antigüedad: última compra, o createdAt si nunca se compró
      const lastPurchase = lastPurchaseMap.get(p.id) || null;
      const entryDate = lastPurchase || p.createdAt;
      const lastEntrySource: 'PURCHASE' | 'CREATED' = lastPurchase ? 'PURCHASE' : 'CREATED';
      const daysSinceEntry = Math.floor((now.getTime() - entryDate.getTime()) / MS_DAY);

      // ¿Vendió algo desde su última entrada?
      const lastSale = lastSaleMap.get(p.id) || null;
      const soldSinceEntry = !!lastSale && lastSale.getTime() >= entryDate.getTime();

      // Rotación del período (para exceso)
      const periodSales = periodSalesMap.get(p.id) || 0;
      const rotation = currentStock > 0 ? periodSales / currentStock : 0;
      const daysOfInventory = rotation > 0 ? Math.round(periodDays / rotation) : currentStock > 0 ? 9999 : 0;

      // Clasificación "sin rotación" (solo con stock y sin ventas desde la entrada)
      let sinRotacion: null | 'RECIEN_INGRESADO' | 'NUEVO_SIN_ROTACION' | 'STOCK_MUERTO' = null;
      if (currentStock > 0 && !soldSinceEntry) {
        if (daysSinceEntry < DIAS_RECIEN_INGRESADO) sinRotacion = 'RECIEN_INGRESADO';
        else if (daysSinceEntry <= DIAS_STOCK_MUERTO) sinRotacion = 'NUEVO_SIN_ROTACION';
        else sinRotacion = 'STOCK_MUERTO';
      }

      const agotado = currentStock <= 0;
      const negativo = currentStock < 0; // sobrevendido: existencia por debajo de 0 (subconjunto de agotado)

      // Fecha de agotamiento: solo para agotados, = fecha del último movimiento de stock.
      const lastMovement = lastMovementMap.get(p.id) || null;
      const outOfStockDate = agotado && lastMovement ? lastMovement.toISOString() : null;
      const daysOutOfStock = agotado && lastMovement
        ? Math.floor((now.getTime() - lastMovement.getTime()) / MS_DAY)
        : null;
      const bajoMinimo = currentStock > 0 && currentStock <= p.minStock;
      const exceso = currentStock > 0 && periodSales > 0 && daysOfInventory > DIAS_EXCESO;

      // Costo real con brecha (brecha se suma al costo, regla de negocio) y valor del stock
      // parado a ese costo — útil para dimensionar el dinero atado en exceso / stock muerto.
      const bregaPct = resolveBregaPct({
        bregaApplies: p.bregaApplies,
        categoryBregaPct: p.categoryId ? (catBregaMap.get(p.categoryId) ?? 0) : 0,
        bregaGlobalPct,
      });
      const costoConBrechaUsd = round2(effectiveCost(p.costUsd, bregaPct));
      const inventoryValueBregaUsd = round2(Math.max(currentStock, 0) * costoConBrechaUsd);

      return {
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        supplierRef: p.supplierRef || '',
        category: p.category?.name || '',
        supplierId: p.supplierId,
        supplierName: p.supplier?.name || 'Sin proveedor',
        currentStock,
        minStock: p.minStock,
        costUsd: p.costUsd,
        bregaPct,
        costoConBrechaUsd,
        inventoryValueBregaUsd,
        inventoryValueUsd: Math.round(Math.max(currentStock, 0) * p.costUsd * 100) / 100,
        lastEntryDate: entryDate.toISOString(),
        lastEntrySource,
        outOfStockDate,
        daysOutOfStock,
        daysSinceEntry,
        soldSinceEntry,
        periodSales: Math.round(periodSales * 100) / 100,
        daysOfInventory,
        alerts: { agotado, negativo, bajoMinimo, sinRotacion, exceso },
      };
    });

    return { items, periodDays };
  }
}
