'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, ShoppingCart, Loader2, Edit2, Send, Ban, PackageCheck, X, ExternalLink,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface PurchaseOrder {
  id: string;
  number: string;
  supplier: { id: string; name: string };
  status: 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
  totalUsd: number;
  notes: string | null;
  isCredit: boolean;
  creditDays: number;
  supplierControlNumber: string | null;
  islrRetentionPct: number;
  islrRetentionUsd: number;
  items: POItem[];
  createdAt: string;
}

interface POItem {
  id: string;
  productId: string;
  product: { id: string; code: string; name: string };
  quantity: number;
  costUsd: number;
  totalUsd: number;
  receivedQty: number;
}

interface Warehouse { id: string; name: string; }
interface Movement {
  id: string; type: string; quantity: number; costUsd: number | null;
  reference: string | null; createdAt: string;
  product: { id: string; code: string; name: string };
  warehouse: { id: string; name: string };
}
interface Payable {
  id: string; amountUsd: number; balanceUsd: number; dueDate: string | null;
  status: string; purchaseOrder: { id: string; number: string } | null;
}

const STATUS_BADGES: Record<string, string> = {
  DRAFT: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  SENT: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  PARTIAL: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  RECEIVED: 'bg-green-500/10 text-green-400 border-green-500/20',
  CANCELLED: 'bg-red-500/10 text-red-400 border-red-500/20',
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador', SENT: 'Enviada', PARTIAL: 'Parcial', RECEIVED: 'Recibida', CANCELLED: 'Cancelada',
};
const PAYABLE_BADGES: Record<string, string> = {
  PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  PARTIAL: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  PAID: 'bg-green-500/10 text-green-400 border-green-500/20',
  OVERDUE: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function PurchaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Receive
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [receiveModal, setReceiveModal] = useState(false);
  const [receiveWarehouse, setReceiveWarehouse] = useState('');
  const [receiveItems, setReceiveItems] = useState<{ purchaseOrderItemId: string; receivedQty: number; costUsd: number; originalCost: number; productName: string; maxQty: number }[]>([]);
  const [saving, setSaving] = useState(false);

  // Movements (recepciones)
  const [movements, setMovements] = useState<Movement[]>([]);
  const [movLoading, setMovLoading] = useState(false);

  // Payable
  const [payables, setPayables] = useState<Payable[]>([]);
  const [payablesLoading, setPayablesLoading] = useState(false);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/purchase-orders/${id}`);
      if (!res.ok) throw new Error('Orden no encontrada');
      setOrder(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchMeta = useCallback(async () => {
    const wRes = await fetch('/api/proxy/warehouses');
    if (wRes.ok) setWarehouses(await wRes.json());
  }, []);

  const fetchMovements = useCallback(async () => {
    if (!order) return;
    setMovLoading(true);
    try {
      const res = await fetch(`/api/proxy/stock-movements?type=PURCHASE&page=1&limit=100`);
      if (res.ok) {
        const data = await res.json();
        const poRef = order.number;
        setMovements(data.data.filter((m: Movement) => m.reference?.includes(poRef)));
      }
    } catch { /* ignore */ } finally {
      setMovLoading(false);
    }
  }, [order]);

  const fetchPayables = useCallback(async () => {
    if (!order || !order.isCredit) return;
    setPayablesLoading(true);
    try {
      const res = await fetch(`/api/proxy/payables?supplierId=${order.supplier.id}`);
      if (res.ok) {
        const data = await res.json();
        const rows = (data.data || data).filter((p: any) => p.purchaseOrder?.id === order.id);
        setPayables(rows);
      }
    } catch { /* ignore */ } finally {
      setPayablesLoading(false);
    }
  }, [order]);

  useEffect(() => { fetchOrder(); fetchMeta(); }, [fetchOrder, fetchMeta]);
  useEffect(() => { fetchMovements(); }, [fetchMovements]);
  useEffect(() => { fetchPayables(); }, [fetchPayables]);

  async function handleChangeStatus(status: 'SENT' | 'CANCELLED') {
    const msg = status === 'SENT' ? 'Marcar como enviada?' : 'Cancelar esta orden?';
    if (!confirm(msg)) return;
    const res = await fetch(`/api/proxy/purchase-orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      fetchOrder();
      setMessage({ type: 'success', text: status === 'SENT' ? 'Orden enviada' : 'Orden cancelada' });
    } else {
      const err = await res.json().catch(() => ({}));
      setMessage({ type: 'error', text: err.message || 'Error' });
    }
  }

  function openReceive() {
    if (!order) return;
    setReceiveWarehouse(warehouses[0]?.id || '');
    setReceiveItems(order.items.filter(i => i.receivedQty < i.quantity).map(i => ({
      purchaseOrderItemId: i.id,
      receivedQty: i.quantity - i.receivedQty,
      costUsd: i.costUsd,
      originalCost: i.costUsd,
      productName: `${i.product.code} - ${i.product.name}`,
      maxQty: i.quantity - i.receivedQty,
    })));
    setReceiveModal(true);
  }

  async function handleReceive(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/purchase-orders/${id}/receive`, {
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
        setReceiveModal(false);
        fetchOrder();
        fetchMovements();
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

  function fmtDate(iso: string) {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-green-500" size={32} /></div>;
  if (error || !order) return (
    <div className="text-center py-20">
      <p className="text-red-400 mb-4">{error || 'Orden no encontrada'}</p>
      <button onClick={() => router.push('/purchases')} className="btn-secondary">Volver a compras</button>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/purchases')} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <ShoppingCart className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Orden {order.number}</h1>
            <p className="text-slate-400 text-sm">{order.supplier.name}</p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full border ${STATUS_BADGES[order.status]}`}>
            {STATUS_LABELS[order.status]}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(order.status === 'DRAFT' || order.status === 'SENT') && (
            <button onClick={() => router.push(`/purchases/${id}/edit`)} className="btn-secondary text-sm flex items-center gap-1.5">
              <Edit2 size={14} /> Editar
            </button>
          )}
          {order.status === 'DRAFT' && (
            <button onClick={() => handleChangeStatus('SENT')} className="btn-primary text-sm flex items-center gap-1.5">
              <Send size={14} /> Marcar enviada
            </button>
          )}
          {(order.status === 'SENT' || order.status === 'PARTIAL') && (
            <button onClick={openReceive} className="btn-primary text-sm flex items-center gap-1.5">
              <PackageCheck size={14} /> Recibir orden
            </button>
          )}
          {(order.status === 'DRAFT' || order.status === 'SENT') && (
            <button onClick={() => handleChangeStatus('CANCELLED')} className="text-sm px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1.5">
              <Ban size={14} /> Cancelar
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Informacion General</TabsTrigger>
          <TabsTrigger value="recepciones">Recepciones</TabsTrigger>
          {order.isCredit && <TabsTrigger value="cxp">Cuenta por pagar</TabsTrigger>}
        </TabsList>

        {/* ═══ TAB: Info ═══ */}
        <TabsContent value="info">
          <div className="card p-6 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div>
                <p className="text-xs text-slate-500 uppercase">Fecha</p>
                <p className="text-white font-mono">{fmtDate(order.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">Total USD</p>
                <p className="text-white font-mono font-bold">${order.totalUsd.toFixed(2)}</p>
              </div>
              {order.isCredit && (
                <div>
                  <p className="text-xs text-slate-500 uppercase">Credito</p>
                  <p className="text-blue-400 text-sm">{order.creditDays} dias</p>
                </div>
              )}
              {order.islrRetentionUsd > 0 && (
                <div>
                  <p className="text-xs text-slate-500 uppercase">Ret. ISLR</p>
                  <p className="text-purple-400 font-mono">${order.islrRetentionUsd.toFixed(2)} ({order.islrRetentionPct}%)</p>
                </div>
              )}
              {order.supplierControlNumber && (
                <div>
                  <p className="text-xs text-slate-500 uppercase">N° Control</p>
                  <p className="text-slate-300 font-mono">{order.supplierControlNumber}</p>
                </div>
              )}
            </div>
            {order.notes && <p className="text-sm text-slate-400 mb-4">Notas: {order.notes}</p>}
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Producto</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Cantidad</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Recibido</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Costo USD</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Total USD</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map(item => (
                  <tr key={item.id} className="border-b border-slate-700/30">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-green-400">{item.product.code}</span>
                      <span className="text-white ml-2">{item.product.name}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">{item.quantity}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className={item.receivedQty >= item.quantity ? 'text-green-400' : item.receivedQty > 0 ? 'text-amber-400' : 'text-slate-500'}>
                        {item.receivedQty}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">${item.costUsd.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-white">${item.totalUsd.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-700/50">
                  <td colSpan={4} className="px-4 py-3 text-right text-slate-400 font-medium">Total:</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-white">${order.totalUsd.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </TabsContent>

        {/* ═══ TAB: Recepciones ═══ */}
        <TabsContent value="recepciones">
          <div className="card overflow-hidden">
            {movLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-green-500" size={24} /></div>
            ) : movements.length === 0 ? (
              <div className="text-center py-12 text-slate-500">No hay recepciones registradas</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Producto</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Almacen</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Cantidad</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Costo USD</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map(m => (
                    <tr key={m.id} className="border-b border-slate-700/30">
                      <td className="px-4 py-3 text-slate-300">{fmtDate(m.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-green-400">{m.product.code}</span>
                        <span className="text-white ml-2">{m.product.name}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{m.warehouse.name}</td>
                      <td className="px-4 py-3 text-right font-mono text-white">{m.quantity}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">{m.costUsd != null ? `$${m.costUsd.toFixed(2)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        {/* ═══ TAB: Cuenta por pagar ═══ */}
        {order.isCredit && (
          <TabsContent value="cxp">
            <div className="card overflow-hidden">
              {payablesLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-green-500" size={24} /></div>
              ) : payables.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  {order.status === 'DRAFT' || order.status === 'SENT'
                    ? 'La cuenta por pagar se generara al recibir la orden'
                    : 'No se encontro cuenta por pagar vinculada'}
                </div>
              ) : (
                <div className="p-6 space-y-4">
                  {payables.map(p => (
                    <div key={p.id} className="bg-slate-900/50 rounded-lg p-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Monto</p>
                          <p className="text-white font-mono font-bold">${p.amountUsd.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Saldo pendiente</p>
                          <p className="text-amber-400 font-mono font-bold">${p.balanceUsd.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Vencimiento</p>
                          <p className="text-slate-300">{p.dueDate ? fmtDate(p.dueDate) : '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Estado</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${PAYABLE_BADGES[p.status] || ''}`}>
                            {p.status}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => router.push(`/payables/${p.id}`)}
                        className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      >
                        Ver CxP <ExternalLink size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Receive Modal */}
      {receiveModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setReceiveModal(false)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold text-white">Recibir Orden {order.number}</h2>
                <p className="text-sm text-slate-400">{order.supplier.name}</p>
              </div>
              <button onClick={() => setReceiveModal(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={handleReceive} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Almacen destino *</label>
                <select value={receiveWarehouse} onChange={e => setReceiveWarehouse(e.target.value)} className="input-field !py-2 text-sm" required>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-3 py-2 text-slate-400 font-medium">Producto</th>
                    <th className="text-right px-3 py-2 text-slate-400 font-medium">Pendiente</th>
                    <th className="text-right px-3 py-2 text-slate-400 font-medium">Recibir</th>
                    <th className="text-right px-3 py-2 text-slate-400 font-medium">Costo USD</th>
                  </tr>
                </thead>
                <tbody>
                  {receiveItems.map((item, idx) => (
                    <tr key={item.purchaseOrderItemId} className="border-b border-slate-700/30">
                      <td className="px-3 py-2 text-white text-sm">{item.productName}</td>
                      <td className="px-3 py-2 text-right text-slate-300 font-mono">{item.maxQty}</td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" min="0" max={item.maxQty} value={item.receivedQty}
                          onChange={e => { const n = [...receiveItems]; n[idx] = { ...n[idx], receivedQty: Number(e.target.value) }; setReceiveItems(n); }}
                          className="input-field !py-1 text-sm w-20 text-right font-mono" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" min="0" step="0.01" value={item.costUsd}
                          onChange={e => { const n = [...receiveItems]; n[idx] = { ...n[idx], costUsd: Number(e.target.value) }; setReceiveItems(n); }}
                          className="input-field !py-1 text-sm w-24 text-right font-mono" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
                <button type="button" onClick={() => setReceiveModal(false)} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
                  {saving && <Loader2 className="animate-spin" size={16} />}
                  <PackageCheck size={16} /> Confirmar recepcion
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
