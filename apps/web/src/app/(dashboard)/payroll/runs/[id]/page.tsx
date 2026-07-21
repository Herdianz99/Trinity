'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, Lock, Loader2, RefreshCw, Users, FileText, Files } from 'lucide-react';

interface Line {
  id: string;
  salaryBaseUsd: number;
  daysWorked: number;
  daysRest: number;
  overtimeDayHours: number;
  overtimeNightHours: number;
  manualDeductionUsd: number;
  creditDeductionBs: number;
  salaryBs: number;
  overtimeBs: number;
  grossBs: number;
  ivssBs: number;
  faovBs: number;
  totalDeductionsBs: number;
  netBs: number;
  netUsd: number;
  employee: { code: string | null; department: { name: string } | null; customerDebtUsd?: number; customer: { name: string } };
}

interface Run {
  id: string;
  number: string | null;
  type: string;
  periodFrom: string;
  periodTo: string;
  exchangeRate: number;
  rateDate: string | null;
  status: string;
  totalGrossBs: number;
  totalDeductionsBs: number;
  totalNetBs: number;
  lines: Line[];
}

const TYPE_LABEL: Record<string, string> = { WEEKLY: 'Semanal', BIWEEKLY: 'Quincenal' };
const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string) => new Date(s).toLocaleDateString('es-VE', { timeZone: 'UTC' });

// Campos capturables por el usuario
const INPUT_FIELDS = ['daysWorked', 'daysRest', 'overtimeDayHours', 'overtimeNightHours', 'manualDeductionUsd', 'creditDeductionBs'] as const;
type InputField = typeof INPUT_FIELDS[number];

