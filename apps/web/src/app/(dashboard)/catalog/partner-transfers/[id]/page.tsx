'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ArrowLeft, AlertTriangle, Check, X, Receipt, FileText } from 'lucide-react';

interface TItem { code: string; name?: string; quantity: number; requestedQuantity?: number; unitCost?: number }
interface Transfer {
  id: string; number: string; kind: 'SEND' | 'REQUEST'; direction: 'OUTGOING' | 'INCOMING';
  status: string; partnerName: string; notes?: string | null; sendNote?: string | null; items: TItem[];
  fromWarehouseId?: string | null; toWarehouseId?: string | null;
  createdAt: string; updatedAt: string;
}
interface Warehouse { id: string; name: string }
// Fila de "tomar costos del socio" (GET transfers/:id/cost-preview)
interface CostChange {
  productId: string; code: string; name: string;
  currentCost: number; partnerCost: number; newCost: number;
  manualCost: boolean; manualPrice: boolean;
  bregaPct: number; gananciaPct: number; gananciaMayorPct: number; ivaMultiplier: number;
  currentPriceDetal: number; newPriceDetal: number;
  currentPriceMayor: number; newPriceMayor: number;
}

// Rojo si sube, verde si baja (mismo código de colores que procesar compra)
const deltaColor = (next: number, prev: number) =>
  next > prev + 0.000001 ? 'text-red-400' : next < prev - 0.000001 ? 'text-green-400' : 'text-white';
const pctChange = (next: number, prev: number) => (prev > 0 ? ((next - prev) / prev) * 100 : 0);

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Solicitado', APPROVED: 'Aprobado', SENT: 'Enviado',
  PENDING_RECEIPT: 'Por recibir', RECEIVED: 'Recibido', REJECTED: 'Rechazado', CANCELLED: 'Anulado',
};
const STATUS_COLOR: Record<string, string> = {
  RECEIVED: 'text-emerald-400', SENT: 'text-amber-400', PENDING_RECEIPT: 'text-amber-400',
  REQUESTED: 'text-sky-400', REJECTED: 'text-red-400', CANCELLED: 'text-slate-400', APPROVED: 'text-sky-400',
};

