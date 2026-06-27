'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, Search, Trash2, Check, Save,
  XCircle, Printer, ArrowRight, Plus, X,
} from 'lucide-react';

// ── Types ──
interface ProductLite { id: string; code: string; name: string; supplierRef?: string | null; costUsd: number; }
interface SearchResult { id: string; code: string; name: string; }
interface ReplacementItem {
  id: string;
  outProduct: ProductLite; outQuantity: number; outCostUsd: number;
  inProduct: ProductLite; inQuantity: number; inCostUsd: number;
}
interface ReplacementDetail {
  id: string; number: string;
  warehouse: { id: string; name: string };
  date: string; notes: string | null;
  status: 'DRAFT' | 'PROCESSED' | 'CANCELLED';
  items: ReplacementItem[];
  processedAt: string | null; createdAt: string;
}

const STATUS_LABELS: Record<string, string> = { DRAFT: 'Borrador', PROCESSED: 'Procesado', CANCELLED: 'Cancelado' };
const STATUS_BADGES: Record<string, string> = {
  DRAFT: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  PROCESSED: 'bg-green-500/10 text-green-400 border-green-500/20',
  CANCELLED: 'bg-red-500/10 text-red-400 border-red-500/20',
};

function fmtDate(d: string) { return new Date(d).toLocaleDateString('es-VE', { timeZone: 'UTC' }); }

