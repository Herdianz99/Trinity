'use client';

import { useState, useEffect, useCallback } from 'react';
import { ClipboardCheck, Plus, Loader2, X, Check, Eye } from 'lucide-react';

interface InventoryCount {
  id: string;
  warehouseId: string;
  warehouse: { id: string; name: string };
  status: 'DRAFT' | 'IN_PROGRESS' | 'APPROVED' | 'CANCELLED';
  notes: string | null;
  createdById: string;
  approvedById: string | null;
  _count?: { items: number };
  createdAt: string;
}

interface CountDetail {
  id: string;
  warehouse: { id: string; name: string };
  status: string;
  notes: string | null;
  items: {
    id: string;
    productId: string;
    product: { id: string; code: string; name: string };
    systemQuantity: number;
    countedQuantity: number | null;
    difference: number | null;
  }[];
}

interface Warehouse { id: string; name: string; }

const STATUS_BADGES: Record<string, string> = {
  DRAFT: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  IN_PROGRESS: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  APPROVED: 'bg-green-500/10 text-green-400 border-green-500/20',
  CANCELLED: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function InventoryCountPage() {
  const [counts, setCounts] = useState<InventoryCount[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [detailModal, setDetailModal] = useState<CountDetail | null>(null);
  const [createForm, setCreateForm] = useState({ warehouseId: '', notes: '' });
  const [countValues, setCountValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userRole, setUserRole] = useState('');

  const fetchCounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/inventory-counts');
      if (res.ok) setCounts(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  const fetchMeta = useCallback(async () => {
    const [wRes, meRes] = await Promise.all([
      fetch('/api/proxy/warehouses'),
      fetch('/api/auth/me'),
    ]);
    if (wRes.ok) setWarehouses(await wRes.json());
    if (meRes.ok) { const u = await meRes.json(); setUserRole(u.role); }
  }, []);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/proxy/inventory-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId: createForm.warehouseId, notes: createForm.notes || undefined }),
      });
      if (res.ok) {
        setCreateModal(false);
        fetchCounts();
        setMessage({ type: 'success', text: 'Sesion de conteo creada' });
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

  async function openDetail(id: string) {
    const res = await fetch(`/api/proxy/inventory-counts/${id}`);
    if (res.ok) {
      const data = await res.json();
      setDetailModal(data);
      const vals: Record<string, number> = {};
      data.items.forEach((item: any) => {
        if (item.countedQuantity !== null) vals[item.productId] = item.countedQuantity;
      });
      setCountValues(vals);
    }
  }

  async function handleSaveItems() {
    if (!detailModal) return;
    setSaving(true);
    setMessage(null);
    try {
      const items = Object.entries(countValues).map(([productId, countedQuantity]) => ({
        productId,
        countedQuantity: Number(countedQuantity),
      }));
      const res = await fetch(`/api/proxy/inventory-counts/${detailModal.id}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Cantidades guardadas' });
        const updated = await res.json();
        setDetailModal(updated);
        fetchCounts();
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

  async function handleApprove() {
    if (!detailModal) return;
    if (!confirm('Aprobar este conteo? Se ajustara el stock automaticamente.')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/proxy/inventory-counts/${detailModal.id}/approve`, { method: 'PATCH' });
      if (res.ok) {
        setDetailModal(null);
        fetchCounts();
        setMessage({ type: 'success', text: 'Conteo aprobado y stock ajustado' });
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

  const canApprove = userRole === 'ADMIN' || userRole === 'SUPERVISOR';

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <ClipboardCheck className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Conteo Fisico</h1>
            <p className="text-slate-400 text-sm">Sesiones de inventario fisico</p>
          </div>
        </div>
        <button onClick={() => { setCreateForm({ warehouseId: warehouses[0]?.id || '', notes: '' }); setCreateModal(true); }} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nueva sesion de conteo
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Almacen</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Productos</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Notas</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium w-20">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12"><Loader2 className="animate-spin text-green-500 mx-auto" size={28} /></td></tr>
              ) : counts.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-500">No hay sesiones de conteo</td></tr>
              ) : counts.map(c => (
                <tr key={c.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 text-slate-300 text-xs">{new Date(c.createdAt).toLocaleDateString('es-VE')}</td>
                  <td className="px-4 py-3 text-white">{c.warehouse.name}</td>
                  <td className="px-4 py-3 text-center text-slate-300">{c._count?.items || 0}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGES[c.status]}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs hidden md:table-cell">{c.notes || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => openDetail(c.id)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" title="Ver detalle">
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create modal */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCreateModal(false)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold text-white">Nueva Sesion de Conteo</h2>
              <button onClick={() => setCreateModal(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Almacen *</label>
                <select value={createForm.warehouseId} onChange={(e) => setCreateForm(f => ({ ...f, warehouseId: e.target.value }))} className="input-field !py-2 text-sm" required>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Notas</label>
                <input type="text" value={createForm.notes} onChange={(e) => setCreateForm(f => ({ ...f, notes: e.target.value }))} className="input-field !py-2 text-sm" placeholder="Opcional..." />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
                <button type="button" onClick={() => setCreateModal(false)} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
                  {saving && <Loader2 className="animate-spin" size={16} />}
                  Crear sesion
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetailModal(null)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold text-white">Conteo - {detailModal.warehouse.name}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGES[detailModal.status]}`}>{detailModal.status}</span>
              </div>
              <button onClick={() => setDetailModal(null)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><X size={18} /></button>
            </div>

            <div className="p-6">
              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-3 py-2 text-slate-400 font-medium">Codigo</th>
                    <th className="text-left px-3 py-2 text-slate-400 font-medium">Producto</th>
                    <th className="text-right px-3 py-2 text-slate-400 font-medium">Stock Sistema</th>
                    <th className="text-right px-3 py-2 text-slate-400 font-medium">Conteo Fisico</th>
                    <th className="text-right px-3 py-2 text-slate-400 font-medium">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {detailModal.items.map(item => {
                    const counted = countValues[item.productId] ?? item.countedQuantity;
                    const diff = counted !== undefined && counted !== null ? counted - item.systemQuantity : null;
                    return (
                      <tr key={item.id} className="border-b border-slate-700/30">
                        <td className="px-3 py-2">
                          <span className="font-mono text-xs text-green-400">{item.product.code}</span>
                        </td>
                        <td className="px-3 py-2 text-white">{item.product.name}</td>
                        <td className="px-3 py-2 text-right text-slate-300 font-mono">{item.systemQuantity}</td>
                        <td className="px-3 py-2 text-right">
                          {detailModal.status === 'APPROVED' ? (
                            <span className="font-mono text-white">{item.countedQuantity ?? '—'}</span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              value={countValues[item.productId] ?? ''}
                              onChange={(e) => setCountValues(v => ({ ...v, [item.productId]: Number(e.target.value) }))}
                              className="input-field !py-1 text-sm w-20 text-right font-mono"
                              placeholder="—"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {diff !== null ? (
                            <span className={diff === 0 ? 'text-green-400' : 'text-red-400'}>
                              {diff > 0 ? '+' : ''}{diff}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {detailModal.status !== 'APPROVED' && (
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700/50">
                  <button
                    onClick={handleSaveItems}
                    disabled={saving}
                    className="btn-secondary !py-2.5 text-sm flex items-center gap-2"
                  >
                    {saving && <Loader2 className="animate-spin" size={16} />}
                    Guardar cantidades
                  </button>
                  {canApprove && detailModal.status === 'IN_PROGRESS' && (
                    <button
                      onClick={handleApprove}
                      disabled={saving}
                      className="btn-primary !py-2.5 text-sm flex items-center gap-2"
                    >
                      <Check size={16} /> Aprobar conteo
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
