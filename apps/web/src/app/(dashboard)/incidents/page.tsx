'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Shield, AlertTriangle, Loader2, Plus, X, Search, ChevronLeft, ChevronRight,
  FileText, FileSpreadsheet, ChevronDown, ImagePlus, ImageIcon,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

interface IncidentType { id: string; name: string; }
interface Incident {
  id: string;
  number: string;
  type: { id: string; name: string } | null;
  description: string;
  involvedName: string | null;
  severity: string;
  occurredAt: string;
  createdBy: { name: string } | null;
  photos: { id: string; thumbUrl: string; mediumUrl: string }[];
}
interface Summary {
  total: number;
  byType: { name: string; count: number }[];
  bySeverity: Record<string, number>;
}

const SEVERITY_LABELS: Record<string, string> = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta' };
const SEVERITY_BADGE: Record<string, string> = {
  LOW: 'bg-green-500/10 text-green-400 border-green-500/30',
  MEDIUM: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  HIGH: 'bg-red-500/10 text-red-400 border-red-500/30',
};
const BAR_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#ec4899', '#64748b'];

function nowLocalDatetime() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [types, setTypes] = useState<IncidentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [typeId, setTypeId] = useState('');
  const [severity, setSeverity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ typeId: '', severity: 'MEDIUM', involvedName: '', occurredAt: '', description: '' });
  const [photos, setPhotos] = useState<string[]>([]); // data URIs de las fotos a subir (varias)
  const [photoErr, setPhotoErr] = useState('');
  const MAX_PHOTOS = 8;
  const [lightbox, setLightbox] = useState<string | null>(null); // URL medium en el lightbox

  useEffect(() => { document.title = 'Incidencias | Trinity ERP'; }, []);

  function buildParams() {
    const params = new URLSearchParams();
    if (typeId) params.set('typeId', typeId);
    if (severity) params.set('severity', severity);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (search) params.set('search', search);
    return params;
  }

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildParams();
      params.set('page', String(page));
      params.set('limit', '25');
      const res = await fetch(`/api/proxy/incidents?${params}`);
      const data = await res.json();
      setIncidents(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(Math.max(1, Math.ceil((data.total || 0) / 25)));
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar incidencias' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, typeId, severity, from, to, search]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`/api/proxy/incidents/summary?${buildParams()}`);
      if (res.ok) setSummary(await res.json());
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeId, severity, from, to, search]);

  const fetchTypes = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/incidents/types/active');
      const data = await res.json();
      setTypes(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);
  useEffect(() => { fetchIncidents(); }, [fetchIncidents]);
  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchTypes(); }, [fetchTypes]);
  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 4000); return () => clearTimeout(t); }
  }, [message]);

  function openCreate() {
    setForm({ typeId: types[0]?.id || '', severity: 'MEDIUM', involvedName: '', occurredAt: nowLocalDatetime(), description: '' });
    setPhotos([]);
    setPhotoErr('');
    setModalOpen(true);
  }

  // Comprime/redimensiona la imagen EN EL NAVEGADOR antes de subir: la foto de un celular
  // pesa 3-8 MB, aca queda en ~300-500 KB. Sube rapido y no choca con limites de tamano.
  // imageOrientation 'from-image' respeta la orientacion EXIF (si no, saldria rotada).
  async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<string> {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    let { width, height } = bitmap;
    if (width > maxDim || height > maxDim) {
      const scale = Math.min(maxDim / width, maxDim / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo procesar la imagen');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    return canvas.toDataURL('image/jpeg', quality);
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // permite re-seleccionar el mismo archivo
    if (!files.length) return;
    setPhotoErr('');
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) { setPhotoErr(`Máximo ${MAX_PHOTOS} fotos por incidencia`); return; }
    const toAdd = files.slice(0, room);
    if (files.length > room) setPhotoErr(`Solo se agregaron ${room}; el máximo es ${MAX_PHOTOS} fotos`);
    const compressed: string[] = [];
    for (const file of toAdd) {
      if (!file.type.startsWith('image/')) { setPhotoErr('Todos los archivos deben ser imágenes'); continue; }
      if (file.size > 25 * 1024 * 1024) { setPhotoErr('Cada imagen debe pesar menos de 25 MB'); continue; }
      try {
        compressed.push(await compressImage(file));
      } catch {
        setPhotoErr('No se pudo procesar una de las imágenes');
      }
    }
    if (compressed.length) setPhotos((prev) => [...prev, ...compressed]);
  }

  async function submit() {
    if (!form.typeId || !form.description.trim()) {
      setMessage({ type: 'error', text: 'Selecciona el tipo y escribe la observación' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/proxy/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          typeId: form.typeId,
          description: form.description.trim(),
          involvedName: form.involvedName.trim() || undefined,
          severity: form.severity,
          // datetime-local es hora Caracas -> le agrego el offset -04:00 para el instante correcto
          occurredAt: form.occurredAt ? `${form.occurredAt}:00-04:00` : undefined,
          photos: photos.length ? photos : undefined,
        }),
      });
      if (!res.ok) {
        // El servidor puede devolver JSON (error de la app) o HTML (ej. 413 de nginx). No asumir JSON.
        let msg = 'Error al registrar';
        try { const err = await res.json(); msg = err.message || msg; }
        catch { msg = res.status === 413 ? 'La imagen es demasiado pesada, intenta con otra' : `Error del servidor (${res.status})`; }
        throw new Error(msg);
      }
      setMessage({ type: 'success', text: 'Incidencia registrada' });
      setModalOpen(false);
      setPage(1);
      fetchIncidents();
      fetchSummary();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('es-VE', { timeZone: 'America/Caracas' });
  const openReport = (kind: 'pdf' | 'xlsx') => window.open(`/api/proxy/incidents/report/${kind}?${buildParams()}`, '_blank');

  const chartData = (summary?.byType || []).slice(0, 12);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <Shield className="text-red-400" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Incidencias</h1>
            <p className="text-sm text-slate-400">{total} registrada{total !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors">
                <FileText size={16} /> <span className="hidden sm:inline">Reportes</span> <ChevronDown size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700 text-slate-200 min-w-[220px]">
              <DropdownMenuItem onClick={() => openReport('pdf')} className="cursor-pointer text-slate-200 focus:bg-slate-700 focus:text-white gap-2">
                <FileText size={14} /> PDF por tipo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openReport('xlsx')} className="cursor-pointer text-slate-200 focus:bg-slate-700 focus:text-white gap-2">
                <FileSpreadsheet size={14} /> Exportar Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button onClick={openCreate}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors">
            <Plus size={16} /> Registrar<span className="hidden sm:inline"> incidencia</span>
          </button>
        </div>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-xl border text-sm font-medium ${message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
          {message.text}
        </div>
      )}

      {/* KPIs + gráfica */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Total', value: summary?.total ?? 0, cls: 'text-slate-100' },
            { label: 'Alta', value: summary?.bySeverity?.HIGH ?? 0, cls: 'text-red-400' },
            { label: 'Media', value: summary?.bySeverity?.MEDIUM ?? 0, cls: 'text-amber-400' },
            { label: 'Baja', value: summary?.bySeverity?.LOW ?? 0, cls: 'text-green-400' },
          ].map((k) => (
            <div key={k.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <p className="text-xs text-slate-400 mb-1">{k.label}</p>
              <p className={`text-2xl font-bold ${k.cls}`}>{k.value}</p>
            </div>
          ))}
        </div>
        <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <p className="text-sm text-slate-300 font-medium mb-2">Incidencias por tipo</p>
          {chartData.length === 0 ? (
            <div className="h-[180px] flex items-center justify-center text-slate-500 text-sm">Sin datos en el período</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }} cursor={{ fill: 'rgba(148,163,184,0.1)' }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por observación, involucrado o N°"
            className="w-full bg-slate-700 border border-slate-600 text-slate-200 rounded-lg pl-9 pr-9 py-2 text-sm placeholder:text-slate-500" />
          {searchInput && <button onClick={() => setSearchInput('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"><X size={16} /></button>}
        </div>
        <select value={typeId} onChange={(e) => { setTypeId(e.target.value); setPage(1); }} className="flex-1 min-w-[130px] bg-slate-700 border border-slate-600 text-slate-200 rounded-lg px-3 py-2 text-sm">
          <option value="">Todos los tipos</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }} className="flex-1 min-w-[130px] bg-slate-700 border border-slate-600 text-slate-200 rounded-lg px-3 py-2 text-sm">
          <option value="">Toda gravedad</option>
          <option value="HIGH">Alta</option>
          <option value="MEDIUM">Media</option>
          <option value="LOW">Baja</option>
        </select>
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="flex-1 min-w-[130px] bg-slate-700 border border-slate-600 text-slate-200 rounded-lg px-3 py-2 text-sm" />
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="flex-1 min-w-[130px] bg-slate-700 border border-slate-600 text-slate-200 rounded-lg px-3 py-2 text-sm" />
        {(typeId || severity || from || to || searchInput) && (
          <button onClick={() => { setTypeId(''); setSeverity(''); setFrom(''); setTo(''); setSearchInput(''); setPage(1); }} className="text-xs text-slate-400 hover:text-white">Limpiar</button>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-red-400" size={30} /></div>
        ) : incidents.length === 0 ? (
          <div className="text-center py-16 text-slate-400">No hay incidencias registradas</div>
        ) : (
          <>
            {/* Móvil: tarjetas */}
            <div className="sm:hidden divide-y divide-slate-700/40">
              {incidents.map((i) => (
                <div key={i.id} className="p-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-white">{i.number}</span>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${SEVERITY_BADGE[i.severity] || ''}`}>{SEVERITY_LABELS[i.severity] || i.severity}</span>
                  </div>
                  <div className="text-xs text-slate-400">{fmtDateTime(i.occurredAt)}</div>
                  <div className="text-sm text-slate-200"><span className="text-slate-500">Tipo:</span> {i.type?.name || '—'}</div>
                  {i.involvedName && <div className="text-sm text-slate-300"><span className="text-slate-500">Involucrado:</span> {i.involvedName}</div>}
                  <div className="text-sm text-slate-300 whitespace-pre-wrap break-words">{i.description}</div>
                  {i.photos?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {i.photos.map((p) => (
                        <button key={p.id} type="button" onClick={() => setLightbox(p.mediumUrl)}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.thumbUrl} alt={`Foto ${i.number}`} className="h-16 w-16 object-cover rounded-lg border border-slate-700" />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500">Registró: {i.createdBy?.name || '—'}</div>
                </div>
              ))}
            </div>
            {/* Escritorio: tabla */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">N°</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha / hora</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Tipo</th>
                    <th className="text-center px-4 py-3 text-slate-400 font-medium">Gravedad</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Involucrado</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Observación</th>
                    <th className="text-center px-4 py-3 text-slate-400 font-medium">Foto</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Registró</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((i) => (
                    <tr key={i.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors align-top">
                      <td className="px-4 py-3 text-white font-mono text-xs whitespace-nowrap">{i.number}</td>
                      <td className="px-4 py-3 text-slate-300 text-xs whitespace-nowrap">{fmtDateTime(i.occurredAt)}</td>
                      <td className="px-4 py-3 text-slate-200">{i.type?.name || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${SEVERITY_BADGE[i.severity] || ''}`}>{SEVERITY_LABELS[i.severity] || i.severity}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{i.involvedName || '—'}</td>
                      <td className="px-4 py-3 text-slate-300 max-w-[360px]">{i.description}</td>
                      <td className="px-4 py-3">
                        {i.photos?.length > 0 ? (
                          <div className="flex flex-wrap gap-1 justify-center max-w-[120px] mx-auto">
                            {i.photos.map((p) => (
                              <button key={p.id} type="button" onClick={() => setLightbox(p.mediumUrl)} title="Ver foto">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={p.thumbUrl} alt={`Foto ${i.number}`} className="h-9 w-9 object-cover rounded-md border border-slate-700 hover:border-red-400 transition-colors" />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <ImageIcon size={16} className="text-slate-600 inline-block mx-auto" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{i.createdBy?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <span className="text-sm text-slate-400">Página {page} de {totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border border-slate-600 text-slate-400 hover:text-white disabled:opacity-40"><ChevronLeft size={16} /></button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg border border-slate-600 text-slate-400 hover:text-white disabled:opacity-40"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Modal registrar */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2"><AlertTriangle size={18} className="text-red-400" /> Nueva incidencia</h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Tipo *</label>
                  <select value={form.typeId} onChange={(e) => setForm((f) => ({ ...f, typeId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm">
                    <option value="">Seleccionar…</option>
                    {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Gravedad</label>
                  <select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm">
                    <option value="LOW">Baja</option>
                    <option value="MEDIUM">Media</option>
                    <option value="HIGH">Alta</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Fecha y hora *</label>
                  <input type="datetime-local" value={form.occurredAt} onChange={(e) => setForm((f) => ({ ...f, occurredAt: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Involucrado</label>
                  <input type="text" value={form.involvedName} onChange={(e) => setForm((f) => ({ ...f, involvedName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm" placeholder="Persona involucrada (opcional)" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Observación (qué pasó) *</label>
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={4}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm"
                  placeholder="Describe lo ocurrido…" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Fotos (opcional){photos.length > 0 && ` · ${photos.length}/${MAX_PHOTOS}`}
                </label>
                <div className="flex flex-wrap gap-2">
                  {photos.map((p, idx) => (
                    <div key={idx} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p} alt={`Vista previa ${idx + 1}`} className="h-24 w-24 object-cover rounded-lg border border-slate-700" />
                      <button type="button" onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== idx))}
                        className="absolute -top-2 -right-2 p-1 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-lg" title="Quitar foto">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <label className="flex flex-col items-center justify-center gap-1 h-24 w-24 rounded-lg border border-dashed border-slate-700 bg-slate-800/50 text-slate-400 text-xs cursor-pointer hover:border-slate-600 hover:text-slate-300 transition-colors">
                      <ImagePlus size={18} /> Agregar
                      <input type="file" accept="image/*" multiple onChange={onPickPhoto} className="hidden" />
                    </label>
                  )}
                </div>
                {photoErr && <p className="text-xs text-red-400 mt-1">{photoErr}</p>}
              </div>
              <button onClick={submit} disabled={saving || !form.typeId || !form.description.trim()}
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {saving && <Loader2 size={16} className="animate-spin" />} Registrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox de la foto */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200" title="Cerrar">
            <X size={20} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Foto de la incidencia" onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  );
}
