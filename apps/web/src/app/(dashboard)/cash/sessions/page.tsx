'use client';

import { useState, useEffect } from 'react';
import { History, Loader2, X, DollarSign } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = { OPEN: 'Abierta', CLOSED: 'Cerrada' };
const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-green-500/10 text-green-400 border-green-500/20',
  CLOSED: 'bg-slate-700/50 text-slate-400 border-slate-600',
};

const METHOD_LABELS: Record<string, string> = {
  CASH_USD: 'Efectivo USD',
  CASH_BS: 'Efectivo Bs',
  PUNTO_DE_VENTA: 'Punto de Venta',
  PAGO_MOVIL: 'Pago Movil',
  ZELLE: 'Zelle',
  TRANSFERENCIA: 'Transferencia',
  CASHEA: 'Cashea',
  CREDIAGRO: 'Crediagro',
};

export default function CashSessionsPage() {
  const [registers, setRegisters] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRegister, setFilterRegister] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [closingBalance, setClosingBalance] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  async function fetchRegisters() {
    try {
      const res = await fetch('/api/proxy/cash-registers');
      const data = await res.json();
      if (Array.isArray(data)) setRegisters(data);
    } catch {}
  }

  async function fetchSessions() {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/cash-sessions');
      const data = await res.json();
      if (Array.isArray(data)) setSessions(data);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchRegisters(); fetchSessions(); }, []);

  async function openSummary(session: any) {
    setSelectedSession(session);
    setLoadingSummary(true);
    try {
      const res = await fetch(`/api/proxy/cash-sessions/${session.id}/summary`);
      const data = await res.json();
      setSummaryData(data);
    } catch {}
    setLoadingSummary(false);
  }

  async function handleCloseSession() {
    if (!selectedSession) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/proxy/cash-sessions/${selectedSession.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closingBalance: parseFloat(closingBalance) || 0,
          notes: closingNotes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al cerrar sesión');
      }
      setMessage({ type: 'success', text: 'Sesión cerrada correctamente' });
      setSelectedSession(null);
      setSummaryData(null);
      setClosingBalance('');
      setClosingNotes('');
      fetchSessions();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  }

  const filteredSessions = sessions.filter(s => {
    if (filterRegister && s.cashRegisterId !== filterRegister) return false;
    if (filterStatus && s.status !== filterStatus) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="animate-spin text-green-500" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-xl bg-green-500/10 border border-green-500/20">
          <History className="text-green-400" size={22} />
        </div>
        <h1 className="text-2xl font-bold text-white">Sesiones de Caja</h1>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 mb-4 flex items-center gap-4 flex-wrap">
        <select value={filterRegister} onChange={e => setFilterRegister(e.target.value)} className="input-field w-auto min-w-[160px]">
          <option value="">Todas las cajas</option>
          {registers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field w-auto min-w-[140px]">
          <option value="">Todos los estados</option>
          <option value="OPEN">Abierta</option>
          <option value="CLOSED">Cerrada</option>
        </select>
      </div>

      {/* Sessions table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 text-slate-400 text-left">
              <th className="px-4 py-3 font-medium">Caja</th>
              <th className="px-4 py-3 font-medium">Abierta por</th>
              <th className="px-4 py-3 font-medium">Apertura</th>
              <th className="px-4 py-3 font-medium">Cierre</th>
              <th className="px-4 py-3 font-medium text-right">Monto apertura</th>
              <th className="px-4 py-3 font-medium text-right">Monto cierre</th>
              <th className="px-4 py-3 font-medium text-center">Estado</th>
              <th className="px-4 py-3 font-medium text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredSessions.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No hay sesiones registradas</td></tr>
            ) : (
              filteredSessions.map(s => (
                <tr key={s.id} className="border-b border-slate-700/30 hover:bg-slate-800/40">
                  <td className="px-4 py-3 text-white font-medium">{s.cashRegisterName || s.cashRegister?.name}</td>
                  <td className="px-4 py-3 text-slate-300">{s.openedBy?.name || '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{new Date(s.openedAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="px-4 py-3 text-slate-400">{s.closedAt ? new Date(s.closedAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-300">${s.openingBalance?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{s.closingBalance != null ? `$${s.closingBalance.toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[s.status]}`}>
                      {STATUS_LABELS[s.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => openSummary(s)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:border-green-500/30 hover:text-white transition-colors">
                      Ver arqueo
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Summary modal */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setSelectedSession(null); setSummaryData(null); }}>
          <div className="card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Arqueo de Caja</h3>
              <button onClick={() => { setSelectedSession(null); setSummaryData(null); }} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>

            {loadingSummary ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-green-500" size={24} /></div>
            ) : summaryData ? (
              <div className="space-y-4">
                {/* Header info */}
                <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-slate-400">Caja:</span> <span className="text-white">{summaryData.session?.cashRegister?.name}</span></div>
                    <div><span className="text-slate-400">Abierta por:</span> <span className="text-white">{summaryData.session?.openedBy?.name}</span></div>
                    <div><span className="text-slate-400">Desde:</span> <span className="text-white">{new Date(summaryData.session?.openedAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
                    <div><span className="text-slate-400">Hasta:</span> <span className="text-white">{summaryData.session?.closedAt ? new Date(summaryData.session.closedAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : 'Abierta actualmente'}</span></div>
                  </div>
                </div>

                {/* Opening balance */}
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-slate-400">Monto de apertura</span>
                  <span className="text-white font-medium">${summaryData.openingBalance?.toFixed(2)}</span>
                </div>

                {/* Sales by method */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-300 mb-2">Ventas por metodo de pago</h4>
                  <div className="rounded-lg border border-slate-700/50 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700/50 text-slate-400">
                          <th className="px-3 py-2 text-left font-medium">Metodo</th>
                          <th className="px-3 py-2 text-center font-medium">Txns</th>
                          <th className="px-3 py-2 text-right font-medium">USD</th>
                          <th className="px-3 py-2 text-right font-medium">Bs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryData.totalSalesByMethod?.length > 0 ? (
                          summaryData.totalSalesByMethod.map((m: any) => (
                            <tr key={m.method} className="border-b border-slate-700/30">
                              <td className="px-3 py-2 text-white">{METHOD_LABELS[m.method] || m.method}</td>
                              <td className="px-3 py-2 text-center text-slate-300">{m.count}</td>
                              <td className="px-3 py-2 text-right text-slate-300">${m.totalUsd.toFixed(2)}</td>
                              <td className="px-3 py-2 text-right text-slate-300">Bs {m.totalBs.toFixed(2)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-500">Sin ventas en esta sesion</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Totals */}
                <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-300">Total facturas</span>
                    <span className="text-white font-medium">{summaryData.invoiceCount}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-300">Total USD</span>
                    <span className="text-green-400 font-semibold">${summaryData.totalUsd?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-300">Total Bs</span>
                    <span className="text-green-400 font-semibold">Bs {summaryData.totalBs?.toFixed(2)}</span>
                  </div>
                </div>

                {/* Closing section */}
                {selectedSession.status === 'CLOSED' ? (
                  <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">Esperado en caja</span>
                      <span className="text-white">${summaryData.expectedBalance?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">Monto fisico</span>
                      <span className="text-white">${selectedSession.closingBalance?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Diferencia</span>
                      <span className={`font-semibold ${summaryData.difference != null && Math.abs(summaryData.difference) < 0.01 ? 'text-green-400' : 'text-red-400'}`}>
                        ${summaryData.difference?.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-slate-700/50 pt-4">
                    <h4 className="text-sm font-semibold text-white mb-3">Cerrar sesion</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm text-slate-400 mb-1">Monto fisico en caja (USD)</label>
                        <input
                          type="number"
                          value={closingBalance}
                          onChange={e => setClosingBalance(e.target.value)}
                          className="input-field"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-slate-400 mb-1">Notas (opcional)</label>
                        <input
                          type="text"
                          value={closingNotes}
                          onChange={e => setClosingNotes(e.target.value)}
                          className="input-field"
                          placeholder="Observaciones de cierre..."
                        />
                      </div>
                      <button onClick={handleCloseSession} disabled={processing} className="w-full btn-primary">
                        {processing ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Cerrar sesion'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
