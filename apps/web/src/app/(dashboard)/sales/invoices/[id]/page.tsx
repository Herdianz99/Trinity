'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, FileText, Loader2, Printer, ExternalLink, DollarSign, X, FileX2,
  AlertTriangle, RotateCcw, Save, Edit3, Copy, Shield, MoreHorizontal,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

interface InvoiceDetail {
  id: string;
  number: string;
  controlNumber: string | null;
  fiscalNumber: string | null;
  fiscalMachineSerial: string | null;
  fiscalPrinted: boolean;
  status: string;
  paymentType: string;
  totalUsd: number;
  totalBs: number;
  subtotalUsd: number;
  subtotalBs: number;
  ivaUsd: number;
  ivaBs: number;
  igtfUsd: number;
  igtfBs: number;
  exchangeRate: number;
  totalPaidUsd: number;
  changeBs: number;
  isCredit: boolean;
  createdAt: string;
  customer: { id: string; name: string; documentType: string; rif: string | null; phone: string | null } | null;
  cashRegister: { id: string; code: string; name: string } | null;
  serie?: { id: string; name: string; prefix: string; isFiscal: boolean; comPort?: string } | null;
  seller: { id: string; code: string; name: string } | null;
  cashier: { id: string; name: string } | null;
  items: InvoiceItem[];
  payments: Payment[];
  receivables: ReceivableLink[];
}

interface InvoiceItem {
  id: string;
  productName: string;
  productCode: string | null;
  quantity: number;
  unitPrice: number;
  unitPriceBs: number;
  ivaType: string;
  ivaAmount: number;
  ivaAmountBs: number;
  totalUsd: number;
  totalBs: number;
  discountPct?: number;
  priceOverridden?: boolean;
}

interface Payment {
  id: string;
  method: { name: string } | null;
  amountUsd: number;
  amountBs: number;
  exchangeRate: number;
  reference: string | null;
  igtfUsd: number;
  igtfBs: number;
  changeAmountBs: number;
  changeMethod: { name: string } | null;
  createdAt: string;
}

interface ReceivablePaymentLink {
  id: string;
  amountUsd: number;
  amountBs: number;
  exchangeRate: number;
  method: { name: string } | null;
  receipt: { id: string; number: string } | null;
  createdAt: string;
}

interface ReceivableLink {
  id: string;
  type: string;
  amountUsd: number;
  paidAmountUsd: number;
  balanceUsd?: number;
  status: string;
  payments?: ReceivablePaymentLink[];
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  PAID: 'text-green-400 border-green-500/30 bg-green-500/10',
  PARTIAL_RETURN: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  RETURNED: 'text-red-400 border-red-500/30 bg-red-500/10',
  CANCELLED: 'text-slate-400 border-slate-500/30 bg-slate-500/10',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PAID: 'Pagada',
  PARTIAL_RETURN: 'Dev. Parcial',
  RETURNED: 'Devuelta',
  CANCELLED: 'Cancelada',
};

const PAYMENT_TYPE_COLORS: Record<string, string> = {
  CASH: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  CREDIT: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  CASH: 'Contado',
  CREDIT: 'Credito',
};

// Payment method labels come from payment.method.name (relation)

const REC_STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  PARTIAL: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  PAID: 'text-green-400 border-green-500/30 bg-green-500/10',
  OVERDUE: 'text-red-400 border-red-500/30 bg-red-500/10',
};

const REC_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Pagado',
  OVERDUE: 'Vencido',
};

const TYPE_LABELS: Record<string, string> = {
  CUSTOMER_CREDIT: 'Credito cliente',
  FINANCING_PLATFORM: 'Plataforma',
};

const IVA_TYPE_LABELS: Record<string, string> = {
  EXEMPT: 'Exento',
  REDUCED: 'Reducido (8%)',
  GENERAL: 'General (16%)',
  SPECIAL: 'Especial (31%)',
};

