'use client';
import { useEffect, useMemo, useState } from 'react';
import { Plus, X, Loader2, MessageSquare, CheckCircle2, XCircle, Clock, Search, Check, Send } from 'lucide-react';

const fmtDate = (s: string) => new Date(s).toLocaleString('es-VE');
// Para buscar sin importar tildes ni mayúsculas ("jose" encuentra "José")
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Sent { id: string; title: string; type: string; createdAt: string; total: number; recibido: number; rechazado: number; pendiente: number; }
interface EmployeeOption { id: string; code: string | null; departmentId: string | null; customer: { name: string }; }
interface Department { id: string; name: string; }
interface RecipientDetail {
  id: string;
  ackState: 'PENDIENTE' | 'RECIBIDO' | 'RECHAZADO';
  comment: string | null;
  ackAt: string | null;
  employee: { code: string | null; customer: { name: string } | null } | null;
}
interface NotifDetail {
  id: string; title: string; body: string; type: string; createdAt: string;
  createdBy: { name: string } | null;
  recipients: RecipientDetail[];
}

// Selector de empleados: buscador + filtro por departamento + lista tocable; los elegidos
// quedan arriba como etiquetas. `single` = modo "A un empleado" (tocar reemplaza).
// `onChange` recibe un updater sobre la selección más reciente: así varios toques seguidos
// (antes de que React vuelva a renderizar) no se pisan entre sí.
function EmployeePicker({ employees, departments, value, onChange, single }: {
  employees: EmployeeOption[];
  departments: Department[];
  value: string[];
  onChange: (update: (prev: string[]) => string[]) => void;
  single: boolean;
}) {
  const [query, setQuery] = useState('');
  const [deptId, setDeptId] = useState('');

  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  // Solo departamentos que tienen empleados activos
  const usedDepts = useMemo(
    () => departments.filter((d) => employees.some((e) => e.departmentId === d.id)),
    [departments, employees],
  );
  const visible = useMemo(() => {
    const q = norm(query.trim());
    return employees.filter((e) =>
      (!deptId || e.departmentId === deptId) &&
      (!q || norm(e.customer?.name || '').includes(q) || norm(e.code || '').includes(q)),
    );
  }, [employees, query, deptId]);

  const selected = new Set(value);
  const allVisibleSelected = visible.length > 0 && visible.every((e) => selected.has(e.id));

  function toggle(id: string) {
    onChange((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      return single ? [id] : [...prev, id];
    });
  }
  function toggleVisible() {
    const ids = visible.map((e) => e.id);
    const idSet = new Set(ids);
    onChange((prev) => allVisibleSelected
      ? prev.filter((v) => !idSet.has(v))
      : [...prev, ...ids.filter((id) => !prev.includes(id))]);
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/40">
      {/* Elegidos */}
      <div className="p-3 border-b border-slate-700/60">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-400">
            {single ? 'Empleado elegido' : `Seleccionados (${value.length})`}
          </span>
          {!single && value.length > 0 && (
            <button type="button" onClick={() => onChange(() => [])} className="text-xs text-slate-400 hover:text-red-400">
              Quitar todos
            </button>
          )}
        </div>
        {value.length === 0 ? (
          <p className="text-xs text-slate-500">
            {single ? 'Toca un empleado de la lista.' : 'Toca los empleados de la lista para agregarlos.'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
            {value.map((id) => {
              const e = byId.get(id);
              if (!e) return null;
              return (
                <span key={id} className="inline-flex items-center gap-1 rounded-full bg-green-500/15 border border-green-500/30 pl-2.5 pr-1 py-1 text-xs text-green-300">
                  <span className="max-w-[10rem] truncate">{e.customer?.name}</span>
                  <button type="button" onClick={() => toggle(id)} aria-label={`Quitar a ${e.customer?.name}`}
                    className="rounded-full p-0.5 hover:bg-green-500/25 hover:text-white">
                    <X size={12} />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Buscador + departamentos */}
      <div className="p-3 space-y-2.5 border-b border-slate-700/60">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nombre o código…"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-8 py-2 text-sm text-slate-200" />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-1">
              <X size={14} />
            </button>
          )}
        </div>
        {usedDepts.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {[{ id: '', name: 'Todos' }, ...usedDepts].map((d) => (
              <button key={d.id || 'all'} type="button" onClick={() => setDeptId(d.id)}
                className={`flex-shrink-0 rounded-full px-3 py-1 text-xs border transition-colors ${
                  deptId === d.id
                    ? 'bg-green-500/20 border-green-500/40 text-green-300'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}>
                {d.name}
              </button>
            ))}
          </div>
        )}
        {!single && visible.length > 0 && (
          <button type="button" onClick={toggleVisible} className="text-xs font-medium text-green-400 hover:text-green-300">
            {allVisibleSelected ? `Desmarcar los ${visible.length} visibles` : `Marcar los ${visible.length} visibles`}
          </button>
        )}
      </div>

      {/* Lista: toda la fila es tocable */}
      <ul className="divide-y divide-slate-700/40 sm:max-h-64 sm:overflow-y-auto">
        {visible.map((e) => {
          const on = selected.has(e.id);
          return (
            <li key={e.id}>
              <button type="button" onClick={() => toggle(e.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors active:bg-slate-700/50 ${on ? 'bg-green-500/5' : 'hover:bg-slate-800/60'}`}>
                <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center border ${single ? 'rounded-full' : 'rounded'} ${
                  on ? 'bg-green-500 border-green-500 text-slate-950' : 'border-slate-600'
                }`}>
                  {on && <Check size={13} strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm truncate ${on ? 'text-white font-medium' : 'text-slate-200'}`}>{e.customer?.name}</span>
                  <span className="block text-[11px] text-slate-500 truncate">
                    {[e.code, e.departmentId ? deptName.get(e.departmentId) : null].filter(Boolean).join(' · ') || 'Sin departamento'}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {visible.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">Ningún empleado coincide.</li>}
      </ul>
    </div>
  );
}

export default function EmisorNotificacionesPage() {
  const [sent, setSent] = useState<Sent[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<{ title: string; body: string; type: string; mode: string; employeeIds: string[]; departmentId: string }>(
    { title: '', body: '', type: 'INFORMATIVA', mode: 'INDIVIDUAL', employeeIds: [], departmentId: '' },
  );

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<NotifDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => { document.title = 'Notificaciones | Trinity ERP'; }, []);
  async function loadSent() {
    const r = await fetch('/api/proxy/notifications');
    if (r.ok) setSent(await r.json());
  }

  async function openDetail(id: string) {
    setDetailOpen(true); setDetail(null); setDetailLoading(true);
    try {
      const r = await fetch(`/api/proxy/notifications/${id}`);
      if (r.ok) setDetail(await r.json());
    } catch { /* ignore */ } finally { setDetailLoading(false); }
  }
  useEffect(() => {
    loadSent();
    fetch('/api/proxy/notifications/targets')
      .then((r) => (r.ok ? r.json() : { employees: [], departments: [] }))
      .then((d) => { setEmployees(d.employees ?? []); setDepartments(d.departments ?? []); })
      .catch(() => {});
  }, []);

  async function submit() {
    if (!form.title.trim() || !form.body.trim()) { setError('Título y mensaje son obligatorios'); return; }
    if ((form.mode === 'INDIVIDUAL' || form.mode === 'MULTIPLE') && form.employeeIds.length === 0) {
      setError(form.mode === 'INDIVIDUAL' ? 'Elige el empleado' : 'Elige al menos un empleado'); return;
    }
    if (form.mode === 'DEPARTMENT' && !form.departmentId) { setError('Elige el departamento'); return; }
    setSaving(true); setError('');
    try {
      const target: any = { mode: form.mode };
      if (form.mode === 'INDIVIDUAL' || form.mode === 'MULTIPLE') target.employeeIds = form.employeeIds;
      if (form.mode === 'DEPARTMENT') target.departmentId = form.departmentId;
      const r = await fetch('/api/proxy/notifications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title.trim(), body: form.body.trim(), type: form.type, target }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Error al enviar');
      setOpen(false);
      setForm({ title: '', body: '', type: 'INFORMATIVA', mode: 'INDIVIDUAL', employeeIds: [], departmentId: '' });
      loadSent();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-white">Notificaciones</h1>
        <button onClick={() => setOpen(true)} className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"><Plus size={16} /> Nueva notificación</button>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm hidden md:table">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/30 text-slate-400">
              <th className="text-left px-4 py-3">Título</th>
              <th className="text-center px-4 py-3">Tipo</th>
              <th className="text-left px-4 py-3">Enviada</th>
              <th className="text-center px-4 py-3">Enterados</th>
              <th className="text-center px-4 py-3">Desacuerdo</th>
              <th className="text-center px-4 py-3">Pendientes</th>
            </tr>
          </thead>
          <tbody>
            {sent.map((n) => (
              <tr
                key={n.id}
                onClick={() => openDetail(n.id)}
                className="border-b border-slate-700/30 cursor-pointer hover:bg-slate-800/40 transition-colors"
                title="Ver respuestas de los empleados"
              >
                <td className="px-4 py-3 text-slate-200">
                  <span className="inline-flex items-center gap-2">
                    <MessageSquare size={14} className="text-slate-500" />
                    {n.title}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-slate-400">{n.type}</td>
                <td className="px-4 py-3 text-slate-400">{fmtDate(n.createdAt)}</td>
                <td className="px-4 py-3 text-center text-emerald-400">{n.recibido}/{n.total}</td>
                <td className="px-4 py-3 text-center text-red-400">{n.rechazado}</td>
                <td className="px-4 py-3 text-center text-slate-300">{n.pendiente}</td>
              </tr>
            ))}
            {sent.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-slate-500">No has enviado notificaciones.</td></tr>}
          </tbody>
        </table>

        {/* Móvil: tarjetas clicables */}
        <div className="md:hidden divide-y divide-slate-700/30">
          {sent.map((n) => (
            <button
              key={n.id}
              onClick={() => openDetail(n.id)}
              className="w-full text-left px-4 py-3 active:bg-slate-800/60"
            >
              <div className="flex items-start gap-2">
                <MessageSquare size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-slate-200 font-medium flex-1 min-w-0 break-words">{n.title}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700/50 text-slate-300 flex-shrink-0">{n.type}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 pl-6">{fmtDate(n.createdAt)}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 pl-6 text-xs">
                <span className="text-emerald-400">Enterados {n.recibido}/{n.total}</span>
                <span className="text-red-400">Desacuerdo {n.rechazado}</span>
                <span className="text-slate-300">Pendientes {n.pendiente}</span>
              </div>
            </button>
          ))}
          {sent.length === 0 && <p className="text-center py-12 text-slate-500 text-sm">No has enviado notificaciones.</p>}
        </div>
      </div>

      {open && (
        // Móvil: ocupa toda la pantalla (h-[100dvh]) con cabecera y botones fijos; desde sm: modal centrado
        <div className="fixed inset-0 z-50 flex sm:items-center sm:justify-center bg-black/60 sm:p-4">
          <div className="bg-slate-900 sm:border sm:border-slate-700 sm:rounded-xl w-full h-[100dvh] sm:h-auto sm:max-w-lg sm:max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-700/50 flex-shrink-0">
              <h2 className="text-lg font-bold text-white">Nueva notificación</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white p-1 -mr-1" aria-label="Cerrar"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
            {error && <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
            <div className="space-y-3">
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Título" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
              <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Mensaje" rows={4} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200">
                <option value="INFORMATIVA">Informativa</option>
                <option value="REUNION">Reunión</option>
              </select>
              <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value, employeeIds: [], departmentId: '' })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200">
                <option value="INDIVIDUAL">A un empleado</option>
                <option value="MULTIPLE">A varios empleados</option>
                <option value="DEPARTMENT">A un departamento</option>
                <option value="ALL">A todos</option>
              </select>
              {(form.mode === 'INDIVIDUAL' || form.mode === 'MULTIPLE') && (
                <EmployeePicker
                  key={form.mode}
                  employees={employees}
                  departments={departments}
                  value={form.employeeIds}
                  onChange={(update) => setForm((f) => ({ ...f, employeeIds: update(f.employeeIds) }))}
                  single={form.mode === 'INDIVIDUAL'}
                />
              )}
              {form.mode === 'DEPARTMENT' && (
                <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200">
                  <option value="">— Elige departamento —</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
            </div>
            </div>
            <div className="flex gap-2 sm:justify-end px-4 sm:px-6 py-3 border-t border-slate-700/50 flex-shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button onClick={() => setOpen(false)} className="btn-secondary flex-1 sm:flex-none">Cancelar</button>
              <button onClick={submit} disabled={saving} className="btn-primary flex-1 sm:flex-none flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                {form.mode === 'MULTIPLE' && form.employeeIds.length > 0 ? `Enviar a ${form.employeeIds.length}` : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between gap-3 p-4 sm:p-6 pb-4 border-b border-slate-700/50">
              <h2 className="text-lg font-bold text-white min-w-0 break-words">{detail?.title ?? 'Detalle'}</h2>
              <button onClick={() => setDetailOpen(false)} className="text-slate-400 hover:text-white flex-shrink-0"><X size={20} /></button>
            </div>

            {detailLoading || !detail ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-green-500" size={28} /></div>
            ) : (
              <div className="overflow-y-auto p-4 sm:p-6 pt-4 space-y-4">
                <div>
                  <div className="text-[11px] text-slate-500 mb-1">
                    {detail.type} · {detail.createdBy?.name} · {fmtDate(detail.createdAt)}
                  </div>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap break-words">{detail.body}</p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-200 mb-2">
                    Respuestas ({detail.recipients.filter((r) => r.ackState !== 'PENDIENTE').length}/{detail.recipients.length})
                  </h3>
                  <div className="space-y-2">
                    {detail.recipients.map((r) => {
                      const name = r.employee?.customer?.name || r.employee?.code || 'Empleado';
                      const badge = r.ackState === 'RECIBIDO'
                        ? { icon: <CheckCircle2 size={14} />, text: 'Enterado', cls: 'text-emerald-400' }
                        : r.ackState === 'RECHAZADO'
                          ? { icon: <XCircle size={14} />, text: 'En desacuerdo', cls: 'text-red-400' }
                          : { icon: <Clock size={14} />, text: 'Pendiente', cls: 'text-slate-400' };
                      return (
                        <div key={r.id} className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                            <span className="text-sm font-medium text-slate-100 break-words">{name}</span>
                            <span className={`inline-flex flex-wrap items-center gap-1.5 text-xs ${badge.cls}`}>
                              {badge.icon} {badge.text}
                              {r.ackAt && <span className="text-slate-500">· {fmtDate(r.ackAt)}</span>}
                            </span>
                          </div>
                          {r.comment && (
                            <div className="mt-2 text-sm text-slate-300 bg-slate-900/50 border border-slate-700/40 rounded-md px-3 py-2">
                              <span className="text-[11px] text-slate-500 block mb-0.5">Respuesta del empleado:</span>
                              <span className="whitespace-pre-wrap">{r.comment}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {detail.recipients.length === 0 && (
                      <p className="text-sm text-slate-500 text-center py-4">Sin destinatarios.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="p-4 border-t border-slate-700/50 flex justify-end">
              <button onClick={() => setDetailOpen(false)} className="btn-secondary">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
