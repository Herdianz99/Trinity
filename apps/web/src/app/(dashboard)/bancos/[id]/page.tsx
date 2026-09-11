'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Landmark, ArrowLeft, Plus, Loader2, X, Trash2, ArrowLeftRight, CheckCircle } from 'lucide-react';

interface Movement {
  id: string;
  date: string;
  direction: 'IN' | 'OUT';
  amount: number;
  type: string;
  reference: string | null;
  description: string | null;
  sourceType: string;
  sourceId: string | null;
  reconciled: boolean;
  runningBalance: number;
}
interface Account {
  id: string;
  name: string;
  bankName: string;
  currency: string;
  accountType: string;
}
interface LedgerResp {
  account: Account;
  movements: Movement[];
  balance: number;
  reconciledBalance: number;
}

const MANUAL_TYPES = ['COMISION', 'IGTF', 'INTERES', 'NOTA_DEBITO', 'NOTA_CREDITO', 'AJUSTE'];
const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function BankAccountDetailPage() {
  const { id } = useParams() as { id: string };
  const [data, setData] = useState<LedgerResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filters, setFilters] = useState({ from: '', to: '', status: 'all' });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [manualOpen, setManualOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [manual, setManual] = useState({ direction: 'OUT', type: 'COMISION', amount: 0, exchangeRate: 0, reference: '', description: '', date: todayStr() });
  const [transfer, setTransfer] = useState({ toAccountId: '', amountFrom: 0, amountTo: 0, exchangeRate: 0, reference: '', description: '', date: todayStr() });

  // Conciliación (check-off)
  const [reconcileMode, setReconcileMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statementDate, setStatementDate] = useState(todayStr());
  const [reconSaving, setReconSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filters.from) qs.set('from', filters.from);
      if (filters.to) qs.set('to', filters.to);
      if (filters.status !== 'all') qs.set('status', filters.status);
      const res = await fetch(`/api/proxy/bancos/accounts/${id}/ledger?${qs.toString()}`);
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [id, filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/proxy/bancos/accounts').then((r) => r.json()).then(setAccounts).catch(() => {});
  }, []);
  useEffect(() => {
    if (data?.account) document.title = `${data.account.name} | Trinity ERP`;
  }, [data?.account]);

  // Al cargar datos, la selección de conciliación parte del estado ya persistido.
  useEffect(() => {
    if (data) setSelected(new Set(data.movements.filter((m) => m.reconciled).map((m) => m.id)));
  }, [data]);

  function toggleRow(mid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(mid)) next.delete(mid);
      else next.add(mid);
      return next;
    });
  }

  async function saveReconcile() {
    if (!data) return;
    const toReconcile = data.movements.filter((m) => selected.has(m.id) && !m.reconciled).map((m) => m.id);
    const toUnreconcile = data.movements.filter((m) => !selected.has(m.id) && m.reconciled).map((m) => m.id);
    setReconSaving(true);
    try {
      if (toReconcile.length) {
        await fetch('/api/proxy/bancos/reconcile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ movementIds: toReconcile, reconciled: true, statementDate: statementDate || undefined }),
        });
      }
      if (toUnreconcile.length) {
        await fetch('/api/proxy/bancos/reconcile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ movementIds: toUnreconcile, reconciled: false }),
        });
      }
      setMessage({ type: 'success', text: `Conciliación guardada (${toReconcile.length} marcados, ${toUnreconcile.length} desmarcados)` });
      setReconcileMode(false);
      load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setReconSaving(false);
    }
  }

  const acc = data?.account;
  const isUsd = acc?.currency === 'USD';
  const sym = isUsd ? '$ ' : 'Bs ';

  async function submitManual() {
    if (!manual.amount || manual.amount <= 0) { setMessage({ type: 'error', text: 'El monto debe ser mayor a 0' }); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/proxy/bancos/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankAccountId: id,
          date: manual.date,
          direction: manual.direction,
          amount: Number(manual.amount),
          exchangeRate: Number(manual.exchangeRate) || 0,
          type: manual.type,
          reference: manual.reference || undefined,
          description: manual.description || undefined,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Error'); }
      setManualOpen(false);
      setManual({ direction: 'OUT', type: 'COMISION', amount: 0, exchangeRate: 0, reference: '', description: '', date: todayStr() });
      setMessage({ type: 'success', text: 'Movimiento registrado' });
      load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally { setSaving(false); }
  }

  async function submitTransfer() {
    if (!transfer.toAccountId) { setMessage({ type: 'error', text: 'Elige la cuenta destino' }); return; }
    if (!transfer.amountFrom || !transfer.amountTo) { setMessage({ type: 'error', text: 'Indica los montos' }); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/proxy/bancos/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAccountId: id,
          toAccountId: transfer.toAccountId,
          date: transfer.date,
          amountFrom: Number(transfer.amountFrom),
          amountTo: Number(transfer.amountTo),
          exchangeRate: Number(transfer.exchangeRate) || 0,
          reference: transfer.reference || undefined,
          description: transfer.description || undefined,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Error'); }
      setTransferOpen(false);
      setTransfer({ toAccountId: '', amountFrom: 0, amountTo: 0, exchangeRate: 0, reference: '', description: '', date: todayStr() });
      setMessage({ type: 'success', text: 'Traspaso registrado' });
      load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally { setSaving(false); }
  }

  async function deleteMovement(mid: string) {
    if (!confirm('¿Borrar este movimiento manual?')) return;
    try {
      const res = await fetch(`/api/proxy/bancos/movements/${mid}`, { method: 'DELETE' });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Error'); }
      setMessage({ type: 'success', text: 'Movimiento borrado' });
      load();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  const signed = (m: Movement) => (m.direction === 'IN' ? m.amount : -m.amount);
  const reconciledLive = data
    ? reconcileMode
      ? Math.round((data.balance - data.movements.filter((m) => !selected.has(m.id)).reduce((s, m) => s + signed(m), 0)) * 100) / 100
      : data.reconciledBalance
    : 0;
  const partidas = data ? Math.round((data.balance - reconciledLive) * 100) / 100 : 0;

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/bancos" className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white">
            <ArrowLeft size={20} />
          </Link>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <Landmark className="text-emerald-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{acc?.name || 'Cuenta'}</h1>
            <p className="text-slate-400 text-sm">{acc ? `${acc.bankName} · ${acc.accountType} · ${acc.currency}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setReconcileMode((v) => !v)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${reconcileMode ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'btn-secondary'}`}>
            <CheckCircle size={16} /> {reconcileMode ? 'Salir de conciliar' : 'Conciliar'}
          </button>
          <button onClick={() => setTransferOpen(true)} className="btn-secondary flex items-center gap-2"><ArrowLeftRight size={16} /> Traspaso</button>
          <button onClick={() => setManualOpen(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Movimiento manual</button>
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl p-5 bg-slate-800/50 border border-slate-700/40">
            <p className="text-xs text-slate-500 uppercase">Saldo según libro</p>
            <p className="text-2xl font-bold text-white font-mono">{sym}{fmt(data.balance)}</p>
          </div>
          <div className="rounded-xl p-5 bg-slate-800/50 border border-slate-700/40">
            <p className="text-xs text-slate-500 uppercase">Saldo conciliado {reconcileMode && <span className="text-emerald-400">(en vivo)</span>}</p>
            <p className="text-2xl font-bold text-emerald-400 font-mono">{sym}{fmt(reconciledLive)}</p>
          </div>
          <div className="rounded-xl p-5 bg-slate-800/50 border border-slate-700/40">
            <p className="text-xs text-slate-500 uppercase">Partidas conciliatorias</p>
            <p className={`text-2xl font-bold font-mono ${Math.abs(partidas) < 0.01 ? 'text-slate-400' : 'text-amber-400'}`}>{sym}{fmt(partidas)}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-sm">
          <span className="text-slate-400 block text-xs">Desde</span>
          <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200" />
        </label>
        <label className="text-sm">
          <span className="text-slate-400 block text-xs">Hasta</span>
          <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200" />
        </label>
        <label className="text-sm">
          <span className="text-slate-400 block text-xs">Estado</span>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200">
            <option value="all">Todos</option>
            <option value="pending">Sin conciliar</option>
            <option value="reconciled">Conciliados</option>
          </select>
        </label>
      </div>

      {reconcileMode && (
        <div className="mb-4 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex flex-wrap items-center gap-3">
          <span className="text-sm text-emerald-300">Marca los movimientos que ya aparecen en el estado de cuenta del banco.</span>
          <label className="text-sm flex items-center gap-2 ml-auto">
            <span className="text-slate-400">Fecha del estado:</span>
            <input type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200" />
          </label>
          <button onClick={saveReconcile} disabled={reconSaving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            {reconSaving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />} Guardar conciliación
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-slate-400">Cargando…</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/30 text-slate-400">
                <th className="text-left px-3 py-3 font-medium">Fecha</th>
                <th className="text-left px-3 py-3 font-medium">Tipo</th>
                <th className="text-left px-3 py-3 font-medium">Referencia</th>
                <th className="text-left px-3 py-3 font-medium">Descripción</th>
                <th className="text-right px-3 py-3 font-medium">Entrada</th>
                <th className="text-right px-3 py-3 font-medium">Salida</th>
                <th className="text-right px-3 py-3 font-medium">Saldo</th>
                <th className="text-center px-3 py-3 font-medium">Concil.</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data?.movements.map((m) => (
                <tr key={m.id} className="border-b border-slate-700/30 hover:bg-slate-800/30">
                  <td className="px-3 py-2.5 text-slate-300 font-mono whitespace-nowrap">{m.date.slice(0, 10)}</td>
                  <td className="px-3 py-2.5 text-slate-300">{m.type}</td>
                  <td className="px-3 py-2.5 text-slate-400 font-mono">{m.reference || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-400">{m.description || '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-400">{m.direction === 'IN' ? fmt(m.amount) : ''}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-red-400">{m.direction === 'OUT' ? fmt(m.amount) : ''}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-white">{fmt(m.runningBalance)}</td>
                  <td className="px-3 py-2.5 text-center">
                    {reconcileMode ? (
                      <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleRow(m.id)} className="w-4 h-4 accent-emerald-500 cursor-pointer" />
                    ) : m.reconciled ? (
                      <CheckCircle size={14} className="text-green-400 inline" />
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {m.sourceType === 'MANUAL' && !m.reconciled && (
                      <button onClick={() => deleteMovement(m.id)} className="text-red-400 hover:text-red-300"><Trash2 size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
              {(!data || data.movements.length === 0) && (
                <tr><td colSpan={9} className="text-center py-12 text-slate-500">Sin movimientos en el periodo.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal movimiento manual */}
      {manualOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Movimiento manual</h2>
              <button onClick={() => setManualOpen(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm"><span className="text-slate-400">Tipo</span>
                <select value={manual.type} onChange={(e) => setManual({ ...manual, type: e.target.value })} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200">
                  {MANUAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="text-sm"><span className="text-slate-400">Dirección</span>
                <select value={manual.direction} onChange={(e) => setManual({ ...manual, direction: e.target.value })} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200">
                  <option value="OUT">Salida (−)</option>
                  <option value="IN">Entrada (+)</option>
                </select>
              </label>
              <label className="text-sm"><span className="text-slate-400">Monto ({acc?.currency})</span>
                <input type="number" value={manual.amount} onChange={(e) => setManual({ ...manual, amount: Number(e.target.value) })} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono" />
              </label>
              {isUsd && (
                <label className="text-sm"><span className="text-slate-400">Tasa (equiv. Bs)</span>
                  <input type="number" value={manual.exchangeRate} onChange={(e) => setManual({ ...manual, exchangeRate: Number(e.target.value) })} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono" />
                </label>
              )}
              <label className="text-sm"><span className="text-slate-400">Fecha</span>
                <input type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
              </label>
              <label className="text-sm"><span className="text-slate-400">Referencia</span>
                <input value={manual.reference} onChange={(e) => setManual({ ...manual, reference: e.target.value })} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
              </label>
              <label className="col-span-2 text-sm"><span className="text-slate-400">Descripción</span>
                <input value={manual.description} onChange={(e) => setManual({ ...manual, description: e.target.value })} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setManualOpen(false)} className="btn-secondary">Cancelar</button>
              <button onClick={submitManual} disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Registrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal traspaso */}
      {transferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Traspaso a otra cuenta</h2>
              <button onClick={() => setTransferOpen(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 text-sm"><span className="text-slate-400">Cuenta destino</span>
                <select value={transfer.toAccountId} onChange={(e) => setTransfer({ ...transfer, toAccountId: e.target.value })} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200">
                  <option value="">— elegir —</option>
                  {accounts.filter((a) => a.id !== id).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                </select>
              </label>
              <label className="text-sm"><span className="text-slate-400">Sale (de esta)</span>
                <input type="number" value={transfer.amountFrom} onChange={(e) => setTransfer({ ...transfer, amountFrom: Number(e.target.value), amountTo: transfer.amountTo || Number(e.target.value) })} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono" />
              </label>
              <label className="text-sm"><span className="text-slate-400">Entra (a destino)</span>
                <input type="number" value={transfer.amountTo} onChange={(e) => setTransfer({ ...transfer, amountTo: Number(e.target.value) })} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono" />
              </label>
              <label className="text-sm"><span className="text-slate-400">Tasa (si cambia moneda)</span>
                <input type="number" value={transfer.exchangeRate} onChange={(e) => setTransfer({ ...transfer, exchangeRate: Number(e.target.value) })} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono" />
              </label>
              <label className="text-sm"><span className="text-slate-400">Fecha</span>
                <input type="date" value={transfer.date} onChange={(e) => setTransfer({ ...transfer, date: e.target.value })} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
              </label>
              <label className="col-span-2 text-sm"><span className="text-slate-400">Descripción / referencia</span>
                <input value={transfer.description} onChange={(e) => setTransfer({ ...transfer, description: e.target.value })} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setTransferOpen(false)} className="btn-secondary">Cancelar</button>
              <button onClick={submitTransfer} disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <ArrowLeftRight size={16} />} Traspasar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
