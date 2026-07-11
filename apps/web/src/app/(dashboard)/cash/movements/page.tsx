'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeftRight, Loader2, FileText, ChevronLeft, ChevronRight, X } from 'lucide-react';

const fmtUsd = (n: number) => `$${(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtBs = (n: number) => `Bs ${(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDateTime = (d: string) => new Date(d).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

// Clave estable por fila para el marcado visual de corroboracion (solo visual, sin backend):
// se arma con los datos y no con el indice, asi sobrevive paginar/refetch.
const rowKey = (r: any) => `${r.kind}|${r.sessionId || ''}|${r.date}|${r.methodId || ''}|${r.amountUsd}|${r.amountBs}|${r.invoiceNumber || r.receiptNumber || r.concept || ''}`;

export default function CashMovementsPage() {
  const [registers, setRegisters] = useState<any[]>([]);
  const [cashiers, setCashiers] = useState<{ id: string; name: string }[]>([]);
  const [methods, setMethods] = useState<any[]>([]);

  // Filtros
  const [filterRegister, setFilterRegister] = useState('');
  const [filterCashier, setFilterCashier] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterMethodIds, setFilterMethodIds] = useState<string[]>([]);

  // Datos
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Marcado visual "ya corroborado" (solo visual, no persiste ni tiene efecto de negocio)
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const toggleChecked = (key: string) =>
    setChecked(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleAllOnPage = () =>
    setChecked(prev => {
      const n = new Set(prev);
      const allOn = rows.length > 0 && rows.every(r => n.has(rowKey(r)));
      rows.forEach(r => { const k = rowKey(r); allOn ? n.delete(k) : n.add(k); });
      return n;
    });

  useEffect(() => { document.title = 'Movimientos de caja | Trinity ERP'; }, []);

  // Cajas y metodos
  useEffect(() => {
    fetch('/api/proxy/cash-registers')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setRegisters(data); })
      .catch(() => {});
    fetch('/api/proxy/payment-methods/flat')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setMethods(data); })
      .catch(() => {});
    // Cajeros: derivados de las sesiones (cualquiera con permiso cash puede leerlas)
    fetch('/api/proxy/cash-sessions')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const map = new Map<string, string>();
          for (const s of data) {
            if (s.openedBy?.id) map.set(s.openedBy.id, s.openedBy.name);
          }
          setCashiers(Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
        }
      })
      .catch(() => {});
  }, []);

  const buildParams = useCallback((withPage: boolean) => {
    const params = new URLSearchParams();
    if (filterRegister) params.set('cashRegisterId', filterRegister);
    if (filterCashier) params.set('userId', filterCashier);
    if (filterFrom) params.set('from', filterFrom);
    if (filterTo) params.set('to', filterTo);
    if (filterMethodIds.length) params.set('methodIds', filterMethodIds.join(','));
    if (withPage) params.set('page', String(page));
    return params;
  }, [filterRegister, filterCashier, filterFrom, filterTo, filterMethodIds, page]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/cash/movements?${buildParams(true)}`);
      const data = await res.json();
      setRows(data.data || []);
      setSummary(data.summary || null);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch {}
    setLoading(false);
  }, [buildParams]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Al cambiar filtros, volver a la pagina 1
  useEffect(() => { setPage(1); }, [filterRegister, filterCashier, filterFrom, filterTo, filterMethodIds]);

  const toggleMethod = (id: string) => {
    setFilterMethodIds(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  const clearFilters = () => {
    setFilterRegister(''); setFilterCashier(''); setFilterFrom(''); setFilterTo(''); setFilterMethodIds([]);
  };

  const hasFilters = filterRegister || filterCashier || filterFrom || filterTo || filterMethodIds.length > 0;

  const openPdf = () => {
    window.open(`/api/proxy/cash/movements-report?${buildParams(false)}`, '_blank');
  };

  const openSummaryPdf = () => {
    window.open(`/api/proxy/cash/movements-summary?${buildParams(false)}`, '_blank');
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-green-500/10 border border-green-500/20">
            <ArrowLeftRight className="text-green-400" size={22} />
          </div>
          <h1 className="text-2xl font-bold text-white">Movimientos de caja</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openSummaryPdf} className="btn-secondary flex items-center gap-2 text-sm">
            <FileText size={16} /> Resumen PDF
          </button>
          <button onClick={openPdf} className="btn-secondary flex items-center gap-2 text-sm">
            <FileText size={16} /> Reporte detallado
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-4 mb-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
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
            <label className="block text-xs text-slate-400 mb-1">Desde</label>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="input-field !py-1.5 !w-40 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Hasta</label>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="input-field !py-1.5 !w-40 text-sm" />
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white pb-2">
              <X size={14} /> Limpiar
            </button>
          )}
        </div>

        {/* Metodos de pago (multi-select por chips) */}
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Metodos de pago {filterMethodIds.length > 0 && <span className="text-slate-500">(al filtrar por metodo no se muestran movimientos manuales)</span>}</label>
          <div className="flex flex-wrap gap-2">
            {methods.map(m => {
              const sel = filterMethodIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleMethod(m.id)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${sel ? 'bg-green-500/20 border-green-500/40 text-green-300' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-white'}`}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Resumen */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="card p-3">
            <div className="text-xs text-slate-400">Pagos ({summary.paymentCount})</div>
            <div className="text-white font-semibold">{fmtUsd(summary.paymentUsd)}</div>
            <div className="text-slate-400 text-sm">{fmtBs(summary.paymentBs)}</div>
          </div>
          <div className="card p-3">
            <div className="text-xs text-slate-400">Ingresos manuales</div>
            <div className="text-emerald-400 font-semibold">{fmtUsd(summary.incomeUsd)}</div>
            <div className="text-slate-400 text-sm">{fmtBs(summary.incomeBs)}</div>
          </div>
          <div className="card p-3">
            <div className="text-xs text-slate-400">Egresos manuales</div>
            <div className="text-red-400 font-semibold">-{fmtUsd(summary.expenseUsd)}</div>
            <div className="text-slate-400 text-sm">-{fmtBs(summary.expenseBs)}</div>
          </div>
          {summary.collectionCount > 0 && (
            <div className="card p-3">
              <div className="text-xs text-slate-400">Cobros CxC ({summary.collectionCount})</div>
              <div className="text-emerald-400 font-semibold">{fmtUsd(summary.collectionUsd)}</div>
              <div className="text-slate-400 text-sm">{fmtBs(summary.collectionBs)}</div>
            </div>
          )}
          {summary.cxpCount > 0 && (
            <div className="card p-3">
              <div className="text-xs text-slate-400">Pagos CxP ({summary.cxpCount})</div>
              <div className="text-red-400 font-semibold">-{fmtUsd(summary.cxpUsd)}</div>
              <div className="text-slate-400 text-sm">-{fmtBs(summary.cxpBs)}</div>
            </div>
          )}
          <div className="card p-3">
            <div className="text-xs text-slate-400">Registros</div>
            <div className="text-white font-semibold">{total}</div>
            <div className="text-slate-400 text-sm">{summary.movementCount} mov. manuales</div>
          </div>
        </div>
      )}

      {/* Desglose por metodo */}
      {summary?.byMethod?.length > 0 && (
        <div className="card p-3 mb-4">
          <div className="text-xs text-slate-400 mb-2">Por metodo de pago</div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {summary.byMethod.map((m: any) => (
              <div key={m.methodName} className="text-slate-300">
                <span className="text-slate-400">{m.methodName}</span> <span className="text-slate-500">({m.count})</span>: <span className="text-white">{fmtUsd(m.totalUsd)}</span> <span className="text-slate-500">/ {fmtBs(m.totalBs)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Corroboracion (solo visual): marca las filas que ya revisaste */}
      {rows.length > 0 && (
        <div className="flex items-center justify-end gap-3 mb-2 text-xs text-slate-400">
          <span>{rows.filter(r => checked.has(rowKey(r))).length} de {rows.length} corroborados (esta pagina)</span>
          {checked.size > 0 && (
            <button onClick={() => setChecked(new Set())} className="hover:text-slate-200 underline">Limpiar marcas</button>
          )}
        </div>
      )}

      {/* Tabla */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-slate-500" size={24} /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">No se encontraron movimientos con los filtros aplicados</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 text-slate-400 text-left">
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    className="rounded border-slate-600 bg-slate-700 cursor-pointer"
                    title="Marcar/desmarcar toda la pagina"
                    checked={rows.length > 0 && rows.every(r => checked.has(rowKey(r)))}
                    onChange={toggleAllOnPage}
                  />
                </th>
                <th className="px-3 py-3 font-medium">Fecha</th>
                <th className="px-3 py-3 font-medium">Caja</th>
                <th className="px-3 py-3 font-medium">Cajero</th>
                <th className="px-3 py-3 font-medium">Tipo / Metodo</th>
                <th className="px-3 py-3 font-medium">Detalle</th>
                <th className="px-3 py-3 font-medium">Referencia</th>
                <th className="px-3 py-3 font-medium text-right">USD</th>
                <th className="px-3 py-3 font-medium text-right">Bs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const isMov = r.kind === 'MOVEMENT';
                const isReceipt = r.kind === 'RECEIPT';
                const isChange = r.kind === 'CHANGE';
                const isCxp = isReceipt && r.receiptType === 'PAYMENT';
                const isExpense = isMov && r.movementType === 'EXPENSE';
                const isOutflow = isExpense || isCxp || isChange; // egreso manual, pago CxP o vuelto
                const sign = isOutflow ? '-' : '';
                const rk = rowKey(r);
                const isRowChecked = checked.has(rk);
                return (
                  <tr key={`${r.kind}-${r.sessionId}-${i}`} className={`border-b border-slate-700/30 ${isRowChecked ? 'bg-emerald-500/[0.07]' : 'hover:bg-slate-800/30'}`}>
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        className="rounded border-slate-600 bg-slate-700 cursor-pointer"
                        checked={isRowChecked}
                        onChange={() => toggleChecked(rk)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{fmtDateTime(r.date)}</td>
                    <td className="px-3 py-2.5 text-slate-300">{r.cashRegisterName || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-300">{r.cashierName || '—'}</td>
                    <td className="px-3 py-2.5">
                      {isChange ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
                          Vuelto · {r.methodName}
                        </span>
                      ) : isMov ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${isExpense ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'}`}>
                          {isExpense ? 'Egreso' : 'Ingreso'}
                        </span>
                      ) : isReceipt ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${isCxp ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'}`}>
                          {isCxp ? 'Pago CxP' : 'Cobro CxC'} · {r.methodName}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-200">{r.methodName}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-300">
                      {isMov ? r.concept : isReceipt ? (
                        <span><span className="text-white">{r.receiptNumber}</span> <span className="text-slate-500">·</span> {r.partyName}</span>
                      ) : (
                        <span><span className="text-white">{r.invoiceNumber}</span> <span className="text-slate-500">·</span> {r.customerName}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">{isMov ? (r.userName || '—') : (r.reference || '—')}</td>
                    <td className={`px-3 py-2.5 text-right ${isOutflow ? 'text-red-400' : 'text-white'}`}>{sign}{fmtUsd(r.amountUsd)}</td>
                    <td className={`px-3 py-2.5 text-right ${isOutflow ? 'text-red-400' : 'text-slate-300'}`}>{sign}{fmtBs(r.amountBs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Paginacion */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <span className="text-xs text-slate-500">Pagina {page} de {totalPages} · {total} registros</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="p-1.5 rounded-lg border border-slate-700 text-slate-400 disabled:opacity-40 hover:text-white"><ChevronLeft size={16} /></button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="p-1.5 rounded-lg border border-slate-700 text-slate-400 disabled:opacity-40 hover:text-white"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
