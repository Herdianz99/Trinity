'use client';

import { useState, useEffect, useCallback } from 'react';
import { ShoppingCart, Plus, Loader2, Eye, Send, Ban, PackageCheck } from 'lucide-react';
import Link from 'next/link';

interface PurchaseOrder {
  id: string;
  number: string;
  supplier: { id: string; name: string };
  status: 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
  totalUsd: number;
  items: { id: string }[];
  createdAt: string;
}

interface Supplier { id: string; name: string; }

const STATUS_BADGES: Record<string, string> = {
  DRAFT: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  SENT: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  PARTIAL: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  RECEIVED: 'bg-green-500/10 text-green-400 border-green-500/20',
  CANCELLED: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador', SENT: 'Enviada', PARTIAL: 'Parcial', RECEIVED: 'Recibida', CANCELLED: 'Cancelada',
};

export default function PurchasesPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (filterSupplier) params.set('supplierId', filterSupplier);
      if (filterStatus) params.set('status', filterStatus);
      const res = await fetch(`/api/proxy/purchase-orders?${params}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.data);
        setTotal(data.meta.total);
        setTotalPages(data.meta.totalPages);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [page, filterSupplier, filterStatus]);

  const fetchMeta = useCallback(async () => {
    const sRes = await fetch('/api/proxy/suppliers');
    if (sRes.ok) { const d = await sRes.json(); setSuppliers(d.data || d); }
  }, []);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  async function handleChangeStatus(id: string, status: 'SENT' | 'CANCELLED') {
    const msg = status === 'SENT' ? 'Marcar como enviada?' : 'Cancelar esta orden?';
    if (!confirm(msg)) return;
    const res = await fetch(`/api/proxy/purchase-orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      fetchOrders();
      setMessage({ type: 'success', text: status === 'SENT' ? 'Orden enviada' : 'Orden cancelada' });
    } else {
      const err = await res.json().catch(() => ({}));
      setMessage({ type: 'error', text: err.message || 'Error' });
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <ShoppingCart className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Ordenes de Compra</h1>
            <p className="text-slate-400 text-sm">{total} ordenes</p>
          </div>
        </div>
        <Link href="/purchases/new" className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nueva orden
        </Link>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      <div className="card p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select value={filterSupplier} onChange={e => { setFilterSupplier(e.target.value); setPage(1); }} className="input-field !py-2 text-sm">
            <option value="">Todos los proveedores</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} className="input-field !py-2 text-sm">
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Numero</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Proveedor</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Items</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Total USD</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Fecha</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium w-32">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12"><Loader2 className="animate-spin text-green-500 mx-auto" size={28} /></td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-500">No hay ordenes de compra</td></tr>
              ) : orders.map(o => (
                <tr key={o.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/purchases/${o.id}`} className="font-mono text-green-400 font-medium hover:text-green-300 transition-colors">
                      {o.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-white">{o.supplier.name}</td>
                  <td className="px-4 py-3 text-center text-slate-300">{o.items.length}</td>
                  <td className="px-4 py-3 text-right font-mono text-white">${o.totalUsd.toFixed(2)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGES[o.status]}`}>
                      {STATUS_LABELS[o.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs hidden md:table-cell">
                    {new Date(o.createdAt).toLocaleDateString('es-VE')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Link href={`/purchases/${o.id}`} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" title="Ver detalle">
                        <Eye size={14} />
                      </Link>
                      {o.status === 'DRAFT' && (
                        <button onClick={() => handleChangeStatus(o.id, 'SENT')} className="p-1.5 rounded-lg hover:bg-green-500/10 text-slate-400 hover:text-green-400 transition-colors" title="Marcar enviada">
                          <Send size={14} />
                        </button>
                      )}
                      {(o.status === 'SENT' || o.status === 'PARTIAL') && (
                        <Link href={`/purchases/${o.id}`} className="p-1.5 rounded-lg hover:bg-green-500/10 text-slate-400 hover:text-green-400 transition-colors" title="Recibir">
                          <PackageCheck size={14} />
                        </Link>
                      )}
                      {(o.status === 'DRAFT' || o.status === 'SENT') && (
                        <button onClick={() => handleChangeStatus(o.id, 'CANCELLED')} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors" title="Cancelar">
                          <Ban size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <span className="text-sm text-slate-400">Pagina {page} de {totalPages}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 disabled:opacity-30">Anterior</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 disabled:opacity-30">Siguiente</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
