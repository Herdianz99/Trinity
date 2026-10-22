'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Info } from 'lucide-react';
import { api, fmt2, fmtUsd, fmtYmd, fmtDateTime, localYmd, input, ESTADO_STYLE } from './shared';

interface Row { key: string; label: string; sent: number; buyers: number; conversionPct: number; controlPct: number; usd: number }
interface Buyer {
  customerId: string; code: string; name: string; sentAt: string; templateLabel: string; estado: string; seg: string | null;
  daysToBuy: number; totalUsd: number; totalBs: number; cashea: boolean; methods: string[];
  invoices: { id: string; number: string | null; createdAt: string; totalUsd: number }[];
}
interface Results {
  from: string; to: string; window: number;
  totals: {
    sent: number; buyers: number; conversionPct: number; controlPct: number; expectedBuyers: number; extraBuyers: number;
    usd: number; bs: number; cashea: number; replied: number; openWindow: number; noWhatsapp: number;
  };
  byTemplate: Row[]; byEstado: Row[]; byUser: Row[]; byDay: Row[];
  buyers: Buyer[];
}

export default function ResultadosTab() {
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return localYmd(d); });
  const [to, setTo] = useState(() => localYmd());
  const [win, setWin] = useState(7);
  const [data, setData] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!from || !to || from > to) return;
    setLoading(true);
    setError('');
    try {
      setData(await api<Results>(`/resultados?from=${from}&to=${to}&window=${win}`));
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [from, to, win]);

  useEffect(() => { load(); }, [load]);

  const t = data?.totals;
  const maxDay = Math.max(1, ...(data?.byDay.map((d) => d.sent) ?? [1]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-400">Envíos desde
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${input} block mt-1`} />
        </label>
        <label className="text-xs text-slate-400">hasta
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${input} block mt-1`} />
        </label>
        <label className="text-xs text-slate-400">Cuenta como efecto si compra en
          <select value={win} onChange={(e) => setWin(Number(e.target.value))} className={`${input} block mt-1`}>
            {[3, 7, 14, 30].map((n) => <option key={n} value={n}>{n} días después del mensaje</option>)}
          </select>
        </label>
        {loading && <Loader2 size={18} className="animate-spin text-slate-400 mb-2" />}
      </div>

      {error && <div className="px-4 py-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm">{error}</div>}

      {t && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Clientes contactados" value={t.sent.toLocaleString('es-VE')} sub={`${t.replied} respondieron · ${t.noWhatsapp} sin WhatsApp`} />
            <Kpi label="Compraron después" value={`${t.buyers}`} accent sub={`${fmt2(t.conversionPct)}% de los contactados`} />
            <Kpi
              label="Sin mensaje habrían comprado"
              value={`${fmt2(t.controlPct)}%`}
              sub={`≈ ${fmt2(t.expectedBuyers)} clientes · grupo control`}
            />
            <Kpi
              label="Compras atribuibles"
              value={`${t.extraBuyers >= 0 ? '+' : ''}${fmt2(t.extraBuyers)}`}
              tone={t.extraBuyers > 0 ? 'text-emerald-300' : t.extraBuyers < 0 ? 'text-rose-300' : 'text-white'}
              sub="compraron − esperados sin mensaje"
            />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Monto comprado" value={fmtUsd(t.usd)} sub={`Bs ${fmt2(t.bs)}`} />
            <Kpi label="Pagaron con Cashea" value={String(t.cashea)} sub={t.buyers ? `${Math.round((t.cashea / t.buyers) * 100)}% de los que compraron` : '—'} />
            <Kpi label="Ventana en curso" value={String(t.openWindow)} sub={`contactos de los últimos ${data!.window} días: aún pueden comprar`} />
            <Kpi label="Ticket promedio" value={t.buyers ? fmtUsd(t.usd / t.buyers) : '—'} sub="por cliente que compró" />
          </div>

          <div className="flex gap-2 items-start text-xs text-slate-500 bg-slate-800/40 border border-slate-700/60 rounded-lg px-3 py-2">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>
              Se toma el primer mensaje de cada cliente en el rango y cuenta si compró (factura cobrada) dentro de los {data!.window} días siguientes.
              El <b>grupo control</b> son clientes nunca contactados que ese mismo día estaban en el mismo estado (activo, enfriándose o inactivo):
              su % de compra en la misma ventana dice cuántos habrían comprado igual sin el mensaje.
            </span>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Breakdown title="Por plantilla" rows={data!.byTemplate} />
            <Breakdown title="Por estado del cliente al enviar" rows={data!.byEstado} labelClass={(r) => ESTADO_STYLE[r.key]} />
            <Breakdown title="Por usuario que envió" rows={data!.byUser} />
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Por día de envío</h3>
              {data!.byDay.length === 0 ? <Empty /> : (
                <div className="space-y-1.5">
                  {data!.byDay.map((d) => (
                    <div key={d.key} className="flex items-center gap-2 text-xs">
                      <span className="w-20 text-slate-400 tabular-nums">{fmtYmd(d.key)}</span>
                      <div className="flex-1 h-4 bg-slate-700/40 rounded overflow-hidden relative">
                        <div className="h-full bg-slate-500/60" style={{ width: `${(d.sent / maxDay) * 100}%` }} />
                        <div className="h-full bg-emerald-500 absolute top-0 left-0" style={{ width: `${(d.buyers / maxDay) * 100}%` }} />
                      </div>
                      <span className="w-20 text-right text-slate-300 tabular-nums">{d.buyers} / {d.sent}</span>
                    </div>
                  ))}
                  <div className="text-[11px] text-slate-500 pt-1"><span className="inline-block w-2 h-2 bg-emerald-500 rounded-sm mr-1" />compraron · <span className="inline-block w-2 h-2 bg-slate-500/60 rounded-sm mx-1" />contactados</div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl overflow-hidden">
            <h3 className="text-sm font-semibold text-slate-300 px-4 pt-4 pb-2">Clientes que compraron después del mensaje ({data!.buyers.length})</h3>
            {data!.buyers.length === 0 ? <div className="px-4 pb-4"><Empty /></div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-700/60">
                      <th className="px-4 py-2 font-medium">Cliente</th>
                      <th className="px-3 py-2 font-medium">Mensaje</th>
                      <th className="px-3 py-2 font-medium">Compró</th>
                      <th className="px-3 py-2 font-medium">Facturas</th>
                      <th className="px-3 py-2 font-medium text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.buyers.map((b) => (
                      <tr key={b.customerId} className="border-b border-slate-700/40 last:border-0 align-top">
                        <td className="px-4 py-2.5">
                          <Link href={`/sales/customers/${b.customerId}`} className="font-medium text-slate-100 hover:text-emerald-300">{b.name}</Link>
                          <div className="text-xs text-slate-500">{b.code} · <span className={ESTADO_STYLE[b.estado]}>{b.estado}</span>{b.seg ? ` · ${b.seg}` : ''}</div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-400">{fmtDateTime(b.sentAt)}<div>{b.templateLabel}</div></td>
                        <td className="px-3 py-2.5 text-xs text-slate-300">
                          {b.daysToBuy === 0 ? 'el mismo día' : `a los ${b.daysToBuy} d`}
                          <div className="text-slate-500">{b.methods.join(', ')}</div>
                          {b.cashea && <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-fuchsia-500/15 text-fuchsia-300 text-[10px] font-semibold">CASHEA</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {b.invoices.map((i, idx) => (
                            <Fragment key={i.id}>
                              {idx > 0 && ', '}
                              <Link href={`/sales/invoices/${i.id}`} className="text-sky-400 hover:text-sky-300">{i.number || 'S/N'}</Link>
                            </Fragment>
                          ))}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-100">
                          ${fmt2(b.totalUsd)}<div className="text-xs text-slate-500">Bs {fmt2(b.totalBs)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, accent = false, tone }: { label: string; value: string; sub?: string; accent?: boolean; tone?: string }) {
  return (
    <div className={`rounded-xl px-4 py-3 border ${accent ? 'bg-emerald-600/10 border-emerald-500/30' : 'bg-slate-800/50 border-slate-700/60'}`}>
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-2xl font-bold tabular-nums mt-0.5 ${tone ?? (accent ? 'text-emerald-300' : 'text-white')}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Empty() {
  return <div className="text-sm text-slate-500 py-4 text-center">Sin datos en este rango</div>;
}

function Breakdown({ title, rows, labelClass }: { title: string; rows: Row[]; labelClass?: (r: Row) => string }) {
  return (
    <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-3">{title}</h3>
      {rows.length === 0 ? <Empty /> : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="pb-1.5 font-medium" />
              <th className="pb-1.5 font-medium text-right">Enviados</th>
              <th className="pb-1.5 font-medium text-right">Compraron</th>
              <th className="pb-1.5 font-medium text-right" title="% que habría comprado sin mensaje (grupo control)">Control</th>
              <th className="pb-1.5 font-medium text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-slate-700/40">
                <td className={`py-1.5 pr-2 ${labelClass?.(r) ?? 'text-slate-300'}`}>{r.label}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-300">{r.sent}</td>
                <td className="py-1.5 text-right tabular-nums text-white">{r.buyers} <span className="text-xs text-emerald-400">{fmt2(r.conversionPct)}%</span></td>
                <td className="py-1.5 text-right tabular-nums text-xs text-slate-400">{fmt2(r.controlPct)}%</td>
                <td className="py-1.5 text-right tabular-nums text-slate-300">{fmtUsd(r.usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
