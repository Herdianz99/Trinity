'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, RotateCw, CheckCircle2, AlertTriangle, ToggleLeft, ToggleRight, BookOpen } from 'lucide-react';

const fmt = (n: number) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Row {
  sessionId: string;
  registerName: string;
  openedBy: string;
  oldUsd: number; oldBs: number;
  ledgerUsd: number; ledgerBs: number;
}

export default function CashLedgerPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [useCashLedger, setUseCashLedger] = useState(false);
  const [togglingFlag, setTogglingFlag] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => { document.title = 'Reconstruir y comparar ledger | Trinity ERP'; }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await fetch('/api/proxy/config').then(r => r.ok ? r.json() : null).catch(() => null);
      if (cfg) setUseCashLedger(!!cfg.useCashLedger);
      const sessions = await fetch('/api/proxy/cash-sessions?status=OPEN').then(r => r.ok ? r.json() : []).catch(() => []);
      const list = Array.isArray(sessions) ? sessions : [];
      const built = await Promise.all(list.map(async (s: any) => {
        const sum = await fetch(`/api/proxy/cash-sessions/${s.id}/summary`).then(r => r.ok ? r.json() : null).catch(() => null);
        return {
          sessionId: s.id,
          registerName: s.cashRegister?.name || s.cashRegister?.code || '—',
          openedBy: s.openedBy?.name || '',
          oldUsd: sum?.cashExpectedUsdOld ?? 0, oldBs: sum?.cashExpectedBsOld ?? 0,
          ledgerUsd: sum?.ledgerCashExpectedUsd ?? 0, ledgerBs: sum?.ledgerCashExpectedBs ?? 0,
        } as Row;
      }));
      setRows(built);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function backfill() {
    setBackfilling(true); setMsg(null);
    try {
      const res = await fetch('/api/proxy/cash/backfill-ledger-open', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error al reconstruir');
      setMsg({ type: 'success', text: `Ledger reconstruido para ${json.count ?? ''} sesión(es) abierta(s)` });
      await load();
    } catch (err: any) { setMsg({ type: 'error', text: err.message }); }
    finally { setBackfilling(false); }
  }

  async function toggleFlag(next: boolean) {
    setTogglingFlag(true); setMsg(null);
    try {
      const res = await fetch('/api/proxy/config', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useCashLedger: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error al cambiar el interruptor');
      setUseCashLedger(next);
      setMsg({ type: 'success', text: next ? 'Arqueo ahora usa el libro mayor (ledger)' : 'Arqueo volvió al método anterior' });
      await load();
    } catch (err: any) { setMsg({ type: 'error', text: err.message }); }
    finally { setTogglingFlag(false); }
  }

  const allMatch = rows.length > 0 && rows.every(r =>
    Math.abs(r.oldUsd - r.ledgerUsd) < 0.02 && Math.abs(r.oldBs - r.ledgerBs) < 0.02);

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/cash')} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
          <BookOpen className="text-indigo-400" size={22} />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Reconstruir y comparar ledger</h1>
          <p className="text-slate-400 text-sm">Compara el arqueo del libro mayor (tabla madre) vs el método actual, por sesión abierta</p>
        </div>
        <button onClick={() => router.push('/cash/ledger/entries')}
          className="btn-secondary !py-2 text-sm flex items-center gap-2" title="Ver todas las filas de la tabla madre">
          <BookOpen size={15} /> Ver movimientos
        </button>
        <button onClick={load} className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700/50" title="Refrescar"><RotateCw size={16} /></button>
      </div>

      {msg && (
        <div className={`px-4 py-2.5 rounded-lg text-sm border ${msg.type === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>{msg.text}</div>
      )}

      {/* Flag + acciones */}
      <div className="card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-200">Arqueo oficial:</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${useCashLedger ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' : 'bg-slate-600/30 text-slate-300 border-slate-600'}`}>
              {useCashLedger ? 'Libro mayor (ledger)' : 'Método anterior'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Enciéndelo solo cuando todas las sesiones cuadren. Apagarlo revierte al instante.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={backfill} disabled={backfilling}
            className="btn-secondary !py-2 text-sm flex items-center gap-2 disabled:opacity-50">
            {backfilling ? <Loader2 className="animate-spin" size={15} /> : <RotateCw size={15} />} Reconstruir ledger
          </button>
          <button onClick={() => toggleFlag(!useCashLedger)} disabled={togglingFlag || (!useCashLedger && !allMatch)}
            title={!useCashLedger && !allMatch ? 'Primero deben cuadrar todas las sesiones' : ''}
            className={`!py-2 px-3 text-sm rounded-lg font-medium flex items-center gap-2 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${useCashLedger ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'}`}>
            {togglingFlag ? <Loader2 className="animate-spin" size={15} /> : useCashLedger ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
            {useCashLedger ? 'Volver al método anterior' : 'Usar libro mayor'}
          </button>
        </div>
      </div>

      {/* Comparación */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-indigo-500" size={28} /></div>
      ) : rows.length === 0 ? (
        <div className="card p-12 text-center text-slate-500 text-sm">No hay sesiones de caja abiertas</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/40 text-slate-400 text-xs">
                <th className="text-left px-4 py-2.5 font-medium">Caja</th>
                <th className="text-right px-4 py-2.5 font-medium">Actual (USD / Bs)</th>
                <th className="text-right px-4 py-2.5 font-medium">Ledger (USD / Bs)</th>
                <th className="text-right px-4 py-2.5 font-medium">Diferencia (USD / Bs)</th>
                <th className="text-center px-4 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const dUsd = Math.round((r.ledgerUsd - r.oldUsd) * 100) / 100;
                const dBs = Math.round((r.ledgerBs - r.oldBs) * 100) / 100;
                const ok = Math.abs(dUsd) < 0.02 && Math.abs(dBs) < 0.02;
                return (
                  <tr key={r.sessionId} className="border-b border-slate-700/30">
                    <td className="px-4 py-2.5 text-white">{r.registerName}<span className="block text-[11px] text-slate-500">{r.openedBy}</span></td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-300">${fmt(r.oldUsd)}<span className="block text-[11px] text-slate-500">Bs {fmt(r.oldBs)}</span></td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-300">${fmt(r.ledgerUsd)}<span className="block text-[11px] text-slate-500">Bs {fmt(r.ledgerBs)}</span></td>
                    <td className={`px-4 py-2.5 text-right font-mono ${ok ? 'text-slate-400' : 'text-red-400 font-semibold'}`}>{dUsd > 0 ? '+' : ''}{fmt(dUsd)}<span className="block text-[11px]">{dBs > 0 ? '+' : ''}{fmt(dBs)}</span></td>
                    <td className="px-4 py-2.5 text-center">
                      {ok ? <span className="inline-flex items-center gap-1 text-green-400 text-xs"><CheckCircle2 size={14} /> Cuadra</span>
                          : <span className="inline-flex items-center gap-1 text-red-400 text-xs"><AlertTriangle size={14} /> No cuadra</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-slate-500">
        Flujo: 1) <b>Reconstruir ledger</b> → 2) revisar que todas <b>cuadren</b> → 3) <b>Usar libro mayor</b>. Si algo se ve raro, <b>Volver al método anterior</b> lo revierte al instante.
      </p>
    </div>
  );
}
