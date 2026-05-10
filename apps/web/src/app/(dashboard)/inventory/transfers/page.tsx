'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeftRight, Plus, Loader2, X, Check, Ban } from 'lucide-react';

interface Transfer {
  id: string;
  fromWarehouse: { id: string; name: string };
  toWarehouse: { id: string; name: string };
  status: 'PENDING' | 'APPROVED' | 'CANCELLED';
  notes: string | null;
  createdById: string;
  approvedById: string | null;
  items: { id: string; product: { id: string; code: string; name: string }; quantity: number }[];
  createdAt: string;
}

interface Warehouse { id: string; name: string; }
interface Product { id: string; code: string; name: string; }

const STATUS_BADGES: Record<string, string> = {
  PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  APPROVED: 'bg-green-500/10 text-green-400 border-green-500/20',
  CANCELLED: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ fromWarehouseId: '', toWarehouseId: '', notes: '', items: [{ productId: '', quantity: 0 }] });
  const [filterStatus, setFilterStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userRole, setUserRole] = useState('');

  const fetchTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      const res = await fetch(`/api/proxy/transfers?${params}`);
      if (res.ok) setTransfers(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  const fetchMeta = useCallback(async () => {
    const [wRes, pRes, meRes] = await Promise.all([
      fetch('/api/proxy/warehouses'),
      fetch('/api/proxy/products?limit=200'),
      fetch('/api/auth/me'),
    ]);
    if (wRes.ok) setWarehouses(await wRes.json());
    if (pRes.ok) { const d = await pRes.json(); setProducts(d.data || d); }
    if (meRes.ok) { const u = await meRes.json(); setUserRole(u.role); }
  }, []);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { fetchTransfers(); }, [fetchTransfers]);

  function addItem() {
    setForm(f => ({ ...f, items: [...f.items, { productId: '', quantity: 0 }] }));
  }

  function removeItem(idx: number) {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  function updateItem(idx: number, field: string, value: any) {
    setForm(f => ({
      ...f,
      items: f.items.map((item, i) => i === idx ? { ...item, [field]: value } : item),
    }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/proxy/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromWarehouseId: form.fromWarehouseId,
          toWarehouseId: form.toWarehouseId,
          notes: form.notes || undefined,
          items: form.items.filter(i => i.productId && i.quantity > 0).map(i => ({
            productId: i.productId,
            quantity: Number(i.quantity),
          })),
        }),
      });
      if (res.ok) {
        setModalOpen(false);
        fetchTransfers();
        setMessage({ type: 'success', text: 'Transferencia creada' });
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(id: string) {
    if (!confirm('Aprobar esta transferencia?')) return;
    const res = await fetch(`/api/proxy/transfers/${id}/approve`, { method: 'PATCH' });
    if (res.ok) {
      fetchTransfers();
      setMessage({ type: 'success', text: 'Transferencia aprobada' });
    } else {
      const err = await res.json().catch(() => ({}));
      setMessage({ type: 'error', text: err.message || 'Error' });
    }
  }

  async function handleCancel(id: string) {
    if (!confirm('Cancelar esta transferencia?')) return;
    const res = await fetch(`/api/proxy/transfers/${id}/cancel`, { method: 'PATCH' });
    if (res.ok) {
      fetchTransfers();
      setMessage({ type: 'success', text: 'Transferencia cancelada' });
    }
  }

  const canApprove = userRole === 'ADMIN' || userRole === 'SUPERVISOR';

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <ArrowLeftRight className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Transferencias</h1>
            <p className="text-slate-400 text-sm">Movimientos entre almacenes</p>
          </div>
        </div>
        <button onClick={() => { setForm({ fromWarehouseId: warehouses[0]?.id || '', toWarehouseId: '', notes: '', items: [{ productId: '', quantity: 0 }] }); setModalOpen(true); }} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nueva transferencia
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* Filter */}
      <div className="card p-4 mb-6">
        <div className="flex flex-wrap gap-2">
          {['', 'PENDING', 'APPROVED', 'CANCELLED'].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                filterStatus === s
                  ? 'bg-green-500/20 text-green-400 border-green-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              {s === '' ? 'Todas' : s === 'PENDING' ? 'Pendientes' : s === 'APPROVED' ? 'Aprobadas' : 'Canceladas'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Origen</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Destino</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Items</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium w-28">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12"><Loader2 className="animate-spin text-green-500 mx-auto" size={28} /></td></tr>
              ) : transfers.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-500">No hay transferencias</td></tr>
              ) : transfers.map(t => (
                <tr key={t.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 text-slate-300 text-xs">{new Date(t.createdAt).toLocaleDateString('es-VE')}</td>
                  <td className="px-4 py-3 text-white">{t.fromWarehouse.name}</td>
                  <td className="px-4 py-3 text-white">{t.toWarehouse.name}</td>
                  <td className="px-4 py-3 text-center text-slate-300">{t.items.length}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGES[t.status]}`}>{t.status}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {t.status === 'PENDING' && canApprove && (
                        <button onClick={() => handleApprove(t.id)} className="p-1.5 rounded-lg hover:bg-green-500/10 text-slate-400 hover:text-green-400 transition-colors" title="Aprobar">
                          <Check size={14} />
                        </button>
                      )}
                      {t.status === 'PENDING' && (
                        <button onClick={() => handleCancel(t.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors" title="Cancelar">
                          <Ban size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-white">Nueva Transferencia</h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Almacen origen *</label>
                  <select
                    value={form.fromWarehouseId}
                    onChange={(e) => setForm(f => ({ ...f, fromWarehouseId: e.target.value }))}
                    className="input-field !py-2 text-sm"
                    required
                  >
                    <option value="">Seleccionar...</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Almacen destino *</label>
                  <select
                    value={form.toWarehouseId}
                    onChange={(e) => setForm(f => ({ ...f, toWarehouseId: e.target.value }))}
                    className="input-field !py-2 text-sm"
                    required
                  >
                    <option value="">Seleccionar...</option>
                    {warehouses.filter(w => w.id !== form.fromWarehouseId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Notas</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="input-field !py-2 text-sm"
                  placeholder="Opcional..."
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-slate-400">Productos</label>
                  <button type="button" onClick={addItem} className="text-xs text-green-400 hover:text-green-300">+ Agregar producto</button>
                </div>
                <div className="space-y-2">
                  {form.items.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <select
                        value={item.productId}
                        onChange={(e) => updateItem(idx, 'productId', e.target.value)}
                        className="input-field !py-2 text-sm flex-1"
                        required
                      >
                        <option value="">Producto...</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                      </select>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity || ''}
                        onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                        className="input-field !py-2 text-sm w-20"
                        placeholder="Cant."
                        required
                      />
                      {form.items.length > 1 && (
                        <button type="button" onClick={() => removeItem(idx)} className="p-1.5 text-slate-500 hover:text-red-400">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
                <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
                  {saving && <Loader2 className="animate-spin" size={16} />}
                  Crear transferencia
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
