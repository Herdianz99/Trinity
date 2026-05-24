'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Loader2, Download, Calendar, Percent, DollarSign, TrendingUp, ShoppingCart, Award } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

/* ---------- Types ---------- */

interface Category {
  id: string;
  name: string;
}

interface MarginRow {
  code: string;
  name: string;
  categoryName: string;
  units: number;
  salesUsd: number;
  costUsd: number;
  profitUsd: number;
  marginPct: number;
}

interface Totals {
  avgMarginPct: number;
  profitUsd: number;
  salesUsd: number;
  costUsd: number;
}

interface ProfitMarginReport {
  totals: Totals;
  mostProfitable: { name: string; marginPct: number } | null;
  rows: MarginRow[];
}

/* ---------- Helpers ---------- */

function fmt(n: number) { return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function defaultFrom() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; }
function defaultTo() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function marginColor(pct: number): string {
  if (pct > 40) return 'text-green-400';
  if (pct >= 20) return 'text-yellow-400';
  return 'text-red-400';
}

function marginBg(pct: number): string {
  if (pct > 40) return 'bg-green-500/10';
  if (pct >= 20) return 'bg-yellow-500/10';
  return 'bg-red-500/10';
}

function barColor(pct: number): string {
  if (pct > 40) return '#22c55e';
  if (pct >= 20) return '#eab308';
  return '#ef4444';
}

/* ---------- Component ---------- */

export default function ProfitMarginReportPage() {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [report, setReport] = useState<ProfitMarginReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'Margen de Ganancia | Trinity ERP'; }, []);

  /* Fetch categories on mount */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/proxy/categories');
        if (!res.ok) return;
        const data = await res.json();
        setCategories(Array.isArray(data) ? data : data.data ?? []);
      } catch { /* ignore */ }
    })();
  }, []);

  /* Fetch report */
  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ from, to });
      if (categoryId) params.set('categoryId', categoryId);
      const res = await fetch(`/api/proxy/reports/profit-margin?${params}`);
      if (!res.ok) throw new Error('Error al cargar reporte');
      const data: ProfitMarginReport = await res.json();
      setReport(data);
      setLoaded(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, categoryId]);

  /* Export PDF */
  const exportPdf = () => {
    const params = new URLSearchParams({ from, to });
    if (categoryId) params.set('categoryId', categoryId);
    window.open(`/api/proxy/reports/profit-margin/pdf?${params}`, '_blank');
  };

  /* Chart data: top 15 by marginPct */
  const chartData = report
    ? [...report.rows]
        .sort((a, b) => b.marginPct - a.marginPct)
        .slice(0, 15)
        .map(r => ({
          name: r.name.length > 25 ? r.name.substring(0, 22) + '...' : r.name,
          marginPct: parseFloat(r.marginPct.toFixed(1)),
          fill: barColor(r.marginPct),
        }))
        .reverse()
    : [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <Percent className="text-emerald-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Margen de Ganancia</h1>
          <p className="text-sm text-slate-400">Analisis de rentabilidad por producto</p>
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
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Desde</label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="input-field !py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Hasta</label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="input-field !py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Categoria</label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className="input-field !py-2.5 text-sm"
            >
              <option value="">Todas</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={fetchReport}
            disabled={loading}
            className="btn-primary flex items-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Calendar size={16} />}
            Generar reporte
          </button>
          {loaded && (
            <button onClick={exportPdf} className="btn-secondary flex items-center gap-2">
              <Download size={16} />
              Exportar PDF
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-emerald-400" size={40} />
        </div>
      )}

      {/* Report content */}
      {loaded && report && !loading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 border-t-2 border-t-emerald-500">
              <div className="flex items-center gap-2 mb-2">
                <Percent className="text-emerald-400" size={16} />
                <span className="text-xs text-slate-400 font-medium">Margen Promedio</span>
              </div>
              <p className="text-xl font-bold text-emerald-400 tabular-nums">{report.totals.avgMarginPct.toFixed(1)}%</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 border-t-2 border-t-green-500">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="text-green-400" size={16} />
                <span className="text-xs text-slate-400 font-medium">Ganancia Total</span>
              </div>
              <p className="text-xl font-bold text-green-400 tabular-nums">${fmt(report.totals.profitUsd)}</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 border-t-2 border-t-blue-500">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="text-blue-400" size={16} />
                <span className="text-xs text-slate-400 font-medium">Total Ventas</span>
              </div>
              <p className="text-xl font-bold text-blue-400 tabular-nums">${fmt(report.totals.salesUsd)}</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 border-t-2 border-t-orange-500">
              <div className="flex items-center gap-2 mb-2">
                <ShoppingCart className="text-orange-400" size={16} />
                <span className="text-xs text-slate-400 font-medium">Total Costo</span>
              </div>
              <p className="text-xl font-bold text-orange-400 tabular-nums">${fmt(report.totals.costUsd)}</p>
            </div>
            {report.mostProfitable && (
              <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 border-t-2 border-t-yellow-500">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="text-yellow-400" size={16} />
                  <span className="text-xs text-slate-400 font-medium">Mas Rentable</span>
                </div>
                <p className="text-sm font-semibold text-yellow-400 truncate" title={report.mostProfitable.name}>
                  {report.mostProfitable.name}
                </p>
                <p className="text-xs text-slate-500">{report.mostProfitable.marginPct.toFixed(1)}%</p>
              </div>
            )}
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4">
              <h2 className="text-lg font-semibold text-slate-100 mb-4">Top 15 Productos por Margen</h2>
              <ResponsiveContainer width="100%" height={500}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    type="number"
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 'auto']}
                  />
                  <YAxis type="category" dataKey="name" width={180} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    labelStyle={{ color: '#e2e8f0' }}
                    formatter={(value: any) => [`${value}%`, 'Margen']}
                  />
                  <Bar dataKey="marginPct" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table */}
          <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50">
              <h2 className="text-lg font-semibold text-slate-100">Detalle de Margenes</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Codigo</th>
                    <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Producto</th>
                    <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Categoria</th>
                    <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Unidades</th>
                    <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Ventas USD</th>
                    <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Costo USD</th>
                    <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Ganancia USD</th>
                    <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Margen%</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500 text-sm">
                        No se encontraron productos en el periodo seleccionado
                      </td>
                    </tr>
                  ) : (
                    report.rows.map((row, i) => (
                      <tr key={i} className="border-b border-slate-700/30 hover:bg-slate-800/40">
                        <td className="px-4 py-3 text-sm text-slate-300 font-mono">{row.code}</td>
                        <td className="px-4 py-3 text-sm text-slate-200">{row.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-400">{row.categoryName}</td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">{row.units}</td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">${fmt(row.salesUsd)}</td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">${fmt(row.costUsd)}</td>
                        <td className="px-4 py-3 text-sm text-emerald-400 text-right tabular-nums">${fmt(row.profitUsd)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`inline-block px-2 py-0.5 rounded text-sm font-semibold tabular-nums ${marginColor(row.marginPct)} ${marginBg(row.marginPct)}`}>
                            {row.marginPct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
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
            Selecciona un rango de fechas y presiona &quot;Generar reporte&quot;
          </p>
        </div>
      )}
    </div>
  );
}
