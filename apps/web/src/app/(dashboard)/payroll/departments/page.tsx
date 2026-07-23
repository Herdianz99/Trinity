'use client';

import { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, Pencil, Trash2, X } from 'lucide-react';

interface Department {
  id: string;
  name: string;
  isActive: boolean;
  _count?: { employees: number };
}

const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500';

export default function DepartmentsPage() {
  const [items, setItems] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/departments');
      if (res.ok) setItems(await res.json());
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { document.title = 'Departamentos | Trinity ERP'; }, []);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  function openCreate() { setEditing(null); setName(''); setIsActive(true); setFormError(''); setShowForm(true); }
  function openEdit(d: Department) { setEditing(d); setName(d.name); setIsActive(d.isActive); setFormError(''); setShowForm(true); }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const url = editing ? `/api/proxy/departments/${editing.id}` : '/api/proxy/departments';
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message);
      setShowForm(false);
      fetchItems();
    } catch (err: any) { setFormError(err.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(d: Department) {
    if (!confirm(`¿Eliminar el departamento "${d.name}"?`)) return;
    try {
      const res = await fetch(`/api/proxy/departments/${d.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(Array.isArray(data.message) ? data.message[0] : data.message || 'No se pudo eliminar'); return; }
      fetchItems();
    } catch { /* empty */ }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <Building2 size={22} className="text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Departamentos</h1>
            <p className="text-sm text-slate-400">Maestro de departamentos de nómina</p>
          </div>
        </div>
        <button onClick={openCreate} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          <Plus size={18} /> Nuevo departamento
        </button>
      </div>

      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-800/80">
                <Th>Nombre</Th>
                <Th className="text-center">Empleados</Th>
                <Th className="text-center">Estado</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="text-center py-12 text-slate-500">Cargando...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-12 text-slate-500">No hay departamentos registrados</td></tr>
              ) : items.map((d) => (
                <tr key={d.id} onClick={() => openEdit(d)} className="border-t border-slate-700/30 hover:bg-slate-800/30 transition-colors cursor-pointer">
                  <td className="px-4 py-3 text-sm font-medium text-slate-200">{d.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-300 text-center">{d._count?.employees ?? 0}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${d.isActive ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'}`}>{d.isActive ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={(e) => { e.stopPropagation(); openEdit(d); }} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors" title="Editar"><Pencil size={16} /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(d); }} className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Eliminar"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">{editing ? 'Editar departamento' : 'Nuevo departamento'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              {formError && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{formError}</div>}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Nombre</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="ADMINISTRACION" className={inputCls} />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-green-500" />
                Activo
              </label>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 ${className}`}>{children}</th>;
}
