'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw, Search, Settings, PencilLine, Check, RotateCcw, Upload } from 'lucide-react';
import {
  CampaignCustomer, ListResponse, TemplatesResponse, OpenMode,
  api, buildMessage, templateKeyFor, readOpenMode, saveOpenMode, whatsappUrl,
  fmtUsd, fmtYmd, fmtDateTime, SEG_STYLE, ESTADO_STYLE, WhatsAppIcon, Modal, btn, btnWa, input,
} from './shared';

const TABS: { id: string; label: string }[] = [
  { id: 'cot', label: 'Cotizaciones sin comprar' },
  { id: 'cool', label: 'Enfriándose e inactivos' },
  { id: 'act', label: 'Activos' },
  { id: 'all', label: 'Todos' },
  { id: 'sent', label: 'Contactados' },
  { id: 'bad', label: 'Sin WhatsApp' },
];

export default function ClientesTab({ cfg, reloadCfg }: { cfg: TemplatesResponse; reloadCfg: () => Promise<void> }) {
  const [tab, setTab] = useState('cot');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [base, setBase] = useState('');
  const [oficio, setOficio] = useState('');
  const [seg, setSeg] = useState('');
  const [hideSent, setHideSent] = useState(true);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState<CampaignCustomer | null>(null);
  const [showTpl, setShowTpl] = useState(false);
  const [showCfg, setShowCfg] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async (refresh = false) => {
    const id = ++reqId.current;
    setLoading(true);
    setError('');
    try {
      const p = new URLSearchParams({ tab, page: String(page), hideSent: hideSent ? '1' : '0' });
      if (qDebounced.trim()) p.set('q', qDebounced.trim());
      if (base) p.set('base', base);
      if (oficio) p.set('oficio', oficio);
      if (seg) p.set('seg', seg);
      if (refresh) p.set('refresh', '1');
      const res = await api<ListResponse>(`/clientes?${p}`);
      if (id === reqId.current) setData(res);
    } catch (e: any) {
      if (id === reqId.current) setError(e.message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [tab, page, hideSent, qDebounced, base, oficio, seg]);

  useEffect(() => { load(); }, [load]);

  const resetPage = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0); };

  const toggleReplied = async (c: CampaignCustomer) => {
    try {
      await api(`/contactos/${c.id}/respondio`, { method: 'PATCH', body: JSON.stringify({ value: !c.replied }) });
      load();
    } catch (e: any) { setError(e.message); }
  };

  const restoreBad = async (c: CampaignCustomer) => {
    try {
      await api(`/contactos/${c.id}/sin-whatsapp`, { method: 'PATCH', body: JSON.stringify({ value: false }) });
      load();
    } catch (e: any) { setError(e.message); }
  };

  const st = data?.stats;
  const over = !!st && st.sentToday > st.dailyLimit;
  const isQuoteTab = tab === 'cot';

  return (
    <div className="space-y-4">
      {/* Estadisticas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="enviados hoy" value={st ? `${st.sentToday} / ${st.dailyLimit}` : '—'} tone={over ? 'text-rose-400' : 'text-white'} />
        <Stat label="clientes contactados" value={st ? st.contacted.toLocaleString('es-VE') : '—'} />
        <Stat label="respondieron" value={st ? String(st.replied) : '—'} />
        <Stat label="sin WhatsApp" value={st ? String(st.noWhatsapp) : '—'} />
      </div>
      {over && (
        <div className="px-4 py-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-200 text-sm">
          Pasaste el límite sugerido de envíos por día. Enviar muchos mensajes seguidos puede hacer que WhatsApp bloquee el número.
        </div>
      )}

      {/* Pestanas de clientes */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setPage(0); }}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm border transition-colors ${
              tab === t.id ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-200' : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs opacity-70 tabular-nums">{data?.tabCounts?.[t.id]?.toLocaleString('es-VE') ?? ''}</span>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Buscar cliente, código o teléfono…" className={`${input} w-full pl-9`} />
        </div>
        {!isQuoteTab && (
          <>
            <select value={base} onChange={(e) => resetPage(setBase)(e.target.value)} className={`${input} flex-1 sm:flex-none min-w-[150px]`}>
              <option value="">Todos los rubros</option>
              {cfg.bases.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
            <select value={oficio} onChange={(e) => resetPage(setOficio)(e.target.value)} className={`${input} flex-1 sm:flex-none min-w-[150px]`}>
              <option value="">Oficio y ocasional</option>
              <option value="1">Solo de oficio</option>
              <option value="0">Solo ocasionales</option>
            </select>
            <select value={seg} onChange={(e) => resetPage(setSeg)(e.target.value)} className={`${input} flex-1 sm:flex-none min-w-[150px]`}>
              <option value="">Todos los segmentos</option>
              {['VIP', 'Frecuente', 'Recurrente', 'Ocasional'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
          <input type="checkbox" checked={hideSent} onChange={(e) => resetPage(setHideSent)(e.target.checked)} className="accent-emerald-500" />
          Ocultar ya enviados
        </label>
        <div className="flex gap-2 ml-auto">
          <button className={btn} onClick={() => setShowTpl(true)}><PencilLine size={14} className="inline -mt-0.5 mr-1" />Plantillas</button>
          <button className={btn} onClick={() => setShowCfg(true)}><Settings size={14} className="inline -mt-0.5 mr-1" />Ajustes</button>
        </div>
      </div>

      {error && <div className="px-4 py-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm">{error}</div>}

      {isQuoteTab && (
        <div className="px-4 py-2.5 rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-100 text-sm">
          Clientes con una cotización de hace 1 a 7 días que no han comprado desde entonces, nuevos o de siempre.
          Las de hoy no aparecen: casi todas se facturan el mismo día. Escríbeles primero a estos; mientras tengan la cotización pendiente no salen en las otras pestañas.
        </div>
      )}

      {/* Lista */}
      <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl overflow-hidden">
        {!data && loading ? (
          <div className="py-16 flex flex-col items-center gap-2 text-slate-400 text-sm">
            <Loader2 className="animate-spin" size={22} />
            Clasificando clientes (la primera vez tarda unos segundos)…
          </div>
        ) : data && data.items.length === 0 ? (
          <div className="py-14 text-center text-slate-500 text-sm">
            {isQuoteTab ? 'No hay cotizaciones pendientes por contactar.' : 'No hay clientes con estos filtros.'}
          </div>
        ) : data && isQuoteTab ? (
          <QuoteList items={data.items} loading={loading} onSend={setSending} onReplied={toggleReplied} />
        ) : data ? (
          <div className={loading ? 'opacity-60 transition-opacity' : ''}>
            {/* Escritorio: tabla */}
            <table className="w-full text-sm hidden md:table">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-700/60">
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-3 py-2.5 font-medium">Rubro</th>
                  <th className="px-3 py-2.5 font-medium">Segmento</th>
                  <th className="px-3 py-2.5 font-medium">Última compra</th>
                  <th className="px-3 py-2.5 font-medium text-right">Comprado</th>
                  <th className="px-3 py-2.5 font-medium whitespace-nowrap">Último envío</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} className={`border-b border-slate-700/40 last:border-0 ${c.lastSentAt && tab !== 'sent' ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-100">{c.n}</div>
                      <div className="text-xs text-slate-500">{c.c} · +{c.wa}{c.t === 'Empresa' ? ' · Empresa' : ''}</div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-300">
                      {cfg.bases.find((b) => b.key === c.b)?.label ?? c.r}
                      {!c.o && <div className="text-xs text-slate-500">ocasional</div>}
                    </td>
                    <td className="px-3 py-2.5"><span className={`inline-block px-2 py-0.5 rounded-full text-xs border ${SEG_STYLE[c.sg]}`}>{c.sg}</span></td>
                    <td className="px-3 py-2.5">
                      <span className={ESTADO_STYLE[c.st]}>{c.st}</span>
                      <div className="text-xs text-slate-500 whitespace-nowrap">{c.u ? `${fmtYmd(c.u)} · hace ${c.d} d` : 'nunca ha comprado'}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">{fmtUsd(c.tot)}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-400">
                      {c.lastSentAt ? (
                        <>
                          {fmtDateTime(c.lastSentAt)}
                          <RepliedButton c={c} onClick={() => toggleReplied(c)} />
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <RowAction tab={tab} c={c} onSend={() => setSending(c)} onRestore={() => restoreBad(c)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Telefono: tarjetas */}
            <div className="md:hidden divide-y divide-slate-700/40">
              {data.items.map((c) => (
                <div key={c.id} className={`p-3.5 ${c.lastSentAt && tab !== 'sent' ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-100 leading-snug">{c.n}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{c.c} · +{c.wa}</div>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs border ${SEG_STYLE[c.sg]}`}>{c.sg}</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                    <span>{cfg.bases.find((b) => b.key === c.b)?.label ?? c.r}{!c.o && ' (ocasional)'}</span>
                    <span className={ESTADO_STYLE[c.st]}>{c.st}{c.u ? ` · hace ${c.d} d` : ''}</span>
                    <span className="tabular-nums">{fmtUsd(c.tot)}</span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-500">
                      {c.lastSentAt ? <>Enviado {fmtDateTime(c.lastSentAt)} <RepliedButton c={c} onClick={() => toggleReplied(c)} /></> : null}
                    </div>
                    <RowAction tab={tab} c={c} onSend={() => setSending(c)} onRestore={() => restoreBad(c)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Paginacion + datos */}
      {data && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
          <span className="text-xs">
            Clasificación calculada {fmtDateTime(data.calculadoAt)} · {data.totalClientes.toLocaleString('es-VE')} clientes con WhatsApp
          </span>
          <button className="text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1" onClick={() => load(true)} disabled={loading}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Recalcular ahora
          </button>
          <div className="ml-auto flex items-center gap-2">
            <span className="tabular-nums">{data.total.toLocaleString('es-VE')} clientes · pág. {data.page + 1} de {data.pages}</span>
            <button className={btn} disabled={data.page === 0} onClick={() => { setPage(data.page - 1); window.scrollTo(0, 0); }}>‹</button>
            <button className={btn} disabled={data.page >= data.pages - 1} onClick={() => { setPage(data.page + 1); window.scrollTo(0, 0); }}>›</button>
          </div>
        </div>
      )}

      {sending && <SendModal c={sending} cfg={cfg} onClose={() => setSending(null)} onDone={() => { setSending(null); load(); }} />}
      {showTpl && <TemplatesModal cfg={cfg} onClose={() => setShowTpl(false)} reloadCfg={reloadCfg} />}
      {showCfg && <SettingsModal cfg={cfg} onClose={() => setShowCfg(false)} onSaved={async () => { await reloadCfg(); load(); }} />}
    </div>
  );
}

// ── Cotizaciones sin comprar ───────────────────────────────────────────────

function QuoteList({ items, loading, onSend, onReplied }: {
  items: CampaignCustomer[]; loading: boolean; onSend: (c: CampaignCustomer) => void; onReplied: (c: CampaignCustomer) => void;
}) {
  const quoteLink = (c: CampaignCustomer) => (
    <Link href={`/quotations/${c.q!.id}`} target="_blank" className="font-medium text-sky-400 hover:text-sky-300">{c.q!.number}</Link>
  );
  const when = (c: CampaignCustomer) => `${fmtYmd(c.q!.ymd)} · ${c.q!.daysAgo === 1 ? 'ayer' : `hace ${c.q!.daysAgo} d`}`;
  const customerKind = (c: CampaignCustomer) =>
    c.st === 'Nuevo'
      ? <span className={ESTADO_STYLE.Nuevo}>Nunca ha comprado</span>
      : <><span className={ESTADO_STYLE[c.st]}>{c.st}</span> <span className="text-slate-500">· {c.sg} · {fmtUsd(c.tot)} comprado</span></>;

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : ''}>
      <table className="w-full text-sm hidden md:table">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-700/60">
            <th className="px-4 py-2.5 font-medium">Cliente</th>
            <th className="px-3 py-2.5 font-medium">Cotización</th>
            <th className="px-3 py-2.5 font-medium">Productos</th>
            <th className="px-3 py-2.5 font-medium text-right">Monto</th>
            <th className="px-3 py-2.5 font-medium whitespace-nowrap">Último envío</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id} className="border-b border-slate-700/40 last:border-0 align-top">
              <td className="px-4 py-2.5">
                <div className="font-medium text-slate-100">{c.n}</div>
                <div className="text-xs text-slate-500">{c.c} · +{c.wa}</div>
                <div className="text-xs mt-0.5">{customerKind(c)}</div>
              </td>
              <td className="px-3 py-2.5">
                {quoteLink(c)}
                <div className="text-xs text-slate-500 whitespace-nowrap">{when(c)}</div>
              </td>
              <td className="px-3 py-2.5 text-xs text-slate-300 max-w-[320px]">
                {c.q!.items.join(' · ')}
                {c.q!.nItems > c.q!.items.length && <span className="text-slate-500"> · y {c.q!.nItems - c.q!.items.length} más</span>}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-100">{fmtUsd(c.q!.usd)}</td>
              <td className="px-3 py-2.5 text-xs text-slate-400">
                {c.lastSentAt ? <>{fmtDateTime(c.lastSentAt)}<RepliedButton c={c} onClick={() => onReplied(c)} /></> : '—'}
              </td>
              <td className="px-4 py-2.5 text-right">
                <button className={btnWa} onClick={() => onSend(c)}><WhatsAppIcon size={15} /> WhatsApp</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="md:hidden divide-y divide-slate-700/40">
        {items.map((c) => (
          <div key={c.id} className="p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-slate-100 leading-snug">{c.n}</div>
                <div className="text-xs text-slate-500 mt-0.5">{c.c} · +{c.wa}</div>
              </div>
              <span className="shrink-0 tabular-nums font-semibold text-slate-100">{fmtUsd(c.q!.usd)}</span>
            </div>
            <div className="mt-1.5 text-xs">{quoteLink(c)} <span className="text-slate-500">· {when(c)}</span></div>
            <div className="mt-1 text-xs text-slate-400">{c.q!.items.join(' · ')}{c.q!.nItems > c.q!.items.length && ` · y ${c.q!.nItems - c.q!.items.length} más`}</div>
            <div className="mt-1 text-xs">{customerKind(c)}</div>
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-500">
                {c.lastSentAt ? <>Enviado {fmtDateTime(c.lastSentAt)} <RepliedButton c={c} onClick={() => onReplied(c)} /></> : null}
              </div>
              <button className={btnWa} onClick={() => onSend(c)}><WhatsAppIcon size={15} /> WhatsApp</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl px-4 py-3">
      <div className={`text-xl font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function RepliedButton({ c, onClick }: { c: CampaignCustomer; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`ml-1.5 mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] ${
        c.replied ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'
      }`}
    >
      {c.replied ? <><Check size={11} /> Respondió</> : '¿Respondió?'}
    </button>
  );
}

function RowAction({ tab, c, onSend, onRestore }: { tab: string; c: CampaignCustomer; onSend: () => void; onRestore: () => void }) {
  if (tab === 'bad') {
    return <button className={btn} onClick={onRestore}><RotateCcw size={13} className="inline -mt-0.5 mr-1" />Restaurar</button>;
  }
  return <button className={btnWa} onClick={onSend}><WhatsAppIcon size={15} /> WhatsApp</button>;
}

// ── Enviar ─────────────────────────────────────────────────────────────────

function SendModal({ c, cfg, onClose, onDone }: { c: CampaignCustomer; cfg: TemplatesResponse; onClose: () => void; onDone: () => void }) {
  const original = buildMessage(c, cfg);
  const key = templateKeyFor(c, cfg);
  const [msg, setMsg] = useState(original);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const open = () => {
    window.open(whatsappUrl(c.wa, msg, readOpenMode()), 'trinity_whatsapp');
    setAsked(true);
  };

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/envios', { method: 'POST', body: JSON.stringify({ customerId: c.id, template: key, edited: msg !== original }) });
      onDone();
    } catch (e: any) { setError(e.message); setBusy(false); }
  };

  const markBad = async () => {
    setBusy(true);
    try {
      await api(`/contactos/${c.id}/sin-whatsapp`, { method: 'PATCH', body: JSON.stringify({ value: true }) });
      onDone();
    } catch (e: any) { setError(e.message); setBusy(false); }
  };

  return (
    <Modal
      onClose={onClose}
      title={
        <>
          <div className="font-semibold text-white">{c.n}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {c.q
              ? <>{c.c} · +{c.wa} · Cotización {c.q.number} ({fmtYmd(c.q.ymd)}, {fmtUsd(c.q.usd)}) · {c.st === 'Nuevo' ? 'nunca ha comprado' : c.st}</>
              : <>{c.c} · +{c.wa} · {cfg.bases.find((b) => b.key === c.b)?.label}{!c.o && ' (ocasional)'} · {c.sg} · {c.st}</>}
          </div>
        </>
      }
      footer={
        <>
          <button className={btn} onClick={onClose}>Cancelar</button>
          <button className={btnWa} onClick={open}><WhatsAppIcon size={15} /> Abrir WhatsApp</button>
        </>
      }
    >
      <div className="text-xs text-slate-400 mb-1.5">Plantilla: {cfg.templates.find((t) => t.key === key)?.label}</div>
      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={9} className={`${input} w-full resize-y leading-relaxed`} />
      <p className="text-xs text-slate-500 mt-1.5">Puedes editar el mensaje solo para este cliente antes de abrir WhatsApp. *texto* = negrita en WhatsApp.</p>
      {asked && (
        <div className="mt-3 rounded-lg border border-emerald-600/50 bg-emerald-600/10 p-3">
          <div className="text-sm text-emerald-100"><b>¿Enviaste el mensaje?</b> WhatsApp solo se abre con el texto listo; tú le das enviar.</div>
          <div className="flex flex-wrap gap-2 mt-2.5">
            <button className={btnWa} onClick={confirm} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Sí, lo envié</button>
            <button className={btn} onClick={onClose} disabled={busy}>No todavía</button>
            <button className={btn} onClick={markBad} disabled={busy}>El número no tiene WhatsApp</button>
          </div>
          {error && <div className="text-xs text-rose-300 mt-2">{error}</div>}
        </div>
      )}
    </Modal>
  );
}

// ── Plantillas ─────────────────────────────────────────────────────────────

function TemplatesModal({ cfg, onClose, reloadCfg }: { cfg: TemplatesResponse; onClose: () => void; reloadCfg: () => Promise<void> }) {
  const [key, setKey] = useState(cfg.coolingKey);
  const current = cfg.templates.find((t) => t.key === key)!;
  const [text, setText] = useState(current.text);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { setText(cfg.templates.find((t) => t.key === key)!.text); setMsg(''); }, [key, cfg]);

  const dirty = text !== current.text;
  const save = async () => {
    setBusy(true);
    try {
      await api(`/plantillas/${key}`, { method: 'PUT', body: JSON.stringify({ text }) });
      await reloadCfg();
      setMsg('Guardada');
    } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };
  const reset = async () => {
    setBusy(true);
    try {
      await api(`/plantillas/${key}`, { method: 'DELETE' });
      await reloadCfg();
      setMsg('Restaurada al texto original');
    } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };

  return (
    <Modal wide onClose={onClose} title={<b className="text-white">Plantillas de mensaje</b>}
      footer={<button className={btn} onClick={onClose}>Cerrar</button>}>
      <div className="grid md:grid-cols-[230px_1fr] gap-4">
        <div className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible pb-1">
          {cfg.templates.map((t) => (
            <button key={t.key} onClick={() => setKey(t.key)}
              className={`shrink-0 text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                t.key === key ? 'border-emerald-500/50 bg-emerald-600/15 text-emerald-100' : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800'
              }`}>
              {t.label}{t.edited && <span className="text-amber-300"> ✎</span>}
            </button>
          ))}
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1.5">{current.description}</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={11} className={`${input} w-full resize-y leading-relaxed`} />
          <p className="text-xs text-slate-500 mt-1.5">
            {key === cfg.quoteKey ? (
              <>Variables: <b>{'{saludo}'}</b> (“Hola Juan” o “Hola” si es empresa) · <b>{'{nombre}'}</b> · <b>{'{empresa}'}</b> · <b>{'{fecha}'}</b> (“ayer” o “martes 21-10”) · <b>{'{productos}'}</b> (ej. “cemento gris, pego y 3 productos más”) · <b>{'{monto}'}</b> (total de la cotización) · <b>{'{cotizacion}'}</b> (número)</>
            ) : (
              <>Variables: <b>{'{saludo}'}</b> (“Hola Juan” o “Hola” si es empresa) · <b>{'{nombre}'}</b> · <b>{'{empresa}'}</b> · <b>{'{area}'}</b> (ej. “material de construcción”) · <b>{'{gracias}'}</b> (solo a VIP y Frecuentes) · <b>{'{producto}'}</b> (lo que más compró)</>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button className={btnWa} onClick={save} disabled={busy || !dirty || !text.trim()}>Guardar</button>
            <button className={btn} onClick={reset} disabled={busy || !current.edited}>Restaurar original</button>
            <span className="text-xs text-slate-400">{msg || (current.edited ? 'Modificada' : 'Original')}{dirty && ' · cambios sin guardar'}</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">Las plantillas son compartidas: el cambio lo ven todos los que usan la campaña.</p>
        </div>
      </div>
    </Modal>
  );
}

// ── Ajustes ────────────────────────────────────────────────────────────────

function SettingsModal({ cfg, onClose, onSaved }: { cfg: TemplatesResponse; onClose: () => void; onSaved: () => Promise<void> }) {
  const [storeName, setStoreName] = useState(cfg.storeName);
  const [dailyLimit, setDailyLimit] = useState(String(cfg.dailyLimit));
  const [mode, setMode] = useState<OpenMode>(() => readOpenMode());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      saveOpenMode(mode);
      await api('/ajustes', { method: 'PATCH', body: JSON.stringify({ storeName: storeName.trim() || cfg.storeName, dailyLimit: Number(dailyLimit) || cfg.dailyLimit }) });
      await onSaved();
      onClose();
    } catch (e: any) { setMsg(e.message); setBusy(false); }
  };

  const importFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setMsg('');
    try {
      const json = JSON.parse(await f.text());
      if (!json?.sent) throw new Error('Ese archivo no es un respaldo de la campaña.');
      const { sent, bad, replied, tpls } = json;
      const r = await api<{ sends: number; contacts: number; templates: number; unknownCustomers: number }>('/importar', {
        method: 'POST', body: JSON.stringify({ sent, bad: bad || {}, replied: replied || {}, tpls: tpls || {} }),
      });
      setMsg(`Importado: ${r.sends} envíos, ${r.contacts} marcas (respondió / sin WhatsApp), ${r.templates} plantillas.` +
        (r.unknownCustomers ? ` ${r.unknownCustomers} clientes no encontrados.` : ''));
      await onSaved();
    } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };

  return (
    <Modal onClose={onClose} title={<b className="text-white">Ajustes de la campaña</b>}
      footer={<><button className={btn} onClick={onClose}>Cancelar</button><button className={btnWa} onClick={save} disabled={busy}>Guardar</button></>}>
      <div className="space-y-4 text-sm">
        <label className="block">
          <span className="text-slate-300">Nombre de la tienda en los mensajes</span>
          <input value={storeName} onChange={(e) => setStoreName(e.target.value)} className={`${input} w-full mt-1`} />
        </label>
        <label className="block">
          <span className="text-slate-300">Límite sugerido de envíos por día</span>
          <input type="number" min={1} value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} className={`${input} w-32 mt-1 block`} />
          <span className="text-xs text-slate-500">Cuenta los envíos de todos los usuarios.</span>
        </label>
        <label className="block">
          <span className="text-slate-300">Abrir WhatsApp en</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as OpenMode)} className={`${input} w-full mt-1`}>
            <option value="web">WhatsApp Web (navegador)</option>
            <option value="app">App de WhatsApp (wa.me)</option>
          </select>
          <span className="text-xs text-slate-500">Solo para este dispositivo. En el teléfono conviene la app.</span>
        </label>
        <div className="pt-3 border-t border-slate-700/60">
          <div className="text-slate-300">Traer el historial de la página local</div>
          <p className="text-xs text-slate-500 mt-0.5">
            En la página vieja (index.html) toca “⬇ Exportar envíos” o “Descargar respaldo” y carga aquí ese archivo .json. Los envíos repetidos no se duplican.
          </p>
          <label className={`${btn} inline-flex items-center gap-1.5 mt-2 cursor-pointer`}>
            <Upload size={14} /> Cargar archivo .json
            <input type="file" accept=".json,application/json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
          </label>
        </div>
        {msg && <div className="text-xs text-emerald-300">{msg}</div>}
      </div>
    </Modal>
  );
}
