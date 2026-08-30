'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Loader2, Trash2, ImagePlus, X, ArrowLeft, Save } from 'lucide-react';
import ProductSearch, { ProductSearchResult } from '@/components/product-search';
import { WAREHOUSE_ZONES as ZONES } from '@/lib/warehouse-zones';

const MAX_PHOTOS_PER_ITEM = 6;

interface Item {
  productId: string;
  code: string;
  name: string;
  quantity: number;
  note: string;
  photos: string[]; // data URIs
}

// Comprime la imagen en el navegador antes de subir (misma técnica que incidencias).
async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  let { width, height } = bitmap;
  if (width > maxDim || height > maxDim) {
    const scale = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', quality);
}

export default function NewDamageReportPage() {
  const router = useRouter();
  const [zone, setZone] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  useEffect(() => { document.title = 'Nuevo reporte de daños | Trinity ERP'; }, []);
  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 4000); return () => clearTimeout(t); }
  }, [message]);

  const totalPhotos = items.reduce((n, it) => n + it.photos.length, 0);

  function addProduct(p: ProductSearchResult) {
    if (items.some((it) => it.productId === p.id)) return;
    setItems((prev) => [...prev, { productId: p.id, code: p.code, name: p.name, quantity: 1, note: '', photos: [] }]);
  }
  function updateItem(idx: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onPickPhoto(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const current = items[idx];
    const room = MAX_PHOTOS_PER_ITEM - current.photos.length;
    if (room <= 0) { setMessage({ type: 'error', text: `Máximo ${MAX_PHOTOS_PER_ITEM} fotos por artículo` }); return; }
    const toAdd = files.slice(0, room);
    const added: string[] = [];
    for (const file of toAdd) {
      if (!file.type.startsWith('image/')) { setMessage({ type: 'error', text: 'Los archivos deben ser imágenes' }); continue; }
      if (file.size > 25 * 1024 * 1024) { setMessage({ type: 'error', text: 'Cada imagen debe pesar menos de 25 MB' }); continue; }
      try { added.push(await compressImage(file)); } catch { setMessage({ type: 'error', text: 'No se pudo procesar una imagen' }); }
    }
    if (added.length) updateItem(idx, { photos: [...current.photos, ...added] });
  }
  function removePhoto(itemIdx: number, photoIdx: number) {
    updateItem(itemIdx, { photos: items[itemIdx].photos.filter((_, i) => i !== photoIdx) });
  }

  async function submit() {
    if (!zone.trim()) { setMessage({ type: 'error', text: 'Indica la zona' }); return; }
    if (items.length === 0) { setMessage({ type: 'error', text: 'Agrega al menos un artículo' }); return; }
    if (items.some((it) => !(it.quantity > 0))) { setMessage({ type: 'error', text: 'Todas las cantidades deben ser mayores a 0' }); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/proxy/damage-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone: zone.trim(),
          notes: notes.trim() || undefined,
          items: items.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
            note: it.note.trim() || undefined,
            photos: it.photos.length ? it.photos : undefined,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al guardar');
      }
      const created = await res.json();
      router.push(`/inventory/damage-reports/${created.id}`);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Error al guardar' });
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/inventory/damage-reports" className="text-slate-400 hover:text-white"><ArrowLeft size={20} /></Link>
        <AlertTriangle className="text-amber-400" size={22} />
        <h1 className="text-xl font-bold text-white">Nuevo reporte de daños</h1>
      </div>

      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
          {message.text}
        </div>
      )}

      <div className="card p-6 space-y-4 relative z-30">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Zona</label>
            <input list="damage-zones" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Selecciona o escribe la zona" className="input-field w-full" />
            <datalist id="damage-zones">{ZONES.map((z) => <option key={z} value={z} />)}</datalist>
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Nota general (opcional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contexto del daño" className="input-field w-full" />
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Agregar artículo dañado</label>
          <ProductSearch onSelect={addProduct} isAdded={(p) => items.some((it) => it.productId === p.id)} accent="red" placeholder="Buscar producto por código o nombre..." />
        </div>
      </div>

      {/* Lista de artículos (POS-like) */}
      {items.length > 0 && (
        <div className="space-y-3">
          {items.map((it, idx) => (
            <div key={it.productId} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-red-400">{it.code}</span>
                  <p className="text-sm text-white break-words">{it.name}</p>
                </div>
                <button onClick={() => removeItem(idx)} className="text-slate-500 hover:text-red-400 flex-shrink-0"><Trash2 size={16} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Cantidad</label>
                  <input
                    type="number" min="0" step="any" value={it.quantity}
                    onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                    className="input-field w-full !py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Nota (por qué del daño)</label>
                  <input
                    value={it.note} onChange={(e) => updateItem(idx, { note: e.target.value })}
                    placeholder="Ej: golpe de montacargas, mojado, doblado..."
                    className="input-field w-full !py-2 text-sm"
                  />
                </div>
              </div>
              {/* Fotos por ítem */}
              <div className="flex items-center gap-2 flex-wrap">
                {it.photos.map((p, pi) => (
                  <div key={pi} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt="evidencia" className="w-full h-full object-cover" />
                    <button onClick={() => removePhoto(idx, pi)} className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 text-white hover:bg-red-500"><X size={12} /></button>
                  </div>
                ))}
                {it.photos.length < MAX_PHOTOS_PER_ITEM && (
                  <label className="w-16 h-16 rounded-lg border border-dashed border-slate-600 flex flex-col items-center justify-center text-slate-500 hover:border-green-500 hover:text-green-400 cursor-pointer">
                    <ImagePlus size={18} />
                    <span className="text-[9px] mt-0.5">Foto</span>
                    <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => onPickPhoto(idx, e)} />
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap sticky bottom-0 py-3 bg-slate-900/80 backdrop-blur">
        <p className="text-xs text-slate-500">
          {items.length} artículo(s) · {totalPhotos} foto(s){' '}
          <span className="text-slate-600">(la foto es opcional)</span>
        </p>
        <button onClick={submit} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          Guardar reporte
        </button>
      </div>
    </div>
  );
}
