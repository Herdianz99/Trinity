import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return 100;
  return round2(((current - previous) / previous) * 100);
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getGerencial(fromStr?: string, toStr?: string) {
    // Default to today
    const now = new Date();
    const from = fromStr ? new Date(fromStr) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to = toStr ? new Date(toStr) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    from.setUTCHours(0, 0, 0, 0);
    to.setUTCHours(23, 59, 59, 999);

    // Calculate previous period of equal duration for comparison
    const durationMs = to.getTime() - from.getTime();
    const prevTo = new Date(from.getTime() - 1);
    prevTo.setUTCHours(23, 59, 59, 999);
    const prevFrom = new Date(prevTo.getTime() - durationMs);
    prevFrom.setUTCHours(0, 0, 0, 0);

    const dateRange = { gte: from, lte: to };
    const prevDateRange = { gte: prevFrom, lte: prevTo };

    // Run all queries in parallel
    const [
      sales,
      prevSales,
      returns,
      prevReturns,
      salesBySeller,
      topProducts,
      cashSummary,
      expenses,
      receivables,
      payables,
      salesByHourOrDay,
    ] = await Promise.all([
      this.getSales(dateRange),
      this.getSales(prevDateRange),
      this.getReturns(dateRange),
      this.getReturns(prevDateRange),
      this.getSalesBySeller(dateRange),
      this.getTopProducts(dateRange),
      this.getCashSummary(dateRange),
      this.getExpenses(dateRange),
      this.getReceivables(),
      this.getPayables(),
      this.getSalesTimeline(from, to),
    ]);

    return {
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      sales: {
        totalUsd: sales.totalUsd,
        totalBs: sales.totalBs,
        invoiceCount: sales.count,
        avgTicketUsd: sales.count > 0 ? round2(sales.totalUsd / sales.count) : 0,
        vsLastPeriod: pctChange(sales.totalUsd, prevSales.totalUsd),
        vsLastPeriodCount: pctChange(sales.count, prevSales.count),
        vsLastPeriodAvgTicket: pctChange(
          sales.count > 0 ? sales.totalUsd / sales.count : 0,
          prevSales.count > 0 ? prevSales.totalUsd / prevSales.count : 0,
        ),
      },
      returns: {
        totalUsd: returns.totalUsd,
        count: returns.count,
        vsLastPeriod: pctChange(returns.totalUsd, prevReturns.totalUsd),
      },
      salesBySeller,
      topProducts,
      cashSummary,
      expenses,
      receivables,
      payables,
      salesTimeline: salesByHourOrDay,
    };
  }

  // ── Sales (Invoices PAID in period) ───────────────────────────────────────

  private async getSales(dateRange: { gte: Date; lte: Date }) {
    const result = await this.prisma.invoice.aggregate({
      where: {
        status: { in: ['PAID', 'PARTIAL_RETURN'] },
        paidAt: dateRange,
      },
      _sum: { totalUsd: true, totalBs: true },
      _count: { id: true },
    });

    return {
      totalUsd: round2(result._sum.totalUsd || 0),
      totalBs: round2(result._sum.totalBs || 0),
      count: result._count.id || 0,
    };
  }

  // ── Returns (NCV POSTED in period) ────────────────────────────────────────

  private async getReturns(dateRange: { gte: Date; lte: Date }) {
    const result = await this.prisma.creditDebitNote.aggregate({
      where: {
        type: 'NCV',
        status: 'POSTED',
        appliedAt: dateRange,
      },
      _sum: { totalUsd: true },
      _count: { id: true },
    });

    return {
      totalUsd: round2(result._sum.totalUsd || 0),
      count: result._count.id || 0,
    };
  }

  // ── Sales by seller ───────────────────────────────────────────────────────

  private async getSalesBySeller(dateRange: { gte: Date; lte: Date }) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: { in: ['PAID', 'PARTIAL_RETURN'] },
        paidAt: dateRange,
        sellerId: { not: null },
      },
      select: {
        totalUsd: true,
        seller: { select: { id: true, name: true, code: true } },
      },
    });

    // Group by seller
    const map = new Map<string, { sellerId: string; sellerName: string; sellerCode: string; totalUsd: number; invoiceCount: number }>();
    for (const inv of invoices) {
      if (!inv.seller) continue;
      const key = inv.seller.id;
      const existing = map.get(key);
      if (existing) {
        existing.totalUsd += inv.totalUsd;
        existing.invoiceCount += 1;
      } else {
        map.set(key, {
          sellerId: inv.seller.id,
          sellerName: inv.seller.name,
          sellerCode: inv.seller.code,
          totalUsd: inv.totalUsd,
          invoiceCount: 1,
        });
      }
    }

    const sellers = Array.from(map.values()).sort((a, b) => b.totalUsd - a.totalUsd);
    const grandTotal = sellers.reduce((s, x) => s + x.totalUsd, 0);
    return sellers.map(s => ({
      ...s,
      totalUsd: round2(s.totalUsd),
      pct: grandTotal > 0 ? round2((s.totalUsd / grandTotal) * 100) : 0,
    }));
  }

  // ── Top 5 products by USD ─────────────────────────────────────────────────

  private async getTopProducts(dateRange: { gte: Date; lte: Date }) {
    const items = await this.prisma.invoiceItem.findMany({
      where: {
        invoice: {
          status: { in: ['PAID', 'PARTIAL_RETURN'] },
          paidAt: dateRange,
        },
      },
    });

    const map = new Map<string, { productId: string; productCode: string; productName: string; unitsSold: number; totalUsd: number; category: string }>();
    for (const item of items) {
      const key = item.productId;
      const existing = map.get(key);
      if (existing) {
        existing.unitsSold += item.quantity;
        existing.totalUsd += item.totalUsd;
      } else {
        map.set(key, {
          productId: item.productId,
          productCode: '',
          productName: item.productName,
          unitsSold: item.quantity,
          totalUsd: item.totalUsd,
          category: '',
        });
      }
    }

    // Enrich with product code and category
    const topIds = Array.from(map.values())
      .sort((a, b) => b.totalUsd - a.totalUsd)
      .slice(0, 5)
      .map(p => p.productId);
    if (topIds.length > 0) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: topIds } },
        select: { id: true, code: true, category: { select: { name: true } } },
      });
      for (const p of products) {
        const entry = map.get(p.id);
        if (entry) {
          entry.productCode = p.code;
          entry.category = p.category?.name || 'Sin categoría';
        }
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.totalUsd - a.totalUsd)
      .slice(0, 5)
      .map(p => ({ ...p, totalUsd: round2(p.totalUsd) }));
  }

  // ── Cash summary ──────────────────────────────────────────────────────────

  private async getCashSummary(dateRange: { gte: Date; lte: Date }) {
    const movements = await this.prisma.cashMovement.findMany({
      where: { createdAt: dateRange },
    });

    // Get dynamic key names for grouping income
    const keyIds = [...new Set(movements.filter(m => m.dynamicKeyId).map(m => m.dynamicKeyId!))];
    const keyMap = new Map<string, string>();
    if (keyIds.length > 0) {
      const keys = await this.prisma.dynamicKey.findMany({
        where: { id: { in: keyIds } },
        select: { id: true, name: true },
      });
      for (const k of keys) keyMap.set(k.id, k.name);
    }

    let totalIncomeUsd = 0, totalIncomeBs = 0;
    let totalExpensesUsd = 0, totalExpensesBs = 0;
    const methodMap = new Map<string, { methodName: string; totalUsd: number; totalBs: number }>();

    for (const m of movements) {
      if (m.type === 'INCOME') {
        totalIncomeUsd += m.amountUsd;
        totalIncomeBs += m.amountBs;
        const name = m.dynamicKeyId ? (keyMap.get(m.dynamicKeyId) || 'Otros') : 'Otros';
        const existing = methodMap.get(name);
        if (existing) {
          existing.totalUsd += m.amountUsd;
          existing.totalBs += m.amountBs;
        } else {
          methodMap.set(name, { methodName: name, totalUsd: m.amountUsd, totalBs: m.amountBs });
        }
      } else {
        totalExpensesUsd += m.amountUsd;
        totalExpensesBs += m.amountBs;
      }
    }

    return {
      totalIncomeUsd: round2(totalIncomeUsd),
      totalIncomeBs: round2(totalIncomeBs),
      totalExpensesUsd: round2(totalExpensesUsd),
      totalExpensesBs: round2(totalExpensesBs),
      netUsd: round2(totalIncomeUsd - totalExpensesUsd),
      netBs: round2(totalIncomeBs - totalExpensesBs),
      byMethod: Array.from(methodMap.values())
        .sort((a, b) => b.totalUsd - a.totalUsd)
        .map(m => ({ ...m, totalUsd: round2(m.totalUsd), totalBs: round2(m.totalBs) })),
    };
  }

  // ── Expenses ──────────────────────────────────────────────────────────────

  private async getExpenses(dateRange: { gte: Date; lte: Date }) {
    const expenses = await this.prisma.expense.findMany({
      where: { date: dateRange },
      select: {
        amountUsd: true,
        amountBs: true,
        category: { select: { name: true } },
      },
    });

    let totalUsd = 0, totalBs = 0;
    const catMap = new Map<string, number>();

    for (const e of expenses) {
      totalUsd += e.amountUsd;
      totalBs += e.amountBs;
      const catName = e.category?.name || 'Sin categoría';
      catMap.set(catName, (catMap.get(catName) || 0) + e.amountUsd);
    }

    return {
      totalUsd: round2(totalUsd),
      totalBs: round2(totalBs),
      byCategory: Array.from(catMap.entries())
        .map(([categoryName, catTotalUsd]) => ({ categoryName, totalUsd: round2(catTotalUsd) }))
        .sort((a, b) => b.totalUsd - a.totalUsd),
    };
  }

  // ── Receivables (always current, ignores period) ──────────────────────────

  private async getReceivables() {
    const all = await this.prisma.receivable.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
      select: { amountUsd: true, paidAmountUsd: true, status: true },
    });

    let totalPendingUsd = 0;
    let totalOverdueUsd = 0;
    let overdueCount = 0;

    for (const r of all) {
      const balance = r.amountUsd - r.paidAmountUsd;
      totalPendingUsd += balance;
      if (r.status === 'OVERDUE') {
        totalOverdueUsd += balance;
        overdueCount++;
      }
    }

    return {
      totalPendingUsd: round2(totalPendingUsd),
      totalOverdueUsd: round2(totalOverdueUsd),
      count: all.length,
      overdueCount,
    };
  }

  // ── Payables (always current, ignores period) ─────────────────────────────

  private async getPayables() {
    const all = await this.prisma.payable.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
      select: { netPayableUsd: true, paidAmountUsd: true, status: true },
    });

    let totalPendingUsd = 0;
    let totalOverdueUsd = 0;
    let overdueCount = 0;

    for (const p of all) {
      const balance = p.netPayableUsd - p.paidAmountUsd;
      totalPendingUsd += balance;
      if (p.status === 'OVERDUE') {
        totalOverdueUsd += balance;
        overdueCount++;
      }
    }

    return {
      totalPendingUsd: round2(totalPendingUsd),
      totalOverdueUsd: round2(totalOverdueUsd),
      count: all.length,
      overdueCount,
    };
  }

  // ── Sales timeline (by hour if single day, by day otherwise) ──────────────

  private async getSalesTimeline(from: Date, to: Date) {
    const diffDays = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    const isSingleDay = diffDays <= 1;

    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: { in: ['PAID', 'PARTIAL_RETURN'] },
        paidAt: { gte: from, lte: to },
      },
      select: { paidAt: true, totalUsd: true },
    });

    if (isSingleDay) {
      // Group by hour (0-23)
      const hours = Array.from({ length: 24 }, (_, i) => ({
        label: `${String(i).padStart(2, '0')}:00`,
        totalUsd: 0,
        count: 0,
      }));
      for (const inv of invoices) {
        if (!inv.paidAt) continue;
        const h = new Date(inv.paidAt).getHours();
        hours[h].totalUsd += inv.totalUsd;
        hours[h].count += 1;
      }
      // Only return hours 7-21 for cleaner display
      return hours.slice(7, 22).map(h => ({ ...h, totalUsd: round2(h.totalUsd) }));
    } else {
      // Group by day
      const dayMap = new Map<string, { label: string; totalUsd: number; count: number }>();
      const cursor = new Date(from);
      while (cursor <= to) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        const d = cursor.getDate();
        const m = cursor.getMonth();
        const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        dayMap.set(key, { label: `${d} ${months[m]}`, totalUsd: 0, count: 0 });
        cursor.setDate(cursor.getDate() + 1);
      }

      for (const inv of invoices) {
        if (!inv.paidAt) continue;
        const d = new Date(inv.paidAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const entry = dayMap.get(key);
        if (entry) {
          entry.totalUsd += inv.totalUsd;
          entry.count += 1;
        }
      }

      return Array.from(dayMap.values()).map(d => ({ ...d, totalUsd: round2(d.totalUsd) }));
    }
  }
}
