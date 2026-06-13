'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, HandCoins, Loader2, ExternalLink, DollarSign, X, Trash2,
} from 'lucide-react';
import DynamicKeyModal from '@/components/dynamic-key-modal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface ReceivableDetail {
  id: string;
  number: string | null;
  type: string;
  customerId: string | null;
  customer: { id: string; name: string; documentType: string; rif: string | null } | null;
  platformName: string | null;
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
  balanceUsd: number;
  notes: string | null;
  serieId: string | null;
  serie: { id: string; name: string; isFiscal: boolean } | null;
  currency: string;
  originalDate: string | null;
  receptionDate: string | null;
  paymentTerms: string | null;
  exemptBaseUsd: number;
  exemptBaseBs: number;
  taxableBase8Usd: number;
  taxableBase8Bs: number;
  taxableBase16Usd: number;
  taxableBase16Bs: number;
  taxableBase31Usd: number;
  taxableBase31Bs: number;
  iva8Usd: number;
  iva8Bs: number;
  iva16Usd: number;
  iva16Bs: number;
  iva31Usd: number;
  iva31Bs: number;
  totalIvaUsd: number;
  totalIvaBs: number;
  igtfPct: number;
  igtfUsd: number;
  igtfBs: number;
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
  MANUAL: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
};

const TYPE_LABELS: Record<string, string> = {
  CUSTOMER_CREDIT: 'Credito cliente',
  FINANCING_PLATFORM: 'Plataforma',
  MANUAL: 'Manual',
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
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function executeDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/proxy/receivables/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al eliminar');
      }
      router.push('/receivables');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
      setDeleting(false);
    }
  }

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
    if (receivable) document.title = `CxC - ${receivable.invoice?.number || receivable.number || 'Manual'} | Trinity ERP`;
  }, [receivable]);

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
  const isFiscal = receivable.serie?.isFiscal ?? false;
  const hasFiscalData = isFiscal || (receivable.exemptBaseUsd || 0) > 0 || (receivable.taxableBase16Usd || 0) > 0 || (receivable.taxableBase8Usd || 0) > 0 || (receivable.taxableBase31Usd || 0) > 0;
  // Solo CxC manual (sin factura) y no cruzada/cobrada
  const canDelete = receivable.type === 'MANUAL' && !receivable.invoiceId && receivable.status !== 'PAID'
    && receivable.status !== 'PARTIAL' && (receivable.paidAmountUsd || 0) === 0 && receivable.payments.length === 0;

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
            <p className="text-slate-400 text-sm">Factura {receivable.invoice?.number || receivable.number || 'Manual'}</p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full border ${TYPE_COLORS[receivable.type]}`}>
            {receivable.platformName || TYPE_LABELS[receivable.type]}
          </span>
          <span className={`text-xs px-2.5 py-1 rounded-full border ${STATUS_COLORS[receivable.status]}`}>
            {STATUS_LABELS[receivable.status]}
          </span>
          {receivable.serie && (
            <span className={`text-xs px-2.5 py-1 rounded-full border ${isFiscal ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-slate-400 border-slate-500/30 bg-slate-500/10'}`}>
              {receivable.serie.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {receivable.invoiceId && (
            <button onClick={() => router.push(`/sales/invoices/${receivable.invoiceId}`)} className="btn-secondary text-sm flex items-center gap-1.5">
              <ExternalLink size={14} /> Ver factura origen
            </button>
          )}
          {receivable.status !== 'PAID' && (
            <button onClick={() => { setPayOpen(true); setPayAmount(receivable.balanceUsd.toFixed(2)); setPayMethod(''); setPayReference(''); }}
              className="btn-primary text-sm flex items-center gap-1.5">
              <DollarSign size={14} /> Registrar cobro
            </button>
          )}
          {canDelete && (
            <button onClick={() => setAuthModalOpen(true)} disabled={deleting}
              className="text-sm px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1.5">
              {deleting ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />} Eliminar
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
          <TabsTrigger value="fiscal">Desglose Fiscal</TabsTrigger>
          <TabsTrigger value="cobros">Historial de cobros</TabsTrigger>
        </TabsList>

        {/* TAB: Informacion General */}
        <TabsContent value="info">
          <div className="card p-6">
            <div className="space-y-3 text-sm">
              {receivable.customer && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Cliente</span>
                  <span className="text-white">{receivable.customer.name} ({receivable.customer.documentType}-{receivable.customer.rif || '-'})</span>
                </div>
              )}
              {receivable.platformName && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Plataforma</span>
                  <span className="text-white">{receivable.platformName}</span>
                </div>
              )}
              {receivable.number && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Correlativo</span>
                  <span className="text-white font-mono">{receivable.number}</span>
                </div>
              )}
              {receivable.invoiceId && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Factura origen</span>
                  <button onClick={() => router.push(`/sales/invoices/${receivable.invoiceId}`)} className="text-green-400 hover:text-green-300 font-mono flex items-center gap-1">
                    {receivable.invoice?.number || 'Ver'} <ExternalLink size={10} />
                  </button>
                </div>
              )}
              {receivable.serie && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Serie</span>
                  <span className={isFiscal ? 'text-green-400' : 'text-slate-300'}>{receivable.serie.name} {isFiscal ? '(Fiscal)' : ''}</span>
                </div>
              )}
              {receivable.currency && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Moneda</span>
                  <span className="text-white">{receivable.currency}</span>
                </div>
              )}
              {receivable.description && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Descripcion</span>
                  <span className="text-white">{receivable.description}</span>
                </div>
              )}

              {/* Fechas */}
              <div className="border-t border-slate-700/50 pt-3 mt-3 space-y-2">
                {receivable.originalDate && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Fecha original</span>
                    <span className="text-white">{fmtDate(receivable.originalDate)}</span>
                  </div>
                )}
                {receivable.receptionDate && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Fecha recepcion</span>
                    <span className="text-white">{fmtDate(receivable.receptionDate)}</span>
                  </div>
                )}
                {receivable.dueDate && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Fecha vencimiento</span>
                    <span className="text-white">{fmtDate(receivable.dueDate)}</span>
                  </div>
                )}
                {receivable.paymentTerms && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Forma de pago</span>
                    <span className="text-white">{receivable.paymentTerms.replace(/_/g, ' ')}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Tasa al crear</span>
                  <span className="text-white font-mono">Bs {receivable.exchangeRate?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Fecha creacion</span>
                  <span className="text-white">{fmtDate(receivable.createdAt)}</span>
                </div>
              </div>

              {/* Montos */}
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

              {/* Notas */}
              {receivable.notes && (
                <div className="border-t border-slate-700/50 pt-3 mt-3">
                  <span className="text-slate-400 block mb-1">Notas</span>
                  <p className="text-slate-300 whitespace-pre-wrap">{receivable.notes}</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* TAB: Desglose Fiscal */}
        <TabsContent value="fiscal">
            <div className="card p-6">
              <div className="space-y-3 text-sm">
                {receivable.number && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Correlativo</span>
                    <span className="text-white font-mono">{receivable.number}</span>
                  </div>
                )}
                {receivable.serie && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Serie</span>
                    <span className={isFiscal ? 'text-green-400' : 'text-slate-300'}>{receivable.serie.name} {isFiscal ? '(Fiscal)' : ''}</span>
                  </div>
                )}
                {receivable.currency && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Moneda de entrada</span>
                    <span className="text-white">{receivable.currency}</span>
                  </div>
                )}
                {receivable.paymentTerms && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Forma de pago</span>
                    <span className="text-white">{receivable.paymentTerms.replace('_', ' ')}</span>
                  </div>
                )}

                <div className="border-t border-slate-700/50 pt-3 mt-3">
                  <h4 className="text-slate-300 font-medium mb-2">Desglose por alicuota</h4>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="text-left py-2 text-slate-400 font-medium">Concepto</th>
                        <th className="text-right py-2 text-slate-400 font-medium">USD</th>
                        <th className="text-right py-2 text-slate-400 font-medium">Bs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(receivable.exemptBaseUsd || 0) > 0 && (
                        <tr className="border-b border-slate-700/30">
                          <td className="py-2 text-slate-300">Base exenta</td>
                          <td className="py-2 text-right font-mono text-white">${(receivable.exemptBaseUsd || 0).toFixed(2)}</td>
                          <td className="py-2 text-right font-mono text-slate-300">Bs {(receivable.exemptBaseBs || 0).toFixed(2)}</td>
                        </tr>
                      )}
                      {(receivable.taxableBase8Usd || 0) > 0 && (
                        <>
                          <tr className="border-b border-slate-700/30">
                            <td className="py-2 text-slate-300">Base imponible 8%</td>
                            <td className="py-2 text-right font-mono text-white">${(receivable.taxableBase8Usd || 0).toFixed(2)}</td>
                            <td className="py-2 text-right font-mono text-slate-300">Bs {(receivable.taxableBase8Bs || 0).toFixed(2)}</td>
                          </tr>
                          <tr className="border-b border-slate-700/30">
                            <td className="py-2 text-cyan-400 pl-4">IVA 8%</td>
                            <td className="py-2 text-right font-mono text-cyan-400">${(receivable.iva8Usd || 0).toFixed(2)}</td>
                            <td className="py-2 text-right font-mono text-cyan-300">Bs {(receivable.iva8Bs || 0).toFixed(2)}</td>
                          </tr>
                        </>
                      )}
                      {(receivable.taxableBase16Usd || 0) > 0 && (
                        <>
                          <tr className="border-b border-slate-700/30">
                            <td className="py-2 text-slate-300">Base imponible 16%</td>
                            <td className="py-2 text-right font-mono text-white">${(receivable.taxableBase16Usd || 0).toFixed(2)}</td>
                            <td className="py-2 text-right font-mono text-slate-300">Bs {(receivable.taxableBase16Bs || 0).toFixed(2)}</td>
                          </tr>
                          <tr className="border-b border-slate-700/30">
                            <td className="py-2 text-cyan-400 pl-4">IVA 16%</td>
                            <td className="py-2 text-right font-mono text-cyan-400">${(receivable.iva16Usd || 0).toFixed(2)}</td>
                            <td className="py-2 text-right font-mono text-cyan-300">Bs {(receivable.iva16Bs || 0).toFixed(2)}</td>
                          </tr>
                        </>
                      )}
                      {(receivable.taxableBase31Usd || 0) > 0 && (
                        <>
                          <tr className="border-b border-slate-700/30">
                            <td className="py-2 text-slate-300">Base imponible 31%</td>
                            <td className="py-2 text-right font-mono text-white">${(receivable.taxableBase31Usd || 0).toFixed(2)}</td>
                            <td className="py-2 text-right font-mono text-slate-300">Bs {(receivable.taxableBase31Bs || 0).toFixed(2)}</td>
                          </tr>
                          <tr className="border-b border-slate-700/30">
                            <td className="py-2 text-cyan-400 pl-4">IVA 31%</td>
                            <td className="py-2 text-right font-mono text-cyan-400">${(receivable.iva31Usd || 0).toFixed(2)}</td>
                            <td className="py-2 text-right font-mono text-cyan-300">Bs {(receivable.iva31Bs || 0).toFixed(2)}</td>
                          </tr>
                        </>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2 text-slate-300 font-medium">Total IVA</td>
                        <td className="py-2 text-right font-mono font-bold text-cyan-400">${(receivable.totalIvaUsd || 0).toFixed(2)}</td>
                        <td className="py-2 text-right font-mono font-bold text-cyan-300">Bs {(receivable.totalIvaBs || 0).toFixed(2)}</td>
                      </tr>
                      {(receivable.igtfUsd || 0) > 0 && (
                        <tr>
                          <td className="py-2 text-orange-400 font-medium">IGTF ({receivable.igtfPct || 0}%)</td>
                          <td className="py-2 text-right font-mono font-bold text-orange-400">${(receivable.igtfUsd || 0).toFixed(2)}</td>
                          <td className="py-2 text-right font-mono font-bold text-orange-300">Bs {(receivable.igtfBs || 0).toFixed(2)}</td>
                        </tr>
                      )}
                      <tr className="border-t border-slate-600">
                        <td className="py-2 text-white font-semibold text-base">Total</td>
                        <td className="py-2 text-right font-mono font-bold text-green-400 text-base">${receivable.amountUsd.toFixed(2)}</td>
                        <td className="py-2 text-right font-mono font-bold text-slate-200 text-base">Bs {receivable.amountBs.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
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
                      <td className="px-4 py-3 text-slate-400 text-xs">{p.reference || '-'}</td>
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

      <DynamicKeyModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthorized={executeDelete}
        permission="DELETE_RECEIVABLE"
        entityType="Receivable"
        entityId={id}
        action={`Eliminar CxC ${receivable.number || ''}`}
      />
    </div>
  );
}
