'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Target, FileText, RotateCcw, TrendingUp, TrendingDown,
  AlertCircle, Loader2, RefreshCw, Package, Pencil, Check, X,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ── Types ────────────────────────────────────────────────────────────────────

interface SellerDashboard {
  period: { from: string; to: string };
  seller: { name: string; code: string };
  goal: {
    monthlyGoalUsd: number;
    isSet: boolean;
    pct: number | null;
    vsLastPeriod: number | null;
    invoiceCount: number;
  };
  returns: { pctOfSales: number; count: number };
  topProducts: { productName: string; productCode: string; unitsSold: number; sharePct: number }[];
  salesTimeline: { label: string; pct: number; count: number }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtUsd(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SellerDashboardPage() {
  const now = new Date();
  const today = toLocalDateStr(now);

  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [data, setData] = useState<SellerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Meta editing
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);

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
      const res = await fetch(`/api/proxy/dashboard/vendedor?from=${fromDate}&to=${toDate}&period=${period}`);
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
  }, [fromDate, toDate, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function saveGoal() {
    const val = parseFloat(goalInput);
    if (isNaN(val) || val < 0) return;
    setSavingGoal(true);
    try {
      const res = await fetch('/api/proxy/dashboard/vendedor/meta', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyGoalUsd: val }),
      });
      if (res.ok) {
        setEditingGoal(false);
        fetchData();
      }
    } finally {
      setSavingGoal(false);
    }
  }

  function openEditGoal() {
    setGoalInput(data && data.goal.monthlyGoalUsd > 0 ? String(data.goal.monthlyGoalUsd) : '');
    setEditingGoal(true);
  }

  // ── Greeting ──────────────────────────────────────────────────────────────
  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return 'Buenos dias';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  })();

  const todayFormatted = now.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const periodLabel = period === 'today' ? 'hoy' : period === 'week' ? 'esta semana' : 'este mes';

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
        <div className="h-40 bg-slate-800/50 rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-28 bg-slate-800/50 rounded-xl" />
          <div className="h-28 bg-slate-800/50 rounded-xl" />
        </div>
        <div className="h-52 bg-slate-800/50 rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const vs = data.goal.vsLastPeriod;
  const pct = data.goal.pct;

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
                period === key ? 'bg-emerald-500/20 text-emerald-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ Hero — % de meta ═══ */}
      <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 rounded-2xl p-5">
        <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
          <Target size={15} />
          <span className="text-xs font-semibold uppercase tracking-wider">Avance de mi meta — {periodLabel}</span>
        </div>

        {data.goal.isSet && pct !== null ? (
          <>
            <div className="flex items-end gap-3">
              <p className="text-5xl font-bold text-slate-100 tabular-nums leading-none">{pct}%</p>
              {vs !== null && (
                <div className={`flex items-center gap-0.5 mb-1 text-sm ${vs >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {vs >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  <span>{vs >= 0 ? '+' : ''}{vs}%</span>
                  <span className="text-slate-500 ml-0.5 text-xs">
                    vs {period === 'today' ? 'ayer' : period === 'week' ? 'sem. ant.' : 'mes ant.'}
                  </span>
                </div>
              )}
            </div>
            {/* Progress bar */}
            <div className="mt-3 h-2.5 bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-gradient-to-r from-emerald-400 to-teal-300' : 'bg-gradient-to-r from-emerald-500 to-teal-400'}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </>
        ) : (
          <div className="py-2">
            <p className="text-slate-300 text-sm">Aun no defines tu meta del mes.</p>
            <p className="text-slate-500 text-xs mt-0.5">Definela para ver tu avance en porcentaje.</p>
          </div>
        )}

        {/* Meta editor */}
        <div className="mt-4 pt-3 border-t border-emerald-500/15">
          {editingGoal ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Meta del mes $</span>
              <input
                type="number"
                min="0"
                step="1"
                autoFocus
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') setEditingGoal(false); }}
                placeholder="Ej: 5000"
                className="w-28 bg-slate-900/80 border border-slate-600/50 rounded-lg px-2.5 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
              />
              <button onClick={saveGoal} disabled={savingGoal} className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50">
                {savingGoal ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              </button>
              <button onClick={() => setEditingGoal(false)} className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300">
                <X size={14} />
              </button>
            </div>
          ) : (
            <button onClick={openEditGoal} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-emerald-300 transition-colors">
              <span>Meta del mes: <span className="text-slate-200 font-semibold">${fmtUsd(data.goal.monthlyGoalUsd)}</span></span>
              <Pencil size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ═══ Row — Facturas & Devoluciones ═══ */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-blue-400 mb-2">
            <FileText size={14} />
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider">Facturas</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-slate-100 tabular-nums">{data.goal.invoiceCount}</p>
          <p className="text-xs text-slate-500 mt-1.5">{periodLabel}</p>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-red-400 mb-2">
            <RotateCcw size={14} />
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider">Devoluciones</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-slate-100 tabular-nums">{data.returns.pctOfSales}%</p>
          <p className="text-xs text-slate-500 mt-1.5">
            de tus ventas · {data.returns.count} {data.returns.count === 1 ? 'nota' : 'notas'}
          </p>
        </div>
      </div>

      {/* ═══ Sales Chart (en %) ═══ */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">
          Avance {period === 'today' ? 'por hora' : 'por dia'} <span className="text-slate-500 font-normal">(% de meta)</span>
        </h3>
        {data.goal.isSet && data.salesTimeline.some(t => t.pct > 0) ? (
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
              <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(v: any) => [`${Number(v) || 0}%`, 'Avance']}
              />
              <Area type="monotone" dataKey="pct" stroke="#10b981" strokeWidth={2} fill="url(#sellerGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-slate-500 text-sm">
            {data.goal.isSet ? 'Sin ventas en este periodo' : 'Define tu meta para ver el avance'}
          </div>
        )}
      </div>

      {/* ═══ Top 5 Products (% participacion) ═══ */}
      {data.topProducts.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-1.5">
            <Package size={14} className="text-slate-400" />
            Top productos <span className="text-slate-500 font-normal">(% de tus ventas)</span>
          </h3>
          <div className="space-y-2.5">
            {data.topProducts.map((p, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-0.5">
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="text-sm text-slate-200 truncate">{p.productName}</p>
                    <p className="text-[10px] text-slate-500">{p.productCode} &middot; {p.unitsSold} uds</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-300 tabular-nums shrink-0">{p.sharePct}%</span>
                </div>
                <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                    style={{ width: `${Math.min(p.sharePct, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
