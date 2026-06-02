'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  HandCoins,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Eye,
  DollarSign,
  AlertTriangle,
  X,
  CreditCard,
  FileText,
  Plus,
  Banknote,
} from 'lucide-react';

interface Receivable {
  id: string;
  number: string | null;
  type: string;
  customerId: string | null;
  customer: { id: string; name: string; documentType: string; rif: string | null } | null;
  platformName: string | null;
  reference: string | null;
  invoiceId: string | null;
  invoice: { id: string; number: string } | null;
  documentNumber: string | null;
  description: string | null;
  amountUsd: number;
  amountBs: number;
  exchangeRate: number;
  dueDate: string | null;
  status: string;
  paidAmountUsd: number;
  paidAt: string | null;
  notes: string | null;
  balanceUsd: number;
  payments: { id: string; amountUsd: number; createdAt: string; receiptId?: string | null; receipt?: { id: string; number: string } | null; method: { id: string; name: string } | null }[];
  createdAt: string;
}

interface Summary {
  totalPendingUsd: number;
  totalOverdueUsd: number;
  byPlatform: { platformName: string; totalUsd: number; count: number }[];
  byStatus: { status: string; count: number; totalUsd: number }[];
}

interface CustomerAdvance {
  id: string;
  customerId: string;
  customer: { id: string; name: string } | null;
  amountUsd: number;
  amountBs: number;
  exchangeRate: number;
  paidAmountUsd: number;
  paidAmountBs: number;
  remainingUsd: number;
  remainingBs: number;
  status: string;
  reference: string | null;
  notes: string | null;
  method: { id: string; name: string } | null;
  createdAt: string;
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

const ADVANCE_STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'text-green-400 border-green-500/30 bg-green-500/10',
  PARTIAL: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  CONSUMED: 'text-slate-400 border-slate-500/30 bg-slate-500/10',
};

const ADVANCE_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Disponible',
  PARTIAL: 'Parcial',
  CONSUMED: 'Consumido',
};

const TYPE_LABELS: Record<string, string> = {
  CUSTOMER_CREDIT: 'Credito',
  FINANCING_PLATFORM: 'Plataforma',
  MANUAL: 'Manual',
};

const TYPE_COLORS: Record<string, string> = {
  CUSTOMER_CREDIT: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  FINANCING_PLATFORM: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
  MANUAL: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
};

