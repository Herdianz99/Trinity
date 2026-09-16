'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MessageCircleWarning, Loader2, Search, ChevronDown, ChevronRight, X, Send, Phone,
  Clock, StickyNote, Check,
} from 'lucide-react';

interface OverdueItem {
  id: string;
  number: string;
  dueDate: string | null;
  balanceUsd: number;
  daysLeft?: number;
}
interface OverdueCustomer {
  customerId: string;
  name: string;
  phone: string | null;
  documentType: string | null;
  rif: string | null;
  isEmployee: boolean;
  isGroupCompany: boolean;
  lastReminderAt: string | null;
  reminderNote: string | null;
  count: number;
  totalUsd: number;
  upcomingCount: number;
  upcomingTotalUsd: number;
  items: OverdueItem[];
  upcoming: OverdueItem[];
}

type TabKey = 'todos' | 'empleados' | 'grupo' | 'clientes';
// Categoría del cliente (excluyentes): empleado > empresa del grupo > cliente normal.
const catOf = (c: OverdueCustomer): Exclude<TabKey, 'todos'> =>
  c.isEmployee ? 'empleados' : c.isGroupCompany ? 'grupo' : 'clientes';

const fmt = (n: number) =>
  (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "vence hoy" / "falta 1 día" / "faltan N días"
const diasLabel = (n?: number) =>
  n == null ? '' : n <= 0 ? 'vence hoy' : n === 1 ? 'falta 1 día' : `faltan ${n} días`;

// Fecha de vencimiento: date-only guardada a medianoche UTC → formatear en UTC para no correr el día.
const fmtDate = (d: string | null) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('es-VE', { timeZone: 'UTC' }); } catch { return '—'; }
};

// Timestamp real (último mensaje): formatear con fecha y hora en Caracas.
const fmtDateTime = (d: string | null) => {
  if (!d) return null;
  try {
    return new Date(d).toLocaleString('es-VE', {
      timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return null; }
};

// Número para wa.me: asume Venezuela (+58). Quita símbolos, quita el 0 inicial y antepone 58.
// Si ya empieza por 58, lo deja. Devuelve '' si no hay dígitos.
function waPhone(raw: string | null): string {
  let d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('58')) return d;
  if (d.startsWith('0')) d = d.slice(1);
  return '58' + d;
}

// Logo de WhatsApp (SVG inline, sin dependencias).
function WhatsAppIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.157 5.335 5.492 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.82 9.82 0 001.599 5.339l-.999 3.648 3.889-.336zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.767.967-.94 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
    </svg>
  );
}

