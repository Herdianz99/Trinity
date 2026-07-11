'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  DollarSign, FileText, RotateCcw, Target, TrendingUp, TrendingDown,
  AlertCircle, Loader2, RefreshCw, Calendar, ChevronDown, Package,
  Wallet, ArrowUpRight, ArrowDownRight, CreditCard, Landmark,
} from 'lucide-react';
import {
  AreaChart, Area, ComposedChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';

// ── Types ────────────────────────────────────────────────────────────────────

interface DashboardData {
  period: { from: string; to: string };
  sales: {
    totalUsd: number;
    totalBs: number;
    invoiceCount: number;
    avgTicketUsd: number;
    vsLastPeriod: number | null;
    vsLastPeriodCount: number | null;
    vsLastPeriodAvgTicket: number | null;
  };
  returns: {
    totalUsd: number;
    count: number;
    vsLastPeriod: number | null;
  };
  salesBySeller: {
    sellerId: string;
    sellerName: string;
    sellerCode: string;
    totalUsd: number;
    invoiceCount: number;
    pct: number;
  }[];
  topProducts: {
    productId: string;
    productCode: string;
    productName: string;
    unitsSold: number;
    totalUsd: number;
    category: string;
  }[];
  cashSummary: {
    totalIncomeUsd: number;
    totalIncomeBs: number;
    totalExpensesUsd: number;
    totalExpensesBs: number;
    netUsd: number;
    netBs: number;
    byMethod: { methodName: string; totalUsd: number; totalBs: number }[];
  };
  expenses: {
    totalUsd: number;
    totalBs: number;
    byCategory: { categoryName: string; totalUsd: number }[];
  };
  receivables: {
    totalPendingUsd: number;
    totalOverdueUsd: number;
    count: number;
    overdueCount: number;
  };
  payables: {
    totalPendingUsd: number;
    totalOverdueUsd: number;
    count: number;
    overdueCount: number;
  };
  salesTimeline: { label: string; totalUsd: number; count: number }[];
  financing: {
    casheaUsd: number;
    casheaBs: number;
    crediagroUsd: number;
    crediagroBs: number;
    vsCashea: number | null;
    vsCrediagro: number | null;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCompact(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return fmt(n);
}

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function periodLabel(from: string, to: string): string {
  const f = new Date(from);
  const t = new Date(to);
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  if (f.toDateString() === t.toDateString()) {
    return `${f.getDate()} ${months[f.getMonth()]} ${f.getFullYear()}`;
  }
  return `${f.getDate()} ${months[f.getMonth()]} - ${t.getDate()} ${months[t.getMonth()]} ${t.getFullYear()}`;
}

const PRODUCT_BAR_COLORS = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444'];

// ── Component ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const now = new Date();
  const today = toLocalDateStr(now);

  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'Dashboard | Trinity ERP'; }, []);

  // Redirect non-admin users to their own dashboard
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(user => {
      if (!user) return;
      if (user.role === 'SELLER') router.replace('/dashboard/seller');
      else if (!['ADMIN', 'SUPERVISOR'].includes(user.role)) router.replace('/dashboard/home');
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate from/to based on period selection
  useEffect(() => {
    if (period === 'today') {
      setFromDate(today);
      setToDate(today);
    } else if (period === 'week') {
      const start = new Date(now);
      const day = start.getDay();
      start.setDate(start.getDate() - (day === 0 ? 6 : day - 1)); // Monday
      setFromDate(toLocalDateStr(start));
      setToDate(today);
    } else if (period === 'month') {
      setFromDate(toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1)));
      setToDate(today);
    }
    // 'custom' doesn't auto-set
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/proxy/dashboard/gerencial?from=${fromDate}&to=${toDate}`);
      if (!res.ok) throw new Error('Error al cargar dashboard');
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Period label text ───────────────────────────────────────────────────
  const periodLabelMap = { today: 'Hoy', week: 'Esta semana', month: 'Este mes', custom: 'Personalizado' };
  const dateLabel = data ? periodLabel(data.period.from, data.period.to) : '';

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1440px] mx-auto">
      {/* ═══ Header + Period Selector ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Dashboard Gerencial</h1>
          {data && (
            <p className="text-sm text-slate-400 mt-0.5">
              Mostrando datos de: <span className="text-slate-200 font-medium">{periodLabelMap[period]}</span>, {dateLabel}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(['today', 'week', 'month'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                period === p
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 border border-slate-700/50'
              }`}
            >
              {p === 'today' ? 'Hoy' : p === 'week' ? 'Esta semana' : 'Este mes'}
            </button>
          ))}
          <button
            onClick={() => setPeriod('custom')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
              period === 'custom'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 border border-slate-700/50'
            }`}
          >
            <Calendar size={12} />
            Personalizado
          </button>

          {period === 'custom' && (
            <>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 w-[130px]" />
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 w-[130px]" />
            </>
          )}

          <button onClick={fetchData} disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-xl border bg-red-500/10 border-red-500/30 text-red-400 flex items-center gap-2">
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
          <button onClick={fetchData} className="ml-auto text-xs underline hover:text-red-300">Reintentar</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 animate-pulse">
              <div className="h-3 bg-slate-700 rounded w-20 mb-3" />
              <div className="h-8 bg-slate-700 rounded w-32 mb-2" />
              <div className="h-3 bg-slate-700 rounded w-16" />
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          {/* ═══ Row 1: KPI Cards ═══ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiCard
              icon={<DollarSign size={20} />}
              iconBg="bg-emerald-500/15 text-emerald-400"
              label="Ventas"
              value={`$${fmt(data.sales.totalUsd)}`}
              sub={`Bs ${fmt(data.sales.totalBs)}`}
              change={data.sales.vsLastPeriod}
              positiveIsGood
            />
            <KpiCard
              icon={<FileText size={20} />}
              iconBg="bg-blue-500/15 text-blue-400"
              label="Facturas"
              value={`${data.sales.invoiceCount}`}
              sub="facturas cobradas"
              change={data.sales.vsLastPeriodCount}
              positiveIsGood
            />
            <KpiCard
              icon={<RotateCcw size={20} />}
              iconBg="bg-orange-500/15 text-orange-400"
              label="Devoluciones"
              value={`$${fmt(data.returns.totalUsd)}`}
              sub={`${data.returns.count} notas crédito`}
              change={data.returns.vsLastPeriod}
              positiveIsGood={false}
            />
            <KpiCard
              icon={<Target size={20} />}
              iconBg="bg-purple-500/15 text-purple-400"
              label="Ticket Promedio"
              value={`$${fmt(data.sales.avgTicketUsd)}`}
              sub="por factura"
              change={data.sales.vsLastPeriodAvgTicket}
              positiveIsGood
            />
            <KpiCard
              icon={<CreditCard size={20} />}
              iconBg="bg-pink-500/15 text-pink-400"
              label="Cashea"
              value={`$${fmt(data.financing.casheaUsd)}`}
              sub={`Bs ${fmt(data.financing.casheaBs)}`}
              change={data.financing.vsCashea}
              positiveIsGood
            />
            <KpiCard
              icon={<Landmark size={20} />}
              iconBg="bg-teal-500/15 text-teal-400"
              label="Crediagro"
              value={`$${fmt(data.financing.crediagroUsd)}`}
              sub={`Bs ${fmt(data.financing.crediagroBs)}`}
              change={data.financing.vsCrediagro}
              positiveIsGood
            />
          </div>

          {/* ═══ Row 2: CxC + CxP ═══ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-cyan-500/15">
                  <ArrowUpRight size={16} className="text-cyan-400" />
                </div>
                <h3 className="text-sm font-semibold text-slate-300">Cuentas por Cobrar</h3>
                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400 font-medium">TIEMPO REAL</span>
              </div>
              <p className="text-2xl font-bold text-white tabular-nums">${fmt(data.receivables.totalPendingUsd)}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-slate-400">{data.receivables.count} documentos</span>
                {data.receivables.overdueCount > 0 && (
                  <span className="text-xs text-red-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    ${fmt(data.receivables.totalOverdueUsd)} vencidas ({data.receivables.overdueCount})
                  </span>
                )}
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-rose-500/15">
                  <ArrowDownRight size={16} className="text-rose-400" />
                </div>
                <h3 className="text-sm font-semibold text-slate-300">Cuentas por Pagar</h3>
                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400 font-medium">TIEMPO REAL</span>
              </div>
              <p className="text-2xl font-bold text-white tabular-nums">${fmt(data.payables.totalPendingUsd)}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-slate-400">{data.payables.count} documentos</span>
                {data.payables.overdueCount > 0 && (
                  <span className="text-xs text-red-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    ${fmt(data.payables.totalOverdueUsd)} vencidas ({data.payables.overdueCount})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ═══ Row 3: Sales Chart + Sellers ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Sales timeline chart */}
            <div className="lg:col-span-3 bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">
                Ventas (USD) y N° de facturas {period === 'today' ? 'por hora' : 'por día'}
              </h3>
              {data.salesTimeline.length > 0 && data.salesTimeline.some(t => t.totalUsd > 0) ? (
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={data.salesTimeline} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#475569' }} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${fmtCompact(Number(v))}`} />
                    <YAxis yAxisId="right" orientation="right" allowDecimals={false} tick={{ fill: '#f59e0b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#94a3b8' }}
                      formatter={(v: any, name: any) => name === 'Facturas' ? [`${v}`, 'Facturas'] : [`$${fmt(Number(v) || 0)}`, 'Ventas']}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area yAxisId="left" type="monotone" dataKey="totalUsd" name="Ventas" stroke="#10b981" strokeWidth={2} fill="url(#salesGrad)" />
                    <Line yAxisId="right" type="monotone" dataKey="count" name="Facturas" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-slate-500 text-sm">
                  Sin ventas en este período
                </div>
              )}
            </div>

            {/* Sellers table */}
            <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Ventas por Vendedor</h3>
              {data.salesBySeller.length > 0 ? (
                <div className="space-y-3">
                  {data.salesBySeller.map((s) => (
                    <div key={s.sellerId}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-300 font-medium truncate max-w-[120px]">{s.sellerName}</span>
                          <span className="text-[10px] text-slate-500">{s.invoiceCount} fact.</span>
                        </div>
                        <span className="text-xs text-white font-mono font-semibold tabular-nums">${fmt(s.totalUsd)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(s.pct, 2)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5 text-right">{s.pct}%</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-slate-500 text-sm">
                  Sin ventas por vendedor
                </div>
              )}
            </div>
          </div>

          {/* ═══ Row 4: Top Products + Cash Summary ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top 5 Products */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Package size={14} className="text-slate-500" />
                Top 5 Productos
              </h3>
              {data.topProducts.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.topProducts} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${fmtCompact(Number(v))}`} />
                    <YAxis dataKey="productName" type="category" width={120} tick={{ fill: '#cbd5e1', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any, _: any, props: any) => [`$${fmt(Number(v) || 0)} (${props.payload?.unitsSold ?? 0} uds)`, 'Ventas']}
                    />
                    <Bar dataKey="totalUsd" radius={[0, 4, 4, 0]} barSize={20}>
                      {data.topProducts.map((_, i) => (
                        <Cell key={i} fill={PRODUCT_BAR_COLORS[i % PRODUCT_BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-slate-500 text-sm">
                  Sin productos vendidos
                </div>
              )}
            </div>

            {/* Cash Summary */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Wallet size={14} className="text-slate-500" />
                Resumen de Caja
              </h3>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-emerald-400/80 uppercase font-medium mb-1">Ingresos</p>
                  <p className="text-sm font-bold text-emerald-400 tabular-nums">${fmtCompact(data.cashSummary.totalIncomeUsd)}</p>
                  <p className="text-[10px] text-slate-500 tabular-nums">Bs {fmtCompact(data.cashSummary.totalIncomeBs)}</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-red-400/80 uppercase font-medium mb-1">Egresos</p>
                  <p className="text-sm font-bold text-red-400 tabular-nums">${fmtCompact(data.cashSummary.totalExpensesUsd)}</p>
                  <p className="text-[10px] text-slate-500 tabular-nums">Bs {fmtCompact(data.cashSummary.totalExpensesBs)}</p>
                </div>
                <div className={`border rounded-lg p-3 text-center ${
                  data.cashSummary.netUsd >= 0
                    ? 'bg-blue-500/10 border-blue-500/20'
                    : 'bg-orange-500/10 border-orange-500/20'
                }`}>
                  <p className={`text-[10px] uppercase font-medium mb-1 ${data.cashSummary.netUsd >= 0 ? 'text-blue-400/80' : 'text-orange-400/80'}`}>
                    Neto
                  </p>
                  <p className={`text-sm font-bold tabular-nums ${data.cashSummary.netUsd >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                    ${fmtCompact(data.cashSummary.netUsd)}
                  </p>
                  <p className="text-[10px] text-slate-500 tabular-nums">Bs {fmtCompact(data.cashSummary.netBs)}</p>
                </div>
              </div>
              {/* By method */}
              {data.cashSummary.byMethod.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-slate-500 uppercase font-medium">Por método</p>
                  {data.cashSummary.byMethod.map((m) => (
                    <div key={m.methodName} className="flex items-center justify-between py-1 border-b border-slate-700/30 last:border-0">
                      <span className="text-xs text-slate-400">{m.methodName}</span>
                      <span className="text-xs text-white font-mono tabular-nums">${fmt(m.totalUsd)}</span>
                    </div>
                  ))}
                </div>
              )}
              {data.cashSummary.byMethod.length === 0 && data.cashSummary.totalIncomeUsd === 0 && (
                <div className="text-center text-slate-500 text-sm py-4">Sin movimientos</div>
              )}
            </div>
          </div>

          {/* ═══ Row 5: Expenses ═══ */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Gastos del Período</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Summary */}
              <div>
                <div className="flex items-baseline gap-3 mb-4">
                  <p className="text-2xl font-bold text-white tabular-nums">${fmt(data.expenses.totalUsd)}</p>
                  <p className="text-sm text-slate-500 tabular-nums">Bs {fmt(data.expenses.totalBs)}</p>
                </div>
                {data.expenses.byCategory.length > 0 ? (
                  <div className="space-y-2">
                    {data.expenses.byCategory.map((cat) => {
                      const pct = data.expenses.totalUsd > 0 ? (cat.totalUsd / data.expenses.totalUsd) * 100 : 0;
                      return (
                        <div key={cat.categoryName}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs text-slate-400">{cat.categoryName}</span>
                            <span className="text-xs text-white font-mono tabular-nums">${fmt(cat.totalUsd)}</span>
                          </div>
                          <div className="h-1 bg-slate-700/60 rounded-full overflow-hidden">
                            <div className="h-full bg-orange-500/70 rounded-full" style={{ width: `${Math.max(pct, 2)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Sin gastos registrados</p>
                )}
              </div>

              {/* Ingresos vs Gastos comparison */}
              <div>
                <p className="text-xs text-slate-500 uppercase font-medium mb-3">Ingresos vs Gastos</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={[
                    { name: 'Ingresos', value: data.cashSummary.totalIncomeUsd },
                    { name: 'Gastos', value: data.expenses.totalUsd },
                  ]} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${fmtCompact(Number(v))}`} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any) => [`$${fmt(Number(v) || 0)}`, '']}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40}>
                      <Cell fill="#10b981" />
                      <Cell fill="#f97316" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── KPI Card Sub-Component ───────────────────────────────────────────────────

function KpiCard({
  icon, iconBg, label, value, sub, change, positiveIsGood,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  sub: string;
  change: number | null;
  positiveIsGood: boolean;
}) {
  const isGood = change !== null && change !== 0
    ? positiveIsGood ? change > 0 : change < 0
    : null;

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:border-slate-600/60 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">{label}</span>
        <div className={`p-2 rounded-lg ${iconBg}`}>{icon}</div>
      </div>
      <p className="text-2xl font-bold text-white tabular-nums mb-1">{value}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{sub}</span>
        {change !== null && change !== 0 ? (
          <span className={`text-xs font-medium flex items-center gap-0.5 ${
            isGood ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {change > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {change > 0 ? '+' : ''}{change}%
          </span>
        ) : change === null ? (
          <span className="text-xs text-slate-600">--</span>
        ) : null}
      </div>
    </div>
  );
}
