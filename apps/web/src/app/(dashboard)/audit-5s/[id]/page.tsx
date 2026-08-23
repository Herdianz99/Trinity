'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Star, Loader2, ClipboardCheck, ArrowLeft, MessageSquare } from 'lucide-react';

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
function indexLabel(idx: number): string {
  if (idx >= 90) return 'Excelente';
  if (idx >= 75) return 'Aceptable';
  return 'Alerta';
}
function fmtDate(d: string) {
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

function StarsRO({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={18} className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-600'} />
      ))}
      <span className="text-xs text-slate-400 ml-1">{value}/5</span>
    </div>
  );
}

const QUESTIONS: { key: 'scoreCleanliness' | 'scoreOrder' | 'scoreSafety'; label: string }[] = [
  { key: 'scoreCleanliness', label: 'Limpieza general' },
  { key: 'scoreOrder', label: 'Orden y acomodo' },
  { key: 'scoreSafety', label: 'Seguridad de apilamiento' },
];

export default function Audit5SDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/audit-5s/${id}`);
      if (res.ok) setAudit(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);
  useEffect(() => {
    document.title = audit ? `${audit.number} - Auditoría 5S | Trinity ERP` : 'Auditoría 5S | Trinity ERP';
  }, [audit]);

  if (loading) return <div className="p-8 text-center text-slate-500"><Loader2 className="animate-spin inline" size={24} /></div>;
  if (!audit) return <div className="p-8 text-center text-slate-500">Auditoría no encontrada.</div>;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/audit-5s" className="text-slate-400 hover:text-white"><ArrowLeft size={20} /></Link>
        <ClipboardCheck className="text-green-400" size={22} />
        <h1 className="text-xl font-bold text-white font-mono">{audit.number}</h1>
        <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${indexBadge(audit.index5s)}`}>
          {indexLabel(audit.index5s)}
        </span>
      </div>

      {/* Datos + índice */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="grid grid-cols-3 gap-6 text-sm">
            <div><p className="text-xs text-slate-500">Fecha de inspección</p><p className="text-white">{fmtDate(audit.date)}</p></div>
            <div><p className="text-xs text-slate-500">Zona</p><p className="text-white">{audit.zone}</p></div>
            <div><p className="text-xs text-slate-500">Auditor</p><p className="text-white">{audit.createdBy?.name || '—'}</p></div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Índice 5S</p>
            <p className={`text-3xl font-bold ${indexColor(audit.index5s)}`}>{audit.index5s}%</p>
          </div>
        </div>
      </div>

      {/* Puntajes */}
      <div className="card p-5 space-y-3">
        {QUESTIONS.map((q) => (
          <div key={q.key} className="flex items-center justify-between border-b border-slate-700/40 pb-3 last:border-0 last:pb-0">
            <span className="text-sm text-white">{q.label}</span>
            <StarsRO value={audit[q.key]} />
          </div>
        ))}
      </div>

      {/* Observaciones */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare size={16} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-white">Observaciones</h2>
        </div>
        {audit.observations
          ? <p className="text-sm text-slate-300 whitespace-pre-wrap">{audit.observations}</p>
          : <p className="text-sm text-slate-500 italic">Sin observaciones.</p>}
      </div>
    </div>
  );
}
