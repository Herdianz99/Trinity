'use client';
import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';

const fmtDate = (s: string) => new Date(s).toLocaleString('es-VE');

interface Item {
  id: string; ackState: 'PENDIENTE' | 'RECIBIDO' | 'RECHAZADO'; comment: string | null; ackAt: string | null;
  notification: { id: string; title: string; body: string; type: string; createdAt: string; createdBy: { name: string } };
}

export default function MisNotificacionesPage() {
  const [rows, setRows] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [comments, setComments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => { document.title = 'Notificaciones | Trinity ERP'; }, []);
  async function load() {
    try {
      const r = await fetch('/api/proxy/notifications/me/inbox');
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'No disponible');
      setRows(await r.json());
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function ack(id: string, ackState: 'RECIBIDO' | 'RECHAZADO') {
    setSaving(id);
    try {
      const r = await fetch(`/api/proxy/notifications/me/${id}/ack`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ackState, comment: comments[id] || undefined }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Error');
      await load();
    } catch (e: any) { alert(e.message); } finally { setSaving(null); }
  }

  if (error) return <div className="py-20 text-center text-slate-400">{error}</div>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">Notificaciones</h1>
      <div className="space-y-3">
        {rows.map((it) => (
          <div key={it.id} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-200">{it.notification.title}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300">{it.notification.type}</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">{it.notification.createdBy?.name} · {fmtDate(it.notification.createdAt)}</div>
            <p className="text-sm text-slate-300 mt-2 whitespace-pre-wrap">{it.notification.body}</p>
            {it.ackState === 'PENDIENTE' ? (
              <div className="mt-3">
                <textarea
                  value={comments[it.id] || ''}
                  onChange={(e) => setComments({ ...comments, [it.id]: e.target.value })}
                  placeholder="Comentario (opcional)"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm"
                  rows={2}
                />
                <div className="flex gap-2 mt-2">
                  <button disabled={saving === it.id} onClick={() => ack(it.id, 'RECIBIDO')} className="btn-primary flex items-center gap-1 disabled:opacity-50"><Check size={15} /> Enterado</button>
                  <button disabled={saving === it.id} onClick={() => ack(it.id, 'RECHAZADO')} className="btn-secondary flex items-center gap-1 disabled:opacity-50"><X size={15} /> En desacuerdo</button>
                </div>
              </div>
            ) : (
              <div className="mt-3 text-xs">
                <span className={it.ackState === 'RECIBIDO' ? 'text-emerald-400' : 'text-red-400'}>
                  {it.ackState === 'RECIBIDO' ? 'Enterado' : 'En desacuerdo'}
                </span>
                <span className="text-slate-500"> · {it.ackAt ? fmtDate(it.ackAt) : ''}</span>
                {it.comment && <p className="text-slate-400 mt-1">“{it.comment}”</p>}
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <div className="text-center py-12 text-slate-500">No tienes notificaciones.</div>}
      </div>
    </div>
  );
}
