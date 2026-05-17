'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  ArrowLeft,
  Loader2,
  DollarSign,
} from 'lucide-react';

const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function NewPaymentSchedulePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState<'USD' | 'Bs'>('USD');
  const [notes, setNotes] = useState('');
  const [todayRate, setTodayRate] = useState<number>(0);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/proxy/exchange-rate/today')
      .then((r) => r.json())
      .then((data) => setTodayRate(data.rate || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [message]);

  const budgetNum = parseFloat(budgetAmount) || 0;
  const budgetUsd = budgetCurrency === 'USD' ? budgetNum : (todayRate > 0 ? budgetNum / todayRate : 0);
  const budgetBs = budgetCurrency === 'Bs' ? budgetNum : budgetNum * todayRate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setMessage({ type: 'error', text: 'El titulo es obligatorio' });
      return;
    }

    setProcessing(true);
    try {
      const body: any = { title: title.trim(), notes: notes.trim() || undefined };

      if (budgetNum > 0) {
        body.budgetUsd = Math.round(budgetUsd * 100) / 100;
        body.budgetBs = Math.round(budgetBs * 100) / 100;
        body.budgetCurrency = budgetCurrency;
      }

      const res = await fetch('/api/proxy/payment-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error al crear');
      }

      const data = await res.json();
      router.push(`/payment-schedules/${data.id}`);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-6 max-w-[700px] mx-auto">
      {/* Toast */}
      {message && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${message.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-emerald-500/90 text-white'}`}>
          {message.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/payment-schedules')}
          className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="p-2 rounded-lg bg-blue-500/10">
          <CalendarClock className="text-blue-400" size={24} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Nueva Programacion de Pagos</h1>
          {todayRate > 0 && (
            <p className="text-sm text-zinc-500">Tasa del dia: Bs {fmt(todayRate)}</p>
          )}
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Titulo <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            placeholder='Ej: "Pagos semana 19-25 Mayo"'
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Budget */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Presupuesto
          </label>
          <p className="text-xs text-zinc-500 mb-2">Deja en 0 si no quieres validar presupuesto</p>

          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setBudgetCurrency('USD')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                budgetCurrency === 'USD'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-750'
              }`}
            >
              USD ($)
            </button>
            <button
              type="button"
              onClick={() => setBudgetCurrency('Bs')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                budgetCurrency === 'Bs'
                  ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-750'
              }`}
            >
              Bolivares (Bs)
            </button>
          </div>

          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
            />
          </div>

          {budgetNum > 0 && todayRate > 0 && (
            <div className="mt-2 text-xs text-zinc-500">
              {budgetCurrency === 'USD'
                ? `Equivalente: Bs ${fmt(budgetBs)}`
                : `Equivalente: $${fmt(budgetUsd)}`
              }
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Notas</label>
          <textarea
            placeholder="Notas opcionales..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus:border-blue-500 focus:outline-none"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push('/payment-schedules')}
            className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={processing || !title.trim()}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            {processing && <Loader2 className="animate-spin" size={16} />}
            Crear
          </button>
        </div>
      </form>
    </div>
  );
}
