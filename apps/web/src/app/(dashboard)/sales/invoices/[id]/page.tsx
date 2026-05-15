'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, FileText, Loader2, Printer, Ban, ExternalLink, DollarSign, X,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface InvoiceDetail {
  id: string;
  number: string;
  controlNumber: string | null;
  status: string;
  totalUsd: number;
  totalBs: number;
  subtotalUsd: number;
  subtotalBs: number;
  ivaUsd: number;
  ivaBs: number;
  igtfUsd: number;
  igtfBs: number;
  exchangeRate: number;
  isCredit: boolean;
  createdAt: string;
  customer: { id: string; name: string; documentType: string; rif: string | null; phone: string | null } | null;
  cashRegister: { id: string; code: string; name: string } | null;
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
  createdAt: string;
}

interface ReceivableLink {
  id: string;
  type: string;
  amountUsd: number;
  paidAmountUsd: number;
  balanceUsd: number;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  PENDING: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  PAID: 'text-green-400 border-green-500/30 bg-green-500/10',
  CREDIT: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  CANCELLED: 'text-red-400 border-red-500/30 bg-red-500/10',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'En Espera',
  PENDING: 'En Espera',
  PAID: 'Procesado',
  CREDIT: 'Credito',
  CANCELLED: 'Cancelado',
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

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);

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

  async function handleCancel() {
    if (!confirm('Anular esta factura? Esta accion no se puede deshacer.')) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/proxy/invoices/${id}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al anular');
      }
      setMessage({ type: 'success', text: 'Factura anulada' });
      fetchInvoice();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setCancelling(false);
    }
  }

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
            <h1 className="text-2xl font-bold text-white font-mono">{invoice.number}</h1>
            <p className="text-slate-400 text-sm">{invoice.customer?.name || 'Sin cliente'}</p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full border ${STATUS_COLORS[invoice.status]}`}>
            {STATUS_LABELS[invoice.status]}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {['PAID', 'CREDIT'].includes(invoice.status) && (
            <button onClick={() => window.open(`/api/proxy/invoices/${id}/pdf`, '_blank')} className="btn-secondary text-sm flex items-center gap-1.5">
              <Printer size={14} /> Imprimir PDF
            </button>
          )}
          {invoice.status === 'PAID' && (
            <button onClick={handleCancel} disabled={cancelling} className="text-sm px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1.5">
              {cancelling ? <Loader2 className="animate-spin" size={14} /> : <Ban size={14} />} Anular
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
          <TabsTrigger value="pagos">Pagos</TabsTrigger>
          {hasReceivables && <TabsTrigger value="cxc">CxC vinculada</TabsTrigger>}
        </TabsList>

        {/* TAB: Informacion General */}
        <TabsContent value="info">
          <div className="card p-6 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {invoice.controlNumber && (
                <div>
                  <p className="text-xs text-slate-500 uppercase">N. Control</p>
                  <p className="text-white font-mono">{invoice.controlNumber}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500 uppercase">Fecha</p>
                <p className="text-white font-mono">{fmtDate(invoice.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">Caja</p>
                <p className="text-white">{invoice.cashRegister?.code || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">Tasa del dia</p>
                <p className="text-white font-mono">Bs {invoice.exchangeRate?.toFixed(2)}</p>
              </div>
              {invoice.seller && (
                <div>
                  <p className="text-xs text-slate-500 uppercase">Vendedor</p>
                  <p className="text-white">{invoice.seller.name}</p>
                </div>
              )}
              {invoice.cashier && (
                <div>
                  <p className="text-xs text-slate-500 uppercase">Cobrado por</p>
                  <p className="text-white">{invoice.cashier.name}</p>
                </div>
              )}
            </div>

            {/* Datos cliente */}
            {invoice.customer && (
              <div className="bg-slate-900/50 rounded-lg p-4 mb-6">
                <h3 className="text-xs text-slate-500 uppercase mb-2">Cliente</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-slate-400">Nombre:</span>
                    <span className="text-white ml-2">{invoice.customer.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Documento:</span>
                    <span className="text-white ml-2">{invoice.customer.documentType}-{invoice.customer.rif || '—'}</span>
                  </div>
                  {invoice.customer.phone && (
                    <div>
                      <span className="text-slate-400">Telefono:</span>
                      <span className="text-white ml-2">{invoice.customer.phone}</span>
                    </div>
                  )}
                </div>
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
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">{item.quantity}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">${item.unitPrice?.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400 hidden md:table-cell">Bs {item.unitPriceBs?.toFixed(2)}</td>
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
              </>
            )}
          </div>
        </TabsContent>

        {/* TAB: CxC vinculada */}
        {hasReceivables && (
          <TabsContent value="cxc">
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Tipo</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Monto USD</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Pagado USD</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Saldo USD</th>
                    <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                    <th className="text-center px-4 py-3 text-slate-400 font-medium w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.receivables.map(r => (
                    <tr key={r.id} className="border-b border-slate-700/30">
                      <td className="px-4 py-3 text-slate-300">{TYPE_LABELS[r.type] || r.type}</td>
                      <td className="px-4 py-3 text-right font-mono text-white">${r.amountUsd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">${r.paidAmountUsd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono text-amber-400">${r.balanceUsd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${REC_STATUS_COLORS[r.status] || ''}`}>
                          {REC_STATUS_LABELS[r.status] || r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => router.push(`/receivables/${r.id}`)} className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 mx-auto">
                          Ver CxC <ExternalLink size={10} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
