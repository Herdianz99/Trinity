'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Loader2, Download, Calendar, DollarSign, Receipt, TrendingUp, Award, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

/* ---------- Types ---------- */

interface Seller {
  id: string;
  code: string;
  name: string;
}

interface SellerRow {
  sellerId: string;
  sellerCode: string;
  sellerName: string;
  invoiceCount: number;
  totalUsd: number;
  avgTicket: number;
  returnCount: number;
  returnAmountUsd: number;
}

interface TopProduct {
  productId: string;
  productName: string;
  productCode: string;
  qty: number;
  totalUsd: number;
}

interface SellerTotals {
  totalUsd: number;
  invoiceCount: number;
  avgTicket: number;
}

interface SellerReport {
  totals: SellerTotals;
  topSeller: string;
  rows: SellerRow[];
  topProducts?: TopProduct[];
}

/* ---------- Helpers ---------- */

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function defaultFrom() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function defaultTo() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------- Component ---------- */

export default function SalesBySellerPage() {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [sellerId, setSellerId] = useState('');
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [sellersLoading, setSellersLoading] = useState(true);
  const [data, setData] = useState<SellerReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Ventas por Vendedor | Trinity ERP';
  }, []);

  /* Fetch sellers on mount */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/proxy/sellers');
        if (!res.ok) throw new Error('Error al cargar vendedores');
        const json = await res.json();
        const list: Seller[] = Array.isArray(json) ? json : json.data ?? [];
        setSellers(list);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setSellersLoading(false);
      }
    })();
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const sellerParam = sellerId ? `&sellerId=${sellerId}` : '';
      const res = await fetch(`/api/proxy/reports/sales-by-seller?from=${from}&to=${to}${sellerParam}`);
      if (!res.ok) throw new Error('Error al cargar reporte');
      const json: SellerReport = await res.json();
      setData(json);
      setLoaded(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, sellerId]);

  const exportPdf = () => {
    window.open(`/api/proxy/reports/sales-by-seller/pdf?from=${from}&to=${to}`, '_blank');
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Users className="text-blue-400" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Ventas por Vendedor</h1>
            <p className="text-sm text-slate-400">Desempeno de ventas por vendedor</p>
          </div>
        </div>
        {loaded && data && (
          <button onClick={exportPdf} className="btn-secondary flex items-center gap-2">
            <Download size={16} />
            Exportar PDF
          </button>
        )}
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
              onChange={(e) => setFrom(e.target.value)}
              className="input-field !py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Hasta</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="input-field !py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Vendedor</label>
            <select
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              disabled={sellersLoading}
              className="input-field !py-2.5 text-sm"
            >
              <option value="">Todos</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
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
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-blue-400" size={32} />
        </div>
      )}

      {/* Report content */}
      {loaded && data && !loading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-t-2 border-emerald-500 border-x border-b border-slate-700/40 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="text-emerald-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total USD</span>
              </div>
              <p className="text-2xl font-bold text-emerald-400 tabular-nums">${fmt(data.totals.totalUsd)}</p>
            </div>
            <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-t-2 border-blue-500 border-x border-b border-slate-700/40 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Receipt className="text-blue-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Facturas</span>
              </div>
              <p className="text-2xl font-bold text-blue-400 tabular-nums">{data.totals.invoiceCount}</p>
            </div>
            <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-t-2 border-purple-500 border-x border-b border-slate-700/40 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="text-purple-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Ticket Promedio</span>
              </div>
              <p className="text-2xl font-bold text-purple-400 tabular-nums">${fmt(data.totals.avgTicket)}</p>
            </div>
            <div className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-t-2 border-amber-500 border-x border-b border-slate-700/40 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Award className="text-amber-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Vendedor Top</span>
              </div>
              <p className="text-lg font-bold text-amber-400 truncate">{data.topSeller || '---'}</p>
            </div>
          </div>

          {/* Chart */}
          {data.rows.length > 0 && (
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4">
              <h2 className="text-lg font-semibold text-slate-100 mb-4">Ventas por Vendedor</h2>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={data.rows} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="sellerName"
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    axisLine={{ stroke: '#475569' }}
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    axisLine={{ stroke: '#475569' }}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    labelStyle={{ color: '#e2e8f0' }}
                    formatter={(value: any) => [`$${fmt(Number(value))}`, 'Total USD']}
                  />
                  <Bar dataKey="totalUsd" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Main Table */}
          <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3">Codigo</th>
                    <th className="text-left text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3">Vendedor</th>
                    <th className="text-right text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3">Facturas</th>
                    <th className="text-right text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3">Total USD</th>
                    <th className="text-right text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3">Ticket Prom</th>
                    <th className="text-right text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3">Devoluciones</th>
                    <th className="text-right text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3">Monto Devol.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-sm">
                        Sin datos para el periodo seleccionado
                      </td>
                    </tr>
                  ) : (
                    data.rows.map((row) => (
                      <tr key={row.sellerId} className="border-b border-slate-700/30 hover:bg-slate-800/40">
                        <td className="px-4 py-3 text-sm text-slate-400 font-mono">{row.sellerCode}</td>
                        <td className="px-4 py-3 text-sm text-slate-300 font-medium">{row.sellerName}</td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">{row.invoiceCount}</td>
                        <td className="px-4 py-3 text-sm text-emerald-400 text-right tabular-nums font-medium">${fmt(row.totalUsd)}</td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">${fmt(row.avgTicket)}</td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">{row.returnCount}</td>
                        <td className="px-4 py-3 text-sm text-red-400 text-right tabular-nums">
                          {row.returnAmountUsd > 0 ? `-$${fmt(row.returnAmountUsd)}` : '$0,00'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Products sub-table (shown when a seller is selected) */}
          {sellerId && data.topProducts && data.topProducts.length > 0 && (
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/50">
                <h3 className="text-sm font-semibold text-slate-200">Top 5 Productos del Vendedor</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3">Codigo</th>
                      <th className="text-left text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3">Producto</th>
                      <th className="text-right text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3">Cantidad</th>
                      <th className="text-right text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3">Total USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.slice(0, 5).map((p) => (
                      <tr key={p.productId} className="border-b border-slate-700/30 hover:bg-slate-800/40">
                        <td className="px-4 py-3 text-sm text-slate-400 font-mono">{p.productCode}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{p.productName}</td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">{p.qty}</td>
                        <td className="px-4 py-3 text-sm text-emerald-400 text-right tabular-nums font-medium">${fmt(p.totalUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!loaded && !loading && (
        <div className="text-center py-16">
          <Users className="mx-auto text-slate-600 mb-3" size={40} />
          <p className="text-slate-500 text-sm">
            Selecciona un rango de fechas y opcionalmente un vendedor, luego presiona &quot;Generar reporte&quot;
          </p>
        </div>
      )}
    </div>
  );
}
