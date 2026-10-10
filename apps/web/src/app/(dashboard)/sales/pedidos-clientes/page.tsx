'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingBag, Loader2, Lock, X, ExternalLink, RefreshCw } from 'lucide-react';

interface Row {
  id: string; portalNote: string | null; createdAt: string; clientUpdatedAt: string | null;
  totalUsd: number; itemCount: number; unseen: boolean; state: 'ABIERTO' | 'EN_USO'; lockedByName: string | null;
  customer: { id: string; name: string; code: string | null } | null;
  seller: { id: string; name: string } | null;
}
interface Detail {
  id: string; portalNote: string | null; createdAt: string; clientUpdatedAt: string | null; totalUsd: number;
  customer: { name: string; code: string | null; documentType: string; rif: string | null } | null;
  seller: { name: string } | null;
  items: { productId: string; productCode: string | null; productName: string; quantity: number; totalUsd: number }[];
}

const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDateTime = (s: string | null) => (s ? new Date(s).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

export default function PedidosClientesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]);
  const [mySellerId, setMySellerId] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [sellerFilter, setSellerFilter] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => { document.title = 'Pedidos de clientes | Trinity ERP'; }, []);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        // El vendedor arranca viendo solo los pedidos de SUS clientes (como "Mis facturas" del POS).
        if (u?.seller?.id) { setMySellerId(u.seller.id); setOnlyMine(u.role === 'SELLER'); }
      })
      .finally(() => setReady(true));
    fetch('/api/proxy/sellers?isActive=true')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setSellers(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (onlyMine) qs.set('mine', 'true');
    else if (sellerFilter) qs.set('sellerId', sellerFilter);
    try {
      const res = await fetch(`/api/proxy/client-orders?${qs}`);
      if (res.ok) setRows(await res.json());
    } finally { setLoading(false); }
  }, [onlyMine, sellerFilter]);

  useEffect(() => {
    if (!ready) return;
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [ready, load]);

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/proxy/client-orders/${id}`);
      if (!res.ok) return;
      setDetail(await res.json());
      await fetch(`/api/proxy/client-orders/${id}/seen`, { method: 'PATCH' });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, unseen: false } : r)));
      window.dispatchEvent(new Event('trinity-client-orders-changed'));
    } finally { setDetailLoading(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30"><ShoppingBag className="text-amber-400" size={20} /></div>
        <div>
          <h1 className="text-xl font-bold text-white">Pedidos de clientes</h1>
          <p className="text-sm text-slate-400">Pedidos que los clientes montan desde el portal. Se procesan en el POS.</p>
        </div>
        <button onClick={() => { setLoading(true); load(); }} className="ml-auto btn-secondary !py-2 text-sm flex items-center gap-2"><RefreshCw size={15} /> Actualizar</button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {mySellerId && (
          <div className="flex gap-1 p-1 rounded-lg bg-slate-800/60 border border-slate-700/50">
            {[{ v: true, l: 'Mis clientes' }, { v: false, l: 'Todos' }].map((o) => (
              <button key={String(o.v)} onClick={() => setOnlyMine(o.v)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${onlyMine === o.v ? 'bg-green-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{o.l}</button>
            ))}
          </div>
        )}
        {!onlyMine && (
          <select value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)} className="input-field !py-2 text-sm w-auto">
            <option value="">Todos los vendedores</option>
            {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-green-500" size={24} /></div>
        ) : rows.length === 0 ? (
          <p className="text-center py-12 text-slate-500 text-sm">No hay pedidos de clientes abiertos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700/50 text-left">
                  <th className="px-4 py-2 font-medium">Cliente</th>
                  <th className="px-4 py-2 font-medium">Pedido</th>
                  <th className="px-4 py-2 font-medium">Vendedor</th>
                  <th className="px-4 py-2 font-medium text-right">Renglones</th>
                  <th className="px-4 py-2 font-medium text-right">Total est.</th>
                  <th className="px-4 py-2 font-medium">Modificado</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => openDetail(r.id)}
                    className={`border-b border-slate-700/30 last:border-0 cursor-pointer hover:bg-slate-800/40 ${r.unseen ? 'bg-amber-500/5' : ''}`}>
                    <td className="px-4 py-2.5 text-slate-200">
                      {r.unseen && <span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-2 align-middle" />}
                      {r.customer?.name || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-300">{r.portalNote || <span className="text-slate-500">Sin nombre</span>}</td>
                    <td className="px-4 py-2.5 text-slate-400">{r.seller?.name || 'Sin vendedor'}</td>
                    <td className="px-4 py-2.5 text-right text-slate-300">{r.itemCount}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-white">$ {fmt(r.totalUsd)}</td>
                    <td className="px-4 py-2.5 text-slate-400">{fmtDateTime(r.clientUpdatedAt || r.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      {r.state === 'EN_USO'
                        ? <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300"><Lock size={11} /> {r.lockedByName || 'En uso'}</span>
                        : r.unseen
                          ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300">Nuevo / modificado</span>
                          : <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300">Abierto</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDetail(null)}>
          <div className="card w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {detailLoading || !detail ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-green-500" size={24} /></div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">{detail.customer?.name}</h2>
                    <p className="text-sm text-slate-400">{detail.portalNote || 'Pedido sin nombre'} · Vendedor: {detail.seller?.name || 'Sin vendedor'}</p>
                    <p className="text-xs text-slate-500">Modificado por el cliente: {fmtDateTime(detail.clientUpdatedAt || detail.createdAt)}</p>
                  </div>
                  <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-white" aria-label="Cerrar"><X size={20} /></button>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700/50 text-left">
                      <th className="py-2 font-medium">Código</th>
                      <th className="py-2 font-medium">Producto</th>
                      <th className="py-2 font-medium text-right">Cant.</th>
                      <th className="py-2 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((it) => (
                      <tr key={it.productId} className="border-b border-slate-700/30 last:border-0">
                        <td className="py-2 font-mono text-xs text-slate-400">{it.productCode || '—'}</td>
                        <td className="py-2 text-slate-200">{it.productName}</td>
                        <td className="py-2 text-right text-slate-300">{it.quantity}</td>
                        <td className="py-2 text-right font-mono text-white">$ {fmt(it.totalUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700/50">
                  <span className="text-sm text-slate-400">Total estimado: <b className="font-mono text-white">$ {fmt(detail.totalUsd)}</b></span>
                  <button onClick={() => router.push(`/sales/pos?retake=${detail.id}`)} className="btn-primary !py-2 text-sm flex items-center gap-2">
                    <ExternalLink size={15} /> Abrir en el POS
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">Al abrirlo en el POS queda bloqueado para el cliente y se recalcula con el precio y la tasa de hoy.</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
