'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Megaphone,
  Image as ImageIcon,
  Plus,
  Save,
  Trash2,
  Loader2,
  Upload,
  Eye,
  EyeOff,
  GripVertical,
} from 'lucide-react';

type Banner = {
  id: string;
  placement: string; // 'HERO' | 'PROMO'
  title: string;
  subtitle: string | null;
  tag: string | null;
  imageKey: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  sortOrder: number;
  isActive: boolean;
};

// Reduce la imagen en el navegador antes de subirla (ancho máx 1600) y la devuelve como data URI.
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
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

export default function StorePersonalizationPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    document.title = 'Personalización de tienda | Trinity ERP';
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/store-banners');
      if (!res.ok) throw new Error('No se pudieron cargar los banners');
      setBanners(await res.json());
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createBanner(placement: 'HERO' | 'PROMO') {
    try {
      const res = await fetch('/api/proxy/store-banners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placement,
          title: placement === 'HERO' ? 'Nuevo banner' : 'Nueva oferta',
          isActive: false,
        }),
      });
      if (!res.ok) throw new Error('No se pudo crear el banner');
      setMsg({ type: 'ok', text: 'Banner creado. Edita su contenido y actívalo cuando esté listo.' });
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    }
  }

  const hero = banners.filter((b) => b.placement === 'HERO');
  const promo = banners.filter((b) => b.placement === 'PROMO');

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Megaphone className="text-brand-500" size={26} />
        <h1 className="text-2xl font-bold">Personalización de tienda</h1>
      </div>
      <p className="text-sm text-slate-400 mb-6">
        Administra los banners del carrusel principal (hero) y la franja de oferta de la tienda online.
        Los cambios se publican solos (~1 minuto) sin necesidad de despliegue.
      </p>

      {msg && (
        <div
          className={`mb-4 p-3 rounded-lg border text-sm ${
            msg.type === 'ok'
              ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-10">
          <Loader2 className="animate-spin" size={18} /> Cargando…
        </div>
      ) : (
        <div className="space-y-8">
          {/* HERO */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold">Carrusel principal (Hero)</h2>
                <p className="text-xs text-slate-400">
                  Las diapositivas grandes al inicio de la tienda. Se muestran en orden.
                </p>
              </div>
              <button onClick={() => createBanner('HERO')} className="btn-secondary !py-2 text-sm flex items-center gap-2">
                <Plus size={16} /> Agregar diapositiva
              </button>
            </div>
            {hero.length === 0 ? (
              <EmptyHint text="Sin diapositivas. Si no agregas ninguna, la tienda muestra sus imágenes por defecto." />
            ) : (
              <div className="space-y-4">
                {hero.map((b) => (
                  <BannerEditor key={b.id} banner={b} onChanged={load} setMsg={setMsg} />
                ))}
              </div>
            )}
          </section>

          {/* PROMO */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold">Franja de oferta</h2>
                <p className="text-xs text-slate-400">
                  La franja destacada tipo &quot;Oferta del mes&quot;. Se muestra la primera activa.
                </p>
              </div>
              <button onClick={() => createBanner('PROMO')} className="btn-secondary !py-2 text-sm flex items-center gap-2">
                <Plus size={16} /> Agregar franja
              </button>
            </div>
            {promo.length === 0 ? (
              <EmptyHint text="Sin franja de oferta. Si no agregas ninguna, la tienda muestra su promo por defecto." />
            ) : (
              <div className="space-y-4">
                {promo.map((b) => (
                  <BannerEditor key={b.id} banner={b} onChanged={load} setMsg={setMsg} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="card p-4 text-sm text-slate-400 border-dashed">{text}</div>
  );
}

function BannerEditor({
  banner,
  onChanged,
  setMsg,
}: {
  banner: Banner;
  onChanged: () => void | Promise<void>;
  setMsg: (m: { type: 'ok' | 'err'; text: string } | null) => void;
}) {
  const [form, setForm] = useState<Banner>(banner);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isPromo = form.placement === 'PROMO';

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/proxy/store-banners/${form.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          subtitle: form.subtitle,
          tag: form.tag,
          linkUrl: form.linkUrl,
          linkLabel: form.linkLabel,
          sortOrder: Number(form.sortOrder) || 0,
          isActive: form.isActive,
        }),
      });
      if (!res.ok) throw new Error('No se pudo guardar');
      setMsg({ type: 'ok', text: 'Banner guardado.' });
      onChanged();
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm('¿Eliminar este banner? Esta acción no se puede deshacer.')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/proxy/store-banners/${form.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo eliminar');
      setMsg({ type: 'ok', text: 'Banner eliminado.' });
      onChanged();
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
      setDeleting(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setMsg(null);
    try {
      const dataUri = await downscaleToDataUri(file);
      const res = await fetch(`/api/proxy/store-banners/${form.id}/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUri }),
      });
      if (!res.ok) throw new Error('No se pudo subir la imagen');
      const updated: Banner = await res.json();
      setForm((f) => ({ ...f, imageKey: updated.imageKey, imageUrl: updated.imageUrl }));
      setMsg({ type: 'ok', text: 'Imagen actualizada.' });
      onChanged();
    } catch (err) {
      setMsg({ type: 'err', text: (err as Error).message });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={`card p-4 ${form.isActive ? '' : 'opacity-70'}`}>
      <div className="flex flex-col md:flex-row gap-4">
        {/* Preview / imagen */}
        <div className="md:w-64 flex-shrink-0">
          <div className="relative aspect-[16/9] rounded-lg overflow-hidden bg-slate-800 flex items-center justify-center">
            {form.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.imageUrl} alt={form.title} className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-1 text-slate-500 text-xs">
                <ImageIcon size={24} />
                {isPromo ? 'Imagen opcional' : 'Sin imagen'}
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="btn-secondary !py-1.5 text-xs w-full mt-2 flex items-center justify-center gap-2"
          >
            {uploading ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
            {form.imageUrl ? 'Cambiar imagen' : 'Subir imagen'}
          </button>
        </div>

        {/* Campos */}
        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Etiqueta (tag)">
              <input
                className="input-field !py-2 text-sm"
                value={form.tag ?? ''}
                placeholder={isPromo ? 'Oferta del mes' : 'Herramientas eléctricas'}
                onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))}
              />
            </Field>
            <Field label="Orden">
              <div className="flex items-center gap-2">
                <GripVertical size={16} className="text-slate-500" />
                <input
                  type="number"
                  className="input-field !py-2 text-sm"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                />
              </div>
            </Field>
          </div>

          <Field label="Título *">
            <input
              className="input-field !py-2 text-sm"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </Field>

          <Field label="Subtítulo">
            <textarea
              className="input-field !py-2 text-sm"
              rows={2}
              value={form.subtitle ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Enlace del botón (URL)">
              <input
                className="input-field !py-2 text-sm"
                value={form.linkUrl ?? ''}
                placeholder="/ofertas o /categorias/herramientas-electricas"
                onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
              />
            </Field>
            <Field label="Texto del botón">
              <input
                className="input-field !py-2 text-sm"
                value={form.linkLabel ?? ''}
                placeholder="Ver oferta"
                onChange={(e) => setForm((f) => ({ ...f, linkLabel: e.target.value }))}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
            <button
              onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
              className={`flex items-center gap-2 text-sm font-medium ${
                form.isActive ? 'text-green-400' : 'text-slate-400'
              }`}
            >
              {form.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
              {form.isActive ? 'Visible en la tienda' : 'Oculto'}
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={remove}
                disabled={deleting}
                className="btn-secondary !py-2 text-sm flex items-center gap-2 text-red-400 hover:text-red-300"
              >
                {deleting ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                Eliminar
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="btn-primary !py-2 text-sm flex items-center gap-2"
              >
                {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
