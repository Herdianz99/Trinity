'use client';

import { useState, useEffect } from 'react';
import {
  Printer, Plus, Edit2, Trash2, Loader2, X, ToggleLeft, ToggleRight
} from 'lucide-react';

interface PrintArea {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  _count: { categories: number };
  createdAt: string;
}

const defaultForm = { name: '', description: '' };

export default function PrintAreasPage() {
  const [areas, setAreas] = useState<PrintArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function fetchAreas() {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/print-areas');
      if (res.ok) setAreas(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAreas(); }, []);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [message]);

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setModalOpen(true);
  }

  function openEdit(area: PrintArea) {
    setEditingId(area.id);
    setForm({ name: area.name, description: area.description || '' });
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const url = editingId ? `/api/proxy/print-areas/${editingId}` : '/api/proxy/print-areas';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
        }),
      });
      if (res.ok) {
        setModalOpen(false);
        fetchAreas();
        setMessage({ type: 'success', text: editingId ? 'Area de impresion actualizada' : 'Area de impresion creada' });
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(area: PrintArea) {
    try {
      const res = await fetch(`/api/proxy/print-areas/${area.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !area.isActive }),
      });
      if (res.ok) {
        fetchAreas();
        setMessage({ type: 'success', text: area.isActive ? 'Area desactivada' : 'Area activada' });
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: err.message || 'Error al cambiar estado' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error al cambiar estado' });
    }
  }

  async function handleDelete(area: PrintArea) {
    if (area._count.categories > 0) {
      setMessage({ type: 'error', text: `No se puede eliminar "${area.name}" porque tiene ${area._count.categories} categoria(s) asignada(s)` });
      return;
    }
    if (!confirm(`Eliminar el area de impresion "${area.name}"?`)) return;
    try {
      const res = await fetch(`/api/proxy/print-areas/${area.id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchAreas();
        setMessage({ type: 'success', text: 'Area de impresion eliminada' });
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: err.message || 'Error al eliminar' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error al eliminar' });
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <Printer className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Areas de Impresion</h1>
            <p className="text-slate-400 text-sm">{areas.length} areas registradas</p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nueva area
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
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Descripcion</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Categorias</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium w-28">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12">
                  <Loader2 className="animate-spin text-green-500 mx-auto" size={28} />
                </td></tr>
              ) : areas.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-500">
                  No hay areas de impresion registradas
                </td></tr>
              ) : areas.map(area => (
                <tr key={area.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors group">
                  <td className="px-4 py-3 text-white font-medium">{area.name}</td>
                  <td className="px-4 py-3 text-slate-400 hidden md:table-cell">{area.description || '—'}</td>
                  <td className="px-4 py-3 text-center text-slate-400">{area._count.categories}</td>
                  <td className="px-4 py-3 text-center">
                    {area.isActive ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Activo</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleToggleActive(area)}
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        title={area.isActive ? 'Desactivar' : 'Activar'}
                      >
                        {area.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      </button>
                      <button
                        onClick={() => openEdit(area)}
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        title="Editar"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(area)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          area._count.categories > 0
                            ? 'text-slate-600 cursor-not-allowed'
                            : 'hover:bg-red-500/10 text-slate-400 hover:text-red-400'
                        }`}
                        title={area._count.categories > 0 ? 'No se puede eliminar: tiene categorias asignadas' : 'Eliminar'}
                      >
                        <Trash2 size={14} />
                      </button>
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
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="border-b border-slate-700/50 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                {editingId ? 'Editar area de impresion' : 'Nueva area de impresion'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input-field !py-2 text-sm"
                  placeholder="Ej: Cocina, Barra, Caja..."
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Descripcion</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  className="input-field !py-2 text-sm"
                  placeholder="Descripcion opcional..."
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/50">
                <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary !py-2.5 text-sm">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
                  {saving && <Loader2 className="animate-spin" size={16} />}
                  {editingId ? 'Guardar cambios' : 'Crear area'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
