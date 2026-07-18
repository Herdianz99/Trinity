'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Plus, X, Loader2, Trash2, ChevronRight } from 'lucide-react';
import MoneyInput from '@/components/money-input';

interface PayrollRun {
  id: string;
  number: string | null;
  type: string;
  periodFrom: string;
  periodTo: string;
  exchangeRate: number;
  status: string;
  totalGrossBs: number;
  totalDeductionsBs: number;
  totalNetBs: number;
  _count?: { lines: number };
}

const TYPE_LABEL: Record<string, string> = { WEEKLY: 'Semanal', BIWEEKLY: 'Quincenal' };
const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string) => new Date(s).toLocaleDateString('es-VE', { timeZone: 'UTC' });

export default function PayrollRunsPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [type, setType] = useState('WEEKLY');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [rate, setRate] = useState(0);
  const [useCustomRate, setUseCustomRate] = useState(false);
  const [todayRate, setTodayRate] = useState(0);
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/payroll-runs');
      if (res.ok) setRuns(await res.json());
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { document.title = 'Corridas de Nomina | Trinity ERP'; }, []);
  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  async function openCreate() {
    setType('WEEKLY'); setPeriodFrom(''); setPeriodTo(''); setUseCustomRate(false); setFormError('');
    setShowCreate(true);
    try {
      const res = await fetch('/api/proxy/exchange-rate/today');
      if (res.ok) { const d = await res.json(); setTodayRate(d.rate || 0); setRate(d.rate || 0); }
    } catch { /* empty */ }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!periodFrom || !periodTo) { setFormError('Indique el rango del período'); return; }
    if (periodTo < periodFrom) { setFormError('La fecha final no puede ser anterior a la inicial'); return; }
    setCreating(true);
    try {
      const body: any = { type, periodFrom, periodTo };
      if (useCustomRate && rate > 0) body.exchangeRate = rate;
      const res = await fetch('/api/proxy/payroll-runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message);
      router.push(`/payroll/runs/${data.id}`);
    } catch (err: any) { setFormError(err.message); setCreating(false); }
  }

  async function handleDelete(run: PayrollRun) {
    if (!confirm(`¿Eliminar la corrida ${run.number}? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/proxy/payroll-runs/${run.id}`, { method: 'DELETE' });
      if (res.ok) fetchRuns();
    } catch { /* empty */ }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <ClipboardList size={22} className="text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Corridas de Nomina</h1>
            <p className="text-sm text-slate-400">Cálculo de nómina por período</p>
          </div>
        </div>
        <button onClick={openCreate} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          <Plus size={18} /> Nueva corrida
        </button>
      </div>

      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-800/80">
                {['N°', 'Tipo', 'Período', 'Tasa', 'Empleados', 'Neto Bs', 'Estado', ''].map((h, i) => (
                  <th key={i} className={`text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 ${i >= 4 && i <= 5 ? 'text-right' : i === 6 || i === 7 ? 'text-center' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-500">Cargando...</td></tr>
              ) : runs.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-500">No hay corridas registradas</td></tr>
              ) : runs.map((run) => (
                <tr key={run.id} onClick={() => router.push(`/payroll/runs/${run.id}`)} className="border-t border-slate-700/30 hover:bg-slate-800/40 transition-colors cursor-pointer">
                  <td className="px-4 py-3 text-sm text-slate-200 font-mono">{run.number}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{TYPE_LABEL[run.type] || run.type}</td>
                  <td className="px-4 py-3 text-sm text-slate-300 whitespace-nowrap">{fmtDate(run.periodFrom)} — {fmtDate(run.periodTo)}</td>
                  <td className="px-4 py-3 text-sm text-slate-400 font-mono">{fmt(run.exchangeRate)}</td>
                  <td className="px-4 py-3 text-sm text-slate-300 text-right">{run._count?.lines ?? 0}</td>
                  <td className="px-4 py-3 text-sm text-white text-right font-mono">{fmt(run.totalNetBs)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${
                      run.status === 'CLOSED' ? 'bg-slate-500/15 text-slate-300 border-slate-500/30' : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    }`}>{run.status === 'CLOSED' ? 'Cerrada' : 'Borrador'}</span>
                  </td>
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      {run.status === 'DRAFT' && (
                        <button onClick={() => handleDelete(run)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Eliminar"><Trash2 size={16} /></button>
                      )}
                      <ChevronRight size={16} className="text-slate-600" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !creating && setShowCreate(false)} />
          <div className="relative bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Nueva corrida</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              {formError && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{formError}</div>}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Frecuencia</label>
                <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                  <option value="WEEKLY">Semanal</option>
                  <option value="BIWEEKLY">Quincenal</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Desde</label>
                  <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} required className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Hasta</label>
                  <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} required className={inputCls} />
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm text-slate-300 mb-1.5">
                  <input type="checkbox" checked={useCustomRate} onChange={(e) => setUseCustomRate(e.target.checked)} className="accent-green-500" />
                  Usar tasa manual
                </label>
                {useCustomRate ? (
                  <MoneyInput value={rate} onValueChange={setRate} className={`${inputCls} font-mono`} />
                ) : (
                  <p className="text-xs text-slate-500">Se usará la tasa de hoy: <span className="text-slate-300 font-mono">{fmt(todayRate)} Bs/$</span></p>
                )}
              </div>
              <p className="text-xs text-slate-500">Se cargarán automáticamente los empleados activos de la frecuencia elegida.</p>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors">Cancelar</button>
                <button type="submit" disabled={creating} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2">
                  {creating ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Crear corrida
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500';
