'use client';

import { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { getMetrics } from '@/lib/metrics-help';

export function MetricsHelpButton({ metricKeys }: { metricKeys: string[] }) {
  const [open, setOpen] = useState(false);
  const metrics = getMetrics(metricKeys);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-700 border border-slate-700 transition-colors"
      >
        <HelpCircle size={16} className="text-emerald-400" />
        ¿Cómo se calcula?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="card max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50 sticky top-0 bg-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <HelpCircle size={18} className="text-emerald-400" /> ¿Cómo se calcula?
              </h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {metrics.map((m) => (
                <div key={m.key} className="border-b border-slate-700/30 pb-3 last:border-0">
                  <h3 className="text-white font-semibold text-sm">{m.titulo}</h3>
                  <p className="mt-1 font-mono text-xs text-emerald-400 bg-slate-900/50 rounded px-2 py-1 inline-block">
                    {m.formula}
                  </p>
                  <p className="mt-1.5 text-sm text-slate-400">{m.explicacion}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
