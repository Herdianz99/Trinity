'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Banknote,
  Loader2,
  Monitor,
  Eye,
  DoorOpen,
  Wifi,
  WifiOff,
} from 'lucide-react';

interface CashRegister {
  id: string;
  code: string;
  name: string;
  isFiscal: boolean;
  isShared: boolean;
  isActive: boolean;
  sessions: {
    id: string;
    openedBy: { id: string; name: string };
    openedAt: string;
    openingBalanceUsd: number;
    openingBalanceBs: number;
  }[];
}

export default function CashPage() {
  const router = useRouter();
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState<string | null>(null);
  const [openBalanceUsd, setOpenBalanceUsd] = useState('');
  const [openBalanceBs, setOpenBalanceBs] = useState('');
  const [openNotes, setOpenNotes] = useState('');
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
    if (!openModal) return;
    setProcessing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/cash-registers/${openModal}/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openingBalanceUsd: parseFloat(openBalanceUsd) || 0,
          openingBalanceBs: parseFloat(openBalanceBs) || 0,
          notes: openNotes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al abrir sesion');
      }
      setMessage({ type: 'success', text: 'Sesion abierta correctamente' });
      setOpenModal(null);
      setOpenBalanceUsd('');
      setOpenBalanceBs('');
      setOpenNotes('');
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
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-xl bg-green-500/10 border border-green-500/20">
          <Banknote className="text-green-400" size={22} />
        </div>
        <h1 className="text-2xl font-bold text-white">Cajas registradoras</h1>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          {message.text}
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 text-slate-400 text-left">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Codigo</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Compartida</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Abierta por</th>
              <th className="px-4 py-3 font-medium">Hora apertura</th>
              <th className="px-4 py-3 font-medium text-right">Accion</th>
            </tr>
          </thead>
          <tbody>
            {registers.map(cr => {
              const openSession = cr.sessions?.[0];
              const isOpen = !!openSession;

              return (
                <tr
                  key={cr.id}
                  className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors cursor-pointer"
                  onClick={() => router.push(`/cash/${cr.id}`)}
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-white">{cr.name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-slate-300">{cr.code}</span>
                  </td>
                  <td className="px-4 py-3">
                    {cr.isFiscal ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">Fiscal</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">Normal</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {cr.isShared ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 inline-flex items-center gap-1">
                        <Wifi size={10} /> Si
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-500 inline-flex items-center gap-1">
                        <WifiOff size={10} /> No
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isOpen ? (
                      <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        Abierta
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-500">Cerrada</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {openSession?.openedBy?.name || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {openSession ? new Date(openSession.openedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    {isOpen ? (
                      <button
                        onClick={() => router.push(`/cash/${cr.id}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors"
                      >
                        <Eye size={13} /> Ver
                      </button>
                    ) : (
                      <button
                        onClick={() => setOpenModal(cr.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-600 text-slate-300 hover:border-green-500/40 hover:text-white transition-colors"
                      >
                        <DoorOpen size={13} /> Abrir caja
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {registers.length === 0 && (
          <div className="text-center py-12 text-slate-500">No hay cajas registradas</div>
        )}
      </div>

      {/* Open session modal */}
      {openModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOpenModal(null)}>
          <div className="card p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-1">Abrir caja</h3>
            <p className="text-sm text-slate-400 mb-5">
              Caja: <span className="text-white font-medium">{registers.find(r => r.id === openModal)?.name}</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Fondo inicial USD</label>
                <input
                  type="number"
                  value={openBalanceUsd}
                  onChange={e => setOpenBalanceUsd(e.target.value)}
                  className="input-field"
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Fondo inicial Bs</label>
                <input
                  type="number"
                  value={openBalanceBs}
                  onChange={e => setOpenBalanceBs(e.target.value)}
                  className="input-field"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Notas (opcional)</label>
                <input
                  type="text"
                  value={openNotes}
                  onChange={e => setOpenNotes(e.target.value)}
                  className="input-field"
                  placeholder="Notas de apertura..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setOpenModal(null)} className="flex-1 px-4 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:text-white transition-colors">
                Cancelar
              </button>
              <button onClick={handleOpenSession} disabled={processing} className="flex-1 btn-primary flex items-center justify-center gap-2">
                {processing ? <Loader2 className="animate-spin" size={16} /> : <DoorOpen size={16} />}
                Abrir caja
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
