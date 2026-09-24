'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Bell, CreditCard, Receipt, AlertTriangle, FileDown, Wallet, Phone, Mail, MapPin,
  Building2, Briefcase, CalendarClock, Check, X, BadgeCheck, IdCard, Landmark, Loader2,
} from 'lucide-react';

/* ---------- helpers ---------- */
const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-VE') : '—');
const fmtDateTime = (s: string | null) => (s ? new Date(s).toLocaleString('es-VE') : '—');
const FRECUENCIA: Record<string, string> = { WEEKLY: 'Semanal', BIWEEKLY: 'Quincenal', MONTHLY: 'Mensual' };
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

const levelStyle: Record<string, string> = {
  LLAMADO: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
  NOTIFICACION: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
  AMONESTACION: 'bg-red-500/15 text-red-300 border-red-500/25',
};
const statusStyle: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-300', PARTIAL: 'bg-blue-500/15 text-blue-300',
  OVERDUE: 'bg-red-500/15 text-red-300', PAID: 'bg-green-500/15 text-green-300',
};

/* ---------- types ---------- */
interface Perfil {
  code: string | null; bank: string | null; frequency: string;
  department: { name: string } | null; position: { name: string } | null;
  customer: { name: string; documentType: string; rif: string | null; phone: string | null; email: string | null; address: string | null; creditLimit: number; creditDays: number; code: string | null };
}
interface Resumen { saldoCxcUsd: number; facturasPendientes: number; notificacionesPendientes: number; }
interface Cxc { id: string; number: string; documentNumber: string | null; amountUsd: number; paidAmountUsd: number; saldoUsd: number; dueDate: string | null; status: string; }
interface Factura { id: string; number: string; fiscalNumber: string | null; status: string; totalUsd: number; totalPaidUsd: number; saldoUsd: number; createdAt: string; }
interface Recibo { id: string; grossBs: number; totalDeductionsBs: number; netBs: number; creditDeductionBs: number; payrollRun: { number: string; periodFrom: string; periodTo: string; type: string }; }
interface Amonestacion { id: string; number: string; level: string; occurredAt: string; reason: string; faultType: { name: string }; }
interface Notif { id: string; ackState: 'PENDIENTE' | 'RECIBIDO' | 'RECHAZADO'; comment: string | null; ackAt: string | null; notification: { title: string; body: string; type: string; createdAt: string; createdBy: { name: string } }; }

async function getJson(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'No disponible');
  return r.json();
}

/* ---------- small UI atoms ---------- */
function Reveal({ i, children }: { i: number; children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 60 + i * 70); return () => clearTimeout(t); }, [i]);
  return (
    <div className="transition-all duration-500 ease-out" style={{ opacity: on ? 1 : 0, transform: on ? 'translateY(0)' : 'translateY(12px)' }}>
      {children}
    </div>
  );
}

