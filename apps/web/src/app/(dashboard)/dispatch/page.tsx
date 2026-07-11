'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Truck, Plus, Search, X, Loader2, Phone, CheckCircle2, AlertTriangle,
  ClipboardList, RotateCw, PackageCheck, Ban, History,
} from 'lucide-react';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDIENTE:  { label: 'Pendiente',  cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  PARCIAL:    { label: 'Parcial',    cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  COMPLETADO: { label: 'Completado', cls: 'bg-green-500/15 text-green-400 border-green-500/30' },
  CANCELADO:  { label: 'Cancelado',  cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
};

interface Area { id: string; name: string; }

const fmtQty = (n: number) => Number(n).toLocaleString('es-VE', { maximumFractionDigits: 3 });

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Fecha (date-only, guardada a medianoche UTC) -> 'YYYY-MM-DD' sin corrimiento de zona.
function isoToDateInput(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function isOverdue(iso: string | null, status: string): boolean {
  if (!iso || status === 'COMPLETADO' || status === 'CANCELADO') return false;
  return iso.slice(0, 10) < todayLocal();
}

export default function DispatchPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [tab, setTab] = useState<string>('comandas'); // 'comandas' | 'todos' | <areaId>
  const [search, setSearch] = useState('');
  const [dispatches, setDispatches] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [creating, setCreating] = useState(false);

  const [selected, setSelected] = useState<any | null>(null);
  const searchTimer = useRef<any>(null);

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

  async function openDispatch(id: string) {
    try {
      const res = await fetch(`/api/proxy/dispatches/${id}`);
      if (res.ok) setSelected(await res.json());
    } catch { /* ignore */ }
  }

  async function handleCreate() {
    if (!invoiceNumber.trim()) return;
    setCreating(true); setMsg(null);
    try {
      const res = await fetch('/api/proxy/dispatches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceNumber: invoiceNumber.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error al crear la comanda');
      setCreateOpen(false); setInvoiceNumber('');
      setMsg({ type: 'success', text: `Comanda ${json.number} creada` });
      refresh();
      setSelected(json);
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setCreateOpen(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Crear comanda por retirar</h2>
              <button onClick={() => setCreateOpen(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-xs font-medium text-slate-400">N° de factura</label>
              <input autoFocus value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                placeholder="Ej: FAC-01-26-00000123" className="input-field !py-2.5 text-sm w-full font-mono" />
              <p className="text-[11px] text-slate-500">La factura debe estar pagada. Se copian sus artículos (sin servicios) con la zona de cada uno.</p>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setCreateOpen(false)} className="btn-secondary !py-2 text-sm">Cancelar</button>
                <button onClick={handleCreate} disabled={creating || !invoiceNumber.trim()} className="btn-primary !py-2 text-sm flex items-center gap-2 disabled:opacity-50">
                  {creating ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />} Crear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle/despacho */}
      {selected && (
        <DispatchDetail
          dispatch={selected}
          onClose={() => setSelected(null)}
          onChanged={(updated) => { setSelected(updated); refresh(); }}
          onToast={(t) => setMsg(t)}
        />
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

// ── Detalle + despacho ───────────────────────────────────────────────────────
function DispatchDetail({ dispatch, onClose, onChanged, onToast }: {
  dispatch: any;
  onClose: () => void;
  onChanged: (updated: any) => void;
  onToast: (t: { type: 'success' | 'error'; text: string }) => void;
}) {
  const [scheduledDate, setScheduledDate] = useState(isoToDateInput(dispatch.scheduledDate));
  const [contactName, setContactName] = useState(dispatch.contactName || '');
  const [contactPhone, setContactPhone] = useState(dispatch.contactPhone || '');
  const [notes, setNotes] = useState(dispatch.notes || '');
  const [savingInfo, setSavingInfo] = useState(false);
  // Cantidades a despachar AHORA por item
  const [deliverQty, setDeliverQty] = useState<Record<string, string>>({});
  const [deliverNote, setDeliverNote] = useState('');
  const [delivering, setDelivering] = useState(false);

  const readOnly = dispatch.status === 'COMPLETADO' || dispatch.status === 'CANCELADO';
  const meta = STATUS_META[dispatch.status] || STATUS_META.PENDIENTE;

  async function saveInfo() {
    setSavingInfo(true);
    try {
      const res = await fetch(`/api/proxy/dispatches/${dispatch.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledDate: scheduledDate || null, contactName, contactPhone, notes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error al guardar');
      onChanged(json);
      onToast({ type: 'success', text: 'Datos actualizados' });
    } catch (err: any) { onToast({ type: 'error', text: err.message }); }
    finally { setSavingInfo(false); }
  }

  function fillAllPending() {
    const next: Record<string, string> = {};
    for (const it of dispatch.items) {
      const pending = Math.round((it.quantityInvoiced - it.quantityDelivered) * 1000) / 1000;
      if (pending > 0) next[it.id] = String(pending);
    }
    setDeliverQty(next);
  }

  async function registerDelivery() {
    const lines = Object.entries(deliverQty)
      .map(([dispatchItemId, v]) => ({ dispatchItemId, qty: parseFloat(v) || 0 }))
      .filter((l) => l.qty > 0);
    if (lines.length === 0) { onToast({ type: 'error', text: 'Indica al menos una cantidad a despachar' }); return; }
    setDelivering(true);
    try {
      const res = await fetch(`/api/proxy/dispatches/${dispatch.id}/deliver`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines, note: deliverNote || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error al registrar el despacho');
      onChanged(json);
      setDeliverQty({}); setDeliverNote('');
      onToast({ type: 'success', text: json.status === 'COMPLETADO' ? 'Despacho completado' : 'Despacho parcial registrado' });
    } catch (err: any) { onToast({ type: 'error', text: err.message }); }
    finally { setDelivering(false); }
  }

  async function cancelDispatch() {
    if (!confirm('¿Cancelar esta comanda de retiro?')) return;
    try {
      const res = await fetch(`/api/proxy/dispatches/${dispatch.id}/cancel`, { method: 'PATCH' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error al cancelar');
      onChanged(json);
      onToast({ type: 'success', text: 'Comanda cancelada' });
    } catch (err: any) { onToast({ type: 'error', text: err.message }); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-3xl shadow-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-white font-semibold">{dispatch.number}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${meta.cls}`}>{meta.label}</span>
            <span className="text-xs text-slate-500 font-mono truncate">Fact. {dispatch.invoice?.number || '—'}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Cliente + datos editables */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[10px] text-slate-400 mb-0.5">Contacto (nombre)</label>
              <input value={contactName} onChange={e => setContactName(e.target.value)} disabled={readOnly} className="input-field !py-1.5 text-sm disabled:opacity-60" />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-0.5">Teléfono</label>
              <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} disabled={readOnly} className="input-field !py-1.5 text-sm disabled:opacity-60" />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-0.5">Fecha de despacho</label>
              <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} disabled={readOnly} className="input-field !py-1.5 text-sm disabled:opacity-60" />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-[10px] text-slate-400 mb-0.5">Notas</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} disabled={readOnly} className="input-field !py-1.5 text-sm disabled:opacity-60" placeholder="Ej: viene el sábado con camión" />
            </div>
            <div className="flex items-end">
              {!readOnly && (
                <button onClick={saveInfo} disabled={savingInfo} className="btn-secondary !py-1.5 text-xs w-full flex items-center justify-center gap-1.5">
                  {savingInfo ? <Loader2 className="animate-spin" size={13} /> : <CheckCircle2 size={13} />} Guardar
                </button>
              )}
            </div>
          </div>

          {/* Items + despacho */}
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/40 text-slate-400 text-xs">
                  <th className="text-left px-3 py-2 font-medium">Artículo</th>
                  <th className="text-left px-3 py-2 font-medium">Zona</th>
                  <th className="text-right px-3 py-2 font-medium">Facturado</th>
                  <th className="text-right px-3 py-2 font-medium">Despachado</th>
                  <th className="text-right px-3 py-2 font-medium">Pendiente</th>
                  {!readOnly && <th className="text-right px-3 py-2 font-medium">Despachar ahora</th>}
                </tr>
              </thead>
              <tbody>
                {dispatch.items.map((it: any) => {
                  const pending = Math.round((it.quantityInvoiced - it.quantityDelivered) * 1000) / 1000;
                  return (
                    <tr key={it.id} className="border-b border-slate-700/30">
                      <td className="px-3 py-2 text-white">{it.productName}{it.productCode && <span className="ml-2 text-[10px] text-slate-500 font-mono">{it.productCode}</span>}</td>
                      <td className="px-3 py-2 text-slate-400 text-xs">{it.printAreaName || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-300">{fmtQty(it.quantityInvoiced)}</td>
                      <td className="px-3 py-2 text-right font-mono text-green-400">{fmtQty(it.quantityDelivered)}</td>
                      <td className="px-3 py-2 text-right font-mono text-amber-400">{fmtQty(pending)}</td>
                      {!readOnly && (
                        <td className="px-3 py-2 text-right">
                          {pending > 0 ? (
                            <input type="number" min={0} max={pending} step="any"
                              value={deliverQty[it.id] ?? ''} onChange={e => {
                                const v = Math.min(parseFloat(e.target.value) || 0, pending);
                                setDeliverQty(prev => ({ ...prev, [it.id]: e.target.value === '' ? '' : String(v) }));
                              }}
                              className="input-field !py-1 text-sm w-24 text-right" placeholder="0" />
                          ) : <CheckCircle2 size={15} className="text-green-500 inline" />}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Acciones de despacho */}
          {!readOnly && (
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={fillAllPending} className="btn-secondary !py-1.5 text-xs">Despachar todo lo pendiente</button>
              <input value={deliverNote} onChange={e => setDeliverNote(e.target.value)} placeholder="Nota del despacho (opcional)" className="input-field !py-1.5 text-sm flex-1 min-w-[160px]" />
              <button onClick={registerDelivery} disabled={delivering} className="btn-primary !py-1.5 text-sm flex items-center gap-2 disabled:opacity-50">
                {delivering ? <Loader2 className="animate-spin" size={15} /> : <PackageCheck size={15} />} Registrar despacho
              </button>
            </div>
          )}

          {/* Historial de despachos */}
          {dispatch.deliveries?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5"><History size={13} /> Historial de despachos</h4>
              <div className="space-y-1.5">
                {dispatch.deliveries.map((dv: any) => (
                  <div key={dv.id} className="text-xs bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>{new Date(dv.createdAt).toLocaleString('es-VE')}</span>
                      <span>{dv.deliveredBy?.name || ''}</span>
                    </div>
                    <div className="text-slate-300 mt-0.5">
                      {(Array.isArray(dv.lines) ? dv.lines : []).map((l: any, i: number) => (
                        <span key={i} className="mr-3">{l.productName}: <span className="font-mono text-amber-300">{fmtQty(l.qty)}</span></span>
                      ))}
                    </div>
                    {dv.note && <p className="text-slate-500 mt-0.5 italic">{dv.note}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cancelar */}
          {dispatch.status !== 'COMPLETADO' && dispatch.status !== 'CANCELADO' && (
            <div className="pt-1 border-t border-slate-700/50">
              <button onClick={cancelDispatch} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1.5">
                <Ban size={13} /> Cancelar comanda
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
