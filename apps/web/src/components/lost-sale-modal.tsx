'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Loader2, X, Check } from 'lucide-react';

interface ProductLite { id: string; code: string; name: string; }
interface SearchResult { id: string; code: string; name: string; }

const REASONS = [
  { key: 'SIN_STOCK', label: 'Sin stock' },
  { key: 'PRECIO_ALTO', label: 'Precio muy alto' },
  { key: 'DESCONTINUADO', label: 'Descontinuado' },
  { key: 'PEDIDO_NO_RECIBIDO', label: 'Pedido y no recibido' },
];

export function LostSaleModal({
  onClose, onSaved, initialProduct,
}: {
  onClose: () => void;
  onSaved?: () => void;
  initialProduct?: ProductLite | null;
}) {
  const [mode, setMode] = useState<'catalog' | 'free'>(initialProduct ? 'catalog' : 'catalog');
  const [product, setProduct] = useState<ProductLite | null>(initialProduct ?? null);
  const [freeName, setFreeName] = useState('');
  const [freePrice, setFreePrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('SIN_STOCK');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // product search
  const [text, setText] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (text.length < 2) { setResults([]); setOpen(false); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/proxy/products?search=${encodeURIComponent(text)}&limit=15`);
        if (res.ok) { const d = await res.json(); setResults(d.data || []); setOpen(true); }
      } catch { /* ignore */ } finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function handleSave() {
    setError('');
    const qty = Number(quantity);
    if (!(qty > 0)) { setError('La cantidad debe ser mayor a 0'); return; }
    const body: any = { quantity: qty, reason };
    if (notes.trim()) body.notes = notes.trim();
    if (mode === 'catalog') {
      if (!product) { setError('Selecciona un producto'); return; }
      body.productId = product.id;
    } else {
      if (!freeName.trim()) { setError('Escribe el nombre del producto'); return; }
      body.productName = freeName.trim();
      if (freePrice && Number(freePrice) > 0) body.unitPriceUsd = Number(freePrice);
    }
    setSaving(true);
    try {
      const res = await fetch('/api/proxy/lost-sales', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Error al guardar'); }
      onSaved?.();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
          <h3 className="text-base font-bold text-white">Registrar venta perdida</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="p-2.5 rounded-lg border text-sm bg-red-500/10 border-red-500/20 text-red-400">{error}</div>}

          {/* Producto */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-400">Producto</label>
              <div className="flex gap-1 text-xs">
                <button onClick={() => setMode('catalog')} className={`px-2 py-0.5 rounded ${mode === 'catalog' ? 'bg-green-500/20 text-green-400' : 'text-slate-500 hover:text-slate-300'}`}>Del catalogo</button>
                <button onClick={() => { setMode('free'); setProduct(null); }} className={`px-2 py-0.5 rounded ${mode === 'free' ? 'bg-green-500/20 text-green-400' : 'text-slate-500 hover:text-slate-300'}`}>Texto libre</button>
              </div>
            </div>

            {mode === 'catalog' ? (
              product ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700/50">
                  <span className="font-mono text-xs text-green-400">{product.code}</span>
                  <span className="text-white text-sm flex-1 truncate">{product.name}</span>
                  <button onClick={() => setProduct(null)} className="text-slate-500 hover:text-red-400"><X size={14} /></button>
                </div>
              ) : (
                <div ref={ref} className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                  <input type="text" placeholder="Buscar producto..." value={text} onChange={(e) => setText(e.target.value)}
                    onFocus={() => { if (results.length) setOpen(true); }} className="input-field pl-9 !py-2 text-sm w-full" autoComplete="off" autoFocus />
                  {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-500" size={15} />}
                  {open && results.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700/50 rounded-lg shadow-xl max-h-56 overflow-y-auto">
                      {results.map(p => (
                        <button key={p.id} onClick={() => { setProduct(p); setText(''); setResults([]); setOpen(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-700/50 border-b border-slate-700/30 last:border-0">
                          <span className="font-mono text-xs text-green-400 w-20 flex-shrink-0">{p.code}</span>
                          <span className="text-white flex-1 truncate">{p.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="space-y-2">
                <input type="text" placeholder="Nombre del producto que pidio el cliente" value={freeName} onChange={(e) => setFreeName(e.target.value)}
                  className="input-field !py-2 text-sm w-full" autoFocus />
                <input type="number" min="0" step="any" placeholder="Precio aprox. USD (opcional)" value={freePrice} onChange={(e) => setFreePrice(e.target.value)}
                  className="input-field !py-2 text-sm w-full" />
              </div>
            )}
          </div>

          {/* Cantidad */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Cantidad</label>
            <input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)}
              className="input-field !py-2 text-sm w-28 text-right font-mono" />
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Motivo</label>
            <div className="flex flex-wrap gap-2">
              {REASONS.map(r => (
                <button key={r.key} onClick={() => setReason(r.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${reason === r.key ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-slate-800 text-slate-400 border-slate-700/50 hover:text-slate-200'}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Nota opcional */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Nota (opcional)</label>
            <input type="text" placeholder="Ej. cliente frecuente, lo necesitaba urgente..." value={notes} onChange={(e) => setNotes(e.target.value)}
              className="input-field !py-2 text-sm w-full" />
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-700/50 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary !py-2 text-sm">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary !py-2 text-sm flex items-center gap-2">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