export default function PartnerTransferDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [t, setT] = useState<Transfer | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [wh, setWh] = useState('');
  const [costBasis, setCostBasis] = useState<'COST' | 'COST_BREGA'>('COST');
  const [sendQty, setSendQty] = useState<Record<string, number>>({});
  const [avail, setAvail] = useState<Record<string, number> | null>(null);
  // Existencia TOTAL (todos los almacenes) por código: lo que tengo en inventario, para que
  // el que envía no quede a ciegas aunque todavía no haya elegido el almacén origen.
  const [stockTotals, setStockTotals] = useState<Record<string, number> | null>(null);
  const [sendNote, setSendNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [converting, setConverting] = useState(false);
  const [createdOk, setCreatedOk] = useState(false);
  const [costChanges, setCostChanges] = useState<CostChange[] | null>(null); // != null => pantalla abierta

  const load = useCallback(async () => {
    try {
      const [tr, whs] = await Promise.all([
        fetch(`/api/proxy/integration/transfers/${encodeURIComponent(id)}`),
        fetch('/api/proxy/warehouses'),
      ]);
      if (!tr.ok) { setError('No se encontró el traslado.'); return; }
      setT(await tr.json());
      if (whs.ok) setWarehouses(await whs.json());
    } catch {
      setError('Error al cargar el traslado.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (t) document.title = `Traslado ${t.number} | Trinity ERP`; }, [t]);

  const canApproveNow = !!t && t.kind === 'REQUEST' && t.direction === 'INCOMING' && t.status === 'REQUESTED';

  // Al cargar una solicitud aprobable, precargar "enviar" = lo solicitado.
  useEffect(() => {
    if (canApproveNow && t) {
      const init: Record<string, number> = {};
      (t.items || []).forEach((i) => { init[i.code] = i.requestedQuantity ?? i.quantity; });
      setSendQty(init);
    }
  }, [canApproveNow, t]);

  // Al abrir una solicitud aprobable, cargar de una la EXISTENCIA TOTAL (todos los almacenes)
  // de cada artículo pedido, sin depender del almacén origen.
  useEffect(() => {
    if (!canApproveNow) { setStockTotals(null); return; }
    let cancel = false;
    fetch(`/api/proxy/integration/transfers/${id}/availability`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { code: string; totalStock: number }[]) => {
        if (cancel) return;
        const m: Record<string, number> = {};
        rows.forEach((x) => { m[x.code] = x.totalStock; });
        setStockTotals(m);
      })
      .catch(() => { if (!cancel) setStockTotals(null); });
    return () => { cancel = true; };
  }, [canApproveNow, id]);

  // Cuando el usuario elige almacén origen, consultar disponibilidad por línea (tope al enviar).
  useEffect(() => {
    if (!canApproveNow || !wh) { setAvail(null); return; }
    let cancel = false;
    fetch(`/api/proxy/integration/transfers/${id}/availability?warehouseId=${encodeURIComponent(wh)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { code: string; available: number | null; totalStock: number }[]) => {
        if (cancel) return;
        const m: Record<string, number> = {};
        const tot: Record<string, number> = {};
        rows.forEach((x) => { m[x.code] = x.available ?? 0; tot[x.code] = x.totalStock; });
        setAvail(m);
        setStockTotals(tot);
      })
      .catch(() => { if (!cancel) setAvail(null); });
    return () => { cancel = true; };
  }, [canApproveNow, wh, id]);

  const whName = (wid?: string | null) => warehouses.find((w) => w.id === wid)?.name || (wid ? '—' : null);

  function tipoLabel(x: Transfer) {
    if (x.kind === 'SEND') return x.direction === 'OUTGOING' ? 'Envío (salida de mi inventario)' : 'Envío recibido';
    return x.direction === 'OUTGOING' ? 'Solicitud mía' : 'Solicitud recibida';
  }

  // Recibir: si el socio mandó costos base distintos a los míos, primero se muestra la
  // pantalla de cambio de costos/precios para que el usuario decida si los toma.
  async function startReceive() {
    if (!wh) { setMsg({ type: 'error', text: 'Elige el almacén.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/proxy/integration/transfers/${t!.id}/cost-preview`);
      const rows: CostChange[] = res.ok ? await res.json() : [];
      if (Array.isArray(rows) && rows.length > 0) { setCostChanges(rows); setBusy(false); return; }
    } catch { /* sin vista previa: se recibe normal */ }
    setBusy(false);
    await act('receive');
  }

  async function act(kind: 'receive' | 'approve' | 'reject', applyPartnerCosts = false) {
    if ((kind === 'receive' || kind === 'approve') && !wh) {
      setMsg({ type: 'error', text: 'Elige el almacén.' }); return;
    }
    if (kind === 'reject' && !confirm('¿Rechazar esta solicitud?')) return;
    setBusy(true); setMsg(null);
    try {
      const body =
        kind === 'receive'
          ? { toWarehouseId: wh, applyPartnerCosts }
          : kind === 'approve'
          ? {
              fromWarehouseId: wh,
              costBasis,
              sendNote: sendNote.trim() || undefined,
              items: (t!.items || []).map((i) => ({ code: i.code, sendQuantity: Number(sendQty[i.code] ?? 0) })),
            }
          : {};
      const res = await fetch(`/api/proxy/integration/transfers/${t!.id}/${kind}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.ok) {
        setCostChanges(null);
        setMsg({
          type: 'success',
          text: kind === 'receive' && applyPartnerCosts
            ? 'Traslado recibido. Se actualizaron los costos y precios de venta.'
            : 'Operación realizada.',
        });
        await load();
      }
      else { const e = await res.json().catch(() => ({})); setMsg({ type: 'error', text: e.message || 'No se pudo completar.' }); }
    } catch { setMsg({ type: 'error', text: 'Error de red.' }); }
    finally { setBusy(false); }
  }

  async function convertToInvoice() {
    if (!t) return;
    if (!confirm(`¿Convertir el traslado ${t.number} en una factura de venta PENDIENTE?\n\nSe usarán los precios de venta actuales de la empresa. Luego la retomas en el POS para asignarle el vendedor y la caja.`)) return;
    setConverting(true); setMsg(null); setCreatedOk(false);
    try {
      const res = await fetch(`/api/proxy/invoices/from-partner-transfer/${t.id}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ type: 'error', text: data.message || 'No se pudo crear la factura.' }); return; }
      const skipped = data.skipped || [];
      const skippedTxt = skipped.length
        ? ` Se omitieron ${skipped.length} artículo(s): ${skipped.map((s: any) => `${s.code} (${s.reason})`).join('; ')}.`
        : '';
      setMsg({ type: 'success', text: `Factura pendiente creada. Retómala en el POS para asignar el vendedor y la caja.${skippedTxt}` });
      setCreatedOk(true);
    } catch { setMsg({ type: 'error', text: 'Error de red.' }); }
    finally { setConverting(false); }
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="animate-spin mr-2" size={20} /> Cargando…</div>;

  if (error || !t) {
    return (
      <div className="max-w-2xl mx-auto mt-10 bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 text-amber-400" size={28} />
        <p className="text-slate-300">{error || 'Traslado no encontrado.'}</p>
        <Link href="/catalog/partner-transfers" className="text-sky-400 text-sm mt-3 inline-block">Volver a traslados</Link>
      </div>
    );
  }

  const totalUsd = (t.items || []).reduce((s, i) => s + (i.unitCost || 0) * i.quantity, 0);
  const canReceive = t.status === 'PENDING_RECEIPT';
  const canApprove = t.kind === 'REQUEST' && t.direction === 'INCOMING' && t.status === 'REQUESTED';

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/catalog/partner-transfers" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 mb-4">
        <ArrowLeft size={16} /> Volver a traslados
      </Link>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white font-mono">{t.number}</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => window.open(`/api/proxy/integration/transfers/${encodeURIComponent(t.id)}/pdf`, '_blank')}
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-teal-300"
          >
            <FileText size={15} /> Imprimir reporte
          </button>
          <span className={`text-sm font-semibold ${STATUS_COLOR[t.status] || 'text-slate-300'}`}>{STATUS_LABEL[t.status] || t.status}</span>
        </div>
      </div>

      {msg && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${msg.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'}`}>
          {msg.text}
          {createdOk && msg.type === 'success' && (
            <Link href="/sales/pos" className="ml-2 underline font-semibold hover:text-emerald-200">Ir al POS →</Link>
          )}
        </div>
      )}

      {/* Convertir a factura de venta (pendiente) */}
      {(t.items || []).length > 0 && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-200">Convertir a factura de venta</p>
            <p className="text-xs text-slate-500 mt-0.5">Crea una factura <span className="text-slate-300">pendiente</span> con estos artículos y cantidades a <span className="text-slate-300">precio de venta de la empresa</span>, para retomarla en el POS y asignarle el vendedor y la caja.</p>
          </div>
          <button onClick={convertToInvoice} disabled={converting}
            className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg text-sm inline-flex items-center gap-2 whitespace-nowrap">
            {converting ? <Loader2 size={15} className="animate-spin" /> : <Receipt size={15} />}
            Convertir a factura pendiente
          </button>
        </div>
      )}

      {/* Acciones */}
      {(canReceive || canApprove) && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px]">
              <label className="block text-xs text-slate-400 mb-1">{canReceive ? 'Almacén destino' : 'Almacén origen'}</label>
              <select value={wh} onChange={(e) => setWh(e.target.value)} className="input-field w-full !py-2 text-sm">
                <option value="">Selecciona…</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            {canApprove && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Valuación</label>
                <div className="grid grid-cols-2 gap-1 bg-slate-900/60 rounded-lg p-1">
                  <button type="button" onClick={() => setCostBasis('COST')} className={`py-1.5 px-3 rounded-md text-xs font-semibold ${costBasis === 'COST' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Costo</button>
                  <button type="button" onClick={() => setCostBasis('COST_BREGA')} className={`py-1.5 px-3 rounded-md text-xs font-semibold ${costBasis === 'COST_BREGA' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Costo + brecha</button>
                </div>
              </div>
            )}
            {canApprove && (
              <div className="flex-1 min-w-[220px]">
                <label className="block text-xs text-slate-400 mb-1">Nota (opcional)</label>
                <input value={sendNote} onChange={(e) => setSendNote(e.target.value)}
                  placeholder="ej. bajo stock, te mando 5"
                  className="input-field w-full !py-2 text-sm" />
              </div>
            )}
            {canReceive && (
              <button onClick={startReceive} disabled={busy} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg text-sm flex items-center gap-2">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Recibir
              </button>
            )}
            {canApprove && (
              <>
                <button onClick={() => act('approve')} disabled={busy} className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg text-sm flex items-center gap-2">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Aprobar y enviar
                </button>
                <button onClick={() => act('reject')} disabled={busy} className="bg-red-600/80 hover:bg-red-500 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg text-sm flex items-center gap-2">
                  <X size={15} /> Rechazar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 mb-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div><div className="text-xs text-slate-500">Tipo</div><div className="text-slate-200">{tipoLabel(t)}</div></div>
        <div><div className="text-xs text-slate-500">Empresa socia</div><div className="text-slate-200">{t.partnerName}</div></div>
        <div><div className="text-xs text-slate-500">Creado</div><div className="text-slate-200">{new Date(t.createdAt).toLocaleString('es-VE')}</div></div>
        {whName(t.fromWarehouseId) && <div><div className="text-xs text-slate-500">Almacén origen</div><div className="text-slate-200">{whName(t.fromWarehouseId)}</div></div>}
        {whName(t.toWarehouseId) && <div><div className="text-xs text-slate-500">Almacén destino</div><div className="text-slate-200">{whName(t.toWarehouseId)}</div></div>}
        {t.notes && <div className="col-span-2 md:col-span-3"><div className="text-xs text-slate-500">Notas</div><div className="text-slate-200">{t.notes}</div></div>}
        {t.sendNote && <div className="col-span-2 md:col-span-3"><div className="text-xs text-slate-500">Nota del envío</div><div className="text-slate-200">{t.sendNote}</div></div>}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 text-slate-400">
              <th className="px-4 py-2 text-left">Código</th>
              <th className="px-4 py-2 text-left">Artículo</th>
              <th className="px-4 py-2 text-right">Solicitado</th>
              {canApprove && <th className="px-4 py-2 text-right" title="Lo que tengo en mi inventario (todos los almacenes)">Existencia</th>}
              <th className="px-4 py-2 text-right">{canApprove ? 'Enviar' : 'Enviado'}</th>
              <th className="px-4 py-2 text-right">Costo unit. $</th>
              <th className="px-4 py-2 text-right">Subtotal $</th>
            </tr>
          </thead>
          <tbody>
            {(t.items || []).map((i, idx) => {
              const requested = i.requestedQuantity ?? i.quantity;
              const disponible = avail ? (avail[i.code] ?? 0) : null;
              const diff = !canApprove && requested !== i.quantity;
              return (
                <tr key={idx} className="border-b border-slate-700/30">
                  <td className="px-4 py-2 font-mono text-green-400">{i.code}</td>
                  <td className="px-4 py-2 text-slate-200">{i.name || '—'}</td>
                  <td className="px-4 py-2 text-right text-slate-300">{requested}</td>
                  {canApprove && (
                    <td className="px-4 py-2 text-right font-semibold">
                      {stockTotals == null ? (
                        <span className="text-slate-500">…</span>
                      ) : (
                        <span className={(stockTotals[i.code] ?? 0) <= 0 ? 'text-red-400' : (stockTotals[i.code] ?? 0) < requested ? 'text-amber-300' : 'text-emerald-300'}>
                          {stockTotals[i.code] ?? 0}
                        </span>
                      )}
                    </td>
                  )}
                  <td className={`px-4 py-2 text-right ${diff ? 'text-amber-300 font-semibold' : 'text-slate-200'}`}>
                    {canApprove ? (
                      <div className="flex flex-col items-end">
                        <input
                          type="number" min={0} max={disponible ?? undefined}
                          value={sendQty[i.code] ?? ''}
                          onChange={(e) => {
                            const v = Math.max(0, Number(e.target.value) || 0);
                            const capped = disponible != null ? Math.min(v, disponible) : v;
                            setSendQty((p) => ({ ...p, [i.code]: capped }));
                          }}
                          className="input-field w-24 !py-1 text-sm text-right"
                        />
                        {disponible != null && <span className="text-[11px] text-slate-500 mt-0.5">disponible: {disponible}</span>}
                      </div>
                    ) : (
                      i.quantity
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-300">{i.unitCost != null ? `$${i.unitCost.toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-2 text-right text-slate-300">{i.unitCost != null ? `$${(i.unitCost * i.quantity).toFixed(2)}` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-700/50 bg-slate-800/30">
              <td colSpan={2} className="px-4 py-2 text-slate-300 font-semibold">Totales</td>
              <td className="px-4 py-2 text-right text-slate-300 font-semibold">{(t.items || []).reduce((s, i) => s + (i.requestedQuantity ?? i.quantity), 0)}</td>
              {canApprove && <td className="px-4 py-2 text-right text-slate-300 font-semibold">{stockTotals ? (t.items || []).reduce((s, i) => s + (stockTotals[i.code] ?? 0), 0) : ''}</td>}
              <td className="px-4 py-2 text-right text-slate-200 font-semibold">{canApprove ? (t.items || []).reduce((s, i) => s + Number(sendQty[i.code] ?? 0), 0) : (t.items || []).reduce((s, i) => s + i.quantity, 0)}</td>
              <td className="px-4 py-2"></td>
              <td className="px-4 py-2 text-right text-slate-200 font-semibold">${totalUsd.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-slate-500 mt-2">
        Al enviarse genera Cuenta por Cobrar al socio; al recibirse genera Cuenta por Pagar (a costo).
      </p>

      {costChanges && (
        <CostChangesModal
          rows={costChanges}
          partnerName={t.partnerName}
          busy={busy}
          error={msg?.type === 'error' ? msg.text : ''}
          onCancel={() => { setCostChanges(null); setMsg(null); }}
          onReceive={(apply) => act('receive', apply)}
        />
      )}
    </div>
  );
}

// Pantalla "tomar costos del socio" al recibir: costo anterior → nuevo y su efecto en el
// precio de venta, en rojo si sube y verde si baja (como procesar una compra).
function CostChangesModal({ rows, partnerName, busy, error, onCancel, onReceive }: {
  rows: CostChange[];
  partnerName: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onReceive: (applyPartnerCosts: boolean) => void;
}) {
  const fmt = (n: number) => `$${n.toFixed(2)}`;
  // Los costos pueden tener hasta 4 decimales: mostrarlos con 2 escondería la diferencia real
  const fmtCost = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  const pct = (n: number) => `${Number(n.toFixed(2))}%`;
  const up = rows.filter((r) => !r.manualCost && r.newCost > r.currentCost).length;
  const down = rows.filter((r) => !r.manualCost && r.newCost < r.currentCost).length;
  const frozen = rows.filter((r) => r.manualCost).length;

  const Pct = ({ next, prev }: { next: number; prev: number }) => {
    const p = pctChange(next, prev);
    if (Math.abs(p) < 0.05) return null;
    return <span className={`block text-[10px] font-normal ${deltaColor(next, prev)}`}>{p > 0 ? '+' : ''}{p.toFixed(1)}%</span>;
  };
  const Flags = ({ r }: { r: CostChange }) => (
    <>
      {r.manualCost && (
        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-600/40 text-slate-300 border border-slate-500/40">Costo manual · no cambia</span>
      )}
      {!r.manualCost && r.manualPrice && (
        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">Precio manual · se conserva</span>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex sm:items-center sm:justify-center bg-black/60 backdrop-blur-sm sm:p-4">
      <div className="bg-slate-800 sm:border sm:border-slate-700 sm:rounded-xl shadow-2xl w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-5xl flex flex-col">
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-700/50 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white">Costos de {partnerName}</h2>
            <p className="text-sm text-slate-400">
              {rows.length} producto{rows.length === 1 ? '' : 's'} llega{rows.length === 1 ? '' : 'n'} con un costo base distinto al tuyo.
              ¿Quieres tomar el costo del socio para que ambas empresas tengan el mismo?
            </p>
          </div>
          <button onClick={onCancel} disabled={busy} aria-label="Cerrar" className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 flex-shrink-0"><X size={18} /></button>
        </div>

        {/* Resumen + leyenda */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 sm:px-6 py-2.5 border-b border-slate-700/50 text-xs flex-shrink-0">
          {up > 0 && <span className="text-red-400 font-medium">▲ {up} sube{up === 1 ? '' : 'n'} de costo</span>}
          {down > 0 && <span className="text-green-400 font-medium">▼ {down} baja{down === 1 ? '' : 'n'} de costo</span>}
          {frozen > 0 && <span className="text-slate-400">{frozen} con costo manual (no se cambia{frozen === 1 ? '' : 'n'})</span>}
          <span className="text-slate-500 sm:ml-auto">Precio = costo × brecha × ganancia × IVA · se mantiene tu % de ganancia</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {error && <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

          {/* Escritorio: tabla */}
          <table className="w-full text-sm hidden md:table">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-2 py-2 text-slate-400 font-medium text-xs">Código</th>
                <th className="text-left px-2 py-2 text-slate-400 font-medium text-xs">Producto</th>
                <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">Costo ant.</th>
                <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">Costo nuevo</th>
                <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs" title="Brecha aplicada al costo">Brecha</th>
                <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">Gan.% Detal</th>
                <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">P. Actual Detal</th>
                <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">P. Nuevo Detal</th>
                <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">P. Actual Mayor</th>
                <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">P. Nuevo Mayor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId} className={`border-b border-slate-700/30 align-top ${r.manualCost ? 'opacity-60' : ''}`}>
                  <td className="px-2 py-2 font-mono text-green-400 text-xs whitespace-nowrap">{r.code}</td>
                  <td className="px-2 py-2 text-white text-xs">
                    {r.name}
                    <div className="mt-1"><Flags r={r} /></div>
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-slate-400 text-xs">{fmtCost(r.currentCost)}</td>
                  <td className={`px-2 py-2 text-right font-mono text-xs font-bold ${r.manualCost ? 'text-slate-400 line-through' : deltaColor(r.newCost, r.currentCost)}`}>
                    {fmtCost(r.partnerCost)}
                    {!r.manualCost && <Pct next={r.newCost} prev={r.currentCost} />}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-slate-300 text-xs">{r.bregaPct > 0 ? `${r.bregaPct}%` : '—'}</td>
                  <td className="px-2 py-2 text-right font-mono text-slate-300 text-xs">{pct(r.gananciaPct)}</td>
                  <td className="px-2 py-2 text-right font-mono text-slate-400 text-xs">{fmt(r.currentPriceDetal)}</td>
                  <td className={`px-2 py-2 text-right font-mono text-xs font-bold ${deltaColor(r.newPriceDetal, r.currentPriceDetal)}`}>
                    {fmt(r.newPriceDetal)}
                    <Pct next={r.newPriceDetal} prev={r.currentPriceDetal} />
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-slate-400 text-xs">{fmt(r.currentPriceMayor)}</td>
                  <td className={`px-2 py-2 text-right font-mono text-xs font-bold ${deltaColor(r.newPriceMayor, r.currentPriceMayor)}`}>
                    {fmt(r.newPriceMayor)}
                    <Pct next={r.newPriceMayor} prev={r.currentPriceMayor} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Móvil: tarjetas */}
          <div className="md:hidden space-y-2.5">
            {rows.map((r) => (
              <div key={r.productId} className={`rounded-lg border border-slate-700/50 bg-slate-900/40 p-3 ${r.manualCost ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-2">
                  <span className="font-mono text-green-400 text-xs flex-shrink-0 mt-0.5">{r.code}</span>
                  <span className="text-white text-sm min-w-0 break-words">{r.name}</span>
                </div>
                <div className="mt-1"><Flags r={r} /></div>
                <div className="grid grid-cols-3 gap-2 mt-2.5 text-xs font-mono">
                  <span className="text-slate-500 font-sans">Costo</span>
                  <span className="text-slate-400 text-right">{fmtCost(r.currentCost)}</span>
                  <span className={`text-right font-bold ${r.manualCost ? 'text-slate-400 line-through' : deltaColor(r.newCost, r.currentCost)}`}>
                    {fmtCost(r.partnerCost)}{!r.manualCost && <Pct next={r.newCost} prev={r.currentCost} />}
                  </span>
                  <span className="text-slate-500 font-sans">Detal</span>
                  <span className="text-slate-400 text-right">{fmt(r.currentPriceDetal)}</span>
                  <span className={`text-right font-bold ${deltaColor(r.newPriceDetal, r.currentPriceDetal)}`}>
                    {fmt(r.newPriceDetal)}<Pct next={r.newPriceDetal} prev={r.currentPriceDetal} />
                  </span>
                  <span className="text-slate-500 font-sans">Mayor</span>
                  <span className="text-slate-400 text-right">{fmt(r.currentPriceMayor)}</span>
                  <span className={`text-right font-bold ${deltaColor(r.newPriceMayor, r.currentPriceMayor)}`}>
                    {fmt(r.newPriceMayor)}<Pct next={r.newPriceMayor} prev={r.currentPriceMayor} />
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  Brecha {r.bregaPct > 0 ? `${r.bregaPct}%` : '—'} · Ganancia detal {pct(r.gananciaPct)} · mayor {pct(r.gananciaMayorPct)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 px-4 sm:px-6 py-3 border-t border-slate-700/50 flex-shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={onCancel} disabled={busy} className="text-sm text-slate-400 hover:text-white transition-colors px-3 py-2">
            Cancelar
          </button>
          <button type="button" onClick={() => onReceive(false)} disabled={busy} className="btn-secondary !py-2.5 text-sm flex items-center justify-center gap-2">
            No, solo recibir
          </button>
          <button type="button" onClick={() => onReceive(true)} disabled={busy} className="btn-primary !py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
            Sí, tomar costos y recibir
          </button>
        </div>
      </div>
    </div>
  );
}
