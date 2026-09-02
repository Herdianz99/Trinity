'use client';

import { useState, useEffect, useCallback } from 'react';
import { PackageSearch, Loader2, Download, FileText, Calendar, DollarSign, Package, Boxes } from 'lucide-react';

/* ---------- Types ---------- */

interface StockRow {
  productId: string;
  code: string;
  name: string;
  costUsd: number;
  currentQty: number;
  quantity: number;
  valueUsd: number;
}

interface StockTotals {
  products: number;
  units: number;
  valueUsd: number;
}

interface StockAtDateReport {
  date: string | null;
  items: StockRow[];
  totals: StockTotals;
}

/* ---------- Helpers ---------- */

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------- Component ---------- */

export default function StockAtDatePage() {
  const [date, setDate] = useState(today);
  const [search, setSearch] = useState('');
  const [data, setData] = useState<StockAtDateReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Stock a la fecha | Trinity ERP';
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ date });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/proxy/reports/stock-at-date?${params.toString()}`);
      if (!res.ok) throw new Error('Error al cargar reporte');
      const json: StockAtDateReport = await res.json();
      setData(json);
      setLoaded(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [date, search]);

  const exportPdf = () => {
    const params = new URLSearchParams({ date });
    if (search.trim()) params.set('search', search.trim());
    window.open(`/api/proxy/reports/stock-at-date/pdf?${params.toString()}`, '_blank');
  };

  const exportCsv = () => {
    if (!data) return;
    const header = ['Codigo', 'Producto', 'Cantidad', 'Costo USD', 'Valor USD'];
    const lines = data.items.map((r) =>
      [r.code, `"${(r.name || '').replace(/"/g, '""')}"`, r.quantity, r.costUsd, r.valueUsd].join(','),
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-al-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
            <PackageSearch className="text-cyan-400" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Stock a la fecha</h1>
            <p className="text-sm text-slate-400">Existencias reconstruidas al cierre de la fecha elegida</p>
          </div>
        </div>
        {loaded && data && data.items.length > 0 && (
          <div className="flex items-center gap-2">
            <button onClick={exportPdf} className="btn-secondary flex items-center gap-2">
              <FileText size={16} />
              Exportar PDF
            </button>
            <button onClick={exportCsv} className="btn-secondary flex items-center gap-2">
              <Download size={16} />
              Exportar CSV
            </button>
          </div>
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
            <label className="text-xs text-slate-400 mb-1 block">Fecha de corte</label>
            <input
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
              className="input-field !py-2.5 text-sm"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-slate-400 mb-1 block">Buscar (codigo o nombre)</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchReport()}
              placeholder="Opcional…"
              className="input-field !py-2.5 text-sm w-full"
            />
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
        <p className="text-xs text-slate-500 mt-3">
          El stock se calcula al cierre de la fecha (23:59 hora Caracas), revirtiendo los movimientos
          posteriores. La valorizacion usa el costo actual del producto.
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-cyan-400" size={32} />
        </div>
      )}

      {/* Report content */}
      {loaded && data && !loading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border-t-2 border-cyan-500 border-x border-b border-slate-700/40 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Package className="text-cyan-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Productos con stock</span>
              </div>
              <p className="text-2xl font-bold text-cyan-400 tabular-nums">{data.totals.products}</p>
            </div>
            <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-t-2 border-blue-500 border-x border-b border-slate-700/40 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Boxes className="text-blue-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Unidades totales</span>
              </div>
              <p className="text-2xl font-bold text-blue-400 tabular-nums">{fmtQty(data.totals.units)}</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-t-2 border-emerald-500 border-x border-b border-slate-700/40 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="text-emerald-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Valor inventario</span>
              </div>
              <p className="text-2xl font-bold text-emerald-400 tabular-nums">${fmt(data.totals.valueUsd)}</p>
            </div>
          </div>

          {/* Table */}
          <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3">Codigo</th>
                    <th className="text-left text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3">Producto</th>
                    <th className="text-right text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3">Cantidad</th>
                    <th className="text-right text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3">Costo USD</th>
                    <th className="text-right text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3">Valor USD</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">
                        Sin existencias para la fecha seleccionada
                      </td>
                    </tr>
                  ) : (
                    data.items.map((row) => (
                      <tr key={row.productId} className="border-b border-slate-700/30 hover:bg-slate-800/40">
                        <td className="px-4 py-3 text-sm text-slate-400 font-mono">{row.code}</td>
                        <td className="px-4 py-3 text-sm text-slate-200">{row.name}</td>
                        <td className={`px-4 py-3 text-sm text-right tabular-nums font-medium ${row.quantity < 0 ? 'text-red-400' : 'text-slate-200'}`}>{fmtQty(row.quantity)}</td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">${fmt(row.costUsd)}</td>
                        <td className="px-4 py-3 text-sm text-emerald-400 text-right tabular-nums font-medium">${fmt(row.valueUsd)}</td>
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
          <PackageSearch className="mx-auto text-slate-600 mb-3" size={40} />
          <p className="text-slate-500 text-sm">
            Elige una fecha de corte y presiona &quot;Generar reporte&quot;
          </p>
        </div>
      )}
    </div>
  );
}
