'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, XCircle, Phone, User, CreditCard, Truck, Store, MapPin } from 'lucide-react';

interface OnlineOrderItem {
  id: string;
  code: string;
  name: string;
  quantity: number;
  priceUsd: number;
  priceBs: number;
}
interface OnlineOrder {
  id: string;
  number: string;
  customerName: string;
  phone: string;
  cedula: string | null;
  deliveryMethod: string;
  address: string | null;
  paymentRef: string | null;
  notes: string | null;
  email: string | null;
  totalUsd: number;
  totalBs: number;
  exchangeRate: number;
  status: 'POR_VERIFICAR' | 'CONFIRMADO' | 'FACTURADO' | 'CANCELADO';
  verifiedAt: string | null;
  createdAt: string;
  items: OnlineOrderItem[];
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  POR_VERIFICAR: { label: 'Por verificar', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  CONFIRMADO:    { label: 'Confirmado',    cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  FACTURADO:     { label: 'Facturado',     cls: 'bg-green-500/15 text-green-400 border-green-500/30' },
  CANCELADO:     { label: 'Cancelado',     cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

export default function StoreOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OnlineOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/proxy/online-orders/${id}`);
      if (!res.ok) throw new Error('No encontrado');
      setOrder(await res.json());
    } catch {
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);
  useEffect(() => {
    document.title = order ? `${order.number} | Trinity ERP` : 'Pedido online | Trinity ERP';
  }, [order]);

  async function act(action: 'confirm' | 'cancel') {
    if (action === 'cancel' && !confirm('¿Cancelar este pedido?')) return;
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/proxy/online-orders/${id}/${action}`, { method: 'PATCH' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'No se pudo procesar');
      setOrder(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setActing(false);
    }
  }

  if (loading) return <div className="p-6 text-center text-slate-400">Cargando…</div>;
  if (!order) return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href="/store/orders" className="text-blue-400 flex items-center gap-2 mb-4"><ArrowLeft size={16} /> Volver</Link>
      <div className="text-center py-16 text-slate-500">Pedido no encontrado.</div>
    </div>
  );

  const st = STATUS_META[order.status];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href="/store/orders" className="text-slate-400 hover:text-blue-400 flex items-center gap-2 mb-4 text-sm"><ArrowLeft size={16} /> Volver a pedidos</Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 font-mono">{order.number}</h1>
          <p className="text-sm text-slate-500">{new Date(order.createdAt).toLocaleString('es-VE')}</p>
        </div>
        <span className={`px-3 py-1.5 text-sm rounded-md border ${st.cls}`}>{st.label}</span>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Contacto */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-slate-300 mb-2">Contacto</h2>
          <p className="text-slate-200 flex items-center gap-2"><User size={15} className="text-slate-500" /> {order.customerName}</p>
          <p className="text-slate-200 flex items-center gap-2"><Phone size={15} className="text-slate-500" /> {order.phone}</p>
          {order.cedula && <p className="text-slate-400 text-sm pl-6">C.I. {order.cedula}</p>}
          {order.email && <p className="text-slate-400 text-sm pl-6">{order.email}</p>}
        </div>

        {/* Entrega + pago */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-slate-300 mb-2">Entrega y pago</h2>
          <p className="text-slate-200 flex items-center gap-2">
            {order.deliveryMethod === 'DELIVERY' ? <Truck size={15} className="text-slate-500" /> : <Store size={15} className="text-slate-500" />}
            {order.deliveryMethod === 'DELIVERY' ? 'Delivery' : 'Retiro en tienda'}
          </p>
          {order.address && <p className="text-slate-400 text-sm flex items-start gap-2"><MapPin size={15} className="text-slate-500 mt-0.5" /> {order.address}</p>}
          <p className="text-slate-200 flex items-center gap-2"><CreditCard size={15} className="text-slate-500" /> Ref. Pago Móvil: <span className="font-mono">{order.paymentRef || '—'}</span></p>
        </div>
      </div>

      {order.notes && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 mb-4">
          <h2 className="text-sm font-semibold text-slate-300 mb-1">Notas del cliente</h2>
          <p className="text-slate-300 text-sm">{order.notes}</p>
        </div>
      )}

      {/* Items */}
      <div className="rounded-xl border border-slate-700 overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-400">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Artículo</th>
              <th className="text-right px-4 py-2.5 font-medium">Cant.</th>
              <th className="text-right px-4 py-2.5 font-medium">Precio</th>
              <th className="text-right px-4 py-2.5 font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {order.items.map((it) => (
              <tr key={it.id}>
                <td className="px-4 py-2.5">
                  <div className="text-slate-200">{it.name}</div>
                  <div className="text-[11px] text-slate-500 font-mono">{it.code}</div>
                </td>
                <td className="px-4 py-2.5 text-right text-slate-300">{it.quantity}</td>
                <td className="px-4 py-2.5 text-right text-slate-300">${it.priceUsd.toFixed(2)}</td>
                <td className="px-4 py-2.5 text-right text-slate-100">${(it.priceUsd * it.quantity).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-800/60">
            <tr>
              <td colSpan={3} className="px-4 py-3 text-right text-slate-400">Total</td>
              <td className="px-4 py-3 text-right">
                <div className="text-slate-100 font-semibold">${order.totalUsd.toFixed(2)}</div>
                <div className="text-[11px] text-slate-500">Bs {order.totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Acciones */}
      {order.status === 'POR_VERIFICAR' && (
        <div className="flex gap-3">
          <button
            onClick={() => act('confirm')}
            disabled={acting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium disabled:opacity-50"
          >
            <CheckCircle size={18} /> Confirmar pago
          </button>
          <button
            onClick={() => act('cancel')}
            disabled={acting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-700 hover:bg-red-600 text-slate-200 hover:text-white font-medium disabled:opacity-50"
          >
            <XCircle size={18} /> Cancelar
          </button>
        </div>
      )}
      {order.status === 'CONFIRMADO' && (
        <div className="flex items-center gap-2 text-green-400 text-sm">
          <CheckCircle size={16} /> Pago verificado{order.verifiedAt ? ` el ${new Date(order.verifiedAt).toLocaleString('es-VE')}` : ''}. Listo para facturar/despachar.
        </div>
      )}
    </div>
  );
}
