'use client';
import { useEffect, useState } from 'react';

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-VE') : '—');
const levelColor: Record<string, string> = {
  LLAMADO: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  NOTIFICACION: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  AMONESTACION: 'bg-red-500/15 text-red-400 border-red-500/20',
};

interface Amonestacion {
  id: string; number: string; level: string; occurredAt: string; reason: string;
  faultType: { name: string };
}

export default function MisAmonestacionesPage() {
  const [rows, setRows] = useState<Amonestacion[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { document.title = 'Mis amonestaciones | Trinity ERP'; }, []);
  useEffect(() => {
    fetch('/api/proxy/me/amonestaciones')
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'No disponible'); return r.json(); })
      .then(setRows).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="py-20 text-center text-slate-400">{error}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Mis amonestaciones</h1>
      <div className="space-y-3">
        {rows.map((a) => (
          <div key={a.id} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-200">{a.faultType.name}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${levelColor[a.level] || 'bg-slate-500/15 text-slate-400 border-slate-500/20'}`}>{a.level}</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">{a.number} · {fmtDate(a.occurredAt)}</div>
            <p className="text-sm text-slate-300 mt-2">{a.reason}</p>
          </div>
        ))}
        {rows.length === 0 && <div className="text-center py-12 text-slate-500">No tienes amonestaciones.</div>}
      </div>
    </div>
  );
}