export default function ReceivablesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'cxc' | 'advances'>('cxc');
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

  // Detail modal states
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedReceivable, setSelectedReceivable] = useState<any>(null);

  // Advance modal
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({ customerId: '', amountUsd: '', amountBs: '', methodId: '', cashSessionId: '', reference: '', notes: '' });
  const [savingAdvance, setSavingAdvance] = useState(false);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<{ id: string; name: string }[]>([]);
  const [openCashSessions, setOpenCashSessions] = useState<{ id: string; label: string }[]>([]);

  // Exchange rate
  const [exchangeRate, setExchangeRate] = useState<number>(0);

  // Advances tab
  const [advances, setAdvances] = useState<CustomerAdvance[]>([]);
  const [advancesTotal, setAdvancesTotal] = useState(0);
  const [advancesPage, setAdvancesPage] = useState(1);
  const [advancesTotalPages, setAdvancesTotalPages] = useState(1);
  const [advancesLoading, setAdvancesLoading] = useState(false);
  const [advancesStatus, setAdvancesStatus] = useState('');

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
      if (!res.ok) return;
      const data = await res.json();
      if (data && typeof data.totalPendingUsd === 'number') {
        setSummary(data);
      }
    } catch {}
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/config');
      const data = await res.json();
      setConfig({ overdueWarningDays: data.overdueWarningDays || 3 });
    } catch {}
  }, []);

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/customers?limit=500');
      const data = await res.json();
      setCustomers((data.data || []).map((c: any) => ({ id: c.id, name: c.name })));
    } catch {}
  }, []);

  const fetchPaymentMethods = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/payment-methods');
      const data = await res.json();
      const methods = (Array.isArray(data) ? data : data.data || []).filter((pm: any) => pm.isActive && pm.id !== 'pm_saldo_favor');
      setPaymentMethods(methods.map((pm: any) => ({ id: pm.id, name: pm.name })));
    } catch {}
  }, []);

  const fetchExchangeRate = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/exchange-rates/today');
      const data = await res.json();
      if (data.rate) setExchangeRate(data.rate);
    } catch {}
  }, []);

  const fetchAdvances = useCallback(async () => {
    setAdvancesLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', advancesPage.toString());
      params.set('limit', '20');
      if (advancesStatus) params.set('status', advancesStatus);
      const res = await fetch(`/api/proxy/customer-advances?${params}`);
      const data = await res.json();
      setAdvances(data.data || []);
      setAdvancesTotal(data.total || 0);
      setAdvancesTotalPages(data.totalPages || 1);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar anticipos' });
    } finally {
      setAdvancesLoading(false);
    }
  }, [advancesPage, advancesStatus]);

  const fetchOpenCashSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/cash-registers');
      const data = await res.json();
      const registers = Array.isArray(data) ? data : data.data || [];
      const sessions: { id: string; label: string }[] = [];
      for (const reg of registers) {
        const openSessions = reg.sessions || [];
        for (const s of openSessions) {
          sessions.push({ id: s.id, label: reg.name || `Caja ${reg.code || reg.id.slice(-4)}` });
        }
      }
      setOpenCashSessions(sessions);
    } catch {}
  }, []);

  async function submitAdvance() {
    if (!advanceForm.customerId || !advanceForm.amountUsd || !advanceForm.methodId || !advanceForm.cashSessionId) return;
    setSavingAdvance(true);
    try {
      const res = await fetch('/api/proxy/customer-advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: advanceForm.customerId,
          amountUsd: Number(advanceForm.amountUsd),
          methodId: advanceForm.methodId,
          cashSessionId: advanceForm.cashSessionId,
          reference: advanceForm.reference || undefined,
          notes: advanceForm.notes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error al registrar anticipo');
      }
      setMessage({ type: 'success', text: 'Anticipo registrado exitosamente' });
      setAdvanceModalOpen(false);
      setAdvanceForm({ customerId: '', amountUsd: '', amountBs: '', methodId: '', cashSessionId: '', reference: '', notes: '' });
      fetchAdvances();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSavingAdvance(false);
    }
  }

  useEffect(() => { document.title = 'Cuentas por Cobrar | Trinity ERP'; }, []);
  useEffect(() => { fetchReceivables(); }, [fetchReceivables]);
  useEffect(() => { fetchAdvances(); }, [fetchAdvances]);
  useEffect(() => { fetchSummary(); fetchConfig(); fetchCustomers(); fetchPaymentMethods(); fetchOpenCashSessions(); fetchExchangeRate(); }, [fetchSummary, fetchConfig, fetchCustomers, fetchPaymentMethods, fetchOpenCashSessions, fetchExchangeRate]);

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

  const casheaPending = summary?.byPlatform?.find(p => p.platformName === 'Cashea')?.totalUsd || 0;
  const crediagroPending = summary?.byPlatform?.find(p => p.platformName === 'Crediagro')?.totalUsd || 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <HandCoins className="text-green-400" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Cuentas por Cobrar</h1>
            <p className="text-sm text-slate-400">Gestion de creditos y plataformas de financiamiento</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setAdvanceForm({ customerId: '', amountUsd: '', amountBs: '', methodId: '', cashSessionId: openCashSessions.length === 1 ? openCashSessions[0].id : '', reference: '', notes: '' }); setAdvanceModalOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          >
            <Banknote size={16} /> Registrar anticipo
          </button>
          <button
            onClick={() => router.push('/receivables/new')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Registrar documento
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`px-4 py-3 rounded-lg border ${message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('cxc')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'cxc' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
        >
          Cuentas por Cobrar
        </button>
        <button
          onClick={() => setActiveTab('advances')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'advances' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
        >
          Anticipos
        </button>
      </div>

      {activeTab === 'cxc' && (<>
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
            <p className="text-2xl font-bold text-blue-400">${(summary.totalPendingUsd ?? 0).toFixed(2)}</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-red-500/10">
                <AlertTriangle className="text-red-400" size={18} />
              </div>
              <span className="text-sm text-slate-400">Vencidas</span>
            </div>
            <p className="text-2xl font-bold text-red-400">${(summary.totalOverdueUsd ?? 0).toFixed(2)}</p>
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
              <option value="MANUAL">Manual</option>
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
                        {r.number || r.invoice?.number || r.documentNumber || '-'}
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
                          <button
                            onClick={() => router.push(`/receipts/new?type=COLLECTION&receivableId=${r.id}`)}
                            className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/10 transition-colors" title="Cobrar via recibo">
                            <DollarSign size={16} />
                          </button>
                        )}
                        <button onClick={() => router.push(`/receivables/${r.id}`)}
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

      </>)}

      {activeTab === 'advances' && (
        <>
          {/* Advances Filters */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Estado</label>
                <select value={advancesStatus} onChange={e => { setAdvancesStatus(e.target.value); setAdvancesPage(1); }}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
                  <option value="">Todos</option>
                  <option value="AVAILABLE">Disponible</option>
                  <option value="PARTIAL">Parcial</option>
                  <option value="CONSUMED">Consumido</option>
                </select>
              </div>
            </div>
          </div>

          {/* Advances Table */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Cliente</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Monto USD</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Monto Bs</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Restante USD</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Estado</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Metodo</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  {advancesLoading ? (
                    <tr><td colSpan={8} className="text-center py-8">
                      <Loader2 className="animate-spin mx-auto text-slate-400" size={24} />
                    </td></tr>
                  ) : advances.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-slate-500">No hay anticipos registrados</td></tr>
                  ) : advances.map(a => (
                    <tr key={a.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 text-slate-200">{a.customer?.name || '-'}</td>
                      <td className="px-4 py-3 text-right text-slate-200">${a.amountUsd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-slate-300">Bs {a.amountBs.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-100">${(a.remainingUsd ?? (a.amountUsd - a.paidAmountUsd)).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${ADVANCE_STATUS_COLORS[a.status] || ''}`}>
                          {ADVANCE_STATUS_LABELS[a.status] || a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{a.method?.name || '-'}</td>
                      <td className="px-4 py-3 text-slate-300 text-xs">{new Date(a.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-xs text-slate-400 font-mono">{a.reference || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Advances Pagination */}
            {advancesTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
                <span className="text-sm text-slate-400">{advancesTotal} resultados</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setAdvancesPage(p => Math.max(1, p - 1))} disabled={advancesPage === 1}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700/50 disabled:opacity-30">
                    <ChevronLeft size={18} />
                  </button>
                  <span className="text-sm text-slate-300">Pagina {advancesPage} de {advancesTotalPages}</span>
                  <button onClick={() => setAdvancesPage(p => Math.min(advancesTotalPages, p + 1))} disabled={advancesPage === advancesTotalPages}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700/50 disabled:opacity-30">
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
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
                {selectedReceivable.invoice ? (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Factura</span>
                    <span className="text-slate-200 font-mono">{selectedReceivable.invoice.number}</span>
                  </div>
                ) : selectedReceivable.documentNumber ? (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Documento</span>
                    <span className="text-slate-200 font-mono">{selectedReceivable.documentNumber}</span>
                  </div>
                ) : null}
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

              {/* Action button */}
              {selectedReceivable.status !== 'PAID' && (
                <button
                  onClick={() => {
                    setDetailModalOpen(false);
                    router.push(`/receipts/new?type=COLLECTION&receivableId=${selectedReceivable.id}`);
                  }}
                  className="w-full py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <DollarSign size={18} />
                  Cobrar via recibo
                </button>
              )}

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
                          <th className="text-left px-3 py-2 text-slate-400">Recibo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedReceivable.payments.map((p: any) => (
                          <tr key={p.id} className="border-b border-slate-700/30">
                            <td className="px-3 py-2 text-slate-300 text-xs">{new Date(p.createdAt).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right text-slate-200">${p.amountUsd.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right text-slate-300">Bs {p.amountBs.toFixed(2)}</td>
                            <td className="px-3 py-2 text-slate-300">{p.method?.name || 'Metodo'}</td>
                            <td className="px-3 py-2">
                              {p.receipt ? (
                                <Link
                                  href={`/receipts/${p.receipt.id}`}
                                  className="inline-flex items-center gap-1 text-green-400 hover:text-green-300 text-xs"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <FileText size={12} />
                                  {p.receipt.number}
                                </Link>
                              ) : (
                                <span className="text-slate-500 text-xs">-</span>
                              )}
                            </td>
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

      {/* Advance Modal */}
      {advanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setAdvanceModalOpen(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
              <h2 className="text-lg font-semibold text-slate-100">Registrar Anticipo de Cliente</h2>
              <button onClick={() => setAdvanceModalOpen(false)} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {openCashSessions.length === 0 && (
                <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  No hay sesion de caja abierta. Abra una caja para registrar anticipos.
                </div>
              )}
              {openCashSessions.length > 0 && (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Caja *</label>
                  <select value={advanceForm.cashSessionId} onChange={e => setAdvanceForm(f => ({ ...f, cashSessionId: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
                    {openCashSessions.length > 1 && <option value="">Seleccionar caja...</option>}
                    {openCashSessions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Cliente *</label>
                <select value={advanceForm.customerId} onChange={e => setAdvanceForm(f => ({ ...f, customerId: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
                  <option value="">Seleccionar...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Monto USD *</label>
                  <input type="number" value={advanceForm.amountUsd} onChange={e => {
                    const usd = e.target.value;
                    const bs = usd && exchangeRate > 0 ? (Number(usd) * exchangeRate).toFixed(2) : '';
                    setAdvanceForm(f => ({ ...f, amountUsd: usd, amountBs: bs }));
                  }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" step="0.01" min="0.01" placeholder="0.00" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Monto Bs</label>
                  <input type="number" value={advanceForm.amountBs} onChange={e => {
                    const bs = e.target.value;
                    const usd = bs && exchangeRate > 0 ? (Number(bs) / exchangeRate).toFixed(2) : '';
                    setAdvanceForm(f => ({ ...f, amountBs: bs, amountUsd: usd }));
                  }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" step="0.01" min="0.01" placeholder="0.00" />
                  {exchangeRate > 0 && <p className="text-xs text-slate-500 mt-1">Tasa: {exchangeRate.toFixed(2)} Bs/$</p>}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Metodo de pago *</label>
                <select value={advanceForm.methodId} onChange={e => setAdvanceForm(f => ({ ...f, methodId: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
                  <option value="">Seleccionar...</option>
                  {paymentMethods.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Referencia</label>
                <input type="text" value={advanceForm.reference} onChange={e => setAdvanceForm(f => ({ ...f, reference: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" placeholder="Opcional" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Notas</label>
                <input type="text" value={advanceForm.notes} onChange={e => setAdvanceForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" placeholder="Opcional" />
              </div>
              <button
                onClick={submitAdvance}
                disabled={!advanceForm.customerId || !advanceForm.amountUsd || !advanceForm.methodId || !advanceForm.cashSessionId || savingAdvance}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50 transition-colors"
              >
                {savingAdvance ? 'Guardando...' : 'Registrar Anticipo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
