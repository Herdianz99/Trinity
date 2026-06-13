'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Receipt, Loader2, ExternalLink, DollarSign, X, Trash2,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import DynamicKeyModal from '@/components/dynamic-key-modal';

interface RetentionVoucherRef {
  id: string;
  number: string;
  status: string;
  retentionAmountUsd: number;
  retentionAmountBs: number;
}

interface RetentionVoucherLineRef {
  id: string;
  retentionVoucher: RetentionVoucherRef;
}

interface PayableDetail {
  id: string;
  number: string | null;
  supplierId: string;
  supplier: { id: string; name: string; rif?: string | null };
  purchaseOrderId: string | null;
  purchaseOrder: { id: string; number: string } | null;
  documentNumber: string | null;
  description: string | null;
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
  serieId: string | null;
  serie: { id: string; name: string; isFiscal: boolean } | null;
  serieProveedor: string | null;
  controlFiscal: string | null;
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
  retentionVoucherLines: RetentionVoucherLineRef[];
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

function Field({ label, value, mono, accent, className }: { label: string; value: ReactNode; mono?: boolean; accent?: string; className?: string }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className={className}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">{label}</div>
      <div className={`text-sm ${mono ? 'font-mono' : ''} ${accent || 'text-slate-200'}`}>
        {empty ? <span className="text-slate-600">—</span> : value}
      </div>
    </div>
  );
}

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
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function executeDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/proxy/payables/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al eliminar');
      }
      router.push('/payables');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
      setDeleting(false);
    }
  }

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

  useEffect(() => {
    if (payable) document.title = `CxP - ${payable.supplier.name} | Trinity ERP`;
  }, [payable]);

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
  const isFiscal = payable.serie?.isFiscal ?? false;
  const hasFiscalData = isFiscal || (payable.exemptBaseUsd || 0) > 0 || (payable.taxableBase16Usd || 0) > 0 || (payable.taxableBase8Usd || 0) > 0 || (payable.taxableBase31Usd || 0) > 0;
  const retentionVouchers = (payable.retentionVoucherLines || []).map(l => l.retentionVoucher).filter(Boolean);
  // Solo CxP manual (sin factura de compra) y no cruzada/pagada
  const canDelete = !payable.purchaseOrderId && payable.status !== 'PAID' && payable.status !== 'PARTIAL'
    && (payable.paidAmountUsd || 0) === 0 && payable.payments.length === 0;

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
              {payable.purchaseOrder ? `Orden ${payable.purchaseOrder.number}` : payable.documentNumber ? `Doc. ${payable.documentNumber}` : 'Cuenta por pagar'}
            </p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full border ${STATUS_COLORS[payable.status]}`}>
            {STATUS_LABELS[payable.status]}
          </span>
          {payable.serie && (
            <span className={`text-xs px-2.5 py-1 rounded-full border ${isFiscal ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-slate-400 border-slate-500/30 bg-slate-500/10'}`}>
              {payable.serie.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {payable.purchaseOrder && (
            <button onClick={() => router.push(`/purchases/${payable.purchaseOrderId}`)} className="btn-secondary text-sm flex items-center gap-1.5">
              <ExternalLink size={14} /> Ver factura de compra
            </button>
          )}
          {payable.status !== 'PAID' && (
            <button onClick={() => { setPayOpen(true); setPayAmount(payable.balanceUsd.toFixed(2)); setPayMethod(''); setPayReference(''); }}
              className="text-sm px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium flex items-center gap-1.5">
              <DollarSign size={14} /> Registrar pago
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
          <TabsTrigger value="pagos">Historial de pagos</TabsTrigger>
        </TabsList>

        {/* TAB: Informacion General */}
        <TabsContent value="info">
          <div className="card p-6 space-y-6">
            {/* Datos del documento */}
            <section>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 pb-2 border-b border-slate-700/50">Datos del documento</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                <Field label="Proveedor" value={payable.supplier.name} className="col-span-2 sm:col-span-1" />
                <Field label="RIF" value={payable.supplier.rif} mono />
                <Field label="Correlativo (CxP)" value={payable.number} mono />
                <Field label="Nro. Documento" value={payable.documentNumber} mono />
                <Field label="Control Fiscal" value={payable.controlFiscal} mono />
                <Field label="Serie (factura proveedor)" value={payable.serieProveedor} mono />
                <Field label="Serie fiscal"
                  value={payable.serie ? `${payable.serie.name}${isFiscal ? ' (Fiscal)' : ''}` : null}
                  accent={isFiscal ? 'text-green-400' : 'text-slate-200'} />
                <Field label="Moneda" value={payable.currency} />
                {payable.purchaseOrder && (
                  <Field label="Factura de compra" value={
                    <button onClick={() => router.push(`/purchases/${payable.purchaseOrderId}`)}
                      className="text-green-400 hover:text-green-300 font-mono flex items-center gap-1">
                      {payable.purchaseOrder.number} <ExternalLink size={10} />
                    </button>
                  } />
                )}
                {payable.description && (
                  <Field label="Descripción" value={payable.description} className="col-span-2 sm:col-span-3" />
                )}
              </div>
            </section>

            {/* Fechas y forma de pago */}
            <section>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 pb-2 border-b border-slate-700/50">Fechas y forma de pago</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                <Field label="Fecha original" value={payable.originalDate ? fmtDate(payable.originalDate) : null} />
                <Field label="Fecha recepción" value={payable.receptionDate ? fmtDate(payable.receptionDate) : null} />
                <Field label="Fecha vencimiento" value={payable.dueDate ? fmtDate(payable.dueDate) : null} />
                <Field label="Forma de pago" value={payable.paymentTerms ? payable.paymentTerms.replace(/_/g, ' ') : null} />
                <Field label="Tasa al crear" value={`Bs ${payable.exchangeRate?.toFixed(2)}`} mono />
                <Field label="Fecha de creación" value={fmtDate(payable.createdAt)} />
              </div>
            </section>

            {/* Montos y retenciones */}
            <section>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 pb-2 border-b border-slate-700/50">Montos</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                <Field label="Monto total USD" value={`$${payable.amountUsd.toFixed(2)}`} mono />
                <Field label="Monto total Bs" value={`Bs ${payable.amountBs.toFixed(2)}`} mono accent="text-slate-300" />
                {payable.retentionUsd > 0 && <Field label="Retención IVA USD" value={`-$${payable.retentionUsd.toFixed(2)}`} mono accent="text-orange-400" />}
                {payable.retentionUsd > 0 && <Field label="Retención IVA Bs" value={`-Bs ${payable.retentionBs.toFixed(2)}`} mono accent="text-orange-400" />}
                {(payable.islrRetentionUsd || 0) > 0 && <Field label="Retención ISLR USD" value={`-$${payable.islrRetentionUsd.toFixed(2)}`} mono accent="text-purple-400" />}
                {(payable.islrRetentionUsd || 0) > 0 && <Field label="Retención ISLR Bs" value={`-Bs ${payable.islrRetentionBs.toFixed(2)}`} mono accent="text-purple-400" />}
                <Field label="Neto a pagar" value={`$${payable.netPayableUsd.toFixed(2)}`} mono />
                <Field label="Ya pagado" value={`$${payable.paidAmountUsd.toFixed(2)}`} mono accent="text-slate-300" />
                <Field label="Saldo pendiente" value={`$${payable.balanceUsd.toFixed(2)}`} mono accent="text-red-400" />
              </div>
              {retentionVouchers.length > 0 && (
                <div className="mt-4 space-y-1">
                  {retentionVouchers.map((rv) => (
                    <button key={rv.id} onClick={() => router.push(`/purchases/retentions/${rv.id}`)}
                      className="flex items-center gap-1.5 text-orange-400 hover:text-orange-300 text-xs">
                      <ExternalLink size={12} /> Comprobante {rv.number} ({rv.status}) — ${rv.retentionAmountUsd.toFixed(2)}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Notas */}
            {payable.notes && (
              <section>
                <h3 className="text-sm font-semibold text-slate-300 mb-2 pb-2 border-b border-slate-700/50">Notas</h3>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{payable.notes}</p>
              </section>
            )}
          </div>
        </TabsContent>

        {/* TAB: Desglose Fiscal */}
        <TabsContent value="fiscal">
            <div className="card p-6">
              <div className="space-y-3 text-sm">
                {payable.number && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Correlativo</span>
                    <span className="text-white font-mono">{payable.number}</span>
                  </div>
                )}
                {payable.controlFiscal && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Control fiscal</span>
                    <span className="text-white font-mono">{payable.controlFiscal}</span>
                  </div>
                )}
                {payable.serie && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Serie</span>
                    <span className={isFiscal ? 'text-green-400' : 'text-slate-300'}>{payable.serie.name} {isFiscal ? '(Fiscal)' : ''}</span>
                  </div>
                )}
                {payable.currency && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Moneda de entrada</span>
                    <span className="text-white">{payable.currency}</span>
                  </div>
                )}
                {payable.paymentTerms && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Forma de pago</span>
                    <span className="text-white">{payable.paymentTerms.replace('_', ' ')}</span>
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
                      {(payable.exemptBaseUsd || 0) > 0 && (
                        <tr className="border-b border-slate-700/30">
                          <td className="py-2 text-slate-300">Base exenta</td>
                          <td className="py-2 text-right font-mono text-white">${(payable.exemptBaseUsd || 0).toFixed(2)}</td>
                          <td className="py-2 text-right font-mono text-slate-300">Bs {(payable.exemptBaseBs || 0).toFixed(2)}</td>
                        </tr>
                      )}
                      {(payable.taxableBase8Usd || 0) > 0 && (
                        <>
                          <tr className="border-b border-slate-700/30">
                            <td className="py-2 text-slate-300">Base imponible 8%</td>
                            <td className="py-2 text-right font-mono text-white">${(payable.taxableBase8Usd || 0).toFixed(2)}</td>
                            <td className="py-2 text-right font-mono text-slate-300">Bs {(payable.taxableBase8Bs || 0).toFixed(2)}</td>
                          </tr>
                          <tr className="border-b border-slate-700/30">
                            <td className="py-2 text-cyan-400 pl-4">IVA 8%</td>
                            <td className="py-2 text-right font-mono text-cyan-400">${(payable.iva8Usd || 0).toFixed(2)}</td>
                            <td className="py-2 text-right font-mono text-cyan-300">Bs {(payable.iva8Bs || 0).toFixed(2)}</td>
                          </tr>
                        </>
                      )}
                      {(payable.taxableBase16Usd || 0) > 0 && (
                        <>
                          <tr className="border-b border-slate-700/30">
                            <td className="py-2 text-slate-300">Base imponible 16%</td>
                            <td className="py-2 text-right font-mono text-white">${(payable.taxableBase16Usd || 0).toFixed(2)}</td>
                            <td className="py-2 text-right font-mono text-slate-300">Bs {(payable.taxableBase16Bs || 0).toFixed(2)}</td>
                          </tr>
                          <tr className="border-b border-slate-700/30">
                            <td className="py-2 text-cyan-400 pl-4">IVA 16%</td>
                            <td className="py-2 text-right font-mono text-cyan-400">${(payable.iva16Usd || 0).toFixed(2)}</td>
                            <td className="py-2 text-right font-mono text-cyan-300">Bs {(payable.iva16Bs || 0).toFixed(2)}</td>
                          </tr>
                        </>
                      )}
                      {(payable.taxableBase31Usd || 0) > 0 && (
                        <>
                          <tr className="border-b border-slate-700/30">
                            <td className="py-2 text-slate-300">Base imponible 31%</td>
                            <td className="py-2 text-right font-mono text-white">${(payable.taxableBase31Usd || 0).toFixed(2)}</td>
                            <td className="py-2 text-right font-mono text-slate-300">Bs {(payable.taxableBase31Bs || 0).toFixed(2)}</td>
                          </tr>
                          <tr className="border-b border-slate-700/30">
                            <td className="py-2 text-cyan-400 pl-4">IVA 31%</td>
                            <td className="py-2 text-right font-mono text-cyan-400">${(payable.iva31Usd || 0).toFixed(2)}</td>
                            <td className="py-2 text-right font-mono text-cyan-300">Bs {(payable.iva31Bs || 0).toFixed(2)}</td>
                          </tr>
                        </>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-700/50">
                        <td className="py-2 text-slate-300 font-medium">Total IVA</td>
                        <td className="py-2 text-right font-mono font-bold text-cyan-400">${(payable.totalIvaUsd || 0).toFixed(2)}</td>
                        <td className="py-2 text-right font-mono font-bold text-cyan-300">Bs {(payable.totalIvaBs || 0).toFixed(2)}</td>
                      </tr>
                      {(payable.igtfUsd || 0) > 0 && (
                        <tr>
                          <td className="py-2 text-orange-400 font-medium">IGTF ({payable.igtfPct || 0}%)</td>
                          <td className="py-2 text-right font-mono font-bold text-orange-400">${(payable.igtfUsd || 0).toFixed(2)}</td>
                          <td className="py-2 text-right font-mono font-bold text-orange-300">Bs {(payable.igtfBs || 0).toFixed(2)}</td>
                        </tr>
                      )}
                      <tr className="border-t border-slate-600">
                        <td className="py-2 text-white font-semibold text-base">Total</td>
                        <td className="py-2 text-right font-mono font-bold text-red-400 text-base">${payable.amountUsd.toFixed(2)}</td>
                        <td className="py-2 text-right font-mono font-bold text-slate-200 text-base">Bs {payable.amountBs.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
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
                      <td className="px-4 py-3 text-slate-400 text-xs">{p.reference || '-'}</td>
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

      <DynamicKeyModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthorized={executeDelete}
        permission="DELETE_PAYABLE"
        entityType="Payable"
        entityId={id}
        action={`Eliminar CxP ${payable.number || ''}`}
      />
    </div>
  );
}
