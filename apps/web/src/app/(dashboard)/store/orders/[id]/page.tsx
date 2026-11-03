'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, XCircle, Phone, User, CreditCard, Truck, Store, MapPin, Receipt, Loader2, X, PackageCheck } from 'lucide-react';
import WhatsAppIcon from '@/components/whatsapp-icon';
import { waPhone, openWhatsAppChat } from '@/lib/whatsapp';
import { ONLINE_ORDERS_CHANGED } from '@/components/online-orders-alert';

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
  status: 'POR_VERIFICAR' | 'CONFIRMADO' | 'FACTURADO' | 'ENTREGADO' | 'CANCELADO';
  verifiedAt: string | null;
  invoiceId: string | null;
  deliveredAt?: string | null;
  deliveredByName?: string | null;
  // Solo viene en GET /online-orders/:id (los PATCH devuelven el pedido sin esto)
  invoice?: { id: string; number: string | null; status: string } | null;
  createdAt: string;
  items: OnlineOrderItem[];
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  POR_VERIFICAR: { label: 'Por verificar', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  CONFIRMADO:    { label: 'Confirmado',    cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  FACTURADO:     { label: 'Facturado',     cls: 'bg-green-500/15 text-green-400 border-green-500/30' },
  ENTREGADO:     { label: 'Entregado',     cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  CANCELADO:     { label: 'Cancelado',     cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

const INVOICE_PAID = ['PAID', 'PARTIAL_RETURN'];

// ── Mensajes para "Avisar al cliente" (salen del WhatsApp del empleado, sin costo) ──
type MsgKey = 'recibido' | 'pago' | 'listo' | 'entregado' | 'cancelado';
const MSG_LABELS: Record<MsgKey, string> = {
  recibido: 'Pedido recibido',
  pago: 'Falta el pago',
  listo: 'Listo para retirar',
  entregado: 'Gracias por su compra',
  cancelado: 'Pedido cancelado',
};
const usd = (n: number) => '$' + (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bs = (n: number) => 'Bs ' + (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const WA_MAX_ITEMS = 40; // un enlace de WhatsApp muy largo falla

function defaultMsgKey(o: OnlineOrder): MsgKey {
  if (o.status === 'CANCELADO') return 'cancelado';
  if (o.status === 'ENTREGADO') return 'entregado';
  if (o.status === 'CONFIRMADO' || o.status === 'FACTURADO') return 'listo';
  return o.paymentRef || o.paymentProofUrl ? 'recibido' : 'pago';
}

function buildCustomerMessage(key: MsgKey, o: OnlineOrder, companyName: string): string {
  const nombre = o.customerName?.trim();
  const saludo = [nombre ? `Hola, ${nombre}. ¡Buen día!` : '¡Hola! ¡Buen día!'];
  if (companyName) saludo.push(`Le saluda ${companyName}.`);
  const total = `*Total: ${usd(o.totalUsd)}*${o.totalBs ? ` (${bs(o.totalBs)})` : ''}`;
  const lines = [...saludo, ''];

  if (key === 'recibido') {
    lines.push(`Recibimos su pedido *${o.number}* de nuestra tienda online:`, '');
    for (const it of o.items.slice(0, WA_MAX_ITEMS)) lines.push(`• ${it.quantity} x ${it.name} — ${usd(it.priceUsd * it.quantity)}`);
    if (o.items.length > WA_MAX_ITEMS) lines.push(`• … y ${o.items.length - WA_MAX_ITEMS} producto(s) más`);
    lines.push('', total, '', 'Estamos verificando el pago y la disponibilidad. Le escribimos apenas esté confirmado.');
  } else if (key === 'pago') {
    lines.push(
      `Recibimos su pedido *${o.number}* de nuestra tienda online.`, '', total, '',
      'Aún no hemos podido verificar el pago. ¿Nos puede enviar por aquí la referencia o la captura del Pago Móvil?',
    );
  } else if (key === 'listo') {
    lines.push(
      `¡Su pedido *${o.number}* ya está listo para retirar en la tienda!`, '',
      'Al retirar, indique el número de pedido y presente su cédula. ¡Gracias por su compra!',
    );
  } else if (key === 'entregado') {
    lines.push(
      `¡Gracias por su compra! Su pedido *${o.number}* ya fue entregado.`, '',
      'Si necesita algo más, con gusto le atendemos por aquí o en nuestra tienda online.',
    );
  } else {
    lines.push(
      `Lamentamos informarle que su pedido *${o.number}* fue cancelado.`, '',
      'Si tiene alguna duda o desea hacer un nuevo pedido, con gusto le ayudamos por aquí.',
    );
  }
  return lines.join('\n');
}

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
  const [companyName, setCompanyName] = useState('');
  const [waOpen, setWaOpen] = useState(false);
  const [waKey, setWaKey] = useState<MsgKey>('recibido');
  const [waText, setWaText] = useState('');
  const [waPhoneInput, setWaPhoneInput] = useState('');
  const [waError, setWaError] = useState('');

  // Nombre de la empresa para el saludo del mensaje de WhatsApp
  useEffect(() => {
    fetch('/api/proxy/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => setCompanyName(cfg?.companyName || ''))
      .catch(() => {});
  }, []);

  // Si el nombre de la empresa llega con el modal ya abierto y el texto no se ha tocado,
  // se rearma el mensaje para que incluya el saludo.
  const [waEdited, setWaEdited] = useState(false);
  useEffect(() => {
    if (waOpen && !waEdited && order && companyName) setWaText(buildCustomerMessage(waKey, order, companyName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyName]);

  function openNotify() {
    if (!order) return;
    const key = defaultMsgKey(order);
    setWaKey(key);
    setWaText(buildCustomerMessage(key, order, companyName));
    setWaPhoneInput(order.phone || '');
    setWaError('');
    setWaEdited(false);
    setWaOpen(true);
  }

  function pickTemplate(key: MsgKey) {
    if (!order) return;
    setWaKey(key);
    setWaText(buildCustomerMessage(key, order, companyName));
    setWaEdited(false);
  }

  function sendWhatsApp() {
    const phone = waPhone(waPhoneInput);
    if (!phone) { setWaError('Número inválido. Ejemplo: 0414-1234567'); return; }
    if (!waText.trim()) { setWaError('El mensaje está vacío'); return; }
    openWhatsAppChat(phone, waText);
    setWaOpen(false);
  }

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
      window.dispatchEvent(new Event(ONLINE_ORDERS_CHANGED)); // refresca el contador del menú
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setActing(false);
    }
  }

  async function deliver() {
    if (!order) return;
    if (!confirm(`¿Confirmas que el cliente ya retiró el pedido ${order.number}?`)) return;
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/proxy/online-orders/${id}/deliver`, { method: 'PATCH' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'No se pudo marcar como entregado');
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

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 font-mono">{order.number}</h1>
          <p className="text-sm text-slate-500">{new Date(order.createdAt).toLocaleString('es-VE')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openNotify}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-[#25D366]/15 text-[#25D366] border border-[#25D366]/30 hover:bg-[#25D366]/25"
            title="Abre tu WhatsApp con el mensaje ya escrito"
          >
            <WhatsAppIcon size={14} /> Avisar al cliente
          </button>
          <span className={`px-3 py-1.5 text-sm rounded-md border ${st.cls}`}>{st.label}</span>
        </div>
      </div>

      {/* Modal: elegir mensaje y abrir WhatsApp */}
      {waOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setWaOpen(false)}>
          <div
            className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <WhatsAppIcon size={18} className="text-[#25D366]" /> Avisar al cliente
              </h2>
              <button onClick={() => setWaOpen(false)} className="p-1 rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-800" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              {(Object.keys(MSG_LABELS) as MsgKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => pickTemplate(k)}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                    waKey === k ? 'bg-[#25D366]/20 text-[#25D366] border-[#25D366]/40' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {MSG_LABELS[k]}
                </button>
              ))}
            </div>

            <label className="text-xs text-slate-400 mb-1 block">Teléfono</label>
            <input
              value={waPhoneInput}
              onChange={(e) => { setWaPhoneInput(e.target.value); setWaError(''); }}
              className="w-full mb-3 px-3 py-2 text-sm rounded-lg bg-slate-800 border border-slate-600 text-slate-100 font-mono focus:border-[#25D366] outline-none"
            />

            <label className="text-xs text-slate-400 mb-1 block">Mensaje (puedes editarlo)</label>
            <textarea
              value={waText}
              onChange={(e) => { setWaText(e.target.value); setWaEdited(true); setWaError(''); }}
              rows={11}
              className="w-full px-3 py-2 text-sm rounded-lg bg-slate-800 border border-slate-600 text-slate-100 focus:border-[#25D366] outline-none resize-y"
            />

            {waError && <p className="mt-2 text-xs text-red-400">{waError}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setWaOpen(false)} className="px-3 py-2 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200">
                Cancelar
              </button>
              <button
                onClick={sendWhatsApp}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[#25D366] hover:bg-[#20bd5a] text-slate-900 font-semibold"
              >
                <WhatsAppIcon size={14} /> Abrir WhatsApp
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-500 text-right">Se abre tu WhatsApp con el mensaje escrito: revisa y dale a enviar.</p>
          </div>
        </div>
      )}

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
        order.invoice && INVOICE_PAID.includes(order.invoice.status) ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-emerald-300 flex items-center gap-2">
                <CheckCircle size={16} /> Factura {order.invoice.number} cobrada
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Cuando el cliente retire la mercancía, márcalo como entregado.</p>
            </div>
            <button
              onClick={deliver}
              disabled={acting}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg text-sm inline-flex items-center gap-2 whitespace-nowrap"
            >
              {acting ? <Loader2 size={15} className="animate-spin" /> : <PackageCheck size={15} />}
              Marcar entregado
            </button>
          </div>
        ) : (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-green-300 flex items-center gap-2">
              <Receipt size={16} />
              Pedido facturado{order.invoice?.number ? ` (${order.invoice.number})` : ''}. Retómalo en el POS (facturas en espera) para cobrarlo; luego podrás marcarlo como entregado.
            </p>
            <Link href="/sales/pos" className="text-sm text-blue-400 hover:text-blue-300 font-medium whitespace-nowrap">
              Ir al POS →
            </Link>
          </div>
        )
      )}

      {order.status === 'ENTREGADO' && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
          <p className="text-sm font-semibold text-emerald-300 flex items-center gap-2">
            <PackageCheck size={16} /> Pedido entregado
            {order.deliveredAt ? ` el ${new Date(order.deliveredAt).toLocaleString('es-VE')}` : ''}
            {order.deliveredByName ? ` por ${order.deliveredByName}` : ''}
          </p>
          {order.invoice?.number && <p className="text-xs text-slate-400 mt-1">Factura {order.invoice.number}</p>}
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
