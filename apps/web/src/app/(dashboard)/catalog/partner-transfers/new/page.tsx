'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Send, Download, Trash2, ArrowLeft, AlertTriangle } from 'lucide-react';
import ProductSearch, { ProductSearchResult } from '@/components/product-search';

interface Warehouse { id: string; name: string }

export default function NewPartnerTransferPage() {
  const search = useSearchParams();
  const router = useRouter();
  const [kind, setKind] = useState<'send' | 'request'>(search.get('kind') === 'request' ? 'request' : 'send');
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [rows, setRows] = useState<{ code: string; name: string; quantity: string }[]>([]);
  const [wh, setWh] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => { document.title = 'Nuevo traslado socio | Trinity ERP'; }, []);

  const load = useCallback(async () => {
    const [st, whs] = await Promise.all([
      fetch('/api/proxy/integration/status'),
      fetch('/api/proxy/warehouses'),
    ]);
    if (st.ok) { const s = await st.json(); setEnabled(s.enabled); setPartnerName(s.partnerName); }
    if (whs.ok) setWarehouses(await whs.json());
    // Prefill desde la ficha de producto (?requestCode=)
    const rc = search.get('requestCode');
    if (rc) setRows([{ code: rc, name: rc, quantity: '1' }]);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  function addProduct(p: ProductSearchResult) {
    setRows((r) => (r.some((x) => x.code === p.code) ? r : [...r, { code: p.code, name: p.name, quantity: '1' }]));
  }
  function rmRow(i: number) { setRows((r) => r.filter((_, idx) => idx !== i)); }
  function setQty(i: number, v: string) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, quantity: v } : row)));
  }

  async function submit() {
    const items = rows
      .filter((r) => r.code.trim() && Number(r.quantity) > 0)
      .map((r) => ({ code: r.code.trim(), quantity: Number(r.quantity) }));
    if (items.length === 0) { setMsg({ type: 'error', text: 'Agrega al menos un artículo con cantidad.' }); return; }
    if (kind === 'send' && !wh) { setMsg({ type: 'error', text: 'Elige el almacén origen.' }); return; }
    setBusy(true);
    setMsg(null);
    try {
      const body = kind === 'send' ? { fromWarehouseId: wh, items, notes } : { items, notes };
      const res = await fetch(`/api/proxy/integration/transfers/${kind}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push('/catalog/partner-transfers');
      } else {
        const e = await res.json().catch(() => ({}));
        setMsg({ type: 'error', text: e.message || 'No se pudo crear el traslado.' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Error de red.' });
    } finally {
      setBusy(false);
    }
  }

  if (enabled === false) {
    return (
      <div className="max-w-2xl mx-auto mt-10 bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 text-amber-400" size={28} />
        <p className="text-slate-300">La integración con la empresa socia no está configurada.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/catalog/partner-transfers" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 mb-4">
        <ArrowLeft size={16} /> Volver a traslados
      </Link>

      <h1 className="text-2xl font-bold text-white mb-1">
        {kind === 'send' ? 'Enviar traslado' : 'Solicitar traslado'} {partnerName && <span className="text-slate-400 text-lg">· {partnerName}</span>}
      </h1>
      <p className="text-sm text-slate-400 mb-4">
        {kind === 'send' ? `Envía inventario a ${partnerName}.` : `Solicita inventario a ${partnerName}.`}
      </p>

      {/* Toggle enviar / solicitar */}
      <div className="grid grid-cols-2 gap-1 bg-slate-900/60 rounded-lg p-1 mb-5 max-w-xs">
        <button onClick={() => setKind('send')} className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-semibold transition-all ${kind === 'send' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
          <Send size={15} /> Enviar
        </button>
        <button onClick={() => setKind('request')} className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-semibold transition-all ${kind === 'request' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
          <Download size={15} /> Solicitar
        </button>
      </div>

      {msg && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${msg.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'}`}>{msg.text}</div>
      )}

      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
        {kind === 'send' && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-400 mb-1">Almacén origen</label>
            <select value={wh} onChange={(e) => setWh(e.target.value)} className="input-field w-full !py-2.5 text-sm max-w-sm">
              <option value="">Selecciona…</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}

        <label className="block text-xs font-medium text-slate-400 mb-1">Artículos</label>
        <ProductSearch
          onSelect={addProduct}
          warehouseId={kind === 'send' ? (wh || undefined) : undefined}
          isAdded={(p) => rows.some((r) => r.code === p.code)}
          placeholder="Buscar artículo por código o nombre…"
        />

        {rows.length === 0 ? (
          <p className="text-sm text-slate-500 mt-3">Busca y selecciona los artículos a {kind === 'send' ? 'enviar' : 'solicitar'}.</p>
        ) : (
          <div className="mt-3 border border-slate-700/50 rounded-lg divide-y divide-slate-700/30">
            {rows.map((r, i) => (
              <div key={r.code} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{r.name}</div>
                  <div className="text-[11px] font-mono text-green-400">{r.code}</div>
                </div>
                <div>
                  <input aria-label="Cantidad" placeholder="Cant." type="number" min="0" step="any" value={r.quantity} onChange={(e) => setQty(i, e.target.value)} className="input-field w-28 !py-2 text-sm" />
                </div>
                <button onClick={() => rmRow(i)} className="text-slate-500 hover:text-red-400"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}

        <label className="block text-xs font-medium text-slate-400 mb-1 mt-4">Notas (opcional)</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field w-full !py-2.5 text-sm" placeholder="Referencia, motivo…" />

        <div className="flex gap-2 justify-end mt-5">
          <Link href="/catalog/partner-transfers" className="px-4 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">Cancelar</Link>
          <button onClick={submit} disabled={busy} className={`px-5 py-2.5 rounded-lg text-white text-sm font-semibold flex items-center gap-2 ${kind === 'send' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-sky-600 hover:bg-sky-500'} disabled:opacity-50`}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : (kind === 'send' ? <Send size={16} /> : <Download size={16} />)}
            {kind === 'send' ? 'Enviar' : 'Enviar solicitud'}
          </button>
        </div>
      </div>
    </div>
  );
}
