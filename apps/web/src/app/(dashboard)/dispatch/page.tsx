'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Truck, Plus, Search, X, Loader2, Phone, AlertTriangle, ClipboardList, RotateCw,
} from 'lucide-react';
import { DISPATCH_STATUS_META as STATUS_META, fmtQty, fmtDate, isOverdue } from '@/lib/dispatch';

interface Area { id: string; name: string; }

export default function DispatchPage() {
  const router = useRouter();
  const [areas, setAreas] = useState<Area[]>([]);
  const [tab, setTab] = useState<string>('comandas'); // 'comandas' | 'todos' | <areaId>
  const [search, setSearch] = useState('');
  const [dispatches, setDispatches] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceResults, setInvoiceResults] = useState<any[]>([]);
  const [searchingInv, setSearchingInv] = useState(false);
  const [creating, setCreating] = useState(false);
  const searchTimer = useRef<any>(null);
  const invTimer = useRef<any>(null);

  useEffect(() => { document.title = 'Por despachar | Trinity ERP'; }, []);

  useEffect(() => {
    fetch('/api/proxy/print-areas').then(r => r.ok ? r.json() : []).then((d) => setAreas(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const load = useCallback(async (activeTab: string, q: string) => {
    setLoading(true);
    try {
      if (activeTab === 'comandas') {
        const res = await fetch(`/api/proxy/dispatches?search=${encodeURIComponent(q)}`);
        setDispatches(res.ok ? await res.json() : []);
      } else {
        const areaParam = activeTab === 'todos' ? '' : `&printAreaId=${activeTab}`;
        const res = await fetch(`/api/proxy/dispatches/items?search=${encodeURIComponent(q)}${areaParam}`);
        setItems(res.ok ? await res.json() : []);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(tab, search), 250);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [tab, search, load]);

  const refresh = () => load(tab, search);
  const openDispatch = (id: string) => router.push(`/dispatch/${id}`);

  // Búsqueda de facturas para crear (por trozos del número o nombre del cliente; solo pagadas)
  useEffect(() => {
    if (!createOpen || !invoiceSearch.trim()) { setInvoiceResults([]); return; }
    if (invTimer.current) clearTimeout(invTimer.current);
    invTimer.current = setTimeout(async () => {
      setSearchingInv(true);
      try {
        const res = await fetch(`/api/proxy/invoices?search=${encodeURIComponent(invoiceSearch)}&limit=10&status=PAID`);
        const data = await res.json();
        setInvoiceResults(Array.isArray(data.data) ? data.data : []);
      } catch { setInvoiceResults([]); }
      finally { setSearchingInv(false); }
    }, 250);
    return () => { if (invTimer.current) clearTimeout(invTimer.current); };
  }, [createOpen, invoiceSearch]);

  async function handleCreate(invoiceNumber: string) {
    if (!invoiceNumber || creating) return;
    setCreating(true); setMsg(null);
    try {
      const res = await fetch('/api/proxy/dispatches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceNumber }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error al crear la comanda');
      setCreateOpen(false); setInvoiceSearch(''); setInvoiceResults([]);
      router.push(`/dispatch/${json.id}`);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally { setCreating(false); }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <Truck className="text-emerald-400" size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white">Por despachar</h1>
          <p className="text-slate-400 text-sm">Mercancía pagada pendiente de retiro (despacho total o parcial)</p>
        </div>
        <button onClick={refresh} className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700/50" title="Refrescar">
          <RotateCw size={16} />
        </button>
        <button onClick={() => { setCreateOpen(true); setMsg(null); }} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> Crear comanda por retirar
        </button>
      </div>

      {msg && (
        <div className={`px-4 py-2.5 rounded-lg text-sm border ${msg.type === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>{msg.text}</div>
      )}

      {/* Buscador */}
      <div className="relative max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por N° factura, cliente, cédula o teléfono…"
          className="input-field !py-2 text-sm pl-9 w-full" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 flex-wrap border-b border-slate-700/50 pb-1">
        <TabBtn active={tab === 'comandas'} onClick={() => setTab('comandas')} icon={<ClipboardList size={14} />}>Comandas</TabBtn>
        <span className="w-px h-5 bg-slate-700 mx-1" />
        <TabBtn active={tab === 'todos'} onClick={() => setTab('todos')}>Todos los artículos</TabBtn>
        {areas.map(a => (
          <TabBtn key={a.id} active={tab === a.id} onClick={() => setTab(a.id)}>{a.name}</TabBtn>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-emerald-500" size={28} /></div>
      ) : tab === 'comandas' ? (
        <DispatchList dispatches={dispatches} onOpen={openDispatch} />
      ) : (
        <ItemsList items={items} onOpen={openDispatch} />
      )}

      {/* Modal crear */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 pt-24" onClick={() => { setCreateOpen(false); setInvoiceSearch(''); }}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Crear comanda por retirar</h2>
              <button onClick={() => { setCreateOpen(false); setInvoiceSearch(''); }} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-xs font-medium text-slate-400">Buscar factura (N° o cliente)</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input autoFocus value={invoiceSearch} onChange={e => setInvoiceSearch(e.target.value)}
                  placeholder="Ej: 0016  ·  Juan Pérez" className="input-field !py-2.5 text-sm w-full pl-9" />
                {searchingInv && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-500" />}
              </div>
              <p className="text-[11px] text-slate-500">Escribe parte del número (ej. "0016") o el nombre del cliente. Solo facturas pagadas.</p>

              {invoiceResults.length > 0 && (
                <div className="border border-slate-700 rounded-lg overflow-hidden divide-y divide-slate-700/60 max-h-72 overflow-y-auto">
                  {invoiceResults.map((inv) => (
                    <button key={inv.id} onClick={() => handleCreate(inv.number)} disabled={creating}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-700/50 transition-colors flex items-center justify-between gap-2 disabled:opacity-50">
                      <div className="min-w-0">
                        <span className="text-sm text-white font-mono">{inv.number}</span>
                        <span className="block text-[11px] text-slate-400 truncate">{inv.customer?.name || 'Sin cliente'}</span>
                      </div>
                      <span className="text-xs text-slate-400 font-mono shrink-0">${Number(inv.totalUsd || 0).toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
              {invoiceSearch.trim() && !searchingInv && invoiceResults.length === 0 && (
                <p className="text-[11px] text-amber-400/80">Sin facturas pagadas que coincidan.</p>
              )}
              {creating && <p className="text-[11px] text-slate-400 flex items-center gap-1.5"><Loader2 className="animate-spin" size={12} /> Creando comanda…</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children, icon }: { active: boolean; onClick: () => void; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${active ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-700/40 border border-transparent'}`}>
      {icon}{children}
    </button>
  );
}

function ProgressBadge({ items }: { items: any[] }) {
  const total = items.length;
  const done = items.filter((i) => i.quantityDelivered >= i.quantityInvoiced - 0.001).length;
  return <span className="text-[11px] text-slate-400">{done}/{total} art. completos</span>;
}

function DispatchList({ dispatches, onOpen }: { dispatches: any[]; onOpen: (id: string) => void }) {
  if (dispatches.length === 0) return <Empty text="No hay comandas por retirar" />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {dispatches.map((d) => {
        const overdue = isOverdue(d.scheduledDate, d.status);
        const meta = STATUS_META[d.status] || STATUS_META.PENDIENTE;
        return (
          <button key={d.id} onClick={() => onOpen(d.id)}
            className="text-left card p-4 hover:border-emerald-500/40 transition-colors">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono text-sm text-white font-semibold">{d.number}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${meta.cls}`}>{meta.label}</span>
            </div>
            <p className="text-sm text-white truncate">{d.invoice?.customer?.name || d.contactName || 'Sin cliente'}</p>
            <p className="text-[11px] text-slate-500 font-mono">Fact. {d.invoice?.number || '—'}</p>
            <div className="flex items-center justify-between mt-2 text-[11px]">
              <span className={`flex items-center gap-1 ${overdue ? 'text-red-400 font-semibold' : 'text-slate-400'}`}>
                {overdue && <AlertTriangle size={11} />} Despacho: {fmtDate(d.scheduledDate)}
              </span>
              <ProgressBadge items={d.items || []} />
            </div>
            {d.contactPhone && <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1"><Phone size={10} /> {d.contactPhone}</p>}
          </button>
        );
      })}
    </div>
  );
}

function ItemsList({ items, onOpen }: { items: any[]; onOpen: (id: string) => void }) {
  if (items.length === 0) return <Empty text="No hay artículos pendientes en esta zona" />;
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/50 bg-slate-800/40 text-slate-400">
            <th className="text-left px-4 py-2.5 font-medium">Artículo</th>
            <th className="text-left px-4 py-2.5 font-medium">Zona</th>
            <th className="text-left px-4 py-2.5 font-medium">Cliente</th>
            <th className="text-center px-4 py-2.5 font-medium">Despacho</th>
            <th className="text-right px-4 py-2.5 font-medium">Pendiente</th>
            <th className="text-right px-4 py-2.5 font-medium">Comanda</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const overdue = isOverdue(it.scheduledDate, it.status);
            return (
              <tr key={it.dispatchItemId} className="border-b border-slate-700/30 hover:bg-slate-700/20 cursor-pointer" onClick={() => onOpen(it.dispatchId)}>
                <td className="px-4 py-2.5 text-white">
                  {it.productName}
                  {it.productCode && <span className="ml-2 text-[11px] text-slate-500 font-mono">{it.productCode}</span>}
                </td>
                <td className="px-4 py-2.5 text-slate-400 text-xs">{it.printAreaName || '—'}</td>
                <td className="px-4 py-2.5 text-slate-300">{it.customerName || it.contactName || '—'}</td>
                <td className="px-4 py-2.5 text-center text-xs">
                  <span className={overdue ? 'text-red-400 font-semibold' : 'text-slate-400'}>{fmtDate(it.scheduledDate)}</span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-amber-400">{fmtQty(it.quantityPending)}<span className="text-slate-500"> / {fmtQty(it.quantityInvoiced)}</span></td>
                <td className="px-4 py-2.5 text-right font-mono text-[11px] text-slate-400">{it.dispatchNumber}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="card p-12 text-center text-slate-500 text-sm">{text}</div>;
}
