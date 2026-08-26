'use client';

import { useState, useEffect, useCallback } from 'react';
import { Layers, Plus, Pencil, ToggleLeft, ToggleRight, Loader2, X } from 'lucide-react';

interface FaultType {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export default function FaultTypesPage() {
  const [types, setTypes] = useState<FaultType[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FaultType | null>(null);
  const [formName, setFormName] = useState('');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  useEffect(() => { document.title = 'Tipos de falta | Trinity ERP'; }, []);

  const fetchTypes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/disciplinary/fault-types');
      const data = await res.json();
      setTypes(Array.isArray(data) ? data : []);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar tipos de falta' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTypes(); }, [fetchTypes]);
  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 4000); return () => clearTimeout(t); }
  }, [message]);

  function openCreate() { setEditing(null); setFormName(''); setModalOpen(true); }
  function openEdit(t: FaultType) { setEditing(t); setFormName(t.name); setModalOpen(true); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    try {
      const url = editing ? `/api/proxy/disciplinary/fault-types/${editing.id}` : '/api/proxy/disciplinary/fault-types';
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Error'); }
      setMessage({ type: 'success', text: editing ? 'Tipo actualizado' : 'Tipo creado' });
      setModalOpen(false);
      fetchTypes();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      const res = await fetch(`/api/proxy/disciplinary/fault-types/${id}/toggle-active`, { method: 'PATCH' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Error'); }
      fetchTypes();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Layers className="text-blue-400" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Tipos de falta</h1>
            <p className="text-sm text-slate-400">{types.length} tipos</p>
          </div>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
          <Plus size={16} /> Nuevo tipo
        </button>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-xl border text-sm font-medium ${message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
          {message.text}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-700/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800/60 border-b border-slate-700/50">
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Nombre</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="text-center py-12"><Loader2 className="animate-spin inline-block text-slate-500" size={24} /></td></tr>
            ) : types.length === 0 ? (
              <tr><td colSpan={3} className="text-center py-12 text-slate-500">No hay tipos de falta</td></tr>
            ) : (
              types.map((t) => (
                <tr key={t.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 text-slate-200 font-medium">{t.name}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${t.isActive ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-slate-500/10 text-slate-500 border-slate-500/30'}`}>
                      {t.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-blue-400 transition-colors" title="Editar"><Pencil size={14} /></button>
                      <button onClick={() => handleToggle(t.id)} className="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-amber-400 transition-colors" title={t.isActive ? 'Desactivar' : 'Activar'}>
                        {t.isActive ? <ToggleRight size={16} className="text-green-400" /> : <ToggleLeft size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-100">{editing ? 'Editar tipo de falta' : 'Nuevo tipo de falta'}</h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nombre *</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} required autoFocus
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm"
                  placeholder="Ej: Puntualidad, Procedimiento, Uniforme…" />
              </div>
              <button type="submit" disabled={processing}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {processing && <Loader2 size={16} className="animate-spin" />}
                {editing ? 'Actualizar' : 'Crear'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
