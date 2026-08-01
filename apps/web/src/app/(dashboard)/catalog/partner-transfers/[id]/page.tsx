'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ArrowLeft, AlertTriangle, Check, X } from 'lucide-react';

interface TItem { code: string; name?: string; quantity: number; unitCost?: number }
interface Transfer {
  id: string; number: string; kind: 'SEND' | 'REQUEST'; direction: 'OUTGOING' | 'INCOMING';
  status: string; partnerName: string; notes?: string | null; items: TItem[];
  fromWarehouseId?: string | null; toWarehouseId?: string | null;
  createdAt: string; updatedAt: string;
}
interface Warehouse { id: string; name: string }

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Solicitado', APPROVED: 'Aprobado', SENT: 'Enviado',
  PENDING_RECEIPT: 'Por recibir', RECEIVED: 'Recibido', REJECTED: 'Rechazado', CANCELLED: 'Anulado',
};
const STATUS_COLOR: Record<string, string> = {
  RECEIVED: 'text-emerald-400', SENT: 'text-amber-400', PENDING_RECEIPT: 'text-amber-400',
  REQUESTED: 'text-sky-400', REJECTED: 'text-red-400', CANCELLED: 'text-slate-400', APPROVED: 'text-sky-400',
};

export default function PartnerTransferDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [t, setT] = useState<Transfer | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [wh, setWh] = useState('');
  const [costBasis, setCostBasis] = useState<'COST' | 'COST_BREGA'>('COST');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [tr, whs] = await Promise.all([
        fetch(`/api/proxy/integration/transfers/${encodeURIComponent(id)}`),
        fetch('/api/proxy/warehouses'),
      ]);
      if (!tr.ok) { setError('No se encontró el traslado.'); return; }
      setT(await tr.json());
      if (whs.ok) setWarehouses(await whs.json());
    } catch {
      setError('Error al cargar el traslado.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (t) document.title = `Traslado ${t.number} | Trinity ERP`; }, [t]);

  const whName = (wid?: string | null) => warehouses.find((w) => w.id === wid)?.name || (wid ? '—' : null);

  function tipoLabel(x: Transfer) {
    if (x.kind === 'SEND') return x.direction === 'OUTGOING' ? 'Envío (salida de mi inventario)' : 'Envío recibido';
    return x.direction === 'OUTGOING' ? 'Solicitud mía' : 'Solicitud recibida';
  }

  async function act(kind: 'receive' | 'approve' | 'reject') {
    if ((kind === 'receive' || kind === 'approve') && !wh) {
      setMsg({ type: 'error', text: 'Elige el almacén.' }); return;
    }
    if (kind === 'reject' && !confirm('¿Rechazar esta solicitud?')) return;
    setBusy(true); setMsg(null);
    try {
      const body = kind === 'receive' ? { toWarehouseId: wh } : kind === 'approve' ? { fromWarehouseId: wh, costBasis } : {};
      const res = await fetch(`/api/proxy/integration/transfers/${t!.id}/${kind}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.ok) { setMsg({ type: 'success', text: 'Operación realizada.' }); await load(); }
      else { const e = await res.json().catch(() => ({})); setMsg({ type: 'error', text: e.message || 'No se pudo completar.' }); }
    } catch { setMsg({ type: 'error', text: 'Error de red.' }); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="animate-spin mr-2" size={20} /> Cargando…</div>;

  if (error || !t) {
    return (
      <div className="max-w-2xl mx-auto mt-10 bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 text-amber-400" size={28} />
        <p className="text-slate-300">{error || 'Traslado no encontrado.'}</p>
        <Link href="/catalog/partner-transfers" className="text-sky-400 text-sm mt-3 inline-block">Volver a traslados</Link>
      </div>
    );
  }

  const totalUsd = (t.items || []).reduce((s, i) => s + (i.unitCost || 0) * i.quantity, 0);
  const canReceive = t.status === 'PENDING_RECEIPT';
  const canApprove = t.kind === 'REQUEST' && t.direction === 'INCOMING' && t.status === 'REQUESTED';

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/catalog/partner-transfers" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 mb-4">
        <ArrowLeft size={16} /> Volver a traslados
      </Link>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white font-mono">{t.number}</h1>
        <span className={`text-sm font-semibold ${STATUS_COLOR[t.status] || 'text-slate-300'}`}>{STATUS_LABEL[t.status] || t.status}</span>
      </div>

      {msg && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${msg.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'}`}>{msg.text}</div>
      )}

      {/* Acciones */}
      {(canReceive || canApprove) && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px]">
              <label className="block text-xs text-slate-400 mb-1">{canReceive ? 'Almacén destino' : 'Almacén origen'}</label>
              <select value={wh} onChange={(e) => setWh(e.target.value)} className="input-field w-full !py-2 text-sm">
                <option value="">Selecciona…</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            {canApprove && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Valuación</label>
                <div className="grid grid-cols-2 gap-1 bg-slate-900/60 rounded-lg p-1">
                  <button type="button" onClick={() => setCostBasis('COST')} className={`py-1.5 px-3 rounded-md text-xs font-semibold ${costBasis === 'COST' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Costo</button>
                  <button type="button" onClick={() => setCostBasis('COST_BREGA')} className={`py-1.5 px-3 rounded-md text-xs font-semibold ${costBasis === 'COST_BREGA' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Costo + brecha</button>
                </div>
              </div>
            )}
            {canReceive && (
              <button onClick={() => act('receive')} disabled={busy} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg text-sm flex items-center gap-2">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Recibir
              </button>
            )}
            {canApprove && (
              <>
                <button onClick={() => act('approve')} disabled={busy} className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg text-sm flex items-center gap-2">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Aprobar y enviar
                </button>
                <button onClick={() => act('reject')} disabled={busy} className="bg-red-600/80 hover:bg-red-500 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg text-sm flex items-center gap-2">
                  <X size={15} /> Rechazar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 mb-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div><div className="text-xs text-slate-500">Tipo</div><div className="text-slate-200">{tipoLabel(t)}</div></div>
        <div><div className="text-xs text-slate-500">Empresa socia</div><div className="text-slate-200">{t.partnerName}</div></div>
        <div><div className="text-xs text-slate-500">Creado</div><div className="text-slate-200">{new Date(t.createdAt).toLocaleString('es-VE')}</div></div>
        {whName(t.fromWarehouseId) && <div><div className="text-xs text-slate-500">Almacén origen</div><div className="text-slate-200">{whName(t.fromWarehouseId)}</div></div>}
        {whName(t.toWarehouseId) && <div><div className="text-xs text-slate-500">Almacén destino</div><div className="text-slate-200">{whName(t.toWarehouseId)}</div></div>}
        {t.notes && <div className="col-span-2 md:col-span-3"><div className="text-xs text-slate-500">Notas</div><div className="text-slate-200">{t.notes}</div></div>}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 text-slate-400">
              <th className="px-4 py-2 text-left">Código</th>
              <th className="px-4 py-2 text-left">Artículo</th>
              <th className="px-4 py-2 text-right">Cantidad</th>
              <th className="px-4 py-2 text-right">Costo unit. $</th>
              <th className="px-4 py-2 text-right">Subtotal $</th>
            </tr>
          </thead>
          <tbody>
            {(t.items || []).map((i, idx) => (
              <tr key={idx} className="border-b border-slate-700/30">
                <td className="px-4 py-2 font-mono text-green-400">{i.code}</td>
                <td className="px-4 py-2 text-slate-200">{i.name || '—'}</td>
                <td className="px-4 py-2 text-right text-slate-200">{i.quantity}</td>
                <td className="px-4 py-2 text-right text-slate-300">{i.unitCost != null ? `$${i.unitCost.toFixed(2)}` : '—'}</td>
                <td className="px-4 py-2 text-right text-slate-300">{i.unitCost != null ? `$${(i.unitCost * i.quantity).toFixed(2)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-700/50 bg-slate-800/30">
              <td colSpan={2} className="px-4 py-2 text-slate-300 font-semibold">Totales</td>
              <td className="px-4 py-2 text-right text-slate-200 font-semibold">{(t.items || []).reduce((s, i) => s + i.quantity, 0)}</td>
              <td className="px-4 py-2"></td>
              <td className="px-4 py-2 text-right text-slate-200 font-semibold">${totalUsd.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-slate-500 mt-2">
        Al enviarse genera Cuenta por Cobrar al socio; al recibirse genera Cuenta por Pagar (a costo).
      </p>
    </div>
  );
}
