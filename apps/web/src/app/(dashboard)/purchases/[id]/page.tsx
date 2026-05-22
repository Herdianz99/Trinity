'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, ShoppingCart, Loader2, Edit2, Send, Ban, PackageCheck, X, ExternalLink, FileX2,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const IVA_MULTIPLIERS: Record<string, number> = { EXEMPT: 1, REDUCED: 1.08, GENERAL: 1.16, SPECIAL: 1.31 };

interface PurchaseOrder {
  id: string;
  number: string;
  supplier: { id: string; name: string };
  status: 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
  totalUsd: number;
  totalWithSurchargeUsd: number;
  notes: string | null;
  isCredit: boolean;
  creditDays: number;
  supplierControlNumber: string | null;
  islrRetentionPct: number;
  islrRetentionUsd: number;
  invoiceDate: string | null;
  receivedDate: string | null;
  currency: string;
  exchangeRate: number;
  surchargeUsd: number;
  surchargeDistribution: string;
  items: POItem[];
  createdAt: string;
}

interface POItem {
  id: string;
  productId: string;
  product: { id: string; code: string; name: string; isService?: boolean; costUsd?: number; priceDetal?: number; priceMayor?: number; gananciaPct?: number; gananciaMayorPct?: number; ivaType?: string; bregaApplies?: boolean };
  quantity: number;
  costUsd: number;
  totalUsd: number;
  receivedQty: number;
}

interface Warehouse { id: string; name: string; }
interface Movement {
  id: string; type: string; quantity: number; costUsd: number;
  stockAfter: number; reference: string | null; createdAt: string;
  product: { id: string; code: string; name: string };
  warehouse: { id: string; name: string };
}
interface Payable {
  id: string; amountUsd: number; balanceUsd: number; dueDate: string | null;
  status: string; purchaseOrder: { id: string; number: string } | null;
}
interface SuggestedPrice {
  productId: string; productCode: string; productName: string;
  currentCostUsd: number; newCostUsd: number;
  currentGananciaPct: number; currentGananciaMayorPct: number;
  currentPriceDetal: number; suggestedPriceDetal: number;
  currentPriceMayor: number; suggestedPriceMayor: number;
  bregaPct: number; ivaMultiplier: number; ivaType: string;
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
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [userRole, setUserRole] = useState('');

  // Receive
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [receiveModal, setReceiveModal] = useState(false);
  const [receiveWarehouse, setReceiveWarehouse] = useState('');
  const [receiveDate, setReceiveDate] = useState('');
  const [receiveItems, setReceiveItems] = useState<{ purchaseOrderItemId: string; receivedQty: number; costUsd: number; originalCost: number; productName: string; maxQty: number; isService?: boolean }[]>([]);
  const [saving, setSaving] = useState(false);
  const [receiveTab, setReceiveTab] = useState<'confirm' | 'prices'>('confirm');

  // Suggested prices
  const [suggestedPrices, setSuggestedPrices] = useState<SuggestedPrice[]>([]);
  const [priceEdits, setPriceEdits] = useState<Record<string, { gananciaPct: number; gananciaMayorPct: number; priceDetal: number; priceMayor: number }>>({});

  // Active tab + lazy loading
  const [activeTab, setActiveTab] = useState('info');

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

