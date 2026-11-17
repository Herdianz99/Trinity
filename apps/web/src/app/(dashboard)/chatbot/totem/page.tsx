'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Tv, Loader2, Plus, ArrowUp, ArrowDown, Pause, Play, Pencil, Trash2, Film, Image as ImageIcon, Package,
  Upload, Save, AlertTriangle, HardDrive, ImageOff, X,
} from 'lucide-react';
import AdEditor, { TotemAdRow } from './ad-editor';
import { TotemMedia, fmtBytes, uploadTotemFile } from './totem-upload';

interface Config { idleSeconds: number; showCallToAction: boolean; introMediaId: string | null; introMedia: TotemMedia | null }
interface MediaRow extends TotemMedia {
  isIntro: boolean;
  usage: 'INTRO' | 'UNUSED' | 'EXPIRED' | 'IN_USE';
  ads: { id: string; title: string; isActive: boolean; expired: boolean }[];
}
interface MediaList { files: MediaRow[]; totalBytes: number; expired: { ads: number; bytes: number }; unused: { files: number; bytes: number } }

const STATUS: Record<TotemAdRow['status'], { label: string; cls: string }> = {
  ACTIVE: { label: 'En pantalla', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  PAUSED: { label: 'Pausado', cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  SCHEDULED: { label: 'Programado', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  EXPIRED: { label: 'Vencido', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  PROCESSING: { label: 'Procesando…', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  FAILED: { label: 'Error en archivo', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
  SOLD_OUT: { label: 'Agotado: no sale', cls: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  NO_MEDIA: { label: 'Sin archivo', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
};
const TYPE_ICON = { IMAGE: <ImageIcon size={14} />, VIDEO: <Film size={14} />, PRODUCT: <Package size={14} /> };
const TYPE_LABEL = { IMAGE: 'Imagen', VIDEO: 'Video', PRODUCT: 'Producto' };
const USAGE: Record<MediaRow['usage'], { label: string; cls: string }> = {
  INTRO: { label: 'Presentación', cls: 'text-sky-300' },
  IN_USE: { label: 'En uso', cls: 'text-emerald-300' },
  EXPIRED: { label: 'Vencida', cls: 'text-rose-300' },
  UNUSED: { label: 'Sin usar', cls: 'text-amber-300' },
};

const fmtDate = (s: string | null) => (s ? s.split('-').reverse().join('/') : '');

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy/totem/admin/${path}`, {
    ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Error');
  return data as T;
}

export default function TotemConfigPage() {
  const [tab, setTab] = useState<'ads' | 'files' | 'settings'>('ads');
  const [ads, setAds] = useState<TotemAdRow[] | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [media, setMedia] = useState<MediaList | null>(null);
  const [editing, setEditing] = useState<TotemAdRow | 'new' | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [introProgress, setIntroProgress] = useState<number | null>(null);
  const introRef = useRef<HTMLInputElement>(null);

  useEffect(() => { document.title = 'Tótem Clover | Trinity ERP'; }, []);

  const loadAll = useCallback(async () => {
    const [a, c, m] = await Promise.all([api<TotemAdRow[]>('ads'), api<Config>('config'), api<MediaList>('media')]);
    setAds(a); setCfg(c); setMedia(m);
  }, []);
  useEffect(() => { loadAll().catch((e) => setMsg({ type: 'error', text: e.message })); }, [loadAll]);

  // Mientras haya videos comprimiendose, refrescar cada 4 s.
  const processing = !!media?.files.some((f) => f.status === 'PROCESSING');
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => { loadAll().catch(() => undefined); }, 4000);
    return () => clearInterval(t);
  }, [processing, loadAll]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (ok) setMsg({ type: 'success', text: ok }); } catch (e) { setMsg({ type: 'error', text: (e as Error).message }); }
    finally { setBusy(false); }
  };

  const move = (i: number, dir: -1 | 1) => run(async () => {
    if (!ads) return;
    const ids = ads.map((a) => a.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setAds(await api<TotemAdRow[]>('ads/reorder', { method: 'POST', body: JSON.stringify({ ids }) }));
  });

  const toggle = (a: TotemAdRow) => run(async () => {
    setAds(await api<TotemAdRow[]>(`ads/${a.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !a.isActive }) }));
  });

  const removeAd = (a: TotemAdRow) => {
    if (!confirm(`¿Eliminar el anuncio "${a.title}"? Su archivo también se borra.`)) return;
    run(async () => { setAds(await api<TotemAdRow[]>(`ads/${a.id}`, { method: 'DELETE' })); setMedia(await api<MediaList>('media')); }, 'Anuncio eliminado');
  };

  const saveConfig = (patch: Partial<Config>) => run(async () => {
    setCfg(await api<Config>('config', { method: 'PATCH', body: JSON.stringify(patch) }));
    setMedia(await api<MediaList>('media'));
  }, 'Ajustes guardados');

  const uploadIntro = async (file: File) => {
    setMsg(null); setIntroProgress(0);
    try {
      const m = await uploadTotemFile(file, setIntroProgress);
      setCfg(await api<Config>('config', { method: 'PATCH', body: JSON.stringify({ introMediaId: m.id }) }));
      setMedia(await api<MediaList>('media'));
      setMsg({ type: 'success', text: 'Video de presentación subido. Se está comprimiendo; aparecerá en el tótem cuando termine.' });
    } catch (e) { setMsg({ type: 'error', text: (e as Error).message }); }
    finally { setIntroProgress(null); }
  };

  const deleteFiles = (ids: string[]) => {
    const rows = media?.files.filter((f) => ids.includes(f.id)) ?? [];
    const affected = rows.flatMap((r) => r.ads.filter((a) => !a.expired).map((a) => a.title));
    const intro = rows.some((r) => r.isIntro);
    const warn = [
      `¿Eliminar ${rows.length} archivo(s) (${fmtBytes(rows.reduce((s, r) => s + r.bytes, 0))})?`,
      affected.length ? `\nSe quitan también estos anuncios: ${affected.join(', ')}.` : '',
      intro ? '\nIncluye el video de presentación de Clover.' : '',
    ].join('');
    if (!confirm(warn)) return;
    run(async () => {
      const r = await api<{ deleted: number; bytes: number }>('media/delete', { method: 'POST', body: JSON.stringify({ ids }) });
      setSelected(new Set());
      await loadAll();
      setMsg({ type: 'success', text: `Se eliminaron ${r.deleted} archivo(s), ${fmtBytes(r.bytes)} liberados.` });
    });
  };

  const cleanupExpired = () => {
    if (!media || !confirm(`¿Eliminar los ${media.expired.ads} anuncio(s) vencido(s) y sus archivos?`)) return;
    run(async () => {
      const r = await api<{ ads: number; bytes: number }>('media/cleanup-expired', { method: 'POST' });
      await loadAll();
      setMsg({ type: 'success', text: `Se eliminaron ${r.ads} anuncio(s) vencido(s), ${fmtBytes(r.bytes)} liberados.` });
    });
  };

  if (!ads || !cfg || !media) {
    return <div className="flex justify-center py-20">{msg ? <p className="text-red-400">{msg.text}</p> : <Loader2 className="animate-spin text-green-500" size={28} />}</div>;
  }

  const onScreen = ads.filter((a) => a.status === 'ACTIVE').length;

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5"><Tv className="text-emerald-400" size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-white">Tótem Clover</h1>
            <p className="text-sm text-slate-400">Lo que pasa la pantalla cuando nadie la usa · {onScreen} anuncio(s) en pantalla</p>
          </div>
        </div>
        {tab === 'ads' && (
          <button onClick={() => setEditing('new')} className="btn-primary flex items-center gap-2"><Plus size={18} /> Nuevo anuncio</button>
        )}
      </div>

      <div className="mb-4 flex gap-1 border-b border-slate-800">
        {([['ads', 'Anuncios'], ['files', `Archivos · ${fmtBytes(media.totalBytes)}`], ['settings', 'Ajustes']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? 'border-emerald-500 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`mb-4 flex items-start justify-between gap-2 rounded-lg border p-3 text-sm ${msg.type === 'success' ? 'border-green-500/20 bg-green-500/10 text-green-400' : 'border-red-500/20 bg-red-500/10 text-red-400'}`}>
          {msg.text}
          <button onClick={() => setMsg(null)}><X size={14} /></button>
        </div>
      )}

      {media.expired.ads > 0 && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2"><AlertTriangle size={16} /> Tienes {media.expired.ads} publicidad(es) vencida(s){media.expired.bytes ? ` (${fmtBytes(media.expired.bytes)})` : ''}. Ya no salen en el tótem.</span>
          <button onClick={cleanupExpired} disabled={busy} className="rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-500">Eliminar vencidas</button>
        </div>
      )}

      {tab === 'ads' && (
        <div className="space-y-2">
          {ads.length === 0 && (
            <div className="card p-10 text-center text-slate-400">
              Todavía no hay anuncios. Crea uno con <b className="text-white">Nuevo anuncio</b>: una imagen tuya, un video o un producto con su precio.
            </div>
          )}
          {ads.map((a, i) => {
            const thumb = a.media?.status === 'READY' ? a.media.thumbUrl : a.type === 'PRODUCT' ? a.product?.imageUrl : null;
            const st = STATUS[a.status];
            return (
              <div key={a.id} className={`card flex items-center gap-3 p-3 ${a.status === 'ACTIVE' ? '' : 'opacity-80'}`}>
                <div className="flex flex-col">
                  <button onClick={() => move(i, -1)} disabled={busy || i === 0} className="p-1 text-slate-400 hover:text-white disabled:opacity-30" title="Subir"><ArrowUp size={16} /></button>
                  <button onClick={() => move(i, 1)} disabled={busy || i === ads.length - 1} className="p-1 text-slate-400 hover:text-white disabled:opacity-30" title="Bajar"><ArrowDown size={16} /></button>
                </div>
                <div className="flex aspect-[9/16] w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-800">
                  {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <ImageOff size={16} className="text-slate-600" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{a.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1">{TYPE_ICON[a.type]} {TYPE_LABEL[a.type]}</span>
                    {a.type === 'PRODUCT' && a.product && <span className="font-semibold text-emerald-300">{a.product.price} BCV</span>}
                    {a.type === 'VIDEO' && a.media?.durationSec ? <span>{Math.round(a.media.durationSec)} s</span> : a.type !== 'VIDEO' ? <span>{a.durationSec} s</span> : null}
                    {(a.startDate || a.endDate) && (
                      <span>{a.startDate ? `desde ${fmtDate(a.startDate)}` : ''}{a.startDate && a.endDate ? ' ' : ''}{a.endDate ? `hasta ${fmtDate(a.endDate)}` : ''}</span>
                    )}
                  </div>
                </div>
                <span className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-xs sm:inline ${st.cls}`}>{st.label}</span>
                <div className="flex shrink-0 items-center">
                  <button onClick={() => toggle(a)} disabled={busy} className="p-2 text-slate-400 hover:text-white" title={a.isActive ? 'Pausar' : 'Activar'}>
                    {a.isActive ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button onClick={() => setEditing(a)} className="p-2 text-slate-400 hover:text-white" title="Editar"><Pencil size={16} /></button>
                  <button onClick={() => removeAd(a)} disabled={busy} className="p-2 text-slate-400 hover:text-red-400" title="Eliminar"><Trash2 size={16} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'files' && (
        <div className="space-y-3">
          <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <HardDrive className="text-slate-400" size={20} />
              <div>
                <p className="font-semibold text-white">{fmtBytes(media.totalBytes)} en {media.files.length} archivo(s)</p>
                <p className="text-xs text-slate-400">Solo los archivos del tótem (no incluye fotos de productos ni otros módulos).</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {media.unused.files > 0 && (
                <button
                  onClick={() => deleteFiles(media.files.filter((f) => f.usage === 'UNUSED' && f.status !== 'PROCESSING').map((f) => f.id))}
                  disabled={busy}
                  className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-500/10"
                >
                  Eliminar sin usar ({media.unused.files} · {fmtBytes(media.unused.bytes)})
                </button>
              )}
              {selected.size > 0 && (
                <button onClick={() => deleteFiles(Array.from(selected))} disabled={busy} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500">
                  Eliminar seleccionados ({selected.size})
                </button>
              )}
            </div>
          </div>

          {media.files.length === 0 && <div className="card p-8 text-center text-slate-400">No hay archivos subidos.</div>}
          {media.files.map((f) => (
            <label key={f.id} className="card flex cursor-pointer items-center gap-3 p-3">
              <input
                type="checkbox"
                disabled={f.status === 'PROCESSING'}
                checked={selected.has(f.id)}
                onChange={(e) => setSelected((prev) => { const n = new Set(prev); if (e.target.checked) n.add(f.id); else n.delete(f.id); return n; })}
                className="h-4 w-4 accent-red-500"
              />
              <div className="flex aspect-[9/16] w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-800">
                {f.thumbUrl ? <img src={f.thumbUrl} alt="" className="h-full w-full object-cover" /> : <ImageOff size={14} className="text-slate-600" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{f.originalName || f.id}</p>
                <p className="text-xs text-slate-400">
                  {f.kind === 'VIDEO' ? 'Video' : 'Imagen'} · {f.status === 'READY' ? fmtBytes(f.bytes) : f.status === 'PROCESSING' ? 'procesando…' : <span className="text-red-400">{f.error || 'error'}</span>}
                  {f.width && f.height ? ` · ${f.width}×${f.height}` : ''}
                  {f.durationSec ? ` · ${Math.round(f.durationSec)} s` : ''}
                  {' · '}{new Date(f.createdAt).toLocaleDateString('es-VE')}
                </p>
                {f.ads.length > 0 && <p className="truncate text-xs text-slate-500">Anuncio: {f.ads.map((a) => a.title).join(', ')}</p>}
              </div>
              <span className={`shrink-0 text-xs font-semibold ${USAGE[f.usage].cls}`}>{USAGE[f.usage].label}</span>
            </label>
          ))}
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-300">Modo espera</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Segundos sin uso para empezar la publicidad</label>
                <input type="number" min={10} max={3600} value={cfg.idleSeconds} onChange={(e) => setCfg({ ...cfg, idleSeconds: Number(e.target.value) })} className="input-field !py-2 text-sm" />
              </div>
              <label className="flex cursor-pointer items-center gap-3 md:mt-5">
                <input type="checkbox" checked={cfg.showCallToAction} onChange={(e) => setCfg({ ...cfg, showCallToAction: e.target.checked })} className="h-4 w-4 accent-green-500" />
                <span className="text-sm text-white">Mostrar “¡Toca la pantalla y pregúntale a Clover!” sobre la publicidad</span>
              </label>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => saveConfig({ idleSeconds: cfg.idleSeconds, showCallToAction: cfg.showCallToAction })} disabled={busy} className="btn-primary flex items-center gap-2 text-sm">
                <Save size={16} /> Guardar
              </button>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-slate-300">Video de presentación de Clover</h2>
            <p className="mb-4 text-xs text-slate-500">Sale primero y entre cada vuelta de anuncios: presentación → anuncios → presentación… Ideal vertical 1080×1920, máximo 2 minutos.</p>
            <input ref={introRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadIntro(f); }} />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="relative aspect-[9/16] w-36 shrink-0 overflow-hidden rounded-xl border-4 border-slate-800 bg-[#06132b]">
                {cfg.introMedia?.status === 'READY' && cfg.introMedia.url
                  ? <video src={cfg.introMedia.url} poster={cfg.introMedia.thumbUrl ?? undefined} controls playsInline className="h-full w-full object-contain" />
                  : <div className="flex h-full items-center justify-center p-2 text-center text-xs text-slate-500">
                      {cfg.introMedia?.status === 'PROCESSING' ? <Loader2 className="animate-spin text-amber-300" /> : 'Sin video'}
                    </div>}
              </div>
              <div className="space-y-2 text-sm">
                {cfg.introMedia?.status === 'PROCESSING' && <p className="text-amber-300">Comprimiendo el video en el servidor…</p>}
                {cfg.introMedia?.status === 'FAILED' && <p className="text-red-400">{cfg.introMedia.error || 'No se pudo procesar el video'}</p>}
                {cfg.introMedia?.status === 'READY' && <p className="text-slate-400">{fmtBytes(cfg.introMedia.bytes)} · {Math.round(cfg.introMedia.durationSec ?? 0)} s</p>}
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => introRef.current?.click()} disabled={introProgress !== null} className="btn-secondary flex items-center gap-2 text-sm">
                    {introProgress !== null ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    {introProgress !== null ? `Subiendo… ${introProgress}%` : cfg.introMedia ? 'Cambiar video' : 'Subir video'}
                  </button>
                  {cfg.introMedia && (
                    <button onClick={() => confirm('¿Quitar el video de presentación? El archivo se borra.') && saveConfig({ introMediaId: null })} disabled={busy} className="flex items-center gap-1 text-sm text-slate-400 hover:text-red-400">
                      <Trash2 size={14} /> Quitar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="card p-5 text-sm text-slate-400">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-300">Usuario del TV</h2>
            En Configuración → Usuarios crea un usuario con el rol <b className="text-white">Tótem Clover (pantalla)</b>. Al iniciar sesión con él, el TV entra directo
            a la pantalla de Clover, sin menú ni acceso a nada más, y la sesión no se cierra sola.
          </section>
        </div>
      )}

      {editing && (
        <AdEditor
          ad={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(rows) => { setAds(rows); setEditing(null); api<MediaList>('media').then(setMedia).catch(() => undefined); setMsg({ type: 'success', text: 'Anuncio guardado' }); }}
        />
      )}
    </div>
  );
}
