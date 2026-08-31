import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveBregaPct, effectiveCost } from '../../common/pricing';
import { buildCategoryBregaMap } from '../../common/category-brega';
import {
  caracasToday, caracasDayStart, caracasDayEnd, caracasDateKey, caracasParts,
} from '../../common/timezone';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return 100;
  return round2(((current - previous) / previous) * 100);
}

// Venta REAL (neta) de una factura del periodo: monto original y monto neto de devoluciones,
// mas los flags para clasificarla en los distintos KPI de ventas. Ver getNetInvoiceRows.
interface NetInvoiceRow {
  grossUsd: number;
  grossBs: number;
  netUsd: number;
  netBs: number;
  isGroupCompany: boolean;
  isFiscal: boolean;
  paymentType: string;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getGerencial(fromStr?: string, toStr?: string) {
    // Rango anclado al dia-calendario de Caracas (ver helpers arriba).
    const fromYmd = fromStr ? fromStr.slice(0, 10) : caracasToday();
    const toYmd = toStr ? toStr.slice(0, 10) : caracasToday();
    const from = caracasDayStart(fromYmd);
    const to = caracasDayEnd(toYmd);

    // Periodo anterior de igual duracion, terminando justo antes de `from`.
    // Sin setUTCHours: from/to ya son instantes alineados al dia Caracas.
    const durationMs = to.getTime() - from.getTime();
    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - durationMs);

    const dateRange = { gte: from, lte: to };
    const prevDateRange = { gte: prevFrom, lte: prevTo };

    // Run all queries in parallel. Las ventas (KPI, contado/credito, grupo, fiscal) se derivan
    // TODAS de las mismas "filas netas por factura" (getNetInvoiceRows) para que reconcilien
    // entre si: contado+credito+grupo = KPI Ventas, y fiscal+no-fiscal = KPI Ventas.
    const [
      netRows,
      prevNetRows,
      returns,
      prevReturns,
      salesBySeller,
      topProducts,
      salesByCategory,
      cashSummary,
      expenses,
      receivables,
      payables,
      salesByHourOrDay,
      financing,
      prevFinancing,
      profit,
      prevProfit,
    ] = await Promise.all([
      this.getNetInvoiceRows(dateRange),
      this.getNetInvoiceRows(prevDateRange),
      this.getReturns(dateRange),
      this.getReturns(prevDateRange),
      this.getSalesBySeller(dateRange),
      this.getTopProducts(dateRange),
      this.getSalesByCategory(dateRange),
      this.getCashSummary(dateRange),
      this.getExpenses(dateRange),
      this.getReceivables(),
      this.getPayables(),
      this.getSalesTimeline(from, to),
      this.getFinancingSales(dateRange),
      this.getFinancingSales(prevDateRange),
      this.getProfit(dateRange),
      this.getProfit(prevDateRange),
    ]);

    // Derivados sincronos de las filas netas por factura (sin mas consultas).
    const sales = this.summarizeSales(netRows);
    const prevSales = this.summarizeSales(prevNetRows);
    const salesByFiscalType = this.summarizeByFiscalType(netRows);
    const salesByType = this.summarizeByPaymentType(netRows);
    const prevSalesByType = this.summarizeByPaymentType(prevNetRows);
    const groupSales = this.summarizeGroupSales(netRows);
    const prevGroupSales = this.summarizeGroupSales(prevNetRows);

    return {
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      sales: {
        // Ventas REALES = por cada factura del periodo, su monto menos lo devuelto de ESA factura
        // (parcial: cuenta lo no devuelto; total: cuenta 0). Ya viene neto de summarizeSales.
        // grossUsd = lo facturado antes de devoluciones (para mostrar la diferencia en la tarjeta).
        totalUsd: sales.totalUsd,
        totalBs: sales.totalBs,
        grossUsd: sales.grossUsd,
        grossBs: sales.grossBs,
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
      salesByCategory,
      salesByFiscalType,
      cashSummary,
      expenses,
      receivables,
      payables,
      salesTimeline: salesByHourOrDay,
      financing: {
        casheaUsd: financing.casheaUsd,
        casheaBs: financing.casheaBs,
        crediagroUsd: financing.crediagroUsd,
        crediagroBs: financing.crediagroBs,
        vsCashea: pctChange(financing.casheaUsd, prevFinancing.casheaUsd),
        vsCrediagro: pctChange(financing.crediagroUsd, prevFinancing.crediagroUsd),
      },
      salesByType: {
        // Ventas de contado NETAS: al contado se le restan los montos financiados por
        // Cashea/Crediagro (que se cuentan como CASH pero se muestran en sus propios KPIs),
        // para no duplicarlos. El % vs periodo anterior usa el mismo neto para ser consistente.
        contadoUsd: round2(salesByType.contadoUsd - financing.casheaUsd - financing.crediagroUsd),
        contadoBs: round2(salesByType.contadoBs - financing.casheaBs - financing.crediagroBs),
        contadoCount: salesByType.contadoCount,
        creditoUsd: salesByType.creditoUsd,
        creditoBs: salesByType.creditoBs,
        creditoCount: salesByType.creditoCount,
        vsContado: pctChange(
          salesByType.contadoUsd - financing.casheaUsd - financing.crediagroUsd,
          prevSalesByType.contadoUsd - prevFinancing.casheaUsd - prevFinancing.crediagroUsd,
        ),
        vsCredito: pctChange(salesByType.creditoUsd, prevSalesByType.creditoUsd),
      },
      profit: {
        totalUsd: profit.profitUsd,
        marginPct: profit.marginPct,
        vsLastPeriod: pctChange(profit.profitUsd, prevProfit.profitUsd),
      },
      groupSales: {
        totalUsd: groupSales.totalUsd,
        totalBs: groupSales.totalBs,
        count: groupSales.count,
        vsLastPeriod: pctChange(groupSales.totalUsd, prevGroupSales.totalUsd),
      },
    };
  }

