'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Building2, Plus, Pencil, Loader2, X, Search, Eye, Users } from 'lucide-react';

interface Member { id: string; name: string; role: string }
interface Department {
  id: string;
  name: string;
  isActive: boolean;
  roles: string[];
  viewerDepartmentIds: string[];
  members: Member[];
  _count: { incidents: number; types: number };
}
interface UserOption { id: string; name: string; role: string; incidentDepartmentId: string | null }

const ROLE_LABELS: Record<string, string> = {
  SUPERVISOR: 'Supervisor',
  CASHIER: 'Cajero',
  SELLER: 'Vendedor',
  WAREHOUSE: 'Almacenista',
  BUYER: 'Comprador',
  ACCOUNTANT: 'Contador',
  AUDITOR: 'Auditor',
  RRHH: 'Recursos Humanos',
  SEGURIDAD: 'Seguridad',
  EMPLOYEE: 'Empleado (portal)',
};
// ADMIN no se ofrece: los administradores ven todos los departamentos siempre.
const ROLES = Object.keys(ROLE_LABELS);

const emptyForm = { name: '', isActive: true, roles: [] as string[], viewerDepartmentIds: [] as string[], memberIds: [] as string[] };

export default function IncidentDepartmentsPage() {
  const [depts, setDepts] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [userSearch, setUserSearch] = useState('');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  useEffect(() => { document.title = 'Departamentos de incidencias | Trinity ERP'; }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [resD, resU] = await Promise.all([
        fetch('/api/proxy/incidents/departments'),
        fetch('/api/proxy/incidents/departments/users'),
      ]);
      if (!resD.ok) throw new Error((await resD.json()).message || 'Error al cargar departamentos');
      setDepts(await resD.json());
      if (resU.ok) setUsers(await resU.json());
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 4000); return () => clearTimeout(t); }
  }, [message]);

  const deptName = useMemo(() => new Map(depts.map((d) => [d.id, d.name])), [depts]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setUserSearch('');
    setModalOpen(true);
  }
  function openEdit(d: Department) {
    setEditing(d);
    setForm({
      name: d.name,
      isActive: d.isActive,
      roles: d.roles || [],
      viewerDepartmentIds: d.viewerDepartmentIds || [],
      memberIds: d.members.map((m) => m.id),
    });
    setUserSearch('');
    setModalOpen(true);
  }

  const toggleIn = (key: 'roles' | 'viewerDepartmentIds' | 'memberIds', value: string) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    try {
      const url = editing ? `/api/proxy/incidents/departments/${editing.id}` : '/api/proxy/incidents/departments';
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Error'); }
      setMessage({ type: 'success', text: editing ? 'Departamento actualizado' : 'Departamento creado' });
      setModalOpen(false);
      fetchAll();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  }

  // Usuarios para asignar a mano: los no-admin. Muestra primero los ya elegidos.
  const userOptions = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users
      .filter((u) => u.role !== 'ADMIN')
      .filter((u) => !q || u.name.toLowerCase().includes(q))
      .sort((a, b) => Number(form.memberIds.includes(b.id)) - Number(form.memberIds.includes(a.id)));
  }, [users, userSearch, form.memberIds]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Building2 className="text-blue-400" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Departamentos de incidencias</h1>
            <p className="text-sm text-slate-400">Quién registra y quién ve cada grupo de incidencias. Los administradores ven todo.</p>
          </div>
        </div>
        <button onClick={openCreate}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
          <Plus size={16} /> Nuevo departamento
        </button>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-xl border text-sm font-medium ${message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-slate-500" size={28} /></div>
      ) : depts.length === 0 ? (
        <div className="text-center py-16 text-slate-500">No hay departamentos</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {depts.map((d) => {
            const viewers = (d.viewerDepartmentIds || []).map((id) => deptName.get(id)).filter(Boolean);
            return (
              <div key={d.id} className={`bg-slate-800/50 border rounded-xl p-4 space-y-3 ${d.isActive ? 'border-slate-700/50' : 'border-slate-700/30 opacity-60'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-slate-100">{d.name}</h2>
                    <p className="text-xs text-slate-500">{d._count.incidents} incidencias · {d._count.types} tipos{!d.isActive && ' · Inactivo'}</p>
                  </div>
                  <button onClick={() => openEdit(d)} className="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-blue-400 transition-colors" title="Editar">
                    <Pencil size={15} />
                  </button>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex gap-2">
                    <Users size={15} className="text-slate-500 mt-0.5 shrink-0" />
                    <div className="text-slate-300">
                      <span className="text-slate-500">Registran: </span>
                      {[
                        ...(d.roles || []).map((r) => `todo el rol ${ROLE_LABELS[r] || r}`),
                        ...d.members.map((m) => m.name),
                      ].join(', ') || <span className="text-amber-400">nadie todavía</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Eye size={15} className="text-slate-500 mt-0.5 shrink-0" />
                    <div className="text-slate-300">
                      <span className="text-slate-500">También lo ven: </span>
                      {viewers.length ? viewers.join(', ') : 'solo administradores'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-100">{editing ? 'Editar departamento' : 'Nuevo departamento'}</h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nombre *</label>
                <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required autoFocus
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm"
                  placeholder="Ej: Auditoría, Infraestructura…" />
              </div>

              <div>
                <p className="text-xs text-slate-400 mb-1">Roles miembros <span className="text-slate-500">(todos los usuarios de ese rol registran aquí)</span></p>
                <div className="flex flex-wrap gap-1.5">
                  {ROLES.map((r) => {
                    const on = form.roles.includes(r);
                    return (
                      <button type="button" key={r} onClick={() => toggleIn('roles', r)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${on ? 'bg-blue-500/15 border-blue-500/40 text-blue-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                        {ROLE_LABELS[r]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-400 mb-1">
                  Usuarios miembros <span className="text-slate-500">(además de los roles; un usuario solo puede estar asignado a un departamento)</span>
                </p>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input type="text" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Buscar usuario"
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm" />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-700/60 divide-y divide-slate-800">
                  {userOptions.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-slate-500">Sin resultados</p>
                  ) : userOptions.map((u) => {
                    const on = form.memberIds.includes(u.id);
                    const elsewhere = !on && u.incidentDepartmentId && u.incidentDepartmentId !== editing?.id
                      ? deptName.get(u.incidentDepartmentId) : null;
                    return (
                      <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-800/60">
                        <input type="checkbox" checked={on} onChange={() => toggleIn('memberIds', u.id)} className="accent-blue-500" />
                        <span className="text-slate-200">{u.name}</span>
                        <span className="text-xs text-slate-500">{ROLE_LABELS[u.role] || u.role}</span>
                        {elsewhere && <span className="ml-auto text-[11px] text-amber-400">hoy en {elsewhere}</span>}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-400 mb-1">También lo ven <span className="text-slate-500">(solo lectura, no pueden registrar aquí)</span></p>
                <div className="flex flex-wrap gap-1.5">
                  {depts.filter((d) => d.id !== editing?.id).map((d) => {
                    const on = form.viewerDepartmentIds.includes(d.id);
                    return (
                      <button type="button" key={d.id} onClick={() => toggleIn('viewerDepartmentIds', d.id)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${on ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                        {d.name}
                      </button>
                    );
                  })}
                  {depts.filter((d) => d.id !== editing?.id).length === 0 && <span className="text-xs text-slate-500">No hay otros departamentos</span>}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="accent-blue-500" />
                Activo <span className="text-xs text-slate-500">(inactivo: sus miembros dejan de verlo; los administradores lo siguen viendo)</span>
              </label>

              <button type="submit" disabled={processing}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {processing && <Loader2 size={16} className="animate-spin" />}
                {editing ? 'Guardar' : 'Crear'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
