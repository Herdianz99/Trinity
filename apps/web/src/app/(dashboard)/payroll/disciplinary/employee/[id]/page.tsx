'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Trash2, FileText, User } from 'lucide-react';

const STEPS = ['LLAMADO', 'NOTIFICACION', 'AMONESTACION'];
const STEP_LABEL: Record<string, string> = { LLAMADO: 'Llamado', NOTIFICACION: 'Notificación', AMONESTACION: 'Amonestación' };
const LEVEL_CLS: Record<string, string> = {
  LLAMADO: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  NOTIFICACION: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  AMONESTACION: 'bg-red-500/10 text-red-400 border-red-500/30',
};

interface Action { id: string; number: string; sequence: number; level: string; occurredAt: string; reason: string; photos: { id: string; thumbUrl: string; mediumUrl: string }[]; }
interface Thread { faultType: { id: string; name: string }; count: number; maxLevel: string; actions: Action[]; }
interface Data { employee: { id: string; code: string | null; customer: { name: string; rif: string | null; documentType: string | null }; position?: { name: string }; department?: { name: string } }; threads: Thread[]; }

export default function EmployeeDisciplinaryPage() {
  const params = useParams();
  const employeeId = params.id as string;
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/disciplinary/by-employee/${employeeId}`);
      if (!res.ok) throw new Error('Error al cargar');
      setData(await res.json());
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar el historial' });
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    if (data) document.title = `Amonestaciones — ${data.employee.customer.name} | Trinity ERP`;
  }, [data]);
  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 4000); return () => clearTimeout(t); }
  }, [message]);

  async function deleteLast(action: Action) {
    if (!confirm(`¿Eliminar el último llamado (${action.number} — ${STEP_LABEL[action.level]})? Esta acción baja el hilo un escalón.`)) return;
    try {
      const res = await fetch(`/api/proxy/disciplinary/${action.id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Error'); }
      setMessage({ type: 'success', text: 'Llamado eliminado' });
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  if (loading) return <div className="p-12 text-center"><Loader2 className="animate-spin inline-block text-slate-500" size={28} /></div>;
  if (!data) return <div className="p-12 text-center text-slate-500">No encontrado</div>;

  const cust = data.employee.customer;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Link href="/payroll/disciplinary" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft size={16} /> Volver a amonestaciones
      </Link>

      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20"><User className="text-blue-400" size={22} /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-100">{cust.name}</h1>
          <p className="text-sm text-slate-400">
            {cust.documentType || 'V'}-{cust.rif || '—'}
            {data.employee.position?.name ? ` · ${data.employee.position.name}` : ''}
            {data.employee.department?.name ? ` · ${data.employee.department.name}` : ''}
          </p>
        </div>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-xl border text-sm font-medium ${message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
          {message.text}
        </div>
      )}

      {data.threads.length === 0 ? (
        <div className="p-12 text-center text-slate-500 rounded-xl border border-slate-700/50">Este empleado no tiene llamados registrados.</div>
      ) : (
        <div className="space-y-5">
          {data.threads.map((th) => {
            const reached = STEPS.indexOf(th.maxLevel); // 0,1,2
            const last = th.actions[th.actions.length - 1];
            return (
              <div key={th.faultType.id} className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-100">{th.faultType.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${LEVEL_CLS[th.maxLevel]}`}>{STEP_LABEL[th.maxLevel]}</span>
                </div>

                {/* Stepper */}
                <div className="flex items-center gap-2 mb-4">
                  {STEPS.map((s, i) => (
                    <div key={s} className="flex items-center gap-2 flex-1">
                      <div className={`flex items-center gap-1.5 ${i <= reached ? 'text-slate-100' : 'text-slate-600'}`}>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${i <= reached ? LEVEL_CLS[s] : 'border-slate-700 text-slate-600'}`}>{i + 1}</span>
                        <span className="text-xs font-medium">{STEP_LABEL[s]}</span>
                      </div>
                      {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 ${i < reached ? 'bg-slate-500' : 'bg-slate-700'}`} />}
                    </div>
                  ))}
                </div>

                {/* Eventos del hilo */}
                <div className="space-y-2">
                  {th.actions.map((a) => (
                    <div key={a.id} className="flex items-start justify-between gap-3 px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-700/30">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-slate-400">{a.number}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${LEVEL_CLS[a.level]}`}>{STEP_LABEL[a.level]}</span>
                          <span className="text-xs text-slate-500">{new Date(a.occurredAt).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' })}</span>
                        </div>
                        <p className="text-sm text-slate-300 mt-1">{a.reason}</p>
                        {a.photos.length > 0 && (
                          <div className="flex gap-1.5 mt-1.5">
                            {a.photos.map((p) => (
                              <a key={p.id} href={p.mediumUrl} target="_blank" rel="noreferrer">
                                <img src={p.thumbUrl} alt="" className="w-10 h-10 object-cover rounded border border-slate-700" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <a href={`/api/proxy/disciplinary/${a.id}/pdf`} target="_blank" rel="noreferrer"
                          className="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-blue-400" title="Acta PDF"><FileText size={14} /></a>
                        {a.id === last.id && (
                          <button onClick={() => deleteLast(a)}
                            className="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-red-400" title="Eliminar (solo el último)"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