const IVA_RATES: Record<string, number> = {
  EXEMPT: 0,
  REDUCED: 0.08,
  GENERAL: 0.16,
  SPECIAL: 0.31,
};

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [userRole, setUserRole] = useState('');

  const fetchInvoice = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/invoices/${id}`);
      if (!res.ok) throw new Error('Factura no encontrada');
      setInvoice(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchInvoice(); }, [fetchInvoice]);

  useEffect(() => {
    if (invoice) document.title = `${invoice.number || 'Pre-factura'} - ${invoice.customer?.name || 'Sin cliente'} | Trinity ERP`;
  }, [invoice]);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(data => {
      if (data?.permissions) setUserPermissions(data.permissions);
      if (data?.role) setUserRole(data.role);
    }).catch(() => {});
  }, []);

  const hasPerm = (perm: string) => userRole === 'ADMIN' || userPermissions.includes(perm);
  const isAdmin = userRole === 'ADMIN';

  const [fiscalLoading, setFiscalLoading] = useState(false);
  const [reprintLoading, setReprintLoading] = useState(false);
  const [editingFiscal, setEditingFiscal] = useState(false);
  const [editFiscalNumber, setEditFiscalNumber] = useState('');
  const [editMachineSerial, setEditMachineSerial] = useState('');

  // Fetch companyConfig for fiscal commands
  const [companyConfig, setCompanyConfig] = useState<any>(null);
  useEffect(() => {
    fetch('/api/proxy/config').then(r => r.json()).then(setCompanyConfig).catch(() => {});
  }, []);

  // ── Retención de IVA del cliente ───────────────────────────────────────────
  const [existingRetention, setExistingRetention] = useState<any>(null);
  const fetchRetention = useCallback(async () => {
    try {
      const res = await fetch(`/api/proxy/customer-iva-retentions?invoiceId=${id}`);
      const data = await res.json();
      const active = (Array.isArray(data) ? data : []).find((r: any) => !r.cancelledAt);
      setExistingRetention(active || null);
    } catch { /* ignore */ }
  }, [id]);
  useEffect(() => { fetchRetention(); }, [fetchRetention]);

  const [retModalOpen, setRetModalOpen] = useState(false);
  const [retPct, setRetPct] = useState('75');
  const [retAmountBs, setRetAmountBs] = useState('');
  const [retVoucherNumber, setRetVoucherNumber] = useState('');
  const [retVoucherDate, setRetVoucherDate] = useState('');
  const [retSaving, setRetSaving] = useState(false);

  const canRetain = !!(
    invoice?.serie?.isFiscal &&
    (invoice?.ivaBs || 0) > 0 &&
    invoice?.customer &&
    ['PAID', 'PARTIAL_RETURN'].includes(invoice?.status || '') &&
    !existingRetention
  );

  // Acciones secundarias (van al menú "Más acciones")
  const isPaidish = ['PAID', 'PARTIAL_RETURN'].includes(invoice?.status || '');
  const canPrintPdf = ['PAID', 'PARTIAL_RETURN', 'RETURNED'].includes(invoice?.status || '');
  const canReturnInvoice = isPaidish && hasPerm('RETURN_INVOICE');
  const canCreditNote = invoice?.paymentType === 'CREDIT' && hasPerm('CREDIT_NOTE_SALE');
  const canDebitNote = invoice?.paymentType === 'CREDIT' && hasPerm('DEBIT_NOTE_SALE');
  const hasMenuActions = canPrintPdf || canReturnInvoice || canCreditNote || canDebitNote || canRetain;

  const openRetModal = () => {
    if (!invoice) return;
    const pct = 75;
    setRetPct(String(pct));
    setRetAmountBs((Math.round(invoice.ivaBs * (pct / 100) * 100) / 100).toFixed(2));
    setRetVoucherNumber('');
    const now = new Date();
    setRetVoucherDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
    setRetModalOpen(true);
  };

  const onRetPctChange = (value: string) => {
    setRetPct(value);
    if (invoice) {
      const pct = parseFloat(value) || 0;
      setRetAmountBs((Math.round(invoice.ivaBs * (pct / 100) * 100) / 100).toFixed(2));
    }
  };

  const submitRetention = async () => {
    if (!invoice) return;
    if (retVoucherNumber && !/^\d{14}$/.test(retVoucherNumber)) {
      setMessage({ type: 'error', text: 'El número de comprobante debe tener 14 dígitos' });
      return;
    }
    setRetSaving(true);
    setMessage(null);
    try {
      const body: any = { invoiceId: invoice.id, retentionPct: parseFloat(retPct) || 75 };
      const amount = parseFloat(retAmountBs);
      if (!isNaN(amount)) body.retentionBs = amount;
      if (retVoucherNumber) { body.voucherNumber = retVoucherNumber; body.voucherDate = retVoucherDate; }
      const res = await fetch('/api/proxy/customer-iva-retentions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error al crear retención');
      setMessage({ type: 'success', text: `Retención ${json.number} creada` });
      setRetModalOpen(false);
      fetchRetention();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
    setRetSaving(false);
  };

  // Print fiscal invoice (for pending fiscal print)
  const handleFiscalPrint = async () => {
    if (!invoice || !invoice.serie?.isFiscal) return;
    setFiscalLoading(true);
    setMessage(null);
    try {
      const { buildFiscalCommands, sendToFiscalPrinter } = await import('@/lib/fiscal-printer');
      const commands = buildFiscalCommands(invoice, companyConfig || {});
      const fiscal = await sendToFiscalPrinter(commands, invoice.serie?.comPort, true);
      if (fiscal) {
        await fetch(`/api/proxy/invoices/${id}/fiscal-info`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fiscalNumber: fiscal.invoiceFiscalNumber,
            machineSerial: fiscal.machineSerial,
          }),
        });
        setMessage({ type: 'success', text: 'Factura impresa fiscalmente' });
        fetchInvoice();
      } else {
        setMessage({ type: 'error', text: 'No se pudo conectar con la impresora fiscal' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: `Error fiscal: ${err.message}` });
    } finally {
      setFiscalLoading(false);
    }
  };

  // Reprint fiscal invoice (RF command)
  const handleFiscalReprint = async () => {
    if (!invoice?.fiscalNumber || !invoice.serie?.isFiscal) return;
    setReprintLoading(true);
    setMessage(null);
    try {
      const { sendToFiscalPrinter } = await import('@/lib/fiscal-printer');
      // RF command: 7 digits start + 7 digits end (same number for single reprint)
      const raw = invoice.fiscalNumber.replace(/\D/g, '');
      const num7 = raw.slice(-7).padStart(7, '0');
      const rfCommand = `RF${num7}${num7}`;
      await sendToFiscalPrinter([rfCommand], invoice.serie?.comPort, false);
      setMessage({ type: 'success', text: `Reimpresion fiscal enviada (${rfCommand})` });
    } catch (err: any) {
      setMessage({ type: 'error', text: `Error al reimprimir: ${err.message}` });
    } finally {
      setReprintLoading(false);
    }
  };

  // Admin: manually update fiscal status
  const handleSaveFiscalStatus = async (markPrinted: boolean) => {
    setMessage(null);
    try {
      const body: any = { fiscalPrinted: markPrinted };
      if (editFiscalNumber) body.fiscalNumber = editFiscalNumber;
      if (editMachineSerial) body.fiscalMachineSerial = editMachineSerial;
      const res = await fetch(`/api/proxy/invoices/${id}/fiscal-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error al actualizar');
      }
      setMessage({ type: 'success', text: 'Estado fiscal actualizado' });
      setEditingFiscal(false);
      fetchInvoice();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  function fmtDate(iso: string) {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-green-500" size={32} /></div>;
  if (error || !invoice) return (
    <div className="text-center py-20">
      <p className="text-red-400 mb-4">{error || 'Factura no encontrada'}</p>
      <button onClick={() => router.push('/sales/invoices')} className="btn-secondary">Volver a facturas</button>
    </div>
  );

  const hasReceivables = invoice.receivables && invoice.receivables.length > 0;

  // Group IVA by type
  const ivaByType: Record<string, { label: string; total: number; totalBs: number }> = {};
  invoice.items.forEach(item => {
    const key = item.ivaType || 'EXEMPT';
    if (!ivaByType[key]) ivaByType[key] = { label: IVA_TYPE_LABELS[key] || key, total: 0, totalBs: 0 };
    ivaByType[key].total += item.ivaAmount || 0;
    ivaByType[key].totalBs += item.ivaAmountBs || 0;
  });

  const totalPaymentsUsd = invoice.payments.reduce((s, p) => s + p.amountUsd, 0);
  const totalPaymentsBs = invoice.payments.reduce((s, p) => s + p.amountBs, 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/sales/invoices')} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <FileText className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white font-mono">{invoice.number || 'Sin numero'}</h1>
            <p className="text-slate-400 text-sm">
              {invoice.customer
                ? <>{invoice.customer.documentType}-{invoice.customer.rif || '—'} · {invoice.customer.name}{invoice.customer.phone ? ` · ${invoice.customer.phone}` : ''}</>
                : 'Sin cliente'}
            </p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full border ${STATUS_COLORS[invoice.status]}`}>
            {STATUS_LABELS[invoice.status]}
          </span>
          {invoice.status !== 'PENDING' && invoice.status !== 'CANCELLED' && (
            <span className={`text-xs px-2.5 py-1 rounded-full border ${PAYMENT_TYPE_COLORS[invoice.paymentType] || ''}`}>
              {PAYMENT_TYPE_LABELS[invoice.paymentType] || invoice.paymentType}
            </span>
          )}
          {invoice.serie?.isFiscal && invoice.status !== 'PENDING' && invoice.status !== 'CANCELLED' && !invoice.fiscalPrinted && (
            <span className="text-xs px-2.5 py-1 rounded-full border text-orange-400 border-orange-500/30 bg-orange-500/10 flex items-center gap-1">
              <AlertTriangle size={12} /> Por Imprimir
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Fiscal: Imprimir (pending fiscal print) */}
          {invoice.serie?.isFiscal && !invoice.fiscalPrinted && invoice.status !== 'PENDING' && invoice.status !== 'CANCELLED' && (
            <button onClick={handleFiscalPrint} disabled={fiscalLoading} className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/15 text-orange-400 border border-orange-500/30 hover:bg-orange-500/25 transition-colors disabled:opacity-50">
              {fiscalLoading ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} Imprimir Fiscal
            </button>
          )}
          {/* Fiscal: Reimprimir (already printed) */}
          {invoice.serie?.isFiscal && invoice.fiscalPrinted && invoice.fiscalNumber && (
            <button onClick={handleFiscalReprint} disabled={reprintLoading} className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 transition-colors disabled:opacity-50">
              {reprintLoading ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />} Reimprimir Fiscal
            </button>
          )}
          {existingRetention && (
            <button onClick={() => router.push('/sales/customer-retentions')} className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-colors" title="Ver retenciones de clientes">
              <Shield size={14} /> Ret. {existingRetention.number}{existingRetention.voucherNumber ? '' : ' (sin comprobante)'}
            </button>
          )}
          {hasMenuActions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="btn-secondary text-sm flex items-center gap-1.5">
                  <MoreHorizontal size={16} /> Más acciones
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700 text-slate-200 min-w-[210px]">
                {canPrintPdf && (
                  <DropdownMenuItem
                    onClick={() => window.open(`/api/proxy/invoices/${id}/pdf`, '_blank')}
                    className="cursor-pointer text-slate-200 focus:bg-slate-700 focus:text-white gap-2"
                  >
                    <Printer size={14} /> Imprimir PDF
                  </DropdownMenuItem>
                )}
                {canReturnInvoice && (
                  <DropdownMenuItem
                    onClick={() => router.push(`/credit-debit-notes/new?type=NCV&origin=MERCHANDISE&invoiceId=${id}`)}
                    className="cursor-pointer text-slate-200 focus:bg-slate-700 focus:text-white gap-2"
                  >
                    <FileX2 size={14} /> {invoice.paymentType === 'CASH' ? 'Devolver factura' : 'Devolver mercancia'}
                  </DropdownMenuItem>
                )}
                {canCreditNote && (
                  <DropdownMenuItem
                    onClick={() => router.push(`/credit-debit-notes/new?type=NCV&origin=MANUAL&invoiceId=${id}`)}
                    className="cursor-pointer text-slate-200 focus:bg-slate-700 focus:text-white gap-2"
                  >
                    <FileX2 size={14} /> Nota de credito
                  </DropdownMenuItem>
                )}
                {canDebitNote && (
                  <DropdownMenuItem
                    onClick={() => router.push(`/credit-debit-notes/new?type=NDV&origin=MANUAL&invoiceId=${id}`)}
                    className="cursor-pointer text-slate-200 focus:bg-slate-700 focus:text-white gap-2"
                  >
                    <FileX2 size={14} /> Nota de debito
                  </DropdownMenuItem>
                )}
                {canRetain && (
                  <DropdownMenuItem
                    onClick={openRetModal}
                    className="cursor-pointer text-purple-300 focus:bg-purple-500/15 focus:text-purple-200 gap-2"
                  >
                    <Shield size={14} /> Retención IVA
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* Modal: crear retención de IVA del cliente */}
      {retModalOpen && invoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2"><Shield size={18} className="text-purple-400" /> Retención de IVA — {invoice.number}</h3>
              <button onClick={() => setRetModalOpen(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-700/40 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-slate-400">Cliente:</span><span className="text-white">{invoice.customer?.name}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">IVA de la factura:</span><span className="text-white font-mono">{invoice.ivaBs?.toFixed(2)} Bs</span></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">% Retención</label>
                  <select value={retPct} onChange={(e) => onRetPctChange(e.target.value)} className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm">
                    <option value="75">75%</option>
                    <option value="100">100%</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Monto retenido Bs</label>
                  <input type="number" step="0.01" value={retAmountBs} onChange={(e) => setRetAmountBs(e.target.value)} className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono" />
                  <p className="text-[10px] text-slate-500 mt-1">Tolerancia ±1 Bs</p>
                </div>
              </div>
              <div className="border-t border-slate-700/50 pt-4 space-y-3">
                <p className="text-xs text-slate-400">Comprobante del cliente (opcional — si ya lo entregó)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Número (14 dígitos)</label>
                    <input type="text" value={retVoucherNumber} onChange={(e) => setRetVoucherNumber(e.target.value.replace(/\D/g, '').slice(0, 14))} placeholder="AAAAMM00000000" maxLength={14} className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Fecha</label>
                    <input type="date" value={retVoucherDate} onChange={(e) => setRetVoucherDate(e.target.value)} className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
              </div>
              <button onClick={submitRetention} disabled={retSaving || !retAmountBs || (retVoucherNumber.length > 0 && retVoucherNumber.length !== 14)} className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50">
                {retSaving ? <Loader2 className="animate-spin" size={16} /> : <Shield size={16} />} Crear retención
              </button>
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Informacion General</TabsTrigger>
          <TabsTrigger value="pagos">Pagos</TabsTrigger>
          {hasReceivables && <TabsTrigger value="cxc">CxC vinculada</TabsTrigger>}
          <TabsTrigger value="notas">Notas Cr/Db</TabsTrigger>
        </TabsList>

        {/* TAB: Informacion General */}
        <TabsContent value="info">
          <div className="card p-6 mb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              {invoice.controlNumber && (
                <div>
                  <p className="text-xs text-slate-500 uppercase">N. Control</p>
                  <p className="text-white font-mono">{invoice.controlNumber}</p>
                </div>
              )}
              {invoice.seller && (
                <div>
                  <p className="text-xs text-slate-500 uppercase">Vendedor</p>
                  <p className="text-white truncate">{invoice.seller.name}</p>
                </div>
              )}
              {invoice.cashier && (
                <div>
                  <p className="text-xs text-slate-500 uppercase">Cobrado por</p>
                  <p className="text-white truncate">{invoice.cashier.name}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500 uppercase">Caja</p>
                <p className="text-white">{invoice.cashRegister?.code || '—'}</p>
              </div>
              {invoice.serie && (
                <div>
                  <p className="text-xs text-slate-500 uppercase">Serie</p>
                  <p className="text-white flex items-center gap-1.5">
                    {invoice.serie.name}
                    {invoice.serie.isFiscal ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">Fiscal</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/20">No Fiscal</span>
                    )}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500 uppercase">Fecha</p>
                <p className="text-white font-mono">{fmtDate(invoice.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">Tasa del dia</p>
                <p className="text-white font-mono">Bs {invoice.exchangeRate?.toFixed(2)}</p>
              </div>
            </div>

            {/* Datos fiscales */}
            {invoice.serie?.isFiscal && (
              <div className={`rounded-lg p-4 mb-6 border ${invoice.fiscalPrinted ? 'bg-slate-900/50 border-slate-700/50' : 'bg-orange-500/5 border-orange-500/30'}`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs text-slate-500 uppercase flex items-center gap-2">
                    Datos Fiscales
                    {invoice.fiscalPrinted ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20 uppercase">Impresa</span>
                    ) : invoice.status !== 'PENDING' && invoice.status !== 'CANCELLED' ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/20 uppercase flex items-center gap-1">
                        <AlertTriangle size={10} /> Pendiente de impresion
                      </span>
                    ) : null}
                  </h3>
                  {isAdmin && !editingFiscal && (
                    <button onClick={() => { setEditingFiscal(true); setEditFiscalNumber(invoice.fiscalNumber || ''); setEditMachineSerial(invoice.fiscalMachineSerial || ''); }} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors">
                      <Edit3 size={12} /> Editar
                    </button>
                  )}
                </div>
                {!editingFiscal ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <span className="text-slate-400">N. Fiscal:</span>
                      {invoice.fiscalNumber ? (
                        <span className="text-green-400 ml-2 font-mono font-semibold">{invoice.fiscalNumber}</span>
                      ) : (
                        <span className="text-yellow-500 ml-2">No guardado</span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-400">Serial Impresora:</span>
                      {invoice.fiscalMachineSerial ? (
                        <span className="text-green-400 ml-2 font-mono">{invoice.fiscalMachineSerial}</span>
                      ) : (
                        <span className="text-yellow-500 ml-2">No guardado</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Numero Fiscal</label>
                        <input type="text" value={editFiscalNumber} onChange={e => setEditFiscalNumber(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-white text-sm font-mono focus:border-green-500 focus:outline-none" placeholder="00000001" />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Serial Maquina Fiscal</label>
                        <input type="text" value={editMachineSerial} onChange={e => setEditMachineSerial(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-white text-sm font-mono focus:border-green-500 focus:outline-none" placeholder="Z7C12345678" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleSaveFiscalStatus(true)} className="text-xs px-3 py-1.5 rounded bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 flex items-center gap-1 transition-colors">
                        <Save size={12} /> Marcar como impresa
                      </button>
                      {invoice.fiscalPrinted && (
                        <button onClick={() => handleSaveFiscalStatus(false)} className="text-xs px-3 py-1.5 rounded bg-orange-500/15 text-orange-400 border border-orange-500/30 hover:bg-orange-500/25 flex items-center gap-1 transition-colors">
                          <RotateCcw size={12} /> Marcar pendiente
                        </button>
                      )}
                      <button onClick={() => setEditingFiscal(false)} className="text-xs px-3 py-1.5 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Items table */}
          <div className="card overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Producto</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Cant.</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Precio USD</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Precio Bs</th>
                  <th className="text-center px-4 py-3 text-slate-400 font-medium">IVA</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Total USD</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Total Bs</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map(item => (
                  <tr key={item.id} className="border-b border-slate-700/30">
                    <td className="px-4 py-3">
                      {item.productCode && <span className="font-mono text-xs text-green-400 mr-2">{item.productCode}</span>}
                      <span className="text-white">{item.productName}</span>
                      {item.priceOverridden && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">Precio modificado</span>
                      )}
                      {(item.discountPct ?? 0) > 0 && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">-{item.discountPct}% desc.</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">{item.quantity}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">${(item.unitPrice * (1 + (IVA_RATES[item.ivaType] || 0))).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400 hidden md:table-cell">Bs {(item.unitPriceBs * (1 + (IVA_RATES[item.ivaType] || 0))).toFixed(2)}</td>
                    <td className="px-4 py-3 text-center text-slate-400 text-xs">{IVA_TYPE_LABELS[item.ivaType] || item.ivaType}</td>
                    <td className="px-4 py-3 text-right font-mono text-white">${item.totalUsd?.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300 hidden lg:table-cell">Bs {item.totalBs?.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals — two columns: USD | Bs */}
          <div className="card p-6">
            <div className="max-w-lg ml-auto grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-1 text-sm">
              {/* Header */}
              <span></span>
              <span className="text-slate-500 text-xs text-right font-medium uppercase">USD</span>
              <span className="text-slate-500 text-xs text-right font-medium uppercase">Bs</span>

              {/* Subtotal */}
              <span className="text-slate-400">Subtotal</span>
              <span className="text-white font-mono text-right">${invoice.subtotalUsd?.toFixed(2)}</span>
              <span className="text-slate-300 font-mono text-right">Bs {invoice.subtotalBs?.toFixed(2)}</span>

              {/* IVA rows */}
              {Object.entries(ivaByType).filter(([, val]) => val.total > 0).map(([key, val]) => (
                <div key={key} className="contents">
                  <span className="text-slate-400">IVA {val.label}</span>
                  <span className="text-white font-mono text-right">${val.total.toFixed(2)}</span>
                  <span className="text-slate-300 font-mono text-right">Bs {val.totalBs.toFixed(2)}</span>
                </div>
              ))}

              {/* IGTF */}
              {invoice.igtfUsd > 0 && (
                <div className="contents">
                  <span className="text-amber-400">IGTF (3%)</span>
                  <span className="text-amber-400 font-mono text-right">${invoice.igtfUsd?.toFixed(2)}</span>
                  <span className="text-amber-400 font-mono text-right">Bs {invoice.igtfBs?.toFixed(2)}</span>
                </div>
              )}

              {/* Separator + Total */}
              <div className="col-span-3 border-t border-slate-700/50 mt-1 pt-2"></div>
              <span className="text-slate-300 font-bold text-base">Total</span>
              <span className="text-green-400 font-mono font-bold text-base text-right">${invoice.totalUsd?.toFixed(2)}</span>
              <span className="text-slate-300 font-mono font-bold text-base text-right">Bs {invoice.totalBs?.toFixed(2)}</span>
            </div>
          </div>
        </TabsContent>

        {/* TAB: Pagos */}
        <TabsContent value="pagos">
          <div className="card overflow-hidden">
            {invoice.payments.length === 0 ? (
              <div className="text-center py-12 text-slate-500">Sin pagos registrados</div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Metodo</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">Monto USD</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">Monto Bs</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Tasa</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Referencia</th>
                      {invoice.payments.some(p => p.igtfUsd > 0) && (
                        <th className="text-right px-4 py-3 text-slate-400 font-medium">IGTF</th>
                      )}
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.payments.map(p => (
                      <tr key={p.id} className="border-b border-slate-700/30">
                        <td className="px-4 py-3 text-slate-300">{p.method?.name || 'Metodo'}</td>
                        <td className="px-4 py-3 text-right font-mono text-white">${p.amountUsd?.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-300">Bs {p.amountBs?.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-400 hidden md:table-cell">{p.exchangeRate?.toFixed(2)}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs hidden md:table-cell">{p.reference || '—'}</td>
                        {invoice.payments.some(pp => pp.igtfUsd > 0) && (
                          <td className="px-4 py-3 text-right font-mono text-amber-400">{p.igtfUsd > 0 ? `$${p.igtfUsd.toFixed(2)}` : '—'}</td>
                        )}
                        <td className="px-4 py-3 text-slate-400 text-xs">{fmtDate(p.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-700/50">
                      <td className="px-4 py-3 text-slate-400 font-medium">Total cobrado</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-white">${totalPaymentsUsd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-300">Bs {totalPaymentsBs.toFixed(2)}</td>
                      <td colSpan={4}></td>
                    </tr>
                  </tfoot>
                </table>

                {/* Change (vuelto) info */}
                {invoice.changeBs > 0 && (
                  <div className="px-4 py-3 border-t border-amber-500/20 bg-amber-500/5">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-amber-300">Total recibido USD</span>
                        <span className="text-sm font-mono text-white ml-3">${invoice.totalPaidUsd?.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-amber-300">Vuelto dado</span>
                        <span className="text-sm font-mono text-amber-400 ml-3">Bs {invoice.changeBs?.toFixed(2)}</span>
                        {invoice.payments.find(p => p.changeAmountBs > 0)?.changeMethod && (
                          <span className="text-xs text-slate-400 ml-2">
                            ({invoice.payments.find(p => p.changeAmountBs > 0)?.changeMethod?.name})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>

        {/* TAB: CxC vinculada */}
        {hasReceivables && (
          <TabsContent value="cxc">
            <div className="space-y-4">
              {invoice.receivables.map(r => {
                const balance = r.balanceUsd != null ? r.balanceUsd : r.amountUsd - r.paidAmountUsd;
                return (
                  <div key={r.id} className="card overflow-hidden">
                    {/* Resumen de CxC */}
                    <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-300 text-sm">{TYPE_LABELS[r.type] || r.type}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${REC_STATUS_COLORS[r.status] || ''}`}>
                          {REC_STATUS_LABELS[r.status] || r.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        {r.status !== 'PAID' && (
                          <button
                            onClick={() => router.push(`/receipts/new?type=COLLECTION&receivableId=${r.id}`)}
                            className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 px-2 py-1 rounded border border-green-500/30 hover:bg-green-500/10 transition-colors"
                          >
                            <DollarSign size={12} />
                            Cobrar
                          </button>
                        )}
                        <button onClick={() => router.push(`/receivables/${r.id}`)} className="text-xs text-slate-400 hover:text-green-300 flex items-center gap-1">
                          Ver CxC <ExternalLink size={10} />
                        </button>
                      </div>
                    </div>

                    {/* Montos */}
                    <div className="px-4 py-3 grid grid-cols-3 gap-4 text-sm border-b border-slate-700/30">
                      <div>
                        <span className="text-slate-500 text-xs block">Monto</span>
                        <span className="text-white font-mono">${(r.amountUsd ?? 0).toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-xs block">Cobrado</span>
                        <span className="text-slate-300 font-mono">${(r.paidAmountUsd ?? 0).toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-xs block">Saldo</span>
                        <span className="text-amber-400 font-mono font-medium">${(balance ?? 0).toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Historial de abonos */}
                    {r.payments && r.payments.length > 0 ? (
                      <div>
                        <div className="px-4 py-2 bg-slate-900/30">
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Historial de abonos</span>
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-700/50">
                              <th className="text-left px-4 py-2 text-slate-500 font-medium text-xs">Fecha</th>
                              <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">USD</th>
                              <th className="text-right px-4 py-2 text-slate-500 font-medium text-xs">Bs</th>
                              <th className="text-left px-4 py-2 text-slate-500 font-medium text-xs">Metodo</th>
                              <th className="text-left px-4 py-2 text-slate-500 font-medium text-xs">Recibo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.payments.map(p => (
                              <tr key={p.id} className="border-b border-slate-700/20">
                                <td className="px-4 py-2 text-slate-300 text-xs">{new Date(p.createdAt).toLocaleDateString('es-VE')}</td>
                                <td className="px-4 py-2 text-right text-white font-mono text-xs">${p.amountUsd.toFixed(2)}</td>
                                <td className="px-4 py-2 text-right text-slate-300 font-mono text-xs">{p.amountBs.toFixed(2)} Bs</td>
                                <td className="px-4 py-2 text-slate-300 text-xs">{p.method?.name || '-'}</td>
                                <td className="px-4 py-2">
                                  {p.receipt ? (
                                    <button
                                      onClick={() => router.push(`/receipts/${p.receipt!.id}`)}
                                      className="inline-flex items-center gap-1 text-green-400 hover:text-green-300 text-xs"
                                    >
                                      <FileText size={11} />
                                      {p.receipt.number}
                                    </button>
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
                      <div className="px-4 py-3 text-xs text-slate-500">Sin abonos registrados</div>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>
        )}

        {/* TAB: Notas Cr/Db */}
        <TabsContent value="notas">
          <InvoiceNotesTab invoiceId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InvoiceNotesTab({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch(`/api/proxy/credit-debit-notes?invoiceId=${invoiceId}&limit=50`);
        const json = await res.json();
        setNotes(json.data || []);
      } catch {}
      setLoading(false);
    }
    fetch_();
  }, [invoiceId]);

  const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-green-500" size={24} /></div>;
  if (notes.length === 0) return <div className="text-center py-12 text-slate-500">No hay notas vinculadas a esta factura</div>;

  const TYPE_LABELS_: Record<string, string> = { NCV: 'NC Venta', NDV: 'ND Venta', NCC: 'NC Compra', NDC: 'ND Compra' };
  const STATUS_LABELS_: Record<string, string> = { DRAFT: 'Borrador', POSTED: 'Confirmada', CANCELLED: 'Anulada' };
  const STATUS_COLORS_: Record<string, string> = { DRAFT: 'text-amber-400 border-amber-500/30 bg-amber-500/10', POSTED: 'text-green-400 border-green-500/30 bg-green-500/10', CANCELLED: 'text-red-400 border-red-500/30 bg-red-500/10' };

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/50">
            <th className="text-left px-4 py-3 text-slate-400 font-medium">Número</th>
            <th className="text-left px-4 py-3 text-slate-400 font-medium">Tipo</th>
            <th className="text-right px-4 py-3 text-slate-400 font-medium">Total USD</th>
            <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
            <th className="text-center px-4 py-3 text-slate-400 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {notes.map((n: any) => (
            <tr key={n.id} className="border-b border-slate-700/30">
              <td className="px-4 py-3 text-white font-mono">{n.number}</td>
              <td className="px-4 py-3 text-slate-300">{TYPE_LABELS_[n.type] || n.type}</td>
              <td className="px-4 py-3 text-right font-mono text-white">$ {fmt(n.totalUsd)}</td>
              <td className="px-4 py-3 text-center">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS_[n.status]}`}>{STATUS_LABELS_[n.status]}</span>
              </td>
              <td className="px-4 py-3 text-center">
                <button onClick={() => router.push(`/credit-debit-notes/${n.id}`)} className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 mx-auto">
                  Ver <ExternalLink size={10} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
