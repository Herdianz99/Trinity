'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, FileText, ChevronLeft, ChevronRight } from 'lucide-react';

export default function CashSessionDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [summary, setSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsTotalPages, setPaymentsTotalPages] = useState(1);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [filterMethodId, setFilterMethodId] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/proxy/payment-methods/flat')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPaymentMethods(data); })
      .catch(() => {});
  }, []);

  const fetchSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const res = await fetch(`/api/proxy/cash-sessions/${id}/summary`);
      const data = await res.json();
      setSummary(data);
    } catch {}
    setLoadingSummary(false);
  }, [id]);

  const fetchPayments = useCallback(async (page: number = 1) => {
    setLoadingPayments(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (filterMethodId) params.set('methodId', filterMethodId);
      const res = await fetch(`/api/proxy/cash-sessions/${id}/payments?${params}`);
      const data = await res.json();
      setPayments(data.data || []);
      setPaymentsPage(data.page || 1);
      setPaymentsTotalPages(data.totalPages || 1);
      setPaymentsTotal(data.total || 0);
    } catch {}
    setLoadingPayments(false);
  }, [id, filterMethodId]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchPayments(1); }, [fetchPayments]);

  const session = summary?.session;
  const isClosed = session?.status === 'CLOSED';
  const fmt = (d: string) => new Date(d).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    document.title = session?.cashRegister?.name
      ? `Cierre ${session.cashRegister.name} | Trinity ERP`
      : 'Detalle de cierre | Trinity ERP';
  }, [session]);

  if (loadingSummary && !summary) {
    return (
      <div className="max-w-6xl mx-auto flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-500" size={28} />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center text-slate-500">
        <p>No se encontro la sesion.</p>
        <Link href="/cash/sessions" className="text-green-400 hover:underline text-sm mt-2 inline-block">Volver al historial</Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/cash/sessions" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <h1 className="text-2xl font-bold text-white">{session.cashRegister?.name}</h1>
          {session.cashRegister?.code && (
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">{session.cashRegister.code}</span>
          )}
          {isClosed ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">Cerrada</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Abierta
            </span>
          )}
        </div>
        <button
          onClick={() => window.open(`/api/proxy/cash-sessions/${id}/movements-report`, '_blank')}
          className="btn-secondary !py-2 !px-3 text-sm flex items-center gap-1.5 whitespace-nowrap"
          title="Reporte detallado: movimientos agrupados por metodo con referencia"
        >
          <FileText size={15} /> Reporte detallado
        </button>
      </div>

      {/* Meta */}
      <div className="card p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <span className="text-slate-500 block text-xs">Abierta por</span>
          <span className="text-white">{session.openedBy?.name || '—'}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-xs">Apertura</span>
          <span className="text-slate-300">{session.openedAt ? fmt(session.openedAt) : '—'}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-xs">Cerrada por</span>
          <span className="text-white">{session.closedBy?.name || '—'}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-xs">Cierre</span>
          <span className="text-slate-300">{session.closedAt ? fmt(session.closedAt) : '—'}</span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left column - Summary */}
        <div className="lg:w-[34%] space-y-4">
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Fondos de apertura</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Fondo USD</span>
                <span className="text-sm font-medium text-white">${(summary.openingBalanceUsd || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Fondo Bs</span>
                <span className="text-sm font-medium text-white">Bs {(summary.openingBalanceBs || 0).toFixed(2)}</span>
              </div>
            </div>

            <div className="my-3 border-t border-slate-700/50" />

            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Ventas</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Ventas USD</span>
                <span className="text-sm font-bold text-green-400">${(summary.salesTotalUsd ?? summary.totalUsd ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Ventas Bs</span>
                <span className="text-sm font-bold text-green-400">Bs {(summary.salesTotalBs ?? summary.totalBs ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Facturas</span>
                <span className="text-sm font-medium text-white">{summary.invoiceCount}</span>
              </div>
            </div>

            {summary.paymentsByMethod?.length > 0 && (
              <>
                <div className="my-3 border-t border-slate-700/50" />
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Por metodo</h3>
                <div className="space-y-1.5">
                  {summary.paymentsByMethod.map((m: any) => (
                    <div key={m.methodName} className="flex justify-between text-xs">
                      <span className="text-slate-400">{m.methodName} ({m.count})</span>
                      <span className="text-slate-200">{m.isDivisa ? `$${m.totalUsd.toFixed(2)}` : `Bs ${m.totalBs.toFixed(2)}`}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {(summary.cashExpectedUsd != null || summary.cashExpectedBs != null) && (
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
              </>
            )}

            {summary.changeOutflows?.length > 0 && (
              <>
                <div className="my-3 border-t border-slate-700/50" />
                <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">Vueltos entregados</h3>
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

            {summary.electronicByMethod?.length > 0 && (
              <>
                <div className="my-3 border-t border-slate-700/50" />
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Otros canales (cuadrar aparte)</h3>
                <div className="space-y-1.5">
                  {summary.electronicByMethod.map((m: any) => (
                    <div key={m.methodName} className="flex justify-between text-xs">
                      <span className="text-slate-400">{m.methodName} ({m.count})</span>
                      <span className="text-slate-200">{m.isDivisa ? `$${m.expectedUsd.toFixed(2)}` : `Bs ${m.expectedBs.toFixed(2)}`}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 mt-2">No estan en la gaveta; se cuadran contra banco/plataforma.</p>
              </>
            )}

            {(summary.movementsIncomeUsd > 0 || summary.movementsExpenseUsd > 0) && (
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

          {/* Arqueo (solo sesiones cerradas) */}
          {isClosed && session.closingBalanceUsd != null && (
            <div className={`card p-4 ${Math.abs(summary.differenceUsd || 0) < 0.01 && Math.abs(summary.differenceBs || 0) < 0.01 ? 'border border-green-500/20' : 'border border-red-500/20'}`}>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Arqueo del cierre</h3>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Esperado USD</span>
                  <span className="text-white">${(summary.expectedUsd ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Contado USD</span>
                  <span className="text-white">${(session.closingBalanceUsd ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className={Math.abs(summary.differenceUsd || 0) < 0.01 ? 'text-green-400' : 'text-red-400'}>Diferencia USD</span>
                  <span className={Math.abs(summary.differenceUsd || 0) < 0.01 ? 'text-green-400' : 'text-red-400'}>
                    {(summary.differenceUsd || 0) >= 0 ? '+' : ''}${(summary.differenceUsd || 0).toFixed(2)}
                  </span>
                </div>
                <div className="my-2 border-t border-slate-700/50" />
                <div className="flex justify-between">
                  <span className="text-slate-400">Esperado Bs</span>
                  <span className="text-white">Bs {(summary.expectedBs ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Contado Bs</span>
                  <span className="text-white">Bs {(session.closingBalanceBs ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className={Math.abs(summary.differenceBs || 0) < 0.01 ? 'text-green-400' : 'text-red-400'}>Diferencia Bs</span>
                  <span className={Math.abs(summary.differenceBs || 0) < 0.01 ? 'text-green-400' : 'text-red-400'}>
                    {(summary.differenceBs || 0) >= 0 ? '+' : ''}Bs {(summary.differenceBs || 0).toFixed(2)}
                  </span>
                </div>
              </div>
              {session.closingNotes && (
                <p className="text-xs text-slate-400 mt-3 pt-2 border-t border-slate-700/50">Notas: {session.closingNotes}</p>
              )}
            </div>
          )}
        </div>

        {/* Right column - Payments */}
        <div className="lg:w-[66%]">
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between gap-2">
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
    </div>
  );
}
