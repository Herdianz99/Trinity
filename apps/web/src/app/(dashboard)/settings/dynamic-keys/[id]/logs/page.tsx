'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ScrollText,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface LogEntry {
  id: string;
  permission: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

const PERM_LABELS: Record<string, string> = {
  DELETE_CREDIT_NOTE_SALE: 'Eliminar NC Venta',
  DELETE_DEBIT_NOTE_SALE: 'Eliminar ND Venta',
  DELETE_CREDIT_NOTE_PURCHASE: 'Eliminar NC Compra',
  DELETE_DEBIT_NOTE_PURCHASE: 'Eliminar ND Compra',
  DELETE_RECEIPT_COLLECTION: 'Eliminar recibo cobro',
  DELETE_RECEIPT_PAYMENT: 'Eliminar recibo pago',
  DELETE_EXPENSE: 'Eliminar gasto',
  MODIFY_PRODUCT_PRICE: 'Modificar precio',
  CANCEL_CASH_SESSION: 'Anular sesion caja',
  CHANGE_EXCHANGE_RATE: 'Cambiar tasa BCV',
  MANUAL_STOCK_ADJUSTMENT: 'Ajuste inventario',
  GIVE_DISCOUNT: 'Dar descuento POS',
  ALLOW_CREDIT_INVOICE: 'Facturar a credito',
};

export default function DynamicKeyLogsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [keyName, setKeyName] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);

  // Fetch key name
  useEffect(() => {
    fetch('/api/proxy/dynamic-keys')
      .then(r => r.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        const found = arr.find((k: any) => k.id === id);
        if (found) setKeyName(found.name);
      })
      .catch(() => {});
  }, [id]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const res = await fetch(`/api/proxy/dynamic-keys/${id}/logs?${params}`);
      const data = await res.json();
      setLogs(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [id, page, from, to]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  function fmtDate(iso: string) {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => router.push('/settings/dynamic-keys')} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <ScrollText className="text-amber-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Historial de uso</h1>
          <p className="text-slate-400 text-sm">{keyName || 'Clave'} — {total} registros</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Desde</label>
            <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} className="input-field !py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Hasta</label>
            <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} className="input-field !py-2 text-sm" />
          </div>
          {(from || to) && (
            <button onClick={() => { setFrom(''); setTo(''); setPage(1); }} className="btn-secondary !py-2 text-sm">
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-amber-500" size={28} /></div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-slate-500">Sin registros de uso</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Permiso usado</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Accion</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Tipo registro</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">ID registro</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-b border-slate-700/30 hover:bg-slate-800/40">
                  <td className="px-4 py-3 text-slate-300 text-xs font-mono">{fmtDate(log.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {PERM_LABELS[log.permission] || log.permission}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white">{log.action}</td>
                  <td className="px-4 py-3 text-slate-400 hidden md:table-cell">{log.entityType || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs hidden lg:table-cell">{log.entityId || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <span className="text-sm text-slate-400">Pag. {page} de {totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30">
                <ChevronLeft size={18} />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
