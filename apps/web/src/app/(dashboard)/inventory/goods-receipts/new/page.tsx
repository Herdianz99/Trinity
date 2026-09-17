'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Truck, Loader2, Trash2, ImagePlus, X, ArrowLeft, Save, Search, Building2 } from 'lucide-react';
import ProductSearch, { ProductSearchResult } from '@/components/product-search';

const MAX_PHOTOS_PER_ITEM = 6;
const MAX_GENERAL_PHOTOS = 12;

interface Item {
  productId: string;
  code: string;
  name: string;
  qtyReceived: number;
  qtyReturned: number;
  returnReason: string;
  note: string;
  photos: string[]; // data URIs (evidencia del devuelto)
}
interface Supplier { id: string; name: string; rif?: string | null }
interface Warehouse { id: string; name: string }

// Comprime la imagen en el navegador antes de subir (misma técnica que daños/incidencias).
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

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function NewGoodsReceiptPage() {
  const router = useRouter();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [supplierQuery, setSupplierQuery] = useState('');
  const [supplierResults, setSupplierResults] = useState<Supplier[]>([]);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const supplierRef = useRef<HTMLDivElement>(null);

  const [driverName, setDriverName] = useState('');
  const [truckPlate, setTruckPlate] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [date, setDate] = useState(todayInput());
  const [notes, setNotes] = useState('');
  const [generalPhotos, setGeneralPhotos] = useState<string[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  useEffect(() => { document.title = 'Nueva recepción de mercancía | Trinity ERP'; }, []);
  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 4000); return () => clearTimeout(t); }
  }, [message]);

  // Cargar almacenes para el selector (opcional).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/proxy/warehouses');
        if (res.ok) { const d = await res.json(); setWarehouses(Array.isArray(d) ? d : d.data || []); }
      } catch { /* ignore */ }
    })();
  }, []);

  // Buscador de proveedores (con debounce).
  useEffect(() => {
    if (supplierQuery.trim().length < 2) { setSupplierResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/proxy/suppliers?search=${encodeURIComponent(supplierQuery)}&limit=20`);
        if (res.ok) { const d = await res.json(); setSupplierResults(Array.isArray(d) ? d : d.data || []); setSupplierOpen(true); }
      } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(t);
  }, [supplierQuery]);

  useEffect(() => {
    function onClick(e: MouseEvent) { if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) setSupplierOpen(false); }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const totalPhotos = generalPhotos.length + items.reduce((n, it) => n + it.photos.length, 0);

  function addProduct(p: ProductSearchResult) {
    if (items.some((it) => it.productId === p.id)) return;
    setItems((prev) => [...prev, { productId: p.id, code: p.code, name: p.name, qtyReceived: 1, qtyReturned: 0, returnReason: '', note: '', photos: [] }]);
  }
  function updateItem(idx: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function filesToDataUris(files: File[], room: number): Promise<string[]> {
    const added: string[] = [];
    for (const file of files.slice(0, room)) {
      if (!file.type.startsWith('image/')) { setMessage({ type: 'error', text: 'Los archivos deben ser imágenes' }); continue; }
      if (file.size > 25 * 1024 * 1024) { setMessage({ type: 'error', text: 'Cada imagen debe pesar menos de 25 MB' }); continue; }
      try { added.push(await compressImage(file)); } catch { setMessage({ type: 'error', text: 'No se pudo procesar una imagen' }); }
    }
    return added;
  }

  async function onPickItemPhoto(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const current = items[idx];
    const room = MAX_PHOTOS_PER_ITEM - current.photos.length;
    if (room <= 0) { setMessage({ type: 'error', text: `Máximo ${MAX_PHOTOS_PER_ITEM} fotos por artículo` }); return; }
    const added = await filesToDataUris(files, room);
    if (added.length) updateItem(idx, { photos: [...current.photos, ...added] });
  }
  function removeItemPhoto(itemIdx: number, photoIdx: number) {
    updateItem(itemIdx, { photos: items[itemIdx].photos.filter((_, i) => i !== photoIdx) });
  }

  async function onPickGeneralPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const room = MAX_GENERAL_PHOTOS - generalPhotos.length;
    if (room <= 0) { setMessage({ type: 'error', text: `Máximo ${MAX_GENERAL_PHOTOS} fotos generales` }); return; }
    const added = await filesToDataUris(files, room);
    if (added.length) setGeneralPhotos((prev) => [...prev, ...added]);
  }
  function removeGeneralPhoto(idx: number) {
    setGeneralPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  function pickSupplier(s: Supplier) {
    setSupplier(s); setSupplierQuery(''); setSupplierResults([]); setSupplierOpen(false);
  }

  async function submit() {
    if (!supplier) { setMessage({ type: 'error', text: 'Selecciona el proveedor que envió' }); return; }
    if (items.length === 0) { setMessage({ type: 'error', text: 'Agrega al menos un artículo' }); return; }
    if (items.some((it) => !(it.qtyReceived > 0) && !(it.qtyReturned > 0))) {
      setMessage({ type: 'error', text: 'Cada artículo debe tener cantidad recibida o devuelta mayor a 0' }); return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/proxy/goods-receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: supplier.id,
          driverName: driverName.trim() || undefined,
          truckPlate: truckPlate.trim() || undefined,
          warehouseId: warehouseId || undefined,
          date: date || undefined,
          notes: notes.trim() || undefined,
          photos: generalPhotos.length ? generalPhotos : undefined,
          items: items.map((it) => ({
            productId: it.productId,
            qtyReceived: it.qtyReceived || 0,
            qtyReturned: it.qtyReturned || 0,
            returnReason: it.returnReason.trim() || undefined,
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
      router.push(`/inventory/goods-receipts/${created.id}`);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Error al guardar' });
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/inventory/goods-receipts" className="text-slate-400 hover:text-white"><ArrowLeft size={20} /></Link>
        <Truck className="text-sky-400" size={22} />
        <h1 className="text-xl font-bold text-white">Nueva recepción de mercancía</h1>
      </div>

      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
          {message.text}
        </div>
      )}

      {/* Datos de la ficha */}
      <div className="card p-6 space-y-4 relative z-30">
        {/* Proveedor */}
        <div ref={supplierRef} className="relative">
          <label className="block text-sm text-slate-300 mb-1.5">Proveedor que envió</label>
          {supplier ? (
            <div className="flex items-center gap-2 input-field w-full !py-2.5">
              <Building2 size={16} className="text-sky-400 flex-shrink-0" />
              <span className="text-white text-sm truncate">{supplier.name}</span>
              <button onClick={() => setSupplier(null)} className="ml-auto text-slate-500 hover:text-red-400"><X size={16} /></button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                value={supplierQuery}
                onChange={(e) => setSupplierQuery(e.target.value)}
                onFocus={() => { if (supplierResults.length > 0) setSupplierOpen(true); }}
                placeholder="Buscar proveedor por nombre o RIF..."
                className="input-field pl-9 !py-2.5 text-sm w-full"
                autoComplete="off"
              />
              {supplierOpen && supplierResults.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700/50 rounded-lg shadow-xl max-h-72 overflow-y-auto">
                  {supplierResults.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => pickSupplier(s)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-slate-700/30 last:border-0 hover:bg-slate-700/50"
                    >
                      <Building2 size={15} className="text-slate-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{s.name}</p>
                        {s.rif && <p className="text-xs text-slate-500">{s.rif}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chofer, placa, almacén, fecha */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Chofer</label>
            <input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Nombre del chofer" className="input-field w-full" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Placa del camión</label>
            <input value={truckPlate} onChange={(e) => setTruckPlate(e.target.value.toUpperCase())} placeholder="Ej: A12BC3D" className="input-field w-full uppercase" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Almacén (opcional)</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="input-field w-full">
              <option value="">— Sin especificar —</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Fecha</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field w-full" />
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Nota general (opcional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contexto de la recepción" className="input-field w-full" />
        </div>

        {/* Fotos generales de la ficha */}
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Fotos generales (camión / entrega)</label>
          <div className="flex items-center gap-2 flex-wrap">
            {generalPhotos.map((p, pi) => (
              <div key={pi} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt="foto" className="w-full h-full object-cover" />
                <button onClick={() => removeGeneralPhoto(pi)} className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 text-white hover:bg-red-500"><X size={12} /></button>
              </div>
            ))}
            {generalPhotos.length < MAX_GENERAL_PHOTOS && (
              <label className="w-16 h-16 rounded-lg border border-dashed border-slate-600 flex flex-col items-center justify-center text-slate-500 hover:border-sky-500 hover:text-sky-400 cursor-pointer">
                <ImagePlus size={18} />
                <span className="text-[9px] mt-0.5">Foto</span>
                <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={onPickGeneralPhoto} />
              </label>
            )}
          </div>
        </div>

        <div className="border-t border-slate-700/40 pt-4">
          <label className="block text-sm text-slate-300 mb-1.5">Agregar artículo recibido</label>
          <ProductSearch onSelect={addProduct} isAdded={(p) => items.some((it) => it.productId === p.id)} accent="green" placeholder="Buscar producto por código o nombre..." />
        </div>
      </div>

      {/* Renglones */}
      {items.length > 0 && (
        <div className="space-y-3">
          {items.map((it, idx) => (
            <div key={it.productId} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-sky-400">{it.code}</span>
                  <p className="text-sm text-white break-words">{it.name}</p>
                </div>
                <button onClick={() => removeItem(idx)} className="text-slate-500 hover:text-red-400 flex-shrink-0"><Trash2 size={16} /></button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Recibido</label>
                  <input
                    type="number" min="0" step="any" value={it.qtyReceived}
                    onChange={(e) => updateItem(idx, { qtyReceived: parseFloat(e.target.value) || 0 })}
                    className="input-field w-full !py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Devuelto</label>
                  <input
                    type="number" min="0" step="any" value={it.qtyReturned}
                    onChange={(e) => updateItem(idx, { qtyReturned: parseFloat(e.target.value) || 0 })}
                    className="input-field w-full !py-2 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">Nota (opcional)</label>
                  <input
                    value={it.note} onChange={(e) => updateItem(idx, { note: e.target.value })}
                    placeholder="Observación del renglón"
                    className="input-field w-full !py-2 text-sm"
                  />
                </div>
              </div>

              {/* Motivo + fotos del devuelto (solo si hay devolución) */}
              {it.qtyReturned > 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-3">
                  <div>
                    <label className="block text-xs text-amber-400 mb-1">Motivo del devuelto (defecto / daño)</label>
                    <input
                      value={it.returnReason} onChange={(e) => updateItem(idx, { returnReason: e.target.value })}
                      placeholder="Ej: caja mojada, unidad rota, defecto de fábrica..."
                      className="input-field w-full !py-2 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {it.photos.map((p, pi) => (
                      <div key={pi} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-700">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p} alt="evidencia" className="w-full h-full object-cover" />
                        <button onClick={() => removeItemPhoto(idx, pi)} className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 text-white hover:bg-red-500"><X size={12} /></button>
                      </div>
                    ))}
                    {it.photos.length < MAX_PHOTOS_PER_ITEM && (
                      <label className="w-16 h-16 rounded-lg border border-dashed border-slate-600 flex flex-col items-center justify-center text-slate-500 hover:border-amber-500 hover:text-amber-400 cursor-pointer">
                        <ImagePlus size={18} />
                        <span className="text-[9px] mt-0.5">Foto</span>
                        <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => onPickItemPhoto(idx, e)} />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap sticky bottom-0 py-3 bg-slate-900/80 backdrop-blur">
        <p className="text-xs text-slate-500">
          {items.length} artículo(s) · {totalPhotos} foto(s)
        </p>
        <button onClick={submit} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          Guardar recepción
        </button>
      </div>
    </div>
  );
}