  // ── Seller Dashboard ─────────────────────────────────────────────────────

  async getVendedor(userId: string, fromStr?: string, toStr?: string, period?: string) {
    // Find seller linked to this user
    const seller = await this.prisma.seller.findUnique({
      where: { userId },
      select: { id: true, name: true, code: true, monthlyGoalUsd: true },
    });
    if (!seller) {
      throw new NotFoundException('Este usuario no tiene vendedor asignado');
    }

    // Rango anclado al dia-calendario de Caracas (ver helpers arriba).
    const fromYmd = fromStr ? fromStr.slice(0, 10) : caracasToday();
    const toYmd = toStr ? toStr.slice(0, 10) : caracasToday();
    const from = caracasDayStart(fromYmd);
    const to = caracasDayEnd(toYmd);

    // Periodo anterior de igual duracion, terminando justo antes de `from`.
    const durationMs = to.getTime() - from.getTime();
    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - durationMs);

    const dateRange = { gte: from, lte: to };
    const prevDateRange = { gte: prevFrom, lte: prevTo };
    const sellerId = seller.id;

    const [sales, prevSales, returns, prevReturns, topProducts, salesTimeline] = await Promise.all([
      this.getSellerSales(sellerId, dateRange),
      this.getSellerSales(sellerId, prevDateRange),
      this.getSellerReturns(sellerId, dateRange),
      this.getSellerReturns(sellerId, prevDateRange),
      this.getSellerTopProducts(sellerId, dateRange),
      this.getSellerTimeline(sellerId, from, to),
    ]);

