'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  Plus,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Loader2,
  X,
  Shield,
} from 'lucide-react';

interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
}

export default function ExpenseCategoriesPage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [userRole, setUserRole] = useState('');

  useEffect(() => {
    fetch('/api/proxy/auth/me').then(r => r.json()).then(data => {
      setUserRole(data.role || '');
    }).catch(() => {});
  }, []);

  const isAdmin = userRole === 'ADMIN';

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/expense-categories');
      const data = await res.json();
      setCategories(data);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar categorias' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [message]);

  function openCreateModal() {
    setEditing(null);
    setFormName('');
    setFormDescription('');
    setModalOpen(true);
  }

  function openEditModal(cat: ExpenseCategory) {
    setEditing(cat);
    setFormName(cat.name);
    setFormDescription(cat.description || '');
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    try {
      const body = { name: formName, description: formDescription || undefined };
      const url = editing ? `/api/proxy/expense-categories/${editing.id}` : '/api/proxy/expense-categories';
      const method = editing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error');
      }

      setMessage({ type: 'success', text: editing ? 'Categoria actualizada' : 'Categoria creada' });
      setModalOpen(false);
      fetchCategories();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      const res = await fetch(`/api/proxy/expense-categories/${id}/toggle-active`, { method: 'PATCH' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error');
      }
      fetchCategories();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  if (!isAdmin && userRole) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px]">
        <Shield className="text-slate-600 mb-3" size={48} />
        <p className="text-slate-400 text-sm">Solo administradores pueden acceder a esta seccion</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Layers className="text-purple-400" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Categorias de Gastos</h1>
            <p className="text-sm text-slate-400">{categories.length} categorias</p>
          </div>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Nueva categoria
        </button>
      </div>

      {/* Toast */}
      {message && (
        <div className={`px-4 py-3 rounded-xl border text-sm font-medium ${
          message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'
        }`}>
          {message.text}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-700/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800/60 border-b border-slate-700/50">
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Descripcion</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Predefinida</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12"><Loader2 className="animate-spin inline-block text-slate-500" size={24} /></td></tr>
            ) : categories.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-slate-500">No hay categorias</td></tr>
            ) : (
              categories.map((cat) => (
                <tr key={cat.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 text-slate-200 font-medium">{cat.name}</td>
                  <td className="px-4 py-3 text-slate-400">{cat.description || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    {cat.isDefault && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30">
                        Predefinida
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                      cat.isActive
                        ? 'bg-green-500/10 text-green-400 border-green-500/30'
                        : 'bg-slate-500/10 text-slate-500 border-slate-500/30'
                    }`}>
                      {cat.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEditModal(cat)} className="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-blue-400 transition-colors" title="Editar">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleToggle(cat.id)} className="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-amber-400 transition-colors" title={cat.isActive ? 'Desactivar' : 'Activar'}>
                        {cat.isActive ? <ToggleRight size={16} className="text-green-400" /> : <ToggleLeft size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-100">
                {editing ? 'Editar categoria' : 'Nueva categoria'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm"
                  placeholder="Nombre de la categoria"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Descripcion</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm"
                  placeholder="Descripcion opcional"
                />
              </div>
              <button
                type="submit"
                disabled={processing}
                className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
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