export default function RecordatoriosPage() {
  const [companyName, setCompanyName] = useState('');
  const [windowDays, setWindowDays] = useState(3);
  const [customers, setCustomers] = useState<OverdueCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabKey>('todos');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modalCustomer, setModalCustomer] = useState<OverdueCustomer | null>(null);
  const [messageText, setMessageText] = useState('');
  const [confirmSent, setConfirmSent] = useState(false); // en el modal, tras abrir WhatsApp
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);

  useEffect(() => { document.title = 'Recordatorios por WhatsApp | Trinity ERP'; }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/receivables/overdue-by-customer');
      const data = await res.json();
      setCompanyName(data.companyName || '');
      setWindowDays(data.windowDays || 3);
      setCustomers(Array.isArray(data.customers) ? data.customers : []);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 1) filtrar por búsqueda, 2) contar por categoría, 3) filtrar por tab activo.
  const bySearch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.rif || '').toLowerCase().includes(q),
    );
  }, [customers, search]);

  const tabCounts = useMemo(() => {
    const counts = { todos: bySearch.length, empleados: 0, grupo: 0, clientes: 0 };
    for (const c of bySearch) counts[catOf(c)] += 1;
    return counts;
  }, [bySearch]);

  const filtered = useMemo(
    () => (tab === 'todos' ? bySearch : bySearch.filter((c) => catOf(c) === tab)),
    [bySearch, tab],
  );

  const totals = useMemo(() => ({
    clientes: filtered.length,
    facturas: filtered.reduce((s, c) => s + c.count, 0),
    monto: filtered.reduce((s, c) => s + c.totalUsd, 0),
    proximas: filtered.reduce((s, c) => s + c.upcomingCount, 0),
  }), [filtered]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Arma el mensaje corporativo por defecto para un cliente (vencidas + próximas a vencer).
  const buildMessage = useCallback((c: OverdueCustomer): string => {
    const empresa = companyName || 'nuestra empresa';
    const partes: string[] = [`Estimado(a) ${c.name}:`, '', `Reciba un cordial saludo de parte de ${empresa}.`];

    if (c.count > 0) {
      const detalle = c.items
        .map((it) => `• Factura ${it.number} (venció ${fmtDate(it.dueDate)}): $${fmt(it.balanceUsd)}`)
        .join('\n');
      partes.push('');
      partes.push(`Le recordamos que a la fecha presenta ${c.count} factura(s) VENCIDA(S), por un total de $${fmt(c.totalUsd)}:`);
      partes.push('');
      partes.push(detalle);
    }

    if (c.upcomingCount > 0) {
      const detalleP = c.upcoming
        .map((it) => `• Factura ${it.number} (vence ${fmtDate(it.dueDate)}, ${diasLabel(it.daysLeft)}): $${fmt(it.balanceUsd)}`)
        .join('\n');
      partes.push('');
      partes.push(`Asimismo, tiene ${c.upcomingCount} factura(s) PRÓXIMA(S) A VENCER, por un total de $${fmt(c.upcomingTotalUsd)}:`);
      partes.push('');
      partes.push(detalleP);
    }

    partes.push('');
    partes.push('Agradecemos su pronto pago y quedamos a la orden para cualquier aclaratoria.');
    partes.push('');
    partes.push(empresa);
    return partes.join('\n');
  }, [companyName]);

  const openModal = (c: OverdueCustomer) => {
    setModalCustomer(c);
    setMessageText(buildMessage(c));
    setConfirmSent(false);
  };

  // Actualiza un cliente en la lista local (tras marcar enviado / guardar observación).
  const applyToCustomer = (customerId: string, patch: Partial<OverdueCustomer>) => {
    setCustomers((prev) => prev.map((c) => (c.customerId === customerId ? { ...c, ...patch } : c)));
    setModalCustomer((prev) => (prev && prev.customerId === customerId ? { ...prev, ...patch } : prev));
  };

  const patchReminder = async (customerId: string, body: { markSent?: boolean; note?: string }) => {
    const res = await fetch(`/api/proxy/receivables/reminder/${customerId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error();
    return res.json() as Promise<{ lastReminderAt: string | null; reminderNote: string | null }>;
  };

  // Paso 1: abre WhatsApp (no envía) y pide confirmar si se envió.
  const openWhatsApp = () => {
    if (!modalCustomer) return;
    const phone = waPhone(modalCustomer.phone);
    const base = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
    window.open(`${base}?text=${encodeURIComponent(messageText)}`, '_blank');
    setConfirmSent(true);
  };

  // Paso 2: el usuario confirma que sí envió → sella la fecha/hora.
  const markSent = async () => {
    if (!modalCustomer) return;
    try {
      const r = await patchReminder(modalCustomer.customerId, { markSent: true });
      applyToCustomer(modalCustomer.customerId, { lastReminderAt: r.lastReminderAt });
    } catch { /* ignore */ }
    setModalCustomer(null);
  };

  const saveNote = async (customerId: string) => {
    const note = noteDrafts[customerId] ?? '';
    setSavingNote(customerId);
    try {
      const r = await patchReminder(customerId, { note });
      applyToCustomer(customerId, { reminderNote: r.reminderNote });
    } catch { /* ignore */ } finally {
      setSavingNote(null);
    }
  };

  return (
    <div className="p-3 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <MessageCircleWarning size={22} className="text-emerald-400" />
        <h1 className="text-xl font-semibold text-slate-100">Recordatorios por WhatsApp</h1>
      </div>
      <p className="text-sm text-slate-400 mb-5">
        Clientes con facturas <b>vencidas</b> o <b>próximas a vencer</b> (en los próximos {windowDays} días).
        Envía un recordatorio por WhatsApp con el detalle y los totales.
      </p>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
          <div className="text-xs text-slate-500 uppercase">Clientes</div>
          <div className="text-lg font-bold text-slate-100 tabular-nums">{totals.clientes}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
          <div className="text-xs text-slate-500 uppercase">Facturas vencidas</div>
          <div className="text-lg font-bold text-amber-400 tabular-nums">{totals.facturas}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
          <div className="text-xs text-slate-500 uppercase">Total vencido</div>
          <div className="text-lg font-bold text-red-400 tabular-nums">${fmt(totals.monto)}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
          <div className="text-xs text-slate-500 uppercase">Próximas a vencer</div>
          <div className="text-lg font-bold text-blue-400 tabular-nums">{totals.proximas}</div>
        </div>
      </div>

      {/* Buscador */}
      <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 mb-3">
        <Search size={16} className="text-slate-500 shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente o RIF…"
          className="flex-1 bg-transparent py-2.5 text-sm text-slate-100 outline-none"
        />
      </div>

      {/* Tabs por tipo de cliente, con contador */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {([
          { key: 'todos', label: 'Todos' },
          { key: 'clientes', label: 'Clientes' },
          { key: 'empleados', label: 'Empleados' },
          { key: 'grupo', label: 'Empresas del grupo' },
        ] as { key: TabKey; label: string }[]).map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                active
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200 font-medium'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700/70'
              }`}
            >
              {t.label}
              <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-xs tabular-nums ${
                active ? 'bg-emerald-500/30 text-emerald-100' : 'bg-slate-700 text-slate-300'
              }`}>
                {tabCounts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-slate-400 flex items-center gap-2 py-8 justify-center">
          <Loader2 className="animate-spin" size={18} /> Cargando…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-slate-500 py-10 border border-slate-800 rounded-xl bg-slate-900">
          {customers.length === 0
            ? '🎉 No hay clientes con facturas vencidas ni próximas a vencer.'
            : search
              ? 'Sin resultados para la búsqueda.'
              : 'No hay clientes en este filtro.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const isOpen = expanded.has(c.customerId);
            const hasPhone = !!waPhone(c.phone);
            return (
              <div key={c.customerId} className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  <button onClick={() => toggle(c.customerId)} className="shrink-0 text-slate-400 hover:text-slate-200">
                    {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </button>
                  <button onClick={() => toggle(c.customerId)} className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-slate-100 font-medium truncate">{c.name}</span>
                      {c.reminderNote && <StickyNote size={13} className="text-amber-400 shrink-0" aria-label="Tiene observación" />}
                    </div>
                    <div className="text-xs text-slate-500">
                      {c.rif ? `${c.documentType || ''}-${c.rif} · ` : ''}
                      {c.phone ? c.phone : <span className="text-red-400/80">sin teléfono</span>}
                    </div>
                    {c.lastReminderAt && (
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <Clock size={11} /> Último mensaje: {fmtDateTime(c.lastReminderAt)}
                      </div>
                    )}
                  </button>
                  <div className="text-right shrink-0">
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      {c.count > 0 && (
                        <span className="inline-flex items-center rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/25 px-2 py-0.5 text-xs font-medium">
                          {c.count} vencida{c.count !== 1 ? 's' : ''}
                        </span>
                      )}
                      {c.upcomingCount > 0 && (
                        <span className="inline-flex items-center rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/25 px-2 py-0.5 text-xs font-medium">
                          {c.upcomingCount} próxima{c.upcomingCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {c.count > 0 ? (
                      <div className="text-sm font-bold text-red-400 tabular-nums mt-0.5">${fmt(c.totalUsd)}</div>
                    ) : (
                      <div className="text-sm font-bold text-blue-400 tabular-nums mt-0.5">${fmt(c.upcomingTotalUsd)}</div>
                    )}
                  </div>
                  <button
                    onClick={() => openModal(c)}
                    disabled={!hasPhone}
                    title={hasPhone ? 'Enviar recordatorio por WhatsApp' : 'Este cliente no tiene teléfono registrado'}
                    className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    <WhatsAppIcon size={18} /><span className="hidden sm:inline">WhatsApp</span>
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-slate-800 bg-slate-950/40 px-3 py-2 space-y-3">
                    {/* Observación de cobranza (persistente) */}
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1 flex items-center gap-1">
                        <StickyNote size={12} /> Observación
                      </div>
                      <div className="flex gap-2 items-start">
                        <textarea
                          value={noteDrafts[c.customerId] ?? c.reminderNote ?? ''}
                          onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [c.customerId]: e.target.value }))}
                          rows={2}
                          placeholder="Ej: el cliente pidió que le recuerde mañana en la mañana…"
                          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-slate-100 outline-none resize-y"
                        />
                        <button
                          onClick={() => saveNote(c.customerId)}
                          disabled={savingNote === c.customerId || (noteDrafts[c.customerId] ?? c.reminderNote ?? '') === (c.reminderNote ?? '')}
                          className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm disabled:opacity-40"
                        >
                          {savingNote === c.customerId ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />} Guardar
                        </button>
                      </div>
                    </div>
                    {c.items.length > 0 && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-amber-400/80 font-medium mb-1">Vencidas</div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-slate-500 text-xs">
                              <th className="text-left font-medium py-1">Factura</th>
                              <th className="text-left font-medium py-1">Venció</th>
                              <th className="text-right font-medium py-1">Saldo USD</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.items.map((it) => (
                              <tr key={it.id} className="border-t border-slate-800/40">
                                <td className="py-1.5 font-mono text-slate-200 text-xs">{it.number}</td>
                                <td className="py-1.5 text-slate-400">{fmtDate(it.dueDate)}</td>
                                <td className="py-1.5 text-right text-slate-200 tabular-nums">${fmt(it.balanceUsd)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {c.upcoming.length > 0 && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-blue-400/80 font-medium mb-1">Próximas a vencer</div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-slate-500 text-xs">
                              <th className="text-left font-medium py-1">Factura</th>
                              <th className="text-left font-medium py-1">Vence</th>
                              <th className="text-right font-medium py-1">Saldo USD</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.upcoming.map((it) => (
                              <tr key={it.id} className="border-t border-slate-800/40">
                                <td className="py-1.5 font-mono text-slate-200 text-xs">{it.number}</td>
                                <td className="py-1.5 text-slate-400">
                                  {fmtDate(it.dueDate)} <span className="text-blue-400/80">({diasLabel(it.daysLeft)})</span>
                                </td>
                                <td className="py-1.5 text-right text-slate-200 tabular-nums">${fmt(it.balanceUsd)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: vista previa editable del mensaje */}
      {modalCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setModalCustomer(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <WhatsAppIcon size={18} className="text-emerald-400" />
                <h3 className="text-sm font-semibold text-slate-100">Mensaje para {modalCustomer.name}</h3>
              </div>
              <button onClick={() => setModalCustomer(null)} className="p-1 text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                <Phone size={13} />
                {waPhone(modalCustomer.phone)
                  ? <span>Se enviará a <b className="text-slate-200">+{waPhone(modalCustomer.phone)}</b></span>
                  : <span className="text-red-400">Sin teléfono válido — se abrirá WhatsApp sin destinatario.</span>}
              </div>
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={12}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-slate-100 outline-none resize-y font-mono"
              />
              <p className="text-xs text-slate-500 mt-2">Puedes editar el texto antes de abrir WhatsApp.</p>
            </div>
            {!confirmSent ? (
              <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-800">
                <button onClick={() => setModalCustomer(null)} className="px-3 py-2 rounded-lg border border-slate-600 text-slate-300 text-sm hover:bg-slate-800">Cancelar</button>
                <button onClick={openWhatsApp} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 text-sm font-medium">
                  <WhatsAppIcon size={16} /> Abrir WhatsApp
                </button>
              </div>
            ) : (
              // Paso 2: el botón solo ABRE WhatsApp; el envío lo hace el usuario. Confirmamos.
              <div className="px-4 py-3 border-t border-slate-800">
                <div className="text-sm text-slate-300 mb-2">Se abrió WhatsApp. ¿Enviaste el mensaje?</div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setModalCustomer(null)} className="px-3 py-2 rounded-lg border border-slate-600 text-slate-300 text-sm hover:bg-slate-800">Todavía no</button>
                  <button onClick={markSent} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium">
                    <Check size={15} /> Sí, marcar enviado
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
