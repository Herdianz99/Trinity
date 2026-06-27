'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Loader2, Check, Ban } from 'lucide-react';

interface TransferItem {
  id: string;
  quantity: number;
  product: { id: string; code: string; name: string; supplierRef: string | null };
}
interface TransferDetail {
  id: string;
  number: string | null;
  fromWarehouse: { id: string; name: string };
  toWarehouse: { id: string; name: string };
  status: 'PENDING' | 'APPROVED' | 'CANCELLED';
  notes: string | null;
  items: TransferItem[];
  approvedById: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = { PENDING: 'Pendiente', APPROVED: 'Aprobada', CANCELLED: 'Cancelada' };
const STATUS_BADGES: Record<string, string> = {
  PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  APPROVED: 'bg-green-500/10 text-green-400 border-green-500/20',
  CANCELLED: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function TransferDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [transfer, setTransfer] = useState<TransferDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchTransfer = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/transfers/${id}`);
      if (res.ok) setTransfer(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchTransfer(); }, [fetchTransfer]);
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(u => { if (u) setUserRole(u.role); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (transfer) document.title = `${transfer.number || 'Transferencia'} | Trinity ERP`;
  }, [transfer]);

  async function handleApprove() {
    if (!confirm('Aprobar esta transferencia? Se movera el stock entre almacenes.')) return;
    setSaving(true); setMessage(null);
    try {
      const res = await fetch(`/api/proxy/transfers/${id}/approve`, { method: 'PATCH' });
      if (res.ok) { setMessage({ type: 'success', text: 'Transferencia aprobada' }); fetchTransfer(); }
      else { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Error'); }
    } catch (err: any) { setMessage({ type: 'error', text: err.message }); } finally { setSaving(false); }
  }

  async function handleCancel() {
    if (!confirm('Cancelar esta transferencia?')) return;
    setSaving(true); setMessage(null);
    try {
      const res = await fetch(`/api/proxy/transfers/${id}/cancel`, { method: 'PATCH' });
      if (res.ok) { setMessage({ type: 'success', text: 'Transferencia cancelada' }); fetchTransfer(); }
      else { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Error'); }
    } catch (err: any) { setMessage({ type: 'error', text: err.message }); } finally { setSaving(false); }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-green-500" size={32} /></div>;
  }
  if (!transfer) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">Transferencia no encontrada</p>
        <button onClick={() => router.push('/inventory/transfers')} className="btn-secondary mt-4 text-sm">Volver</button>
      </div>
    );
  }

  const canApprove = userRole === 'ADMIN' || userRole === 'SUPERVISOR';
  const totalUnits = transfer.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div>
      <button onClick={() => router.push('/inventory/transfers')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm mb-4">
        <ArrowLeft size={16} /> Volver a transferencias
      </button>

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white font-mono">{transfer.number || 'Transferencia'}</h1>
            <span className={`text-xs px-2.5 py-0.5 rounded-full border ${STATUS_BADGES[transfer.status]}`}>{STATUS_LABELS[transfer.status]}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-300 mt-1">
            <span className="text-white font-medium">{transfer.fromWarehouse.name}</span>
            <ArrowRight size={16} className="text-slate-500" />
            <span className="text-white font-medium">{transfer.toWarehouse.name}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400 mt-1 flex-wrap">
            <span>{new Date(transfer.createdAt).toLocaleDateString('es-VE')}</span>
            <span>{transfer.items.length} producto(s) · {totalUnits} unidad(es)</span>
            {transfer.notes && <span className="text-slate-500">| {transfer.notes}</span>}
          </div>
        </div>
        {transfer.status === 'PENDING' && (
          <div className="flex items-center gap-2 self-start">
            <button onClick={handleCancel} disabled={saving} className="btn-secondary !py-2 text-sm flex items-center gap-1.5">
              <Ban size={15} /> Cancelar
            </button>
            {canApprove && (
              <button onClick={handleApprove} disabled={saving} className="btn-primary !py-2 text-sm flex items-center gap-1.5">
                {saving ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />} Aprobar
              </button>
            )}
          </div>
        )}
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* Items */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Codigo</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Ref. proveedor</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Producto</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {transfer.items.map(it => (
                <tr key={it.id} className="border-b border-slate-700/30 hover:bg-slate-800/40">
                  <td className="px-4 py-2.5 font-mono text-xs text-green-400 whitespace-nowrap">{it.product.code}</td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs hidden md:table-cell">{it.product.supplierRef || '—'}</td>
                  <td className="px-4 py-2.5 text-white">{it.product.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-200">{it.quantity}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-700/50 bg-slate-800/30">
                <td colSpan={3} className="px-4 py-3 text-slate-300 font-semibold">Total unidades</td>
                <td className="px-4 py-3 text-right font-mono text-white font-semibold">{totalUnits}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {transfer.status === 'APPROVED' && (
        <p className="mt-4 text-sm text-slate-400">Transferencia aprobada — el stock ya se movió entre almacenes. Los movimientos generados enlazan a esta transferencia.</p>
      )}
    </div>
  );
}
