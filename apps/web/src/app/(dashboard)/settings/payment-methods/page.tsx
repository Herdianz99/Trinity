'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';

interface PaymentMethod {
  id: string;
  name: string;
  isDivisa: boolean;
  createsReceivable: boolean;
  isActive: boolean;
  sortOrder: number;
  fiscalCode: string | null;
  parentId: string | null;
  children?: PaymentMethod[];
}

export default function PaymentMethodsPage() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formIsDivisa, setFormIsDivisa] = useState(false);
  const [formCreatesReceivable, setFormCreatesReceivable] = useState(false);
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [formFiscalCode, setFormFiscalCode] = useState('');
  const [formParentId, setFormParentId] = useState('');

  const fetchMethods = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/payment-methods');
      const data = await res.json();
      if (Array.isArray(data)) setMethods(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMethods();
  }, [fetchMethods]);

  function toggleGroup(id: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCreateModal(parentId?: string) {
    setEditingMethod(null);
    setFormName('');
    setFormIsDivisa(false);
    setFormCreatesReceivable(false);
    setFormSortOrder(0);
    setFormFiscalCode('');
    setFormParentId(parentId || '');
    setModalOpen(true);
  }

  function openEditModal(method: PaymentMethod) {
    setEditingMethod(method);
    setFormName(method.name);
    setFormIsDivisa(method.isDivisa);
    setFormCreatesReceivable(method.createsReceivable);
    setFormSortOrder(method.sortOrder);
    setFormFiscalCode(method.fiscalCode || '');
    setFormParentId(method.parentId || '');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const body: any = {
        name: formName.trim(),
        isDivisa: formIsDivisa,
        createsReceivable: formCreatesReceivable,
        sortOrder: formSortOrder,
        fiscalCode: formFiscalCode || undefined,
        parentId: formParentId || undefined,
      };

      const url = editingMethod
        ? `/api/proxy/payment-methods/${editingMethod.id}`
        : '/api/proxy/payment-methods';
      const method = editingMethod ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al guardar');
      }

      setModalOpen(false);
      setMessage({ type: 'success', text: editingMethod ? 'Metodo actualizado' : 'Metodo creado' });
      fetchMethods();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(id: string) {
    try {
      const res = await fetch(`/api/proxy/payment-methods/${id}/toggle-active`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Error al cambiar estado');
      fetchMethods();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar "${name}"? Esta accion no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/proxy/payment-methods/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al eliminar');
      }
      setMessage({ type: 'success', text: `"${name}" eliminado` });
      fetchMethods();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/config" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white">Metodos de Pago</h1>
            <p className="text-sm text-slate-400 mt-0.5">Gestiona los metodos de pago disponibles en el sistema</p>
          </div>
        </div>
        <button
          onClick={() => openCreateModal()}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          Nuevo metodo
        </button>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
          {message.text}
        </div>
      )}

      <div className="space-y-2">
        {methods.map(parent => {
          const hasChildren = parent.children && parent.children.length > 0;
          const isExpanded = expandedGroups.has(parent.id);

          return (
            <div key={parent.id} className="card overflow-hidden">
              {/* Parent row */}
              <div className="flex items-center gap-3 px-4 py-3">
                <GripVertical size={16} className="text-slate-600 flex-shrink-0" />

                {hasChildren ? (
                  <button onClick={() => toggleGroup(parent.id)} className="text-slate-400 hover:text-white">
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                ) : (
                  <div className="w-4" />
                )}

                <div className="flex-1 min-w-0">
                  <span className={`font-medium ${parent.isActive ? 'text-white' : 'text-slate-500 line-through'}`}>
                    {parent.name}
                  </span>
                  <div className="flex gap-2 mt-0.5">
                    {parent.isDivisa && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        Divisa
                      </span>
                    )}
                    {!parent.isDivisa && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 border border-slate-500/20">
                        Bolivares
                      </span>
                    )}
                    {parent.createsReceivable && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Genera CxC
                      </span>
                    )}
                    {parent.fiscalCode && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        Fiscal: {parent.fiscalCode}
                      </span>
                    )}
                    {hasChildren && (
                      <span className="text-xs text-slate-500">
                        {parent.children!.length} variante{parent.children!.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {hasChildren && (
                    <button
                      onClick={() => openCreateModal(parent.id)}
                      className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-green-400"
                      title="Agregar variante"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                  {!hasChildren && !parent.children?.length && (
                    <button
                      onClick={() => openCreateModal(parent.id)}
                      className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-green-400"
                      title="Agregar variante"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => openEditModal(parent)}
                    className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-blue-400"
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleToggleActive(parent.id)}
                    className={`p-1.5 rounded hover:bg-slate-700 ${parent.isActive ? 'text-green-400' : 'text-slate-500'}`}
                    title={parent.isActive ? 'Desactivar' : 'Activar'}
                  >
                    {parent.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  </button>
                  <button
                    onClick={() => handleDelete(parent.id, parent.name)}
                    className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-red-400"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Children rows */}
              {hasChildren && isExpanded && (
                <div className="border-t border-slate-700/50">
                  {parent.children!.map(child => (
                    <div key={child.id} className="flex items-center gap-3 px-4 py-2.5 pl-14 bg-slate-800/30">
                      <GripVertical size={14} className="text-slate-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm ${child.isActive ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                          {child.name}
                        </span>
                        {child.fiscalCode && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            {child.fiscalCode}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(child)}
                          className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-blue-400"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleToggleActive(child.id)}
                          className={`p-1 rounded hover:bg-slate-700 ${child.isActive ? 'text-green-400' : 'text-slate-500'}`}
                        >
                          {child.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        </button>
                        <button
                          onClick={() => handleDelete(child.id, child.name)}
                          className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-red-400"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {methods.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          No hay metodos de pago configurados
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-white mb-4">
              {editingMethod ? 'Editar metodo' : formParentId ? 'Nueva variante' : 'Nuevo metodo de pago'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-400">Nombre</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="input-field mt-1"
                  placeholder="Ej: Efectivo USD"
                />
              </div>

              {!formParentId && (
                <>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formIsDivisa}
                        onChange={e => setFormIsDivisa(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-green-500"
                      />
                      <span className="text-sm text-slate-300">Es divisa (USD/moneda extranjera)</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formCreatesReceivable}
                        onChange={e => setFormCreatesReceivable(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-green-500"
                      />
                      <span className="text-sm text-slate-300">Genera cuenta por cobrar (plataforma financiamiento)</span>
                    </label>
                  </div>
                </>
              )}

              <div>
                <label className="text-sm text-slate-400">Codigo fiscal (para impresora)</label>
                <input
                  type="text"
                  value={formFiscalCode}
                  onChange={e => setFormFiscalCode(e.target.value)}
                  className="input-field mt-1"
                  placeholder="Ej: PDB, PMB"
                />
              </div>

              <div>
                <label className="text-sm text-slate-400">Orden</label>
                <input
                  type="number"
                  value={formSortOrder}
                  onChange={e => setFormSortOrder(Number(e.target.value))}
                  className="input-field mt-1"
                  min="0"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalOpen(false)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim()}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editingMethod ? 'Guardar cambios' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
