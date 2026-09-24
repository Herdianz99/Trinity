'use client';
import { useEffect, useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';

const fmtDate = (s: string) => new Date(s).toLocaleString('es-VE');

interface Sent { id: string; title: string; type: string; createdAt: string; total: number; recibido: number; rechazado: number; pendiente: number; }
interface EmployeeOption { id: string; code: string | null; departmentId: string | null; customer: { name: string }; }
interface Department { id: string; name: string; }

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

  useEffect(() => { document.title = 'Notificaciones | Trinity ERP'; }, []);
  async function loadSent() {
    const r = await fetch('/api/proxy/notifications');
    if (r.ok) setSent(await r.json());
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Notificaciones</h1>
        <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Nueva notificación</button>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
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
              <tr key={n.id} className="border-b border-slate-700/30">
                <td className="px-4 py-3 text-slate-200">{n.title}</td>
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
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg p-6">
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
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setOpen(false)} className="btn-secondary">Cancelar</button>
              <button onClick={submit} disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