// ── Buscador de producto reutilizable ──
function ProductPicker({
  selected, onSelect, accent,
}: {
  selected: SearchResult | null;
  onSelect: (p: SearchResult | null) => void;
  accent: 'red' | 'green';
}) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (text.length < 2) { setResults([]); setOpen(false); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/proxy/products?search=${encodeURIComponent(text)}&limit=15`);
        if (res.ok) { const d = await res.json(); setResults(d.data || []); setOpen(true); }
      } catch { /* ignore */ } finally { setLoading(false); }
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

  const accentText = accent === 'red' ? 'text-red-400' : 'text-green-400';

  if (selected) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700/50">
        <span className={`font-mono text-xs ${accentText} flex-shrink-0`}>{selected.code}</span>
        <span className="text-white text-sm flex-1 truncate">{selected.name}</span>
        <button onClick={() => onSelect(null)} className="text-slate-500 hover:text-red-400 flex-shrink-0" title="Quitar">
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
        <input
          type="text"
          placeholder="Buscar producto..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          className="input-field pl-9 !py-2 text-sm w-full"
          autoComplete="off"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-500" size={15} />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700/50 rounded-lg shadow-xl max-h-64 overflow-y-auto">
          {results.map(p => (
            <button
              key={p.id}
              onClick={() => { onSelect(p); setText(''); setResults([]); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-700/50 border-b border-slate-700/30 last:border-0"
            >
              <span className={`font-mono text-xs ${accentText} w-20 flex-shrink-0`}>{p.code}</span>
              <span className="text-white flex-1 truncate">{p.name}</span>
            </button>
          ))}
        </div>
      )}
      {open && text.length >= 2 && !loading && results.length === 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700/50 rounded-lg shadow-xl p-3 text-center text-xs text-slate-500">
          Sin resultados
        </div>
      )}
    </div>
  );
}

export default function InventoryReplacementDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [replacement, setReplacement] = useState<ReplacementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Add-line state
  const [outProduct, setOutProduct] = useState<SearchResult | null>(null);
  const [inProduct, setInProduct] = useState<SearchResult | null>(null);
  const [outQty, setOutQty] = useState('');
  const [inQty, setInQty] = useState('');
  const [adding, setAdding] = useState(false);

  // Edit quantities of existing lines
  const [qtyEdits, setQtyEdits] = useState<Record<string, { out: number; in: number }>>({});

  const fetchReplacement = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/inventory-replacements/${id}`);
      if (res.ok) {
        const data: ReplacementDetail = await res.json();
        setReplacement(data);
        setQtyEdits((prev) => {
          const next: Record<string, { out: number; in: number }> = {};
          data.items.forEach((it) => {
            next[it.id] = prev[it.id] ?? { out: it.outQuantity, in: it.inQuantity };
          });
          return next;
        });
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchReplacement(); }, [fetchReplacement]);
  useEffect(() => {
    if (replacement) document.title = `${replacement.number} | Trinity ERP`;
  }, [replacement]);

  async function handleAddLine() {
    if (!outProduct || !inProduct) return;
    if (outProduct.id === inProduct.id) {
      setMessage({ type: 'error', text: 'El articulo que sale y el que entra no pueden ser el mismo' });
      return;
    }
    const oq = Number(outQty), iq = Number(inQty);
    if (!(oq > 0) || !(iq > 0)) {
      setMessage({ type: 'error', text: 'Ingresa cantidades mayores a 0 en ambos lados' });
      return;
    }
    setAdding(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/inventory-replacements/${id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outProductId: outProduct.id, outQuantity: oq, inProductId: inProduct.id, inQuantity: iq }),
      });
      if (res.ok) {
        setOutProduct(null); setInProduct(null); setOutQty(''); setInQty('');
        fetchReplacement();
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveLine(itemId: string) {
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/inventory-replacements/${id}/items/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: [itemId] }),
      });
      if (res.ok) fetchReplacement();
    } catch { /* ignore */ }
  }

  async function saveQuantities(): Promise<boolean> {
    if (!replacement) return false;
    const items = replacement.items.map((it) => ({
      id: it.id,
      outQuantity: Number(qtyEdits[it.id]?.out ?? it.outQuantity),
      inQuantity: Number(qtyEdits[it.id]?.in ?? it.inQuantity),
    }));
    const res = await fetch(`/api/proxy/inventory-replacements/${id}/items`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Error al guardar cantidades');
    }
    return true;
  }

  async function handleSave() {
    setSaving(true); setMessage(null);
    try {
      await saveQuantities();
      setMessage({ type: 'success', text: 'Cantidades guardadas' });
      fetchReplacement();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleProcess() {
    if (!replacement) return;
    if (!confirm(`Procesar el reemplazo ${replacement.number}?\nSe sacara y metera stock en ${replacement.items.length} linea(s). Esta accion no se puede deshacer.`)) return;
    setSaving(true); setMessage(null);
    try {
      if (replacement.items.length > 0) await saveQuantities();
      const res = await fetch(`/api/proxy/inventory-replacements/${id}/process`, { method: 'PATCH' });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Reemplazo procesado y stock actualizado' });
        fetchReplacement();
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!confirm('Cancelar este reemplazo? Esta accion no se puede deshacer.')) return;
    setSaving(true); setMessage(null);
    try {
      const res = await fetch(`/api/proxy/inventory-replacements/${id}/cancel`, { method: 'PATCH' });
      if (res.ok) { setMessage({ type: 'success', text: 'Reemplazo cancelado' }); fetchReplacement(); }
      else { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Error'); }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm('Eliminar este reemplazo permanentemente?')) return;
    setSaving(true); setMessage(null);
    try {
      const res = await fetch(`/api/proxy/inventory-replacements/${id}`, { method: 'DELETE' });
      if (res.ok) { router.push('/inventory/replacements'); return; }
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Error');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message }); setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-green-500" size={32} /></div>;
  }
  if (!replacement) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">Reemplazo no encontrado</p>
        <button onClick={() => router.push('/inventory/replacements')} className="btn-secondary mt-4 text-sm">Volver</button>
      </div>
    );
  }

  const isDraft = replacement.status === 'DRAFT';
  const isProcessed = replacement.status === 'PROCESSED';
  const isCancelled = replacement.status === 'CANCELLED';

  // Costo asignado al que entra: congelado si ya se proceso; si no, preview en vivo
  // (valor que sale / cantidad que entra). Asi los "metros" heredan el costo de los "rollos".
  const assignedCostOf = (it: ReplacementItem): number => {
    if (it.inCostUsd > 0) return it.inCostUsd;
    const oq = Number(qtyEdits[it.id]?.out ?? it.outQuantity);
    const iq = Number(qtyEdits[it.id]?.in ?? it.inQuantity);
    return iq > 0 ? (oq * it.outProduct.costUsd) / iq : 0;
  };

  return (
    <div>
      <button
        onClick={() => router.push('/inventory/replacements')}
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm mb-4"
      >
        <ArrowLeft size={16} /> Volver a reemplazos
      </button>

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white font-mono">{replacement.number}</h1>
            <span className={`text-xs px-2.5 py-0.5 rounded-full border ${STATUS_BADGES[replacement.status]}`}>
              {STATUS_LABELS[replacement.status] || replacement.status}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-400 flex-wrap">
            <span>{replacement.warehouse.name}</span>
            <span>{fmtDate(replacement.date)}</span>
            <span>{replacement.items.length} linea(s)</span>
            {replacement.notes && <span className="text-slate-500">| {replacement.notes}</span>}
          </div>
        </div>
        {replacement.items.length > 0 && (
          <button
            onClick={() => window.open(`/api/proxy/inventory-replacements/${id}/pdf`)}
            className="btn-secondary !py-2 text-sm flex items-center gap-2 self-start"
          >
            <Printer size={16} /> Imprimir reporte
          </button>
        )}
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* ═══ DRAFT: add line ═══ */}
      {isDraft && (
        <div className="card p-4 mb-4 relative z-30">
          <p className="text-xs font-medium text-slate-400 mb-3">Agregar linea de canje</p>
          <div className="space-y-3">
            {/* Salida */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,140px] gap-3 items-end">
              <div>
                <label className="block text-[11px] text-red-400 mb-1">Salida (resta stock)</label>
                <ProductPicker selected={outProduct} onSelect={setOutProduct} accent="red" />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Cantidad</label>
                <input type="number" min="0" step="any" value={outQty} onChange={(e) => setOutQty(e.target.value)}
                  className="input-field !py-2 text-sm w-full text-right font-mono" placeholder="0" />
              </div>
            </div>
            {/* Entrada */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,140px] gap-3 items-end">
              <div>
                <label className="block text-[11px] text-green-400 mb-1">Entrada (suma stock)</label>
                <ProductPicker selected={inProduct} onSelect={setInProduct} accent="green" />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Cantidad</label>
                <input type="number" min="0" step="any" value={inQty} onChange={(e) => setInQty(e.target.value)}
                  className="input-field !py-2 text-sm w-full text-right font-mono" placeholder="0" />
              </div>
            </div>
            {/* Boton */}
            <div className="flex justify-end pt-1 border-t border-slate-700/40">
              <button onClick={handleAddLine} disabled={adding || !outProduct || !inProduct}
                className="btn-primary !py-2 text-sm flex items-center gap-1.5 mt-3">
                {adding ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />} Agregar linea
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lines table */}
      <div className="card overflow-hidden">
        {replacement.items.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <p>No hay lineas de canje</p>
            {isDraft && <p className="text-xs mt-1">Agrega una linea arriba (sale un articulo, entra otro)</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 text-red-400 font-medium">Salida</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium w-28">Cant.</th>
                  <th className="w-8"></th>
                  <th className="text-left px-4 py-3 text-green-400 font-medium">Entrada</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium w-28">Cant.</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium w-28" title="Costo derivado: valor que sale / cantidad que entra">Costo asign.</th>
                  {isDraft && <th className="w-12"></th>}
                </tr>
              </thead>
              <tbody>
                {replacement.items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-700/30 hover:bg-slate-800/40">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs text-red-400">{it.outProduct.code}</span>
                      <span className="text-white ml-2">{it.outProduct.name}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {isDraft ? (
                        <input type="number" min="0" step="any"
                          value={qtyEdits[it.id]?.out ?? ''}
                          onChange={(e) => setQtyEdits(v => ({ ...v, [it.id]: { out: Number(e.target.value), in: v[it.id]?.in ?? it.inQuantity } }))}
                          className="input-field !py-1 text-sm w-24 text-right font-mono" />
                      ) : (
                        <span className="font-mono text-red-400">-{it.outQuantity}</span>
                      )}
                    </td>
                    <td className="text-center text-slate-600"><ArrowRight size={14} className="inline" /></td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs text-green-400">{it.inProduct.code}</span>
                      <span className="text-white ml-2">{it.inProduct.name}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {isDraft ? (
                        <input type="number" min="0" step="any"
                          value={qtyEdits[it.id]?.in ?? ''}
                          onChange={(e) => setQtyEdits(v => ({ ...v, [it.id]: { out: v[it.id]?.out ?? it.outQuantity, in: Number(e.target.value) } }))}
                          className="input-field !py-1 text-sm w-24 text-right font-mono" />
                      ) : (
                        <span className="font-mono text-green-400">+{it.inQuantity}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-300">${assignedCostOf(it).toFixed(4)}</td>
                    {isDraft && (
                      <td className="px-2 py-2.5 text-center">
                        <button onClick={() => handleRemoveLine(it.id)}
                          className="p-1 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400" title="Eliminar linea">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DRAFT actions */}
      {isDraft && (
        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={handleDelete} disabled={saving} className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1.5">
              <Trash2 size={16} /> Eliminar
            </button>
            {replacement.items.length > 0 && (
              <button onClick={handleCancel} disabled={saving} className="text-sm text-slate-400 hover:text-slate-300 flex items-center gap-1.5">
                <XCircle size={16} /> Cancelar reemplazo
              </button>
            )}
          </div>
          {replacement.items.length > 0 && (
            <div className="flex items-center gap-3">
              <button onClick={handleSave} disabled={saving} className="btn-secondary !py-2.5 text-sm flex items-center gap-2">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Guardar
              </button>
              <button onClick={handleProcess} disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />} Procesar
              </button>
            </div>
          )}
        </div>
      )}

      {/* PROCESSED footer info */}
      {isProcessed && (
        <p className="mt-4 text-sm text-slate-400">
          Procesado el {replacement.processedAt ? new Date(replacement.processedAt).toLocaleString('es-VE') : '—'}.
        </p>
      )}

      {/* CANCELLED */}
      {isCancelled && (
        <div className="card p-6 mt-4 text-center">
          <XCircle size={40} className="mx-auto mb-3 text-red-400 opacity-40" />
          <p className="text-slate-400">Este reemplazo fue cancelado</p>
          <button onClick={handleDelete} disabled={saving} className="mt-3 text-sm text-red-400 hover:text-red-300 inline-flex items-center gap-1.5">
            <Trash2 size={16} /> Eliminar
          </button>
        </div>
      )}
    </div>
  );
}
