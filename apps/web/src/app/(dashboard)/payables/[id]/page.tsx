'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Receipt, Loader2, ExternalLink, DollarSign, X, Shield,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface PayableDetail {
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
  islrRetentionUsd: number;
  islrRetentionBs: number;
  netPayableUsd: number;
  dueDate: string | null;
  status: string;
  paidAmountUsd: number;
  balanceUsd: number;
  notes: string | null;
  payments: PayablePayment[];
  createdAt: string;
}

interface PayablePayment {
  id: string;
  amountUsd: number;
  amountBs: number;
  method: { id: string; name: string } | null;
  methodId: string | null;
  reference: string | null;
  createdAt: string;
}

interface PaymentMethodOption {
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

export default function PayableDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [payable, setPayable] = useState<PayableDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Pay form
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payReference, setPayReference] = useState('');
  const [processing, setProcessing] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);

  const fetchPayable = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/payables/${id}`);
      if (!res.ok) throw new Error('Cuenta por pagar no encontrada');
      setPayable(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchPaymentMethods = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/payment-methods/flat');
      const data = await res.json();
      setPaymentMethods(Array.isArray(data) ? data : data.data || []);
    } catch {}
  }, []);

  useEffect(() => { fetchPayable(); fetchPaymentMethods(); }, [fetchPayable, fetchPaymentMethods]);

  async function handlePay() {
    setProcessing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/payables/${id}/pay`, {
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
        throw new Error(err.message || 'Error al registrar pago');
      }
      setPayOpen(false);
      setMessage({ type: 'success', text: 'Pago registrado exitosamente' });
      fetchPayable();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  }

  function fmtDate(iso: string) {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-green-500" size={32} /></div>;
  if (error || !payable) return (
    <div className="text-center py-20">
      <p className="text-red-400 mb-4">{error || 'Cuenta por pagar no encontrada'}</p>
      <button onClick={() => router.push('/payables')} className="btn-secondary">Volver a cuentas por pagar</button>
    </div>
  );

  const totalPaidUsd = payable.payments.reduce((s, p) => s + p.amountUsd, 0);
  const totalPaidBs = payable.payments.reduce((s, p) => s + p.amountBs, 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/payables')} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <Receipt className="text-red-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{payable.supplier.name}</h1>
            <p className="text-slate-400 text-sm">
              {payable.purchaseOrder ? `Orden ${payable.purchaseOrder.number}` : 'Cuenta por pagar'}
            </p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full border ${STATUS_COLORS[payable.status]}`}>
            {STATUS_LABELS[payable.status]}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {payable.purchaseOrder && (
            <button onClick={() => router.push(`/purchases/${payable.purchaseOrderId}`)} className="btn-secondary text-sm flex items-center gap-1.5">
              <ExternalLink size={14} /> Ver orden de compra
            </button>
          )}
          {payable.status !== 'PAID' && (
            <button onClick={() => { setPayOpen(true); setPayAmount(payable.balanceUsd.toFixed(2)); setPayMethod(''); setPayReference(''); }}
              className="text-sm px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium flex items-center gap-1.5">
              <DollarSign size={14} /> Registrar pago
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Informacion General</TabsTrigger>
          <TabsTrigger value="pagos">Historial de pagos</TabsTrigger>
        </TabsList>

        {/* TAB: Informacion General */}
        <TabsContent value="info">
          <div className="card p-6">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Proveedor</span>
                <span className="text-white">{payable.supplier.name}</span>
              </div>
              {payable.purchaseOrder && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Orden de compra</span>
                  <button onClick={() => router.push(`/purchases/${payable.purchaseOrderId}`)} className="text-green-400 hover:text-green-300 font-mono flex items-center gap-1">
                    {payable.purchaseOrder.number} <ExternalLink size={10} />
                  </button>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Fecha creacion</span>
                <span className="text-white">{fmtDate(payable.createdAt)}</span>
              </div>
              {payable.dueDate && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Fecha vencimiento</span>
                  <span className="text-white">{fmtDate(payable.dueDate)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Tasa al crear</span>
                <span className="text-white font-mono">Bs {payable.exchangeRate?.toFixed(2)}</span>
              </div>

              <div className="border-t border-slate-700/50 pt-3 mt-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Monto total USD</span>
                  <span className="text-white font-mono">${payable.amountUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Monto total Bs</span>
                  <span className="text-slate-300 font-mono">Bs {payable.amountBs.toFixed(2)}</span>
                </div>
              </div>

              {/* Retentions */}
              {(payable.retentionUsd > 0 || payable.islrRetentionUsd > 0) && (
                <div className="border-t border-slate-700/50 pt-3 mt-3 space-y-2">
                  <h4 className="text-orange-400 font-medium flex items-center gap-1">
                    <Shield size={14} /> Retenciones
                  </h4>
                  {payable.retentionUsd > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Retencion IVA USD</span>
                        <span className="text-orange-400 font-mono">-${payable.retentionUsd.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Retencion IVA Bs</span>
                        <span className="text-orange-400 font-mono">-Bs {payable.retentionBs.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  {payable.islrRetentionUsd > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Retencion ISLR USD</span>
                        <span className="text-purple-400 font-mono">-${payable.islrRetentionUsd.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Retencion ISLR Bs</span>
                        <span className="text-purple-400 font-mono">-Bs {payable.islrRetentionBs.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="border-t border-slate-700/50 pt-3 mt-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Neto a pagar</span>
                  <span className="text-white font-mono">${payable.netPayableUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Ya pagado</span>
                  <span className="text-slate-300 font-mono">${payable.paidAmountUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold text-base">
                  <span className="text-slate-300">Saldo pendiente</span>
                  <span className="text-red-400 font-mono">${payable.balanceUsd.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB: Historial de pagos */}
        <TabsContent value="pagos">
          <div className="card overflow-hidden">
            {payable.payments.length === 0 ? (
              <div className="text-center py-12 text-slate-500">Sin pagos registrados</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Monto USD</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Monto Bs</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Metodo</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  {payable.payments.map(p => (
                    <tr key={p.id} className="border-b border-slate-700/30">
                      <td className="px-4 py-3 text-slate-300 text-xs">{fmtDate(p.createdAt)}</td>
                      <td className="px-4 py-3 text-right font-mono text-white">${p.amountUsd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">Bs {p.amountBs.toFixed(2)}</td>
                      <td className="px-4 py-3 text-slate-300">{p.method?.name || 'Metodo'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{p.reference || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-700/50">
                    <td className="px-4 py-3 text-slate-400 font-medium">Total pagado</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-white">${totalPaidUsd.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-300">Bs {totalPaidBs.toFixed(2)}</td>
                    <td colSpan={2}></td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-slate-400 font-medium">Saldo pendiente</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-amber-400">${payable.balanceUsd.toFixed(2)}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Pay Modal */}
      {payOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPayOpen(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
              <h2 className="text-lg font-semibold text-slate-100">Registrar Pago</h2>
              <button onClick={() => setPayOpen(false)} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-900/50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Proveedor</span>
                  <span className="text-slate-200">{payable.supplier.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Saldo pendiente</span>
                  <span className="text-red-400 font-semibold">${payable.balanceUsd.toFixed(2)}</span>
                </div>
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Monto a pagar (USD)</label>
                <input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Metodo de pago</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200">
                  <option value="">Seleccionar metodo</option>
                  {paymentMethods.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Referencia (opcional)</label>
                <input type="text" value={payReference} onChange={e => setPayReference(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" placeholder="Numero de referencia" />
              </div>
              <button onClick={handlePay} disabled={processing || !payAmount || parseFloat(payAmount) <= 0 || !payMethod}
                className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                {processing ? <Loader2 className="animate-spin" size={18} /> : <DollarSign size={18} />}
                Confirmar pago
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
