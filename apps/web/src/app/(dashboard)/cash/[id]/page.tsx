'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Monitor,
  Wifi,
  WifiOff,
  DoorClosed,
  FileText,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { sendToFiscalPrinter } from '@/lib/fiscal-printer';

interface PaymentMethodOption {
  id: string;
  name: string;
}

export default function CashDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [register, setRegister] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'session' | 'history'>('session');

  // Current session state
  const [summary, setSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsTotalPages, setPaymentsTotalPages] = useState(1);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [filterMethodId, setFilterMethodId] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);

  // Close modal
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closingUsd, setClosingUsd] = useState('');
  const [closingBs, setClosingBs] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [closeSummary, setCloseSummary] = useState<any>(null);

  // History tab
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<any>(null);
  const [loadingHistoryDetail, setLoadingHistoryDetail] = useState(false);

  const [reportLoading, setReportLoading] = useState<'X' | 'Z' | null>(null);

  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const fetchRegister = useCallback(async () => {
    try {
      const res = await fetch(`/api/proxy/cash-registers/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRegister(data);

      // If no open session, default to history tab
      if (!data.sessions || data.sessions.length === 0) {
        setActiveTab('history');
      }
    } catch {
      router.push('/cash');
    }
    setLoading(false);
  }, [id, router]);

  useEffect(() => { fetchRegister(); }, [fetchRegister]);

  // Fetch payment methods for filter dropdown
  useEffect(() => {
    fetch('/api/proxy/payment-methods/flat')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPaymentMethods(data); })
      .catch(() => {});
  }, []);

  // Fetch session summary when on session tab
  const openSession = register?.sessions?.[0];
  const sessionId = openSession?.id;

  const fetchSummary = useCallback(async () => {
    if (!sessionId) return;
    setLoadingSummary(true);
    try {
      const res = await fetch(`/api/proxy/cash-sessions/${sessionId}/summary`);
      const data = await res.json();
      setSummary(data);
    } catch {}
    setLoadingSummary(false);
  }, [sessionId]);

  const fetchPayments = useCallback(async (page: number = 1) => {
    if (!sessionId) return;
    setLoadingPayments(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (filterMethodId) params.set('methodId', filterMethodId);
      const res = await fetch(`/api/proxy/cash-sessions/${sessionId}/payments?${params}`);
      const data = await res.json();
      setPayments(data.data || []);
      setPaymentsPage(data.page || 1);
      setPaymentsTotalPages(data.totalPages || 1);
      setPaymentsTotal(data.total || 0);
    } catch {}
    setLoadingPayments(false);
  }, [sessionId, filterMethodId]);

  useEffect(() => {
    if (activeTab === 'session' && sessionId) {
      fetchSummary();
      fetchPayments(1);
    }
  }, [activeTab, sessionId, fetchSummary, fetchPayments]);

  // Fetch history sessions
  const fetchHistory = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch(`/api/proxy/cash-registers/${id}/sessions`);
      const data = await res.json();
      if (Array.isArray(data)) setSessions(data);
    } catch {}
    setLoadingSessions(false);
  }, [id]);

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
  }, [activeTab, fetchHistory]);

  // Open close modal with pre-fetched summary
  async function openCloseModal() {
    setCloseModalOpen(true);
    setClosingUsd('');
    setClosingBs('');
    setClosingNotes('');
    setCloseSummary(null);
    try {
      const res = await fetch(`/api/proxy/cash-sessions/${sessionId}/summary`);
      const data = await res.json();
      setCloseSummary(data);
    } catch {}
  }

  async function handleClose() {
    if (!sessionId) return;
    setProcessing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/cash-sessions/${sessionId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closingBalanceUsd: parseFloat(closingUsd) || 0,
          closingBalanceBs: parseFloat(closingBs) || 0,
          notes: closingNotes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al cerrar sesion');
      }
      setMessage({ type: 'success', text: 'Caja cerrada correctamente' });
      setCloseModalOpen(false);
      fetchRegister();
      setActiveTab('history');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  }

  // View history detail
  async function viewHistoryDetail(sid: string) {
    setLoadingHistoryDetail(true);
    setHistoryDetail(null);
    try {
      const res = await fetch(`/api/proxy/cash-sessions/${sid}/summary`);
      const data = await res.json();
      setHistoryDetail(data);
    } catch {}
    setLoadingHistoryDetail(false);
  }

  async function handleFiscalReport(type: 'X' | 'Z') {
    setReportLoading(type);
    setMessage(null);
    try {
      const command = type === 'X' ? 'I0X' : 'I0Z';
      await sendToFiscalPrinter([command]);
      setMessage({ type: 'success', text: `Reporte ${type} enviado correctamente` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || `Error al enviar Reporte ${type}` });
    } finally {
      setReportLoading(null);
    }
  }

  // Calculate close modal difference
  const closeDiffUsd = closeSummary
    ? (parseFloat(closingUsd) || 0) - (closeSummary.openingBalanceUsd + closeSummary.totalUsd)
    : null;
  const closeDiffBs = closeSummary
    ? (parseFloat(closingBs) || 0) - (closeSummary.openingBalanceBs + closeSummary.totalBs)
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="animate-spin text-green-500" size={32} />
      </div>
    );
  }

  if (!register) return null;

  const hasOpenSession = register.sessions?.length > 0;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/cash" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex items-center gap-2 flex-1">
          <h1 className="text-2xl font-bold text-white">{register.name}</h1>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">{register.code}</span>
          {hasOpenSession ? (
            <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Abierta
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-500">Cerrada</span>
          )}
          {register.isFiscal ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">Fiscal</span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">Normal</span>
          )}
          {register.isShared ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 inline-flex items-center gap-1">
              <Wifi size={10} /> Compartida
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-500 inline-flex items-center gap-1">
              <WifiOff size={10} /> Exclusiva
            </span>
          )}
        </div>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-700/50">
        {hasOpenSession && (
          <button
            onClick={() => setActiveTab('session')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'session' ? 'border-green-400 text-green-400' : 'border-transparent text-slate-400 hover:text-white'}`}
          >
            Sesion actual
          </button>
        )}
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'history' ? 'border-green-400 text-green-400' : 'border-transparent text-slate-400 hover:text-white'}`}
        >
          Historial de cierres
        </button>
      </div>

      {/* SESSION TAB */}
      {activeTab === 'session' && hasOpenSession && (
        <div>
          <div className="flex gap-4">
            {/* Left column - Summary (30%) */}
            <div className="w-[30%] space-y-4">
              <div className="card p-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Fondos de apertura</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-400">Fondo USD</span>
                    <span className="text-sm font-medium text-white">${(openSession.openingBalanceUsd || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-400">Fondo Bs</span>
                    <span className="text-sm font-medium text-white">Bs {(openSession.openingBalanceBs || 0).toFixed(2)}</span>
                  </div>
                </div>

                <div className="my-3 border-t border-slate-700/50" />

                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Totales del dia</h3>
                {loadingSummary ? (
                  <Loader2 className="animate-spin text-slate-500 mx-auto" size={18} />
                ) : summary ? (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-400">Total USD</span>
                      <span className="text-sm font-bold text-green-400">${summary.totalUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-400">Total Bs</span>
                      <span className="text-sm font-bold text-green-400">Bs {summary.totalBs.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-400">Facturas</span>
                      <span className="text-sm font-medium text-white">{summary.invoiceCount}</span>
                    </div>
                  </div>
                ) : null}

                {summary && summary.paymentsByMethod?.length > 0 && (
                  <>
                    <div className="my-3 border-t border-slate-700/50" />
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Por metodo</h3>
                    <div className="space-y-1.5">
                      {summary.paymentsByMethod.map((m: any) => (
                        <div key={m.methodName} className="flex justify-between text-xs">
                          <span className="text-slate-400">{m.methodName} ({m.count})</span>
                          <span className="text-slate-200">${m.totalUsd.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Right column - Payments (70%) */}
            <div className="w-[70%]">
              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
                  <span className="text-sm font-medium text-white">Pagos ({paymentsTotal})</span>
                  <select
                    value={filterMethodId}
                    onChange={e => { setFilterMethodId(e.target.value); setPaymentsPage(1); }}
                    className="input-field !w-48 !py-1.5 text-xs"
                  >
                    <option value="">Todos los metodos</option>
                    {paymentMethods.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>

                {loadingPayments ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="animate-spin text-slate-500" size={24} />
                  </div>
                ) : payments.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-sm">No hay pagos en esta sesion</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50 text-slate-400 text-left">
                        <th className="px-4 py-2 font-medium">Hora</th>
                        <th className="px-4 py-2 font-medium">Factura</th>
                        <th className="px-4 py-2 font-medium">Cliente</th>
                        <th className="px-4 py-2 font-medium">Metodo</th>
                        <th className="px-4 py-2 font-medium text-right">USD</th>
                        <th className="px-4 py-2 font-medium text-right">Bs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map(p => (
                        <tr key={p.id} className="border-b border-slate-700/30 hover:bg-slate-800/30">
                          <td className="px-4 py-2 text-slate-400">{new Date(p.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="px-4 py-2">
                            <Link href={`/sales/invoices/${p.invoice?.id}`} className="text-blue-400 hover:underline text-xs font-mono">
                              {p.invoice?.number}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-slate-300">{p.invoice?.customer?.name || 'Sin cliente'}</td>
                          <td className="px-4 py-2 text-slate-300">{p.method?.name}</td>
                          <td className="px-4 py-2 text-right text-white font-medium">${p.amountUsd.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right text-slate-300">Bs {p.amountBs.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Pagination */}
                {paymentsTotalPages > 1 && (
                  <div className="px-4 py-3 border-t border-slate-700/50 flex items-center justify-between">
                    <span className="text-xs text-slate-500">Pagina {paymentsPage} de {paymentsTotalPages}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => fetchPayments(paymentsPage - 1)}
                        disabled={paymentsPage <= 1}
                        className="p-1.5 rounded hover:bg-slate-700 text-slate-400 disabled:opacity-30"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        onClick={() => fetchPayments(paymentsPage + 1)}
                        disabled={paymentsPage >= paymentsTotalPages}
                        className="p-1.5 rounded hover:bg-slate-700 text-slate-400 disabled:opacity-30"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons at bottom */}
          <div className="flex justify-end gap-3 mt-4">
            {register.isFiscal && (
              <>
                <button
                  onClick={() => handleFiscalReport('X')}
                  disabled={reportLoading !== null}
                  className="px-4 py-2 text-sm rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {reportLoading === 'X' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  Reporte X
                </button>
                <button
                  onClick={() => handleFiscalReport('Z')}
                  disabled={reportLoading !== null}
                  className="px-4 py-2 text-sm rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {reportLoading === 'Z' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  Reporte Z
                </button>
              </>
            )}
            <button
              onClick={openCloseModal}
              className="px-4 py-2 text-sm rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <DoorClosed size={14} className="inline mr-1.5" />Cerrar caja
            </button>
          </div>
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === 'history' && (
        <div className="card overflow-hidden">
          {loadingSessions ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-slate-500" size={24} />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">No hay cierres registrados</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 text-slate-400 text-left">
                  <th className="px-4 py-3 font-medium">Apertura</th>
                  <th className="px-4 py-3 font-medium">Cierre</th>
                  <th className="px-4 py-3 font-medium">Abierta por</th>
                  <th className="px-4 py-3 font-medium">Cerrada por</th>
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
                    onClick={() => viewHistoryDetail(s.id)}
                  >
                    <td className="px-4 py-2.5 text-slate-300">{new Date(s.openedAt).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-4 py-2.5 text-slate-400">{s.closedAt ? new Date(s.closedAt).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className="px-4 py-2.5 text-slate-300">{s.openedBy?.name}</td>
                    <td className="px-4 py-2.5 text-slate-400">{s.closedBy?.name || '—'}</td>
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
      )}

      {/* CLOSE MODAL */}
      {closeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setCloseModalOpen(false)}>
          <div className="card p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Cerrar caja</h3>
              <button onClick={() => setCloseModalOpen(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>

            {closeSummary && (
              <div className="mb-4 space-y-3">
                <div className="p-3 rounded-lg bg-slate-700/30 space-y-1.5">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase">Resumen de ventas</h4>
                  {closeSummary.paymentsByMethod?.map((m: any) => (
                    <div key={m.methodName} className="flex justify-between text-sm">
                      <span className="text-slate-300">{m.methodName} ({m.count})</span>
                      <span className="text-white">${m.totalUsd.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t border-slate-600/50 mt-2 pt-2 flex justify-between text-sm font-medium">
                    <span className="text-slate-300">Total ({closeSummary.invoiceCount} facturas)</span>
                    <span className="text-green-400">${closeSummary.totalUsd.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Efectivo USD contado fisicamente</label>
                <input
                  type="number"
                  value={closingUsd}
                  onChange={e => setClosingUsd(e.target.value)}
                  className="input-field"
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Efectivo Bs contado fisicamente</label>
                <input
                  type="number"
                  value={closingBs}
                  onChange={e => setClosingBs(e.target.value)}
                  className="input-field"
                  placeholder="0.00"
                />
              </div>

              {closeSummary && closeDiffUsd !== null && (closingUsd || closingBs) && (
                <div className={`p-3 rounded-lg ${Math.abs(closeDiffUsd!) < 0.01 && Math.abs(closeDiffBs!) < 0.01 ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                  <div className="flex justify-between text-sm">
                    <span className={Math.abs(closeDiffUsd!) < 0.01 ? 'text-green-400' : 'text-red-400'}>Diferencia USD</span>
                    <span className={`font-medium ${Math.abs(closeDiffUsd!) < 0.01 ? 'text-green-400' : 'text-red-400'}`}>
                      {closeDiffUsd! >= 0 ? '+' : ''}{closeDiffUsd!.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className={Math.abs(closeDiffBs!) < 0.01 ? 'text-green-400' : 'text-red-400'}>Diferencia Bs</span>
                    <span className={`font-medium ${Math.abs(closeDiffBs!) < 0.01 ? 'text-green-400' : 'text-red-400'}`}>
                      {closeDiffBs! >= 0 ? '+' : ''}{closeDiffBs!.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm text-slate-400 mb-1">Notas (opcional)</label>
                <input
                  type="text"
                  value={closingNotes}
                  onChange={e => setClosingNotes(e.target.value)}
                  className="input-field"
                  placeholder="Notas de cierre..."
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setCloseModalOpen(false)} className="flex-1 px-4 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:text-white transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleClose}
                disabled={processing}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 flex items-center justify-center gap-2 transition-colors"
              >
                {processing ? <Loader2 className="animate-spin" size={16} /> : <DoorClosed size={16} />}
                Confirmar cierre
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HISTORY DETAIL MODAL */}
      {historyDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setHistoryDetail(null)}>
          <div className="card p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Detalle de cierre</h3>
              <button onClick={() => setHistoryDetail(null)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>

            {loadingHistoryDetail ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-slate-500" size={24} />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-500 block">Abierta por</span>
                    <span className="text-white">{historyDetail.session?.openedBy?.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Cerrada por</span>
                    <span className="text-white">{historyDetail.session?.closedBy?.name || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Apertura</span>
                    <span className="text-slate-300">{historyDetail.session?.openedAt ? new Date(historyDetail.session.openedAt).toLocaleString('es-VE') : '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Cierre</span>
                    <span className="text-slate-300">{historyDetail.session?.closedAt ? new Date(historyDetail.session.closedAt).toLocaleString('es-VE') : '—'}</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-700/30 space-y-1.5">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase">Fondos de apertura</h4>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-300">USD</span>
                    <span className="text-white">${(historyDetail.openingBalanceUsd || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-300">Bs</span>
                    <span className="text-white">Bs {(historyDetail.openingBalanceBs || 0).toFixed(2)}</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-700/30 space-y-1.5">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase">Ventas por metodo</h4>
                  {historyDetail.paymentsByMethod?.map((m: any) => (
                    <div key={m.methodName} className="flex justify-between text-sm">
                      <span className="text-slate-300">{m.methodName} ({m.count})</span>
                      <span className="text-white">${m.totalUsd.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t border-slate-600/50 mt-2 pt-2 flex justify-between text-sm font-medium">
                    <span className="text-slate-300">Total ({historyDetail.invoiceCount} facturas)</span>
                    <span className="text-green-400">${historyDetail.totalUsd.toFixed(2)}</span>
                  </div>
                </div>

                {historyDetail.session?.closingBalanceUsd != null && (
                  <div className={`p-3 rounded-lg ${Math.abs(historyDetail.differenceUsd || 0) < 0.01 && Math.abs(historyDetail.differenceBs || 0) < 0.01 ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                    <h4 className="text-xs font-semibold text-slate-400 uppercase mb-1.5">Arqueo</h4>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">Esperado USD</span>
                      <span className="text-white">${(historyDetail.expectedUsd || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">Contado USD</span>
                      <span className="text-white">${(historyDetail.session.closingBalanceUsd || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-medium mt-1">
                      <span className={Math.abs(historyDetail.differenceUsd || 0) < 0.01 ? 'text-green-400' : 'text-red-400'}>Diferencia USD</span>
                      <span className={Math.abs(historyDetail.differenceUsd || 0) < 0.01 ? 'text-green-400' : 'text-red-400'}>
                        {(historyDetail.differenceUsd || 0) >= 0 ? '+' : ''}{(historyDetail.differenceUsd || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm font-medium">
                      <span className={Math.abs(historyDetail.differenceBs || 0) < 0.01 ? 'text-green-400' : 'text-red-400'}>Diferencia Bs</span>
                      <span className={Math.abs(historyDetail.differenceBs || 0) < 0.01 ? 'text-green-400' : 'text-red-400'}>
                        {(historyDetail.differenceBs || 0) >= 0 ? '+' : ''}{(historyDetail.differenceBs || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