  useEffect(() => {
    if (order) document.title = `${order.number} - ${order.supplier.name} | Trinity ERP`;
  }, [order]);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(data => {
      if (data?.permissions) setUserPermissions(data.permissions);
      if (data?.role) setUserRole(data.role);
    }).catch(() => {});
  }, []);

  const hasPerm = (perm: string) => userRole === 'ADMIN' || userPermissions.includes(perm);

  useEffect(() => {
    if (activeTab === 'recepciones' && order) fetchMovements();
  }, [activeTab, order, fetchMovements]);

  useEffect(() => {
    if (activeTab === 'cxp' && order) fetchPayables();
  }, [activeTab, order, fetchPayables]);

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

  async function openReceive() {
    if (!order) return;
    setReceiveWarehouse(warehouses[0]?.id || '');
    setReceiveDate('');
    setReceiveTab('confirm');
    setReceiveItems(order.items.filter(i => i.receivedQty < i.quantity).map(i => ({
      purchaseOrderItemId: i.id,
      receivedQty: i.quantity - i.receivedQty,
      costUsd: i.costUsd,
      originalCost: i.costUsd,
      productName: `${i.product.code} - ${i.product.name}`,
      maxQty: i.quantity - i.receivedQty,
      isService: i.product.isService,
    })));

    // Fetch suggested prices
    try {
      const res = await fetch(`/api/proxy/purchase-orders/${id}/suggested-prices`);
      if (res.ok) {
        const prices: SuggestedPrice[] = await res.json();
        setSuggestedPrices(prices);
        const edits: Record<string, { gananciaPct: number; gananciaMayorPct: number; priceDetal: number; priceMayor: number }> = {};
        for (const p of prices) {
          edits[p.productId] = {
            gananciaPct: p.currentGananciaPct,
            gananciaMayorPct: p.currentGananciaMayorPct,
            priceDetal: p.suggestedPriceDetal,
            priceMayor: p.suggestedPriceMayor,
          };
        }
        setPriceEdits(edits);
      }
    } catch { /* ignore */ }

    setReceiveModal(true);
  }

  function handleGananciaChange(productId: string, field: 'gananciaPct' | 'gananciaMayorPct', value: number) {
    const sp = suggestedPrices.find(p => p.productId === productId);
    if (!sp) return;
    const cost = sp.newCostUsd;
    const base = cost * (1 + sp.bregaPct / 100) * sp.ivaMultiplier;
    const prev = priceEdits[productId] || { gananciaPct: sp.currentGananciaPct, gananciaMayorPct: sp.currentGananciaMayorPct, priceDetal: sp.suggestedPriceDetal, priceMayor: sp.suggestedPriceMayor };
    if (field === 'gananciaPct') {
      setPriceEdits({ ...priceEdits, [productId]: { ...prev, gananciaPct: value, priceDetal: Math.round(base * (1 + value / 100) * 100) / 100 } });
    } else {
      setPriceEdits({ ...priceEdits, [productId]: { ...prev, gananciaMayorPct: value, priceMayor: Math.round(base * (1 + value / 100) * 100) / 100 } });
    }
  }

  function handlePriceChange(productId: string, field: 'priceDetal' | 'priceMayor', value: number) {
    const sp = suggestedPrices.find(p => p.productId === productId);
    if (!sp) return;
    const cost = sp.newCostUsd;
    const base = cost * (1 + sp.bregaPct / 100) * sp.ivaMultiplier;
    const ganancia = base > 0 ? ((value / base) - 1) * 100 : 0;
    const prev = priceEdits[productId] || { gananciaPct: sp.currentGananciaPct, gananciaMayorPct: sp.currentGananciaMayorPct, priceDetal: sp.suggestedPriceDetal, priceMayor: sp.suggestedPriceMayor };
    if (field === 'priceDetal') {
      setPriceEdits({ ...priceEdits, [productId]: { ...prev, priceDetal: value, gananciaPct: Math.round(ganancia * 100) / 100 } });
    } else {
      setPriceEdits({ ...priceEdits, [productId]: { ...prev, priceMayor: value, gananciaMayorPct: Math.round(ganancia * 100) / 100 } });
    }
  }

  async function handleReceive(updatePrices: boolean) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/purchase-orders/${id}/receive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId: receiveWarehouse,
          receivedDate: receiveDate || undefined,
          items: receiveItems.map(i => ({
            purchaseOrderItemId: i.purchaseOrderItemId,
            receivedQty: Number(i.receivedQty),
            costUsd: Number(i.costUsd),
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }

      // Update prices if requested
      if (updatePrices && Object.keys(priceEdits).length > 0) {
        const priceItems = Object.entries(priceEdits).map(([productId, data]) => ({
          productId,
          gananciaPct: data.gananciaPct,
          gananciaMayorPct: data.gananciaMayorPct,
        }));
        await fetch(`/api/proxy/purchase-orders/${id}/update-prices`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: priceItems }),
        });
      }

      setReceiveModal(false);
      fetchOrder();
      fetchMovements();
      setMessage({ type: 'success', text: updatePrices ? 'Orden recibida — precios actualizados' : 'Orden recibida — stock actualizado' });
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
          {order.status === 'RECEIVED' && (
            <>
              {hasPerm('RETURN_PURCHASE') && (
                <button onClick={() => router.push(`/credit-debit-notes/new?type=NCC&origin=MERCHANDISE&purchaseOrderId=${id}`)} className="btn-secondary text-sm flex items-center gap-1.5">
                  <FileX2 size={14} /> Devolver mercancia
                </button>
              )}
              {hasPerm('CREDIT_NOTE_PURCHASE') && (
                <button onClick={() => router.push(`/credit-debit-notes/new?type=NCC&origin=MANUAL&purchaseOrderId=${id}`)} className="btn-secondary text-sm flex items-center gap-1.5">
                  <FileX2 size={14} /> Nota de credito
                </button>
              )}
              {hasPerm('DEBIT_NOTE_PURCHASE') && (
                <button onClick={() => router.push(`/credit-debit-notes/new?type=NDC&origin=MANUAL&purchaseOrderId=${id}`)} className="btn-secondary text-sm flex items-center gap-1.5">
                  <FileX2 size={14} /> Nota de debito
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      <Tabs defaultValue="info" onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="info">Informacion General</TabsTrigger>
          <TabsTrigger value="recepciones">Recepciones</TabsTrigger>
          {order.isCredit && <TabsTrigger value="cxp">Cuenta por pagar</TabsTrigger>}
          <TabsTrigger value="notas">Notas Cr/Db</TabsTrigger>
        </TabsList>

        {/* ═══ TAB: Info ═══ */}
        <TabsContent value="info">
          <div className="card p-6 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div>
                <p className="text-xs text-slate-500 uppercase">Fecha creacion</p>
                <p className="text-white font-mono">{fmtDate(order.createdAt)}</p>
              </div>
              {order.invoiceDate && (
                <div>
                  <p className="text-xs text-slate-500 uppercase">Fecha factura</p>
                  <p className="text-white font-mono">{fmtDate(order.invoiceDate)}</p>
                </div>
              )}
              {order.receivedDate && (
                <div>
                  <p className="text-xs text-slate-500 uppercase">Fecha recepcion</p>
                  <p className="text-green-400 font-mono">{fmtDate(order.receivedDate)}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500 uppercase">Total USD</p>
                <p className="text-white font-mono font-bold">${order.totalUsd.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">Moneda</p>
                <p className="text-slate-300">{order.currency || 'USD'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">Tasa</p>
                <p className="text-slate-300 font-mono">{order.exchangeRate?.toFixed(4)}</p>
              </div>
              {order.surchargeUsd > 0 && (
                <div>
                  <p className="text-xs text-slate-500 uppercase">Recargo</p>
                  <p className="text-cyan-400 font-mono">${order.surchargeUsd.toFixed(2)} ({order.surchargeDistribution === 'PROPORTIONAL' ? 'Proporcional' : 'Partes iguales'})</p>
                </div>
              )}
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
                      {item.product.isService && <span className="ml-2 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded font-bold">SERVICIO</span>}
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
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Stock despues</th>
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
                      <td className="px-4 py-3 text-right font-mono text-slate-300">${m.costUsd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono text-cyan-400">{m.stockAfter}</td>
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
                      <button onClick={() => router.push(`/payables/${p.id}`)} className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
                        Ver CxP <ExternalLink size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        )}

        {/* ═══ TAB: Notas Cr/Db ═══ */}
        <TabsContent value="notas">
          <PurchaseNotesTab purchaseOrderId={id} />
        </TabsContent>
      </Tabs>

      {/* Receive Modal */}
      {receiveModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setReceiveModal(false)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold text-white">Recibir Orden {order.number}</h2>
                <p className="text-sm text-slate-400">{order.supplier.name}</p>
              </div>
              <button onClick={() => setReceiveModal(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><X size={18} /></button>
            </div>

            {/* Tab buttons */}
            <div className="px-6 pt-3 flex gap-2">
              <button onClick={() => setReceiveTab('confirm')} className={`px-4 py-2 text-sm rounded-lg transition-colors ${receiveTab === 'confirm' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}>
                Confirmar recepcion
              </button>
              <button onClick={() => setReceiveTab('prices')} className={`px-4 py-2 text-sm rounded-lg transition-colors ${receiveTab === 'prices' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}>
                Actualizar precios de venta
              </button>
            </div>

            <div className="p-6 space-y-4">
              {receiveTab === 'confirm' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Almacen destino *</label>
                      <select value={receiveWarehouse} onChange={e => setReceiveWarehouse(e.target.value)} className="input-field !py-2 text-sm" required>
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Fecha de recepcion</label>
                      <input type="date" value={receiveDate} onChange={e => setReceiveDate(e.target.value)} className="input-field !py-2 text-sm" placeholder="Hoy si vacio" />
                    </div>
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
                          <td className="px-3 py-2 text-white text-sm">
                            {item.productName}
                            {item.isService && <span className="ml-2 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded font-bold">SERVICIO</span>}
                          </td>
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
                </>
              )}

              {receiveTab === 'prices' && (
                <div className="overflow-x-auto">
                  {suggestedPrices.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-8">No hay productos (no servicio) para actualizar</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700/50">
                          <th className="text-left px-2 py-2 text-slate-400 font-medium text-xs">Producto</th>
                          <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">Costo ant.</th>
                          <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">Costo nuevo</th>
                          <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">Gan.% Detal</th>
                          <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">Precio Detal</th>
                          <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">Gan.% Mayor</th>
                          <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">Precio Mayor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suggestedPrices.map(sp => {
                          const edits = priceEdits[sp.productId] || { gananciaPct: sp.currentGananciaPct, gananciaMayorPct: sp.currentGananciaMayorPct, priceDetal: sp.suggestedPriceDetal, priceMayor: sp.suggestedPriceMayor };
                          const costUp = sp.newCostUsd > sp.currentCostUsd;
                          const costDown = sp.newCostUsd < sp.currentCostUsd;
                          return (
                            <tr key={sp.productId} className="border-b border-slate-700/30">
                              <td className="px-2 py-2 text-white text-xs">
                                <span className="font-mono text-green-400">{sp.productCode}</span>
                                <span className="ml-1">{sp.productName}</span>
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-slate-400 text-xs">${sp.currentCostUsd.toFixed(2)}</td>
                              <td className={`px-2 py-2 text-right font-mono text-xs font-bold ${costUp ? 'text-red-400' : costDown ? 'text-green-400' : 'text-white'}`}>
                                ${sp.newCostUsd.toFixed(2)}
                              </td>
                              <td className="px-2 py-2 text-right">
                                <input type="number" step="0.1" value={edits.gananciaPct}
                                  onChange={e => handleGananciaChange(sp.productId, 'gananciaPct', Number(e.target.value))}
                                  className="input-field !py-0.5 text-xs w-16 text-right font-mono" />
                              </td>
                              <td className="px-2 py-2 text-right">
                                <input type="number" step="0.01" value={edits.priceDetal}
                                  onChange={e => handlePriceChange(sp.productId, 'priceDetal', Number(e.target.value))}
                                  className="input-field !py-0.5 text-xs w-20 text-right font-mono" />
                              </td>
                              <td className="px-2 py-2 text-right">
                                <input type="number" step="0.1" value={edits.gananciaMayorPct}
                                  onChange={e => handleGananciaChange(sp.productId, 'gananciaMayorPct', Number(e.target.value))}
                                  className="input-field !py-0.5 text-xs w-16 text-right font-mono" />
                              </td>
                              <td className="px-2 py-2 text-right">
                                <input type="number" step="0.01" value={edits.priceMayor}
                                  onChange={e => handlePriceChange(sp.productId, 'priceMayor', Number(e.target.value))}
                                  className="input-field !py-0.5 text-xs w-20 text-right font-mono" />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
                <button type="button" onClick={() => setReceiveModal(false)} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
                <button type="button" onClick={() => handleReceive(false)} disabled={saving} className="btn-secondary !py-2.5 text-sm flex items-center gap-2">
                  {saving && <Loader2 className="animate-spin" size={16} />}
                  Recibir sin actualizar precios
                </button>
                <button type="button" onClick={() => handleReceive(true)} disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
                  {saving && <Loader2 className="animate-spin" size={16} />}
                  <PackageCheck size={16} /> Aplicar precios y recibir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PurchaseNotesTab({ purchaseOrderId }: { purchaseOrderId: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch(`/api/proxy/credit-debit-notes?purchaseOrderId=${purchaseOrderId}&limit=50`);
        const json = await res.json();
        setNotes(json.data || []);
      } catch {}
      setLoading(false);
    }
    fetch_();
  }, [purchaseOrderId]);

  const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-green-500" size={24} /></div>;
  if (notes.length === 0) return <div className="text-center py-12 text-slate-500">No hay notas vinculadas a esta orden</div>;

  const TYPE_LABELS_: Record<string, string> = { NCV: 'NC Venta', NDV: 'ND Venta', NCC: 'NC Compra', NDC: 'ND Compra' };
  const STATUS_LABELS_: Record<string, string> = { DRAFT: 'Borrador', POSTED: 'Confirmada', CANCELLED: 'Anulada' };
  const STATUS_COLORS_: Record<string, string> = { DRAFT: 'text-amber-400 border-amber-500/30 bg-amber-500/10', POSTED: 'text-green-400 border-green-500/30 bg-green-500/10', CANCELLED: 'text-red-400 border-red-500/30 bg-red-500/10' };

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/50">
            <th className="text-left px-4 py-3 text-slate-400 font-medium">Numero</th>
            <th className="text-left px-4 py-3 text-slate-400 font-medium">Tipo</th>
            <th className="text-right px-4 py-3 text-slate-400 font-medium">Total USD</th>
            <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
            <th className="text-center px-4 py-3 text-slate-400 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {notes.map((n: any) => (
            <tr key={n.id} className="border-b border-slate-700/30">
              <td className="px-4 py-3 text-white font-mono">{n.number}</td>
              <td className="px-4 py-3 text-slate-300">{TYPE_LABELS_[n.type] || n.type}</td>
              <td className="px-4 py-3 text-right font-mono text-white">$ {fmt(n.totalUsd)}</td>
              <td className="px-4 py-3 text-center">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS_[n.status]}`}>{STATUS_LABELS_[n.status]}</span>
              </td>
              <td className="px-4 py-3 text-center">
                <button onClick={() => router.push(`/credit-debit-notes/${n.id}`)} className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 mx-auto">
                  Ver <ExternalLink size={10} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
