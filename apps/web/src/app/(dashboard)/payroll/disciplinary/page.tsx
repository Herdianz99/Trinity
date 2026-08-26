'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ShieldAlert, Plus, Loader2, X, FileText, User, Filter } from 'lucide-react';

interface FaultType { id: string; name: string; isActive: boolean; }
interface EmployeeLite { id: string; code: string | null; customer: { name: string }; }
interface Action {
  id: string; number: string; sequence: number; level: string; occurredAt: string; reason: string;
  faultType: { id: string; name: string };
  employee: { id: string; code: string | null; customer: { name: string } };
  createdBy?: { name: string };
  photos: { id: string; thumbUrl: string; mediumUrl: string }[];
}

const LEVELS: Record<string, { label: string; cls: string }> = {
  LLAMADO: { label: 'Llamado de atención', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  NOTIFICACION: { label: 'Notificación', cls: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  AMONESTACION: { label: 'Amonestación', cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
};

// Downscale a max 1600px y a JPEG base64 para no subir fotos enormes.
async function fileToDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = document.createElement('img');
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
  const max = 1600;
  let { width, height } = img;
  if (width > max || height > max) {
    const scale = Math.min(max / width, max / height);
    width = Math.round(width * scale); height = Math.round(height * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export default function DisciplinaryPage() {
  const [items, setItems] = useState<Action[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [faultTypes, setFaultTypes] = useState<FaultType[]>([]);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  // Filtros
  const [fEmployee, setFEmployee] = useState('');
  const [fType, setFType] = useState('');
  const [fLevel, setFLevel] = useState('');

  // Modal registro
  const [modalOpen, setModalOpen] = useState(false);
  const [mEmployee, setMEmployee] = useState('');
  const [mType, setMType] = useState('');
  const [mDate, setMDate] = useState('');
  const [mReason, setMReason] = useState('');
  const [mPhotos, setMPhotos] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => { document.title = 'Amonestaciones | Trinity ERP'; }, []);

  useEffect(() => {
    fetch('/api/proxy/disciplinary/fault-types/active').then((r) => r.json()).then((d) => setFaultTypes(Array.isArray(d) ? d : []));
    fetch('/api/proxy/employees?isActive=true').then((r) => r.json()).then((d) => setEmployees(Array.isArray(d) ? d : []));
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (fEmployee) p.set('employeeId', fEmployee);
      if (fType) p.set('faultTypeId', fType);
      if (fLevel) p.set('level', fLevel);
      p.set('page', String(page)); p.set('limit', '25');
      const res = await fetch(`/api/proxy/disciplinary?${p.toString()}`);
      const data = await res.json();
      setItems(data.data || []);
      setTotal(data.total || 0);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar amonestaciones' });
    } finally {
      setLoading(false);
    }
  }, [fEmployee, fType, fLevel, page]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 4000); return () => clearTimeout(t); }
  }, [message]);

  // Preview del nivel que tocará (conteo actual del hilo + 1).
  useEffect(() => {
    if (!mEmployee || !mType) { setPreview(null); return; }
    const p = new URLSearchParams({ employeeId: mEmployee, faultTypeId: mType, limit: '1' });
    fetch(`/api/proxy/disciplinary?${p.toString()}`).then((r) => r.json()).then((d) => {
      const next = (d.total || 0) + 1;
      const lvl = next <= 1 ? 'LLAMADO' : next === 2 ? 'NOTIFICACION' : 'AMONESTACION';
      setPreview(`Este será el ${next}º de esta falta → ${LEVELS[lvl].label}`);
    }).catch(() => setPreview(null));
  }, [mEmployee, mType]);

  function openModal() {
    setMEmployee(''); setMType(''); setMReason(''); setMPhotos([]); setPreview(null);
    const now = new Date();
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    setMDate(local);
    setModalOpen(true);
  }

  async function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const encoded: string[] = [];
    for (const f of files.slice(0, 8)) encoded.push(await fileToDataUrl(f));
    setMPhotos((prev) => [...prev, ...encoded].slice(0, 8));
    e.target.value = '';
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    try {
      const res = await fetch('/api/proxy/disciplinary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: mEmployee,
          faultTypeId: mType,
          occurredAt: mDate ? `${mDate}T12:00:00-04:00` : undefined,
          reason: mReason,
          photos: mPhotos,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Error'); }
      const created = await res.json();
      setMessage({ type: 'success', text: `Registrado ${created.number} (${LEVELS[created.level]?.label || created.level})` });
      setModalOpen(false);
      fetchItems();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <ShieldAlert className="text-red-400" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Amonestaciones</h1>
            <p className="text-sm text-slate-400">{total} registros</p>
          </div>
        </div>
        <button onClick={openModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors">
          <Plus size={16} /> Registrar llamado
        </button>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-xl border text-sm font-medium ${message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
          {message.text}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-slate-700/50 bg-slate-800/30">
        <Filter size={16} className="text-slate-500" />
        <select value={fEmployee} onChange={(e) => { setPage(1); setFEmployee(e.target.value); }}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm">
          <option value="">Todos los empleados</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.customer.name}{e.code ? ` (${e.code})` : ''}</option>)}
        </select>
        <select value={fType} onChange={(e) => { setPage(1); setFType(e.target.value); }}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm">
          <option value="">Todas las faltas</option>
          {faultTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={fLevel} onChange={(e) => { setPage(1); setFLevel(e.target.value); }}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm">
          <option value="">Todos los niveles</option>
          <option value="LLAMADO">Llamado de atención</option>
          <option value="NOTIFICACION">Notificación</option>
          <option value="AMONESTACION">Amonestación</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-xl border border-slate-700/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800/60 border-b border-slate-700/50">
              <th className="text-left px-4 py-3 text-slate-400 font-medium">N°</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Empleado</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Tipo de falta</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Nivel</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Motivo</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Acta</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12"><Loader2 className="animate-spin inline-block text-slate-500" size={24} /></td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-slate-500">No hay amonestaciones</td></tr>
            ) : (
              items.map((a) => (
                <tr key={a.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 text-slate-300 font-mono text-xs">{a.number}</td>
                  <td className="px-4 py-3">
                    <Link href={`/payroll/disciplinary/employee/${a.employee.id}`}
                      className="text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1">
                      <User size={13} /> {a.employee.customer.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{a.faultType.name}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${LEVELS[a.level]?.cls || ''}`}>
                      {LEVELS[a.level]?.label || a.level}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{new Date(a.occurredAt).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' })}</td>
                  <td className="px-4 py-3 text-slate-300 max-w-xs truncate" title={a.reason}>{a.reason}</td>
                  <td className="px-4 py-3 text-center">
                    <a href={`/api/proxy/disciplinary/${a.id}/pdf`} target="_blank" rel="noreferrer"
                      className="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-blue-400 inline-flex" title="Acta PDF"><FileText size={15} /></a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm disabled:opacity-40">Anterior</button>
          <span className="text-slate-400 text-sm">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm disabled:opacity-40">Siguiente</button>
        </div>
      )}

      {/* Modal registro */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-100">Registrar llamado</h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Empleado *</label>
                <select value={mEmployee} onChange={(e) => setMEmployee(e.target.value)} required
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm">
                  <option value="">Selecciona…</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.customer.name}{e.code ? ` (${e.code})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tipo de falta *</label>
                <select value={mType} onChange={(e) => setMType(e.target.value)} required
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm">
                  <option value="">Selecciona…</option>
                  {faultTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {preview && (
                <div className="px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-sm">{preview}</div>
              )}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Fecha del suceso *</label>
                <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} required
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Motivo *</label>
                <textarea value={mReason} onChange={(e) => setMReason(e.target.value)} required rows={3} maxLength={2000}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm"
                  placeholder="Describe lo ocurrido…" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Foto(s) del acta firmada (opcional)</label>
                <input type="file" accept="image/*" multiple onChange={onPickPhotos}
                  className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-700 file:text-slate-200" />
                {mPhotos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {mPhotos.map((p, i) => (
                      <div key={i} className="relative">
                        <img src={p} alt="" className="w-14 h-14 object-cover rounded-lg border border-slate-700" />
                        <button type="button" onClick={() => setMPhotos((prev) => prev.filter((_, j) => j !== i))}
                          className="absolute -top-1.5 -right-1.5 bg-red-600 rounded-full p-0.5"><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button type="submit" disabled={processing}
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {processing && <Loader2 size={16} className="animate-spin" />}
                Registrar
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