export default function PayrollRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Popover de deducción de crédito por % de la deuda (por línea)
  const [pctOpen, setPctOpen] = useState<string | null>(null);
  const [pctVal, setPctVal] = useState('30');
  // Modal: preguntar si el recibo se genera con o sin horas extra. Guarda la URL base del PDF.
  const [otAsk, setOtAsk] = useState<string | null>(null);
  // Edición de la tasa: fecha de la tasa (editable) + tasa (editable). A veces la tasa se
  // registra al día siguiente, por eso la fecha es aparte del período.
  const [rateDateInput, setRateDateInput] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [savingRate, setSavingRate] = useState(false);
  const [rateHint, setRateHint] = useState<string | null>(null);

  function openReceipt(includeOvertime: boolean) {
    if (!otAsk) return;
    window.open(`${otAsk}?overtime=${includeOvertime}`, '_blank', 'noopener,noreferrer');
    setOtAsk(null);
  }

  const fetchRun = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/payroll-runs/${id}`);
      if (res.ok) setRun(await res.json());
    } catch { /* empty */ }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchRun(); }, [fetchRun]);
  useEffect(() => { if (run) document.title = `${run.number || 'Corrida'} | Trinity ERP`; }, [run]);
  // Sincroniza los campos editables de tasa con lo persistido cada vez que llega la corrida.
  useEffect(() => {
    if (run) {
      setRateDateInput(run.rateDate ? run.rateDate.slice(0, 10) : '');
      setRateInput(String(run.exchangeRate ?? ''));
      setRateHint(null);
    }
  }, [run]);

  const isDraft = run?.status === 'DRAFT';

  // Al cambiar la fecha de la tasa, trae la tasa registrada de ese día (editable después).
  async function onRateDateChange(date: string) {
    setRateDateInput(date);
    setRateHint(null);
    if (!date) return;
    try {
      const res = await fetch(`/api/proxy/exchange-rate/by-date?date=${date}`);
      const data = await res.json().catch(() => null);
      if (data && data.rate) {
        setRateInput(String(data.rate));
        setRateHint(`Tasa del ${fmtDate(date)}: ${fmt(data.rate)} Bs/$`);
      } else {
        setRateHint('No hay tasa registrada para ese día — ingrésala manualmente.');
      }
    } catch { /* empty */ }
  }

  async function handleSaveRate() {
    if (!run) return;
    const rateNum = Number(rateInput);
    if (!rateNum || rateNum <= 0) { setMessage({ type: 'error', text: 'La tasa debe ser mayor a 0' }); return; }
    setSavingRate(true); setMessage(null);
    try {
      const body: { exchangeRate: number; rateDate?: string } = { exchangeRate: rateNum };
      if (rateDateInput) body.rateDate = rateDateInput;
      const res = await fetch(`/api/proxy/payroll-runs/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message);
      setRun(data);
      setMessage({ type: 'success', text: 'Tasa actualizada y montos recalculados' });
    } catch (err: any) { setMessage({ type: 'error', text: err.message }); }
    setSavingRate(false);
  }

  function setLineInput(lineId: string, field: InputField, value: number) {
    setRun((r) => r ? { ...r, lines: r.lines.map((l) => l.id === lineId ? { ...l, [field]: value } : l) } : r);
  }

  // Aplica un % (o monto USD) de la deuda como deducción de crédito (en Bs), tope = deuda total.
  function applyCreditPct(lineId: string, debtUsd: number, pct: number) {
    if (!run) return;
    const usd = Math.min(debtUsd, Math.max(0, (debtUsd * pct) / 100));
    const bs = Math.round(usd * run.exchangeRate * 100) / 100;
    setLineInput(lineId, 'creditDeductionBs', bs);
    setPctOpen(null);
  }

  async function handleSave() {
    if (!run) return;
    setSaving(true); setMessage(null);
    try {
      const res = await fetch(`/api/proxy/payroll-runs/${id}/lines`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: run.lines.map((l) => ({
            id: l.id,
            daysWorked: l.daysWorked, daysRest: l.daysRest,
            overtimeDayHours: l.overtimeDayHours, overtimeNightHours: l.overtimeNightHours,
            manualDeductionUsd: l.manualDeductionUsd, creditDeductionBs: l.creditDeductionBs,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message);
      setRun(data);
      setMessage({ type: 'success', text: 'Cálculo actualizado' });
    } catch (err: any) { setMessage({ type: 'error', text: err.message }); }
    setSaving(false);
  }

  async function handleSync() {
    setSyncing(true); setMessage(null);
    try {
      const res = await fetch(`/api/proxy/payroll-runs/${id}/sync-employees`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message);
      setRun(data);
      setMessage({ type: 'success', text: 'Empleados sincronizados' });
    } catch (err: any) { setMessage({ type: 'error', text: err.message }); }
    setSyncing(false);
  }

  async function handleClose() {
    if (!confirm('¿Cerrar la corrida? No podrá editarse después.')) return;
    setClosing(true); setMessage(null);
    try {
      const res = await fetch(`/api/proxy/payroll-runs/${id}/close`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message);
      setRun(data);
      setMessage({ type: 'success', text: 'Corrida cerrada' });
    } catch (err: any) { setMessage({ type: 'error', text: err.message }); }
    setClosing(false);
  }

  if (loading) return <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-green-400" size={32} /></div>;
  if (!run) return <div className="text-center py-32 text-slate-500">Corrida no encontrada</div>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/payroll/runs')} className="p-2 rounded-lg border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"><ArrowLeft size={18} /></button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">{run.number}</h1>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${run.status === 'CLOSED' ? 'bg-slate-500/15 text-slate-300 border-slate-500/30' : 'bg-amber-500/15 text-amber-400 border-amber-500/30'}`}>{run.status === 'CLOSED' ? 'Cerrada' : 'Borrador'}</span>
            </div>
            <p className="text-sm text-slate-400">{TYPE_LABEL[run.type]} · {fmtDate(run.periodFrom)} — {fmtDate(run.periodTo)} · Tasa {fmt(run.exchangeRate)} Bs/$</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/proxy/payroll-runs/${id}/relation/pdf`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors">
            <FileText size={15} /> Relacion PDF
          </a>
          <button onClick={() => setOtAsk(`/api/proxy/payroll-runs/${id}/receipts/pdf`)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors">
            <Files size={15} /> Recibos PDF
          </button>
          {isDraft && (
            <>
              <button onClick={handleSync} disabled={syncing} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors disabled:opacity-50">
                {syncing ? <Loader2 className="animate-spin" size={15} /> : <Users size={15} />} Sincronizar
              </button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} Guardar y recalcular
              </button>
              <button onClick={handleClose} disabled={closing} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50">
                {closing ? <Loader2 className="animate-spin" size={15} /> : <Lock size={15} />} Cerrar corrida
              </button>
            </>
          )}
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>{message.text}</div>
      )}

      {/* Tasa de cambio (editable) — la fecha es aparte del período porque a veces la tasa se registra al día siguiente */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1">Fecha de la tasa</label>
          <input
            type="date" value={rateDateInput} disabled={!isDraft}
            onChange={(e) => onRateDateChange(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-green-500 disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1">Tasa (Bs/$)</label>
          <input
            type="number" min={0} step="any" value={rateInput} disabled={!isDraft}
            onChange={(e) => setRateInput(e.target.value)}
            className="w-32 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-right font-mono text-slate-100 focus:outline-none focus:border-green-500 disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>
        {isDraft && (
          <button
            onClick={handleSaveRate} disabled={savingRate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {savingRate ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} Aplicar tasa
          </button>
        )}
        <p className="text-[11px] text-slate-500 flex-1 min-w-[220px] self-center">
          {rateHint || (isDraft
            ? 'Al cambiar la fecha se trae la tasa de ese día; puedes ajustarla. Se recalculan todos los montos en Bs.'
            : 'La corrida está cerrada; la tasa no se puede editar.')}
        </p>
      </div>

      {isDraft && (
        <p className="text-xs text-slate-500 flex items-center gap-1.5"><RefreshCw size={13} /> Las columnas calculadas se actualizan al pulsar <span className="text-slate-300">Guardar y recalcular</span>.</p>
      )}

      {/* Table */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto h-[calc(100vh-190px)] overflow-y-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-800">
                <Th className="text-left sticky left-0 bg-slate-800">Empleado</Th>
                <Th>Días<br/>trab.</Th>
                <Th>Días<br/>desc.</Th>
                <Th>HE<br/>diurnas</Th>
                <Th>HE<br/>noct.</Th>
                <Th>Deduc.<br/>USD</Th>
                <Th>Deduc.<br/>créd. Bs</Th>
                <Th className="text-right bg-slate-800/60">Salario<br/>Bs</Th>
                <Th className="text-right bg-slate-800/60">HE Bs</Th>
                <Th className="text-right bg-slate-800/60">Bruto<br/>Bs</Th>
                <Th className="text-right bg-slate-800/60">Deduc.<br/>Bs</Th>
                <Th className="text-right bg-slate-800/60">Neto Bs</Th>
                <Th className="text-right bg-slate-800/60">Neto<br/>USD</Th>
                <Th className="bg-slate-800/60"></Th>
              </tr>
            </thead>
            <tbody>
              {run.lines.map((l) => (
                <tr key={l.id} className="border-t border-slate-700/30 hover:bg-slate-800/30">
                  <td className={`px-3 py-2 sticky left-0 bg-slate-900/95 ${pctOpen === l.id ? 'z-40' : ''}`}>
                    <div className="font-medium text-slate-200">{l.employee.customer.name}</div>
                    <div className="text-[10px] text-slate-500">{l.employee.code} · {l.employee.department?.name || 's/depto'} · ${fmt(l.salaryBaseUsd)}</div>
                    {(l.employee.customerDebtUsd ?? 0) > 0.01 && (
                      <div className="relative text-[10px] text-amber-400/90 flex items-center gap-1.5">
                        Deuda CxC: ${fmt(l.employee.customerDebtUsd!)}
                        {isDraft && (
                          <>
                            <button
                              type="button"
                              onClick={() => { setPctOpen(pctOpen === l.id ? null : l.id); setPctVal('30'); }}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 transition-colors"
                              title="Descontar parte de la deuda"
                            >descontar…</button>
                            <button
                              type="button"
                              onClick={() => applyCreditPct(l.id, l.employee.customerDebtUsd!, 100)}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 transition-colors"
                              title="Descontar el total de la deuda"
                            >todo</button>
                          </>
                        )}
                        {pctOpen === l.id && (
                          <div className="absolute top-5 left-0 z-50 w-52 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-2.5 text-slate-200 font-sans">
                            <div className="text-[11px] font-medium mb-1.5">Descontar de ${fmt(l.employee.customerDebtUsd!)}</div>
                            <div className="flex gap-1 mb-2">
                              {[25, 50, 75, 100].map((p) => (
                                <button key={p} type="button" onClick={() => setPctVal(String(p))}
                                  className={`flex-1 text-[10px] py-0.5 rounded ${Number(pctVal) === p ? 'bg-amber-500/30 text-amber-200' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>{p}%</button>
                              ))}
                            </div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <input type="number" min={0} max={100} value={pctVal}
                                onChange={(e) => setPctVal(e.target.value)}
                                className="w-14 bg-slate-900 border border-slate-600 rounded px-1.5 py-1 text-right text-xs font-mono focus:outline-none focus:border-amber-500" />
                              <span className="text-[11px] text-slate-400">% de la deuda</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mb-2">
                              = ${fmt(Math.min(l.employee.customerDebtUsd!, (l.employee.customerDebtUsd! * (Number(pctVal) || 0)) / 100))}
                              {' '}({fmt(Math.round(Math.min(l.employee.customerDebtUsd!, (l.employee.customerDebtUsd! * (Number(pctVal) || 0)) / 100) * run.exchangeRate * 100) / 100)} Bs)
                            </div>
                            <div className="flex gap-1.5">
                              <button type="button" onClick={() => applyCreditPct(l.id, l.employee.customerDebtUsd!, Number(pctVal) || 0)}
                                className="flex-1 text-[11px] py-1 rounded bg-amber-600 hover:bg-amber-500 text-white transition-colors">Aplicar</button>
                              <button type="button" onClick={() => setPctOpen(null)}
                                className="px-2 text-[11px] py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">Cancelar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  {INPUT_FIELDS.map((f) => (
                    <td key={f} className="px-1.5 py-1.5">
                      <input
                        type="number" min={0} step="any" disabled={!isDraft}
                        value={l[f] === 0 ? '' : l[f]}
                        onChange={(e) => setLineInput(l.id, f, Number(e.target.value) || 0)}
                        placeholder="0"
                        className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-right text-slate-100 font-mono text-xs focus:outline-none focus:border-green-500 disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </td>
                  ))}
                  <Td>{fmt(l.salaryBs)}</Td>
                  <Td>{fmt(l.overtimeBs)}</Td>
                  <Td className="text-slate-200">{fmt(l.grossBs)}</Td>
                  <Td className="text-red-300">{fmt(l.totalDeductionsBs)}</Td>
                  <Td className="text-green-300 font-semibold">{fmt(l.netBs)}</Td>
                  <Td>${fmt(l.netUsd)}</Td>
                  <td className="px-2 py-2 text-center">
                    <button onClick={() => setOtAsk(`/api/proxy/payroll-runs/${id}/receipt/${l.id}/pdf`)} className="inline-flex p-1 rounded text-slate-400 hover:text-green-400 hover:bg-green-500/10 transition-colors" title="Recibo PDF">
                      <FileText size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0">
              <tr className="bg-slate-800 border-t-2 border-slate-600 font-semibold">
                <td className="px-3 py-2.5 sticky left-0 bg-slate-800 text-slate-300">TOTALES ({run.lines.length})</td>
                <td colSpan={6}></td>
                <td colSpan={2}></td>
                <Td className="text-slate-100">{fmt(run.totalGrossBs)}</Td>
                <Td className="text-red-300">{fmt(run.totalDeductionsBs)}</Td>
                <Td className="text-green-300">{fmt(run.totalNetBs)}</Td>
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Preguntar: recibo con o sin horas extra */}
      {otAsk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOtAsk(null)} />
          <div className="relative bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-lg font-bold text-white mb-1">Generar recibo</h2>
            <p className="text-sm text-slate-400 mb-5">¿Deseas incluir las horas extra en el recibo?</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => openReceipt(true)} className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
                Con horas extra
              </button>
              <button onClick={() => openReceipt(false)} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
                Sin horas extra
              </button>
              <button onClick={() => setOtAsk(null)} className="w-full text-slate-400 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-2.5 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide align-bottom ${className.includes('text-') ? '' : 'text-center'} ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 text-right font-mono text-slate-300 ${className}`}>{children}</td>;
}
