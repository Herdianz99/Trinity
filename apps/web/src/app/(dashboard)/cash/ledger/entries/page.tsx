'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, BookOpen, ArrowDownCircle, ArrowUpCircle,
  Banknote, CreditCard, RotateCw, Filter, FileText, FileBarChart2,
} from 'lucide-react';

const fmt = (n: number) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Fecha de hoy 'YYYY-MM-DD' en hora local del navegador (= Caracas para el usuario).
// NO usar toISOString(): de noche cae en el dia siguiente (UTC).
const todayStr = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Etiquetas humanas para el origen de cada fila del ledger
const SOURCE_LABELS: Record<string, string> = {
  SALE_PAYMENT: 'Venta',
  CHANGE: 'Vuelto',
  RECEIPT_COLLECTION: 'Cobro CxC',
  RECEIPT_PAYMENT: 'Pago CxP',
  EXPENSE: 'Gasto',
  CUSTOMER_ADVANCE: 'Anticipo cliente',
  SUPPLIER_ADVANCE: 'Anticipo proveedor',
  MANUAL: 'Mov. manual',
  REINTEGRO: 'Reintegro',
};
const SOURCE_COLORS: Record<string, string> = {
  SALE_PAYMENT: 'bg-green-500/10 text-green-400 border-green-500/20',
  CHANGE: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  RECEIPT_COLLECTION: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  RECEIPT_PAYMENT: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  EXPENSE: 'bg-red-500/10 text-red-400 border-red-500/20',
  CUSTOMER_ADVANCE: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  SUPPLIER_ADVANCE: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  MANUAL: 'bg-slate-600/20 text-slate-300 border-slate-600',
  REINTEGRO: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

export default function CashLedgerEntriesPage() {
  const router = useRouter();
  const [registers, setRegisters] = useState<any[]>([]);
  const [cashiers, setCashiers] = useState<{ id: string; name: string }[]>([]);
  const [methods, setMethods] = useState<any[]>([]);

  const [filterRegister, setFilterRegister] = useState('');
  const [filterCashier, setFilterCashier] = useState('');
  const [filterFrom, setFilterFrom] = useState(todayStr());
  const [filterTo, setFilterTo] = useState(todayStr());
  const [filterMethodIds, setFilterMethodIds] = useState<string[]>([]);
  const [filterSource, setFilterSource] = useState('');
  const [filterCurrency, setFilterCurrency] = useState('');
  const [onlyCash, setOnlyCash] = useState(false);

  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = 'Libro mayor de caja | Trinity ERP'; }, []);

  useEffect(() => {
    fetch('/api/proxy/cash-registers').then(r => r.ok ? r.json() : []).then(d => Array.isArray(d) && setRegisters(d)).catch(() => {});
    fetch('/api/proxy/payment-methods/flat').then(r => r.ok ? r.json() : []).then(d => Array.isArray(d) && setMethods(d)).catch(() => {});
    fetch('/api/proxy/cash-sessions').then(r => r.ok ? r.json() : []).then((d) => {
      if (!Array.isArray(d)) return;
      const map = new Map<string, string>();
      d.forEach((s: any) => { if (s.openedBy?.id) map.set(s.openedBy.id, s.openedBy.name); });
      setCashiers(Array.from(map, ([id, name]) => ({ id, name })));
    }).catch(() => {});
  }, []);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    if (filterRegister) p.set('cashRegisterId', filterRegister);
    if (filterCashier) p.set('userId', filterCashier);
    if (filterFrom) p.set('from', filterFrom);
    if (filterTo) p.set('to', filterTo);
    if (filterMethodIds.length) p.set('methodIds', filterMethodIds.join(','));
    if (filterSource) p.set('sourceType', filterSource);
    if (filterCurrency) p.set('currency', filterCurrency);
    if (onlyCash) p.set('onlyCash', 'true');
    p.set('page', String(page));
    return p.toString();
  }, [filterRegister, filterCashier, filterFrom, filterTo, filterMethodIds, filterSource, filterCurrency, onlyCash, page]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/cash/ledger-entries?${buildParams()}`);
      const json = await res.json();
      setRows(json.data || []);
      setSummary(json.summary || null);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [buildParams]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filterRegister, filterCashier, filterFrom, filterTo, filterMethodIds, filterSource, filterCurrency, onlyCash]);

  const reportParams = () => {
    const p = new URLSearchParams();
    if (filterRegister) p.set('cashRegisterId', filterRegister);
    if (filterCashier) p.set('userId', filterCashier);
    if (filterFrom) p.set('from', filterFrom);
    if (filterTo) p.set('to', filterTo);
    if (filterMethodIds.length) p.set('methodIds', filterMethodIds.join(','));
    if (filterSource) p.set('sourceType', filterSource);
    if (filterCurrency) p.set('currency', filterCurrency);
    if (onlyCash) p.set('onlyCash', 'true');
    return p.toString();
  };
  const openReport = () => window.open(`/api/proxy/cash/ledger-entries-report?${reportParams()}`, '_blank');
  const openSummary = () => window.open(`/api/proxy/cash/ledger-entries-summary?${reportParams()}`, '_blank');

  const toggleMethod = (id: string) =>
    setFilterMethodIds(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);

  const hasFilters = filterRegister || filterCashier || filterFrom || filterTo || filterMethodIds.length || filterSource || filterCurrency || onlyCash;
  const clearFilters = () => {
    setFilterRegister(''); setFilterCashier(''); setFilterFrom(todayStr()); setFilterTo(todayStr());
    setFilterMethodIds([]); setFilterSource(''); setFilterCurrency(''); setOnlyCash(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/cash/ledger')} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
          <BookOpen className="text-indigo-400" size={22} />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Libro mayor de caja</h1>
          <p className="text-slate-400 text-sm">Tabla madre: todos los movimientos que tocan caja, de cualquier origen y método de pago</p>
        </div>
        <button onClick={openSummary} className="btn-secondary flex items-center gap-2 text-sm" title="Resumen en PDF: solo el neto por método de pago (respeta los filtros)">
          <FileBarChart2 size={16} /> Resumen
        </button>
        <button onClick={openReport} className="btn-secondary flex items-center gap-2 text-sm" title="Reporte detallado en PDF (respeta los filtros)">
          <FileText size={16} /> Reporte detallado
        </button>
        <button onClick={load} className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700/50" title="Refrescar"><RotateCw size={16} /></button>
      </div>

      {/* Filtros */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Caja</label>
            <select value={filterRegister} onChange={e => setFilterRegister(e.target.value)} className="input-field !py-1.5 !w-40 text-sm">
              <option value="">Todas</option>
              {registers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Cajero</label>
            <select value={filterCashier} onChange={e => setFilterCashier(e.target.value)} className="input-field !py-1.5 !w-44 text-sm">
              <option value="">Todos</option>
              {cashiers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Origen</label>
            <select value={filterSource} onChange={e => setFilterSource(e.target.value)} className="input-field !py-1.5 !w-44 text-sm">
              <option value="">Todos</option>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Moneda</label>
            <select value={filterCurrency} onChange={e => setFilterCurrency(e.target.value)} className="input-field !py-1.5 !w-28 text-sm">
              <option value="">Ambas</option>
              <option value="USD">USD</option>
              <option value="BS">Bs</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Desde</label>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="input-field !py-1.5 !w-40 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Hasta</label>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="input-field !py-1.5 !w-40 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300 pb-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={onlyCash} onChange={e => setOnlyCash(e.target.checked)} className="accent-green-500" />
            Solo efectivo de gaveta
          </label>
          {hasFilters ? (
            <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-white pb-1.5 flex items-center gap-1"><Filter size={12} /> Limpiar</button>
          ) : null}
        </div>

        {/* Métodos de pago (multi) */}
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Métodos de pago</label>
          <div className="flex flex-wrap gap-1.5">
            {methods.map(m => {
              const sel = filterMethodIds.includes(m.id);
              return (
                <button key={m.id} onClick={() => toggleMethod(m.id)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${sel ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'}`}>
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Totales del conjunto filtrado */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card p-3">
            <div className="text-[11px] text-slate-400 flex items-center gap-1"><ArrowDownCircle size={12} className="text-green-400" /> Ingresos</div>
            <div className="text-sm font-mono text-green-400 mt-0.5">${fmt(summary.inUsd)}</div>
            <div className="text-[11px] font-mono text-green-400/70">Bs {fmt(summary.inBs)}</div>
          </div>
          <div className="card p-3">
            <div className="text-[11px] text-slate-400 flex items-center gap-1"><ArrowUpCircle size={12} className="text-red-400" /> Egresos</div>
            <div className="text-sm font-mono text-red-400 mt-0.5">${fmt(summary.outUsd)}</div>
            <div className="text-[11px] font-mono text-red-400/70">Bs {fmt(summary.outBs)}</div>
          </div>
          <div className="card p-3">
            <div className="text-[11px] text-slate-400">Neto</div>
            <div className="text-sm font-mono text-white mt-0.5">${fmt(summary.netUsd)}</div>
            <div className="text-[11px] font-mono text-slate-400">Bs {fmt(summary.netBs)}</div>
          </div>
          <div className="card p-3 border-green-500/20">
            <div className="text-[11px] text-slate-400 flex items-center gap-1"><Banknote size={12} className="text-green-400" /> Neto efectivo (gaveta)</div>
            <div className="text-sm font-mono text-white mt-0.5">${fmt(summary.cashNetUsd)}</div>
            <div className="text-[11px] font-mono text-slate-400">Bs {fmt(summary.cashNetBs)}</div>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/40 text-slate-400 text-xs">
                <th className="text-left px-3 py-2.5 font-medium">Fecha</th>
                <th className="text-left px-3 py-2.5 font-medium">Caja / Cajero</th>
                <th className="text-left px-3 py-2.5 font-medium">Origen</th>
                <th className="text-left px-3 py-2.5 font-medium">Detalle</th>
                <th className="text-left px-3 py-2.5 font-medium">Método</th>
                <th className="text-center px-3 py-2.5 font-medium">Tipo</th>
                <th className="text-right px-3 py-2.5 font-medium">USD</th>
                <th className="text-right px-3 py-2.5 font-medium">Bs</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-16 text-center"><Loader2 className="animate-spin text-indigo-500 inline" size={26} /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-slate-500 text-sm">No hay movimientos en el libro mayor {hasFilters ? 'con estos filtros' : ''}</td></tr>
              ) : rows.map(r => {
                const isOut = r.direction === 'OUT';
                return (
                  <tr key={r.id} className="border-b border-slate-700/30 hover:bg-slate-800/30">
                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap text-xs">
                      {new Date(r.createdAt).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-3 py-2.5 text-slate-300">
                      {r.registerName}<span className="block text-[11px] text-slate-500">{r.cashierName}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${SOURCE_COLORS[r.sourceType] || 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                        {SOURCE_LABELS[r.sourceType] || r.sourceType}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 text-xs max-w-[220px] truncate" title={r.reason || ''}>{r.reason || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-300">
                      <span className="inline-flex items-center gap-1">
                        {r.isCash ? <Banknote size={13} className="text-green-400" /> : <CreditCard size={13} className="text-slate-500" />}
                        {r.methodName}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {isOut
                        ? <span className="inline-flex items-center gap-1 text-red-400 text-xs"><ArrowUpCircle size={13} /> Egreso</span>
                        : <span className="inline-flex items-center gap-1 text-green-400 text-xs"><ArrowDownCircle size={13} /> Ingreso</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono ${isOut ? 'text-red-400' : 'text-green-400'}`}>
                      {r.currency === 'USD' ? `${isOut ? '-' : ''}$${fmt(r.amountUsd)}` : <span className="text-slate-600">—</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono ${isOut ? 'text-red-400' : 'text-green-400'}`}>
                      {r.currency === 'BS' ? `${isOut ? '-' : ''}${fmt(r.amountBs)}` : <span className="text-slate-600">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {!loading && total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/40 text-sm text-slate-400">
            <span>{total} movimiento(s) — página {page} de {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="px-3 py-1 rounded border border-slate-600 disabled:opacity-40 hover:text-white">Anterior</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="px-3 py-1 rounded border border-slate-600 disabled:opacity-40 hover:text-white">Siguiente</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
