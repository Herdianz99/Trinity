'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Loader2,
  DollarSign,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  ListFilter,
  Clock,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

interface Receivable {
  id: string;
  type: string;
  platformName: string | null;
  invoice: { id: string; number: string };
  amountUsd: number;
  paidAmountUsd: number;
  balanceUsd: number;
  status: string;
  createdAt: string;
  payments: { id: string; amountUsd: number; createdAt: string; method: { id: string; name: string } | null }[];
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  PARTIAL: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  PAID: 'text-green-400 border-green-500/30 bg-green-500/10',
  OVERDUE: 'text-red-400 border-red-500/30 bg-red-500/10',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Pagado',
  OVERDUE: 'Vencido',
};

// Payment method labels come from payment.method.name (relation)

function fmtNum(n: number) {
  return (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fmtMonth(ym: string) {
  const [y, m] = (ym || '').split('-');
  const idx = parseInt(m, 10) - 1;
  if (isNaN(idx) || !MONTH_ABBR[idx]) return ym;
  return `${MONTH_ABBR[idx]} ${y.slice(2)}`;
}

// ── Análisis de plataformas ──────────────────────────────────────────────────

interface PlatformStat {
  platform: string;
  salesCount: number; salesUsd: number; salesBs: number;
  collectedUsd: number; collectedBs: number;
  pendingUsd: number; pendingBs: number;
  collectionRatio: number;
  avgFinancedPct: number; weightedFinancedPct: number; avgInitialPct: number;
  avgDaysToFirst: number | null; withPaymentCount: number;
  avgDaysToFull: number | null; paidCount: number;
  aging: { d0_30: number; d31_60: number; d61_90: number; d90plus: number };
  invoicesCount: number; invoiceValueUsd: number; invoiceValueBs: number;
  shareByCount: number; shareByValue: number;
}
interface AnalyticsData {
  from: string | null; to: string | null;
  company: { totalInvoices: number; totalSalesUsd: number; totalSalesBs: number };
  platforms: PlatformStat[];
  monthly: { ym: string; CASHEA: number; CREDIAGRO: number }[];
}

const PLAT_STYLE: Record<string, { label: string; card: string; iconBox: string; accent: string; bar: string }> = {
  CASHEA: { label: 'Cashea', card: 'border-cyan-500/30', iconBox: 'text-cyan-400 bg-cyan-500/10', accent: 'text-cyan-400', bar: '#22d3ee' },
  CREDIAGRO: { label: 'Crediagro', card: 'border-violet-500/30', iconBox: 'text-violet-400 bg-violet-500/10', accent: 'text-violet-400', bar: '#a78bfa' },
};
const PLAT_ORDER = ['CASHEA', 'CREDIAGRO'];

function emptyStat(platform: string): PlatformStat {
  return {
    platform, salesCount: 0, salesUsd: 0, salesBs: 0, collectedUsd: 0, collectedBs: 0,
    pendingUsd: 0, pendingBs: 0, collectionRatio: 0, avgFinancedPct: 0, weightedFinancedPct: 0,
    avgInitialPct: 0, avgDaysToFirst: null, withPaymentCount: 0, avgDaysToFull: null, paidCount: 0,
    aging: { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 },
    invoicesCount: 0, invoiceValueUsd: 0, invoiceValueBs: 0, shareByCount: 0, shareByValue: 0,
  };
}

function PlatformAnalytics() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/proxy/receivables/platforms/analytics?${params}`);
      const d = await res.json();
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fija el rango a un mes-calendario relativo (0 = este mes, -1 = el pasado)
  function setMonthOffset(offset: number) {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const y = first.getFullYear();
    const m = String(first.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, first.getMonth() + 1, 0).getDate();
    setFrom(`${y}-${m}-01`);
    setTo(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
  }

  const statMap = new Map((data?.platforms || []).map(s => [s.platform, s]));
  const stats = PLAT_ORDER.map(k => statMap.get(k) || emptyStat(k));
  const monthly = data?.monthly || [];
  const company = data?.company || { totalInvoices: 0, totalSalesUsd: 0, totalSalesBs: 0 };
  const rangeLabel = from || to ? `${from || '…'} → ${to || 'hoy'}` : 'Últimos 12 meses';

  return (
    <div className="space-y-6">
      {/* Filtro de período */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Desde</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Hasta</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
          </div>
          <button onClick={() => setMonthOffset(0)}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-700/40 text-slate-300 hover:bg-slate-700/70">Este mes</button>
          <button onClick={() => setMonthOffset(-1)}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-700/40 text-slate-300 hover:bg-slate-700/70">Mes pasado</button>
          {(from || to) && (
            <button onClick={() => { setFrom(''); setTo(''); }}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-700/40 text-slate-300 hover:bg-slate-700/70">Limpiar</button>
          )}
          <span className="ml-auto text-xs text-slate-500 flex items-center gap-1.5">
            <ListFilter size={13} /> {rangeLabel}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" size={28} /></div>
      ) : (
        <>
          {/* Tarjetas por plataforma */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {stats.map(s => {
              const st = PLAT_STYLE[s.platform];
              return (
                <div key={s.platform} className={`bg-slate-800/50 border ${st.card} rounded-xl p-5`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2 rounded-lg ${st.iconBox}`}><CreditCard size={18} /></div>
                      <div>
                        <h3 className="font-semibold text-slate-100">{st.label}</h3>
                        <p className="text-xs text-slate-500">{s.salesCount} ventas en el período</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-xl font-bold ${st.accent}`}>${fmtNum(s.salesUsd)}</p>
                      <p className="text-xs text-slate-500">Bs {fmtNum(s.salesBs)}</p>
                    </div>
                  </div>

                  {/* % financiado vs cuota inicial */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-slate-900/50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-1">Financiado (promedio)</p>
                      <p className={`text-2xl font-bold ${st.accent}`}>{s.avgFinancedPct}%</p>
                      <p className="text-[11px] text-slate-500">ponderado {s.weightedFinancedPct}%</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-1">Cuota inicial (promedio)</p>
                      <p className="text-2xl font-bold text-slate-200">{s.avgInitialPct}%</p>
                      <p className="text-[11px] text-slate-500">lo que pone el cliente</p>
                    </div>
                  </div>

                  {/* Cobrado / pendiente + ratio */}
                  <div className="space-y-2 mb-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Cobrado</span>
                      <span className="text-green-400 font-medium">${fmtNum(s.collectedUsd)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Pendiente por cobrar</span>
                      <span className="text-amber-400 font-medium">${fmtNum(s.pendingUsd)}</span>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Ratio de cobranza</span><span>{s.collectionRatio}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-700/50 overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, s.collectionRatio)}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Tiempo de pago */}
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-700/40">
                    <div className="text-center">
                      <p className="text-xs text-slate-400 flex items-center justify-center gap-1"><Clock size={12} /> Días al 1er abono</p>
                      <p className="text-lg font-semibold text-slate-100">{s.avgDaysToFirst != null ? s.avgDaysToFirst : '—'}</p>
                      <p className="text-[10px] text-slate-500">{s.withPaymentCount} con abono</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400 flex items-center justify-center gap-1"><Clock size={12} /> Días en saldar</p>
                      <p className="text-lg font-semibold text-slate-100">{s.avgDaysToFull != null ? s.avgDaysToFull : '—'}</p>
                      <p className="text-[10px] text-slate-500">{s.paidCount} saldadas</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Peso en las ventas de la empresa */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h3 className="font-semibold text-slate-100">Peso en las ventas de la empresa</h3>
              <span className="text-xs text-slate-500">{company.totalInvoices} facturas · ${fmtNum(company.totalSalesUsd)} en el período</span>
            </div>
            <p className="text-xs text-slate-500 mb-5">Qué parte de todas las ventas de la empresa pasó por cada plataforma</p>
            <div className="space-y-5">
              {stats.map(s => {
                const st = PLAT_STYLE[s.platform];
                return (
                  <div key={s.platform}>
                    <span className={`text-sm font-semibold ${st.accent}`}>{st.label}</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-400">Por cantidad de facturas</span>
                          <span className="text-slate-100 font-semibold">{s.shareByCount}%</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-700/50 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, s.shareByCount)}%`, background: st.bar }} />
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">{s.invoicesCount} de {company.totalInvoices} facturas</p>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-400">Por monto vendido ($)</span>
                          <span className="text-slate-100 font-semibold">{s.shareByValue}%</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-700/50 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, s.shareByValue)}%`, background: st.bar }} />
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">${fmtNum(s.invoiceValueUsd)} de ${fmtNum(company.totalSalesUsd)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Aging de lo pendiente */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <h3 className="font-semibold text-slate-100 mb-1">Antigüedad de lo pendiente</h3>
            <p className="text-xs text-slate-500 mb-4">Saldo por cobrar según los días desde la venta — snapshot actual (no depende del período)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 text-slate-400">
                    <th className="text-left px-3 py-2 font-medium">Plataforma</th>
                    <th className="text-right px-3 py-2 font-medium">0–30 días</th>
                    <th className="text-right px-3 py-2 font-medium">31–60 días</th>
                    <th className="text-right px-3 py-2 font-medium">61–90 días</th>
                    <th className="text-right px-3 py-2 font-medium text-red-400">+90 días</th>
                    <th className="text-right px-3 py-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map(s => {
                    const total = s.aging.d0_30 + s.aging.d31_60 + s.aging.d61_90 + s.aging.d90plus;
                    return (
                      <tr key={s.platform} className="border-b border-slate-700/30">
                        <td className="px-3 py-2.5 text-slate-200 font-medium">{PLAT_STYLE[s.platform].label}</td>
                        <td className="px-3 py-2.5 text-right text-slate-300">${fmtNum(s.aging.d0_30)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-300">${fmtNum(s.aging.d31_60)}</td>
                        <td className="px-3 py-2.5 text-right text-amber-400">${fmtNum(s.aging.d61_90)}</td>
                        <td className="px-3 py-2.5 text-right text-red-400">${fmtNum(s.aging.d90plus)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-100">${fmtNum(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tendencia mensual */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <h3 className="font-semibold text-slate-100 mb-4">Ventas por mes vía plataforma (USD)</h3>
            {monthly.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">Sin ventas en el período</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthly} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="ym" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={fmtMonth} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: any, name: any) => [`$${fmtNum(v)}`, name]}
                    labelFormatter={(label: any) => fmtMonth(String(label))}
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#e2e8f0' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="CASHEA" name="Cashea" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="CREDIAGRO" name="Crediagro" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────

export default function PlatformsPage() {
  const [view, setView] = useState<'analisis' | 'listado'>('analisis');
  const [tab, setTab] = useState<'Cashea' | 'Crediagro'>('Cashea');
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summaryTotals, setSummaryTotals] = useState<Record<string, { pending: number; paid: number }>>({
    Cashea: { pending: 0, paid: 0 },
    Crediagro: { pending: 0, paid: 0 },
  });
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [todayRate, setTodayRate] = useState(0);

  // Pay modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedReceivable, setSelectedReceivable] = useState<any>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [paymentMethodsList, setPaymentMethodsList] = useState<{ id: string; name: string }[]>([]);
  const [payReference, setPayReference] = useState('');
  const [processing, setProcessing] = useState(false);

  // Detail modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const fetchReceivables = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: 'FINANCING_PLATFORM',
        platformName: tab,
        page: page.toString(),
        limit: '20',
      });
      const res = await fetch(`/api/proxy/receivables?${params}`);
      const data = await res.json();
      setReceivables(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar datos' });
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/receivables/summary');
      const data = await res.json();
      const totals: Record<string, { pending: number; paid: number }> = {
        Cashea: { pending: 0, paid: 0 },
        Crediagro: { pending: 0, paid: 0 },
      };
      // Match case-insensitive: byPlatform trae el nombre del método (p.ej. 'CASHEA'),
      // mientras las pestañas son 'Cashea'/'Crediagro'.
      for (const p of data.byPlatform || []) {
        const key = Object.keys(totals).find(k => (p.platformName || '').toLowerCase().includes(k.toLowerCase()));
        if (key) totals[key].pending = p.totalUsd;
      }
      // Get total paid per platform
      for (const platform of ['Cashea', 'Crediagro']) {
        const paidRes = await fetch(`/api/proxy/receivables?type=FINANCING_PLATFORM&platformName=${platform}&status=PAID&limit=1`);
        const paidData = await paidRes.json();
        // Just show count for now
        totals[platform].paid = paidData.total || 0;
      }
      setSummaryTotals(totals);
    } catch {}
  }, []);

  useEffect(() => { document.title = 'Plataformas | Trinity ERP'; }, []);

  useEffect(() => {
    try { fetch('/api/proxy/exchange-rate/today').then(r => r.text()).then(t => { if (t) { try { setTodayRate(JSON.parse(t)?.rate || 0); } catch {} } }); } catch {}
    fetch('/api/proxy/payment-methods/flat').then(r => r.json()).then(data => { if (Array.isArray(data)) setPaymentMethodsList(data); }).catch(() => {});
  }, []);

  useEffect(() => { if (view === 'listado') fetchReceivables(); }, [fetchReceivables, view]);
  useEffect(() => { if (view === 'listado') fetchSummary(); }, [fetchSummary, view]);

  async function openPayModal(r: Receivable) {
    try {
      const res = await fetch(`/api/proxy/receivables/${r.id}`);
      const data = await res.json();
      setSelectedReceivable(data);
      setPayAmount(data.balanceUsd.toFixed(2));
      setPayMethod('');
      setPayReference('');
      setPayModalOpen(true);
    } catch {}
  }

  async function openDetailModal(r: Receivable) {
    try {
      const res = await fetch(`/api/proxy/receivables/${r.id}`);
      const data = await res.json();
      setSelectedReceivable(data);
      setDetailModalOpen(true);
    } catch {}
  }

  async function handlePay() {
    if (!selectedReceivable) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/proxy/receivables/${selectedReceivable.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountUsd: parseFloat(payAmount),
          methodId: payMethod,
          reference: payReference || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
      setPayModalOpen(false);
      setMessage({ type: 'success', text: 'Cobro registrado' });
      fetchReceivables();
      fetchSummary();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
          <CreditCard className="text-cyan-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Plataformas de Financiamiento</h1>
          <p className="text-sm text-slate-400">Cashea y Crediagro — análisis y gestión de cobros</p>
        </div>
      </div>

      {/* Switch de vista */}
      <div className="inline-flex rounded-lg bg-slate-800/60 border border-slate-700/50 p-1">
        <button onClick={() => setView('analisis')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            view === 'analisis' ? 'bg-cyan-500/15 text-cyan-400' : 'text-slate-400 hover:text-slate-200'
          }`}>
          <BarChart3 size={16} /> Análisis
        </button>
        <button onClick={() => setView('listado')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            view === 'listado' ? 'bg-cyan-500/15 text-cyan-400' : 'text-slate-400 hover:text-slate-200'
          }`}>
          <ListFilter size={16} /> Listado
        </button>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg border ${message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
          {message.text}
        </div>
      )}

      {view === 'analisis' ? (
        <PlatformAnalytics />
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-2">
            {(['Cashea', 'Crediagro'] as const).map(platform => (
              <button key={platform} onClick={() => { setTab(platform); setPage(1); }}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  tab === platform
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}>
                {platform}
              </button>
            ))}
          </div>

          {/* Summary for selected platform */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <DollarSign className="text-amber-400" size={18} />
                </div>
                <span className="text-sm text-slate-400">{tab} — Pendiente</span>
              </div>
              <p className="text-2xl font-bold text-amber-400">${(summaryTotals[tab]?.pending || 0).toFixed(2)}</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <DollarSign className="text-green-400" size={18} />
                </div>
                <span className="text-sm text-slate-400">{tab} — Cobros completados</span>
              </div>
              <p className="text-2xl font-bold text-green-400">{summaryTotals[tab]?.paid || 0}</p>
            </div>
          </div>

          {/* Table */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Factura</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Monto USD</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Cobrado</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Saldo</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Estado</th>
                    <th className="text-center px-4 py-3 text-slate-400 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="text-center py-8"><Loader2 className="animate-spin mx-auto text-slate-400" size={24} /></td></tr>
                  ) : receivables.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8 text-slate-500">No hay CxC de {tab}</td></tr>
                  ) : receivables.map(r => (
                    <tr key={r.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 text-slate-200 font-mono text-xs">{r.invoice.number}</td>
                      <td className="px-4 py-3 text-right text-slate-200">${r.amountUsd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-slate-300">${r.paidAmountUsd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-100">${r.balanceUsd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-slate-300 text-xs">{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[r.status]}`}>
                          {STATUS_LABELS[r.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {r.status !== 'PAID' && (
                            <button onClick={() => openPayModal(r)}
                              className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/10 transition-colors" title="Registrar cobro">
                              <DollarSign size={16} />
                            </button>
                          )}
                          <button onClick={() => openDetailModal(r)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700/50 transition-colors" title="Ver detalle">
                            <Eye size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
                <span className="text-sm text-slate-400">{total} resultados</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700/50 disabled:opacity-30"><ChevronLeft size={18} /></button>
                  <span className="text-sm text-slate-300">Pagina {page} de {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700/50 disabled:opacity-30"><ChevronRight size={18} /></button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Pay Modal */}
      {payModalOpen && selectedReceivable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPayModalOpen(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
              <h2 className="text-lg font-semibold text-slate-100">Registrar Cobro — {tab}</h2>
              <button onClick={() => setPayModalOpen(false)} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-900/50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Factura</span><span className="text-slate-200 font-mono">{selectedReceivable.invoice.number}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Monto</span><span className="text-slate-200">${selectedReceivable.amountUsd.toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold"><span className="text-slate-300">Saldo</span><span className="text-green-400">${selectedReceivable.balanceUsd.toFixed(2)}</span></div>
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Monto a cobrar (USD)</label>
                <input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
                {todayRate > 0 && payAmount && (
                  <p className="text-xs text-slate-500 mt-1">= Bs {(parseFloat(payAmount) * todayRate).toFixed(2)}</p>
                )}
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Metodo de pago</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200">
                  <option value="">-- Seleccionar --</option>
                  {paymentMethodsList.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Referencia</label>
                <input type="text" value={payReference} onChange={e => setPayReference(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
              </div>
              <button onClick={handlePay} disabled={processing || !payAmount || parseFloat(payAmount) <= 0 || !payMethod}
                className="w-full py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                {processing ? <Loader2 className="animate-spin" size={18} /> : <DollarSign size={18} />}
                Confirmar cobro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModalOpen && selectedReceivable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDetailModalOpen(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
              <h2 className="text-lg font-semibold text-slate-100">Detalle — {selectedReceivable.invoice.number}</h2>
              <button onClick={() => setDetailModalOpen(false)} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-900/50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Plataforma</span><span className="text-slate-200">{selectedReceivable.platformName}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Monto</span><span className="text-slate-200">${selectedReceivable.amountUsd.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Cobrado</span><span className="text-slate-200">${selectedReceivable.paidAmountUsd.toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold"><span className="text-slate-300">Saldo</span><span className="text-green-400">${selectedReceivable.balanceUsd.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Estado</span>
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[selectedReceivable.status]}`}>
                    {STATUS_LABELS[selectedReceivable.status]}
                  </span>
                </div>
              </div>
              <h3 className="text-sm font-semibold text-slate-300">Historial de Pagos</h3>
              {selectedReceivable.payments?.length > 0 ? (
                <div className="bg-slate-900/50 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="text-left px-3 py-2 text-slate-400">Fecha</th>
                        <th className="text-right px-3 py-2 text-slate-400">USD</th>
                        <th className="text-left px-3 py-2 text-slate-400">Metodo</th>
                        <th className="text-left px-3 py-2 text-slate-400">Ref</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedReceivable.payments.map((p: any) => (
                        <tr key={p.id} className="border-b border-slate-700/30">
                          <td className="px-3 py-2 text-slate-300 text-xs">{new Date(p.createdAt).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-slate-200">${p.amountUsd.toFixed(2)}</td>
                          <td className="px-3 py-2 text-slate-300">{p.method?.name || 'Metodo'}</td>
                          <td className="px-3 py-2 text-slate-400 text-xs">{p.reference || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500 bg-slate-900/50 rounded-lg p-3">Sin pagos registrados</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
