'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, X, Phone, CheckCircle2, PackageCheck, Ban, History, RotateCw, User, FileText, Calendar,
} from 'lucide-react';
import {
  DISPATCH_STATUS_META as STATUS_META, fmtQty, fmtDate, isoToDateInput, isOverdue, isPhoneComplete,
} from '@/lib/dispatch';

export default function DispatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [dispatch, setDispatch] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchDispatch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/dispatches/${id}`);
      if (!res.ok) throw new Error('Comanda no encontrada');
      setDispatch(await res.json());
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchDispatch(); }, [fetchDispatch]);

  useEffect(() => {
    if (dispatch) document.title = `${dispatch.number} - ${dispatch.invoice?.customer?.name || 'Despacho'} | Trinity ERP`;
  }, [dispatch]);

  // Estado editable
  const [scheduledDate, setScheduledDate] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);
  const [deliverQty, setDeliverQty] = useState<Record<string, string>>({});
  const [deliverNote, setDeliverNote] = useState('');
  const [delivering, setDelivering] = useState(false);
  const [zoneFilter, setZoneFilter] = useState<string>('todos'); // 'todos' | printAreaId

  // Sincronizar el form editable cuando llega/cambia la comanda
  useEffect(() => {
    if (!dispatch) return;
    setScheduledDate(isoToDateInput(dispatch.scheduledDate));
    setContactName(dispatch.contactName || '');
    setContactPhone(dispatch.contactPhone || '');
    setNotes(dispatch.notes || '');
  }, [dispatch]);

  const readOnly = dispatch?.status === 'COMPLETADO' || dispatch?.status === 'CANCELADO';

  async function saveInfo() {
    setSavingInfo(true); setMsg(null);
    try {
      const res = await fetch(`/api/proxy/dispatches/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledDate: scheduledDate || null, contactName, contactPhone, notes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error al guardar');
      setDispatch(json);
      setMsg({ type: 'success', text: 'Datos actualizados' });
    } catch (err: any) { setMsg({ type: 'error', text: err.message }); }
    finally { setSavingInfo(false); }
  }

  // Llena las cantidades pendientes de los ítems VISIBLES (respeta el filtro de zona).
  function fillAllPending() {
    const list = zoneFilter === 'todos'
      ? dispatch.items
      : dispatch.items.filter((it: any) => (it.printAreaId || '__none__') === zoneFilter);
    setDeliverQty(prev => {
      const next = { ...prev };
      for (const it of list) {
        const pending = Math.round((it.quantityInvoiced - it.quantityDelivered) * 1000) / 1000;
        if (pending > 0) next[it.id] = String(pending);
      }
      return next;
    });
  }

  async function registerDelivery() {
    const lines = Object.entries(deliverQty)
      .map(([dispatchItemId, v]) => ({ dispatchItemId, qty: parseFloat(v) || 0 }))
      .filter((l) => l.qty > 0);
    if (lines.length === 0) { setMsg({ type: 'error', text: 'Indica al menos una cantidad a despachar' }); return; }
    setDelivering(true); setMsg(null);
    try {
      const res = await fetch(`/api/proxy/dispatches/${id}/deliver`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines, note: deliverNote || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error al registrar el despacho');
      setDispatch(json);
      setDeliverQty({}); setDeliverNote('');
      setMsg({ type: 'success', text: json.status === 'COMPLETADO' ? 'Despacho completado' : 'Despacho parcial registrado' });
    } catch (err: any) { setMsg({ type: 'error', text: err.message }); }
    finally { setDelivering(false); }
  }

  async function cancelDispatch() {
    if (!confirm('¿Cancelar esta comanda de retiro?')) return;
    setMsg(null);
    try {
      const res = await fetch(`/api/proxy/dispatches/${id}/cancel`, { method: 'PATCH' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error al cancelar');
      setDispatch(json);
      setMsg({ type: 'success', text: 'Comanda cancelada' });
    } catch (err: any) { setMsg({ type: 'error', text: err.message }); }
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-emerald-500" size={32} /></div>;
  if (error || !dispatch) return (
    <div className="space-y-4">
      <button onClick={() => router.push('/dispatch')} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm"><ArrowLeft size={16} /> Volver</button>
      <div className="card p-12 text-center text-red-400">{error || 'Comanda no encontrada'}</div>
    </div>
  );

  const meta = STATUS_META[dispatch.status] || STATUS_META.PENDIENTE;
  const overdue = isOverdue(dispatch.scheduledDate, dispatch.status);
  const totalDone = dispatch.items.filter((i: any) => i.quantityDelivered >= i.quantityInvoiced - 0.001).length;

  // El contacto (nombre + tel) solo se edita si el teléfono está vacío o incompleto.
  const canEditContact = !readOnly && !isPhoneComplete(dispatch.contactPhone);

  // Zonas presentes en esta comanda (para el filtro interno del despachador) + ítems visibles.
  const zones: { id: string; name: string }[] = [];
  const seenZones = new Set<string>();
  for (const it of dispatch.items) {
    const zid = it.printAreaId || '__none__';
    if (!seenZones.has(zid)) { seenZones.add(zid); zones.push({ id: zid, name: it.printAreaName || 'Sin zona' }); }
  }
  const visibleItems = zoneFilter === 'todos'
    ? dispatch.items
    : dispatch.items.filter((it: any) => (it.printAreaId || '__none__') === zoneFilter);

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push('/dispatch')} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2.5 min-w-0">
          <h1 className="text-2xl font-bold text-white font-mono">{dispatch.number}</h1>
          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${meta.cls}`}>{meta.label}</span>
        </div>
        <div className="flex-1" />
        <button onClick={fetchDispatch} className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700/50" title="Refrescar">
          <RotateCw size={16} />
        </button>
      </div>

      {msg && (
        <div className={`px-4 py-2.5 rounded-lg text-sm border ${msg.type === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>{msg.text}</div>
      )}

      {/* Resumen factura/cliente */}
      <div className="card p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-[10px] text-slate-500 uppercase flex items-center gap-1"><FileText size={11} /> Factura</p>
          <p className="text-white font-mono">{dispatch.invoice?.number || '—'}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase flex items-center gap-1"><User size={11} /> Cliente</p>
          <p className="text-white truncate">{dispatch.invoice?.customer?.name || '—'}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase flex items-center gap-1"><Calendar size={11} /> Despacho</p>
          <p className={overdue ? 'text-red-400 font-semibold' : 'text-white'}>{fmtDate(dispatch.scheduledDate)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase">Progreso</p>
          <p className="text-white">{totalDone}/{dispatch.items.length} art. completos</p>
        </div>
      </div>

      {/* Datos editables */}
      <div className="card p-5">
        <h3 className="text-xs font-semibold text-slate-300 uppercase mb-3">Datos de la comanda</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-[10px] text-slate-400 mb-0.5">Contacto (nombre)</label>
            <input value={contactName} onChange={e => setContactName(e.target.value)} disabled={!canEditContact} className="input-field !py-1.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">Teléfono</label>
            <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} disabled={!canEditContact} className="input-field !py-1.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed" />
            {!readOnly && !canEditContact && (
              <p className="text-[10px] text-slate-500 mt-0.5">Contacto bloqueado (teléfono completo). Editable solo si falta o está incompleto.</p>
            )}
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
      </div>

      {/* Filtro por zona (para que el despachador vea rápido lo suyo) */}
      {zones.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-slate-500 mr-1">Zona:</span>
          <ZoneBtn active={zoneFilter === 'todos'} onClick={() => setZoneFilter('todos')}>Todas</ZoneBtn>
          {zones.map(z => (
            <ZoneBtn key={z.id} active={zoneFilter === z.id} onClick={() => setZoneFilter(z.id)}>{z.name}</ZoneBtn>
          ))}
        </div>
      )}

      {/* Items + despacho */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/40 text-slate-400 text-xs">
              <th className="text-left px-4 py-2.5 font-medium">Artículo</th>
              <th className="text-left px-4 py-2.5 font-medium">Zona</th>
              <th className="text-right px-4 py-2.5 font-medium">Facturado</th>
              <th className="text-right px-4 py-2.5 font-medium">Despachado</th>
              <th className="text-right px-4 py-2.5 font-medium">Pendiente</th>
              {!readOnly && <th className="text-right px-4 py-2.5 font-medium">Despachar ahora</th>}
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((it: any) => {
              const pending = Math.round((it.quantityInvoiced - it.quantityDelivered) * 1000) / 1000;
              return (
                <tr key={it.id} className="border-b border-slate-700/30">
                  <td className="px-4 py-2.5 text-white">{it.productName}{it.productCode && <span className="ml-2 text-[10px] text-slate-500 font-mono">{it.productCode}</span>}</td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs">{it.printAreaName || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-300">{fmtQty(it.quantityInvoiced)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-green-400">{fmtQty(it.quantityDelivered)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-amber-400">{fmtQty(pending)}</td>
                  {!readOnly && (
                    <td className="px-4 py-2.5 text-right">
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
          <button onClick={fillAllPending} className="btn-secondary !py-2 text-sm">Despachar todo lo pendiente</button>
          <input value={deliverNote} onChange={e => setDeliverNote(e.target.value)} placeholder="Nota del despacho (opcional)" className="input-field !py-2 text-sm flex-1 min-w-[180px]" />
          <button onClick={registerDelivery} disabled={delivering} className="btn-primary !py-2 text-sm flex items-center gap-2 disabled:opacity-50">
            {delivering ? <Loader2 className="animate-spin" size={15} /> : <PackageCheck size={15} />} Registrar despacho
          </button>
        </div>
      )}

      {/* Historial de despachos */}
      {dispatch.deliveries?.length > 0 && (
        <div className="card p-5">
          <h4 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-1.5"><History size={13} /> Historial de despachos</h4>
          <div className="space-y-2">
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
        <div className="pt-1">
          <button onClick={cancelDispatch} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1.5">
            <Ban size={13} /> Cancelar comanda
          </button>
        </div>
      )}
    </div>
  );
}

function ZoneBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${active ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-700/40 border border-transparent'}`}>
      {children}
    </button>
  );
}
