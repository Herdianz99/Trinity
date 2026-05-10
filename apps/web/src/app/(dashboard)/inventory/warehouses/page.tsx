'use client';

import { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, Edit2, Trash2, Loader2, X, Star } from 'lucide-react';

interface Warehouse {
  id: string;
  name: string;
  location: string | null;
  isDefault: boolean;
  isActive: boolean;
  _count?: { stock: number };
}

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', location: '', isDefault: false });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchWarehouses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/warehouses');
      if (res.ok) setWarehouses(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWarehouses(); }, [fetchWarehouses]);

  function openCreate() {
    setEditingId(null);
    setForm({ name: '', location: '', isDefault: false });
    setModalOpen(true);
  }

  function openEdit(w: Warehouse) {
    setEditingId(w.id);
    setForm({ name: w.name, location: w.location || '', isDefault: w.isDefault });
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const url = editingId ? `/api/proxy/warehouses/${editingId}` : '/api/proxy/warehouses';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          location: form.location || undefined,
          isDefault: form.isDefault,
        }),
      });
      if (res.ok) {
        setModalOpen(false);
        fetchWarehouses();
        setMessage({ type: 'success', text: editingId ? 'Almacen actualizado' : 'Almacen creado' });
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Desactivar este almacen?')) return;
    const res = await fetch(`/api/proxy/warehouses/${id}`, { method: 'DELETE' });
    if (res.ok) fetchWarehouses();
  }

  async function toggleDefault(id: string) {
    if (!confirm('Cambiar almacen por defecto?')) return;
    await fetch(`/api/proxy/warehouses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true }),
    });
    fetchWarehouses();
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <Building2 className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Almacenes</h1>
            <p className="text-slate-400 text-sm">{warehouses.length} almacenes registrados</p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nuevo almacen
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Ubicacion</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Por defecto</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium w-24">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12">
                  <Loader2 className="animate-spin text-green-500 mx-auto" size={28} />
                </td></tr>
              ) : warehouses.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-500">No hay almacenes</td></tr>
              ) : warehouses.map(w => (
                <tr key={w.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{w.name}</td>
                  <td className="px-4 py-3 text-slate-400">{w.location || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {w.isDefault ? (
                      <Star size={16} className="inline text-amber-400 fill-amber-400" />
                    ) : (
                      <button
                        onClick={() => toggleDefault(w.id)}
                        className="p-1 rounded hover:bg-slate-700 text-slate-600 hover:text-amber-400 transition-colors"
                        title="Hacer por defecto"
                      >
                        <Star size={16} />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {w.isActive ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Activo</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(w)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" title="Editar">
                        <Edit2 size={14} />
                      </button>
                      {!w.isDefault && (
                        <button onClick={() => handleDelete(w.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors" title="Desactivar">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold text-white">{editingId ? 'Editar almacen' : 'Nuevo almacen'}</h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input-field !py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Ubicacion</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))}
                  className="input-field !py-2 text-sm"
                  placeholder="Ej: Planta baja, Deposito trasero..."
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm(f => ({ ...f, isDefault: e.target.checked }))}
                  className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40"
                />
                Almacen por defecto
              </label>
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
                <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
                  {saving && <Loader2 className="animate-spin" size={16} />}
                  {editingId ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
