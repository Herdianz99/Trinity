'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Search, Loader2, Check, X, Image as ImageIcon } from 'lucide-react';

interface FoundProduct {
  id: string;
  code: string;
  name: string;
  barcode?: string | null;
  primaryImageThumbUrl?: string | null;
}

// Reduce la imagen a maxSize px (lado mayor) y devuelve un data URI JPEG.
function downscaleToDataUri(file: File, maxSize = 1600, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No canvas context'));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

export default function PhotoSessionPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoundProduct[]>([]);
  const [selected, setSelected] = useState<FoundProduct | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { document.title = 'Sesión de fotos | Trinity ERP'; }, []);

  const doSearch = useCallback((q: string) => {
    setQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!q.trim()) { setResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/proxy/products?search=${encodeURIComponent(q)}&limit=30`);
        const data = await res.json();
        setResults(data.data || []);
      } catch { /* ignore */ }
    }, 300);
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selected) return;
    setUploading(true);
    setMsg(null);
    try {
      const dataUri = await downscaleToDataUri(file);
      const res = await fetch(`/api/proxy/products/${selected.id}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUri }),
      });
      if (res.ok) {
        const img = await res.json();
        setMsg({ type: 'ok', text: `Foto guardada para ${selected.code}` });
        setSelected({ ...selected, primaryImageThumbUrl: selected.primaryImageThumbUrl || img.thumbUrl });
      } else {
        const err = await res.json().catch(() => ({}));
        setMsg({ type: 'err', text: err.message || 'Error al subir la foto' });
      }
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <Camera className="text-purple-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Sesión de fotos</h1>
          <p className="text-slate-400 text-sm">Busca o escanea un producto y tómale la foto</p>
        </div>
      </div>

      {msg && (
        <div className={`mb-3 px-4 py-2 rounded-lg text-sm ${msg.type === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {msg.text}
        </div>
      )}

      {!selected ? (
        <>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              autoFocus
              value={query}
              onChange={(e) => doSearch(e.target.value)}
              placeholder="Código, nombre o código de barras..."
              className="input-field pl-10 w-full"
            />
          </div>
          <div className="card divide-y divide-slate-700/40">
            {results.map((p) => (
              <button key={p.id} onClick={() => { setSelected(p); setResults([]); setQuery(''); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-700/40">
                {p.primaryImageThumbUrl
                  ? <img src={p.primaryImageThumbUrl} alt="" className="w-10 h-10 rounded object-cover border border-slate-700" />
                  : <div className="w-10 h-10 rounded bg-slate-800 border border-slate-700 flex items-center justify-center"><ImageIcon size={16} className="text-slate-600" /></div>}
                <div className="min-w-0">
                  <div className="text-xs font-mono text-slate-500">{p.code}</div>
                  <div className="text-sm text-white truncate">{p.name}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="card p-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs font-mono text-slate-500">{selected.code}</div>
              <div className="text-lg text-white font-medium">{selected.name}</div>
            </div>
            <button onClick={() => { setSelected(null); setMsg(null); }} className="text-slate-400 hover:text-white"><X size={20} /></button>
          </div>

          {selected.primaryImageThumbUrl && (
            <div className="mb-4 flex items-center gap-2 text-sm text-green-400">
              <Check size={16} /> Ya tiene foto principal
              <img src={selected.primaryImageThumbUrl} alt="" className="w-12 h-12 rounded object-cover ml-auto border border-slate-700" />
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3">
            {uploading ? <><Loader2 size={20} className="animate-spin" /> Subiendo...</> : <><Camera size={20} /> Tomar / elegir foto</>}
          </button>

          <button onClick={() => { setSelected(null); setMsg(null); }} className="btn-secondary w-full mt-2">
            Siguiente producto
          </button>
        </div>
      )}
    </div>
  );
}
