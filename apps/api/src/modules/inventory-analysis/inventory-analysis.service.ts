import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';

// Umbrales de clasificación de alertas de inventario (fijos en código).
// Para cambiarlos: ajustar aquí y actualizar el texto en apps/web/src/lib/metrics-help.ts
const DIAS_RECIEN_INGRESADO = 10; // < 10 días sin ventas => "Recién ingresado" (neutro)
const DIAS_STOCK_MUERTO = 28;     // > 28 días sin ventas => "Stock muerto" (rojo); intermedio => "Nuevo sin rotación" (naranja)
const DIAS_EXCESO = 180;          // > 180 días de inventario (vendiendo) => "Exceso"

@Injectable()
export class InventoryAnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ABC Classification: Products ranked by sales contribution
   */
  async getAbcClassification(from: string, to: string) {
    const fromDate = caracasDayStart(from);
    const toDate = caracasDayEnd(to);

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
      };
    });
  }

  /**
   * Rotation analysis: How fast products sell relative to stock
   */
  async getRotation(from: string, to: string) {
    const fromDate = caracasDayStart(from);
    const toDate = caracasDayEnd(to);

    const periodDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)));

    // Get sales by product in period
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

    const salesMap = new Map<string, number>();
    for (const item of items) {
      const effectiveQty = item.quantity - (item.returnedQty || 0);
      if (effectiveQty <= 0) continue;
      salesMap.set(item.productId, (salesMap.get(item.productId) || 0) + effectiveQty);
    }

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
      const dailySalesAvg = unitsSold / periodDays;

      return {
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        category: p.category?.name || '',
        currentStock,
        minStock: p.minStock,
        unitsSold: Math.round(unitsSold * 100) / 100,
        rotationRate: Math.round(rotationRate * 100) / 100,
        daysOfInventory: Math.round(daysOfInventory),
        dailySalesAvg: Math.round(dailySalesAvg * 100) / 100,
        costUsd: p.costUsd,
        inventoryValueUsd: Math.round(currentStock * p.costUsd * 100) / 100,
        reorderAlert: currentStock <= p.minStock && currentStock >= 0,
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
    const abc = await this.getAbcClassification(from, to);
    const rotation = await this.getRotation(from, to);

    const classA = abc.filter((p) => p.classification === 'A');
    const classB = abc.filter((p) => p.classification === 'B');
    const classC = abc.filter((p) => p.classification === 'C');

    const totalInventoryValueUsd = rotation.reduce((s, p) => s + p.inventoryValueUsd, 0);
    const productsWithAlert = rotation.filter((p) => p.reorderAlert).length;
    const deadStockProducts = rotation.filter((p) => p.deadStockAlert).length;
    const excessStockProducts = rotation.filter((p) => p.excessStockAlert).length;

    const topProduct = abc.length > 0 ? { name: abc[0].productName, salesUsd: abc[0].totalSalesUsd } : null;

    // Most profitable
    const profitability = await this.getProfitability(from, to);
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
   * Purchase suggestions: products below min stock grouped by supplier
   */
  async getPurchaseSuggestions(from: string, to: string) {
    const fromDate = caracasDayStart(from);
    const toDate = caracasDayEnd(to);
    const periodDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)));

    // Get sales in period
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
    const salesMap = new Map<string, number>();
    for (const item of items) {
      const effectiveQty = item.quantity - (item.returnedQty || 0);
      if (effectiveQty <= 0) continue;
      salesMap.set(item.productId, (salesMap.get(item.productId) || 0) + effectiveQty);
    }

    // Products below min stock
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
    }[] = [];

    for (const p of products) {
      const currentStock = p.stock.reduce((s, st) => s + st.quantity, 0);
      if (currentStock > p.minStock) continue;

      const unitsSold = salesMap.get(p.id) || 0;
      const dailySalesAvg = unitsSold / periodDays;
      const suggestedQty = Math.max(Math.ceil(dailySalesAvg * 30), Math.ceil(p.minStock - currentStock));

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
        supplier: { select: { name: true } },
        category: { select: { name: true } },
        stock: { select: { quantity: true } },
      },
    });
    const productIds = products.map((p) => p.id);

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
      const bajoMinimo = currentStock > 0 && currentStock <= p.minStock;
      const exceso = currentStock > 0 && periodSales > 0 && daysOfInventory > DIAS_EXCESO;

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
        inventoryValueUsd: Math.round(Math.max(currentStock, 0) * p.costUsd * 100) / 100,
        lastEntryDate: entryDate.toISOString(),
        lastEntrySource,
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
