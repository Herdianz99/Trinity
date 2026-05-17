'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  KeyRound,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ScrollText,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';

interface DynKey {
  id: string;
  name: string;
  isActive: boolean;
  permissions: string[];
  createdBy: { id: string; name: string };
  logCount: number;
  createdAt: string;
}

const PERM_LABELS: Record<string, string> = {
  DELETE_CREDIT_NOTE_SALE: 'Eliminar NC Venta',
  DELETE_DEBIT_NOTE_SALE: 'Eliminar ND Venta',
  DELETE_CREDIT_NOTE_PURCHASE: 'Eliminar NC Compra',
  DELETE_DEBIT_NOTE_PURCHASE: 'Eliminar ND Compra',
  DELETE_RECEIPT_COLLECTION: 'Eliminar recibo cobro',
  DELETE_RECEIPT_PAYMENT: 'Eliminar recibo pago',
  DELETE_EXPENSE: 'Eliminar gasto',
  MODIFY_PRODUCT_PRICE: 'Modificar precio',
  CANCEL_CASH_SESSION: 'Anular sesion caja',
  CHANGE_EXCHANGE_RATE: 'Cambiar tasa BCV',
  MANUAL_STOCK_ADJUSTMENT: 'Ajuste inventario',
  GIVE_DISCOUNT: 'Dar descuento POS',
  ALLOW_CREDIT_INVOICE: 'Facturar a credito',
};

const ALL_PERMS = Object.keys(PERM_LABELS);

export default function DynamicKeysPage() {
  const router = useRouter();
  const [keys, setKeys] = useState<DynKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', key: '', permissions: [] as string[] });
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/dynamic-keys');
      const data = await res.json();
      setKeys(Array.isArray(data) ? data : []);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar claves' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  function openCreate() {
    setEditingId(null);
    setForm({ name: '', key: '', permissions: [] });
    setShowKey(false);
    setModalOpen(true);
  }

  function openEdit(dk: DynKey) {
    setEditingId(dk.id);
    setForm({ name: dk.name, key: '', permissions: [...dk.permissions] });
    setShowKey(false);
    setModalOpen(true);
  }

  function togglePerm(perm: string) {
    setForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm],
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || form.permissions.length === 0) return;
    if (!editingId && !form.key.trim()) return;

    setSaving(true);
    try {
      const body: any = { name: form.name, permissions: form.permissions };
      if (form.key) body.key = form.key;

      const url = editingId
        ? `/api/proxy/dynamic-keys/${editingId}`
        : '/api/proxy/dynamic-keys';
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al guardar');
      }

      setMessage({ type: 'success', text: editingId ? 'Clave actualizada' : 'Clave creada' });
      setModalOpen(false);
      fetchKeys();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      const res = await fetch(`/api/proxy/dynamic-keys/${id}/toggle-active`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Error');
      fetchKeys();
    } catch {
      setMessage({ type: 'error', text: 'Error al cambiar estado' });
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta clave permanentemente?')) return;
    try {
      const res = await fetch(`/api/proxy/dynamic-keys/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error');
      setMessage({ type: 'success', text: 'Clave eliminada' });
      fetchKeys();
    } catch {
      setMessage({ type: 'error', text: 'Error al eliminar' });
    }
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <KeyRound className="text-amber-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Claves de autorizacion</h1>
            <p className="text-slate-400 text-sm">Gestiona claves dinamicas para acciones protegidas</p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary text-sm flex items-center gap-2">
          <Plus size={16} /> Nueva clave
        </button>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          {message.text}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-amber-500" size={28} /></div>
        ) : keys.length === 0 ? (
          <div className="text-center py-12 text-slate-500">No hay claves registradas</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Permisos</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Creada por</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Usos</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {keys.map(dk => (
                <tr key={dk.id} className="border-b border-slate-700/30 hover:bg-slate-800/40">
                  <td className="px-4 py-3 text-white font-medium">{dk.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {dk.permissions.slice(0, 3).map(p => (
                        <span key={p} className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          {PERM_LABELS[p] || p}
                        </span>
                      ))}
                      {dk.permissions.length > 3 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20">
                          +{dk.permissions.length - 3} mas
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${dk.isActive ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-slate-400 border-slate-500/30 bg-slate-500/10'}`}>
                      {dk.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 hidden md:table-cell">{dk.createdBy.name}</td>
                  <td className="px-4 py-3 text-right text-slate-400 hidden md:table-cell">{dk.logCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(dk)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-blue-400" title="Editar">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleToggle(dk.id)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-amber-400" title={dk.isActive ? 'Desactivar' : 'Activar'}>
                        {dk.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      </button>
                      <button onClick={() => router.push(`/settings/dynamic-keys/${dk.id}/logs`)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-green-400" title="Ver logs">
                        <ScrollText size={14} />
                      </button>
                      <button onClick={() => handleDelete(dk.id)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-red-400" title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-white">
                {editingId ? 'Editar clave' : 'Nueva clave'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-5">
              {/* Name */}
              <div>
                <label className="text-sm text-slate-400 block mb-1">Nombre</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ej: Autorizacion Maria Supervisora"
                  className="input-field !py-2.5 text-sm w-full"
                  required
                />
              </div>

              {/* Key */}
              <div>
                <label className="text-sm text-slate-400 block mb-1">
                  Clave {editingId && <span className="text-slate-500">(dejar vacio para no cambiar)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={form.key}
                    onChange={e => setForm(prev => ({ ...prev, key: e.target.value }))}
                    placeholder={editingId ? 'Nueva clave (opcional)' : 'Clave de autorizacion'}
                    className="input-field !py-2.5 !pr-12 text-sm w-full"
                    required={!editingId}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Permissions grid */}
              <div>
                <label className="text-sm text-slate-400 block mb-2">Permisos</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ALL_PERMS.map(perm => (
                    <label
                      key={perm}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                        form.permissions.includes(perm)
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                          : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form.permissions.includes(perm)}
                        onChange={() => togglePerm(perm)}
                        className="rounded border-slate-600 bg-slate-700 text-amber-500 focus:ring-amber-500/30"
                      />
                      <span className="text-xs">{PERM_LABELS[perm]}</span>
                    </label>
                  ))}
                </div>
                {form.permissions.length === 0 && (
                  <p className="text-xs text-red-400 mt-1">Selecciona al menos un permiso</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="flex-1 btn-secondary !py-2.5 text-sm">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.name.trim() || form.permissions.length === 0 || (!editingId && !form.key.trim())}
                  className="flex-1 btn-primary !py-2.5 text-sm flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 className="animate-spin" size={16} />}
                  {editingId ? 'Guardar cambios' : 'Crear clave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
