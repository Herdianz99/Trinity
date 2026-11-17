'use client';
import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Film, Package, Loader2, Upload, X, Search, ImageOff, RotateCcw } from 'lucide-react';
import { TotemMedia, uploadTotemFile } from './totem-upload';

export type AdType = 'IMAGE' | 'VIDEO' | 'PRODUCT';
export interface TotemAdRow {
  id: string;
  type: AdType;
  title: string;
  isActive: boolean;
  sortOrder: number;
  startDate: string | null;
  endDate: string | null;
  durationSec: number;
  status: 'ACTIVE' | 'PAUSED' | 'SCHEDULED' | 'EXPIRED' | 'PROCESSING' | 'FAILED' | 'SOLD_OUT' | 'NO_MEDIA';
  media: TotemMedia | null;
  product: { id: string; code: string; name: string; price: string; imageUrl: string | null } | null;
}
interface ProductHit { id: string; code: string; name: string; priceDetal?: number; primaryImageMediumUrl?: string | null; primaryImageThumbUrl?: string | null }

const TYPES: { key: AdType; label: string; hint: string; icon: React.ReactNode }[] = [
  { key: 'IMAGE', label: 'Imagen', hint: 'Una publicidad tuya (ej. Cashea). Ideal 1080×1920 vertical.', icon: <ImageIcon size={18} /> },
  { key: 'VIDEO', label: 'Video', hint: 'Con sonido. Máx. 2 min. Se comprime solo al subirlo.', icon: <Film size={18} /> },
  { key: 'PRODUCT', label: 'Producto', hint: 'Foto + nombre + precio de hoy en $ BCV. No sale si se agota.', icon: <Package size={18} /> },
];

