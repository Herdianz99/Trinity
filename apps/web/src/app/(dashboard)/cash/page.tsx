'use client';

import { useState, useEffect } from 'react';
import { Banknote, Plus, Loader2, Monitor } from 'lucide-react';

export default function CashPage() {
  const [registers, setRegisters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingModal, setOpeningModal] = useState<string | null>(null);
  const [openingBalance, setOpeningBalance] = useState('');
  const [openingNotes, setOpeningNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  async function fetchRegisters() {
    try {
      const res = await fetch('/api/proxy/cash-registers');
      const data = await res.json();
      if (Array.isArray(data)) setRegisters(data);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchRegisters(); }, []);

  async function handleOpenSession() {
    if (!openingModal) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/proxy/cash-registers/${openingModal}/open-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openingBalance: parseFloat(openingBalance) || 0,
          notes: openingNotes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al abrir sesión');
      }
      setMessage({ type: 'success', text: 'Sesión abierta correctamente' });
      setOpeningModal(null);
      setOpeningBalance('');
      setOpeningNotes('');
      fetchRegisters();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="animate-spin text-green-500" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-xl bg-green-500/10 border border-green-500/20">
          <Banknote className="text-green-400" size={22} />
        </div>
        <h1 className="text-2xl font-bold text-white">Gestion de Cajas</h1>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-4">
        {registers.map(cr => (
          <div key={cr.id} className="card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-2.5 rounded-xl ${cr.sessions?.length > 0 ? 'bg-green-500/10 border border-green-500/20' : 'bg-slate-700/50 border border-slate-600'}`}>
                  <Monitor size={20} className={cr.sessions?.length > 0 ? 'text-green-400' : 'text-slate-400'} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-lg">{cr.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">Cod: {cr.code}</span>
                    {cr.isFiscal && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">Fiscal</span>}
                  </div>
                  {cr.sessions?.length > 0 ? (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                      <span className="text-sm text-slate-300">
                        {cr.sessions.length} sesion(es) activa(s)
                      </span>
                      <span className="text-xs text-slate-500">
                        — {cr.sessions.map((s: any) => s.openedBy?.name).join(', ')}
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 mt-1">Sin sesiones activas</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setOpeningModal(cr.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-600 text-sm text-slate-300 hover:border-green-500/40 hover:text-white transition-colors"
              >
                <Plus size={16} />
                Abrir sesion
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Open session modal */}
      {openingModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOpeningModal(null)}>
          <div className="card p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">Abrir sesion de caja</h3>
            <p className="text-sm text-slate-400 mb-4">
              Caja: <span className="text-white font-medium">{registers.find(r => r.id === openingModal)?.name}</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Monto de apertura (USD)</label>
                <input
                  type="number"
                  value={openingBalance}
                  onChange={e => setOpeningBalance(e.target.value)}
                  className="input-field"
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Notas (opcional)</label>
                <input
                  type="text"
                  value={openingNotes}
                  onChange={e => setOpeningNotes(e.target.value)}
                  className="input-field"
                  placeholder="Notas de apertura..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setOpeningModal(null)} className="flex-1 px-4 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:text-white transition-colors">
                Cancelar
              </button>
              <button onClick={handleOpenSession} disabled={processing} className="flex-1 btn-primary">
                {processing ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Abrir sesion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
