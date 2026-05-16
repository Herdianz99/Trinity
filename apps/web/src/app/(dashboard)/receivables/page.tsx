'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  HandCoins,
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Eye,
  DollarSign,
  AlertTriangle,
  X,
  CreditCard,
} from 'lucide-react';

interface Receivable {
  id: string;
  type: string;
  customerId: string | null;
  customer: { id: string; name: string; documentType: string; rif: string | null } | null;
  platformName: string | null;
  reference: string | null;
  invoiceId: string;
  invoice: { id: string; number: string };
  amountUsd: number;
  amountBs: number;
  exchangeRate: number;
  dueDate: string | null;
  status: string;
  paidAmountUsd: number;
  paidAt: string | null;
  notes: string | null;
  balanceUsd: number;
  payments: { id: string; amountUsd: number; createdAt: string; method: { id: string; name: string } | null }[];
  createdAt: string;
}

interface Summary {
  totalPendingUsd: number;
  totalOverdueUsd: number;
  byPlatform: { platformName: string; totalUsd: number; count: number }[];
  byStatus: { status: string; count: number; totalUsd: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  PARTIAL: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  PAID: 'text-green-400 border-green-500/30 bg-green-500/10',
  OVERDUE: 'text-red-400 border-red-500/30 bg-red-500/10',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Pagado',
  OVERDUE: 'Vencido',
};

const TYPE_LABELS: Record<string, string> = {
  CUSTOMER_CREDIT: 'Credito',
  FINANCING_PLATFORM: 'Plataforma',
};

const TYPE_COLORS: Record<string, string> = {
  CUSTOMER_CREDIT: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  FINANCING_PLATFORM: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
};

interface PaymentMethod {
  id: string;
  name: string;
}

export default function ReceivablesPage() {
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [config, setConfig] = useState<{ overdueWarningDays: number }>({ overdueWarningDays: 3 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [reference, setReference] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  // Modal states
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedReceivable, setSelectedReceivable] = useState<any>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [todayRate, setTodayRate] = useState<number>(0);
  const [processing, setProcessing] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  const fetchReceivables = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (type) params.set('type', type);
      if (status) params.set('status', status);
      if (reference) params.set('reference', reference);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (overdue) params.set('overdue', 'true');
      const res = await fetch(`/api/proxy/receivables?${params}`);
      const data = await res.json();
      setReceivables(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar cuentas por cobrar' });
    } finally {
      setLoading(false);
    }
  }, [page, type, status, reference, from, to, overdue]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/receivables/summary');
      const data = await res.json();
      setSummary(data);
    } catch {}
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/config');
      const data = await res.json();
      setConfig({ overdueWarningDays: data.overdueWarningDays || 3 });
    } catch {}
  }, []);

  const fetchRate = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/exchange-rate/today');
      const text = await res.text();
      if (text) { try { setTodayRate(JSON.parse(text)?.rate || 0); } catch {} }
    } catch {}
  }, []);

  useEffect(() => { fetchReceivables(); }, [fetchReceivables]);
  useEffect(() => { fetchSummary(); fetchConfig(); fetchRate(); }, [fetchSummary, fetchConfig, fetchRate]);

  useEffect(() => {
    fetch('/api/proxy/payment-methods/flat')
      .then(r => r.json())
      .then(data => setPaymentMethods(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  function isNearDue(dueDate: string | null) {
    if (!dueDate) return false;
    const due = new Date(dueDate);
    const now = new Date();
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= config.overdueWarningDays;
  }

  function isOverdue(dueDate: string | null, s: string) {
    if (s === 'PAID') return false;
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  }

  async function openPayModal(receivable: Receivable) {
    try {
      const res = await fetch(`/api/proxy/receivables/${receivable.id}`);
      const data = await res.json();
      setSelectedReceivable(data);
      setPayAmount(data.balanceUsd.toFixed(2));
      setPayMethod('');
      setPayReference('');
      setPayNotes('');
      setPayModalOpen(true);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar detalle' });
    }
  }

  async function openDetailModal(receivable: Receivable) {
    try {
      const res = await fetch(`/api/proxy/receivables/${receivable.id}`);
      const data = await res.json();
      setSelectedReceivable(data);
      setDetailModalOpen(true);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar detalle' });
    }
  }

  async function handlePay() {
    if (!selectedReceivable) return;
    setProcessing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/receivables/${selectedReceivable.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountUsd: parseFloat(payAmount),
          methodId: payMethod,
          reference: payReference || undefined,
          notes: payNotes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al registrar cobro');
      }
      setPayModalOpen(false);
      setMessage({ type: 'success', text: 'Cobro registrado exitosamente' });
      fetchReceivables();
      fetchSummary();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  }

  const casheaPending = summary?.byPlatform.find(p => p.platformName === 'Cashea')?.totalUsd || 0;
  const crediagroPending = summary?.byPlatform.find(p => p.platformName === 'Crediagro')?.totalUsd || 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <HandCoins className="text-green-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Cuentas por Cobrar</h1>
          <p className="text-sm text-slate-400">Gestion de creditos y plataformas de financiamiento</p>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`px-4 py-3 rounded-lg border ${message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
          {message.text}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <DollarSign className="text-blue-400" size={18} />
              </div>
              <span className="text-sm text-slate-400">Total por cobrar</span>
            </div>
            <p className="text-2xl font-bold text-blue-400">${summary.totalPendingUsd.toFixed(2)}</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-red-500/10">
                <AlertTriangle className="text-red-400" size={18} />
              </div>
              <span className="text-sm text-slate-400">Vencidas</span>
            </div>
            <p className="text-2xl font-bold text-red-400">${summary.totalOverdueUsd.toFixed(2)}</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CreditCard className="text-green-400" size={18} />
              </div>
              <span className="text-sm text-slate-400">Cashea pendiente</span>
            </div>
            <p className="text-2xl font-bold text-green-400">${casheaPending.toFixed(2)}</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CreditCard className="text-green-400" size={18} />
              </div>
              <span className="text-sm text-slate-400">Crediagro pendiente</span>
            </div>
            <p className="text-2xl font-bold text-green-400">${crediagroPending.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Tipo</label>
            <select value={type} onChange={e => { setType(e.target.value); setPage(1); }}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
              <option value="">Todos</option>
              <option value="CUSTOMER_CREDIT">Credito cliente</option>
              <option value="FINANCING_PLATFORM">Plataforma</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Estado</label>
            <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
              <option value="">Todos</option>
              <option value="PENDING">Pendiente</option>
              <option value="PARTIAL">Parcial</option>
              <option value="PAID">Pagado</option>
              <option value="OVERDUE">Vencido</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Ref / Orden</label>
            <input type="text" value={reference} onChange={e => { setReference(e.target.value); setPage(1); }}
              placeholder="N. orden..."
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 w-36" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Desde</label>
            <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Hasta</label>
            <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer pb-2">
            <input type="checkbox" checked={overdue} onChange={e => { setOverdue(e.target.checked); setPage(1); }}
              className="rounded border-slate-600" />
            Solo vencidas
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Tipo</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Cliente / Plataforma</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Factura</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Ref / Orden</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Monto USD</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Cobrado USD</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Saldo USD</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Vence</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-8">
                  <Loader2 className="animate-spin mx-auto text-slate-400" size={24} />
                </td></tr>
              ) : receivables.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-slate-500">No hay cuentas por cobrar</td></tr>
              ) : receivables.map(r => {
                const rowOverdue = isOverdue(r.dueDate, r.status);
                const rowNearDue = !rowOverdue && isNearDue(r.dueDate) && r.status !== 'PAID';
                return (
                  <tr key={r.id} className={`border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors ${rowOverdue ? 'bg-red-500/5' : rowNearDue ? 'bg-amber-500/5' : ''}`}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${TYPE_COLORS[r.type] || ''}`}>
                        {r.platformName || TYPE_LABELS[r.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-200">
                      {r.customer ? r.customer.name : r.platformName || '-'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={`/receivables/${r.id}`} className="text-green-400 hover:text-green-300 hover:underline">
                        {r.invoice.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                      {r.reference || '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-200">${r.amountUsd.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-slate-300">${r.paidAmountUsd.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-100">${r.balanceUsd.toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-300 text-xs">
                      {r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[r.status] || ''}`}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {r.status !== 'PAID' && (
                          <button onClick={() => openPayModal(r)}
                            className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/10 transition-colors" title="Registrar cobro">
                            <DollarSign size={16} />
                          </button>
                        )}
                        <button onClick={() => openDetailModal(r)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700/50 transition-colors" title="Ver detalle">
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <span className="text-sm text-slate-400">{total} resultados</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700/50 disabled:opacity-30">
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm text-slate-300">Pagina {page} de {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700/50 disabled:opacity-30">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pay Modal */}
      {payModalOpen && selectedReceivable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPayModalOpen(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
              <h2 className="text-lg font-semibold text-slate-100">Registrar Cobro</h2>
              <button onClick={() => setPayModalOpen(false)} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Info */}
              <div className="bg-slate-900/50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">{selectedReceivable.customer ? 'Cliente' : 'Plataforma'}</span>
                  <span className="text-slate-200">{selectedReceivable.customer?.name || selectedReceivable.platformName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Factura</span>
                  <span className="text-slate-200 font-mono">{selectedReceivable.invoice.number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Monto total</span>
                  <span className="text-slate-200">${selectedReceivable.amountUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Ya cobrado</span>
                  <span className="text-slate-200">${selectedReceivable.paidAmountUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span className="text-slate-300">Saldo pendiente</span>
                  <span className="text-green-400">${selectedReceivable.balanceUsd.toFixed(2)}</span>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Monto a cobrar (USD)</label>
                <input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
                {todayRate > 0 && payAmount && (
                  <p className="text-xs text-slate-500 mt-1">= Bs {(parseFloat(payAmount) * todayRate).toFixed(2)} (tasa: {todayRate})</p>
                )}
              </div>

              {/* Method */}
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Metodo de pago</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200">
                  <option value="">-- Seleccionar --</option>
                  {paymentMethods.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* Reference */}
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Referencia (opcional)</label>
                <input type="text" value={payReference} onChange={e => setPayReference(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" placeholder="Numero de referencia" />
              </div>

              {/* Rate display */}
              {todayRate > 0 && (
                <div className="bg-slate-900/50 rounded-lg p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Tasa del dia</span>
                    <span className="text-slate-200">Bs {todayRate.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <button onClick={handlePay} disabled={processing || !payAmount || parseFloat(payAmount) <= 0 || !payMethod}
                className="w-full py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                {processing ? <Loader2 className="animate-spin" size={18} /> : <DollarSign size={18} />}
                Confirmar cobro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModalOpen && selectedReceivable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDetailModalOpen(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
              <h2 className="text-lg font-semibold text-slate-100">Detalle de Cuenta por Cobrar</h2>
              <button onClick={() => setDetailModalOpen(false)} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Info */}
              <div className="bg-slate-900/50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Tipo</span>
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${TYPE_COLORS[selectedReceivable.type]}`}>
                    {selectedReceivable.platformName || TYPE_LABELS[selectedReceivable.type]}
                  </span>
                </div>
                {selectedReceivable.customer && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cliente</span>
                    <span className="text-slate-200">{selectedReceivable.customer.name}</span>
                  </div>
                )}
                {selectedReceivable.platformName && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Plataforma</span>
                    <span className="text-slate-200">{selectedReceivable.platformName}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Factura</span>
                  <span className="text-slate-200 font-mono">{selectedReceivable.invoice.number}</span>
                </div>
                {selectedReceivable.reference && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Ref / Orden</span>
                    <span className="text-slate-200 font-mono">{selectedReceivable.reference}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Fecha creacion</span>
                  <span className="text-slate-200">{new Date(selectedReceivable.createdAt).toLocaleString()}</span>
                </div>
                {selectedReceivable.dueDate && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Fecha vencimiento</span>
                    <span className="text-slate-200">{new Date(selectedReceivable.dueDate).toLocaleDateString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Tasa al crear</span>
                  <span className="text-slate-200">Bs {selectedReceivable.exchangeRate.toFixed(2)}</span>
                </div>
                <div className="border-t border-slate-700/50 pt-2 mt-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Monto USD</span>
                    <span className="text-slate-200">${selectedReceivable.amountUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Monto Bs</span>
                    <span className="text-slate-200">Bs {selectedReceivable.amountBs.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cobrado</span>
                    <span className="text-slate-200">${selectedReceivable.paidAmountUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span className="text-slate-300">Saldo</span>
                    <span className="text-green-400">${selectedReceivable.balanceUsd.toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Estado</span>
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[selectedReceivable.status]}`}>
                    {STATUS_LABELS[selectedReceivable.status]}
                  </span>
                </div>
              </div>

              {/* Payments history */}
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-2">Historial de Pagos</h3>
                {selectedReceivable.payments && selectedReceivable.payments.length > 0 ? (
                  <div className="bg-slate-900/50 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700/50">
                          <th className="text-left px-3 py-2 text-slate-400">Fecha</th>
                          <th className="text-right px-3 py-2 text-slate-400">USD</th>
                          <th className="text-right px-3 py-2 text-slate-400">Bs</th>
                          <th className="text-left px-3 py-2 text-slate-400">Metodo</th>
                          <th className="text-left px-3 py-2 text-slate-400">Ref</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedReceivable.payments.map((p: any) => (
                          <tr key={p.id} className="border-b border-slate-700/30">
                            <td className="px-3 py-2 text-slate-300 text-xs">{new Date(p.createdAt).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right text-slate-200">${p.amountUsd.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right text-slate-300">Bs {p.amountBs.toFixed(2)}</td>
                            <td className="px-3 py-2 text-slate-300">{p.method?.name || 'Metodo'}</td>
                            <td className="px-3 py-2 text-slate-400 text-xs">{p.reference || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 bg-slate-900/50 rounded-lg p-3">Sin pagos registrados</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
