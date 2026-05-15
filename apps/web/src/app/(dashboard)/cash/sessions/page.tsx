'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { History, Loader2, Search } from 'lucide-react';

export default function CashSessionsPage() {
  const router = useRouter();
  const [registers, setRegisters] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterRegister, setFilterRegister] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  useEffect(() => {
    fetch('/api/proxy/cash-registers')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setRegisters(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [filterRegister, filterStatus, filterFrom, filterTo]);

  async function fetchSessions() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterRegister) params.set('cashRegisterId', filterRegister);
      if (filterStatus) params.set('status', filterStatus);
      if (filterFrom) params.set('from', filterFrom);
      if (filterTo) params.set('to', filterTo);
      const res = await fetch(`/api/proxy/cash-sessions?${params}`);
      const data = await res.json();
      if (Array.isArray(data)) setSessions(data);
    } catch {}
    setLoading(false);
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-xl bg-green-500/10 border border-green-500/20">
          <History className="text-green-400" size={22} />
        </div>
        <h1 className="text-2xl font-bold text-white">Historial de sesiones</h1>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Caja</label>
          <select value={filterRegister} onChange={e => setFilterRegister(e.target.value)} className="input-field !py-1.5 !w-40 text-sm">
            <option value="">Todas</option>
            {registers.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Estado</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field !py-1.5 !w-32 text-sm">
            <option value="">Todos</option>
            <option value="OPEN">Abierta</option>
            <option value="CLOSED">Cerrada</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Desde</label>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="input-field !py-1.5 !w-40 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Hasta</label>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="input-field !py-1.5 !w-40 text-sm" />
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-slate-500" size={24} />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">No se encontraron sesiones</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 text-slate-400 text-left">
                <th className="px-4 py-3 font-medium">Caja</th>
                <th className="px-4 py-3 font-medium">Abierta por</th>
                <th className="px-4 py-3 font-medium">Fecha apertura</th>
                <th className="px-4 py-3 font-medium">Cerrada por</th>
                <th className="px-4 py-3 font-medium">Fecha cierre</th>
                <th className="px-4 py-3 font-medium text-right">Fondo USD</th>
                <th className="px-4 py-3 font-medium text-right">Fondo Bs</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr
                  key={s.id}
                  className="border-b border-slate-700/30 hover:bg-slate-800/30 cursor-pointer transition-colors"
                  onClick={() => router.push(`/cash/${s.cashRegister?.id || s.cashRegisterId}`)}
                >
                  <td className="px-4 py-2.5 text-white font-medium">{s.cashRegister?.name || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-300">{s.openedBy?.name || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-400">{new Date(s.openedAt).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-4 py-2.5 text-slate-400">{s.closedBy?.name || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-400">{s.closedAt ? new Date(s.closedAt).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-4 py-2.5 text-right text-white">${(s.openingBalanceUsd || 0).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-300">Bs {(s.openingBalanceBs || 0).toFixed(2)}</td>
                  <td className="px-4 py-2.5">
                    {s.status === 'OPEN' ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">Abierta</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">Cerrada</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
