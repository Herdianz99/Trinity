'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Star, Loader2, ClipboardCheck, CheckCircle2, MessageSquare, ChevronRight } from 'lucide-react';

function fmtDate(d: string) {
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

// Zonas del patio sugeridas (del PDF de despacho). El campo permite escribir otra.
const ZONES = ['Cantiléver - Perfiles', 'Tubos - PVC', 'Mantas', 'Cemento', 'Tanques'];

interface Audit {
  id: string;
  number: string;
  date: string;
  zone: string;
  scoreCleanliness: number;
  scoreOrder: number;
  scoreSafety: number;
  observations: string | null;
  index5s: number;
  createdBy: { name: string } | null;
  createdAt: string;
}

// Semáforo del índice 5S: >90 verde, 75-89 amarillo, <75 rojo.
function indexColor(idx: number): string {
  if (idx >= 90) return 'text-green-400';
  if (idx >= 75) return 'text-amber-400';
  return 'text-red-400';
}
function indexBadge(idx: number): string {
  if (idx >= 90) return 'bg-green-500/10 text-green-400 border-green-500/30';
  if (idx >= 75) return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  return 'bg-red-500/10 text-red-400 border-red-500/30';
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="p-1 transition-transform hover:scale-110"
          aria-label={`${n} de 5`}
        >
          <Star
            size={30}
            className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}
          />
        </button>
      ))}
    </div>
  );
}

const QUESTIONS: { key: 'scoreCleanliness' | 'scoreOrder' | 'scoreSafety'; label: string; hint: string }[] = [
  { key: 'scoreCleanliness', label: 'Limpieza general', hint: '¿Pisos limpios, sin restos de sunchos, sacos rotos o agua acumulada?' },
  { key: 'scoreOrder', label: 'Orden y acomodo', hint: '¿Materiales alineados en racks/cantiléver, pasillos despejados y etiquetados?' },
  { key: 'scoreSafety', label: 'Seguridad de apilamiento', hint: '¿Pallets amarrados, tubos estables y mantas bajo techo?' },
];

