'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserCheck,
  Plus,
  Search,
  Loader2,
  X,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  rif: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  type: 'NATURAL' | 'JURIDICA';
  creditLimit: number;
  creditDays: number;
  isActive: boolean;
  createdAt: string;
}

const defaultForm: {
  name: string;
  rif: string;
  phone: string;
  email: string;
  address: string;
  type: 'NATURAL' | 'JURIDICA';
  creditLimit: number;
  creditDays: number;
} = {
  name: '',
  rif: '',
  phone: '',
  email: '',
  address: '',
  type: 'NATURAL',
  creditLimit: 0,
  creditDays: 0,
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (search) params.set('search', search);
      const res = await fetch(`/api/proxy/customers?${params}`);
      const data = await res.json();
      setCustomers(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar clientes' });
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setModalOpen(true);
  }

  function openEdit(c: Customer) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      rif: c.rif || '',
      phone: c.phone || '',
      email: c.email || '',
      address: c.address || '',
      type: c.type,
      creditLimit: c.creditLimit,
      creditDays: c.creditDays,
    });
    setModalOpen(true);
  }

  async function openDetail(id: string) {
    try {
      const res = await fetch(`/api/proxy/customers/${id}`);
      const data = await res.json();
      setDetailCustomer(data);
      setDetailOpen(true);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar detalle' });
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const url = editingId
        ? `/api/proxy/customers/${editingId}`
        : '/api/proxy/customers';
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          creditLimit: Number(form.creditLimit),
          creditDays: Number(form.creditDays),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al guardar');
      }
      setModalOpen(false);
      fetchCustomers();
      setMessage({ type: 'success', text: editingId ? 'Cliente actualizado' : 'Cliente creado' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Desactivar este cliente?')) return;
    try {
      const res = await fetch(`/api/proxy/customers/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
      fetchCustomers();
      setMessage({ type: 'success', text: 'Cliente desactivado' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <UserCheck className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Clientes</h1>
            <p className="text-slate-400 text-sm">{total} clientes registrados</p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nuevo cliente
        </button>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          {message.text}
        </div>
      )}

      {/* Search */}
      <div className="card p-4 mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            type="text"
            placeholder="Buscar por nombre, RIF, telefono..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input-field pl-9 !py-2.5 text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden sm:table-cell">RIF</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Telefono</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Tipo</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Credito USD</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12">
                  <Loader2 className="animate-spin text-green-500 mx-auto" size={28} />
                </td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-500">
                  No se encontraron clientes
                </td></tr>
              ) : customers.map(c => (
                <tr key={c.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 cursor-pointer" onClick={() => openDetail(c.id)}>
                  <td className="px-4 py-3 text-white font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-slate-300 hidden sm:table-cell">{c.rif || '-'}</td>
                  <td className="px-4 py-3 text-slate-300 hidden md:table-cell">{c.phone || '-'}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${c.type === 'JURIDICA' ? 'text-blue-400 border-blue-500/30 bg-blue-500/10' : 'text-slate-300 border-slate-600 bg-slate-700/30'}`}>
                      {c.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300">${c.creditLimit.toFixed(2)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${c.isActive ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-red-400 border-red-500/30 bg-red-500/10'}`}>
                      {c.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-blue-400" title="Editar">
                        <Edit2 size={15} />
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-red-400" title="Desactivar">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <span className="text-sm text-slate-400">Pag. {page} de {totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30">
                <ChevronLeft size={18} />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-white">{editingId ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Nombre *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field !py-2 text-sm" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">RIF</label>
                  <input type="text" value={form.rif} onChange={e => setForm(f => ({ ...f, rif: e.target.value }))} className="input-field !py-2 text-sm" placeholder="J-12345678-9" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Tipo</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))} className="input-field !py-2 text-sm">
                    <option value="NATURAL">Natural</option>
                    <option value="JURIDICA">Juridica</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Telefono</label>
                  <input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input-field !py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input-field !py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Direccion</label>
                <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="input-field !py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Limite de Credito USD</label>
                  <input type="number" value={form.creditLimit} onChange={e => setForm(f => ({ ...f, creditLimit: Number(e.target.value) }))} className="input-field !py-2 text-sm" min="0" step="0.01" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Dias de Credito</label>
                  <input type="number" value={form.creditDays} onChange={e => setForm(f => ({ ...f, creditDays: Number(e.target.value) }))} className="input-field !py-2 text-sm" min="0" />
                </div>
              </div>
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

      {/* Detail Modal */}
      {detailOpen && detailCustomer && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetailOpen(false)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-white">{detailCustomer.name}</h2>
              <button onClick={() => setDetailOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500">RIF:</span> <span className="text-slate-200 ml-2">{detailCustomer.rif || '-'}</span></div>
                <div><span className="text-slate-500">Tipo:</span> <span className="text-slate-200 ml-2">{detailCustomer.type}</span></div>
                <div><span className="text-slate-500">Telefono:</span> <span className="text-slate-200 ml-2">{detailCustomer.phone || '-'}</span></div>
                <div><span className="text-slate-500">Email:</span> <span className="text-slate-200 ml-2">{detailCustomer.email || '-'}</span></div>
                <div className="col-span-2"><span className="text-slate-500">Direccion:</span> <span className="text-slate-200 ml-2">{detailCustomer.address || '-'}</span></div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="card p-3 text-center">
                  <p className="text-xs text-slate-500">Limite Credito</p>
                  <p className="text-lg font-bold text-white">${detailCustomer.creditLimit?.toFixed(2)}</p>
                </div>
                <div className="card p-3 text-center">
                  <p className="text-xs text-slate-500">Deuda Pendiente</p>
                  <p className="text-lg font-bold text-amber-400">${detailCustomer.pendingDebt?.toFixed(2)}</p>
                </div>
                <div className="card p-3 text-center">
                  <p className="text-xs text-slate-500">Credito Disponible</p>
                  <p className={`text-lg font-bold ${detailCustomer.availableCredit > 0 ? 'text-green-400' : 'text-red-400'}`}>${detailCustomer.availableCredit?.toFixed(2)}</p>
                </div>
              </div>

              {detailCustomer.invoices?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Ultimas Facturas</h3>
                  <div className="space-y-2">
                    {detailCustomer.invoices.map((inv: any) => (
                      <div key={inv.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-700/30">
                        <div>
                          <span className="text-sm text-white font-medium">{inv.number}</span>
                          <span className="text-xs text-slate-500 ml-2">{new Date(inv.createdAt).toLocaleDateString('es-VE')}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-slate-300">${inv.totalUsd?.toFixed(2)}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${
                            inv.status === 'PAID' ? 'text-green-400 border-green-500/30 bg-green-500/10' :
                            inv.status === 'CREDIT' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' :
                            inv.status === 'CANCELLED' ? 'text-red-400 border-red-500/30 bg-red-500/10' :
                            'text-blue-400 border-blue-500/30 bg-blue-500/10'
                          }`}>{inv.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
