'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, XCircle, Phone, User, CreditCard, Truck, Store, MapPin, Receipt, Loader2 } from 'lucide-react';

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
  paymentProofUrl: string | null;
  notes: string | null;
  email: string | null;
  totalUsd: number;
  totalBs: number;
  exchangeRate: number;
  status: 'POR_VERIFICAR' | 'CONFIRMADO' | 'FACTURADO' | 'CANCELADO';
  verifiedAt: string | null;
  invoiceId: string | null;
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
  const [ref, setRef] = useState('');
  const [savedRef, setSavedRef] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [billing, setBilling] = useState(false);
  const [billMsg, setBillMsg] = useState<{ text: string; skipped: { code: string; reason: string }[] } | null>(null);

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
    if (order) setRef(order.paymentRef ?? '');
  }, [order]);

  async function saveRef() {
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/proxy/online-orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentRef: ref }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'No se pudo guardar');
      setOrder(data);
      setSavedRef(true);
      setTimeout(() => setSavedRef(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setActing(false);
    }
  }

  async function act(action: 'confirm' | 'cancel') {
    if (action === 'cancel' && !confirm('¿Cancelar este pedido?')) return;
    setActing(true);
    setError(null);
    try {
      // Al confirmar, guarda primero la referencia editada (si cambió).
      if (action === 'confirm' && order && ref !== (order.paymentRef ?? '')) {
        await fetch(`/api/proxy/online-orders/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentRef: ref }),
        });
      }
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

  async function createInvoice() {
    if (!order) return;
    if (!confirm(`¿Crear una factura de venta PENDIENTE del pedido ${order.number}? Luego se retoma en el POS para cobrarla.`)) return;
    setBilling(true);
    setError(null);
    setBillMsg(null);
    try {
      const res = await fetch(`/api/proxy/invoices/from-online-order/${id}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'No se pudo facturar el pedido');
      setBillMsg({
        text: 'Factura pendiente creada. Retómala en el POS (facturas en espera) para cobrarla.',
        skipped: Array.isArray(data?.skipped) ? data.skipped : [],
      });
      fetchOrder(); // el pedido pasa a FACTURADO
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBilling(false);
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
          <div className="pt-1">
            <label className="text-xs text-slate-400 flex items-center gap-2 mb-1"><CreditCard size={14} className="text-slate-500" /> Ref. Pago Móvil</label>
            {order.status === 'POR_VERIFICAR' ? (
              <div className="flex gap-2">
                <input
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="N° de referencia del banco"
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-slate-900 border border-slate-600 text-slate-100 font-mono focus:border-blue-500 outline-none"
                />
                <button
                  onClick={saveRef}
                  disabled={acting || ref === (order.paymentRef ?? '')}
                  className="px-3 py-1.5 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-40"
                >
                  {savedRef ? '✓' : 'Guardar'}
                </button>
              </div>
            ) : (
              <p className="text-slate-200 font-mono">{order.paymentRef || '—'}</p>
            )}
          </div>
          {/* Captura del pago que subió el cliente */}
          <div className="pt-1">
            <label className="text-xs text-slate-400 mb-1 block">Captura del pago</label>
            {order.paymentProofUrl ? (
              <button
                type="button"
                onClick={() => setProofOpen(true)}
                className="block rounded-lg overflow-hidden border border-slate-600 hover:border-blue-500 transition-colors"
                title="Ver captura en grande"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={order.paymentProofUrl} alt="Captura del pago" className="h-28 w-full object-cover" />
              </button>
            ) : (
              <p className="text-slate-500 text-sm">Sin captura adjunta</p>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox de la captura */}
      {proofOpen && order.paymentProofUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setProofOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={order.paymentProofUrl}
            alt="Captura del pago"
            className="max-h-[90vh] max-w-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setProofOpen(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 text-slate-200 hover:bg-slate-700"
            aria-label="Cerrar"
          >
            <XCircle size={22} />
          </button>
        </div>
      )}

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
        <>
          <div className="flex items-center gap-2 text-green-400 text-sm mb-4">
            <CheckCircle size={16} /> Pago verificado{order.verifiedAt ? ` el ${new Date(order.verifiedAt).toLocaleString('es-VE')}` : ''}. Listo para facturar/despachar.
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-200">Facturar pedido</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Crea una factura <span className="text-slate-300">pendiente</span> con los artículos del pedido
                al <span className="text-slate-300">precio que pagó el cliente</span>. Si el cliente no existe se crea
                con sus datos. Luego se retoma en el <span className="text-slate-300">POS</span> para cobrarla.
              </p>
            </div>
            <button
              onClick={createInvoice}
              disabled={billing}
              className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg text-sm inline-flex items-center gap-2 whitespace-nowrap"
            >
              {billing ? <Loader2 size={15} className="animate-spin" /> : <Receipt size={15} />}
              Facturar pedido
            </button>
          </div>
        </>
      )}

      {order.status === 'FACTURADO' && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-green-300 flex items-center gap-2">
            <Receipt size={16} /> Pedido facturado. Retómalo en el POS (facturas en espera) para cobrarlo.
          </p>
          <Link href="/sales/pos" className="text-sm text-blue-400 hover:text-blue-300 font-medium whitespace-nowrap">
            Ir al POS →
          </Link>
        </div>
      )}

      {/* Resultado de facturar */}
      {billMsg && (
        <div className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 p-4">
          <p className="text-sm text-green-300 flex items-center gap-2">
            <CheckCircle size={16} /> {billMsg.text}
          </p>
          <Link href="/sales/pos" className="inline-block mt-2 text-sm text-blue-400 hover:text-blue-300 font-medium">
            Ir al POS →
          </Link>
          {billMsg.skipped.length > 0 && (
            <div className="mt-3 text-xs text-amber-400">
              <p className="font-medium">Artículos omitidos:</p>
              <ul className="list-disc list-inside">
                {billMsg.skipped.map((s) => (
                  <li key={s.code}><span className="font-mono">{s.code}</span> — {s.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
