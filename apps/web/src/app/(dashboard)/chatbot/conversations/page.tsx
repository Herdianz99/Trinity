'use client';

import { useState, useEffect } from 'react';
import { MessagesSquare, Loader2, UserRound, Bot, X } from 'lucide-react';

interface Row {
  id: string;
  channel: string;
  contactName: string | null;
  status: 'BOT' | 'ESCALATED' | 'CLOSED';
  escalationReason: string | null;
  costUsd: number;
  messageCount: number;
  firstMessage: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: { name: string } | null;
}
interface Detail {
  id: string;
  status: string;
  escalationReason: string | null;
  escalationSummary: string | null;
  costUsd: number;
  messages: { id: string; role: string; text: string; imageUrls: string[]; productImages: { code: string; name: string; url: string }[] | null; costUsd: number; createdAt: string }[];
}
interface Stats { monthCostUsd: number; monthlyBudgetUsd: number; conversations: number; escalated: number; ratedGood: number; ratedBad: number }

const STATUS: Record<string, { label: string; cls: string }> = {
  BOT: { label: 'Bot', cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' },
  ESCALATED: { label: 'Con asesor', cls: 'bg-sky-500/10 border-sky-500/30 text-sky-400' },
  CLOSED: { label: 'Cerrada', cls: 'bg-slate-500/10 border-slate-500/30 text-slate-400' },
};

const fmtDate = (s: string) => new Date(s).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function ChatbotConversationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => { document.title = 'Conversaciones del chatbot | Trinity ERP'; }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/proxy/chatbot/conversations${status ? `?status=${status}` : ''}`).then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/chatbot/stats').then((r) => (r.ok ? r.json() : null)),
    ]).then(([list, s]) => { setRows(list); setStats(s); }).finally(() => setLoading(false));
  }, [status]);

  async function open(id: string) {
    const res = await fetch(`/api/proxy/chatbot/conversations/${id}`);
    if (res.ok) setDetail(await res.json());
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <MessagesSquare className="text-emerald-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Conversaciones del chatbot</h1>
          <p className="text-slate-400 text-sm">Historial de lo que respondió el bot y cuáles pasaron a un asesor</p>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          <StatCard label="Conversaciones del mes" value={String(stats.conversations)} />
          <StatCard label="Pasadas a asesor" value={String(stats.escalated)} />
          <StatCard label="Gasto del mes" value={`$${stats.monthCostUsd.toFixed(2)}`} />
          <StatCard label="Tope mensual" value={`${stats.monthlyBudgetUsd.toFixed(2)}`} />
          <StatCard
            label={`Acierto del bot (${stats.ratedGood + stats.ratedBad} calificadas)`}
            value={stats.ratedGood + stats.ratedBad > 0 ? `${Math.round((100 * stats.ratedGood) / (stats.ratedGood + stats.ratedBad))}% 👍` : '—'}
          />
        </div>
      )}

      <div className="flex rounded-lg border border-slate-700/50 overflow-hidden text-sm w-fit mb-4">
        {[['', 'Todas'], ['BOT', 'Bot'], ['ESCALATED', 'Con asesor']].map(([key, label]) => (
          <button key={key} onClick={() => setStatus(key)} className={`px-4 py-2 ${status === key ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>{label}</button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 text-slate-400">
              <th className="text-left px-4 py-3 font-medium">Fecha</th>
              <th className="text-left px-4 py-3 font-medium">Canal</th>
              <th className="text-left px-4 py-3 font-medium">Primer mensaje</th>
              <th className="text-center px-4 py-3 font-medium">Mensajes</th>
              <th className="text-left px-4 py-3 font-medium">Estado</th>
              <th className="text-right px-4 py-3 font-medium">Costo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12"><Loader2 className="animate-spin text-green-500 mx-auto" size={28} /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-slate-500">No hay conversaciones</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} onClick={() => open(r.id)} className="border-b border-slate-700/30 hover:bg-slate-800/40 cursor-pointer">
                <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{fmtDate(r.updatedAt)}</td>
                <td className="px-4 py-3 text-slate-400">{r.channel === 'TEST' ? `Prueba${r.createdBy ? ` · ${r.createdBy.name}` : ''}` : r.channel}</td>
                <td className="px-4 py-3 text-white max-w-md truncate">{r.firstMessage || '—'}</td>
                <td className="px-4 py-3 text-center text-slate-400">{r.messageCount}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                  {r.escalationReason && <span className="ml-2 text-xs text-slate-500">{r.escalationReason}</span>}
                </td>
                <td className="px-4 py-3 text-right text-slate-300">${r.costUsd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setDetail(null)}>
          <div className="w-full max-w-xl h-full bg-slate-900 border-l border-slate-700 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
              <div>
                <h2 className="text-white font-semibold">Conversación</h2>
                <p className="text-xs text-slate-500">Costo total ${detail.costUsd.toFixed(4)}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            {detail.escalationSummary && (
              <div className="mx-5 mt-4 p-3 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-200 text-xs">
                <div className="font-medium mb-1">Resumen para el asesor · {detail.escalationReason}</div>
                {detail.escalationSummary}
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {detail.messages.map((m) => (
                <div key={m.id} className={`flex gap-2 ${m.role === 'USER' ? 'justify-end' : ''}`}>
                  {m.role !== 'USER' && <Bot size={16} className="text-emerald-400 mt-2 shrink-0" />}
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === 'USER' ? 'bg-emerald-700/60 text-white' : 'bg-slate-800 text-slate-100'}`}>
                    {m.imageUrls?.map((u) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={u} src={u} alt="" className="h-24 rounded-lg mb-1" />
                    ))}
                    {m.text}
                    {m.productImages?.map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={p.code} src={p.url} alt={p.name} className="h-24 rounded-lg mt-1 bg-white" />
                    ))}
                    <div className="text-[10px] text-slate-400/70 mt-1">{fmtDate(m.createdAt)}</div>
                  </div>
                  {m.role === 'USER' && <UserRound size={16} className="text-slate-400 mt-2 shrink-0" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold text-white mt-1">{value}</div>
    </div>
  );
}
