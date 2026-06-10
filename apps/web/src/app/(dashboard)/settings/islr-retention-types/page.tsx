'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Loader2, Search, X, Plus, Save, ToggleLeft, ToggleRight, Pencil,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface IslrType {
  id: string;
  codigo: number;
  descripcion: string;
  baseImponiblePct: number;
  retentionPct: number;
  sustraendoUt: number;
  forPersonaJuridica: boolean;
  forPersonaResidente: boolean;
  isActive: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function IslrRetentionTypesPage() {
  const [types, setTypes] = useState<IslrType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<IslrType | null>(null);
  const [form, setForm] = useState({
    codigo: 0,
    descripcion: '',
    baseImponiblePct: 100,
    retentionPct: 0,
    sustraendoUt: 0,
    forPersonaJuridica: false,
    forPersonaResidente: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { document.title = 'Tipos de Retención ISLR | Trinity ERP'; }, []);

  const fetchTypes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/proxy/islr-retention-types');
      if (!res.ok) throw new Error('Error al cargar tipos');
      const data = await res.json();
      setTypes(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTypes(); }, [fetchTypes]);

  const filtered = types.filter(t => {
    if (!showInactive && !t.isActive) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        t.descripcion.toLowerCase().includes(q) ||
        String(t.codigo).includes(q)
      );
    }
    return true;
  });

  function openCreate() {
    setEditing(null);
    setForm({ codigo: 0, descripcion: '', baseImponiblePct: 100, retentionPct: 0, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false });
    setModalOpen(true);
  }

  function openEdit(t: IslrType) {
    setEditing(t);
    setForm({
      codigo: t.codigo,
      descripcion: t.descripcion,
      baseImponiblePct: t.baseImponiblePct,
      retentionPct: t.retentionPct,
      sustraendoUt: t.sustraendoUt,
      forPersonaJuridica: t.forPersonaJuridica,
      forPersonaResidente: t.forPersonaResidente,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const url = editing
        ? `/api/proxy/islr-retention-types/${editing.id}`
        : '/api/proxy/islr-retention-types';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al guardar');
      }
      setModalOpen(false);
      fetchTypes();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      const res = await fetch(`/api/proxy/islr-retention-types/${id}/toggle`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Error al cambiar estado');
      fetchTypes();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function personaLabel(t: IslrType): string {
    if (t.forPersonaJuridica) return 'PJ';
    if (t.forPersonaResidente) return 'PNR';
    return 'PNNR';
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20">
            <FileText className="text-orange-400" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Tipos de Retención ISLR</h1>
            <p className="text-sm text-slate-400">Decreto 1808 - {types.length} conceptos</p>
          </div>
        </div>
        <button onClick={openCreate}
          className="px-4 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-medium text-sm flex items-center gap-2 transition-colors">
          <Plus size={18} />
          Nuevo tipo
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300"><X size={16} /></button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-slate-400 mb-1 block">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Código o descripción..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-600" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer px-3 py-2">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-orange-500" />
            <span className="text-xs text-slate-400">Mostrar inactivos</span>
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-center px-3 py-2.5 text-slate-400 font-medium w-16">Cod.</th>
                <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Descripción</th>
                <th className="text-center px-3 py-2.5 text-slate-400 font-medium w-20">% Base</th>
                <th className="text-center px-3 py-2.5 text-slate-400 font-medium w-20">% Ret.</th>
                <th className="text-center px-3 py-2.5 text-slate-400 font-medium w-20">Sust. UT</th>
                <th className="text-center px-3 py-2.5 text-slate-400 font-medium w-20">Persona</th>
                <th className="text-center px-3 py-2.5 text-slate-400 font-medium w-20">Estado</th>
                <th className="text-center px-3 py-2.5 text-slate-400 font-medium w-24">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-10 text-slate-500">
                  <Loader2 className="animate-spin mx-auto" size={24} />
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-slate-500">
                  No se encontraron tipos de retención
                </td></tr>
              ) : (
                filtered.map(t => (
                  <tr key={t.id} className={`border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors ${!t.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2.5 text-center text-orange-400 font-mono font-bold">{t.codigo}</td>
                    <td className="px-3 py-2.5 text-slate-200">{t.descripcion}</td>
                    <td className="px-3 py-2.5 text-center text-slate-300 font-mono">{t.baseImponiblePct}%</td>
                    <td className="px-3 py-2.5 text-center text-slate-300 font-mono">{t.retentionPct}%</td>
                    <td className="px-3 py-2.5 text-center text-slate-300 font-mono">{t.sustraendoUt}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${
                        t.forPersonaJuridica
                          ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                          : t.forPersonaResidente
                          ? 'bg-green-500/15 text-green-400 border-green-500/30'
                          : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                      }`}>
                        {personaLabel(t)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${
                        t.isActive
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-red-500/15 text-red-400 border-red-500/30'
                      }`}>
                        {t.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEdit(t)}
                          className="p-1.5 rounded hover:bg-slate-600/60 text-slate-400 hover:text-blue-400 transition-colors"
                          title="Editar">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleToggle(t.id)}
                          className="p-1.5 rounded hover:bg-slate-600/60 text-slate-400 hover:text-orange-400 transition-colors"
                          title={t.isActive ? 'Desactivar' : 'Activar'}>
                          {t.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-100">
                {editing ? 'Editar tipo de retención' : 'Nuevo tipo de retención'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded hover:bg-slate-700 text-slate-400">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Código *</label>
                  <input type="number" value={form.codigo} onChange={e => setForm({ ...form, codigo: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">% Base imponible</label>
                  <input type="number" step="0.01" min="0" max="100" value={form.baseImponiblePct}
                    onChange={e => setForm({ ...form, baseImponiblePct: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Descripción *</label>
                <input type="text" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">% Retención *</label>
                  <input type="number" step="0.01" min="0" max="100" value={form.retentionPct}
                    onChange={e => setForm({ ...form, retentionPct: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Sustraendo (UT)</label>
                  <input type="number" step="0.01" min="0" value={form.sustraendoUt}
                    onChange={e => setForm({ ...form, sustraendoUt: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.forPersonaJuridica}
                    onChange={e => setForm({ ...form, forPersonaJuridica: e.target.checked })}
                    className="rounded border-slate-600 bg-slate-800 text-orange-500" />
                  <span className="text-sm text-slate-300">Persona Jurídica</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.forPersonaResidente}
                    onChange={e => setForm({ ...form, forPersonaResidente: e.target.checked })}
                    className="rounded border-slate-600 bg-slate-800 text-orange-500" />
                  <span className="text-sm text-slate-300">P.N. Residente</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-700">
              <button onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving || !form.descripcion || !form.codigo}
                className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-medium text-sm flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                {editing ? 'Guardar cambios' : 'Crear tipo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
