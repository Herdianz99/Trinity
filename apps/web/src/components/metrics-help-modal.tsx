'use client';

import { useState } from 'react';
import { HelpCircle, X, AlertTriangle } from 'lucide-react';
import { getMetrics } from '@/lib/metrics-help';

export function MetricsHelpButton({ metricKeys, small }: { metricKeys: string[]; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const metrics = getMetrics(metricKeys);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="¿Cómo se calcula?"
        aria-label="¿Cómo se calcula?"
        className={small
          ? 'p-1.5 rounded-lg bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-emerald-400 hover:bg-slate-700 transition-colors'
          : 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-700 border border-slate-700 transition-colors'}
      >
        <HelpCircle size={16} className={small ? '' : 'text-emerald-400'} />
        {!small && '¿Cómo se calcula?'}
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
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50 sticky top-0 bg-slate-800 z-10">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <HelpCircle size={18} className="text-emerald-400" /> ¿Cómo se calcula?
              </h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {metrics.map((m, i) => (
                <div key={m.key}>
                  {m.seccion && m.seccion !== metrics[i - 1]?.seccion && (
                    <h3 className={`text-[11px] font-semibold uppercase tracking-wider text-emerald-400/80 mb-3 ${i > 0 ? 'pt-2' : ''}`}>
                      {m.seccion}
                    </h3>
                  )}
                  <div className="border-b border-slate-700/30 pb-3">
                    <h4 className="text-white font-semibold text-sm">{m.titulo}</h4>
                    <p className="mt-1 font-mono text-xs text-emerald-400 bg-slate-900/50 rounded px-2 py-1 inline-block">
                      {m.formula}
                    </p>
                    <p className="mt-1.5 text-sm text-slate-400">{m.explicacion}</p>
                    {m.incluye && m.incluye.length > 0 && (
                      <ul className="mt-1.5 space-y-1 text-sm text-slate-400 list-disc pl-5 marker:text-slate-600">
                        {m.incluye.map((t) => <li key={t}>{t}</li>)}
                      </ul>
                    )}
                    {m.ojo && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                        {m.ojo}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
