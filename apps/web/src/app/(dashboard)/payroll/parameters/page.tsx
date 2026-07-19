'use client';

import { useState, useEffect } from 'react';
import { SlidersHorizontal, Save, Loader2 } from 'lucide-react';
import MoneyInput from '@/components/money-input';

interface PayrollParam {
  ivssBs: number;
  faovBs: number;
  incesBs: number;
  otDayFactor: number;
  otNightFactor: number;
  monthDays: number;
  weeklyHours: number;
}

const DEFAULTS: PayrollParam = {
  ivssBs: 0, faovBs: 0, incesBs: 0,
  otDayFactor: 1.5, otNightFactor: 1.3, monthDays: 30, weeklyHours: 40,
};

export default function PayrollParametersPage() {
  const [params, setParams] = useState<PayrollParam>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => { document.title = 'Parametros de Nomina | Trinity ERP'; }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/proxy/payroll-params');
        if (res.ok) {
          const data = await res.json();
          setParams({
            ivssBs: data.ivssBs ?? 0,
            faovBs: data.faovBs ?? 0,
            incesBs: data.incesBs ?? 0,
            otDayFactor: data.otDayFactor ?? 1.5,
            otNightFactor: data.otNightFactor ?? 1.3,
            monthDays: data.monthDays ?? 30,
            weeklyHours: data.weeklyHours ?? 40,
          });
        }
      } catch { /* empty */ }
      setLoading(false);
    })();
  }, []);

  const set = (k: keyof PayrollParam, v: number) => setParams((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/proxy/payroll-params', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message);
      setMessage({ type: 'success', text: 'Parametros guardados' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
    setSaving(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-green-400" size={32} /></div>;
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <SlidersHorizontal size={22} className="text-green-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Parametros de Nomina</h1>
          <p className="text-sm text-slate-400">Deducciones fijas de ley, recargos de horas extra y bases de calculo</p>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg border mb-4 text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* Deducciones fijas */}
      <Section title="Deducciones fijas de ley (Bs por período)" subtitle="Montos fijos sobre salario mínimo. Se restan solo si el empleado trabajó en el período.">
        <Field label="IVSS (Bs)"><MoneyInput value={params.ivssBs} onValueChange={(n) => set('ivssBs', n)} className={inputCls} /></Field>
        <Field label="FAOV (Bs)"><MoneyInput value={params.faovBs} onValueChange={(n) => set('faovBs', n)} className={inputCls} /></Field>
        <Field label="INCES (Bs)"><MoneyInput value={params.incesBs} onValueChange={(n) => set('incesBs', n)} className={inputCls} /></Field>
      </Section>

      {/* Recargos horas extra */}
      <Section title="Recargos de horas extra" subtitle="Factor diurno sobre el valor-hora; el nocturno se aplica sobre el diurno.">
        <Field label="Factor hora extra diurna"><MoneyInput value={params.otDayFactor} onValueChange={(n) => set('otDayFactor', n)} className={inputCls} /></Field>
        <Field label="Factor adicional nocturna"><MoneyInput value={params.otNightFactor} onValueChange={(n) => set('otNightFactor', n)} className={inputCls} /></Field>
      </Section>

      {/* Bases de calculo */}
      <Section title="Bases de cálculo" subtitle="Días/mes para el salario diario y horas/semana para el valor-hora.">
        <Field label="Días por mes"><input type="number" min={1} value={params.monthDays} onChange={(e) => set('monthDays', Number(e.target.value))} className={inputCls} /></Field>
        <Field label="Horas por semana"><input type="number" min={1} value={params.weeklyHours} onChange={(e) => set('weeklyHours', Number(e.target.value))} className={inputCls} /></Field>
      </Section>

      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          Guardar parametros
        </button>
      </div>
    </div>
  );
}

const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-green-500';

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 mb-4">
      <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5 mb-4">{subtitle}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