function Kpi({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: React.ReactNode; accent: string }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`p-2.5 rounded-xl ${accent}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-slate-400 truncate">{label}</div>
        <div className="text-xl font-bold text-white font-mono truncate">{value}</div>
      </div>
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="text-slate-500 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-sm text-slate-200 break-words">{value || '—'}</div>
      </div>
    </div>
  );
}

/* ---------- page ---------- */
type Tab = 'notificaciones' | 'cxc' | 'facturas' | 'recibos' | 'amonestaciones';

export default function MiPerfilPage() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cxc, setCxc] = useState<Cxc[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [amonestaciones, setAmonestaciones] = useState<Amonestacion[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('notificaciones');
  const [comments, setComments] = useState<Record<string, string>>({});
  const [savingAck, setSavingAck] = useState<string | null>(null);

  useEffect(() => { document.title = 'Mi Perfil | Trinity ERP'; }, []);

  async function loadNotifs() { setNotifs(await getJson('/api/proxy/notifications/me/inbox')); }

  async function loadAll() {
    setLoading(true);
    try {
      const [p, r] = await Promise.all([getJson('/api/proxy/me/perfil'), getJson('/api/proxy/me/resumen')]);
      setPerfil(p); setResumen(r);
      // el resto en paralelo, sin bloquear el encabezado
      const [c, f, re, a, n] = await Promise.all([
        getJson('/api/proxy/me/cxc').catch(() => []),
        getJson('/api/proxy/me/facturas').catch(() => []),
        getJson('/api/proxy/me/recibos').catch(() => []),
        getJson('/api/proxy/me/amonestaciones').catch(() => []),
        getJson('/api/proxy/notifications/me/inbox').catch(() => []),
      ]);
      setCxc(c); setFacturas(f); setRecibos(re); setAmonestaciones(a); setNotifs(n);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { loadAll(); }, []);

  const pendientes = useMemo(() => notifs.filter((n) => n.ackState === 'PENDIENTE').length, [notifs]);

  // arranca en la pestaña con algo accionable
  useEffect(() => {
    if (!loading) setTab(pendientes > 0 ? 'notificaciones' : cxc.length ? 'cxc' : 'recibos');
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ack(id: string, ackState: 'RECIBIDO' | 'RECHAZADO') {
    setSavingAck(id);
    try {
      const r = await fetch(`/api/proxy/notifications/me/${id}/ack`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ackState, comment: comments[id] || undefined }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Error');
      await Promise.all([loadNotifs(), getJson('/api/proxy/me/resumen').then(setResumen)]);
    } catch (e: any) { alert(e.message); } finally { setSavingAck(null); }
  }

  if (loading) return <div className="py-24 flex items-center justify-center text-slate-400 gap-2"><Loader2 className="animate-spin" size={18} /> Cargando tu perfil…</div>;
  if (error) return (
    <div className="max-w-md mx-auto py-24 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center mb-4"><IdCard className="text-slate-500" size={26} /></div>
      <p className="text-slate-300 font-medium">Portal no disponible</p>
      <p className="text-slate-500 text-sm mt-1">{error}</p>
    </div>
  );
  if (!perfil || !resumen) return null;

  const c = perfil.customer;
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'notificaciones', label: 'Notificaciones', count: pendientes },
    { key: 'cxc', label: 'Cuentas por cobrar', count: cxc.length },
    { key: 'facturas', label: 'Facturas', count: facturas.length },
    { key: 'recibos', label: 'Recibos', count: recibos.length },
    { key: 'amonestaciones', label: 'Amonestaciones', count: amonestaciones.length },
  ];

  return (
    <div className="space-y-5 max-w-6xl">
      {/* HERO */}
      <Reveal i={0}>
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-gradient-to-br from-emerald-600/15 via-slate-800/40 to-slate-900/40 backdrop-blur-sm p-6">
          <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-emerald-900/40 shrink-0">
              {initials(c.name)}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold text-white truncate">{c.name}</h1>
              <p className="text-slate-300 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {perfil.position?.name && <span className="inline-flex items-center gap-1.5"><Briefcase size={14} className="text-emerald-400" />{perfil.position.name}</span>}
                {perfil.department?.name && <span className="inline-flex items-center gap-1.5"><Building2 size={14} className="text-emerald-400" />{perfil.department.name}</span>}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {perfil.code && <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800/70 border border-slate-700 text-slate-300">Empleado {perfil.code}</span>}
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800/70 border border-slate-700 text-slate-300">Doc: {c.documentType}-{c.rif ?? '—'}</span>
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800/70 border border-slate-700 text-slate-300">Pago {FRECUENCIA[perfil.frequency] || perfil.frequency}</span>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {/* KPIs */}
      <Reveal i={1}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi icon={<Wallet size={18} className="text-emerald-400" />} accent="bg-emerald-500/10" label="Límite de crédito" value={`$ ${fmt(c.creditLimit)}`} />
          <Kpi icon={<CreditCard size={18} className="text-blue-400" />} accent="bg-blue-500/10" label="Saldo por cobrar" value={`$ ${fmt(resumen.saldoCxcUsd)}`} />
          <Kpi icon={<Receipt size={18} className="text-amber-400" />} accent="bg-amber-500/10" label="Facturas pendientes" value={resumen.facturasPendientes} />
          <Kpi icon={<Bell size={18} className="text-rose-400" />} accent="bg-rose-500/10" label="Notif. pendientes" value={resumen.notificacionesPendientes} />
        </div>
      </Reveal>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* DATOS */}
        <Reveal i={2}>
          <div className="card p-5 lg:sticky lg:top-4">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><IdCard size={16} className="text-emerald-400" /> Mis datos</h2>
            <div className="space-y-3.5">
              <Info icon={<Phone size={15} />} label="Teléfono" value={c.phone} />
              <Info icon={<Mail size={15} />} label="Correo" value={c.email} />
              <Info icon={<MapPin size={15} />} label="Dirección" value={c.address} />
              <Info icon={<Landmark size={15} />} label="Banco" value={perfil.bank} />
              <Info icon={<CalendarClock size={15} />} label="Días de crédito" value={c.creditDays} />
            </div>
            <p className="mt-4 text-[11px] text-slate-500 border-t border-slate-700/50 pt-3">Si algún dato está incorrecto, contacta a Recursos Humanos.</p>
          </div>
        </Reveal>

        {/* PANEL CON PESTAÑAS */}
        <Reveal i={3}>
          <div className="lg:col-span-2 card p-0 overflow-hidden">
            <div className="flex gap-1 p-1.5 border-b border-slate-700/50 overflow-x-auto">
              {tabs.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2 ${tab === t.key ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'}`}>
                  {t.label}
                  {t.count ? <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === t.key ? 'bg-white/20' : 'bg-slate-700 text-slate-300'}`}>{t.count}</span> : null}
                </button>
              ))}
            </div>

            <div className="p-4">
              {/* NOTIFICACIONES */}
              {tab === 'notificaciones' && (
                <div className="space-y-3">
                  {notifs.map((it) => (
                    <div key={it.id} className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-100">{it.notification.title}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300 shrink-0">{it.notification.type}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">{it.notification.createdBy?.name} · {fmtDateTime(it.notification.createdAt)}</div>
                      <p className="text-sm text-slate-300 mt-2 whitespace-pre-wrap">{it.notification.body}</p>
                      {it.ackState === 'PENDIENTE' ? (
                        <div className="mt-3">
                          <textarea value={comments[it.id] || ''} onChange={(e) => setComments({ ...comments, [it.id]: e.target.value })}
                            placeholder="Comentario (opcional)" rows={2}
                            className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm" />
                          <div className="flex gap-2 mt-2">
                            <button disabled={savingAck === it.id} onClick={() => ack(it.id, 'RECIBIDO')} className="btn-primary !px-4 !py-2 text-sm flex items-center gap-1.5 disabled:opacity-50"><Check size={15} /> Enterado</button>
                            <button disabled={savingAck === it.id} onClick={() => ack(it.id, 'RECHAZADO')} className="btn-secondary !px-4 !py-2 text-sm flex items-center gap-1.5 disabled:opacity-50"><X size={15} /> En desacuerdo</button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 text-xs flex items-center gap-1.5">
                          <BadgeCheck size={14} className={it.ackState === 'RECIBIDO' ? 'text-emerald-400' : 'text-red-400'} />
                          <span className={it.ackState === 'RECIBIDO' ? 'text-emerald-400' : 'text-red-400'}>{it.ackState === 'RECIBIDO' ? 'Enterado' : 'En desacuerdo'}</span>
                          <span className="text-slate-500">· {fmtDateTime(it.ackAt)}</span>
                          {it.comment && <span className="text-slate-400">— “{it.comment}”</span>}
                        </div>
                      )}
                    </div>
                  ))}
                  {notifs.length === 0 && <Empty text="No tienes notificaciones." />}
                </div>
              )}

              {/* CXC */}
              {tab === 'cxc' && (cxc.length ? (
                <Table head={['Documento', 'Vence', 'Monto', 'Saldo', 'Estado']}>
                  {cxc.map((r) => (
                    <tr key={r.id} className="border-b border-slate-700/30 last:border-0">
                      <td className="px-3 py-2.5 text-slate-200">{r.documentNumber || r.number}</td>
                      <td className="px-3 py-2.5 text-slate-400">{fmtDate(r.dueDate)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-300">$ {fmt(r.amountUsd)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-white">$ {fmt(r.saldoUsd)}</td>
                      <td className="px-3 py-2.5 text-center"><Pill cls={statusStyle[r.status]}>{r.status}</Pill></td>
                    </tr>
                  ))}
                </Table>
              ) : <Empty text="No tienes cuentas por cobrar." />)}

              {/* FACTURAS */}
              {tab === 'facturas' && (facturas.length ? (
                <Table head={['Número', 'Fecha', 'Total', 'Saldo', 'Estado']}>
                  {facturas.map((f) => (
                    <tr key={f.id} className="border-b border-slate-700/30 last:border-0">
                      <td className="px-3 py-2.5 text-slate-200">{f.fiscalNumber || f.number}</td>
                      <td className="px-3 py-2.5 text-slate-400">{fmtDate(f.createdAt)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-300">$ {fmt(f.totalUsd)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-white">$ {fmt(f.saldoUsd)}</td>
                      <td className="px-3 py-2.5 text-center"><Pill cls={statusStyle[f.status]}>{f.status}</Pill></td>
                    </tr>
                  ))}
                </Table>
              ) : <Empty text="No tienes facturas." />)}

              {/* RECIBOS */}
              {tab === 'recibos' && (recibos.length ? (
                <Table head={['Período', 'Bruto Bs', 'Abono deuda', 'Neto Bs', 'PDF']}>
                  {recibos.map((r) => (
                    <tr key={r.id} className="border-b border-slate-700/30 last:border-0">
                      <td className="px-3 py-2.5 text-slate-200">{fmtDate(r.payrollRun.periodFrom)} – {fmtDate(r.payrollRun.periodTo)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-300">{fmt(r.grossBs)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-amber-300">{fmt(r.creditDeductionBs)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-white">{fmt(r.netBs)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <a href={`/api/proxy/me/recibos/${r.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-400 hover:underline"><FileDown size={14} /> PDF</a>
                      </td>
                    </tr>
                  ))}
                </Table>
              ) : <Empty text="No tienes recibos de nómina disponibles." />)}

              {/* AMONESTACIONES */}
              {tab === 'amonestaciones' && (amonestaciones.length ? (
                <div className="space-y-3">
                  {amonestaciones.map((a) => (
                    <div key={a.id} className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-100">{a.faultType.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${levelStyle[a.level] || 'bg-slate-500/15 text-slate-400 border-slate-500/20'}`}>{a.level}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">{a.number} · {fmtDate(a.occurredAt)}</div>
                      <p className="text-sm text-slate-300 mt-2">{a.reason}</p>
                    </div>
                  ))}
                </div>
              ) : <Empty text="No tienes amonestaciones. ¡Bien!" />)}
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

/* ---------- table / pill / empty ---------- */
function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-400 border-b border-slate-700/50">
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-2 font-medium ${i === 0 ? 'text-left' : i === head.length - 1 ? 'text-center' : 'text-right'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Pill({ cls, children }: { cls?: string; children: React.ReactNode }) {
  return <span className={`text-[10px] px-2 py-0.5 rounded-full ${cls || 'bg-slate-700/60 text-slate-300'}`}>{children}</span>;
}
function Empty({ text }: { text: string }) {
  return <div className="text-center py-12 text-slate-500 text-sm">{text}</div>;
}
