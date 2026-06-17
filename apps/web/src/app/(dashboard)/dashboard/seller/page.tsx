'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  DollarSign, FileText, RotateCcw, Clock, TrendingUp, TrendingDown,
  AlertCircle, Loader2, RefreshCw, ChevronRight, Package, AlertTriangle,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ── Types ────────────────────────────────────────────────────────────────────

interface SellerDashboard {
  period: { from: string; to: string };
  seller: { name: string; code: string };
  sales: {
    totalUsd: number;
    totalBs: number;
    netUsd: number;
    invoiceCount: number;
    avgTicketUsd: number;
    vsLastPeriod: number | null;
  };
  pendingInvoices: { count: number; totalUsd: number };
  returns: { totalUsd: number; count: number };
  topProducts: { productName: string; productCode: string; unitsSold: number; totalUsd: number }[];
  salesTimeline: { label: string; totalUsd: number; count: number }[];
  receivables: { totalPendingUsd: number; totalOverdueUsd: number; count: number };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCompact(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return fmt(n);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SellerDashboardPage() {
  const router = useRouter();
  const now = new Date();
  const today = toLocalDateStr(now);

  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [data, setData] = useState<SellerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'Mi Dashboard | Trinity ERP'; }, []);

  useEffect(() => {
    if (period === 'today') {
      setFromDate(today);
      setToDate(today);
    } else if (period === 'week') {
      const start = new Date(now);
      const day = start.getDay();
      start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
      setFromDate(toLocalDateStr(start));
      setToDate(today);
    } else if (period === 'month') {
      setFromDate(toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1)));
      setToDate(today);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/proxy/dashboard/vendedor?from=${fromDate}&to=${toDate}`);
      if (res.status === 404) {
        setError('no-seller');
        return;
      }
      if (!res.ok) throw new Error('Error al cargar dashboard');
      setData(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Greeting ──────────────────────────────────────────────────────────────
  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return 'Buenos dias';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  })();

  const todayFormatted = now.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // ── Error states ──────────────────────────────────────────────────────────

  if (error === 'no-seller') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <AlertCircle className="mx-auto text-amber-400" size={48} />
          <h2 className="text-xl font-semibold text-slate-200">Sin vendedor asignado</h2>
          <p className="text-slate-400 text-sm max-w-sm">
            Tu cuenta no tiene un vendedor vinculado. Contacta al administrador para que te asigne uno.
          </p>
        </div>
      </div>
    );
  }

  if (error && error !== 'no-seller') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <AlertCircle className="mx-auto text-red-400" size={48} />
          <p className="text-slate-300">{error}</p>
          <button onClick={fetchData} className="text-sm text-emerald-400 hover:text-emerald-300 flex items-center gap-1 mx-auto">
            <RefreshCw size={14} /> Reintentar
          </button>
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="space-y-4 p-4 sm:p-0 animate-pulse">
        <div className="h-16 bg-slate-800/50 rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-28 bg-slate-800/50 rounded-xl" />
          <div className="h-28 bg-slate-800/50 rounded-xl" />
          <div className="h-28 bg-slate-800/50 rounded-xl" />
          <div className="h-28 bg-slate-800/50 rounded-xl" />
        </div>
        <div className="h-52 bg-slate-800/50 rounded-xl" />
        <div className="h-40 bg-slate-800/50 rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const vs = data.sales.vsLastPeriod;

  return (
    <div className="space-y-4 sm:space-y-5 max-w-3xl mx-auto -mx-6 -mt-6 lg:-mt-8 lg:-mx-8 px-4 pt-5 pb-8 sm:px-6 sm:pt-6">
      {/* ═══ Header ═══ */}
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100">
              {greeting}, {data.seller.name.split(' ')[0]}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5 capitalize">{todayFormatted}</p>
          </div>
          {loading && <Loader2 size={18} className="text-emerald-400 animate-spin mt-1" />}
        </div>

        {/* Period selector */}
        <div className="flex gap-1.5 bg-slate-800/60 rounded-lg p-1 w-fit">
          {([
            { key: 'today', label: 'Hoy' },
            { key: 'week', label: 'Semana' },
            { key: 'month', label: 'Mes' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                period === key
                  ? 'bg-emerald-500/20 text-emerald-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ Row 1 — Main KPIs ═══ */}
      <div className="grid grid-cols-2 gap-3">
        {/* Mis Ventas */}
        <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-emerald-400 mb-2">
            <DollarSign size={14} />
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider">Mis Ventas</span>
            <span className="text-[9px] text-slate-500 normal-case font-normal">bruto</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-slate-100 tabular-nums">${fmt(data.sales.totalUsd)}</p>
          {vs !== null && (
            <div className={`flex items-center gap-0.5 mt-1.5 text-xs ${vs >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {vs >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              <span>{vs >= 0 ? '+' : ''}{vs}%</span>
              <span className="text-slate-500 ml-0.5">
                vs {period === 'today' ? 'ayer' : period === 'week' ? 'sem. ant.' : 'mes ant.'}
              </span>
            </div>
          )}
          <div className="mt-2 pt-2 border-t border-emerald-500/15 flex items-center justify-between">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Neto real</span>
            <span className="text-sm font-bold text-emerald-300 tabular-nums">${fmt(data.sales.netUsd)}</span>
          </div>
        </div>

        {/* Facturas */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-blue-400 mb-2">
            <FileText size={14} />
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider">Facturas</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-slate-100 tabular-nums">{data.sales.invoiceCount}</p>
          <p className="text-xs text-slate-500 mt-1.5">
            Ticket: <span className="text-slate-300 font-medium">${fmt(data.sales.avgTicketUsd)}</span>
          </p>
        </div>
      </div>

      {/* ═══ Row 2 — Pending & Returns ═══ */}
      <div className="grid grid-cols-2 gap-3">
        {/* Pendientes */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-amber-400 mb-2">
            <Clock size={14} />
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider">Pendientes</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-slate-100 tabular-nums">{data.pendingInvoices.count}</p>
          <p className="text-xs text-slate-500 mt-1.5">
            ${fmt(data.pendingInvoices.totalUsd)} <span className="text-slate-600">por cobrar</span>
          </p>
        </div>

        {/* Devoluciones */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-red-400 mb-2">
            <RotateCcw size={14} />
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider">Devoluciones</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-slate-100 tabular-nums">${fmt(data.returns.totalUsd)}</p>
          <p className="text-xs text-slate-500 mt-1.5">
            {data.returns.count} {data.returns.count === 1 ? 'nota' : 'notas'}
          </p>
        </div>
      </div>

      {/* ═══ Sales Chart ═══ */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">
          Ventas {period === 'today' ? 'por hora' : 'por dia'}
        </h3>
        {data.salesTimeline.some(t => t.totalUsd > 0) ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.salesTimeline} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="sellerGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={{ stroke: '#475569' }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${fmtCompact(Number(v))}`} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(v: any) => [`$${fmt(Number(v) || 0)}`, 'Ventas']}
              />
              <Area type="monotone" dataKey="totalUsd" stroke="#10b981" strokeWidth={2} fill="url(#sellerGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-slate-500 text-sm">
            Sin ventas en este periodo
          </div>
        )}
      </div>

      {/* ═══ CxC from my clients ═══ */}
      {data.receivables.count > 0 && (
        <div className={`border rounded-xl p-4 ${
          data.receivables.totalOverdueUsd > 0
            ? 'bg-red-500/5 border-red-500/20'
            : 'bg-slate-800/50 border-slate-700/50'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                {data.receivables.totalOverdueUsd > 0 && <AlertTriangle size={14} className="text-red-400" />}
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">CxC Mis Clientes</span>
              </div>
              <p className="text-lg font-bold text-slate-100">${fmt(data.receivables.totalPendingUsd)}</p>
              <div className="flex gap-3 mt-1 text-xs">
                <span className="text-slate-500">{data.receivables.count} pendientes</span>
                {data.receivables.totalOverdueUsd > 0 && (
                  <span className="text-red-400">${fmt(data.receivables.totalOverdueUsd)} vencidas</span>
                )}
              </div>
            </div>
            <button
              onClick={() => router.push('/receivables')}
              className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 shrink-0"
            >
              Ver detalle <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Top 5 Products ═══ */}
      {data.topProducts.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-1.5">
            <Package size={14} className="text-slate-400" />
            Top productos
          </h3>
          <div className="space-y-2.5">
            {data.topProducts.map((p, i) => {
              const maxUsd = data.topProducts[0].totalUsd;
              const pct = maxUsd > 0 ? (p.totalUsd / maxUsd) * 100 : 0;
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="min-w-0 flex-1 mr-3">
                      <p className="text-sm text-slate-200 truncate">{p.productName}</p>
                      <p className="text-[10px] text-slate-500">{p.productCode} &middot; {p.unitsSold} uds</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-300 tabular-nums shrink-0">${fmt(p.totalUsd)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
