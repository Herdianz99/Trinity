'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Search, Loader2, Minus, Plus, Trash2, Lock, Save, X, AlertTriangle, Tag, Package } from 'lucide-react';
import QtyInput from '@/components/qty-input';
import { useNavGuard } from '@/components/nav-guard';

interface PortalProduct {
  id: string; code: string; name: string; description: string | null;
  thumbUrl: string | null; imageUrl: string | null;
  priceUsd: number; priceBs: number | null; isOnSale: boolean; isService: boolean;
  stock: number; available: number;
}
interface Line {
  productId: string; code: string; name: string; thumbUrl: string | null;
  priceUsd: number; stock: number; available: number; isService: boolean; quantity: number;
}

const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n: number) => (n ?? 0).toLocaleString('es-VE', { maximumFractionDigits: 3 });
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function Thumb({ url }: { url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="w-12 h-12 rounded-lg object-cover bg-slate-800 shrink-0" />
  ) : (
    <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center shrink-0"><Package size={18} className="text-slate-600" /></div>
  );
}

export default function PortalOrderPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const isNew = id === 'nuevo';
  const router = useRouter();
  const { setBlocker, requestNavigate } = useNavGuard();

  const [orderId, setOrderId] = useState<string | null>(isNew ? null : id);
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [locked, setLocked] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [allowNegativeStock, setAllowNegativeStock] = useState(true);

  // Busqueda: MISMO comportamiento que el POS (debounce 300 ms, hasta 500 resultados,
  // ofertas primero, mismo motor del servidor).
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PortalProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);
  const [stockWarn, setStockWarn] = useState<{ name: string; available: number; requested: number; onConfirm: () => void } | null>(null);

  useEffect(() => { document.title = `${isNew ? 'Nuevo pedido' : 'Pedido'} | Trinity ERP`; }, [isNew]);

  useEffect(() => {
    fetch('/api/proxy/portal/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setRate(d.rate ?? null); setAllowNegativeStock(d.allowNegativeStock ?? true); } })
      .catch(() => {});
  }, []);

  const applyOrder = useCallback((o: any) => {
    setOrderId(o.id);
    setNote(o.portalNote || '');
    setLocked(o.state === 'EN_USO');
    setLines(o.items.map((it: any) => ({
      productId: it.productId, code: it.code, name: it.name, thumbUrl: it.thumbUrl,
      priceUsd: it.priceUsd, stock: it.stock, available: it.available, isService: it.isService, quantity: it.quantity,
    })));
    setDirty(false);
  }, []);

  const loadOrder = useCallback(async (oid: string) => {
    const res = await fetch(`/api/proxy/portal/orders/${oid}`);
    // Ya procesado / no existe: volver a la lista.
    if (res.status === 404 || res.status === 409) { router.replace('/portal'); return; }
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'No se pudo cargar el pedido');
    applyOrder(await res.json());
  }, [applyOrder, router]);

  useEffect(() => {
    if (isNew) return;
    loadOrder(id)
      .catch((e) => setMessage({ type: 'error', text: e.message }))
      .finally(() => setLoading(false));
  }, [id, isNew, loadOrder]);

  function handleSearch(q: string) {
    setQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!q.trim()) { setResults([]); setSearching(false); return; }
    searchTimeout.current = setTimeout(async () => {
      const seq = ++searchSeq.current;
      setSearching(true);
      try {
        const res = await fetch(`/api/proxy/portal/products?search=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (seq === searchSeq.current) setResults(data.data || []);
      } catch { /* ignore */ } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 300);
  }

  function doAdd(p: PortalProduct) {
    setLines((prev) => {
      const ex = prev.find((l) => l.productId === p.id);
      if (ex) return prev.map((l) => (l.productId === p.id ? { ...l, quantity: r3(l.quantity + 1) } : l));
      return [{
        productId: p.id, code: p.code, name: p.name, thumbUrl: p.thumbUrl, priceUsd: p.priceUsd,
        stock: p.stock, available: p.available, isService: p.isService, quantity: 1,
      }, ...prev];
    });
    setDirty(true);
    setQuery('');
    setResults([]);
  }

  // Igual que el POS: bloquea sin stock solo si la empresa no permite vender en negativo;
  // si supera el disponible avisa (suave) y deja agregar igual.
  function addProduct(p: PortalProduct) {
    if (locked) return;
    if (!p.priceUsd || p.priceUsd <= 0) { setMessage({ type: 'error', text: `"${p.name}" no tiene precio.` }); return; }
    if (!allowNegativeStock && !p.isService && p.stock <= 0) {
      setMessage({ type: 'error', text: `"${p.name}" no tiene existencia.` });
      return;
    }
    const existing = lines.find((l) => l.productId === p.id);
    const requested = (existing?.quantity || 0) + 1;
    const available = existing ? existing.available : p.available;
    if (!p.isService && requested > available) {
      setStockWarn({ name: p.name, available, requested, onConfirm: () => { setStockWarn(null); doAdd(p); } });
      return;
    }
    doAdd(p);
  }

  function setQty(productId: string, qty: number) {
    if (qty <= 0) return;
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity: r3(qty) } : l)));
    setDirty(true);
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
    setDirty(true);
  }

  const save = useCallback(async (): Promise<boolean> => {
    if (lines.length === 0) { setMessage({ type: 'error', text: 'Agrega al menos un producto.' }); return false; }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(orderId ? `/api/proxy/portal/orders/${orderId}` : '/api/proxy/portal/orders', {
        method: orderId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalNote: note.trim() || undefined,
          items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      const msg = Array.isArray(data.message) ? data.message[0] : data.message;
      if (res.status === 409) {
        // La empresa lo tomo o ya lo proceso: recargar (queda en solo lectura o vuelve a la lista).
        setMessage({ type: 'error', text: msg || 'El pedido no se puede modificar en este momento.' });
        if (orderId) await loadOrder(orderId).catch(() => {});
        return false;
      }
      if (!res.ok) throw new Error(msg || 'No se pudo guardar el pedido');
      applyOrder(data);
      // Pedido nuevo: solo actualizar la URL (sin remontar la pagina, para no perder el aviso).
      if (!orderId) window.history.replaceState(null, '', `/portal/pedido/${data.id}`);
      setMessage({ type: 'success', text: 'Pedido guardado' });
      return true;
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }, [lines, note, orderId, applyOrder, loadOrder, router]);

  // Salir sin guardar: mismo guard que el POS.
  useEffect(() => {
    if (dirty && !locked) setBlocker({ onSave: save, what: 'el pedido' });
    else setBlocker(null);
  }, [dirty, locked, save, setBlocker]);
  useEffect(() => () => setBlocker(null), [setBlocker]);

  const totalUsd = lines.reduce((s, l) => s + l.priceUsd * l.quantity, 0);

  if (loading) {
    return <div className="py-24 flex items-center justify-center text-slate-400 gap-2"><Loader2 className="animate-spin" size={18} /> Cargando pedido…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => requestNavigate('/portal')} className="p-2 -ml-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800" aria-label="Volver">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-white truncate">{isNew && !orderId ? 'Nuevo pedido' : note || 'Pedido'}</h1>
        {locked && <span className="ml-auto inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300"><Lock size={11} /> En proceso</span>}
      </div>

      {locked && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm flex items-start gap-2">
          <Lock size={16} className="mt-0.5 shrink-0" />
          La empresa está procesando este pedido. No se puede modificar en este momento.
        </div>
      )}

      {message && (
        <div className={`p-3 rounded-lg text-sm flex items-start justify-between gap-2 ${message.type === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-300' : 'bg-green-500/10 border border-green-500/20 text-green-300'}`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} aria-label="Cerrar"><X size={15} /></button>
        </div>
      )}

      {!locked && (
        <div className="sticky top-14 z-20 -mx-3 sm:mx-0 px-3 sm:px-0 py-2 bg-slate-950/95 backdrop-blur">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Buscar producto por nombre o código…"
              className="input-field !py-3 pl-9 pr-9 w-full"
            />
            {searching ? (
              <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-500" />
            ) : query ? (
              <button onClick={() => handleSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white" aria-label="Limpiar"><X size={16} /></button>
            ) : null}
          </div>

          {query.trim() && (
            <div className="mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-slate-700/60 bg-slate-900 divide-y divide-slate-800">
              {!searching && results.length === 0 && <p className="text-center py-6 text-slate-500 text-sm">Sin resultados</p>}
              {results.map((p) => (
                <button key={p.id} onClick={() => addProduct(p)} className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-slate-800/70">
                  <Thumb url={p.thumbUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-100 leading-tight line-clamp-2">{p.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {p.code}
                      {!p.isService && <> · Stock: {fmtQty(p.stock)} · <span className={p.available <= 0 ? 'text-red-400 font-semibold' : ''}>Disponible: {fmtQty(p.available)}</span></>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {p.isOnSale && <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 mb-0.5"><Tag size={10} /> Oferta</span>}
                    <p className="text-sm font-mono font-bold text-white">$ {fmt(p.priceUsd)}</p>
                    {p.priceBs != null && <p className="text-[11px] font-mono text-slate-500">Bs {fmt(p.priceBs)}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs text-slate-400 mb-1">Nombre o nota del pedido (opcional)</label>
        <input
          type="text"
          value={note}
          maxLength={120}
          disabled={locked}
          onChange={(e) => { setNote(e.target.value); setDirty(true); }}
          placeholder='Ej: "Obra Los Pinos"'
          className="input-field !py-2 w-full disabled:opacity-60"
        />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Productos ({lines.length})</h2>
        </div>
        {lines.length === 0 ? (
          <p className="text-center py-10 text-slate-500 text-sm">Busca productos arriba para agregarlos.</p>
        ) : (
          <div className="divide-y divide-slate-800">
            {lines.map((l) => (
              <div key={l.productId} className="px-3 py-3 flex items-start gap-3">
                <Thumb url={l.thumbUrl} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-100 leading-tight line-clamp-2">{l.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {l.code} · $ {fmt(l.priceUsd)} c/u
                    {!l.isService && l.quantity > l.available && <span className="text-red-400"> · supera el disponible ({fmtQty(l.available)})</span>}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <button disabled={locked || l.quantity <= 1} onClick={() => setQty(l.productId, l.quantity - 1)} className="p-1.5 rounded-lg bg-slate-800 text-slate-300 disabled:opacity-40" aria-label="Menos"><Minus size={14} /></button>
                    <QtyInput value={l.quantity} onCommit={(q) => setQty(l.productId, q)} disabled={locked}
                      className="w-20 text-center input-field !py-1.5 text-sm disabled:opacity-60" />
                    <button disabled={locked} onClick={() => setQty(l.productId, l.quantity + 1)} className="p-1.5 rounded-lg bg-slate-800 text-slate-300 disabled:opacity-40" aria-label="Más"><Plus size={14} /></button>
                    <button disabled={locked} onClick={() => removeLine(l.productId)} className="ml-auto p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-40" aria-label="Quitar"><Trash2 size={15} /></button>
                  </div>
                </div>
                <p className="text-sm font-mono text-white shrink-0">$ {fmt(l.priceUsd * l.quantity)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-500 text-center">Precios referenciales; se facturan al precio y tasa del día del despacho.</p>

      {/* Barra fija inferior: total + guardar */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400">Total estimado</p>
            <p className="text-lg font-bold font-mono text-white leading-tight">$ {fmt(totalUsd)}</p>
            {rate != null && <p className="text-[11px] font-mono text-slate-500">Bs {fmt(totalUsd * rate)}</p>}
          </div>
          <button onClick={save} disabled={locked || saving || !dirty || lines.length === 0}
            className="ml-auto btn-primary flex items-center gap-2 !py-3 !px-5 disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      {stockWarn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setStockWarn(null)}>
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2 text-amber-300"><AlertTriangle size={18} /><h3 className="font-semibold">Supera lo disponible</h3></div>
            <p className="text-sm text-slate-300">
              De <b>{stockWarn.name}</b> hay {fmtQty(stockWarn.available)} disponible(s) y vas a pedir {fmtQty(stockWarn.requested)}.
              Puedes agregarlo igual; la empresa confirmará la existencia al despachar.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setStockWarn(null)} className="px-4 py-2 rounded-lg text-sm bg-slate-700 text-slate-200">Cancelar</button>
              <button onClick={stockWarn.onConfirm} className="btn-primary !py-2 text-sm">Agregar igual</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
