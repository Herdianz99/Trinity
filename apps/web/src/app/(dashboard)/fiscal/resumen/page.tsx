'use client';

import { useState, useCallback } from 'react';
import { BarChart3, Loader2, Search, TrendingUp, TrendingDown, Scale, Shield } from 'lucide-react';

interface ResumenData {
  ventas: {
    totalFacturas: number;
    baseImponibleTotal: number;
    ivaTotal: number;
    totalVentas: number;
  };
  compras: {
    totalOrdenes: number;
    baseImponibleTotal: number;
    ivaTotal: number;
    retencionesIva: number;
    retencionesIslr: number;
    totalCompras: number;
  };
  balance: {
    ivaDebitoFiscal: number;
    ivaCreditoFiscal: number;
    ivaPorPagar: number;
  };
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatVe(n: number): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ResumenFiscalPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<ResumenData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const to = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;
      const res = await fetch(`/api/proxy/fiscal/resumen?from=${from}&to=${to}`);
      if (!res.ok) throw new Error('Error al cargar datos');
      const result = await res.json();
      setData(result);
      setLoaded(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20">
          <BarChart3 className="text-violet-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Resumen Fiscal</h1>
          <p className="text-sm text-slate-400">IVA debito vs credito fiscal y retenciones del periodo</p>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400">
          {error}
        </div>
      )}

      {/* Period Selector */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Mes</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Ano</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={fetchData} disabled={loading}
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium text-sm flex items-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
            Generar
          </button>
        </div>
      </div>

      {loaded && data && (
        <>
          {/* Two big cards: Ventas and Compras */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ventas card */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <TrendingUp className="text-emerald-400" size={20} />
                </div>
                <h2 className="text-lg font-semibold text-slate-100">Ventas del Periodo</h2>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-slate-400">Total facturas</span>
                  <span className="text-slate-200 font-medium">{data.ventas.totalFacturas}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-slate-400">Base imponible total</span>
                  <span className="text-slate-200 font-medium">${formatVe(data.ventas.baseImponibleTotal)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-slate-400">IVA total (Debito Fiscal)</span>
                  <span className="text-emerald-400 font-medium">${formatVe(data.ventas.ivaTotal)}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-200 font-semibold">Total ventas</span>
                  <span className="text-2xl font-bold text-emerald-400">${formatVe(data.ventas.totalVentas)}</span>
                </div>
              </div>
            </div>

            {/* Compras card */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <TrendingDown className="text-blue-400" size={20} />
                </div>
                <h2 className="text-lg font-semibold text-slate-100">Compras del Periodo</h2>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-slate-400">Total ordenes recibidas</span>
                  <span className="text-slate-200 font-medium">{data.compras.totalOrdenes}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-slate-400">Base imponible total</span>
                  <span className="text-slate-200 font-medium">${formatVe(data.compras.baseImponibleTotal)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-slate-400">IVA total (Credito Fiscal)</span>
                  <span className="text-blue-400 font-medium">${formatVe(data.compras.ivaTotal)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-slate-400">Retenciones IVA</span>
                  <span className="text-orange-400 font-medium">${formatVe(data.compras.retencionesIva)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-slate-400">Retenciones ISLR</span>
                  <span className="text-purple-400 font-medium">${formatVe(data.compras.retencionesIslr)}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-200 font-semibold">Total compras</span>
                  <span className="text-2xl font-bold text-blue-400">${formatVe(data.compras.totalCompras)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* IVA Balance table */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Scale className="text-amber-400" size={20} />
              </div>
              <h2 className="text-lg font-semibold text-slate-100">Balance IVA del Periodo</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Concepto</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Monto USD</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-700/30">
                    <td className="px-4 py-3 text-slate-200">IVA Debito Fiscal (Ventas)</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-medium tabular-nums">${formatVe(data.balance.ivaDebitoFiscal)}</td>
                  </tr>
                  <tr className="border-b border-slate-700/30">
                    <td className="px-4 py-3 text-slate-200">IVA Credito Fiscal (Compras)</td>
                    <td className="px-4 py-3 text-right text-blue-400 font-medium tabular-nums">-${formatVe(data.balance.ivaCreditoFiscal)}</td>
                  </tr>
                  <tr className="bg-slate-700/30 border-t-2 border-slate-600">
                    <td className="px-4 py-3 text-slate-100 font-bold">
                      {data.balance.ivaPorPagar >= 0 ? 'IVA por pagar' : 'IVA a recuperar (Credito fiscal excedente)'}
                    </td>
                    <td className={`px-4 py-3 text-right text-xl font-bold tabular-nums ${data.balance.ivaPorPagar >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {data.balance.ivaPorPagar >= 0 ? '' : '-'}${formatVe(Math.abs(data.balance.ivaPorPagar))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Retenciones summary */}
          {(data.compras.retencionesIva > 0 || data.compras.retencionesIslr > 0) && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <Shield className="text-orange-400" size={20} />
                </div>
                <h2 className="text-lg font-semibold text-slate-100">Retenciones del Periodo</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <p className="text-sm text-slate-400 mb-1">Retenciones IVA</p>
                  <p className="text-2xl font-bold text-orange-400">${formatVe(data.compras.retencionesIva)}</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <p className="text-sm text-slate-400 mb-1">Retenciones ISLR</p>
                  <p className="text-2xl font-bold text-purple-400">${formatVe(data.compras.retencionesIslr)}</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
