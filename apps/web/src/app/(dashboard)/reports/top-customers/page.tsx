'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Loader2, Users, DollarSign, Calendar, ShoppingBag } from 'lucide-react';

/* ---------- Types ---------- */

interface CustomerRow {
  customerId: string;
  customerName: string;
  rif: string | null;
  visits: number;
  avgTicketUsd: number;
  totalUsd: number;
  daysSinceLastPurchase: number;
  lastPurchaseDate: string | null;
}

interface Totals {
  totalCustomers: number;
  totalUsd: number;
}

interface TopCustomersReport {
  totals: Totals;
  mostFrequent: { name: string; visits: number } | null;
  topBuyer: { name: string; totalUsd: number } | null;
  rows: CustomerRow[];
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-VE');
}

/* ---------- Component ---------- */

export default function TopCustomersPage() {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState<TopCustomersReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Clientes Frecuentes | Trinity ERP';
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/proxy/reports/top-customers?from=${from}&to=${to}&limit=${limit}`,
      );
      if (!res.ok) throw new Error('Error al cargar reporte');
      const json: TopCustomersReport = await res.json();
      setData(json);
      setLoaded(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, limit]);

  return (
    <div className="p-6 space-y-6">
      {/* ---- Header ---- */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <Users className="text-green-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Clientes Frecuentes</h1>
          <p className="text-sm text-slate-400">
            Ranking de clientes por frecuencia de compra y monto total
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
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Limite</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="input-field !py-2.5 text-sm"
            >
              <option value={10}>Top 10</option>
              <option value={20}>Top 20</option>
              <option value={50}>Top 50</option>
            </select>
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
            {/* Total Clientes */}
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 border-t-2 border-t-blue-500">
              <div className="flex items-center gap-2 mb-2">
                <Users className="text-blue-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                  Total Clientes
                </span>
              </div>
              <p className="text-2xl font-bold text-blue-400 tabular-nums">
                {data.totals.totalCustomers}
              </p>
            </div>

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

            {/* Mas frecuente */}
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 border-t-2 border-t-amber-500">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="text-amber-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                  Mas Frecuente
                </span>
              </div>
              {data.mostFrequent ? (
                <>
                  <p className="text-lg font-bold text-amber-400 truncate">{data.mostFrequent.name}</p>
                  <p className="text-xs text-slate-400">{data.mostFrequent.visits} visitas</p>
                </>
              ) : (
                <p className="text-sm text-slate-500">Sin datos</p>
              )}
            </div>

            {/* Mayor comprador */}
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 border-t-2 border-t-purple-500">
              <div className="flex items-center gap-2 mb-2">
                <ShoppingBag className="text-purple-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                  Mayor Comprador
                </span>
              </div>
              {data.topBuyer ? (
                <>
                  <p className="text-lg font-bold text-purple-400 truncate">{data.topBuyer.name}</p>
                  <p className="text-xs text-slate-400">${fmt(data.topBuyer.totalUsd)}</p>
                </>
              ) : (
                <p className="text-sm text-slate-500">Sin datos</p>
              )}
            </div>
          </div>

          {/* ---- Table ---- */}
          <div>
            <h2 className="text-lg font-semibold text-slate-100 mb-3">
              Ranking de Clientes
            </h2>
            {data.rows.length === 0 ? (
              <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-8 text-center">
                <Users className="mx-auto text-slate-600 mb-2" size={32} />
                <p className="text-sm text-slate-500">
                  No se encontraron clientes en este periodo
                </p>
              </div>
            ) : (
              <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="bg-slate-800/80 text-center text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                          #
                        </th>
                        <th className="bg-slate-800/80 text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                          Cliente
                        </th>
                        <th className="bg-slate-800/80 text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                          RIF
                        </th>
                        <th className="bg-slate-800/80 text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                          Visitas
                        </th>
                        <th className="bg-slate-800/80 text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                          Ticket Promedio
                        </th>
                        <th className="bg-slate-800/80 text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                          Total Comprado
                        </th>
                        <th className="bg-slate-800/80 text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                          Dias sin comprar
                        </th>
                        <th className="bg-slate-800/80 text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                          Ultima Compra
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((row, idx) => (
                        <tr
                          key={row.customerId}
                          className="border-b border-slate-700/30 hover:bg-slate-800/40"
                        >
                          <td className="px-4 py-3 text-sm text-slate-500 text-center tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-200 font-medium">
                            {row.customerName}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-400 font-mono">
                            {row.rif || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">
                            {row.visits}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">
                            ${fmt(row.avgTicketUsd)}
                          </td>
                          <td className="px-4 py-3 text-sm text-emerald-400 text-right tabular-nums font-medium">
                            ${fmt(row.totalUsd)}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">
                            {row.daysSinceLastPurchase}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-400">
                            {row.lastPurchaseDate ? formatDate(row.lastPurchaseDate) : '-'}
                          </td>
                        </tr>
                      ))}
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
          <Users className="mx-auto text-slate-600 mb-3" size={40} />
          <p className="text-slate-500 text-sm">
            Selecciona un rango de fechas y presiona &quot;Generar reporte&quot;
          </p>
        </div>
      )}
    </div>
  );
}
