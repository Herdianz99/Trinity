'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Loader2, Clock, TrendingUp, TrendingDown, Receipt } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

/* ---------- Types ---------- */

interface HourData {
  hour: number;
  label: string;
  invoiceCount: number;
  totalUsd: number;
}

interface PeakHoursReport {
  peakHours: { hour: number; label: string; invoiceCount: number }[];
  quietHour: { hour: number; label: string; invoiceCount: number } | null;
  avgPerHour: number;
  totalInvoices: number;
  hours: HourData[];
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

export default function PeakHoursPage() {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [data, setData] = useState<PeakHoursReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Horas Pico de Ventas | Trinity ERP';
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/proxy/reports/peak-hours?from=${from}&to=${to}`);
      if (!res.ok) throw new Error('Error al cargar reporte');
      const json: PeakHoursReport = await res.json();
      setData(json);
      setLoaded(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  /* Determine peak hour IDs for chart coloring */
  const peakHourSet = new Set(data?.peakHours?.map((p) => p.hour) ?? []);

  return (
    <div className="p-6 space-y-6">
      {/* ---- Header ---- */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <Clock className="text-green-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Horas Pico de Ventas</h1>
          <p className="text-sm text-slate-400">
            Distribucion de ventas por hora del dia
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
            {/* Hora mas activa */}
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 border-t-2 border-t-green-500">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="text-green-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                  Hora Mas Activa
                </span>
              </div>
              {data.peakHours?.[0] ? (
                <>
                  <p className="text-2xl font-bold text-green-400">{data.peakHours[0].label}</p>
                  <p className="text-xs text-slate-400">{data.peakHours[0].invoiceCount} facturas</p>
                </>
              ) : (
                <p className="text-sm text-slate-500">Sin datos</p>
              )}
            </div>

            {/* Hora mas tranquila */}
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 border-t-2 border-t-slate-500">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="text-slate-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                  Hora Mas Tranquila
                </span>
              </div>
              {data.quietHour ? (
                <>
                  <p className="text-2xl font-bold text-slate-300">{data.quietHour.label}</p>
                  <p className="text-xs text-slate-400">{data.quietHour.invoiceCount} facturas</p>
                </>
              ) : (
                <p className="text-sm text-slate-500">Sin datos</p>
              )}
            </div>

            {/* Promedio por hora */}
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 border-t-2 border-t-blue-500">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="text-blue-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                  Promedio por Hora
                </span>
              </div>
              <p className="text-2xl font-bold text-blue-400 tabular-nums">
                {fmt(data.avgPerHour)}
              </p>
              <p className="text-xs text-slate-400">facturas/hora</p>
            </div>

            {/* Total facturas */}
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 border-t-2 border-t-amber-500">
              <div className="flex items-center gap-2 mb-2">
                <Receipt className="text-amber-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                  Total Facturas
                </span>
              </div>
              <p className="text-2xl font-bold text-amber-400 tabular-nums">
                {data.totalInvoices}
              </p>
            </div>
          </div>

          {/* ---- Chart ---- */}
          <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4">
            <h2 className="text-lg font-semibold text-slate-100 mb-4">
              Facturas por Hora del Dia
            </h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.hours} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="label"
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
                    formatter={(value: any) => [`${value}`, 'Facturas']}
                  />
                  <Bar dataKey="invoiceCount" radius={[4, 4, 0, 0]}>
                    {data.hours.map((entry) => (
                      <Cell
                        key={`cell-${entry.hour}`}
                        fill={peakHourSet.has(entry.hour) ? '#22c55e' : '#475569'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center">
              Las barras verdes indican las 3 horas con mayor actividad
            </p>
          </div>

          {/* ---- Table ---- */}
          <div>
            <h2 className="text-lg font-semibold text-slate-100 mb-3">
              Detalle por Hora
            </h2>
            {data.hours.length === 0 ? (
              <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-8 text-center">
                <Clock className="mx-auto text-slate-600 mb-2" size={32} />
                <p className="text-sm text-slate-500">No hay datos para este periodo</p>
              </div>
            ) : (
              <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="bg-slate-800/80 text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                          Hora
                        </th>
                        <th className="bg-slate-800/80 text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                          Facturas
                        </th>
                        <th className="bg-slate-800/80 text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                          Total USD
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.hours.map((row) => (
                        <tr
                          key={row.hour}
                          className={`border-b border-slate-700/30 hover:bg-slate-800/40 ${
                            peakHourSet.has(row.hour) ? 'bg-green-500/5' : ''
                          }`}
                        >
                          <td className="px-4 py-3 text-sm text-slate-200 font-medium">
                            <span className="flex items-center gap-2">
                              {row.label}
                              {peakHourSet.has(row.hour) && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 font-semibold">
                                  PICO
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">
                            {row.invoiceCount}
                          </td>
                          <td className="px-4 py-3 text-sm text-emerald-400 text-right tabular-nums font-medium">
                            ${fmt(row.totalUsd)}
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
          <Clock className="mx-auto text-slate-600 mb-3" size={40} />
          <p className="text-slate-500 text-sm">
            Selecciona un rango de fechas y presiona &quot;Generar reporte&quot;
          </p>
        </div>
      )}
    </div>
  );
}