    // ── Solo PORCENTAJES (el vendedor no ve montos en $; ver requisito Sesion 69) ──
    // Ventas NETAS = brutas − devoluciones (notas de credito NCV). El avance de la meta
    // debe medirse sobre lo neto: una factura devuelta no cuenta para la meta del vendedor.
    const netSalesUsd = round2(Math.max(0, sales.totalUsd - returns.totalUsd));
    const prevNetSalesUsd = round2(Math.max(0, prevSales.totalUsd - prevReturns.totalUsd));
    // Meta mensual prorrateada al periodo: dia = 1/30, semana = 7/30, mes = 30/30 (mes nominal de 30 dias).
    const nominalDays = period === 'today' ? 1 : period === 'week' ? 7 : 30;
    const periodGoalUsd = (seller.monthlyGoalUsd || 0) * (nominalDays / 30);
    const goalPct = periodGoalUsd > 0 ? Math.round((netSalesUsd / periodGoalUsd) * 100) : null;
    const totalSalesUsd = sales.totalUsd;

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      seller: { name: seller.name, code: seller.code },
      goal: {
        monthlyGoalUsd: round2(seller.monthlyGoalUsd || 0),
        isSet: (seller.monthlyGoalUsd || 0) > 0,
        pct: goalPct, // % de la meta del periodo, entero (null si no hay meta) — sobre ventas NETAS
        vsLastPeriod: pctChange(netSalesUsd, prevNetSalesUsd), // ya es %, neto vs neto
        invoiceCount: sales.count, // conteo, no es monto
      },
      returns: {
        pctOfSales: totalSalesUsd > 0 ? Math.round((returns.totalUsd / totalSalesUsd) * 100) : 0,
        count: returns.count,
      },
      topProducts: topProducts.map((p) => ({
        productName: p.productName,
        productCode: p.productCode,
        unitsSold: p.unitsSold,
        sharePct: totalSalesUsd > 0 ? Math.round((p.totalUsd / totalSalesUsd) * 100) : 0,
      })),
      salesTimeline: salesTimeline.map((t) => ({
        label: t.label,
        pct: periodGoalUsd > 0 ? Math.round((t.totalUsd / periodGoalUsd) * 100) : 0,
        count: t.count,
      })),
    };
  }

  /** El vendedor define/edita su propia meta mensual (USD). */
  async setSellerGoal(userId: string, monthlyGoalUsd: number) {
    const seller = await this.prisma.seller.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!seller) {
      throw new NotFoundException('Este usuario no tiene vendedor asignado');
    }
    const goal = Math.max(0, monthlyGoalUsd);
    await this.prisma.seller.update({
      where: { id: seller.id },
      data: { monthlyGoalUsd: goal },
    });
    return { monthlyGoalUsd: round2(goal) };
  }

  // ── Seller-specific queries ─────────────────────────────────────────────

  private async getSellerSales(sellerId: string, dateRange: { gte: Date; lte: Date }) {
    const result = await this.prisma.invoice.aggregate({
      where: {
        sellerId,
        // Ventas BRUTAS: incluye RETURNED por su total original. El neto se
        // obtiene restando las devoluciones (getSellerReturns) en getVendedor.
        status: { in: ['PAID', 'PARTIAL_RETURN', 'RETURNED'] },
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

  private async getSellerPendingInvoices(sellerId: string) {
    const result = await this.prisma.invoice.aggregate({
      where: { sellerId, status: 'PENDING' },
      _sum: { totalUsd: true },
      _count: { id: true },
    });
    return {
      count: result._count.id || 0,
      totalUsd: round2(result._sum.totalUsd || 0),
    };
  }

  private async getSellerReturns(sellerId: string, dateRange: { gte: Date; lte: Date }) {
    const result = await this.prisma.creditDebitNote.aggregate({
      where: {
        type: 'NCV',
        status: 'POSTED',
        // Date the return actually happened (set on post), not appliedAt.
        documentDate: dateRange,
        invoice: { sellerId },
      },
      _sum: { totalUsd: true },
      _count: { id: true },
    });
    return {
      totalUsd: round2(result._sum.totalUsd || 0),
      count: result._count.id || 0,
    };
  }

  private async getSellerTopProducts(sellerId: string, dateRange: { gte: Date; lte: Date }) {
    const items = await this.prisma.invoiceItem.findMany({
      where: {
        invoice: {
          sellerId,
          status: { in: ['PAID', 'PARTIAL_RETURN'] },
          paidAt: dateRange,
        },
      },
    });

    const map = new Map<string, { productName: string; productCode: string; unitsSold: number; totalUsd: number }>();
    for (const item of items) {
      const existing = map.get(item.productId);
      if (existing) {
        existing.unitsSold += item.quantity;
        existing.totalUsd += item.totalUsd;
      } else {
        map.set(item.productId, {
          productName: item.productName,
          productCode: '',
          unitsSold: item.quantity,
          totalUsd: item.totalUsd,
        });
      }
    }

    const topIds = Array.from(map.entries())
      .sort((a, b) => b[1].totalUsd - a[1].totalUsd)
      .slice(0, 5)
      .map(([id]) => id);

    if (topIds.length > 0) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: topIds } },
        select: { id: true, code: true },
      });
      for (const p of products) {
        const entry = map.get(p.id);
        if (entry) entry.productCode = p.code;
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.totalUsd - a.totalUsd)
      .slice(0, 5)
      .map(p => ({ ...p, totalUsd: round2(p.totalUsd) }));
  }

  private async getSellerTimeline(sellerId: string, from: Date, to: Date) {
    const diffDays = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    const isSingleDay = diffDays <= 1;

    // Ventas brutas por bucket. Las devoluciones (NCV) se restan luego, en su
    // propio bucket por documentDate, para que el timeline muestre lo NETO.
    const [invoices, returns] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          sellerId,
          status: { in: ['PAID', 'PARTIAL_RETURN'] },
          paidAt: { gte: from, lte: to },
        },
        select: { paidAt: true, totalUsd: true },
      }),
      this.prisma.creditDebitNote.findMany({
        where: {
          type: 'NCV',
          status: 'POSTED',
          documentDate: { gte: from, lte: to },
          invoice: { sellerId },
        },
        select: { documentDate: true, totalUsd: true },
      }),
    ]);

    if (isSingleDay) {
      const hours = Array.from({ length: 24 }, (_, i) => ({
        label: `${String(i).padStart(2, '0')}:00`,
        totalUsd: 0,
        count: 0,
      }));
      for (const inv of invoices) {
        if (!inv.paidAt) continue;
        const h = caracasParts(new Date(inv.paidAt)).hour;
        hours[h].totalUsd += inv.totalUsd;
        hours[h].count += 1;
      }
      for (const ret of returns) {
        if (!ret.documentDate) continue;
        const h = caracasParts(new Date(ret.documentDate)).hour;
        hours[h].totalUsd -= ret.totalUsd;
      }
      // Piso en 0: el timeline es una barra de avance, no mostramos horas negativas.
      return hours.slice(7, 22).map(h => ({ ...h, totalUsd: round2(Math.max(0, h.totalUsd)) }));
    } else {
      const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      const dayMap = new Map<string, { label: string; totalUsd: number; count: number }>();
      // Itera dia a dia en horas de Caracas (Venezuela no tiene DST, paso fijo de 24h).
      for (let t = from.getTime(); t <= to.getTime(); t += 86400000) {
        const { ymd } = caracasParts(new Date(t));
        if (dayMap.has(ymd)) continue;
        const [, m, d] = ymd.split('-');
        dayMap.set(ymd, { label: `${Number(d)} ${months[Number(m) - 1]}`, totalUsd: 0, count: 0 });
      }
      for (const inv of invoices) {
        if (!inv.paidAt) continue;
        const { ymd } = caracasParts(new Date(inv.paidAt));
        const entry = dayMap.get(ymd);
        if (entry) {
          entry.totalUsd += inv.totalUsd;
          entry.count += 1;
        }
      }
      for (const ret of returns) {
        if (!ret.documentDate) continue;
        const { ymd } = caracasParts(new Date(ret.documentDate));
        const entry = dayMap.get(ymd);
        if (entry) entry.totalUsd -= ret.totalUsd;
      }
      // Piso en 0: el timeline es una barra de avance, no mostramos dias negativos.
      return Array.from(dayMap.values()).map(d => ({ ...d, totalUsd: round2(Math.max(0, d.totalUsd)) }));
    }
  }

  private async getSellerReceivables(sellerId: string) {
    const all = await this.prisma.receivable.findMany({
      where: {
        status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
        invoice: { sellerId },
      },
      select: { amountUsd: true, paidAmountUsd: true, status: true },
    });

    let totalPendingUsd = 0;
    let totalOverdueUsd = 0;

    for (const r of all) {
      const balance = r.amountUsd - r.paidAmountUsd;
      totalPendingUsd += balance;
      if (r.status === 'OVERDUE') {
        totalOverdueUsd += balance;
      }
    }

    return {
      totalPendingUsd: round2(totalPendingUsd),
      totalOverdueUsd: round2(totalOverdueUsd),
      count: all.length,
    };
  }

  // ── Home Dashboard (secondary roles) ─────────────────────────────────────

  async getHome(role: string) {
    const result: Record<string, any> = {};

    // Exchange rate (all roles) — clave por dia-calendario de Caracas.
    const today = caracasDateKey();
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    result.exchangeRate = rate ? rate.rate : null;

    if (role === 'CASHIER') {
      // Open cash sessions
      const sessions = await this.prisma.cashSession.findMany({
        where: { status: 'OPEN' },
        select: {
          id: true,
          openedAt: true,
          cashRegister: { select: { name: true } },
          openedBy: { select: { name: true } },
        },
        orderBy: { openedAt: 'desc' },
        take: 10,
      });
      result.openSessions = sessions.map(s => ({
        registerName: s.cashRegister.name,
        openedBy: s.openedBy.name,
        openedAt: s.openedAt.toISOString(),
      }));
    }

    if (role === 'WAREHOUSE' || role === 'AUDITOR') {
      // Low stock products (top 5)
      const stocks = await this.prisma.$queryRaw<Array<{ productId: string; code: string; name: string; minStock: number; totalStock: number }>>`
        SELECT p.id AS "productId", p.code, p.name, p."minStock",
               COALESCE(SUM(s.quantity), 0)::float AS "totalStock"
        FROM "Product" p
        LEFT JOIN "Stock" s ON s."productId" = p.id
        WHERE p."isActive" = true AND p."minStock" > 0
        GROUP BY p.id, p.code, p.name, p."minStock"
        HAVING COALESCE(SUM(s.quantity), 0) <= p."minStock"
        ORDER BY COALESCE(SUM(s.quantity), 0) / NULLIF(p."minStock", 0) ASC
        LIMIT 5
      `;
      result.lowStock = stocks.map(s => ({
        productCode: s.code,
        productName: s.name,
        currentStock: s.totalStock,
        minStock: s.minStock,
      }));
    }

    if (role === 'WAREHOUSE') {
      // Pending transfers count
      const pendingTransfers = await this.prisma.transfer.count({
        where: { status: 'PENDING' },
      });
      result.pendingTransfers = pendingTransfers;
    }

    if (role === 'AUDITOR') {
      // Recent inventory adjustments (last 5)
      const adjustments = await this.prisma.stockMovement.findMany({
        where: { type: { in: ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'COUNT_ADJUST'] } },
        select: {
          type: true,
          quantity: true,
          reason: true,
          createdAt: true,
          product: { select: { code: true, name: true } },
          warehouse: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      result.recentAdjustments = adjustments.map(a => ({
        type: a.type,
        quantity: a.quantity,
        reason: a.reason,
        productCode: a.product.code,
        productName: a.product.name,
        warehouseName: a.warehouse.name,
        createdAt: a.createdAt.toISOString(),
      }));
    }

    if (role === 'BUYER') {
      // Overdue payables
      const overdue = await this.prisma.payable.findMany({
        where: { status: 'OVERDUE' },
        select: { netPayableUsd: true, paidAmountUsd: true },
      });
      let overdueTotal = 0;
      for (const p of overdue) overdueTotal += p.netPayableUsd - p.paidAmountUsd;
      result.overduePayables = { count: overdue.length, totalUsd: round2(overdueTotal) };

      // Due this week — anclado al dia-calendario de Caracas (dueDate es date-only).
      const weekEnd = caracasDateKey();
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
      weekEnd.setUTCHours(23, 59, 59, 999);
      const upcoming = await this.prisma.payable.count({
        where: {
          status: { in: ['PENDING', 'PARTIAL'] },
          dueDate: { gte: today, lte: weekEnd },
        },
      });
      result.upcomingPayables = upcoming;
    }

    if (role === 'ACCOUNTANT') {
      // CxC totals
      const cxc = await this.prisma.receivable.findMany({
        where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
        select: { amountUsd: true, paidAmountUsd: true },
      });
      let cxcTotal = 0;
      for (const r of cxc) cxcTotal += r.amountUsd - r.paidAmountUsd;
      result.receivables = { count: cxc.length, totalUsd: round2(cxcTotal) };

      // CxP totals
      const cxp = await this.prisma.payable.findMany({
        where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
        select: { netPayableUsd: true, paidAmountUsd: true },
      });
      let cxpTotal = 0;
      for (const p of cxp) cxpTotal += p.netPayableUsd - p.paidAmountUsd;
      result.payables = { count: cxp.length, totalUsd: round2(cxpTotal) };
    }

    return result;
  }

  // ── Filas netas por factura (base de TODOS los KPI de ventas) ──────────────
  // Para cada factura cobrada en el periodo (PAID/PARTIAL_RETURN/RETURNED) calcula su venta
  // REAL = monto original − lo devuelto de ESA factura (suma de sus NCV POSTED). Devolucion
  // parcial => queda lo no devuelto; devolucion total => queda 0. Piso en 0 (una devolucion no
  // puede volver la venta negativa). Las devoluciones se anclan a la factura (no a la fecha en
  // que se proceso la NC), asi una devolucion de una venta vieja NO afecta a este periodo.
  private async getNetInvoiceRows(dateRange: { gte: Date; lte: Date }): Promise<NetInvoiceRow[]> {
    const estados: ('PAID' | 'PARTIAL_RETURN' | 'RETURNED')[] = ['PAID', 'PARTIAL_RETURN', 'RETURNED'];
    const [invoices, returns] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { status: { in: estados }, paidAt: dateRange },
        select: {
          id: true, totalUsd: true, totalBs: true, paymentType: true,
          customer: { select: { isGroupCompany: true } },
          serie: { select: { isFiscal: true } },
        },
      }),
      this.prisma.creditDebitNote.groupBy({
        by: ['invoiceId'],
        where: {
          type: 'NCV', status: 'POSTED',
          invoice: { status: { in: estados }, paidAt: dateRange },
        },
        _sum: { totalUsd: true, totalBs: true },
      }),
    ]);

    const retMap = new Map<string, { usd: number; bs: number }>();
    for (const r of returns) {
      if (r.invoiceId) retMap.set(r.invoiceId, { usd: r._sum.totalUsd || 0, bs: r._sum.totalBs || 0 });
    }

    return invoices.map((inv) => {
      const ret = retMap.get(inv.id) || { usd: 0, bs: 0 };
      const netUsd = Math.max(0, inv.totalUsd - ret.usd);
      const netBs = Math.max(0, inv.totalBs - ret.bs);
      return {
        grossUsd: inv.totalUsd,
        grossBs: inv.totalBs,
        netUsd,
        netBs,
        isGroupCompany: !!inv.customer?.isGroupCompany,
        isFiscal: !!inv.serie?.isFiscal,
        paymentType: inv.paymentType,
      };
    });
  }

  // ── KPI "Ventas" = venta real (neta por factura) de todas las facturas del periodo ────
  private summarizeSales(rows: NetInvoiceRow[]) {
    let totalUsd = 0, totalBs = 0, grossUsd = 0, grossBs = 0, count = 0;
    for (const r of rows) {
      totalUsd += r.netUsd; totalBs += r.netBs;
      grossUsd += r.grossUsd; grossBs += r.grossBs;
      if (r.netUsd > 0) count += 1; // solo facturas con venta real (las devueltas completas no cuentan)
    }
    return { totalUsd: round2(totalUsd), totalBs: round2(totalBs), grossUsd: round2(grossUsd), grossBs: round2(grossBs), count };
  }

  // ── Ventas del grupo: venta real de las facturas a empresas del grupo (isGroupCompany) ─
  private summarizeGroupSales(rows: NetInvoiceRow[]) {
    let totalUsd = 0, totalBs = 0, count = 0;
    for (const r of rows) {
      if (!r.isGroupCompany) continue;
      totalUsd += r.netUsd; totalBs += r.netBs;
      if (r.netUsd > 0) count += 1;
    }
    return { totalUsd: round2(totalUsd), totalBs: round2(totalBs), count };
  }

  // ── Contado vs credito: venta real por paymentType, EXCLUYE empresas del grupo ─────────
  // (el grupo se reporta aparte en "Ventas del grupo"). CREDIT => credito; el resto => contado.
  private summarizeByPaymentType(rows: NetInvoiceRow[]) {
    let contadoUsd = 0, contadoBs = 0, contadoCount = 0, creditoUsd = 0, creditoBs = 0, creditoCount = 0;
    for (const r of rows) {
      if (r.isGroupCompany) continue;
      if (r.paymentType === 'CREDIT') {
        creditoUsd += r.netUsd; creditoBs += r.netBs; if (r.netUsd > 0) creditoCount += 1;
      } else {
        contadoUsd += r.netUsd; contadoBs += r.netBs; if (r.netUsd > 0) contadoCount += 1;
      }
    }
    return {
      contadoUsd: round2(contadoUsd), contadoBs: round2(contadoBs), contadoCount,
      creditoUsd: round2(creditoUsd), creditoBs: round2(creditoBs), creditoCount,
    };
  }

  // ── Returns (NCV POSTED in period) ────────────────────────────────────────

  private async getReturns(dateRange: { gte: Date; lte: Date }) {
    const result = await this.prisma.creditDebitNote.aggregate({
      where: {
        type: 'NCV',
        status: 'POSTED',
        // Date the return actually happened (set on post), not appliedAt which
        // only fills when the note is later cruzada en un recibo.
        documentDate: dateRange,
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

  // ── Ganancia (neta de devoluciones) ───────────────────────────────────────
  // Ganancia por linea = ingreso - costo con brecha. El ingreso descuenta IVA solo si la
  // serie es fiscal (en notas/no-fiscales el IVA cuenta como ganancia; regla de negocio en
  // CLAUDE.md). El costo con brecha YA viene guardado en InvoiceItem.costUsd. Se resta la
  // ganancia de lo devuelto (NCV POSTED) del periodo, con el costo historico de la factura
  // original (fallback: costo actual del producto, con brecha).
  private async getProfit(dateRange: { gte: Date; lte: Date }) {
    const [invoices, notes, config] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { status: { in: ['PAID', 'PARTIAL_RETURN'] }, paidAt: dateRange },
        select: {
          serie: { select: { isFiscal: true } },
          items: { select: { totalUsd: true, ivaAmount: true, costUsd: true, quantity: true } },
        },
      }),
      this.prisma.creditDebitNote.findMany({
        where: { type: 'NCV', status: 'POSTED', documentDate: dateRange },
        select: {
          serie: { select: { isFiscal: true } },
          items: { select: { productId: true, quantity: true, totalUsd: true, ivaAmount: true } },
          invoice: { select: { items: { select: { productId: true, costUsd: true } } } },
        },
      }),
      this.prisma.companyConfig.findUnique({
        where: { id: 'singleton' }, select: { bregaGlobalPct: true },
      }),
    ]);

    let salesProfit = 0, salesRevenue = 0;
    for (const inv of invoices) {
      const fiscal = !!inv.serie?.isFiscal;
      for (const it of inv.items) {
        const revenue = fiscal ? it.totalUsd - it.ivaAmount : it.totalUsd;
        salesRevenue += revenue;
        salesProfit += revenue - (it.costUsd || 0) * it.quantity;
      }
    }

    // Resolver el costo de lo devuelto. 1ro el costo historico de la factura original; lo que
    // no se halle ahi se junta para un unico fallback al costo actual del producto (con brecha).
    const bregaPct = config?.bregaGlobalPct || 0;
    const pending: { productId: string | null; quantity: number; revenue: number; histCost?: number }[] = [];
    const missing = new Set<string>();
    for (const note of notes) {
      const fiscal = !!note.serie?.isFiscal;
      const costMap = new Map<string, number>();
      for (const ii of note.invoice?.items ?? []) {
        if (ii.productId) costMap.set(ii.productId, ii.costUsd || 0);
      }
      for (const it of note.items) {
        const revenue = fiscal ? it.totalUsd - it.ivaAmount : it.totalUsd;
        const histCost = it.productId ? costMap.get(it.productId) : undefined;
        if (histCost === undefined && it.productId) missing.add(it.productId);
        pending.push({ productId: it.productId, quantity: it.quantity, revenue, histCost });
      }
    }
    const fallbackCost = new Map<string, number>();
    if (missing.size > 0) {
      const catBregaMap = await buildCategoryBregaMap(this.prisma);
      const prods = await this.prisma.product.findMany({
        where: { id: { in: Array.from(missing) } },
        select: { id: true, costUsd: true, bregaApplies: true, categoryId: true },
      });
      for (const p of prods) {
        const effBrega = resolveBregaPct({
          bregaApplies: p.bregaApplies,
          categoryBregaPct: p.categoryId ? (catBregaMap.get(p.categoryId) ?? 0) : 0,
          bregaGlobalPct: bregaPct,
        });
        fallbackCost.set(p.id, effectiveCost(p.costUsd, effBrega));
      }
    }

    let returnsProfit = 0, returnsRevenue = 0;
    for (const r of pending) {
      const unitCost = r.histCost !== undefined
        ? r.histCost
        : (r.productId ? fallbackCost.get(r.productId) || 0 : 0);
      returnsRevenue += r.revenue;
      returnsProfit += r.revenue - unitCost * r.quantity;
    }

    const netProfit = salesProfit - returnsProfit;
    const netRevenue = salesRevenue - returnsRevenue;
    return {
      profitUsd: round2(netProfit),
      marginPct: netRevenue > 0 ? round2((netProfit / netRevenue) * 100) : 0,
    };
  }

  // ── Sales by seller ───────────────────────────────────────────────────────

  private async getSalesBySeller(dateRange: { gte: Date; lte: Date }) {
    // Ventas NETAS por vendedor = brutas (incluye RETURNED por su total original)
    // menos las devoluciones (notas de credito NCV). Una devolucion total o parcial
    // NO cuenta como venta. Mismo criterio que el dashboard del vendedor (getVendedor).
    const [invoices, returns] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          status: { in: ['PAID', 'PARTIAL_RETURN', 'RETURNED'] },
          paidAt: dateRange,
          // SIN filtro de sellerId: incluimos tambien las facturas de mostrador
          // (sin vendedor) para mostrarlas como una fila aparte "Sin vendedor".
        },
        select: {
          totalUsd: true,
          seller: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.creditDebitNote.findMany({
        where: {
          type: 'NCV',
          status: 'POSTED',
          documentDate: dateRange,
          // SIN filtro de sellerId: las devoluciones de mostrador (o notas sin factura)
          // caen en el bucket "Sin vendedor".
        },
        select: { totalUsd: true, invoice: { select: { sellerId: true } } },
      }),
    ]);

    // Group by seller: ventas BRUTAS + conteo de facturas.
    const map = new Map<string, {
      sellerId: string; sellerName: string; sellerCode: string;
      totalUsd: number; invoiceCount: number; returnsUsd: number; returnCount: number;
    }>();
    // Bucket "Sin vendedor" (mostrador): facturas y devoluciones sin vendedor asignado.
    const noSeller = { totalUsd: 0, invoiceCount: 0, returnsUsd: 0, returnCount: 0 };
    for (const inv of invoices) {
      if (!inv.seller) { noSeller.totalUsd += inv.totalUsd; noSeller.invoiceCount += 1; continue; }
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
          returnsUsd: 0,
          returnCount: 0,
        });
      }
    }

    // Devoluciones (NCV) POR SEPARADO — NO se restan del bruto. Una devolucion procesada
    // hoy puede ser de una venta de OTRO dia; netearla contra las ventas de hoy borraba el
    // dia del vendedor (caso real: vendio ~$2.7k pero una NC de $2.8k de una venta de hace
    // 16 dias lo dejaba en $0 en el dashboard). Ahora el bruto y las devoluciones se
    // muestran aparte; `netUsd` queda disponible por si se quiere.
    for (const ret of returns) {
      const sid = ret.invoice?.sellerId;
      if (!sid) { noSeller.returnsUsd += ret.totalUsd; noSeller.returnCount += 1; continue; }
      const entry = map.get(sid);
      if (entry) { entry.returnsUsd += ret.totalUsd; entry.returnCount += 1; }
    }

    // Orden por lo VENDIDO (bruto). pct = participacion sobre el bruto total.
    // El bruto total INCLUYE el mostrador (noSeller) para que los % sumen ~100%.
    const sellers = Array.from(map.values()).sort((a, b) => b.totalUsd - a.totalUsd);
    const grandTotal = sellers.reduce((s, x) => s + x.totalUsd, 0) + noSeller.totalUsd;
    const rows = sellers.map(s => ({
      sellerId: s.sellerId,
      sellerName: s.sellerName,
      sellerCode: s.sellerCode,
      totalUsd: round2(s.totalUsd),
      returnsUsd: round2(s.returnsUsd),
      netUsd: round2(Math.max(0, s.totalUsd - s.returnsUsd)),
      invoiceCount: s.invoiceCount,
      returnCount: s.returnCount,
      pct: grandTotal > 0 ? round2((s.totalUsd / grandTotal) * 100) : 0,
    }));

    // Fila "Sin vendedor" (mostrador), siempre al final, solo si hubo actividad.
    if (noSeller.invoiceCount > 0 || noSeller.returnCount > 0) {
      rows.push({
        sellerId: '__no_seller__',
        sellerName: 'Sin vendedor',
        sellerCode: '—',
        totalUsd: round2(noSeller.totalUsd),
        returnsUsd: round2(noSeller.returnsUsd),
        netUsd: round2(Math.max(0, noSeller.totalUsd - noSeller.returnsUsd)),
        invoiceCount: noSeller.invoiceCount,
        returnCount: noSeller.returnCount,
        pct: grandTotal > 0 ? round2((noSeller.totalUsd / grandTotal) * 100) : 0,
      });
    }

    return rows;
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

  // ── Ventas por categoría (raíz del producto) ──────────────────────────────
  // Suma InvoiceItem.totalUsd agrupado por la categoría del producto. Devuelve el top 8
  // y agrupa el resto en "Otras" para que la gráfica quede legible. Incluye % del total.
  private async getSalesByCategory(dateRange: { gte: Date; lte: Date }) {
    const items = await this.prisma.invoiceItem.findMany({
      where: {
        invoice: {
          status: { in: ['PAID', 'PARTIAL_RETURN'] },
          paidAt: dateRange,
        },
      },
      select: { productId: true, totalUsd: true },
    });
    if (items.length === 0) return [] as { categoryName: string; totalUsd: number; pct: number }[];

    // Mapa productId -> nombre de categoría (una sola consulta para los productos vendidos).
    const productIds = Array.from(new Set(items.map(i => i.productId)));
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, category: { select: { name: true } } },
    });
    const catByProduct = new Map<string, string>();
    for (const p of products) {
      catByProduct.set(p.id, p.category?.name || 'Sin categoría');
    }

    const map = new Map<string, number>();
    for (const it of items) {
      const cat = catByProduct.get(it.productId) || 'Sin categoría';
      map.set(cat, (map.get(cat) || 0) + it.totalUsd);
    }

    const sorted = Array.from(map.entries())
      .map(([categoryName, totalUsd]) => ({ categoryName, totalUsd }))
      .sort((a, b) => b.totalUsd - a.totalUsd);

    const grandTotal = sorted.reduce((s, x) => s + x.totalUsd, 0);
    const toPct = (v: number) => (grandTotal > 0 ? round2((v / grandTotal) * 100) : 0);
    const TOP = 8;
    const top = sorted.slice(0, TOP);
    const rest = sorted.slice(TOP);

    type CatRow = { categoryName: string; totalUsd: number; pct: number };
    const result: (CatRow & { breakdown?: CatRow[] })[] = top.map(c => ({
      categoryName: c.categoryName,
      totalUsd: round2(c.totalUsd),
      pct: toPct(c.totalUsd),
    }));

    // "Otras" agrupa todo lo que quedó fuera del top 8; se adjunta el desglose para poder
    // expandirlo en el frontend (gráfica clickeable).
    if (rest.length > 0) {
      const restTotal = rest.reduce((s, x) => s + x.totalUsd, 0);
      result.push({
        categoryName: 'Otras',
        totalUsd: round2(restTotal),
        pct: toPct(restTotal),
        breakdown: rest.map(c => ({
          categoryName: c.categoryName,
          totalUsd: round2(c.totalUsd),
          pct: toPct(c.totalUsd),
        })),
      });
    }

    return result;
  }

  // ── Ventas fiscales vs no fiscales ────────────────────────────────────────
  // Clasifica cada factura por Invoice.serie.isFiscal (sin serie = no fiscal) usando su venta
  // REAL (neta por factura). INCLUYE al grupo, asi que fiscal+no-fiscal = KPI "Ventas".
  private summarizeByFiscalType(rows: NetInvoiceRow[]) {
    let fiscalUsd = 0, fiscalBs = 0, fiscalCount = 0;
    let nonFiscalUsd = 0, nonFiscalBs = 0, nonFiscalCount = 0;
    for (const r of rows) {
      if (r.isFiscal) {
        fiscalUsd += r.netUsd; fiscalBs += r.netBs; if (r.netUsd > 0) fiscalCount += 1;
      } else {
        nonFiscalUsd += r.netUsd; nonFiscalBs += r.netBs; if (r.netUsd > 0) nonFiscalCount += 1;
      }
    }
    const totalUsd = fiscalUsd + nonFiscalUsd;

    return {
      fiscalUsd: round2(fiscalUsd),
      fiscalBs: round2(fiscalBs),
      fiscalCount,
      fiscalPct: totalUsd > 0 ? round2((fiscalUsd / totalUsd) * 100) : 0,
      nonFiscalUsd: round2(nonFiscalUsd),
      nonFiscalBs: round2(nonFiscalBs),
      nonFiscalCount,
      nonFiscalPct: totalUsd > 0 ? round2((nonFiscalUsd / totalUsd) * 100) : 0,
      totalUsd: round2(totalUsd),
    };
  }

  // ── Facturado por plataformas de financiamiento (Cashea / Crediagro) ────────
  // Suma los pagos de facturas cobradas en el periodo cuyo metodo es Cashea o Crediagro
  // (match por nombre, tolera variantes/hijos). Es lo "facturado" via cada plataforma.
  private async getFinancingSales(dateRange: { gte: Date; lte: Date }) {
    const payments = await this.prisma.payment.findMany({
      where: {
        invoice: { status: { in: ['PAID', 'PARTIAL_RETURN'] }, paidAt: dateRange },
        OR: [
          { method: { name: { contains: 'cashea', mode: 'insensitive' } } },
          { method: { name: { contains: 'crediagro', mode: 'insensitive' } } },
        ],
      },
      select: { amountUsd: true, amountBs: true, method: { select: { name: true } } },
    });

    let casheaUsd = 0, casheaBs = 0, crediagroUsd = 0, crediagroBs = 0;
    for (const p of payments) {
      const n = (p.method?.name || '').toLowerCase();
      if (n.includes('cashea')) { casheaUsd += p.amountUsd; casheaBs += p.amountBs; }
      else if (n.includes('crediagro')) { crediagroUsd += p.amountUsd; crediagroBs += p.amountBs; }
    }

    return {
      casheaUsd: round2(casheaUsd),
      casheaBs: round2(casheaBs),
      crediagroUsd: round2(crediagroUsd),
      crediagroBs: round2(crediagroBs),
    };
  }

  // ── Cash summary ──────────────────────────────────────────────────────────

  private async getCashSummary(dateRange: { gte: Date; lte: Date }) {
    // El resumen de caja se calcula sobre el libro mayor (CashLedgerEntry), que registra
    // TODO el flujo de dinero: pagos de ventas, cobros/pagos de recibos, anticipos, gastos,
    // vuelto y movimientos manuales. (Antes se leia CashMovement, que NO incluye los pagos
    // de ventas -> los ingresos salian siempre en 0.) direction IN = ingreso, OUT = egreso.
    const entries = await this.prisma.cashLedgerEntry.findMany({
      where: { createdAt: dateRange },
      select: {
        direction: true,
        amountUsd: true,
        amountBs: true,
        method: { select: { name: true } },
      },
    });

    let totalIncomeUsd = 0, totalIncomeBs = 0;
    let totalExpensesUsd = 0, totalExpensesBs = 0;
    // "Por metodo" agrupa los INGRESOS por metodo de pago (efectivo, Zelle, PdV, Cashea...).
    const methodMap = new Map<string, { methodName: string; totalUsd: number; totalBs: number }>();

    for (const e of entries) {
      if (e.direction === 'IN') {
        totalIncomeUsd += e.amountUsd;
        totalIncomeBs += e.amountBs;
        const name = e.method?.name || 'Otros';
        const existing = methodMap.get(name);
        if (existing) {
          existing.totalUsd += e.amountUsd;
          existing.totalBs += e.amountBs;
        } else {
          methodMap.set(name, { methodName: name, totalUsd: e.amountUsd, totalBs: e.amountBs });
        }
      } else {
        totalExpensesUsd += e.amountUsd;
        totalExpensesBs += e.amountBs;
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
        const h = caracasParts(new Date(inv.paidAt)).hour;
        hours[h].totalUsd += inv.totalUsd;
        hours[h].count += 1;
      }
      // Only return hours 7-21 for cleaner display
      return hours.slice(7, 22).map(h => ({ ...h, totalUsd: round2(h.totalUsd) }));
    } else {
      // Group by day (en horas de Caracas)
      const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      const dayMap = new Map<string, { label: string; totalUsd: number; count: number }>();
      // Venezuela no tiene DST, asi que el paso fijo de 24h cae siempre en medianoche Caracas.
      for (let t = from.getTime(); t <= to.getTime(); t += 86400000) {
        const { ymd } = caracasParts(new Date(t));
        if (dayMap.has(ymd)) continue;
        const [, m, d] = ymd.split('-');
        dayMap.set(ymd, { label: `${Number(d)} ${months[Number(m) - 1]}`, totalUsd: 0, count: 0 });
      }

      for (const inv of invoices) {
        if (!inv.paidAt) continue;
        const { ymd } = caracasParts(new Date(inv.paidAt));
        const entry = dayMap.get(ymd);
        if (entry) {
          entry.totalUsd += inv.totalUsd;
          entry.count += 1;
        }
      }

      return Array.from(dayMap.values()).map(d => ({ ...d, totalUsd: round2(d.totalUsd) }));
    }
  }
}
