'use client';

import { useState, useEffect, useCallback } from 'react';
import { ShoppingCart, Plus, Loader2, X, Eye, Send, Ban, PackageCheck, Search } from 'lucide-react';

interface PurchaseOrder {
  id: string;
  number: string;
  supplier: { id: string; name: string };
  status: 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
  totalUsd: number;
  notes: string | null;
  items: POItem[];
  createdAt: string;
}

interface POItem {
  id: string;
  productId: string;
  product: { id: string; code: string; name: string; costUsd?: number; priceDetal?: number; priceMayor?: number };
  quantity: number;
  costUsd: number;
  totalUsd: number;
  receivedQty: number;
}

interface Supplier { id: string; name: string; isRetentionAgent?: boolean; }
interface ProductSearch { id: string; code: string; name: string; priceDetal: number; priceMayor: number; totalStock: number; }
interface Warehouse { id: string; name: string; }

const STATUS_BADGES: Record<string, string> = {
  DRAFT: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  SENT: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  PARTIAL: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  RECEIVED: 'bg-green-500/10 text-green-400 border-green-500/20',
  CANCELLED: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  PARTIAL: 'Parcial',
  RECEIVED: 'Recibida',
  CANCELLED: 'Cancelada',
};

export default function PurchasesPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);

  // Filters
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Create modal
  const [createModal, setCreateModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [formSupplier, setFormSupplier] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<{ productId: string; productLabel: string; quantity: number; costUsd: number }[]>([]);
  const [formIsCredit, setFormIsCredit] = useState(false);
  const [formCreditDays, setFormCreditDays] = useState(0);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<ProductSearch[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

  // Receive modal
  const [receiveModal, setReceiveModal] = useState<PurchaseOrder | null>(null);
  const [receiveWarehouse, setReceiveWarehouse] = useState('');
  const [receiveItems, setReceiveItems] = useState<{ purchaseOrderItemId: string; receivedQty: number; costUsd: number; originalCost: number; productName: string; maxQty: number }[]>([]);

  // Detail modal
  const [detailModal, setDetailModal] = useState<PurchaseOrder | null>(null);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (filterSupplier) params.set('supplierId', filterSupplier);
      if (filterStatus) params.set('status', filterStatus);

      const res = await fetch(`/api/proxy/purchase-orders?${params}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.data);
        setTotal(data.meta.total);
        setTotalPages(data.meta.totalPages);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [page, filterSupplier, filterStatus]);

  const fetchMeta = useCallback(async () => {
    const [sRes, wRes] = await Promise.all([
      fetch('/api/proxy/suppliers'),
      fetch('/api/proxy/warehouses'),
    ]);
    if (sRes.ok) { const d = await sRes.json(); setSuppliers(d.data || d); }
    if (wRes.ok) setWarehouses(await wRes.json());
  }, []);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  async function searchProducts(q: string) {
    setProductSearch(q);
    if (q.length < 2) { setProductResults([]); return; }
    setSearchingProducts(true);
    try {
      const res = await fetch(`/api/proxy/products/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setProductResults(await res.json());
    } catch { /* ignore */ } finally {
      setSearchingProducts(false);
    }
  }

  function addProductToForm(p: ProductSearch) {
    if (formItems.some(i => i.productId === p.id)) return;
    setFormItems([...formItems, { productId: p.id, productLabel: `${p.code} - ${p.name}`, quantity: 1, costUsd: 0 }]);
    setProductSearch('');
    setProductResults([]);
  }

  function removeFormItem(idx: number) {
    setFormItems(formItems.filter((_, i) => i !== idx));
  }

  function updateFormItem(idx: number, field: string, value: any) {
    setFormItems(formItems.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  function openCreate() {
    setEditingOrder(null);
    setFormSupplier(suppliers[0]?.id || '');
    setFormNotes('');
    setFormIsCredit(false);
    setFormCreditDays(0);
    setFormItems([]);
    setCreateModal(true);
  }

  function openEdit(order: PurchaseOrder) {
    setEditingOrder(order);
    setFormSupplier(order.supplier.id);
    setFormNotes(order.notes || '');
    setFormIsCredit((order as any).isCredit || false);
    setFormCreditDays((order as any).creditDays || 0);
    setFormItems(order.items.map(i => ({
      productId: i.productId,
      productLabel: `${i.product.code} - ${i.product.name}`,
      quantity: i.quantity,
      costUsd: i.costUsd,
    })));
    setCreateModal(true);
  }

  async function handleSave(e: React.FormEvent, markSent = false) {
    e.preventDefault();
    if (formItems.length === 0) { setMessage({ type: 'error', text: 'Agrega al menos un producto' }); return; }
    setSaving(true);
    setMessage(null);
    try {
      const body: any = {
        supplierId: formSupplier,
        notes: formNotes || undefined,
        isCredit: formIsCredit,
        creditDays: formIsCredit ? formCreditDays : 0,
        items: formItems.filter(i => i.productId && i.quantity > 0).map(i => ({
          productId: i.productId,
          quantity: Number(i.quantity),
          costUsd: Number(i.costUsd),
        })),
      };

      const url = editingOrder ? `/api/proxy/purchase-orders/${editingOrder.id}` : '/api/proxy/purchase-orders';
      const method = editingOrder ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const created = await res.json();
        if (markSent && !editingOrder) {
          await fetch(`/api/proxy/purchase-orders/${created.id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'SENT' }),
          });
        }
        setCreateModal(false);
        fetchOrders();
        setMessage({ type: 'success', text: editingOrder ? 'Orden actualizada' : 'Orden creada' });
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

  async function handleChangeStatus(id: string, status: 'SENT' | 'CANCELLED') {
    const msg = status === 'SENT' ? 'Marcar como enviada?' : 'Cancelar esta orden?';
    if (!confirm(msg)) return;
    const res = await fetch(`/api/proxy/purchase-orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      fetchOrders();
      setMessage({ type: 'success', text: status === 'SENT' ? 'Orden enviada' : 'Orden cancelada' });
    } else {
      const err = await res.json().catch(() => ({}));
      setMessage({ type: 'error', text: err.message || 'Error' });
    }
  }

  function openReceive(order: PurchaseOrder) {
    setReceiveModal(order);
    setReceiveWarehouse(warehouses[0]?.id || '');
    setReceiveItems(order.items.filter(i => i.receivedQty < i.quantity).map(i => ({
      purchaseOrderItemId: i.id,
      receivedQty: i.quantity - i.receivedQty,
      costUsd: i.costUsd,
      originalCost: i.costUsd,
      productName: `${i.product.code} - ${i.product.name}`,
      maxQty: i.quantity - i.receivedQty,
    })));
  }

  async function handleReceive(e: React.FormEvent) {
    e.preventDefault();
    if (!receiveModal) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/purchase-orders/${receiveModal.id}/receive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId: receiveWarehouse,
          items: receiveItems.map(i => ({
            purchaseOrderItemId: i.purchaseOrderItemId,
            receivedQty: Number(i.receivedQty),
            costUsd: Number(i.costUsd),
          })),
        }),
      });
      if (res.ok) {
        setReceiveModal(null);
        fetchOrders();
        setMessage({ type: 'success', text: 'Orden recibida — stock y precios actualizados' });
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

  const formTotal = formItems.reduce((sum, i) => sum + (i.quantity * i.costUsd), 0);

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <ShoppingCart className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Ordenes de Compra</h1>
            <p className="text-slate-400 text-sm">{total} ordenes</p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nueva orden
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select
            value={filterSupplier}
            onChange={(e) => { setFilterSupplier(e.target.value); setPage(1); }}
            className="input-field !py-2 text-sm"
          >
            <option value="">Todos los proveedores</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="input-field !py-2 text-sm"
          >
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Numero</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Proveedor</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Items</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Total USD</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Fecha</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium w-32">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12"><Loader2 className="animate-spin text-green-500 mx-auto" size={28} /></td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-500">No hay ordenes de compra</td></tr>
              ) : orders.map(o => (
                <tr key={o.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-green-400 font-medium">{o.number}</td>
                  <td className="px-4 py-3 text-white">{o.supplier.name}</td>
                  <td className="px-4 py-3 text-center text-slate-300">{o.items.length}</td>
                  <td className="px-4 py-3 text-right font-mono text-white">${o.totalUsd.toFixed(2)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGES[o.status]}`}>
                      {STATUS_LABELS[o.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs hidden md:table-cell">
                    {new Date(o.createdAt).toLocaleDateString('es-VE')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setDetailModal(o)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" title="Ver detalle">
                        <Eye size={14} />
                      </button>
                      {o.status === 'DRAFT' && (
                        <>
                          <button onClick={() => openEdit(o)} className="p-1.5 rounded-lg hover:bg-blue-500/10 text-slate-400 hover:text-blue-400 transition-colors" title="Editar">
                            <Send size={14} />
                          </button>
                          <button onClick={() => handleChangeStatus(o.id, 'SENT')} className="p-1.5 rounded-lg hover:bg-green-500/10 text-slate-400 hover:text-green-400 transition-colors" title="Marcar enviada">
                            <Send size={14} />
                          </button>
                        </>
                      )}
                      {(o.status === 'SENT' || o.status === 'PARTIAL') && (
                        <button onClick={() => openReceive(o)} className="p-1.5 rounded-lg hover:bg-green-500/10 text-slate-400 hover:text-green-400 transition-colors" title="Recibir">
                          <PackageCheck size={14} />
                        </button>
                      )}
                      {(o.status === 'DRAFT' || o.status === 'SENT') && (
                        <button onClick={() => handleChangeStatus(o.id, 'CANCELLED')} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors" title="Cancelar">
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

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <span className="text-sm text-slate-400">Pagina {page} de {totalPages}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 disabled:opacity-30">Anterior</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 disabled:opacity-30">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCreateModal(false)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-white">{editingOrder ? 'Editar Orden' : 'Nueva Orden de Compra'}</h2>
              <button onClick={() => setCreateModal(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={(e) => handleSave(e, false)} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Proveedor *</label>
                <select value={formSupplier} onChange={(e) => setFormSupplier(e.target.value)} className="input-field !py-2 text-sm" required>
                  <option value="">Seleccionar...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Notas</label>
                <input type="text" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} className="input-field !py-2 text-sm" placeholder="Opcional..." />
              </div>

              {/* Credit toggle */}
              <div className="bg-slate-900/50 rounded-lg p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formIsCredit}
                    onChange={(e) => setFormIsCredit(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40"
                  />
                  Compra a credito
                </label>
                {formIsCredit && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Dias de credito</label>
                    <input
                      type="number"
                      min="0"
                      value={formCreditDays}
                      onChange={(e) => setFormCreditDays(Number(e.target.value))}
                      className="input-field !py-2 text-sm w-32"
                    />
                  </div>
                )}
                {formIsCredit && (
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      Se generara CxP al recibir
                    </span>
                    {suppliers.find(s => s.id === formSupplier)?.isRetentionAgent && (
                      <span className="text-xs px-2 py-1 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
                        Aplicara retencion IVA
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-slate-400">Productos</label>
                </div>

                {/* Product search */}
                <div className="relative mb-3">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => searchProducts(e.target.value)}
                      className="input-field !py-2 text-sm pl-9"
                      placeholder="Buscar producto por nombre o codigo..."
                    />
                    {searchingProducts && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-500" />}
                  </div>
                  {productResults.length > 0 && (
                    <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-slate-700 border border-slate-600 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                      {productResults.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addProductToForm(p)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-600 text-white flex justify-between"
                        >
                          <span><span className="font-mono text-green-400 text-xs">{p.code}</span> {p.name}</span>
                          <span className="text-slate-400 text-xs">Stock: {p.totalStock}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Items list */}
                <div className="space-y-2">
                  {formItems.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-center bg-slate-900/50 rounded-lg p-2">
                      <span className="flex-1 text-sm text-white truncate">{item.productLabel}</span>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity || ''}
                        onChange={(e) => updateFormItem(idx, 'quantity', Number(e.target.value))}
                        className="input-field !py-1.5 text-sm w-20"
                        placeholder="Cant."
                        required
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.costUsd || ''}
                        onChange={(e) => updateFormItem(idx, 'costUsd', Number(e.target.value))}
                        className="input-field !py-1.5 text-sm w-24"
                        placeholder="Costo $"
                        required
                      />
                      <span className="text-xs text-slate-400 w-20 text-right font-mono">${(item.quantity * item.costUsd).toFixed(2)}</span>
                      <button type="button" onClick={() => removeFormItem(idx)} className="p-1 text-slate-500 hover:text-red-400">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {formItems.length === 0 && (
                    <p className="text-sm text-slate-500 text-center py-4">Busca y agrega productos arriba</p>
                  )}
                </div>

                {formItems.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50 flex justify-end">
                    <span className="text-sm text-slate-300">Total: <span className="font-mono font-bold text-white">${formTotal.toFixed(2)}</span></span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
                <button type="button" onClick={() => setCreateModal(false)} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-secondary !py-2.5 text-sm flex items-center gap-2">
                  {saving && <Loader2 className="animate-spin" size={16} />}
                  Guardar borrador
                </button>
                {!editingOrder && (
                  <button type="button" onClick={(e) => handleSave(e as any, true)} disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
                    <Send size={16} /> Guardar y enviar
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive Modal */}
      {receiveModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setReceiveModal(null)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold text-white">Recibir Orden {receiveModal.number}</h2>
                <p className="text-sm text-slate-400">{receiveModal.supplier.name}</p>
              </div>
              <button onClick={() => setReceiveModal(null)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={handleReceive} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Almacen destino *</label>
                <select value={receiveWarehouse} onChange={(e) => setReceiveWarehouse(e.target.value)} className="input-field !py-2 text-sm" required>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>

              <div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left px-3 py-2 text-slate-400 font-medium">Producto</th>
                      <th className="text-right px-3 py-2 text-slate-400 font-medium">Pendiente</th>
                      <th className="text-right px-3 py-2 text-slate-400 font-medium">Recibir</th>
                      <th className="text-right px-3 py-2 text-slate-400 font-medium">Costo USD</th>
                      <th className="text-center px-3 py-2 text-slate-400 font-medium">Cambio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiveItems.map((item, idx) => (
                      <tr key={item.purchaseOrderItemId} className="border-b border-slate-700/30">
                        <td className="px-3 py-2 text-white text-sm">{item.productName}</td>
                        <td className="px-3 py-2 text-right text-slate-300 font-mono">{item.maxQty}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            max={item.maxQty}
                            value={item.receivedQty}
                            onChange={(e) => {
                              const newItems = [...receiveItems];
                              newItems[idx] = { ...newItems[idx], receivedQty: Number(e.target.value) };
                              setReceiveItems(newItems);
                            }}
                            className="input-field !py-1 text-sm w-20 text-right font-mono"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.costUsd}
                            onChange={(e) => {
                              const newItems = [...receiveItems];
                              newItems[idx] = { ...newItems[idx], costUsd: Number(e.target.value) };
                              setReceiveItems(newItems);
                            }}
                            className="input-field !py-1 text-sm w-24 text-right font-mono"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          {item.costUsd !== item.originalCost && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">
                              Precio actualizado
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {receiveItems.some(i => i.costUsd !== i.originalCost) && (
                  <p className="mt-2 text-xs text-amber-400">Los productos con costo cambiado tendran su precio de venta recalculado automaticamente.</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
                <button type="button" onClick={() => setReceiveModal(null)} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
                  {saving && <Loader2 className="animate-spin" size={16} />}
                  <PackageCheck size={16} /> Confirmar recepcion
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetailModal(null)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold text-white">Orden {detailModal.number}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-slate-400">{detailModal.supplier.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGES[detailModal.status]}`}>
                    {STATUS_LABELS[detailModal.status]}
                  </span>
                </div>
              </div>
              <button onClick={() => setDetailModal(null)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><X size={18} /></button>
            </div>
            <div className="p-6">
              {detailModal.notes && (
                <p className="text-sm text-slate-400 mb-4">Notas: {detailModal.notes}</p>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-3 py-2 text-slate-400 font-medium">Producto</th>
                    <th className="text-right px-3 py-2 text-slate-400 font-medium">Cantidad</th>
                    <th className="text-right px-3 py-2 text-slate-400 font-medium">Recibido</th>
                    <th className="text-right px-3 py-2 text-slate-400 font-medium">Costo</th>
                    <th className="text-right px-3 py-2 text-slate-400 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detailModal.items.map(item => (
                    <tr key={item.id} className="border-b border-slate-700/30">
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-green-400">{item.product.code}</span>
                        <span className="text-white ml-2">{item.product.name}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-300">{item.quantity}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        <span className={item.receivedQty >= item.quantity ? 'text-green-400' : item.receivedQty > 0 ? 'text-amber-400' : 'text-slate-500'}>
                          {item.receivedQty}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-300">${item.costUsd.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-white">${item.totalUsd.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-700/50">
                    <td colSpan={4} className="px-3 py-2 text-right text-slate-400 font-medium">Total:</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-white">${detailModal.totalUsd.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
