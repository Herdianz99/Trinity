'use client';

import { useState, useEffect } from 'react';
import {
  Truck, Plus, Edit2, Trash2, Loader2, X, Phone, Mail, MapPin, User, Shield, Eye, DollarSign, Receipt
} from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  rif: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  contactName: string | null;
  isRetentionAgent: boolean;
  isActive: boolean;
  _count?: { products: number };
}

const defaultForm = {
  name: '', rif: '', phone: '', email: '', address: '', contactName: '',
  isRetentionAgent: false, isActive: true,
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Account statement modal
  const [accountModal, setAccountModal] = useState(false);
  const [accountData, setAccountData] = useState<any>(null);
  const [accountLoading, setAccountLoading] = useState(false);

  async function fetchSuppliers() {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/suppliers');
      if (res.ok) setSuppliers(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchSuppliers(); }, []);

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setModalOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      rif: s.rif || '',
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      contactName: s.contactName || '',
      isRetentionAgent: s.isRetentionAgent,
      isActive: s.isActive,
    });
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const body = {
        name: form.name,
        rif: form.rif || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        contactName: form.contactName || undefined,
        isRetentionAgent: form.isRetentionAgent,
        isActive: form.isActive,
      };

      const url = editingId ? `/api/proxy/suppliers/${editingId}` : '/api/proxy/suppliers';
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setModalOpen(false);
        fetchSuppliers();
        setMessage({ type: 'success', text: editingId ? 'Proveedor actualizado' : 'Proveedor creado' });
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

  async function openAccountStatement(s: Supplier) {
    setAccountLoading(true);
    setAccountModal(true);
    try {
      const res = await fetch(`/api/proxy/payables/supplier/${s.id}`);
      if (res.ok) {
        setAccountData(await res.json());
      }
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar estado de cuenta' });
    } finally {
      setAccountLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Desactivar este proveedor?')) return;
    const res = await fetch(`/api/proxy/suppliers/${id}`, { method: 'DELETE' });
    if (res.ok) fetchSuppliers();
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Truck className="text-blue-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Proveedores</h1>
            <p className="text-slate-400 text-sm">{suppliers.length} proveedores registrados</p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nuevo proveedor
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
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">RIF</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Telefono</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Email</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden xl:table-cell">Contacto</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Ret.</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium w-28">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12">
                  <Loader2 className="animate-spin text-green-500 mx-auto" size={28} />
                </td></tr>
              ) : suppliers.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-500">
                  No hay proveedores registrados
                </td></tr>
              ) : suppliers.map(s => (
                <tr key={s.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors group">
                  <td className="px-4 py-3 text-white font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-slate-400 hidden md:table-cell font-mono text-xs">{s.rif || '—'}</td>
                  <td className="px-4 py-3 text-slate-400 hidden lg:table-cell">{s.phone || '—'}</td>
                  <td className="px-4 py-3 text-slate-400 hidden lg:table-cell">{s.email || '—'}</td>
                  <td className="px-4 py-3 text-slate-400 hidden xl:table-cell">{s.contactName || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {s.isRetentionAgent ? (
                      <span title="Agente de retencion"><Shield size={16} className="inline text-amber-400" /></span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s.isActive ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Activo</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openAccountStatement(s)}
                        className="p-1.5 rounded-lg hover:bg-blue-500/10 text-slate-400 hover:text-blue-400 transition-colors"
                        title="Estado de cuenta"
                      >
                        <Receipt size={14} />
                      </button>
                      <button
                        onClick={() => openEdit(s)}
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
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
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-xl">
            <div className="border-b border-slate-700/50 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                {editingId ? 'Editar proveedor' : 'Nuevo proveedor'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
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
                  <label className="block text-xs font-medium text-slate-400 mb-1">RIF</label>
                  <input
                    type="text"
                    value={form.rif}
                    onChange={(e) => setForm(f => ({ ...f, rif: e.target.value }))}
                    className="input-field !py-2 text-sm"
                    placeholder="J-12345678-9"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Telefono</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="input-field !py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                    className="input-field !py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Persona de contacto</label>
                  <input
                    type="text"
                    value={form.contactName}
                    onChange={(e) => setForm(f => ({ ...f, contactName: e.target.value }))}
                    className="input-field !py-2 text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Direccion</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
                    className="input-field !py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.isRetentionAgent}
                    onChange={(e) => setForm(f => ({ ...f, isRetentionAgent: e.target.checked }))}
                    className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40"
                  />
                  Agente de retencion
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))}
                    className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40"
                  />
                  Activo
                </label>
              </div>
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/50">
                <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary !py-2.5 text-sm">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
                  {saving && <Loader2 className="animate-spin" size={16} />}
                  {editingId ? 'Guardar cambios' : 'Crear proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Account Statement Modal */}
      {accountModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setAccountModal(false); setAccountData(null); }} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold text-white">Estado de Cuenta</h2>
                {accountData && <p className="text-sm text-slate-400">{accountData.supplier.name}</p>}
              </div>
              <button onClick={() => { setAccountModal(false); setAccountData(null); }} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><X size={18} /></button>
            </div>
            <div className="p-6">
              {accountLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-slate-400" size={28} /></div>
              ) : accountData ? (
                <div className="space-y-4">
                  {/* Summary cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                      <p className="text-xs text-slate-400 mb-1">Total adeudado</p>
                      <p className="text-lg font-bold text-red-400">${accountData.totalDebt.toFixed(2)}</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                      <p className="text-xs text-slate-400 mb-1">Vencido</p>
                      <p className="text-lg font-bold text-red-500">${accountData.totalOverdue.toFixed(2)}</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                      <p className="text-xs text-slate-400 mb-1">Retenciones</p>
                      <p className="text-lg font-bold text-orange-400">${accountData.totalRetention.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Payables list */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-300 mb-2">Cuentas por pagar</h3>
                    {accountData.payables && accountData.payables.length > 0 ? (
                      <div className="bg-slate-900/50 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-700/50">
                              <th className="text-left px-3 py-2 text-slate-400">Orden</th>
                              <th className="text-right px-3 py-2 text-slate-400">Neto USD</th>
                              <th className="text-right px-3 py-2 text-slate-400">Saldo</th>
                              <th className="text-left px-3 py-2 text-slate-400">Vence</th>
                              <th className="text-left px-3 py-2 text-slate-400">Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {accountData.payables.map((p: any) => (
                              <tr key={p.id} className="border-b border-slate-700/30">
                                <td className="px-3 py-2 font-mono text-xs text-slate-300">{p.purchaseOrder?.number || '-'}</td>
                                <td className="px-3 py-2 text-right text-slate-200">${p.netPayableUsd.toFixed(2)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-slate-100">${p.balanceUsd.toFixed(2)}</td>
                                <td className="px-3 py-2 text-xs text-slate-300">
                                  {p.dueDate ? new Date(p.dueDate).toLocaleDateString() : '-'}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${
                                    p.status === 'PENDING' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' :
                                    p.status === 'PARTIAL' ? 'text-blue-400 border-blue-500/30 bg-blue-500/10' :
                                    p.status === 'PAID' ? 'text-green-400 border-green-500/30 bg-green-500/10' :
                                    'text-red-400 border-red-500/30 bg-red-500/10'
                                  }`}>
                                    {p.status === 'PENDING' ? 'Pendiente' : p.status === 'PARTIAL' ? 'Parcial' : p.status === 'PAID' ? 'Pagado' : 'Vencido'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 bg-slate-900/50 rounded-lg p-3">Sin cuentas por pagar</p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
