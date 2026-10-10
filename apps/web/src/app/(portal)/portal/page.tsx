'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, Lock, Trash2, FileDown, Wallet } from 'lucide-react';

const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-VE') : '—');
const fmtDateTime = (s: string | null) =>
  s ? new Date(s).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const statusLabel: Record<string, string> = {
  PENDING: 'Pendiente', PARTIAL: 'Parcial', OVERDUE: 'Vencido', PAID: 'Pagada',
  PARTIAL_RETURN: 'Dev. parcial', RETURNED: 'Devuelta', CANCELLED: 'Anulada',
};

interface Order {
  id: string; portalNote: string | null; createdAt: string; clientUpdatedAt: string | null;
  totalUsd: number; totalBs: number; itemCount: number; state: 'ABIERTO' | 'EN_USO';
}
interface Cxc { id: string; number: string; documentNumber: string | null; amountUsd: number; saldoUsd: number; dueDate: string | null; status: string; }
interface Factura { id: string; number: string | null; fiscalNumber: string | null; status: string; totalUsd: number; saldoUsd: number; createdAt: string; }
interface PortalMe { customer: { name: string; code: string | null; documentType: string; rif: string | null }; companyName: string; }

async function getJson(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'No disponible');
  return r.json();
}

export default function PortalHomePage() {
  const router = useRouter();
  const [tab, setTab] = useState<'pedidos' | 'cuenta'>('pedidos');
  const [me, setMe] = useState<PortalMe | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cxc, setCxc] = useState<Cxc[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { document.title = 'Mis pedidos | Trinity ERP'; }, []);

  const loadOrders = useCallback(async () => {
    setOrders(await getJson('/api/proxy/portal/orders'));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [m] = await Promise.all([getJson('/api/proxy/portal/me'), loadOrders()]);
        setMe(m);
        const [c, f] = await Promise.all([
          getJson('/api/proxy/portal/cuenta/cxc').catch(() => []),
          getJson('/api/proxy/portal/cuenta/facturas').catch(() => []),
        ]);
        setCxc(c); setFacturas(f);
      } catch (e: any) { setError(e.message); } finally { setLoading(false); }
    })();
  }, [loadOrders]);

  async function deleteOrder(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/proxy/portal/orders/${id}`, { method: 'DELETE' });
      if (!res.ok) alert((await res.json().catch(() => ({}))).message || 'No se pudo eliminar');
      await loadOrders();
    } finally { setDeleting(false); setConfirmDelete(null); }
  }

  if (loading) {
    return <div className="py-24 flex items-center justify-center text-slate-400 gap-2"><Loader2 className="animate-spin" size={18} /> Cargando…</div>;
  }
  if (error) {
    return (
      <div className="max-w-md mx-auto py-24 text-center">
        <p className="text-slate-300 font-medium">Portal no disponible</p>
        <p className="text-slate-500 text-sm mt-1">{error}</p>
      </div>
    );
  }

  const saldo = cxc.reduce((s, r) => s + (r.saldoUsd || 0), 0);

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-gradient-to-br from-emerald-600/15 via-slate-800/40 to-slate-900/40 p-5">
        <div className="absolute -top-16 -right-10 w-48 h-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="relative">
          {me?.companyName && <p className="text-[11px] uppercase tracking-wide text-emerald-300/80">{me.companyName}</p>}
          <h1 className="text-xl font-bold text-white mt-0.5">{me?.customer.name}</h1>
          {me?.customer.rif && <p className="text-xs text-slate-400 mt-0.5">{me.customer.documentType}-{me.customer.rif}</p>}
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
        {(['pedidos', 'cuenta'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            {t === 'pedidos' ? `Mis pedidos (${orders.length})` : 'Mi cuenta'}
          </button>
        ))}
      </div>

      {tab === 'pedidos' && (
        <div className="space-y-3">
          <button onClick={() => router.push('/portal/pedido/nuevo')} className="btn-primary w-full flex items-center justify-center gap-2 !py-3">
            <Plus size={18} /> Nuevo pedido
          </button>
          {orders.length === 0 && <p className="text-center text-slate-500 text-sm py-10">No tienes pedidos abiertos.</p>}
          {orders.map((o) => (
            <div key={o.id} className="card p-4">
              <button onClick={() => router.push(`/portal/pedido/${o.id}`)} className="w-full text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-100 truncate">{o.portalNote || 'Pedido sin nombre'}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Creado {fmtDate(o.createdAt)} · modificado {fmtDateTime(o.clientUpdatedAt || o.createdAt)}</p>
                  </div>
                  {o.state === 'EN_USO' ? (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300"><Lock size={11} /> En proceso</span>
                  ) : (
                    <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">Abierto</span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-slate-400">{o.itemCount} producto(s)</span>
                  <span className="font-mono font-bold text-white">$ {fmt(o.totalUsd)}</span>
                </div>
              </button>
              {o.state === 'ABIERTO' && (confirmDelete === o.id ? (
                <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-xs text-red-300 mb-2">¿Eliminar este pedido completo?</p>
                  <div className="flex gap-2">
                    <button disabled={deleting} onClick={() => deleteOrder(o.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white disabled:opacity-50">Sí, eliminar</button>
                    <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 text-slate-200">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(o.id)} className="mt-3 text-xs text-red-400 hover:text-red-300 inline-flex items-center gap-1">
                  <Trash2 size={13} /> Eliminar pedido
                </button>
              ))}
            </div>
          ))}
          <p className="text-[11px] text-slate-500 text-center">Los totales son referenciales: se facturan al precio y tasa del día del despacho.</p>
        </div>
      )}

      {tab === 'cuenta' && (
        <div className="space-y-4">
          <div className="card p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10"><Wallet size={18} className="text-blue-400" /></div>
            <div>
              <div className="text-xs text-slate-400">Saldo por pagar</div>
              <div className="text-xl font-bold text-white font-mono">$ {fmt(saldo)}</div>
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <h2 className="px-4 py-3 text-sm font-semibold text-white border-b border-slate-700/50">Estado de cuenta</h2>
            {cxc.length === 0 ? <p className="text-center py-8 text-slate-500 text-sm">No tienes cuentas pendientes.</p> : (
              <div className="divide-y divide-slate-800">
                {cxc.map((r) => (
                  <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-200 truncate">{r.documentNumber || r.number || 'Documento'}</p>
                      <p className="text-[11px] text-slate-500">Vence {fmtDate(r.dueDate)} · {statusLabel[r.status] || r.status}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono text-white">$ {fmt(r.saldoUsd)}</p>
                      <p className="text-[11px] text-slate-500 font-mono">de $ {fmt(r.amountUsd)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-0 overflow-hidden">
            <h2 className="px-4 py-3 text-sm font-semibold text-white border-b border-slate-700/50">Mis facturas</h2>
            {facturas.length === 0 ? <p className="text-center py-8 text-slate-500 text-sm">No tienes facturas.</p> : (
              <div className="divide-y divide-slate-800">
                {facturas.map((f) => (
                  <div key={f.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-200 truncate">{f.fiscalNumber || f.number}</p>
                      <p className="text-[11px] text-slate-500">{fmtDate(f.createdAt)} · {statusLabel[f.status] || f.status}{f.saldoUsd > 0.009 ? ` · saldo $ ${fmt(f.saldoUsd)}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-mono text-white">$ {fmt(f.totalUsd)}</span>
                      <a href={`/api/proxy/portal/cuenta/facturas/${f.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-400 text-xs hover:underline">
                        <FileDown size={14} /> PDF
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
