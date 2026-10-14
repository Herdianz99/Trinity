'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { History, Loader2, Search, FileDown, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';
import {
  PriceLogRow, PriceLogChanges, SourceBadge, PRICE_LOG_SOURCES, fmtDateTime,
} from '@/components/price-log-changes';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const LIMIT = 50;

export default function PriceLogPage() {
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return ymd(d); });
  const [to, setTo] = useState(() => ymd(new Date()));
  const [userId, setUserId] = useState('');
  const [source, setSource] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [onlyManual, setOnlyManual] = useState(false);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PriceLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState<Record<string, PriceLogRow[] | 'loading'>>({});

  useEffect(() => { document.title = 'Bitácora de precios | Trinity ERP'; }, []);
  useEffect(() => {
    fetch('/api/proxy/price-log/users').then((r) => (r.ok ? r.json() : [])).then((u) => setUsers(Array.isArray(u) ? u : [])).catch(() => {});
  }, []);
  useEffect(() => { const t = setTimeout(() => setDebounced(search), 350); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(1); }, [from, to, userId, source, debounced, onlyManual]);

  const params = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ from, to, ...extra });
    if (userId) p.set('userId', userId);
    if (source) p.set('source', source);
    if (debounced.trim()) p.set('search', debounced.trim());
    if (onlyManual) p.set('onlyManual', 'true');
    return p.toString();
  }, [from, to, userId, source, debounced, onlyManual]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setOpen({});
    fetch(`/api/proxy/price-log?${params({ page: String(page), limit: String(LIMIT) })}`)
      .then((r) => (r.ok ? r.json() : { data: [], total: 0 }))
      .then((d) => { if (!cancel) { setRows(d.data || []); setTotal(d.total || 0); } })
      .catch(() => {})
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [params, page]);

  async function toggleBatch(row: PriceLogRow) {
    const key = row.batchId!;
    if (open[key]) { setOpen((o) => { const n = { ...o }; delete n[key]; return n; }); return; }
    setOpen((o) => ({ ...o, [key]: 'loading' }));
    const r = await fetch(`/api/proxy/price-log?${params({ batchId: key, limit: '200' })}`);
    const d = r.ok ? await r.json() : { data: [] };
    setOpen((o) => ({ ...o, [key]: d.data || [] }));
  }

  const pages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20">
          <History className="text-sky-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Bitácora de precios</h1>
          <p className="text-slate-400 text-sm">Quién cambió costos, precios y % de ganancia, cuándo y desde dónde</p>
        </div>
      </div>

      <div className="card p-4 mb-4 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 items-end">
        <label className="flex flex-col gap-1 text-xs text-slate-400">Desde
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="input-field" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">Hasta
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="input-field" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">Usuario
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="input-field">
            <option value="">Todos</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            <option value="none">(sin usuario)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">Origen
          <select value={source} onChange={(e) => setSource(e.target.value)} className="input-field">
            <option value="">Todos</option>
            {PRICE_LOG_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400 lg:col-span-2">Producto o documento
          <span className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Código, nombre o FC..." className="input-field !pl-9 w-full" />
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
          <input type="checkbox" checked={onlyManual} onChange={(e) => setOnlyManual(e.target.checked)} className="accent-emerald-500" />
          Solo cambios manuales
          <span className="text-xs text-slate-500">(ficha, ajuste masivo y directos en BD)</span>
        </label>
        <span className="ml-auto text-xs text-slate-500">{total} eventos</span>
        <button
          onClick={() => window.open(`/api/proxy/price-log/export?${params()}`, '_blank')}
          className="btn-secondary !py-1.5 text-sm flex items-center gap-2"
        >
          <FileDown size={16} /> Excel
        </button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>
        ) : rows.length === 0 ? (
          <p className="py-16 text-center text-slate-500 text-sm">No hay cambios de precio con estos filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-3 py-3 text-slate-400 font-medium">Fecha</th>
                  <th className="text-left px-3 py-3 text-slate-400 font-medium">Usuario</th>
                  <th className="text-left px-3 py-3 text-slate-400 font-medium">Origen</th>
                  <th className="text-left px-3 py-3 text-slate-400 font-medium">Producto</th>
                  <th className="text-left px-3 py-3 text-slate-400 font-medium">Cambios</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isBatch = r.count > 1 && !!r.batchId;
                  const detail = isBatch ? open[r.batchId!] : undefined;
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-b border-slate-800/60 align-top hover:bg-slate-800/30">
                        <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                        <td className="px-3 py-2.5 text-slate-300">{r.userName ?? <span className="text-red-300/80">(sin usuario)</span>}</td>
                        <td className="px-3 py-2.5"><SourceBadge row={r} /></td>
                        <td className="px-3 py-2.5">
                          {isBatch ? (
                            <button onClick={() => toggleBatch(r)} className="flex items-center gap-1.5 text-sky-300 hover:text-sky-200 font-medium">
                              {detail ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                              {r.count} productos
                            </button>
                          ) : (
                            <a href={`/catalog/products/${encodeURIComponent(r.productCode)}`} className="hover:underline">
                              <span className="font-mono text-emerald-400 text-xs mr-1.5">{r.productCode}</span>
                              <span className="text-white">{r.productName}</span>
                            </a>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {isBatch ? <span className="text-xs text-slate-500">Ejemplo ({r.productCode}):<PriceLogChanges row={r} /></span> : <PriceLogChanges row={r} />}
                        </td>
                      </tr>
                      {isBatch && detail === 'loading' && (
                        <tr><td colSpan={5} className="px-3 py-3 text-center"><Loader2 className="inline animate-spin text-slate-500" size={18} /></td></tr>
                      )}
                      {isBatch && Array.isArray(detail) && detail.map((d) => (
                        <tr key={d.id} className="border-b border-slate-800/40 bg-slate-900/40 align-top">
                          <td colSpan={3} />
                          <td className="px-3 py-2">
                            <a href={`/catalog/products/${encodeURIComponent(d.productCode)}`} className="hover:underline">
                              <span className="font-mono text-emerald-400 text-xs mr-1.5">{d.productCode}</span>
                              <span className="text-slate-200">{d.productName}</span>
                            </a>
                          </td>
                          <td className="px-3 py-2"><PriceLogChanges row={d} /></td>
                        </tr>
                      ))}
                      {isBatch && Array.isArray(detail) && r.count > detail.length && (
                        <tr className="bg-slate-900/40"><td colSpan={5} className="px-3 py-2 text-xs text-slate-500 text-center">
                          Se muestran {detail.length} de {r.count}. Descarga el Excel para verlos todos.
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4 text-sm text-slate-400">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-secondary !py-1 !px-2 disabled:opacity-40"><ChevronLeft size={16} /></button>
          Página {page} de {pages}
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="btn-secondary !py-1 !px-2 disabled:opacity-40"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}
