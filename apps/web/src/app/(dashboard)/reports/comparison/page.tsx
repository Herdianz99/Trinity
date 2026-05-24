'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Loader2, Calendar, ArrowUpRight, ArrowDownRight, TrendingUp, Receipt, DollarSign, Award, User } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

/* ---------- Types ---------- */

interface PeriodData {
  totalUsd: number;
  invoiceCount: number;
  avgTicketUsd: number;
  topProduct: string;
  topSeller: string;
}

interface ComparisonReport {
  period1: PeriodData;
  period2: PeriodData;
  variationPct: {
    totalUsd: number;
    invoiceCount: number;
    avgTicketUsd: number;
  };
}

/* ---------- Helpers ---------- */

function fmt(n: number) { return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function defaultFrom() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; }
function defaultTo() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function prevMonthFrom() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}

function prevMonthTo() {
  const d = new Date();
  const lastDay = new Date(d.getFullYear(), d.getMonth(), 0);
  return `${lastDay.getFullYear()}-${String(lastDay.getMonth()+1).padStart(2,'0')}-${String(lastDay.getDate()).padStart(2,'0')}`;
}

/* ---------- Component ---------- */

export default function ComparisonReportPage() {
  const [period1From, setPeriod1From] = useState(prevMonthFrom);
  const [period1To, setPeriod1To] = useState(prevMonthTo);
  const [period2From, setPeriod2From] = useState(defaultFrom);
  const [period2To, setPeriod2To] = useState(defaultTo);

  const [report, setReport] = useState<ComparisonReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'Comparativo de Periodos | Trinity ERP'; }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        period1From, period1To, period2From, period2To,
      });
      const res = await fetch(`/api/proxy/reports/comparison?${params}`);
      if (!res.ok) throw new Error('Error al cargar reporte comparativo');
      const data: ComparisonReport = await res.json();
      setReport(data);
      setLoaded(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [period1From, period1To, period2From, period2To]);

  /* Chart data */
  const chartData = report
    ? [
        { name: 'Total USD', periodo1: report.period1.totalUsd, periodo2: report.period2.totalUsd },
        { name: 'Facturas', periodo1: report.period1.invoiceCount, periodo2: report.period2.invoiceCount },
        { name: 'Ticket Prom.', periodo1: report.period1.avgTicketUsd, periodo2: report.period2.avgTicketUsd },
      ]
    : [];

  const VariationBadge = ({ pct }: { pct: number }) => {
    const isPositive = pct >= 0;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
        isPositive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
      }`}>
        {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        {Math.abs(pct).toFixed(1)}%
      </span>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <BarChart3 className="text-blue-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Comparativo de Periodos</h1>
          <p className="text-sm text-slate-400">Compara el rendimiento entre dos periodos de tiempo</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Period 1 */}
          <div className="bg-slate-800/60 border border-slate-700/30 rounded-lg p-3">
            <h3 className="text-sm font-semibold text-blue-400 mb-2">Periodo 1</h3>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-slate-400 mb-1 block">Desde</label>
                <input
                  type="date"
                  value={period1From}
                  onChange={e => setPeriod1From(e.target.value)}
                  className="input-field !py-2.5 text-sm w-full"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-400 mb-1 block">Hasta</label>
                <input
                  type="date"
                  value={period1To}
                  onChange={e => setPeriod1To(e.target.value)}
                  className="input-field !py-2.5 text-sm w-full"
                />
              </div>
            </div>
          </div>

          {/* Period 2 */}
          <div className="bg-slate-800/60 border border-slate-700/30 rounded-lg p-3">
            <h3 className="text-sm font-semibold text-green-400 mb-2">Periodo 2</h3>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-slate-400 mb-1 block">Desde</label>
                <input
                  type="date"
                  value={period2From}
                  onChange={e => setPeriod2From(e.target.value)}
                  className="input-field !py-2.5 text-sm w-full"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-400 mb-1 block">Hasta</label>
                <input
                  type="date"
                  value={period2To}
                  onChange={e => setPeriod2To(e.target.value)}
                  className="input-field !py-2.5 text-sm w-full"
                />
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={fetchReport}
          disabled={loading}
          className="btn-primary flex items-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <Calendar size={16} />}
          Generar reporte
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-blue-400" size={40} />
        </div>
      )}

      {/* Report content */}
      {loaded && report && !loading && (
        <>
          {/* Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Period 1 Card */}
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-5 border-t-2 border-t-blue-500">
              <h3 className="text-sm font-semibold text-blue-400 mb-4 uppercase tracking-wider">Periodo 1</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="text-slate-400" size={16} />
                    <span className="text-sm text-slate-400">Total USD</span>
                  </div>
                  <span className="text-lg font-bold text-slate-100 tabular-nums">${fmt(report.period1.totalUsd)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="text-slate-400" size={16} />
                    <span className="text-sm text-slate-400">Facturas</span>
                  </div>
                  <span className="text-lg font-bold text-slate-100 tabular-nums">{report.period1.invoiceCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="text-slate-400" size={16} />
                    <span className="text-sm text-slate-400">Ticket Promedio</span>
                  </div>
                  <span className="text-lg font-bold text-slate-100 tabular-nums">${fmt(report.period1.avgTicketUsd)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="text-slate-400" size={16} />
                    <span className="text-sm text-slate-400">Producto Top</span>
                  </div>
                  <span className="text-sm font-medium text-slate-200 truncate max-w-[200px]" title={report.period1.topProduct}>
                    {report.period1.topProduct || '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="text-slate-400" size={16} />
                    <span className="text-sm text-slate-400">Vendedor Top</span>
                  </div>
                  <span className="text-sm font-medium text-slate-200 truncate max-w-[200px]" title={report.period1.topSeller}>
                    {report.period1.topSeller || '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Period 2 Card */}
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-5 border-t-2 border-t-green-500">
              <h3 className="text-sm font-semibold text-green-400 mb-4 uppercase tracking-wider">Periodo 2</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="text-slate-400" size={16} />
                    <span className="text-sm text-slate-400">Total USD</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-slate-100 tabular-nums">${fmt(report.period2.totalUsd)}</span>
                    <VariationBadge pct={report.variationPct.totalUsd} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="text-slate-400" size={16} />
                    <span className="text-sm text-slate-400">Facturas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-slate-100 tabular-nums">{report.period2.invoiceCount}</span>
                    <VariationBadge pct={report.variationPct.invoiceCount} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="text-slate-400" size={16} />
                    <span className="text-sm text-slate-400">Ticket Promedio</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-slate-100 tabular-nums">${fmt(report.period2.avgTicketUsd)}</span>
                    <VariationBadge pct={report.variationPct.avgTicketUsd} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="text-slate-400" size={16} />
                    <span className="text-sm text-slate-400">Producto Top</span>
                  </div>
                  <span className="text-sm font-medium text-slate-200 truncate max-w-[200px]" title={report.period2.topProduct}>
                    {report.period2.topProduct || '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="text-slate-400" size={16} />
                    <span className="text-sm text-slate-400">Vendedor Top</span>
                  </div>
                  <span className="text-sm font-medium text-slate-200 truncate max-w-[200px]" title={report.period2.topSeller}>
                    {report.period2.topSeller || '-'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4">
            <h2 className="text-lg font-semibold text-slate-100 mb-4">Comparativo Visual</h2>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData} margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#e2e8f0' }}
                  formatter={(value: any, name: any) => [
                    `$${fmt(Number(value))}`,
                    name === 'periodo1' ? 'Periodo 1' : 'Periodo 2',
                  ]}
                />
                <Legend
                  formatter={(value: string) => (
                    <span className="text-slate-300 text-sm">
                      {value === 'periodo1' ? 'Periodo 1' : 'Periodo 2'}
                    </span>
                  )}
                />
                <Bar dataKey="periodo1" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="periodo2" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Summary Table */}
          <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50">
              <h2 className="text-lg font-semibold text-slate-100">Resumen Comparativo</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Metrica</th>
                    <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Periodo 1</th>
                    <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Periodo 2</th>
                    <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Variacion</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-700/30 hover:bg-slate-800/40">
                    <td className="px-4 py-3 text-sm text-slate-300">Total USD</td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">${fmt(report.period1.totalUsd)}</td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">${fmt(report.period2.totalUsd)}</td>
                    <td className="px-4 py-3 text-right"><VariationBadge pct={report.variationPct.totalUsd} /></td>
                  </tr>
                  <tr className="border-b border-slate-700/30 hover:bg-slate-800/40">
                    <td className="px-4 py-3 text-sm text-slate-300">Facturas</td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">{report.period1.invoiceCount}</td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">{report.period2.invoiceCount}</td>
                    <td className="px-4 py-3 text-right"><VariationBadge pct={report.variationPct.invoiceCount} /></td>
                  </tr>
                  <tr className="border-b border-slate-700/30 hover:bg-slate-800/40">
                    <td className="px-4 py-3 text-sm text-slate-300">Ticket Promedio</td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">${fmt(report.period1.avgTicketUsd)}</td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">${fmt(report.period2.avgTicketUsd)}</td>
                    <td className="px-4 py-3 text-right"><VariationBadge pct={report.variationPct.avgTicketUsd} /></td>
                  </tr>
                  <tr className="border-b border-slate-700/30 hover:bg-slate-800/40">
                    <td className="px-4 py-3 text-sm text-slate-300">Producto Top</td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right">{report.period1.topProduct || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right">{report.period2.topProduct || '-'}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-500">-</td>
                  </tr>
                  <tr className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 text-sm text-slate-300">Vendedor Top</td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right">{report.period1.topSeller || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right">{report.period2.topSeller || '-'}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-500">-</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {!loaded && !loading && (
        <div className="text-center py-16">
          <BarChart3 className="mx-auto text-slate-600 mb-3" size={40} />
          <p className="text-slate-500 text-sm">
            Define dos periodos de tiempo y presiona &quot;Generar reporte&quot; para comparar
          </p>
        </div>
      )}
    </div>
  );
}
