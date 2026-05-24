'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Loader2, Monitor, DollarSign, Receipt } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

/* ---------- Types ---------- */

interface PaymentMethod {
  name: string;
  amountUsd: number;
}

interface CashRegisterRow {
  cashRegisterId: string;
  code: string;
  name: string;
  invoiceCount: number;
  totalUsd: number;
  totalBs: number;
  paymentMethods: PaymentMethod[];
}

interface Totals {
  totalUsd: number;
  totalBs: number;
  totalInvoices: number;
}

interface SalesByCashReport {
  totals: Totals;
  topCashRegister: { code: string; name: string; totalUsd: number } | null;
  rows: CashRegisterRow[];
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

export default function SalesByCashPage() {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [data, setData] = useState<SalesByCashReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Ventas por Caja | Trinity ERP';
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/proxy/reports/sales-by-cash-register?from=${from}&to=${to}`,
      );
      if (!res.ok) throw new Error('Error al cargar reporte');
      const json: SalesByCashReport = await res.json();
      setData(json);
      setLoaded(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  /* Chart data */
  const chartData = data?.rows.map((r) => ({
    name: r.code,
    totalUsd: r.totalUsd,
  })) ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* ---- Header ---- */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <Monitor className="text-green-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Ventas por Caja</h1>
          <p className="text-sm text-slate-400">
            Desglose de ventas por caja registradora
          </p>
        </div>
      </div>

      {/* ---- Error ---- */}
      {error && (
        <div className="px-4 py-3 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400">
          {error}
        </div>
      )}

      {/* ---- Filters ---- */}
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
          <button
            onClick={fetchReport}
            disabled={loading}
            className="btn-primary flex items-center gap-2"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <BarChart3 size={16} />
            )}
            Generar reporte
          </button>
        </div>
      </div>

      {/* ---- Loading ---- */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-green-400" size={32} />
        </div>
      )}

      {/* ---- Report content ---- */}
      {loaded && data && !loading && (
        <>
          {/* ---- KPI Cards ---- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total USD */}
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 border-t-2 border-t-emerald-500">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="text-emerald-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                  Total USD
                </span>
              </div>
              <p className="text-2xl font-bold text-emerald-400 tabular-nums">
                ${fmt(data.totals.totalUsd)}
              </p>
            </div>

            {/* Total Bs */}
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 border-t-2 border-t-blue-500">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="text-blue-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                  Total Bs
                </span>
              </div>
              <p className="text-2xl font-bold text-blue-400 tabular-nums">
                Bs {fmt(data.totals.totalBs)}
              </p>
            </div>

            {/* Total Facturas */}
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 border-t-2 border-t-amber-500">
              <div className="flex items-center gap-2 mb-2">
                <Receipt className="text-amber-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                  Total Facturas
                </span>
              </div>
              <p className="text-2xl font-bold text-amber-400 tabular-nums">
                {data.totals.totalInvoices}
              </p>
            </div>

            {/* Top Caja */}
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 border-t-2 border-t-purple-500">
              <div className="flex items-center gap-2 mb-2">
                <Monitor className="text-purple-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                  Caja Top
                </span>
              </div>
              {data.topCashRegister ? (
                <>
                  <p className="text-lg font-bold text-purple-400 truncate">
                    {data.topCashRegister.code} - {data.topCashRegister.name}
                  </p>
                  <p className="text-xs text-slate-400">${fmt(data.topCashRegister.totalUsd)}</p>
                </>
              ) : (
                <p className="text-sm text-slate-500">Sin datos</p>
              )}
            </div>
          </div>

          {/* ---- Chart ---- */}
          {chartData.length > 0 && (
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4">
              <h2 className="text-lg font-semibold text-slate-100 mb-4">
                Total USD por Caja
              </h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      axisLine={{ stroke: '#475569' }}
                      tickLine={{ stroke: '#475569' }}
                    />
                    <YAxis
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      axisLine={{ stroke: '#475569' }}
                      tickLine={{ stroke: '#475569' }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: 8,
                      }}
                      labelStyle={{ color: '#e2e8f0', fontWeight: 600 }}
                      itemStyle={{ color: '#94a3b8' }}
                      formatter={(value: any) => [`$${fmt(Number(value))}`, 'Total USD']}
                    />
                    <Bar dataKey="totalUsd" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ---- Table ---- */}
          <div>
            <h2 className="text-lg font-semibold text-slate-100 mb-3">
              Detalle por Caja
            </h2>
            {data.rows.length === 0 ? (
              <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-8 text-center">
                <Monitor className="mx-auto text-slate-600 mb-2" size={32} />
                <p className="text-sm text-slate-500">No hay datos para este periodo</p>
              </div>
            ) : (
              <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="bg-slate-800/80 text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                          Caja
                        </th>
                        <th className="bg-slate-800/80 text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                          Facturas
                        </th>
                        <th className="bg-slate-800/80 text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                          Total USD
                        </th>
                        <th className="bg-slate-800/80 text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                          Total Bs
                        </th>
                        <th className="bg-slate-800/80 text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                          Metodos de Pago principales
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((row) => {
                        const topMethods = row.paymentMethods
                          .sort((a, b) => b.amountUsd - a.amountUsd)
                          .slice(0, 3);

                        return (
                          <tr
                            key={row.cashRegisterId}
                            className="border-b border-slate-700/30 hover:bg-slate-800/40"
                          >
                            <td className="px-4 py-3 text-sm text-slate-200 font-medium">
                              <span className="font-mono text-slate-400 mr-1.5">{row.code}</span>
                              {row.name}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">
                              {row.invoiceCount}
                            </td>
                            <td className="px-4 py-3 text-sm text-emerald-400 text-right tabular-nums font-medium">
                              ${fmt(row.totalUsd)}
                            </td>
                            <td className="px-4 py-3 text-sm text-blue-400 text-right tabular-nums">
                              Bs {fmt(row.totalBs)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1.5">
                                {topMethods.length > 0 ? (
                                  topMethods.map((pm) => (
                                    <span
                                      key={pm.name}
                                      className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300 border border-slate-600/40"
                                    >
                                      {pm.name}
                                      <span className="ml-1 text-slate-400">${fmt(pm.amountUsd)}</span>
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-slate-500">-</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ---- Empty state before generating ---- */}
      {!loaded && !loading && (
        <div className="text-center py-16">
          <Monitor className="mx-auto text-slate-600 mb-3" size={40} />
          <p className="text-slate-500 text-sm">
            Selecciona un rango de fechas y presiona &quot;Generar reporte&quot;
          </p>
        </div>
      )}
    </div>
  );
}
