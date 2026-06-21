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
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  EyeOff,
} from 'lucide-react';
import Link from 'next/link';
import { sendToFiscalPrinter, extractAndPrintZReport } from '@/lib/fiscal-printer';

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

  // Manual movement modal
  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [movementForm, setMovementForm] = useState({ type: 'INCOME' as 'INCOME' | 'EXPENSE', amount: '', currency: 'USD' as 'USD' | 'BS', reason: '', dynamicKey: '' });
  const [movementSaving, setMovementSaving] = useState(false);
  const [movementError, setMovementError] = useState('');
  const [showDynKey, setShowDynKey] = useState(false);

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

  useEffect(() => {
    if (register) document.title = `${register.name} | Trinity ERP`;
  }, [register]);

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

  function openMovementModal() {
    setMovementForm({ type: 'INCOME', amount: '', currency: 'USD', reason: '', dynamicKey: '' });
    setMovementError('');
    setShowDynKey(false);
    setMovementModalOpen(true);
  }

  async function handleCreateMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId || !movementForm.amount || !movementForm.reason.trim() || !movementForm.dynamicKey.trim()) return;
    setMovementSaving(true);
    setMovementError('');
    try {
      const res = await fetch('/api/proxy/cash-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cashSessionId: sessionId,
          type: movementForm.type,
          amount: parseFloat(movementForm.amount),
          currency: movementForm.currency,
          reason: movementForm.reason.trim(),
          dynamicKey: movementForm.dynamicKey.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al crear movimiento');
      }
      setMovementModalOpen(false);
      setMessage({ type: 'success', text: `Movimiento ${movementForm.type === 'INCOME' ? 'de ingreso' : 'de egreso'} registrado` });
      fetchSummary();
    } catch (err: any) {
      setMovementError(err.message);
    } finally {
      setMovementSaving(false);
    }
  }

  async function handleFiscalReport(type: 'X' | 'Z') {
    setReportLoading(type);
    setMessage(null);
    try {
      if (type === 'X') {
        await sendToFiscalPrinter(['I0X']);
        setMessage({ type: 'success', text: 'Reporte X enviado correctamente' });
      } else {
        // Z Report: extract data, print, and save to backend
        const zData = await extractAndPrintZReport();
        setMessage({ type: 'success', text: `Reporte Z #${zData.zNumber} impreso. Guardando datos...` });

        try {
          const res = await fetch('/api/proxy/z-reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...zData,
              cashRegisterId: id,
              isManual: false,
            }),
          });

          if (res.status === 409) {
            setMessage({ type: 'success', text: `Reporte Z #${zData.zNumber} impreso (ya existia en el sistema)` });
          } else if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            setMessage({ type: 'error', text: `Z impreso pero error al guardar: ${err.message || 'Error desconocido'}` });
          } else {
            setMessage({ type: 'success', text: `Reporte Z #${zData.zNumber} impreso y guardado correctamente` });
          }
        } catch (saveErr: any) {
          setMessage({ type: 'error', text: `Z impreso pero error al guardar: ${saveErr.message}` });
        }
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || `Error al enviar Reporte ${type}` });
    } finally {
      setReportLoading(null);
    }
  }

  // Calculate close modal difference (solo efectivo fisico de gaveta, por moneda)
  const closeDiffUsd = closeSummary
    ? (parseFloat(closingUsd) || 0) - (closeSummary.cashExpectedUsd ?? 0)
    : null;
  const closeDiffBs = closeSummary
    ? (parseFloat(closingBs) || 0) - (closeSummary.cashExpectedBs ?? 0)
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
          {register.serie?.isFiscal ? (
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

                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Ventas del dia</h3>
                {loadingSummary ? (
                  <Loader2 className="animate-spin text-slate-500 mx-auto" size={18} />
                ) : summary ? (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-400">Ventas USD</span>
                      <span className="text-sm font-bold text-green-400">${(summary.salesTotalUsd ?? summary.totalUsd).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-400">Ventas Bs</span>
                      <span className="text-sm font-bold text-green-400">Bs {(summary.salesTotalBs ?? summary.totalBs).toFixed(2)}</span>
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
                          <span className="text-slate-200">
                            {m.isDivisa ? `$${m.totalUsd.toFixed(2)}` : `Bs ${m.totalBs.toFixed(2)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {summary && (summary.cashExpectedUsd != null || summary.cashExpectedBs != null) && (
                  <>
                    <div className="my-3 border-t border-slate-700/50" />
                    <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Efectivo esperado en gaveta</h3>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-200">Efectivo USD</span>
                        <span className="text-emerald-400">${(summary.cashExpectedUsd ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-200">Efectivo Bs</span>
                        <span className="text-emerald-400">Bs {(summary.cashExpectedBs ?? 0).toFixed(2)}</span>
                      </div>
                      {summary.cashChangeBs > 0 && (
                        <p className="text-[11px] text-amber-400/80">Incluye -Bs {summary.cashChangeBs.toFixed(2)} de vueltos dados en efectivo</p>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">Lo que deberia haber en la gaveta ahora (sin cerrar). Los pagos electronicos no cuentan aqui.</p>
                  </>
                )}

                {summary && summary.changeOutflows?.length > 0 && (
                  <>
                    <div className="my-3 border-t border-slate-700/50" />
                    <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">Vueltos (egresos)</h3>
                    <div className="space-y-1.5">
                      {summary.changeOutflows.map((c: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-slate-400">{c.invoiceNumber} <span className="text-slate-500">· {c.changeMethodName}</span></span>
                          <span className="text-amber-400">-Bs {c.changeBs.toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs font-bold border-t border-slate-700/30 pt-1">
                        <span className="text-amber-300">Total vueltos</span>
                        <span className="text-amber-400">-Bs {summary.totalChangeBs.toFixed(2)}</span>
                      </div>
                    </div>
                  </>
                )}

                {summary && (summary.movementsIncomeUsd > 0 || summary.movementsExpenseUsd > 0) && (
                  <>
                    <div className="my-3 border-t border-slate-700/50" />
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Movimientos de caja</h3>
                    <div className="space-y-1.5">
                      {summary.movementsIncomeUsd > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-green-400">Ingresos</span>
                          <span className="text-green-400">+${summary.movementsIncomeUsd.toFixed(2)}</span>
                        </div>
                      )}
                      {summary.movementsExpenseUsd > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-orange-400">Egresos</span>
                          <span className="text-orange-400">-${summary.movementsExpenseUsd.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}

              </div>
            </div>

            {/* Right column - Payments (70%) */}
            <div className="w-[70%]">
              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-white">Pagos ({paymentsTotal})</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => window.open(`/api/proxy/cash-sessions/${sessionId}/movements-report`, '_blank')}
                      className="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1.5 whitespace-nowrap"
                      title="Reporte detallado: movimientos agrupados por metodo con referencia"
                    >
                      <FileText size={14} /> Reporte detallado
                    </button>
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

          {/* Cash movements list */}
          {summary?.cashMovements?.length > 0 && (
            <div className="card overflow-hidden mt-4">
              <div className="px-4 py-3 border-b border-slate-700/50">
                <span className="text-sm font-medium text-white">Movimientos de caja ({summary.cashMovements.length})</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 text-slate-400 text-left">
                    <th className="px-4 py-2 font-medium">Hora</th>
                    <th className="px-4 py-2 font-medium">Tipo</th>
                    <th className="px-4 py-2 font-medium">Razon</th>
                    <th className="px-4 py-2 font-medium">Usuario</th>
                    <th className="px-4 py-2 font-medium text-right">USD</th>
                    <th className="px-4 py-2 font-medium text-right">Bs</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.cashMovements.map((mov: any) => (
                    <tr key={mov.id} className="border-b border-slate-700/30 hover:bg-slate-800/30">
                      <td className="px-4 py-2 text-slate-400">{new Date(mov.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          {mov.type === 'INCOME' ? (
                            <ArrowUpRight size={14} className="text-green-400" />
                          ) : (
                            <ArrowDownRight size={14} className="text-red-400" />
                          )}
                          <span className={mov.type === 'INCOME' ? 'text-green-400' : 'text-red-400'}>
                            {mov.type === 'INCOME' ? 'Ingreso' : 'Egreso'}
                          </span>
                          {mov.isManual ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">MANUAL</span>
                          ) : mov.expenseId ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400">GASTO</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-slate-300">{mov.reason}</td>
                      <td className="px-4 py-2 text-slate-400">{mov.createdBy?.name}</td>
                      <td className={`px-4 py-2 text-right font-medium ${mov.type === 'INCOME' ? 'text-green-400' : 'text-red-400'}`}>
                        {mov.type === 'INCOME' ? '+' : '-'}${mov.amountUsd.toFixed(2)}
                      </td>
                      <td className={`px-4 py-2 text-right ${mov.type === 'INCOME' ? 'text-green-400' : 'text-red-400'}`}>
                        {mov.type === 'INCOME' ? '+' : '-'}Bs {mov.amountBs.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Action buttons at bottom */}
          <div className="flex justify-end gap-3 mt-4">
            {register.serie?.isFiscal && (
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
              onClick={openMovementModal}
              className="px-4 py-2 text-sm rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors flex items-center gap-1.5"
            >
              <Plus size={14} /> Movimiento manual
            </button>
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

      {/* MANUAL MOVEMENT MODAL */}
      {movementModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setMovementModalOpen(false)}>
          <div className="card p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Movimiento manual</h3>
              <button onClick={() => setMovementModalOpen(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>

            {movementError && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {movementError}
              </div>
            )}

            <form onSubmit={handleCreateMovement} className="space-y-4">
              {/* Type toggle */}
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Tipo</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMovementForm(p => ({ ...p, type: 'INCOME' }))}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center justify-center gap-1.5 ${
                      movementForm.type === 'INCOME'
                        ? 'bg-green-500/10 border-green-500/30 text-green-400'
                        : 'border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <ArrowUpRight size={16} /> Ingreso
                  </button>
                  <button
                    type="button"
                    onClick={() => setMovementForm(p => ({ ...p, type: 'EXPENSE' }))}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center justify-center gap-1.5 ${
                      movementForm.type === 'EXPENSE'
                        ? 'bg-red-500/10 border-red-500/30 text-red-400'
                        : 'border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <ArrowDownRight size={16} /> Egreso
                  </button>
                </div>
              </div>

              {/* Amount + currency */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Monto</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={movementForm.amount}
                    onChange={e => setMovementForm(p => ({ ...p, amount: e.target.value }))}
                    className="input-field flex-1"
                    placeholder="0.00"
                    required
                    autoFocus
                  />
                  <select
                    value={movementForm.currency}
                    onChange={e => setMovementForm(p => ({ ...p, currency: e.target.value as 'USD' | 'BS' }))}
                    className="input-field !w-24"
                  >
                    <option value="USD">USD</option>
                    <option value="BS">Bs</option>
                  </select>
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Razon</label>
                <input
                  type="text"
                  value={movementForm.reason}
                  onChange={e => setMovementForm(p => ({ ...p, reason: e.target.value }))}
                  className="input-field"
                  placeholder="Razon del movimiento..."
                  required
                />
              </div>

              {/* Dynamic key */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Clave de autorizacion</label>
                <div className="relative">
                  <input
                    type={showDynKey ? 'text' : 'password'}
                    value={movementForm.dynamicKey}
                    onChange={e => setMovementForm(p => ({ ...p, dynamicKey: e.target.value }))}
                    className="input-field !pr-12"
                    placeholder="Ingrese la clave..."
                    required
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDynKey(!showDynKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showDynKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setMovementModalOpen(false)} className="flex-1 px-4 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:text-white transition-colors">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={movementSaving || !movementForm.amount || !movementForm.reason.trim() || !movementForm.dynamicKey.trim()}
                  className={`flex-1 px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                    movementForm.type === 'INCOME'
                      ? 'bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20'
                      : 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20'
                  } disabled:opacity-50`}
                >
                  {movementSaving ? <Loader2 className="animate-spin" size={16} /> : movementForm.type === 'INCOME' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                  Registrar {movementForm.type === 'INCOME' ? 'ingreso' : 'egreso'}
                </button>
              </div>
            </form>
          </div>
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
                {/* Efectivo de gaveta: lo que SI se arquea */}
                <div className="p-3 rounded-lg bg-slate-700/30">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">Efectivo esperado en gaveta</h4>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-300">Efectivo USD</span>
                    <span className="text-white">${(closeSummary.cashExpectedUsd ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-slate-300">Efectivo Bs</span>
                    <span className="text-white">Bs {(closeSummary.cashExpectedBs ?? 0).toFixed(2)}</span>
                  </div>
                  {closeSummary.cashChangeBs > 0 && (
                    <p className="text-[11px] text-amber-400/80 mt-1">Incluye -Bs {closeSummary.cashChangeBs.toFixed(2)} de vueltos dados en efectivo (ver detalle abajo)</p>
                  )}
                </div>

                {/* Vueltos entregados: por que la gaveta Bs puede verse reducida/negativa */}
                {closeSummary.changeOutflows?.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <h4 className="text-xs font-semibold text-amber-400 uppercase mb-2">Vueltos entregados</h4>
                    {closeSummary.changeOutflows.map((c: any, i: number) => (
                      <div key={i} className="flex justify-between text-sm mt-1">
                        <span className="text-slate-300">{c.invoiceNumber} <span className="text-slate-500">· {c.changeMethodName}</span></span>
                        <span className="text-amber-400">-Bs {c.changeBs.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-bold border-t border-amber-500/20 mt-1.5 pt-1.5">
                      <span className="text-amber-300">Total vueltos</span>
                      <span className="text-amber-400">-Bs {closeSummary.totalChangeBs.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* Otros canales: informativo, NO entra al conteo de gaveta */}
                {closeSummary.electronicByMethod?.length > 0 && (
                  <div className="p-3 rounded-lg bg-slate-700/30">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">Otros canales (cuadrar aparte)</h4>
                    {closeSummary.electronicByMethod.map((m: any) => (
                      <div key={m.methodName} className="flex justify-between text-sm mt-1">
                        <span className="text-slate-300">{m.methodName} ({m.count})</span>
                        <span className="text-slate-200">
                          {m.isDivisa ? `$${m.expectedUsd.toFixed(2)}` : `Bs ${m.expectedBs.toFixed(2)}`}
                        </span>
                      </div>
                    ))}
                    <p className="text-[11px] text-slate-500 mt-2">Estos pagos no estan en la gaveta; se cuadran contra banco/plataforma.</p>
                  </div>
                )}
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
                      <span className="text-white">{m.isDivisa ? `$${m.totalUsd.toFixed(2)}` : `Bs ${m.totalBs.toFixed(2)}`}</span>
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
                      <span className="text-slate-300">Esperado efectivo USD</span>
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
