'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Loader2, Search, FileText, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Option { id: string; name: string }
interface Row {
  code: string | null;
  name: string;
  category: string | null;
  brand: string | null;
  supplier: string | null;
  stock: number;
  sold: number;
}
interface Analysis {
  from: string; to: string; onlyWithSales: boolean;
  totalProducts: number; totalSold: number; rows: Row[];
}

const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500';
const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { maximumFractionDigits: 2 });

// Fecha local (navegador = Caracas para el usuario) en formato YYYY-MM-DD.
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
}

const PRESETS = [
  { label: '30 días', days: 30 },
  { label: '60 días', days: 60 },
  { label: '90 días', days: 90 },
];

export default function PurchaseAnalysisPage() {
  const [categories, setCategories] = useState<Option[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);

  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [supplierId, setSupplierId] = useState('');

  const [preset, setPreset] = useState<number | 'custom'>(30);
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(ymd(new Date()));
  const [onlyWithSales, setOnlyWithSales] = useState(false); // por defecto: todos

  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Query string exacto que produjo los resultados actuales (para exportar respetando el filtro).
  const [appliedQuery, setAppliedQuery] = useState('');

  useEffect(() => { document.title = 'Análisis de compra | Trinity ERP'; }, []);

  // Cargar catálogos para los selects
  useEffect(() => {
    (async () => {
      try {
        const [c, b, s] = await Promise.all([
          fetch('/api/proxy/categories'), fetch('/api/proxy/brands'), fetch('/api/proxy/suppliers'),
        ]);
        if (c.ok) setCategories(await c.json());
        if (b.ok) setBrands(await b.json());
        if (s.ok) setSuppliers(await s.json());
      } catch { /* empty */ }
    })();
  }, []);

  function selectPreset(days: number) {
    setPreset(days);
    setFrom(daysAgo(days));
    setTo(ymd(new Date()));
  }

  const analyze = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ from, to });
      if (categoryId) params.set('categoryId', categoryId);
      if (brandId) params.set('brandId', brandId);
      if (supplierId) params.set('supplierId', supplierId);
      if (onlyWithSales) params.set('onlyWithSales', 'true');
      const res = await fetch(`/api/proxy/products/purchase-analysis?${params}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(Array.isArray(e.message) ? e.message[0] : e.message || 'Error al analizar');
      }
      setData(await res.json());
      setAppliedQuery(params.toString());
    } catch (e: any) { setError(e.message); setData(null); setAppliedQuery(''); }
    finally { setLoading(false); }
  }, [from, to, categoryId, brandId, supplierId, onlyWithSales]);

  // Exporta a Excel los resultados actuales (respetan el filtro que los genero).
  function exportExcel() {
    if (!data) return;
    const aoa = [
      ['Código', 'Producto', 'Categoría', 'Marca', 'Proveedor', 'Existencia', 'Total vendidas'],
      ...data.rows.map((r) => [r.code || '', r.name, r.category || '', r.brand || '', r.supplier || '', r.stock, r.sold]),
      ['', '', '', '', 'TOTAL', data.rows.reduce((s, r) => s + r.stock, 0), data.totalSold],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 12 }, { wch: 48 }, { wch: 20 }, { wch: 18 }, { wch: 26 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Análisis de compra');
    XLSX.writeFile(wb, `analisis-de-compra-${data.from}_${data.to}.xlsx`);
  }

  function exportPdf() {
    if (!appliedQuery) return;
    window.open(`/api/proxy/products/purchase-analysis/pdf?${appliedQuery}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <BarChart3 size={22} className="text-green-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Análisis de compra</h1>
          <p className="text-sm text-slate-400">Existencia y unidades vendidas por producto en un período</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 mb-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Categoría</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
              <option value="">Todas</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Marca</label>
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={inputCls}>
              <option value="">Todas</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Proveedor</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputCls}>
              <option value="">Todos</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        {/* Período */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Período</label>
            <div className="flex gap-1 p-1 bg-slate-800/70 rounded-lg">
              {PRESETS.map((p) => (
                <button key={p.days} onClick={() => selectPreset(p.days)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${preset === p.days ? 'bg-green-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                  {p.label}
                </button>
              ))}
              <button onClick={() => setPreset('custom')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${preset === 'custom' ? 'bg-green-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                Personalizado
              </button>
            </div>
          </div>
          {preset === 'custom' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Desde</label>
                <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Hasta</label>
                <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputCls} />
              </div>
            </>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-300 ml-auto">
            <input type="checkbox" checked={onlyWithSales} onChange={(e) => setOnlyWithSales(e.target.checked)} className="accent-green-500" />
            Solo artículos con ventas
          </label>
          <button onClick={analyze} disabled={loading}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Analizar
          </button>
        </div>
        {preset !== 'custom' && (
          <p className="text-xs text-slate-500">Rango: {from} a {to}</p>
        )}
      </div>

      {error && <div className="p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

      {/* Resultados */}
      {data && (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/50 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="text-slate-300"><b className="text-white">{fmt(data.totalProducts)}</b> artículos</span>
            <span className="text-slate-300">Total vendidas: <b className="text-green-400">{fmt(data.totalSold)}</b></span>
            <span className="text-slate-500 text-xs">{data.from} a {data.to} · {data.onlyWithSales ? 'solo con ventas' : 'todos'}</span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={exportExcel} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors">
                <FileSpreadsheet size={14} /> Excel
              </button>
              <button onClick={exportPdf} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 transition-colors">
                <FileText size={14} /> PDF
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-800/80">
                  <Th>Código</Th>
                  <Th>Producto</Th>
                  <Th className="text-right">Existencia</Th>
                  <Th className="text-right">Total vendidas</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-12 text-slate-500">No hay artículos para este filtro</td></tr>
                ) : data.rows.map((r, i) => (
                  <tr key={`${r.code}-${i}`} className="border-t border-slate-700/30 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2.5 text-sm text-slate-300 font-mono">{r.code || '--'}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-200">
                      {r.name}
                      {(r.brand || r.supplier) && <span className="block text-xs text-slate-500">{[r.brand, r.supplier].filter(Boolean).join(' · ')}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-slate-200 text-right font-mono">{fmt(r.stock)}</td>
                    <td className={`px-4 py-2.5 text-sm text-right font-mono ${r.sold > 0 ? 'text-green-400 font-semibold' : 'text-slate-500'}`}>{fmt(r.sold)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!data && !loading && !error && (
        <div className="text-center py-16 text-slate-500 text-sm">Elige los filtros y el período, luego pulsa <b className="text-slate-300">Analizar</b>.</div>
      )}
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 ${className}`}>{children}</th>;
}