export default function Audit5SPage() {
  const router = useRouter();
  const [zone, setZone] = useState('');
  const [scores, setScores] = useState({ scoreCleanliness: 0, scoreOrder: 0, scoreSafety: 0 });
  const [observations, setObservations] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [lastIndex, setLastIndex] = useState<number | null>(null);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = 'Auditoría 5S | Trinity ERP'; }, []);

  const liveIndex = Math.round(
    ((scores.scoreCleanliness + scores.scoreOrder + scores.scoreSafety) / 15) * 100,
  );
  const allRated = scores.scoreCleanliness > 0 && scores.scoreOrder > 0 && scores.scoreSafety > 0;

  const fetchAudits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/audit-5s');
      if (res.ok) setAudits(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAudits(); }, [fetchAudits]);
  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 4000); return () => clearTimeout(t); }
  }, [message]);

  async function submit() {
    if (!zone.trim()) { setMessage({ type: 'error', text: 'Indica la zona' }); return; }
    if (!allRated) { setMessage({ type: 'error', text: 'Califica las 3 preguntas' }); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/proxy/audit-5s', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone: zone.trim(), ...scores, observations: observations.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al guardar');
      }
      const created = await res.json();
      setLastIndex(created.index5s);
      setMessage({ type: 'success', text: `Checklist ${created.number} enviado — Índice 5S ${created.index5s}%` });
      setZone(''); setScores({ scoreCleanliness: 0, scoreOrder: 0, scoreSafety: 0 }); setObservations('');
      fetchAudits();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Error al guardar' });
    } finally { setSaving(false); }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="text-green-400" size={24} />
        <div>
          <h1 className="text-xl font-bold text-white">Auditoría 5S</h1>
          <p className="text-sm text-slate-400">Checklist rápido de cierre de turno (menos de 2 minutos).</p>
        </div>
      </div>

      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
          {message.text}
        </div>
      )}

      {/* Formulario */}
      <div className="card p-6 space-y-6">
        <div>
          <label className="block text-sm text-slate-300 mb-1.5">Zona evaluada</label>
          <input
            list="audit5s-zones"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            placeholder="Selecciona o escribe la zona"
            className="input-field w-full"
          />
          <datalist id="audit5s-zones">
            {ZONES.map((z) => <option key={z} value={z} />)}
          </datalist>
        </div>

        {QUESTIONS.map((q) => (
          <div key={q.key} className="border-t border-slate-700/40 pt-4 first:border-0 first:pt-0">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-medium text-white">{q.label}</p>
                <p className="text-xs text-slate-500">{q.hint}</p>
              </div>
              <StarRating value={scores[q.key]} onChange={(v) => setScores((s) => ({ ...s, [q.key]: v }))} />
            </div>
          </div>
        ))}

        <div className="border-t border-slate-700/40 pt-4">
          <label className="block text-sm text-slate-300 mb-1.5">Observaciones o requerimientos de mantenimiento</label>
          <textarea
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            rows={2}
            placeholder="Ej: cambiar bombillo sobre estante de mantas asfálticas"
            className="input-field w-full resize-none"
          />
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="text-sm text-slate-400">
            Índice 5S:{' '}
            <span className={`text-lg font-bold ${allRated ? indexColor(liveIndex) : 'text-slate-600'}`}>
              {allRated ? `${liveIndex}%` : '—'}
            </span>
          </div>
          <button onClick={submit} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
            Enviar checklist
          </button>
        </div>
      </div>

      {lastIndex !== null && (
        <div className={`rounded-lg px-4 py-3 text-center border ${indexBadge(lastIndex)}`}>
          Último checklist enviado — Índice 5S <span className="font-bold">{lastIndex}%</span>
        </div>
      )}

      {/* Historial */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <h2 className="text-sm font-semibold text-white">Últimas auditorías</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-500"><Loader2 className="animate-spin inline" size={20} /></div>
        ) : audits.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">Aún no hay auditorías registradas.</div>
        ) : (
          <>
            {/* Desktop: tabla (filas clicables) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-700/40">
                    <th className="px-4 py-2 font-medium">N°</th>
                    <th className="px-4 py-2 font-medium">Fecha</th>
                    <th className="px-4 py-2 font-medium">Zona</th>
                    <th className="px-4 py-2 font-medium text-center">Limpieza</th>
                    <th className="px-4 py-2 font-medium text-center">Orden</th>
                    <th className="px-4 py-2 font-medium text-center">Seguridad</th>
                    <th className="px-4 py-2 font-medium text-center">Índice</th>
                    <th className="px-4 py-2 font-medium">Auditor</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.map((a) => (
                    <tr
                      key={a.id}
                      onClick={() => router.push(`/audit-5s/${a.id}`)}
                      className="border-b border-slate-700/20 hover:bg-slate-800/40 cursor-pointer"
                    >
                      <td className="px-4 py-2">
                        <span className="font-mono text-xs text-green-400 inline-flex items-center gap-1 whitespace-nowrap">
                          {a.number}
                          {a.observations && <MessageSquare size={12} className="text-slate-500" />}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-300 whitespace-nowrap">{fmtDate(a.date)}</td>
                      <td className="px-4 py-2 text-white">{a.zone}</td>
                      <td className="px-4 py-2 text-center text-slate-300">{a.scoreCleanliness}</td>
                      <td className="px-4 py-2 text-center text-slate-300">{a.scoreOrder}</td>
                      <td className="px-4 py-2 text-center text-slate-300">{a.scoreSafety}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${indexBadge(a.index5s)}`}>{a.index5s}%</span>
                      </td>
                      <td className="px-4 py-2 text-slate-400 text-xs">{a.createdBy?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Móvil: tarjetas clicables */}
            <div className="md:hidden divide-y divide-slate-700/30">
              {audits.map((a) => (
                <button
                  key={a.id}
                  onClick={() => router.push(`/audit-5s/${a.id}`)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-slate-800/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-green-400 whitespace-nowrap">{a.number}</span>
                      {a.observations && <MessageSquare size={12} className="text-slate-500 flex-shrink-0" />}
                      <span className="text-xs text-slate-500 ml-auto whitespace-nowrap">{fmtDate(a.date)}</span>
                    </div>
                    <p className="text-sm text-white truncate mt-0.5">{a.zone}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Limpieza {a.scoreCleanliness} · Orden {a.scoreOrder} · Seguridad {a.scoreSafety}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold border flex-shrink-0 ${indexBadge(a.index5s)}`}>{a.index5s}%</span>
                  <ChevronRight size={16} className="text-slate-600 flex-shrink-0" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
