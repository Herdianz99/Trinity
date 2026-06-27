'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, Plus, Loader2, Check, Ban } from 'lucide-react';

interface Transfer {
  id: string;
  number: string | null;
  fromWarehouse: { id: string; name: string };
  toWarehouse: { id: string; name: string };
  status: 'PENDING' | 'APPROVED' | 'CANCELLED';
  notes: string | null;
  items: { id: string }[];
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = { PENDING: 'Pendiente', APPROVED: 'Aprobada', CANCELLED: 'Cancelada' };
const STATUS_BADGES: Record<string, string> = {
  PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  APPROVED: 'bg-green-500/10 text-green-400 border-green-500/20',
  CANCELLED: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function TransfersPage() {
  const router = useRouter();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userRole, setUserRole] = useState('');

  const fetchTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      const res = await fetch(`/api/proxy/transfers?${params}`);
      if (res.ok) setTransfers(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { document.title = 'Transferencias | Trinity ERP'; }, []);
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(u => { if (u) setUserRole(u.role); }).catch(() => {});
  }, []);
  useEffect(() => { fetchTransfers(); }, [fetchTransfers]);

  async function handleApprove(id: string) {
    if (!confirm('Aprobar esta transferencia?')) return;
    const res = await fetch(`/api/proxy/transfers/${id}/approve`, { method: 'PATCH' });
    if (res.ok) { fetchTransfers(); setMessage({ type: 'success', text: 'Transferencia aprobada' }); }
    else { const err = await res.json().catch(() => ({})); setMessage({ type: 'error', text: err.message || 'Error' }); }
  }

  async function handleCancel(id: string) {
    if (!confirm('Cancelar esta transferencia?')) return;
    const res = await fetch(`/api/proxy/transfers/${id}/cancel`, { method: 'PATCH' });
    if (res.ok) { fetchTransfers(); setMessage({ type: 'success', text: 'Transferencia cancelada' }); }
  }

  const canApprove = userRole === 'ADMIN' || userRole === 'SUPERVISOR';

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <ArrowLeftRight className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Transferencias</h1>
            <p className="text-slate-400 text-sm">Movimientos entre almacenes</p>
          </div>
        </div>
        <button onClick={() => router.push('/inventory/transfers/new')} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nueva transferencia
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* Filter */}
      <div className="card p-4 mb-6">
        <div className="flex flex-wrap gap-2">
          {['', 'PENDING', 'APPROVED', 'CANCELLED'].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                filterStatus === s
                  ? 'bg-green-500/20 text-green-400 border-green-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              {s === '' ? 'Todas' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">N°</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Origen</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Destino</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Items</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium w-28">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12"><Loader2 className="animate-spin text-green-500 mx-auto" size={28} /></td></tr>
              ) : transfers.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-500">No hay transferencias</td></tr>
              ) : transfers.map(t => (
                <tr
                  key={t.id}
                  onClick={() => router.push(`/inventory/transfers/${t.id}`)}
                  className="border-b border-slate-700/30 hover:bg-slate-700/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-green-400 text-xs whitespace-nowrap">{t.number || '—'}</td>
                  <td className="px-4 py-3 text-slate-300 text-xs">{new Date(t.createdAt).toLocaleDateString('es-VE')}</td>
                  <td className="px-4 py-3 text-white">{t.fromWarehouse.name}</td>
                  <td className="px-4 py-3 text-white">{t.toWarehouse.name}</td>
                  <td className="px-4 py-3 text-center text-slate-300">{t.items.length}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGES[t.status]}`}>{STATUS_LABELS[t.status]}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {t.status === 'PENDING' && canApprove && (
                        <button onClick={(e) => { e.stopPropagation(); handleApprove(t.id); }} className="p-1.5 rounded-lg hover:bg-green-500/10 text-slate-400 hover:text-green-400 transition-colors" title="Aprobar">
                          <Check size={14} />
                        </button>
                      )}
                      {t.status === 'PENDING' && (
                        <button onClick={(e) => { e.stopPropagation(); handleCancel(t.id); }} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors" title="Cancelar">
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
      </div>
    </div>
  );
}
