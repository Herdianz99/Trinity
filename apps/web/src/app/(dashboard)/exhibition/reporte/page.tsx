'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Download, FileText, Loader2 } from 'lucide-react';

interface Entry {
  id: string;
  createdAt: string;
  action: 'PLACED' | 'REMOVED';
  location: string | null;
  reason: string | null;
  createdBy: { name: string } | null;
  product: { code: string; name: string; category: { name: string } | null } | null;
}
interface Summary {
  currentlyExhibited: number;
  placedCount: number;
  removedCount: number;
  avgDaysExhibited: number;
  top: { product: { code: string; name: string } | null; placedCount: number }[];
}

const ACTION_LABEL: Record<string, string> = { PLACED: 'Puesto', REMOVED: 'Retirado' };
const REASON_LABEL: Record<string, string> = { SOLD: 'Vendido', DAMAGED: 'Dañado', ROTATION: 'Rotación', OTHER: 'Otro' };

// Rango en fecha LOCAL (navegador = Caracas), formato YYYY-MM-DD
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function rangeFor(preset: string): { from: string; to: string } {
  const now = new Date();
  const today = ymd(now);
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'week') {
    const d = new Date(now); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day);
    return { from: ymd(d), to: today };
  }
  if (preset === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: ymd(d), to: today };
  }
  return { from: today, to: today };
}

export default function ExhibitionReportPage() {
  const [preset, setPreset] = useState('today');
  const [from, setFrom] = useState(rangeFor('today').from);
  const [to, setTo] = useState(rangeFor('today').to);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = 'Reporte de Exhibición | Trinity ERP'; }, []);

  function applyPreset(p: string) {
    setPreset(p);
    if (p !== 'custom') { const r = rangeFor(p); setFrom(r.from); setTo(r.to); }
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from, to }).toString();
      const [aRes, sRes] = await Promise.all([
        fetch(`/api/proxy/exhibition/activity?${qs}`),
        fetch(`/api/proxy/exhibition/summary?${qs}`),
      ]);
      setEntries(await aRes.json());
      setSummary(await sRes.json());
    } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportUrl = (fmt: 'pdf' | 'xlsx') =>
    `/api/proxy/exhibition/activity/${fmt}?${new URLSearchParams({ from, to })}`;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <BarChart3 size={22} className="text-green-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Reporte de Exhibición</h1>
          <p className="text-sm text-slate-400">Actividad por rango de fechas</p>
        </div>
      </div>

      {/* Rango */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3 mb-4">
        <div className="grid grid-cols-2 sm:flex gap-1.5">
          {[['today', 'Hoy'], ['week', 'Semana'], ['month', 'Mes'], ['custom', 'Personalizado']].map(([k, l]) => (
            <button key={k} onClick={() => applyPreset(k)} className={`px-3 py-2 rounded-lg text-sm ${preset === k ? 'bg-green-500/20 text-green-400' : 'bg-slate-800 text-slate-400'}`}>{l}</button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="grid grid-cols-2 sm:flex gap-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
          </div>
        )}
        <div className="grid grid-cols-2 sm:flex gap-2 sm:ml-auto">
          <a href={exportUrl('pdf')} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm"><FileText size={16} /> PDF</a>
          <a href={exportUrl('xlsx')} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm"><Download size={16} /> Excel</a>
        </div>
      </div>

      {/* KPIs */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Kpi label="Exhibidos ahora" value={summary.currentlyExhibited} />
          <Kpi label="Puestas (período)" value={summary.placedCount} />
          <Kpi label="Retiros (período)" value={summary.removedCount} />
          <Kpi label="Días prom. en vitrina" value={summary.avgDaysExhibited} />
        </div>
      )}

      {/* Tabla actividad */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-500"><Loader2 className="animate-spin mx-auto" /></div>
        ) : entries.length === 0 ? (
          <div className="p-10 text-center text-slate-500">Sin actividad en el rango</div>
        ) : (
          <>
            {/* Móvil: tarjetas */}
            <div className="md:hidden divide-y divide-slate-800/50">
              {entries.map((e) => (
                <div key={e.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-slate-200 font-medium truncate">{e.product?.name || '—'}</div>
                      <div className="text-xs font-mono text-slate-500">{e.product?.code || '—'}</div>
                    </div>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border ${e.action === 'PLACED' ? 'bg-green-500/15 text-green-400 border-green-500/25' : 'bg-red-500/15 text-red-400 border-red-500/25'}`}>
                      {ACTION_LABEL[e.action]}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400">
                    <span className="col-span-2">{new Date(e.createdAt).toLocaleString('es-VE')}</span>
                    <span><span className="text-slate-500">Ubic:</span> {e.location || '—'}</span>
                    <span><span className="text-slate-500">Motivo:</span> {e.reason ? REASON_LABEL[e.reason] : '—'}</span>
                    <span className="col-span-2"><span className="text-slate-500">Usuario:</span> {e.createdBy?.name || '—'}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: tabla (con scroll horizontal de seguridad) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-800">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Código</th>
                    <th className="px-4 py-3">Artículo</th>
                    <th className="px-4 py-3">Acción</th>
                    <th className="px-4 py-3">Ubicación</th>
                    <th className="px-4 py-3">Motivo</th>
                    <th className="px-4 py-3">Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-slate-800/50">
                      <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{new Date(e.createdAt).toLocaleString('es-VE')}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{e.product?.code}</td>
                      <td className="px-4 py-2.5 text-slate-200">{e.product?.name}</td>
                      <td className="px-4 py-2.5">
                        <span className={e.action === 'PLACED' ? 'text-green-400' : 'text-red-400'}>{ACTION_LABEL[e.action]}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">{e.location || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-400">{e.reason ? REASON_LABEL[e.reason] : '—'}</td>
                      <td className="px-4 py-2.5 text-slate-400">{e.createdBy?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-100">{value}</p>
    </div>
  );
}
