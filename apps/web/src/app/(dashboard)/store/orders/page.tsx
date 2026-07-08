'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart, RotateCw, Phone, Truck, Store } from 'lucide-react';

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
  paymentRef: string | null;
  totalUsd: number;
  totalBs: number;
  status: 'POR_VERIFICAR' | 'CONFIRMADO' | 'FACTURADO' | 'CANCELADO';
  createdAt: string;
  items: OnlineOrderItem[];
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  POR_VERIFICAR: { label: 'Por verificar', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  CONFIRMADO:    { label: 'Confirmado',    cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  FACTURADO:     { label: 'Facturado',     cls: 'bg-green-500/15 text-green-400 border-green-500/30' },
  CANCELADO:     { label: 'Cancelado',     cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

const TABS: { key: string; label: string }[] = [
  { key: 'POR_VERIFICAR', label: 'Por verificar' },
  { key: 'CONFIRMADO', label: 'Confirmados' },
  { key: '', label: 'Todos' },
];

const REFRESH_MS = 15000;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function StoreOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('POR_VERIFICAR');

  useEffect(() => { document.title = 'Pedidos online | Trinity ERP'; }, []);

  const fetchOrders = useCallback(async () => {
    const params = new URLSearchParams();
    if (tab) params.set('status', tab);
    try {
      const res = await fetch(`/api/proxy/online-orders?${params.toString()}`);
      const data = res.ok ? await res.json() : [];
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    fetchOrders();
    const t = setInterval(fetchOrders, REFRESH_MS);
    return () => clearInterval(t);
  }, [fetchOrders]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShoppingCart className="text-blue-400" size={26} />
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Pedidos online</h1>
            <p className="text-sm text-slate-400">Verifica el pago y confirma los pedidos de la tienda</p>
          </div>
        </div>
        <button onClick={() => fetchOrders()} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200">
          <RotateCw size={16} /> Actualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key || 'all'}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              tab === t.key ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">Cargando…</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-slate-500">No hay pedidos en esta vista.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-slate-400">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Pedido</th>
                <th className="text-left px-4 py-3 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 font-medium">Entrega</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {orders.map((o) => {
                const st = STATUS_META[o.status];
                return (
                  <tr
                    key={o.id}
                    onClick={() => router.push(`/store/orders/${o.id}`)}
                    className="hover:bg-slate-800/50 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-blue-400">{o.number}</span>
                      <div className="text-[11px] text-slate-500">{o.items.length} art.</div>
                    </td>
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{fmtDate(o.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="text-slate-200">{o.customerName}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1"><Phone size={11} /> {o.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      <span className="flex items-center gap-1.5">
                        {o.deliveryMethod === 'DELIVERY' ? <Truck size={14} /> : <Store size={14} />}
                        {o.deliveryMethod === 'DELIVERY' ? 'Delivery' : 'Retiro'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="text-slate-100 font-semibold">${o.totalUsd.toFixed(2)}</div>
                      <div className="text-[11px] text-slate-500">Bs {o.totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 text-[11px] rounded-md border ${st.cls}`}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
