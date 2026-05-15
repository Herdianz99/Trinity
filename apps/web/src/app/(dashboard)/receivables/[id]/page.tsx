'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, HandCoins, Loader2, ExternalLink, DollarSign, X,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface ReceivableDetail {
  id: string;
  type: string;
  customerId: string | null;
  customer: { id: string; name: string; documentType: string; rif: string | null } | null;
  platformName: string | null;
  invoiceId: string;
  invoice: { id: string; number: string };
  amountUsd: number;
  amountBs: number;
  exchangeRate: number;
  dueDate: string | null;
  status: string;
  paidAmountUsd: number;
  balanceUsd: number;
  notes: string | null;
  payments: ReceivablePayment[];
  createdAt: string;
}

interface ReceivablePayment {
  id: string;
  amountUsd: number;
  amountBs: number;
  method: { id: string; name: string } | null;
  reference: string | null;
  createdAt: string;
}

interface PaymentMethod {
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

const TYPE_COLORS: Record<string, string> = {
  CUSTOMER_CREDIT: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  FINANCING_PLATFORM: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
};

const TYPE_LABELS: Record<string, string> = {
  CUSTOMER_CREDIT: 'Credito cliente',
  FINANCING_PLATFORM: 'Plataforma',
};

export default function ReceivableDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [receivable, setReceivable] = useState<ReceivableDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Pay form
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payReference, setPayReference] = useState('');
  const [processing, setProcessing] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  const fetchReceivable = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/receivables/${id}`);
      if (!res.ok) throw new Error('Cuenta por cobrar no encontrada');
      setReceivable(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchReceivable(); }, [fetchReceivable]);

  useEffect(() => {
    fetch('/api/proxy/payment-methods/flat')
      .then(r => r.json())
      .then(data => setPaymentMethods(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  async function handlePay() {
    setProcessing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/receivables/${id}/pay`, {
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
        throw new Error(err.message || 'Error al registrar cobro');
      }
      setPayOpen(false);
      setMessage({ type: 'success', text: 'Cobro registrado exitosamente' });
      fetchReceivable();
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
  if (error || !receivable) return (
    <div className="text-center py-20">
      <p className="text-red-400 mb-4">{error || 'Cuenta por cobrar no encontrada'}</p>
      <button onClick={() => router.push('/receivables')} className="btn-secondary">Volver a cuentas por cobrar</button>
    </div>
  );

  const totalPaidUsd = receivable.payments.reduce((s, p) => s + p.amountUsd, 0);
  const totalPaidBs = receivable.payments.reduce((s, p) => s + p.amountBs, 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/receivables')} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <HandCoins className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Cuenta por Cobrar</h1>
            <p className="text-slate-400 text-sm">Factura {receivable.invoice.number}</p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full border ${TYPE_COLORS[receivable.type]}`}>
            {receivable.platformName || TYPE_LABELS[receivable.type]}
          </span>
          <span className={`text-xs px-2.5 py-1 rounded-full border ${STATUS_COLORS[receivable.status]}`}>
            {STATUS_LABELS[receivable.status]}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => router.push(`/sales/invoices/${receivable.invoiceId}`)} className="btn-secondary text-sm flex items-center gap-1.5">
            <ExternalLink size={14} /> Ver factura origen
          </button>
          {receivable.status !== 'PAID' && (
            <button onClick={() => { setPayOpen(true); setPayAmount(receivable.balanceUsd.toFixed(2)); setPayMethod(''); setPayReference(''); }}
              className="btn-primary text-sm flex items-center gap-1.5">
              <DollarSign size={14} /> Registrar cobro
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
          <TabsTrigger value="cobros">Historial de cobros</TabsTrigger>
        </TabsList>

        {/* TAB: Informacion General */}
        <TabsContent value="info">
          <div className="card p-6">
            <div className="space-y-3 text-sm">
              {receivable.customer && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Cliente</span>
                  <span className="text-white">{receivable.customer.name} ({receivable.customer.documentType}-{receivable.customer.rif || '—'})</span>
                </div>
              )}
              {receivable.platformName && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Plataforma</span>
                  <span className="text-white">{receivable.platformName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Factura</span>
                <button onClick={() => router.push(`/sales/invoices/${receivable.invoiceId}`)} className="text-green-400 hover:text-green-300 font-mono flex items-center gap-1">
                  {receivable.invoice.number} <ExternalLink size={10} />
                </button>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Fecha creacion</span>
                <span className="text-white">{fmtDate(receivable.createdAt)}</span>
              </div>
              {receivable.dueDate && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Fecha vencimiento</span>
                  <span className="text-white">{fmtDate(receivable.dueDate)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Tasa al crear</span>
                <span className="text-white font-mono">Bs {receivable.exchangeRate?.toFixed(2)}</span>
              </div>

              <div className="border-t border-slate-700/50 pt-3 mt-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Monto USD</span>
                  <span className="text-white font-mono">${receivable.amountUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Monto Bs</span>
                  <span className="text-slate-300 font-mono">Bs {receivable.amountBs.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Cobrado</span>
                  <span className="text-slate-300 font-mono">${receivable.paidAmountUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold text-base">
                  <span className="text-slate-300">Saldo pendiente</span>
                  <span className="text-green-400 font-mono">${receivable.balanceUsd.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB: Historial de cobros */}
        <TabsContent value="cobros">
          <div className="card overflow-hidden">
            {receivable.payments.length === 0 ? (
              <div className="text-center py-12 text-slate-500">Sin cobros registrados</div>
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
                  {receivable.payments.map(p => (
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
                    <td className="px-4 py-3 text-slate-400 font-medium">Total cobrado</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-white">${totalPaidUsd.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-300">Bs {totalPaidBs.toFixed(2)}</td>
                    <td colSpan={2}></td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-slate-400 font-medium">Saldo pendiente</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-amber-400">${receivable.balanceUsd.toFixed(2)}</td>
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
              <h2 className="text-lg font-semibold text-slate-100">Registrar Cobro</h2>
              <button onClick={() => setPayOpen(false)} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-900/50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Saldo pendiente</span>
                  <span className="text-green-400 font-semibold">${receivable.balanceUsd.toFixed(2)}</span>
                </div>
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Monto a cobrar (USD)</label>
                <input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
              </div>
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
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Referencia (opcional)</label>
                <input type="text" value={payReference} onChange={e => setPayReference(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" placeholder="Numero de referencia" />
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
    </div>
  );
}
