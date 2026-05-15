'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Loader2,
  DollarSign,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface Receivable {
  id: string;
  type: string;
  platformName: string | null;
  invoice: { id: string; number: string };
  amountUsd: number;
  paidAmountUsd: number;
  balanceUsd: number;
  status: string;
  createdAt: string;
  payments: { id: string; amountUsd: number; createdAt: string; method: { id: string; name: string } | null }[];
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

// Payment method labels come from payment.method.name (relation)

export default function PlatformsPage() {
  const [tab, setTab] = useState<'Cashea' | 'Crediagro'>('Cashea');
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summaryTotals, setSummaryTotals] = useState<Record<string, { pending: number; paid: number }>>({
    Cashea: { pending: 0, paid: 0 },
    Crediagro: { pending: 0, paid: 0 },
  });
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [todayRate, setTodayRate] = useState(0);

  // Pay modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedReceivable, setSelectedReceivable] = useState<any>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [paymentMethodsList, setPaymentMethodsList] = useState<{ id: string; name: string }[]>([]);
  const [payReference, setPayReference] = useState('');
  const [processing, setProcessing] = useState(false);

  // Detail modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const fetchReceivables = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: 'FINANCING_PLATFORM',
        platformName: tab,
        page: page.toString(),
        limit: '20',
      });
      const res = await fetch(`/api/proxy/receivables?${params}`);
      const data = await res.json();
      setReceivables(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar datos' });
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/receivables/summary');
      const data = await res.json();
      const totals: Record<string, { pending: number; paid: number }> = {
        Cashea: { pending: 0, paid: 0 },
        Crediagro: { pending: 0, paid: 0 },
      };
      for (const p of data.byPlatform || []) {
        if (totals[p.platformName]) {
          totals[p.platformName].pending = p.totalUsd;
        }
      }
      // Get total paid per platform
      for (const platform of ['Cashea', 'Crediagro']) {
        const paidRes = await fetch(`/api/proxy/receivables?type=FINANCING_PLATFORM&platformName=${platform}&status=PAID&limit=1`);
        const paidData = await paidRes.json();
        // Just show count for now
        totals[platform].paid = paidData.total || 0;
      }
      setSummaryTotals(totals);
    } catch {}
  }, []);

  useEffect(() => {
    try { fetch('/api/proxy/exchange-rate/today').then(r => r.text()).then(t => { if (t) { try { setTodayRate(JSON.parse(t)?.rate || 0); } catch {} } }); } catch {}
    fetch('/api/proxy/payment-methods/flat').then(r => r.json()).then(data => { if (Array.isArray(data)) setPaymentMethodsList(data); }).catch(() => {});
  }, []);

  useEffect(() => { fetchReceivables(); }, [fetchReceivables]);
  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  async function openPayModal(r: Receivable) {
    try {
      const res = await fetch(`/api/proxy/receivables/${r.id}`);
      const data = await res.json();
      setSelectedReceivable(data);
      setPayAmount(data.balanceUsd.toFixed(2));
      setPayMethod('');
      setPayReference('');
      setPayModalOpen(true);
    } catch {}
  }

  async function openDetailModal(r: Receivable) {
    try {
      const res = await fetch(`/api/proxy/receivables/${r.id}`);
      const data = await res.json();
      setSelectedReceivable(data);
      setDetailModalOpen(true);
    } catch {}
  }

  async function handlePay() {
    if (!selectedReceivable) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/proxy/receivables/${selectedReceivable.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountUsd: parseFloat(payAmount),
          methodId: payMethod,
          reference: payReference || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
      setPayModalOpen(false);
      setMessage({ type: 'success', text: 'Cobro registrado' });
      fetchReceivables();
      fetchSummary();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
          <CreditCard className="text-cyan-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">CxC por Plataforma</h1>
          <p className="text-sm text-slate-400">Cashea y Crediagro — cobros de plataformas de financiamiento</p>
        </div>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg border ${message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        {(['Cashea', 'Crediagro'] as const).map(platform => (
          <button key={platform} onClick={() => { setTab(platform); setPage(1); }}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === platform
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
            }`}>
            {platform}
          </button>
        ))}
      </div>

      {/* Summary for selected platform */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <DollarSign className="text-amber-400" size={18} />
            </div>
            <span className="text-sm text-slate-400">{tab} — Pendiente</span>
          </div>
          <p className="text-2xl font-bold text-amber-400">${(summaryTotals[tab]?.pending || 0).toFixed(2)}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-green-500/10">
              <DollarSign className="text-green-400" size={18} />
            </div>
            <span className="text-sm text-slate-400">{tab} — Cobros completados</span>
          </div>
          <p className="text-2xl font-bold text-green-400">{summaryTotals[tab]?.paid || 0}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Factura</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Monto USD</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Cobrado</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Saldo</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8"><Loader2 className="animate-spin mx-auto text-slate-400" size={24} /></td></tr>
              ) : receivables.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-slate-500">No hay CxC de {tab}</td></tr>
              ) : receivables.map(r => (
                <tr key={r.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                  <td className="px-4 py-3 text-slate-200 font-mono text-xs">{r.invoice.number}</td>
                  <td className="px-4 py-3 text-right text-slate-200">${r.amountUsd.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-slate-300">${r.paidAmountUsd.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-100">${r.balanceUsd.toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-300 text-xs">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[r.status]}`}>
                      {STATUS_LABELS[r.status]}
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
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <span className="text-sm text-slate-400">{total} resultados</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700/50 disabled:opacity-30"><ChevronLeft size={18} /></button>
              <span className="text-sm text-slate-300">Pagina {page} de {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700/50 disabled:opacity-30"><ChevronRight size={18} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Pay Modal */}
      {payModalOpen && selectedReceivable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPayModalOpen(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
              <h2 className="text-lg font-semibold text-slate-100">Registrar Cobro — {tab}</h2>
              <button onClick={() => setPayModalOpen(false)} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-900/50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Factura</span><span className="text-slate-200 font-mono">{selectedReceivable.invoice.number}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Monto</span><span className="text-slate-200">${selectedReceivable.amountUsd.toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold"><span className="text-slate-300">Saldo</span><span className="text-green-400">${selectedReceivable.balanceUsd.toFixed(2)}</span></div>
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Monto a cobrar (USD)</label>
                <input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
                {todayRate > 0 && payAmount && (
                  <p className="text-xs text-slate-500 mt-1">= Bs {(parseFloat(payAmount) * todayRate).toFixed(2)}</p>
                )}
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Metodo de pago</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200">
                  <option value="">-- Seleccionar --</option>
                  {paymentMethodsList.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Referencia</label>
                <input type="text" value={payReference} onChange={e => setPayReference(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
              </div>
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
              <h2 className="text-lg font-semibold text-slate-100">Detalle — {selectedReceivable.invoice.number}</h2>
              <button onClick={() => setDetailModalOpen(false)} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-900/50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Plataforma</span><span className="text-slate-200">{selectedReceivable.platformName}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Monto</span><span className="text-slate-200">${selectedReceivable.amountUsd.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Cobrado</span><span className="text-slate-200">${selectedReceivable.paidAmountUsd.toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold"><span className="text-slate-300">Saldo</span><span className="text-green-400">${selectedReceivable.balanceUsd.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Estado</span>
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[selectedReceivable.status]}`}>
                    {STATUS_LABELS[selectedReceivable.status]}
                  </span>
                </div>
              </div>
              <h3 className="text-sm font-semibold text-slate-300">Historial de Pagos</h3>
              {selectedReceivable.payments?.length > 0 ? (
                <div className="bg-slate-900/50 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="text-left px-3 py-2 text-slate-400">Fecha</th>
                        <th className="text-right px-3 py-2 text-slate-400">USD</th>
                        <th className="text-left px-3 py-2 text-slate-400">Metodo</th>
                        <th className="text-left px-3 py-2 text-slate-400">Ref</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedReceivable.payments.map((p: any) => (
                        <tr key={p.id} className="border-b border-slate-700/30">
                          <td className="px-3 py-2 text-slate-300 text-xs">{new Date(p.createdAt).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-slate-200">${p.amountUsd.toFixed(2)}</td>
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
      )}
    </div>
  );
}
