'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Send, Download, Check, X, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
import ProductSearch, { ProductSearchResult } from '@/components/product-search';

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
  const search = useSearchParams();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal state
  const [modal, setModal] = useState<null | 'send' | 'request' | 'receive' | 'approve'>(null);
  const [active, setActive] = useState<Transfer | null>(null);
  const [rows, setRows] = useState<{ code: string; name: string; quantity: string }[]>([]);
  const [wh, setWh] = useState('');
  const [notes, setNotes] = useState('');
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

  // Prefill de "Solicitar traslado" desde la ficha de producto (?requestCode=)
  useEffect(() => {
    const rc = search.get('requestCode');
    if (rc && enabled) openModal('request', null, rc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  function openModal(kind: 'send' | 'request' | 'receive' | 'approve', t: Transfer | null, prefillCode?: string) {
    setActive(t);
    setNotes('');
    setWh('');
    if (kind === 'send' || kind === 'request') {
      setRows(prefillCode ? [{ code: prefillCode, name: prefillCode, quantity: '1' }] : []);
    }
    setModal(kind);
  }

  function addProduct(p: ProductSearchResult) {
    setRows((r) => (r.some((x) => x.code === p.code) ? r : [...r, { code: p.code, name: p.name, quantity: '1' }]));
  }
  function rmRow(i: number) { setRows((r) => r.filter((_, idx) => idx !== i)); }
  function setQty(i: number, v: string) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, quantity: v } : row)));
  }

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      let res: Response;
      if (modal === 'send' || modal === 'request') {
        const items = rows
          .filter((r) => r.code.trim() && Number(r.quantity) > 0)
          .map((r) => ({ code: r.code.trim(), quantity: Number(r.quantity) }));
        if (items.length === 0) { setMsg({ type: 'error', text: 'Agrega al menos un item válido.' }); setBusy(false); return; }
        if (modal === 'send' && !wh) { setMsg({ type: 'error', text: 'Elige el almacén origen.' }); setBusy(false); return; }
        const body = modal === 'send' ? { fromWarehouseId: wh, items, notes } : { items, notes };
        res = await fetch(`/api/proxy/integration/transfers/${modal}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
      } else if (modal === 'receive') {
        if (!wh) { setMsg({ type: 'error', text: 'Elige el almacén destino.' }); setBusy(false); return; }
        res = await fetch(`/api/proxy/integration/transfers/${active!.id}/receive`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toWarehouseId: wh }),
        });
      } else {
        // approve
        if (!wh) { setMsg({ type: 'error', text: 'Elige el almacén origen.' }); setBusy(false); return; }
        res = await fetch(`/api/proxy/integration/transfers/${active!.id}/approve`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fromWarehouseId: wh }),
        });
      }
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
          <button onClick={() => openModal('send', null)} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-3 rounded-lg text-sm"><Send size={16} /> Enviar</button>
          <button onClick={() => openModal('request', null)} className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold py-2 px-3 rounded-lg text-sm"><Download size={16} /> Solicitar</button>
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
                <td className="px-3 py-2 font-mono text-slate-200">{t.number}</td>
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

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !busy && setModal(null)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-3">
              {modal === 'send' && `Enviar a ${partnerName}`}
              {modal === 'request' && `Solicitar a ${partnerName}`}
              {modal === 'receive' && `Recibir ${active?.number}`}
              {modal === 'approve' && `Aprobar y enviar ${active?.number}`}
            </h3>

            {(modal === 'send' || modal === 'request') && (
              <>
                <div className="mb-2">
                  <ProductSearch
                    onSelect={addProduct}
                    warehouseId={modal === 'send' ? (wh || undefined) : undefined}
                    isAdded={(p) => rows.some((r) => r.code === p.code)}
                    placeholder="Buscar artículo por código o nombre…"
                  />
                </div>
                {rows.length === 0 ? (
                  <p className="text-xs text-slate-500 mb-3">Busca y selecciona los artículos a {modal === 'send' ? 'enviar' : 'solicitar'}.</p>
                ) : (
                  <div className="mb-3 max-h-48 overflow-y-auto">
                    {rows.map((r, i) => (
                      <div key={r.code} className="flex items-center gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate">{r.name}</div>
                          <div className="text-[11px] font-mono text-green-400">{r.code}</div>
                        </div>
                        <input aria-label="Cantidad" placeholder="Cant." type="number" min="0" value={r.quantity} onChange={(e) => setQty(i, e.target.value)} className="input-field w-24 !py-2 text-sm" />
                        <button onClick={() => rmRow(i)} className="text-slate-500 hover:text-red-400"><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {(modal === 'send' || modal === 'approve') && (
              <div className="mb-3">
                <label className="block text-xs text-slate-400 mb-1">Almacén origen</label>
                <select value={wh} onChange={(e) => setWh(e.target.value)} className="input-field w-full !py-2 text-sm">
                  <option value="">Selecciona…</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            )}
            {modal === 'receive' && (
              <div className="mb-3">
                <label className="block text-xs text-slate-400 mb-1">Almacén destino</label>
                <select value={wh} onChange={(e) => setWh(e.target.value)} className="input-field w-full !py-2 text-sm">
                  <option value="">Selecciona…</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            )}

            {(modal === 'send' || modal === 'request') && (
              <input placeholder="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field w-full !py-2 text-sm mb-3" />
            )}

            {modal === 'approve' && active && (
              <div className="mb-3 text-sm text-slate-300">
                Se despacharán: {active.items?.map((i) => `${i.code} x${i.quantity}`).join(', ')}
              </div>
            )}

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
