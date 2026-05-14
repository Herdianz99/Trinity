'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Layers, Plus, Edit2, Trash2, Loader2, X, ChevronRight, ChevronDown, FolderOpen, Folder, ExternalLink
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
  code: string | null;
  commissionPct: number;
  parentId: string | null;
  printAreaId: string | null;
  printArea: { id: string; name: string } | null;
  children: Category[];
}

interface PrintArea {
  id: string;
  name: string;
}

export default function CategoriesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [printAreas, setPrintAreas] = useState<PrintArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editPrintAreaId, setEditPrintAreaId] = useState('');
  const [editCommissionPct, setEditCommissionPct] = useState('0');
  const [addingParentId, setAddingParentId] = useState<string | null | 'root'>(null);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newPrintAreaId, setNewPrintAreaId] = useState('');
  const [newCommissionPct, setNewCommissionPct] = useState('0');
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

  async function fetchPrintAreas() {
    try {
      const res = await fetch('/api/proxy/print-areas');
      if (res.ok) {
        const data = await res.json();
        setPrintAreas(data);
      }
    } catch { /* ignore */ }
  }

  useEffect(() => { fetchCategories(); fetchPrintAreas(); }, []);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleAdd(parentId: string | null) {
    if (!newName.trim()) return;
    const isRoot = parentId === null;
    if (isRoot && newCode.length !== 3) {
      setMessage({ type: 'error', text: 'El codigo debe tener exactamente 3 letras' });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { name: newName.trim() };
      if (parentId) body.parentId = parentId;
      if (isRoot) {
        body.code = newCode.toUpperCase();
        if (newPrintAreaId) body.printAreaId = newPrintAreaId;
        body.commissionPct = parseFloat(newCommissionPct) || 0;
      }
      const res = await fetch('/api/proxy/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setNewName('');
        setNewCode('');
        setNewPrintAreaId('');
        setNewCommissionPct('0');
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

  async function handleUpdate(id: string, isRoot: boolean) {
    if (!editName.trim()) return;
    if (isRoot && editCode.length !== 3) {
      setMessage({ type: 'error', text: 'El codigo debe tener exactamente 3 letras' });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { name: editName.trim() };
      if (isRoot) {
        body.code = editCode.toUpperCase();
        body.printAreaId = editPrintAreaId || null;
        body.commissionPct = parseFloat(editCommissionPct) || 0;
      }
      const res = await fetch(`/api/proxy/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
    const isRoot = depth === 0;

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
              {isRoot && (
                <input
                  type="text"
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))}
                  placeholder="COD"
                  maxLength={3}
                  className="input-field !py-1 !px-2 text-sm w-16 uppercase text-center tracking-wider font-mono"
                  autoFocus
                />
              )}
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleUpdate(cat.id, isRoot); if (e.key === 'Escape') setEditingId(null); }}
                className="input-field !py-1 !px-2 text-sm flex-1"
                autoFocus={!isRoot}
              />
              {isRoot && (
                <select
                  value={editPrintAreaId}
                  onChange={(e) => setEditPrintAreaId(e.target.value)}
                  className="input-field !py-1 !px-2 text-sm w-40"
                >
                  <option value="">Sin area</option>
                  {printAreas.map(pa => (
                    <option key={pa.id} value={pa.id}>{pa.name}</option>
                  ))}
                </select>
              )}
              {isRoot && (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={editCommissionPct}
                    onChange={(e) => setEditCommissionPct(e.target.value)}
                    min="0"
                    max="100"
                    step="0.1"
                    className="input-field !py-1 !px-2 text-sm w-16 text-center"
                    placeholder="0"
                  />
                  <span className="text-xs text-slate-500">%com</span>
                </div>
              )}
              <button
                onClick={() => handleUpdate(cat.id, isRoot)}
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
              <button
                onClick={() => router.push(`/catalog/categories/${cat.id}`)}
                className={`flex-1 text-sm text-left hover:underline ${depth === 0 ? 'font-semibold text-white' : 'text-slate-300'}`}
              >
                {isRoot && cat.code ? (
                  <><span className="text-amber-400 font-mono tracking-wider">{cat.code}</span><span className="text-slate-600 mx-1.5">&mdash;</span>{cat.name}</>
                ) : cat.name}
              </button>
              {isRoot && cat.printArea && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 border border-slate-600/40">
                  {cat.printArea.name}
                </span>
              )}
              {isRoot && cat.commissionPct > 0 && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                  {cat.commissionPct}% com
                </span>
              )}
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
                  onClick={() => { setAddingParentId(cat.id); setNewName(''); setNewCode(''); setNewPrintAreaId(''); }}
                  className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-green-400 transition-colors"
                  title="Agregar subcategoria"
                >
                  <Plus size={14} />
                </button>
              )}
              <button
                onClick={() => {
                  setEditingId(cat.id);
                  setEditName(cat.name);
                  setEditCode(cat.code || '');
                  setEditPrintAreaId(cat.printAreaId || '');
                  setEditCommissionPct(String(cat.commissionPct || 0));
                }}
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
          onClick={() => { setAddingParentId('root'); setNewName(''); setNewCode(''); setNewPrintAreaId(''); }}
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
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))}
              placeholder="COD"
              maxLength={3}
              className="input-field !py-1.5 !px-2 text-sm w-16 uppercase text-center tracking-wider font-mono"
              autoFocus
            />
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(null); if (e.key === 'Escape') setAddingParentId(null); }}
              placeholder="Nombre de categoria..."
              className="input-field !py-1.5 !px-2 text-sm flex-1"
            />
            <select
              value={newPrintAreaId}
              onChange={(e) => setNewPrintAreaId(e.target.value)}
              className="input-field !py-1.5 !px-2 text-sm w-40"
            >
              <option value="">Sin area</option>
              {printAreas.map(pa => (
                <option key={pa.id} value={pa.id}>{pa.name}</option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={newCommissionPct}
                onChange={(e) => setNewCommissionPct(e.target.value)}
                min="0"
                max="100"
                step="0.1"
                className="input-field !py-1.5 !px-2 text-sm w-16 text-center"
                placeholder="0"
              />
              <span className="text-xs text-slate-500">%</span>
            </div>
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
