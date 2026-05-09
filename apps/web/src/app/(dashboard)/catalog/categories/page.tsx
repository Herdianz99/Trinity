'use client';

import { useState, useEffect } from 'react';
import {
  Layers, Plus, Edit2, Trash2, Loader2, X, ChevronRight, ChevronDown, FolderOpen, Folder
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
  parentId: string | null;
  children: Category[];
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [addingParentId, setAddingParentId] = useState<string | null | 'root'>(null);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function fetchCategories() {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
        // Auto-expand all
        const ids = new Set<string>();
        data.forEach((c: Category) => ids.add(c.id));
        setExpanded(ids);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchCategories(); }, []);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleAdd(parentId: string | null) {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/proxy/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), parentId: parentId || undefined }),
      });
      if (res.ok) {
        setNewName('');
        setAddingParentId(null);
        fetchCategories();
        setMessage({ type: 'success', text: 'Categoria creada' });
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: err.message || 'Error al crear' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error al crear categoria' });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/proxy/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok) {
        setEditingId(null);
        fetchCategories();
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: err.message || 'Error al actualizar' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error al actualizar' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Eliminar la categoria "${name}"?`)) return;
    try {
      const res = await fetch(`/api/proxy/categories/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchCategories();
        setMessage({ type: 'success', text: 'Categoria eliminada' });
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: err.message || 'Error al eliminar' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error al eliminar' });
    }
  }

  function renderCategory(cat: Category, depth: number = 0) {
    const isExpanded = expanded.has(cat.id);
    const hasChildren = cat.children && cat.children.length > 0;
    const isEditing = editingId === cat.id;

    return (
      <div key={cat.id}>
        <div
          className={`flex items-center gap-2 px-4 py-2.5 hover:bg-slate-800/60 transition-colors group ${depth > 0 ? 'ml-6 border-l border-slate-700/50' : ''}`}
        >
          {/* Expand toggle */}
          <button
            onClick={() => toggleExpand(cat.id)}
            className="p-0.5 rounded text-slate-500 hover:text-slate-300"
            disabled={!hasChildren}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
            ) : <span className="w-4" />}
          </button>

          {/* Icon */}
          {hasChildren && isExpanded ? (
            <FolderOpen size={18} className="text-amber-400" />
          ) : (
            <Folder size={18} className={depth === 0 ? 'text-amber-400' : 'text-slate-500'} />
          )}

          {/* Name / Edit */}
          {isEditing ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleUpdate(cat.id); if (e.key === 'Escape') setEditingId(null); }}
                className="input-field !py-1 !px-2 text-sm flex-1"
                autoFocus
              />
              <button
                onClick={() => handleUpdate(cat.id)}
                disabled={saving}
                className="text-xs text-green-400 hover:text-green-300 font-medium"
              >
                Guardar
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="text-xs text-slate-400 hover:text-slate-300"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <>
              <span className={`flex-1 text-sm ${depth === 0 ? 'font-semibold text-white' : 'text-slate-300'}`}>
                {cat.name}
              </span>
              <span className="text-xs text-slate-600 mr-2">
                {hasChildren ? `${cat.children.length} sub` : ''}
              </span>
            </>
          )}

          {/* Actions */}
          {!isEditing && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {depth === 0 && (
                <button
                  onClick={() => { setAddingParentId(cat.id); setNewName(''); }}
                  className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-green-400 transition-colors"
                  title="Agregar subcategoria"
                >
                  <Plus size={14} />
                </button>
              )}
              <button
                onClick={() => { setEditingId(cat.id); setEditName(cat.name); }}
                className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition-colors"
                title="Editar"
              >
                <Edit2 size={14} />
              </button>
              <button
                onClick={() => handleDelete(cat.id, cat.name)}
                className="p-1 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
                title="Eliminar"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Inline add subcategory */}
        {addingParentId === cat.id && (
          <div className="flex items-center gap-2 ml-12 px-4 py-2 border-l border-slate-700/50">
            <Folder size={16} className="text-slate-600" />
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(cat.id); if (e.key === 'Escape') setAddingParentId(null); }}
              placeholder="Nombre de subcategoria..."
              className="input-field !py-1 !px-2 text-sm flex-1"
              autoFocus
            />
            <button onClick={() => handleAdd(cat.id)} disabled={saving} className="text-xs text-green-400 hover:text-green-300 font-medium">
              {saving ? <Loader2 className="animate-spin" size={14} /> : 'Crear'}
            </button>
            <button onClick={() => setAddingParentId(null)} className="text-xs text-slate-400 hover:text-slate-300">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Children */}
        {isExpanded && hasChildren && cat.children.map(child => renderCategory(child, depth + 1))}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <Layers className="text-amber-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Categorias</h1>
            <p className="text-slate-400 text-sm">Organiza tus productos en categorias y subcategorias</p>
          </div>
        </div>
        <button
          onClick={() => { setAddingParentId('root'); setNewName(''); }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} /> Nueva categoria
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      <div className="card overflow-hidden">
        {/* Inline add root category */}
        {addingParentId === 'root' && (
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50 bg-slate-800/60">
            <Folder size={18} className="text-amber-400" />
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(null); if (e.key === 'Escape') setAddingParentId(null); }}
              placeholder="Nombre de categoria..."
              className="input-field !py-1.5 !px-2 text-sm flex-1"
              autoFocus
            />
            <button onClick={() => handleAdd(null)} disabled={saving} className="text-sm text-green-400 hover:text-green-300 font-medium">
              {saving ? <Loader2 className="animate-spin" size={14} /> : 'Crear'}
            </button>
            <button onClick={() => setAddingParentId(null)} className="text-slate-400 hover:text-slate-300">
              <X size={16} />
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center">
            <Loader2 className="animate-spin text-green-500 mx-auto" size={28} />
          </div>
        ) : categories.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            No hay categorias registradas
          </div>
        ) : (
          <div className="divide-y divide-slate-700/30">
            {categories.map(cat => renderCategory(cat))}
          </div>
        )}
      </div>
    </div>
  );
}
