'use client';
import { useEffect, useState } from 'react';
import { Plus, X, Loader2, MessageSquare, CheckCircle2, XCircle, Clock } from 'lucide-react';

const fmtDate = (s: string) => new Date(s).toLocaleString('es-VE');

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Nueva notificación</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
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
                <select
                  multiple={form.mode === 'MULTIPLE'}
                  value={form.mode === 'MULTIPLE' ? form.employeeIds : form.employeeIds[0] || ''}
                  onChange={(e) => {
                    const vals = form.mode === 'MULTIPLE'
                      ? Array.from(e.target.selectedOptions).map((o) => o.value)
                      : [e.target.value];
                    setForm({ ...form, employeeIds: vals });
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 min-h-[42px]"
                >
                  {form.mode === 'INDIVIDUAL' && <option value="">— Elige —</option>}
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.customer?.name}{e.code ? ` (${e.code})` : ''}</option>)}
                </select>
              )}
              {form.mode === 'DEPARTMENT' && (
                <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200">
                  <option value="">— Elige departamento —</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-5">
              <button onClick={() => setOpen(false)} className="btn-secondary">Cancelar</button>
              <button onClick={submit} disabled={saving} className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Enviar
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
