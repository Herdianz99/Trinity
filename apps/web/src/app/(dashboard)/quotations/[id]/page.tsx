'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Printer,
  ArrowRightCircle,
  User as UserIcon,
  Phone,
  X,
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'text-slate-300 border-slate-600 bg-slate-700/30',
  SENT: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  APPROVED: 'text-green-400 border-green-500/30 bg-green-500/10',
  REJECTED: 'text-red-400 border-red-500/30 bg-red-500/10',
  EXPIRED: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  EXPIRED: 'Expirada',
};
const IVA_LABELS: Record<string, string> = {
  EXEMPT: 'Exento',
  REDUCED: 'Reducido 8%',
  GENERAL: 'General 16%',
  SPECIAL: 'Especial 31%',
};

export default function QuotationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [quotation, setQuotation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [converting, setConverting] = useState(false);
  const [printChoice, setPrintChoice] = useState(false);

  const fetchQuotation = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/quotations/${id}`);
      if (!res.ok) { setNotFound(true); return; }
      setQuotation(await res.json());
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchQuotation(); }, [fetchQuotation]);

  useEffect(() => {
    document.title = quotation
      ? `${quotation.number} - Cotizacion | Trinity ERP`
      : 'Cotizacion | Trinity ERP';
  }, [quotation]);

  async function handleChangeStatus(newStatus: string) {
    try {
      const res = await fetch(`/api/proxy/quotations/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
      setMessage({ type: 'success', text: `Estado cambiado a ${STATUS_LABELS[newStatus] || newStatus}` });
      fetchQuotation();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  async function handleConvert() {
    if (!confirm('¿Convertir esta cotizacion en factura? Se usara la tasa del dia.')) return;
    setConverting(true);
    try {
      const res = await fetch(`/api/proxy/quotations/${id}/convert`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
      const invoice = await res.json();
      router.push(`/sales/pos?invoiceId=${invoice.id}`);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
      setConverting(false);
    }
  }

  function handlePrint(hideIva: boolean) {
    setPrintChoice(false);
    window.open(`/api/proxy/quotations/${id}/pdf${hideIva ? '?hideIva=true' : ''}`, '_blank');
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-green-500" size={32} />
      </div>
    );
  }

  if (notFound || !quotation) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <button onClick={() => router.push('/quotations')} className="btn-secondary !py-2 text-sm flex items-center gap-2 mb-4">
          <ArrowLeft size={16} /> Volver
        </button>
        <div className="card p-8 text-center text-slate-400">Cotizacion no encontrada</div>
      </div>
    );
  }

  const canConvert = ['DRAFT', 'APPROVED'].includes(quotation.status);

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-5">
      {message && (
        <div className={`px-4 py-3 rounded-lg border text-sm flex items-center justify-between ${message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)}><X size={16} /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/quotations')} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400" title="Volver">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white font-mono">{quotation.number}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[quotation.status] || ''}`}>
              {STATUS_LABELS[quotation.status] || quotation.status}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {quotation.status === 'DRAFT' && (
            <button onClick={() => handleChangeStatus('SENT')} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20">Marcar Enviada</button>
          )}
          {['DRAFT', 'SENT'].includes(quotation.status) && (
            <button onClick={() => handleChangeStatus('APPROVED')} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20">Aprobar</button>
          )}
          {['DRAFT', 'SENT', 'APPROVED'].includes(quotation.status) && (
            <button onClick={() => handleChangeStatus('REJECTED')} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20">Rechazar</button>
          )}
          {canConvert && (
            <button onClick={handleConvert} disabled={converting} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 flex items-center gap-1.5 disabled:opacity-40">
              {converting ? <Loader2 className="animate-spin" size={12} /> : <ArrowRightCircle size={12} />}
              Convertir a factura
            </button>
          )}
          <button onClick={() => setPrintChoice(true)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 text-slate-200 hover:bg-slate-600 flex items-center gap-1.5">
            <Printer size={12} /> Imprimir PDF
          </button>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="card p-3"><span className="text-slate-500 block text-xs mb-0.5">Cliente</span><span className="text-white">{quotation.customer?.name || 'Sin cliente'}</span></div>
        <div className="card p-3"><span className="text-slate-500 block text-xs mb-0.5">Fecha</span><span className="text-white">{new Date(quotation.createdAt).toLocaleDateString('es-VE')}</span></div>
        <div className="card p-3"><span className="text-slate-500 block text-xs mb-0.5">Vence</span><span className="text-white">{quotation.expiresAt ? new Date(quotation.expiresAt).toLocaleDateString('es-VE') : '-'}</span></div>
        <div className="card p-3"><span className="text-slate-500 block text-xs mb-0.5">Items</span><span className="text-white">{quotation.items?.length || 0}</span></div>
      </div>

      {/* Vendedor */}
      <div className="card p-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <UserIcon size={13} /> Vendedor
        </h3>
        {quotation.seller ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="text-white font-medium">{quotation.seller.name}</span>
            {quotation.seller.code && <span className="text-slate-500 text-xs font-mono">{quotation.seller.code}</span>}
            {quotation.seller.phone
              ? <span className="text-slate-300 text-sm flex items-center gap-1.5"><Phone size={13} className="text-green-400" /> {quotation.seller.phone}</span>
              : <span className="text-slate-500 text-xs italic">Sin telefono registrado</span>}
          </div>
        ) : (
          <span className="text-slate-500 text-sm italic">Sin vendedor asignado</span>
        )}
      </div>

      {/* Items */}
      <div className="card p-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Items</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left py-2 text-slate-400">Codigo</th>
                <th className="text-left py-2 text-slate-400">Producto</th>
                <th className="text-right py-2 text-slate-400">Cant.</th>
                <th className="text-right py-2 text-slate-400">Precio USD</th>
                <th className="text-right py-2 text-slate-400 hidden sm:table-cell">IVA</th>
                <th className="text-right py-2 text-slate-400">Total</th>
              </tr>
            </thead>
            <tbody>
              {quotation.items?.map((item: any) => (
                <tr key={item.id} className="border-b border-slate-700/30">
                  <td className="py-2 text-slate-400 font-mono text-xs">{item.productCode}</td>
                  <td className="py-2 text-white">{item.productName}</td>
                  <td className="py-2 text-right text-slate-300">{item.quantity}</td>
                  <td className="py-2 text-right text-slate-300">${item.unitPriceUsd?.toFixed(2)}</td>
                  <td className="py-2 text-right text-slate-400 text-xs hidden sm:table-cell">{IVA_LABELS[item.ivaType] || item.ivaType}</td>
                  <td className="py-2 text-right text-white font-medium">${item.totalUsd?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals */}
      <div className="card p-4 max-w-sm ml-auto">
        <div className="flex justify-between text-sm mb-1"><span className="text-slate-400">Subtotal</span><span className="text-white">${quotation.subtotalUsd?.toFixed(2)}</span></div>
        <div className="flex justify-between text-sm mb-1"><span className="text-slate-400">IVA</span><span className="text-white">${quotation.ivaUsd?.toFixed(2)}</span></div>
        <div className="flex justify-between text-base font-bold border-t border-slate-700/50 pt-2 mt-2">
          <span className="text-slate-300">Total USD</span><span className="text-green-400">${quotation.totalUsd?.toFixed(2)}</span>
        </div>
      </div>

      {quotation.notes && (
        <div className="card p-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Notas</h3>
          <p className="text-sm text-slate-400">{quotation.notes}</p>
        </div>
      )}

      {quotation.convertedToInvoiceId && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
          Esta cotizacion fue convertida a factura.
        </div>
      )}

      {/* Print choice modal */}
      {printChoice && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPrintChoice(false)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
                <Printer className="text-green-400" size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Imprimir / Compartir</h3>
                <p className="text-sm text-slate-400">Elige el formato del PDF</p>
              </div>
            </div>
            <div className="mt-5 space-y-2">
              <button onClick={() => handlePrint(false)} className="w-full text-left px-4 py-3 rounded-xl border border-slate-700 hover:border-green-500/40 hover:bg-green-500/5 transition-colors">
                <p className="text-sm font-medium text-white">Con IVA</p>
                <p className="text-xs text-slate-500">Muestra el desglose del IVA y el subtotal.</p>
              </button>
              <button onClick={() => handlePrint(true)} className="w-full text-left px-4 py-3 rounded-xl border border-slate-700 hover:border-green-500/40 hover:bg-green-500/5 transition-colors">
                <p className="text-sm font-medium text-white">Sin IVA</p>
                <p className="text-xs text-slate-500">Solo precios y total finales, sin mostrar el impuesto.</p>
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setPrintChoice(false)} className="btn-secondary !py-2 text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
