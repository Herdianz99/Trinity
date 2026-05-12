'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Receipt,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Eye,
  DollarSign,
  AlertTriangle,
  X,
  Users,
  Shield,
} from 'lucide-react';

interface Payable {
  id: string;
  supplierId: string;
  supplier: { id: string; name: string };
  purchaseOrderId: string | null;
  purchaseOrder: { id: string; number: string } | null;
  amountUsd: number;
  amountBs: number;
  exchangeRate: number;
  retentionUsd: number;
  retentionBs: number;
  netPayableUsd: number;
  dueDate: string | null;
  status: string;
  paidAmountUsd: number;
  paidAt: string | null;
  notes: string | null;
  balanceUsd: number;
  payments: { id: string; amountUsd: number; createdAt: string; method: string }[];
  createdAt: string;
}

interface Summary {
  totalPendingUsd: number;
  totalOverdueUsd: number;
  totalRetentionUsd: number;
  supplierCount: number;
  bySupplier: { supplierName: string; totalUsd: number; count: number }[];
}

interface SupplierOption {
  id: string;
  name: string;
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

const PAYMENT_LABELS: Record<string, string> = {
  CASH_USD: 'Efectivo USD',
  CASH_BS: 'Efectivo Bs',
  PUNTO_DE_VENTA: 'Punto de venta',
  PAGO_MOVIL: 'Pago movil',
  ZELLE: 'Zelle',
  TRANSFERENCIA: 'Transferencia',
  CASHEA: 'Cashea',
  CREDIAGRO: 'Crediagro',
};

export default function PayablesPage() {
  const [payables, setPayables] = useState<Payable[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [supplierId, setSupplierId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  // Modal states
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedPayable, setSelectedPayable] = useState<any>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('TRANSFERENCIA');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [todayRate, setTodayRate] = useState<number>(0);
  const [processing, setProcessing] = useState(false);

  const fetchPayables = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (supplierId) params.set('supplierId', supplierId);
      if (status) params.set('status', status);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (overdue) params.set('overdue', 'true');
      const res = await fetch(`/api/proxy/payables?${params}`);
      const data = await res.json();
      setPayables(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar cuentas por pagar' });
    } finally {
      setLoading(false);
    }
  }, [page, supplierId, status, from, to, overdue]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/payables/summary');
      const data = await res.json();
      setSummary(data);
    } catch {}
  }, []);

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/suppliers');
      const data = await res.json();
      setSuppliers(Array.isArray(data) ? data : data.data || []);
    } catch {}
  }, []);

  const fetchRate = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/exchange-rate/today');
      const text = await res.text();
      if (text) { try { setTodayRate(JSON.parse(text)?.rate || 0); } catch {} }
    } catch {}
  }, []);

  useEffect(() => { fetchPayables(); }, [fetchPayables]);
  useEffect(() => { fetchSummary(); fetchSuppliers(); fetchRate(); }, [fetchSummary, fetchSuppliers, fetchRate]);

  function isNearDue(dueDate: string | null, s: string) {
    if (!dueDate || s === 'PAID') return false;
    const due = new Date(dueDate);
    const now = new Date();
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 3;
  }

  function isOverdue(dueDate: string | null, s: string) {
    if (s === 'PAID') return false;
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  }

  async function openPayModal(payable: Payable) {
    try {
      const res = await fetch(`/api/proxy/payables/${payable.id}`);
      const data = await res.json();
      setSelectedPayable(data);
      setPayAmount(data.balanceUsd.toFixed(2));
      setPayMethod('TRANSFERENCIA');
      setPayReference('');
      setPayNotes('');
      setPayModalOpen(true);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar detalle' });
    }
  }

  async function openDetailModal(payable: Payable) {
    try {
      const res = await fetch(`/api/proxy/payables/${payable.id}`);
      const data = await res.json();
      setSelectedPayable(data);
      setDetailModalOpen(true);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar detalle' });
    }
  }

  async function handlePay() {
    if (!selectedPayable) return;
    setProcessing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/payables/${selectedPayable.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountUsd: parseFloat(payAmount),
          method: payMethod,
          reference: payReference || undefined,
          notes: payNotes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al registrar pago');
      }
      setPayModalOpen(false);
      setMessage({ type: 'success', text: 'Pago registrado exitosamente' });
      fetchPayables();
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
        <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
          <Receipt className="text-red-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Cuentas por Pagar</h1>
          <p className="text-sm text-slate-400">Gestion de deudas con proveedores y retenciones IVA</p>
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
              <div className="p-2 rounded-lg bg-red-500/10">
                <DollarSign className="text-red-400" size={18} />
              </div>
              <span className="text-sm text-slate-400">Total por pagar</span>
            </div>
            <p className="text-2xl font-bold text-red-400">${summary.totalPendingUsd.toFixed(2)}</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-red-800/20">
                <AlertTriangle className="text-red-500" size={18} />
              </div>
              <span className="text-sm text-slate-400">Vencidas</span>
            </div>
            <p className="text-2xl font-bold text-red-500">${summary.totalOverdueUsd.toFixed(2)}</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Shield className="text-orange-400" size={18} />
              </div>
              <span className="text-sm text-slate-400">Retenciones IVA</span>
            </div>
            <p className="text-2xl font-bold text-orange-400">${summary.totalRetentionUsd.toFixed(2)}</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Users className="text-blue-400" size={18} />
              </div>
              <span className="text-sm text-slate-400">Proveedores con deuda</span>
            </div>
            <p className="text-2xl font-bold text-blue-400">{summary.supplierCount}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Proveedor</label>
            <select value={supplierId} onChange={e => { setSupplierId(e.target.value); setPage(1); }}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
              <option value="">Todos</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Proveedor</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Orden</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Monto USD</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Retencion</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Neto USD</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Pagado</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Saldo</th>
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
              ) : payables.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-slate-500">No hay cuentas por pagar</td></tr>
              ) : payables.map(p => {
                const rowOverdue = isOverdue(p.dueDate, p.status);
                const rowNearDue = !rowOverdue && isNearDue(p.dueDate, p.status);
                return (
                  <tr key={p.id} className={`border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors ${rowOverdue ? 'bg-red-500/5' : rowNearDue ? 'bg-amber-500/5' : ''}`}>
                    <td className="px-4 py-3">
                      <Link href={`/payables/${p.id}`} className="text-slate-200 hover:text-green-400 hover:underline">
                        {p.supplier.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">{p.purchaseOrder?.number || '-'}</td>
                    <td className="px-4 py-3 text-right text-slate-200">${p.amountUsd.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-orange-400">
                      {p.retentionUsd > 0 ? `$${p.retentionUsd.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-200">${p.netPayableUsd.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-slate-300">${p.paidAmountUsd.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-100">${p.balanceUsd.toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-300 text-xs">
                      {p.dueDate ? new Date(p.dueDate).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[p.status] || ''}`}>
                        {STATUS_LABELS[p.status] || p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {p.status !== 'PAID' && (
                          <button onClick={() => openPayModal(p)}
                            className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/10 transition-colors" title="Registrar pago">
                            <DollarSign size={16} />
                          </button>
                        )}
                        <button onClick={() => openDetailModal(p)}
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
      {payModalOpen && selectedPayable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPayModalOpen(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
              <h2 className="text-lg font-semibold text-slate-100">Registrar Pago</h2>
              <button onClick={() => setPayModalOpen(false)} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Info */}
              <div className="bg-slate-900/50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Proveedor</span>
                  <span className="text-slate-200">{selectedPayable.supplier?.name}</span>
                </div>
                {selectedPayable.purchaseOrder && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Orden de compra</span>
                    <span className="text-slate-200 font-mono">{selectedPayable.purchaseOrder.number}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Monto total</span>
                  <span className="text-slate-200">${selectedPayable.amountUsd.toFixed(2)}</span>
                </div>
                {selectedPayable.retentionUsd > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Retencion IVA</span>
                    <span className="text-orange-400">-${selectedPayable.retentionUsd.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Neto a pagar</span>
                  <span className="text-slate-200">${selectedPayable.netPayableUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Ya pagado</span>
                  <span className="text-slate-200">${selectedPayable.paidAmountUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span className="text-slate-300">Saldo pendiente</span>
                  <span className="text-red-400">${selectedPayable.balanceUsd.toFixed(2)}</span>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Monto a pagar (USD)</label>
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
                  {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {/* Reference */}
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Referencia (opcional)</label>
                <input type="text" value={payReference} onChange={e => setPayReference(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" placeholder="Numero de referencia" />
              </div>

              {/* Rate */}
              {todayRate > 0 && (
                <div className="bg-slate-900/50 rounded-lg p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Tasa del dia</span>
                    <span className="text-slate-200">Bs {todayRate.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <button onClick={handlePay} disabled={processing || !payAmount || parseFloat(payAmount) <= 0}
                className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                {processing ? <Loader2 className="animate-spin" size={18} /> : <DollarSign size={18} />}
                Confirmar pago
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModalOpen && selectedPayable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDetailModalOpen(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
              <h2 className="text-lg font-semibold text-slate-100">Detalle de Cuenta por Pagar</h2>
              <button onClick={() => setDetailModalOpen(false)} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Info */}
              <div className="bg-slate-900/50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Proveedor</span>
                  <span className="text-slate-200">{selectedPayable.supplier?.name}</span>
                </div>
                {selectedPayable.purchaseOrder && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Orden de compra</span>
                    <span className="text-slate-200 font-mono">{selectedPayable.purchaseOrder.number}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Fecha creacion</span>
                  <span className="text-slate-200">{new Date(selectedPayable.createdAt).toLocaleString()}</span>
                </div>
                {selectedPayable.dueDate && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Fecha vencimiento</span>
                    <span className="text-slate-200">{new Date(selectedPayable.dueDate).toLocaleDateString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Tasa al crear</span>
                  <span className="text-slate-200">Bs {selectedPayable.exchangeRate.toFixed(2)}</span>
                </div>
                <div className="border-t border-slate-700/50 pt-2 mt-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Monto total USD</span>
                    <span className="text-slate-200">${selectedPayable.amountUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Monto total Bs</span>
                    <span className="text-slate-200">Bs {selectedPayable.amountBs.toFixed(2)}</span>
                  </div>
                </div>

                {/* Retention section */}
                {selectedPayable.retentionUsd > 0 && (
                  <div className="border-t border-slate-700/50 pt-2 mt-2">
                    <h4 className="text-orange-400 font-medium mb-1 flex items-center gap-1">
                      <Shield size={14} /> Retencion IVA
                    </h4>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Retencion USD</span>
                      <span className="text-orange-400">-${selectedPayable.retentionUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Retencion Bs</span>
                      <span className="text-orange-400">-Bs {selectedPayable.retentionBs.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-700/50 pt-2 mt-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Neto a pagar</span>
                    <span className="text-slate-200">${selectedPayable.netPayableUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Ya pagado</span>
                    <span className="text-slate-200">${selectedPayable.paidAmountUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span className="text-slate-300">Saldo pendiente</span>
                    <span className="text-red-400">${selectedPayable.balanceUsd.toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Estado</span>
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[selectedPayable.status]}`}>
                    {STATUS_LABELS[selectedPayable.status]}
                  </span>
                </div>
              </div>

              {/* Payments history */}
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-2">Historial de Pagos</h3>
                {selectedPayable.payments && selectedPayable.payments.length > 0 ? (
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
                        {selectedPayable.payments.map((p: any) => (
                          <tr key={p.id} className="border-b border-slate-700/30">
                            <td className="px-3 py-2 text-slate-300 text-xs">{new Date(p.createdAt).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right text-slate-200">${p.amountUsd.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right text-slate-300">Bs {p.amountBs.toFixed(2)}</td>
                            <td className="px-3 py-2 text-slate-300">{PAYMENT_LABELS[p.method] || p.method}</td>
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