/** Crear o editar un anuncio. Incluye la vista previa vertical (como se ve en el TV). */
export default function AdEditor({ ad, onClose, onSaved }: { ad: TotemAdRow | null; onClose: () => void; onSaved: (rows: TotemAdRow[]) => void }) {
  const [type, setType] = useState<AdType>(ad?.type ?? 'IMAGE');
  const [title, setTitle] = useState(ad?.title ?? '');
  const [media, setMedia] = useState<TotemMedia | null>(ad?.media ?? null);
  const [product, setProduct] = useState<TotemAdRow['product']>(ad?.product ?? null);
  const [startDate, setStartDate] = useState(ad?.startDate ?? '');
  const [endDate, setEndDate] = useState(ad?.endDate ?? '');
  const [durationSec, setDurationSec] = useState(ad?.durationSec ?? 8);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ProductHit[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Mientras el servidor comprime, preguntar cada 3 s por el archivo.
  useEffect(() => {
    if (media?.status !== 'PROCESSING') return;
    const t = setInterval(async () => {
      const res = await fetch('/api/proxy/totem/admin/media');
      if (!res.ok) return;
      const data = await res.json();
      const m = (data.files as TotemMedia[]).find((f) => f.id === media.id);
      if (m && m.status !== 'PROCESSING') setMedia(m);
    }, 3000);
    return () => clearInterval(t);
  }, [media?.id, media?.status]);

  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) { setHits([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/proxy/products/search?q=${encodeURIComponent(s)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: ProductHit[]) => setHits(rows.slice(0, 12)));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const pickFile = async (file: File) => {
    setError('');
    setProgress(0);
    try {
      setMedia(await uploadTotemFile(file, setProgress));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const accept = type === 'VIDEO' ? 'video/*' : 'image/jpeg,image/png,image/webp';

  async function save() {
    setError('');
    if (type === 'PRODUCT' && !product) { setError('Elige un producto'); return; }
    if (type !== 'PRODUCT' && !media) { setError('Sube el archivo del anuncio'); return; }
    if (media?.status === 'FAILED') { setError('El archivo tuvo un error; súbelo de nuevo.'); return; }
    setSaving(true);
    const body = {
      ...(ad ? {} : { type }),
      title,
      mediaId: media?.id ?? null,
      ...(type === 'PRODUCT' ? { productId: product!.id } : {}),
      startDate: startDate || null,
      endDate: endDate || null,
      durationSec: Number(durationSec) || 8,
    };
    try {
      const res = await fetch(`/api/proxy/totem/admin/ads${ad ? `/${ad.id}` : ''}`, {
        method: ad ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Error al guardar');
      onSaved(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const previewUrl = media?.status === 'READY' ? (media.kind === 'VIDEO' ? media.thumbUrl : media.url) : null;
  const productImg = (media?.status === 'READY' ? media.url : null) || product?.imageUrl || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="card max-h-[92vh] w-full max-w-4xl overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{ad ? 'Editar anuncio' : 'Nuevo anuncio'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_240px]">
          <div className="space-y-4">
            {!ad && (
              <div className="grid grid-cols-3 gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => { setType(t.key); setMedia(null); setError(''); }}
                    className={`rounded-xl border p-3 text-left transition ${type === t.key ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 hover:border-slate-500'}`}
                  >
                    <span className="flex items-center gap-2 font-semibold text-white">{t.icon} {t.label}</span>
                    <span className="mt-1 block text-xs text-slate-400">{t.hint}</span>
                  </button>
                ))}
              </div>
            )}

            {type === 'PRODUCT' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Producto</label>
                {product ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 px-3 py-2">
                    <span className="text-sm text-white"><span className="font-mono text-slate-400">{product.code}</span> · {product.name} · <b className="text-emerald-400">{product.price}</b></span>
                    <button onClick={() => setProduct(null)} className="text-slate-400 hover:text-white"><X size={16} /></button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código o nombre" className="input-field !py-2 !pl-9 text-sm" autoFocus />
                    {hits.length > 0 && (
                      <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
                        {hits.map((h) => (
                          <button
                            key={h.id}
                            onClick={() => {
                              setProduct({
                                id: h.id, code: h.code, name: h.name,
                                price: h.priceDetal != null ? `$${Number(h.priceDetal).toFixed(2)}` : '',
                                imageUrl: h.primaryImageMediumUrl || h.primaryImageThumbUrl || null,
                              });
                              if (!title) setTitle(h.name);
                              setQ(''); setHits([]);
                            }}
                            className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                          >
                            <span className="font-mono text-slate-400">{h.code}</span> · {h.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                {type === 'PRODUCT' ? 'Foto (opcional: por defecto usa la del catálogo)' : type === 'VIDEO' ? 'Video' : 'Imagen'}
              </label>
              <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pickFile(f); }} />
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => fileRef.current?.click()} disabled={progress !== null} className="btn-secondary flex items-center gap-2 text-sm">
                  {progress !== null ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  {progress !== null ? `Subiendo… ${progress}%` : media ? 'Cambiar archivo' : type === 'PRODUCT' ? 'Usar otra foto' : 'Subir archivo'}
                </button>
                {type === 'PRODUCT' && media && (
                  <button onClick={() => setMedia(null)} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white">
                    <RotateCcw size={14} /> Usar la foto del catálogo
                  </button>
                )}
              </div>
              {media?.status === 'PROCESSING' && (
                <p className="mt-2 flex items-center gap-2 text-sm text-amber-300"><Loader2 size={14} className="animate-spin" /> {media.kind === 'VIDEO' ? 'Comprimiendo el video en el servidor… puedes guardar y seguir; aparecerá en el tótem cuando termine.' : 'Procesando…'}</p>
              )}
              {media?.status === 'FAILED' && <p className="mt-2 text-sm text-red-400">{media.error || 'No se pudo procesar el archivo'}</p>}
              {media?.status === 'READY' && media.width && media.height && media.width > media.height && (
                <p className="mt-2 text-xs text-amber-300">Es horizontal: en el TV se verá centrado sobre un fondo desenfocado. Para llenar la pantalla usa 1080×1920 vertical.</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Nombre (solo para ti)</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Ej: Cashea baja de inicial" className="input-field !py-2 text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Desde (opcional)</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field !py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Hasta (opcional)</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input-field !py-2 text-sm" />
              </div>
              {type !== 'VIDEO' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Segundos en pantalla</label>
                  <input type="number" min={3} max={120} value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))} className="input-field !py-2 text-sm" />
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500">Con fecha “hasta”, el anuncio deja de salir solo al terminar ese día y queda marcado como vencido para borrarlo.</p>

            {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={save} disabled={saving || progress !== null} className="btn-primary flex items-center gap-2 text-sm">
                {saving && <Loader2 size={16} className="animate-spin" />} Guardar
              </button>
            </div>
          </div>

          {/* Vista previa vertical, como se ve en el TV de 32" */}
          <div>
            <p className="mb-1 text-xs font-medium text-slate-400">Vista previa</p>
            <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border-4 border-slate-800 bg-[#06132b]">
              {type === 'PRODUCT' ? (
                <div className="absolute inset-0 flex flex-col items-center p-3 text-white" style={{ background: 'radial-gradient(120% 70% at 50% 18%, #1b3f7a 0%, #0c2148 45%, #06132b 100%)' }}>
                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-amber-950">Disponible en tienda</span>
                  <div className="mt-2 flex min-h-0 w-full flex-1 items-center justify-center rounded-xl bg-white p-2">
                    {productImg ? <img src={productImg} alt="" className="h-full w-full object-contain" /> : <ImageOff className="text-slate-300" />}
                  </div>
                  <p className="mt-2 line-clamp-2 text-center text-sm font-bold leading-tight">{product?.name ?? 'Producto'}</p>
                  <p className="text-3xl font-extrabold text-emerald-300">{product?.price || '$0.00'} <span className="text-xs text-emerald-100/80">BCV</span></p>
                  <div className="h-8" />
                </div>
              ) : previewUrl ? (
                <>
                  <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-xl" />
                  {media?.kind === 'VIDEO'
                    ? <video src={media.url ?? undefined} poster={media.thumbUrl ?? undefined} controls playsInline className="absolute inset-0 h-full w-full object-contain" />
                    : <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />}
                </>
              ) : (
                <div className="flex h-full items-center justify-center p-4 text-center text-xs text-slate-500">Sube un archivo para verlo aquí</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
