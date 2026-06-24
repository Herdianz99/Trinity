import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceStatus } from '@prisma/client';
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseDateRange(fromStr: string, toStr: string) {
  const from = caracasDayStart(fromStr || undefined);
  const to = caracasDayEnd(toStr || undefined);
  return { from, to };
}

const PAID_STATUSES: InvoiceStatus[] = ['PAID', 'PARTIAL_RETURN', 'RETURNED'];

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────────────
  // 1. Sales by Period
  // ──────────────────────────────────────────────────────
  async salesByPeriod(fromStr: string, toStr: string, groupBy: string) {
    const { from, to } = parseDateRange(fromStr, toStr);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: { in: PAID_STATUSES },
        paidAt: { gte: from, lte: to },
      },
      select: {
        totalUsd: true,
        totalBs: true,
        subtotalUsd: true,
        ivaUsd: true,
        paidAt: true,
      },
    });

    const groups = new Map<string, {
      label: string;
      totalUsd: number;
      totalBs: number;
      invoiceCount: number;
      subtotalUsd: number;
      ivaUsd: number;
    }>();

    for (const inv of invoices) {
      const d = inv.paidAt || new Date();
      const key = this.getGroupKey(d, groupBy);
      const label = this.getGroupLabel(d, groupBy);

      if (!groups.has(key)) {
        groups.set(key, { label, totalUsd: 0, totalBs: 0, invoiceCount: 0, subtotalUsd: 0, ivaUsd: 0 });
      }
      const g = groups.get(key)!;
      g.totalUsd += inv.totalUsd;
      g.totalBs += inv.totalBs;
      g.subtotalUsd += inv.subtotalUsd;
      g.ivaUsd += inv.ivaUsd;
      g.invoiceCount += 1;
    }

    const rows = Array.from(groups.values())
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(g => ({
        ...g,
        totalUsd: round2(g.totalUsd),
        totalBs: round2(g.totalBs),
        subtotalUsd: round2(g.subtotalUsd),
        ivaUsd: round2(g.ivaUsd),
        avgTicketUsd: g.invoiceCount > 0 ? round2(g.totalUsd / g.invoiceCount) : 0,
      }));

    const totals = {
      totalUsd: round2(rows.reduce((s, r) => s + r.totalUsd, 0)),
      totalBs: round2(rows.reduce((s, r) => s + r.totalBs, 0)),
      invoiceCount: rows.reduce((s, r) => s + r.invoiceCount, 0),
      subtotalUsd: round2(rows.reduce((s, r) => s + r.subtotalUsd, 0)),
      ivaUsd: round2(rows.reduce((s, r) => s + r.ivaUsd, 0)),
      avgTicketUsd: 0,
    };
    totals.avgTicketUsd = totals.invoiceCount > 0 ? round2(totals.totalUsd / totals.invoiceCount) : 0;

    const bestRow = rows.reduce((best, r) => r.totalUsd > (best?.totalUsd || 0) ? r : best, rows[0]);

    return { rows, totals, bestPeriod: bestRow?.label || '' };
  }

  private getGroupKey(d: Date, groupBy: string): string {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate();
    switch (groupBy) {
      case 'hour': return `${y}-${m}-${day}-${d.getUTCHours()}`;
      case 'week': {
        const jan1 = new Date(Date.UTC(y, 0, 1));
        const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7);
        return `${y}-W${week}`;
      }
      case 'month': return `${y}-${String(m + 1).padStart(2, '0')}`;
      default: return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  private getGroupLabel(d: Date, groupBy: string): string {
    const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    switch (groupBy) {
      case 'hour': return `${d.getUTCHours()}:00`;
      case 'week': {
        const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7);
        return `Semana ${week}`;
      }
      case 'month': return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
      default: return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
    }
  }

  // ──────────────────────────────────────────────────────
  // 2. Sales by Seller
  // ──────────────────────────────────────────────────────
  async salesBySeller(fromStr: string, toStr: string, sellerId?: string) {
    const { from, to } = parseDateRange(fromStr, toStr);

    const where: any = {
      status: { in: PAID_STATUSES },
      paidAt: { gte: from, lte: to },
    };
    if (sellerId) where.sellerId = sellerId;

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        seller: { select: { code: true, name: true } },
        items: {
          select: { productId: true, productName: true, quantity: true, totalUsd: true },
        },
      },
    });

    // Returns (credit notes)
    const returns = await this.prisma.creditDebitNote.findMany({
      where: {
        type: 'NCV',
        status: 'POSTED',
        // Date the return actually happened (set on post), not appliedAt which
        // only fills when the note is later cruzada en un recibo.
        documentDate: { gte: from, lte: to },
        ...(sellerId ? { invoice: { sellerId } } : {}),
      },
      select: {
        totalUsd: true,
        invoice: { select: { sellerId: true } },
      },
    });

    const returnMap = new Map<string, { count: number; amountUsd: number }>();
    for (const r of returns) {
      const sid = r.invoice?.sellerId;
      if (!sid) continue;
      if (!returnMap.has(sid)) returnMap.set(sid, { count: 0, amountUsd: 0 });
      const rm = returnMap.get(sid)!;
      rm.count += 1;
      rm.amountUsd += r.totalUsd;
    }

    const sellerMap = new Map<string, {
      sellerCode: string;
      sellerName: string;
      invoiceCount: number;
      totalUsd: number;
      totalBs: number;
      productMap: Map<string, { name: string; units: number; totalUsd: number }>;
    }>();

    for (const inv of invoices) {
      const sid = inv.sellerId || '__sin_vendedor';
      if (!sellerMap.has(sid)) {
        sellerMap.set(sid, {
          sellerCode: inv.seller?.code || '—',
          sellerName: inv.seller?.name || 'Sin vendedor',
          invoiceCount: 0,
          totalUsd: 0,
          totalBs: 0,
          productMap: new Map(),
        });
      }
      const s = sellerMap.get(sid)!;
      s.invoiceCount += 1;
      s.totalUsd += inv.totalUsd;
      s.totalBs += inv.totalBs;

      for (const item of inv.items) {
        if (!s.productMap.has(item.productId)) {
          s.productMap.set(item.productId, { name: item.productName, units: 0, totalUsd: 0 });
        }
        const p = s.productMap.get(item.productId)!;
        p.units += item.quantity;
        p.totalUsd += item.totalUsd;
      }
    }

    const rows = Array.from(sellerMap.entries()).map(([sid, s]) => {
      const ret = returnMap.get(sid) || { count: 0, amountUsd: 0 };
      const topProducts = Array.from(s.productMap.values())
        .sort((a, b) => b.totalUsd - a.totalUsd)
        .slice(0, 5)
        .map(p => ({ name: p.name, units: round2(p.units), totalUsd: round2(p.totalUsd) }));

      return {
        sellerCode: s.sellerCode,
        sellerName: s.sellerName,
        invoiceCount: s.invoiceCount,
        totalUsd: round2(s.totalUsd),
        totalBs: round2(s.totalBs),
        avgTicketUsd: s.invoiceCount > 0 ? round2(s.totalUsd / s.invoiceCount) : 0,
        returnCount: ret.count,
        returnAmountUsd: round2(ret.amountUsd),
        topProducts,
      };
    }).sort((a, b) => b.totalUsd - a.totalUsd);

    const totals = {
      totalUsd: round2(rows.reduce((s, r) => s + r.totalUsd, 0)),
      invoiceCount: rows.reduce((s, r) => s + r.invoiceCount, 0),
      avgTicketUsd: 0,
    };
    totals.avgTicketUsd = totals.invoiceCount > 0 ? round2(totals.totalUsd / totals.invoiceCount) : 0;

    return { rows, totals, topSeller: rows[0]?.sellerName || '' };
  }

  // ──────────────────────────────────────────────────────
  // 3. Sales by Customer
  // ──────────────────────────────────────────────────────
  async salesByCustomer(fromStr: string, toStr: string, customerId?: string) {
    const { from, to } = parseDateRange(fromStr, toStr);

    const where: any = {
      status: { in: PAID_STATUSES },
      paidAt: { gte: from, lte: to },
    };
    if (customerId) where.customerId = customerId;

    const invoices = await this.prisma.invoice.findMany({
      where,
      select: {
        customerId: true,
        customer: { select: { name: true, rif: true, documentType: true } },
        totalUsd: true,
        paidAt: true,
      },
    });

    // CxC pendientes
    const receivables = await this.prisma.receivable.findMany({
      where: { status: 'PENDING', ...(customerId ? { customerId } : {}) },
      select: { customerId: true, amountUsd: true },
    });
    const cxcMap = new Map<string, number>();
    for (const r of receivables) {
      if (!r.customerId) continue;
      cxcMap.set(r.customerId, (cxcMap.get(r.customerId) || 0) + r.amountUsd);
    }

    const custMap = new Map<string, {
      customerName: string;
      customerRif: string;
      invoiceCount: number;
      totalUsd: number;
      lastPurchaseDate: string;
    }>();

    for (const inv of invoices) {
      const cid = inv.customerId || '__sin_cliente';
      if (!custMap.has(cid)) {
        custMap.set(cid, {
          customerName: inv.customer?.name || 'Sin cliente',
          customerRif: inv.customer ? `${inv.customer.documentType || 'V'}-${inv.customer.rif || ''}` : '',
          invoiceCount: 0,
          totalUsd: 0,
          lastPurchaseDate: '',
        });
      }
      const c = custMap.get(cid)!;
      c.invoiceCount += 1;
      c.totalUsd += inv.totalUsd;
      const pDate = inv.paidAt ? inv.paidAt.toISOString() : '';
      if (pDate > c.lastPurchaseDate) c.lastPurchaseDate = pDate;
    }

    const rows = Array.from(custMap.entries()).map(([cid, c]) => ({
      ...c,
      totalUsd: round2(c.totalUsd),
      avgTicketUsd: c.invoiceCount > 0 ? round2(c.totalUsd / c.invoiceCount) : 0,
      pendingCxcUsd: round2(cxcMap.get(cid) || 0),
    })).sort((a, b) => b.totalUsd - a.totalUsd);

    const totals = {
      uniqueCustomers: rows.length,
      totalUsd: round2(rows.reduce((s, r) => s + r.totalUsd, 0)),
      invoiceCount: rows.reduce((s, r) => s + r.invoiceCount, 0),
      avgTicketUsd: 0,
    };
    totals.avgTicketUsd = totals.invoiceCount > 0 ? round2(totals.totalUsd / totals.invoiceCount) : 0;

    return { rows, totals, topCustomer: rows[0]?.customerName || '' };
  }

  // ──────────────────────────────────────────────────────
  // 4. Sales by Product
  // ──────────────────────────────────────────────────────
  async salesByProduct(fromStr: string, toStr: string, categoryId?: string) {
    const { from, to } = parseDateRange(fromStr, toStr);

    // Get product IDs for category filter
    let productIds: string[] | undefined;
    if (categoryId) {
      const products = await this.prisma.product.findMany({
        where: { categoryId },
        select: { id: true },
      });
      productIds = products.map(p => p.id);
    }

    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: { in: PAID_STATUSES },
        paidAt: { gte: from, lte: to },
      },
      include: {
        items: true,
      },
    });

    // Build product code/category lookup
    const allProductIds = new Set<string>();
    for (const inv of invoices) {
      for (const item of inv.items) {
        if (!productIds || productIds.includes(item.productId)) {
          allProductIds.add(item.productId);
        }
      }
    }
    const productLookup = await this.prisma.product.findMany({
      where: { id: { in: Array.from(allProductIds) } },
      select: { id: true, code: true, category: { select: { name: true } } },
    });
    const prodInfo = new Map(productLookup.map(p => [p.id, { code: p.code, category: p.category?.name || 'Sin categoria' }]));

    const prodMap = new Map<string, {
      productCode: string;
      productName: string;
      category: string;
      unitsSold: number;
      totalUsd: number;
      costUsd: number;
    }>();

    for (const inv of invoices) {
      for (const item of inv.items) {
        if (productIds && !productIds.includes(item.productId)) continue;
        if (!prodMap.has(item.productId)) {
          const info = prodInfo.get(item.productId);
          prodMap.set(item.productId, {
            productCode: info?.code || '',
            productName: item.productName,
            category: info?.category || 'Sin categoria',
            unitsSold: 0,
            totalUsd: 0,
            costUsd: 0,
          });
        }
        const p = prodMap.get(item.productId)!;
        p.unitsSold += item.quantity;
        p.totalUsd += item.totalUsd;
        p.costUsd += (item.costUsd || 0) * item.quantity;
      }
    }

    const rows = Array.from(prodMap.values()).map(p => {
      const grossProfitUsd = round2(p.totalUsd - p.costUsd);
      return {
        ...p,
        unitsSold: round2(p.unitsSold),
        totalUsd: round2(p.totalUsd),
        costUsd: round2(p.costUsd),
        grossProfitUsd,
        grossMarginPct: p.totalUsd > 0 ? round2((grossProfitUsd / p.totalUsd) * 100) : 0,
      };
    }).sort((a, b) => b.totalUsd - a.totalUsd);

    const totals = {
      products: rows.length,
      totalUnits: round2(rows.reduce((s, r) => s + r.unitsSold, 0)),
      totalUsd: round2(rows.reduce((s, r) => s + r.totalUsd, 0)),
      totalCostUsd: round2(rows.reduce((s, r) => s + r.costUsd, 0)),
      totalProfitUsd: round2(rows.reduce((s, r) => s + r.grossProfitUsd, 0)),
    };

    return { rows, totals, topProduct: rows[0]?.productName || '' };
  }

  // ──────────────────────────────────────────────────────
  // 5. Comparison
  // ──────────────────────────────────────────────────────
  async comparison(p1FromStr: string, p1ToStr: string, p2FromStr: string, p2ToStr: string) {
    const p1 = parseDateRange(p1FromStr, p1ToStr);
    const p2 = parseDateRange(p2FromStr, p2ToStr);

    const [period1, period2] = await Promise.all([
      this.getPeriodStats(p1.from, p1.to),
      this.getPeriodStats(p2.from, p2.to),
    ]);

    const variationPct = period1.totalUsd > 0
      ? round2(((period2.totalUsd - period1.totalUsd) / period1.totalUsd) * 100)
      : period2.totalUsd > 0 ? 100 : 0;

    return {
      period1: { ...period1, period: { from: p1FromStr, to: p1ToStr } },
      period2: { ...period2, period: { from: p2FromStr, to: p2ToStr } },
      variationPct,
    };
  }

  private async getPeriodStats(from: Date, to: Date) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: { in: PAID_STATUSES },
        paidAt: { gte: from, lte: to },
      },
      include: {
        seller: { select: { name: true } },
        items: { select: { productName: true, totalUsd: true } },
      },
    });

    const totalUsd = round2(invoices.reduce((s, i) => s + i.totalUsd, 0));
    const invoiceCount = invoices.length;
    const avgTicketUsd = invoiceCount > 0 ? round2(totalUsd / invoiceCount) : 0;

    // Top product
    const prodMap = new Map<string, number>();
    for (const inv of invoices) {
      for (const item of inv.items) {
        prodMap.set(item.productName, (prodMap.get(item.productName) || 0) + item.totalUsd);
      }
    }
    const topProductEntry = Array.from(prodMap.entries()).sort((a, b) => b[1] - a[1])[0];

    // Top seller
    const sellerMap = new Map<string, { name: string; totalUsd: number }>();
    for (const inv of invoices) {
      const sid = inv.sellerId;
      if (!sid) continue;
      if (!sellerMap.has(sid)) sellerMap.set(sid, { name: inv.seller?.name || '', totalUsd: 0 });
      sellerMap.get(sid)!.totalUsd += inv.totalUsd;
    }
    const topSellerEntry = Array.from(sellerMap.values()).sort((a, b) => b.totalUsd - a.totalUsd)[0];

    return {
      totalUsd,
      invoiceCount,
      avgTicketUsd,
      topProduct: topProductEntry ? { name: topProductEntry[0], totalUsd: round2(topProductEntry[1]) } : null,
      topSeller: topSellerEntry ? { name: topSellerEntry.name, totalUsd: round2(topSellerEntry.totalUsd) } : null,
    };
  }

  // ──────────────────────────────────────────────────────
  // 6. Profit Margin
  // ──────────────────────────────────────────────────────
  async profitMargin(fromStr: string, toStr: string, categoryId?: string) {
    const { from, to } = parseDateRange(fromStr, toStr);

    // Get product IDs for category filter
    let productIds: string[] | undefined;
    if (categoryId) {
      const products = await this.prisma.product.findMany({
        where: { categoryId },
        select: { id: true },
      });
      productIds = products.map(p => p.id);
    }

    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: { in: PAID_STATUSES },
        paidAt: { gte: from, lte: to },
      },
      include: { items: true },
    });

    // Build product info lookup
    const allProductIds = new Set<string>();
    for (const inv of invoices) {
      for (const item of inv.items) {
        if (!productIds || productIds.includes(item.productId)) {
          allProductIds.add(item.productId);
        }
      }
    }
    const productLookup = await this.prisma.product.findMany({
      where: { id: { in: Array.from(allProductIds) } },
      select: { id: true, code: true, category: { select: { name: true } } },
    });
    const prodInfo = new Map(productLookup.map(p => [p.id, { code: p.code, category: p.category?.name || 'Sin categoria' }]));

    const prodMap = new Map<string, {
      productCode: string;
      productName: string;
      category: string;
      unitsSold: number;
      salesUsd: number;
      costUsd: number;
    }>();

    for (const inv of invoices) {
      for (const item of inv.items) {
        if (productIds && !productIds.includes(item.productId)) continue;
        if (!prodMap.has(item.productId)) {
          const info = prodInfo.get(item.productId);
          prodMap.set(item.productId, {
            productCode: info?.code || '',
            productName: item.productName,
            category: info?.category || 'Sin categoria',
            unitsSold: 0,
            salesUsd: 0,
            costUsd: 0,
          });
        }
        const p = prodMap.get(item.productId)!;
        p.unitsSold += item.quantity;
        p.salesUsd += item.totalUsd;
        p.costUsd += (item.costUsd || 0) * item.quantity;
      }
    }

    const rows = Array.from(prodMap.values()).map(p => {
      const profitUsd = round2(p.salesUsd - p.costUsd);
      const marginPct = p.salesUsd > 0 ? round2((profitUsd / p.salesUsd) * 100) : 0;
      return {
        productCode: p.productCode,
        productName: p.productName,
        category: p.category,
        unitsSold: round2(p.unitsSold),
        salesUsd: round2(p.salesUsd),
        costUsd: round2(p.costUsd),
        profitUsd,
        marginPct,
      };
    }).sort((a, b) => b.marginPct - a.marginPct);

    const totalSales = rows.reduce((s, r) => s + r.salesUsd, 0);
    const totalCost = rows.reduce((s, r) => s + r.costUsd, 0);
    const totalProfit = round2(totalSales - totalCost);
    const avgMargin = totalSales > 0 ? round2((totalProfit / totalSales) * 100) : 0;

    return {
      rows,
      totals: {
        totalSalesUsd: round2(totalSales),
        totalCostUsd: round2(totalCost),
        totalProfitUsd: totalProfit,
        avgMarginPct: avgMargin,
      },
      mostProfitable: rows[0]?.productName || '',
    };
  }

  // ──────────────────────────────────────────────────────
  // 7. Top Customers
  // ──────────────────────────────────────────────────────
  async topCustomers(fromStr: string, toStr: string, limit = 20) {
    const { from, to } = parseDateRange(fromStr, toStr);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: { in: PAID_STATUSES },
        paidAt: { gte: from, lte: to },
        customerId: { not: null },
      },
      select: {
        customerId: true,
        customer: { select: { name: true, rif: true, documentType: true } },
        totalUsd: true,
        paidAt: true,
      },
    });

    const custMap = new Map<string, {
      customerName: string;
      customerRif: string;
      visits: number;
      totalUsd: number;
      lastPurchaseDate: Date;
    }>();

    for (const inv of invoices) {
      const cid = inv.customerId!;
      if (!custMap.has(cid)) {
        custMap.set(cid, {
          customerName: inv.customer!.name,
          customerRif: `${inv.customer!.documentType || 'V'}-${inv.customer!.rif || ''}`,
          visits: 0,
          totalUsd: 0,
          lastPurchaseDate: inv.paidAt!,
        });
      }
      const c = custMap.get(cid)!;
      c.visits += 1;
      c.totalUsd += inv.totalUsd;
      if (inv.paidAt && inv.paidAt > c.lastPurchaseDate) c.lastPurchaseDate = inv.paidAt;
    }

    const now = new Date();
    const rows = Array.from(custMap.values())
      .map(c => ({
        ...c,
        totalUsd: round2(c.totalUsd),
        avgTicketUsd: c.visits > 0 ? round2(c.totalUsd / c.visits) : 0,
        daysSinceLastPurchase: Math.floor((now.getTime() - c.lastPurchaseDate.getTime()) / 86400000),
        lastPurchaseDate: c.lastPurchaseDate.toISOString(),
      }))
      .sort((a, b) => b.totalUsd - a.totalUsd)
      .slice(0, limit);

    return {
      rows,
      totals: {
        totalCustomers: custMap.size,
        totalUsd: round2(Array.from(custMap.values()).reduce((s, c) => s + c.totalUsd, 0)),
      },
      mostFrequent: Array.from(custMap.values()).sort((a, b) => b.visits - a.visits)[0]?.customerName || '',
      topBuyer: rows[0]?.customerName || '',
    };
  }

  // ──────────────────────────────────────────────────────
  // 8. Peak Hours
  // ──────────────────────────────────────────────────────
  async peakHours(fromStr: string, toStr: string) {
    const { from, to } = parseDateRange(fromStr, toStr);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: { in: PAID_STATUSES },
        paidAt: { gte: from, lte: to },
      },
      select: { totalUsd: true, paidAt: true },
    });

    const hours = new Array(24).fill(null).map((_, i) => ({
      hour: i,
      label: `${String(i).padStart(2, '0')}:00`,
      invoiceCount: 0,
      totalUsd: 0,
    }));

    for (const inv of invoices) {
      if (!inv.paidAt) continue;
      const h = inv.paidAt.getUTCHours();
      hours[h].invoiceCount += 1;
      hours[h].totalUsd += inv.totalUsd;
    }

    hours.forEach(h => { h.totalUsd = round2(h.totalUsd); });

    const sorted = [...hours].sort((a, b) => b.invoiceCount - a.invoiceCount);
    const peakHours = sorted.slice(0, 3).map(h => h.label);
    const quietHour = sorted[sorted.length - 1]?.label || '';
    const totalInvoices = hours.reduce((s, h) => s + h.invoiceCount, 0);
    const avgPerHour = totalInvoices > 0 ? round2(totalInvoices / 24) : 0;

    return {
      rows: hours,
      peakHours,
      quietHour,
      avgPerHour,
      totalInvoices,
    };
  }

  // ──────────────────────────────────────────────────────
  // 9. Sales by Cash Register
  // ──────────────────────────────────────────────────────
  async salesByCashRegister(fromStr: string, toStr: string) {
    const { from, to } = parseDateRange(fromStr, toStr);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: { in: PAID_STATUSES },
        paidAt: { gte: from, lte: to },
      },
      include: {
        cashRegister: { select: { code: true, name: true } },
        payments: {
          include: { method: { select: { name: true } } },
        },
      },
    });

    const crMap = new Map<string, {
      code: string;
      name: string;
      invoiceCount: number;
      totalUsd: number;
      totalBs: number;
      paymentMethods: Map<string, number>;
    }>();

    for (const inv of invoices) {
      const crid = inv.cashRegisterId || '__sin_caja';
      if (!crMap.has(crid)) {
        crMap.set(crid, {
          code: inv.cashRegister?.code || '—',
          name: inv.cashRegister?.name || 'Sin caja',
          invoiceCount: 0,
          totalUsd: 0,
          totalBs: 0,
          paymentMethods: new Map(),
        });
      }
      const cr = crMap.get(crid)!;
      cr.invoiceCount += 1;
      cr.totalUsd += inv.totalUsd;
      cr.totalBs += inv.totalBs;
      for (const p of inv.payments) {
        const mName = p.method.name;
        cr.paymentMethods.set(mName, (cr.paymentMethods.get(mName) || 0) + p.amountUsd);
      }
    }

    const rows = Array.from(crMap.values()).map(cr => ({
      code: cr.code,
      name: cr.name,
      invoiceCount: cr.invoiceCount,
      totalUsd: round2(cr.totalUsd),
      totalBs: round2(cr.totalBs),
      paymentMethods: Array.from(cr.paymentMethods.entries())
        .map(([name, amountUsd]) => ({ name, amountUsd: round2(amountUsd) }))
        .sort((a, b) => b.amountUsd - a.amountUsd),
    })).sort((a, b) => b.totalUsd - a.totalUsd);

    const totals = {
      totalUsd: round2(rows.reduce((s, r) => s + r.totalUsd, 0)),
      totalBs: round2(rows.reduce((s, r) => s + r.totalBs, 0)),
      invoiceCount: rows.reduce((s, r) => s + r.invoiceCount, 0),
    };

    return { rows, totals, topCashRegister: rows[0]?.name || '' };
  }
}
