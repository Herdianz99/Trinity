'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, Send, Download, Check, X, RefreshCw, AlertTriangle } from 'lucide-react';

interface TItem { code: string; name?: string; quantity: number; unitCost?: number }
interface Transfer {
  id: string; number: string; kind: 'SEND' | 'REQUEST'; direction: 'OUTGOING' | 'INCOMING';
  status: string; partnerName: string; notes?: string | null; items: TItem[];
  createdAt: string;
}
interface Warehouse { id: string; name: string }

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Solicitado', APPROVED: 'Aprobado', SENT: 'Enviado',
  PENDING_RECEIPT: 'Por recibir', RECEIVED: 'Recibido', REJECTED: 'Rechazado', CANCELLED: 'Anulado',
};

export default function PartnerTransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modales chicos: recibir / aprobar (solo eligen almacén)
  const [modal, setModal] = useState<null | 'receive' | 'approve'>(null);
  const [active, setActive] = useState<Transfer | null>(null);
  const [wh, setWh] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = 'Traslados socio | Trinity ERP'; }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [st, tr, whs] = await Promise.all([
        fetch('/api/proxy/integration/status'),
        fetch('/api/proxy/integration/transfers'),
        fetch('/api/proxy/warehouses'),
      ]);
      if (st.ok) { const s = await st.json(); setEnabled(s.enabled); setPartnerName(s.partnerName); }
      if (tr.ok) setTransfers(await tr.json());
      if (whs.ok) setWarehouses(await whs.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openModal(kind: 'receive' | 'approve', t: Transfer) {
    setActive(t); setWh(''); setModal(kind);
  }

  async function submit() {
    if (!wh) { setMsg({ type: 'error', text: 'Elige el almacén.' }); return; }
    setBusy(true);
    setMsg(null);
    try {
      const url = modal === 'receive'
        ? `/api/proxy/integration/transfers/${active!.id}/receive`
        : `/api/proxy/integration/transfers/${active!.id}/approve`;
      const body = modal === 'receive' ? { toWarehouseId: wh } : { fromWarehouseId: wh };
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        setMsg({ type: 'success', text: 'Operación realizada.' });
        setModal(null);
        await load();
      } else {
        const e = await res.json().catch(() => ({}));
        setMsg({ type: 'error', text: e.message || 'No se pudo completar la operación.' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Error de red.' });
    } finally {
      setBusy(false);
    }
  }

  async function reject(t: Transfer) {
    if (!confirm(`¿Rechazar la solicitud ${t.number}?`)) return;
    const res = await fetch(`/api/proxy/integration/transfers/${t.id}/reject`, { method: 'POST' });
    if (res.ok) { setMsg({ type: 'success', text: 'Solicitud rechazada.' }); load(); }
  }

  function tipoLabel(t: Transfer) {
    if (t.kind === 'SEND') return t.direction === 'OUTGOING' ? 'Envío (salida)' : 'Envío (entrada)';
    return t.direction === 'OUTGOING' ? 'Mi solicitud' : 'Solicitud recibida';
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="animate-spin mr-2" size={20} /> Cargando…</div>;

  if (enabled === false) {
    return (
      <div className="max-w-2xl mx-auto mt-10 bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 text-amber-400" size={28} />
        <p className="text-slate-300">La integración con la empresa socia no está configurada.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Traslados con {partnerName}</h1>
          <p className="text-sm text-slate-400">Envía o solicita inventario a la empresa socia.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/catalog/partner-transfers/new?kind=send" className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-3 rounded-lg text-sm"><Send size={16} /> Enviar</Link>
          <Link href="/catalog/partner-transfers/new?kind=request" className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold py-2 px-3 rounded-lg text-sm"><Download size={16} /> Solicitar</Link>
          <button onClick={load} className="text-slate-400 hover:text-slate-200 p-2"><RefreshCw size={16} /></button>
        </div>
      </div>

      {msg && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${msg.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'}`}>{msg.text}</div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 text-slate-400">
              <th className="px-3 py-2 text-left">Número</th>
              <th className="px-3 py-2 text-left">Tipo</th>
              <th className="px-3 py-2 text-right">Items</th>
              <th className="px-3 py-2 text-left">Estado</th>
              <th className="px-3 py-2 text-left">Fecha</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {transfers.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-slate-500">Sin traslados.</td></tr>
            ) : transfers.map((t) => (
              <tr key={t.id} className="border-b border-slate-700/30">
                <td className="px-3 py-2 font-mono"><Link href={`/catalog/partner-transfers/${t.id}`} className="text-sky-400 hover:text-sky-300">{t.number}</Link></td>
                <td className="px-3 py-2 text-slate-300">{tipoLabel(t)}</td>
                <td className="px-3 py-2 text-right text-slate-300">{t.items?.length ?? 0}</td>
                <td className="px-3 py-2"><span className="text-slate-200">{STATUS_LABEL[t.status] || t.status}</span></td>
                <td className="px-3 py-2 text-slate-400">{new Date(t.createdAt).toLocaleDateString('es-VE')}</td>
                <td className="px-3 py-2 text-right">
                  {t.status === 'PENDING_RECEIPT' && (
                    <button onClick={() => openModal('receive', t)} className="text-emerald-400 hover:text-emerald-300 text-xs font-semibold px-2 py-1">Recibir</button>
                  )}
                  {t.kind === 'REQUEST' && t.direction === 'INCOMING' && t.status === 'REQUESTED' && (
                    <>
                      <button onClick={() => openModal('approve', t)} className="text-sky-400 hover:text-sky-300 text-xs font-semibold px-2 py-1"><Check size={13} className="inline" /> Aprobar</button>
                      <button onClick={() => reject(t)} className="text-red-400 hover:text-red-300 text-xs font-semibold px-2 py-1"><X size={13} className="inline" /> Rechazar</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal chico: recibir / aprobar (solo elegir almacén) */}
      {modal && active && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !busy && setModal(null)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-1">
              {modal === 'receive' ? `Recibir ${active.number}` : `Aprobar y enviar ${active.number}`}
            </h3>
            <p className="text-sm text-slate-400 mb-3">
              {active.items?.map((i) => `${i.code} x${i.quantity}`).join(', ')}
            </p>
            <label className="block text-xs text-slate-400 mb-1">{modal === 'receive' ? 'Almacén destino' : 'Almacén origen'}</label>
            <select value={wh} onChange={(e) => setWh(e.target.value)} className="input-field w-full !py-2 text-sm mb-4">
              <option value="">Selecciona…</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(null)} disabled={busy} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">Cancelar</button>
              <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center gap-2">
                {busy && <Loader2 size={15} className="animate-spin" />} Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
