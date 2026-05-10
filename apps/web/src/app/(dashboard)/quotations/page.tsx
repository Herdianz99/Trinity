'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileCheck,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Printer,
  ArrowRightCircle,
  Pencil,
  X,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Quotation {
  id: string;
  number: string;
  status: string;
  totalUsd: number;
  expiresAt: string | null;
  createdAt: string;
  customer: { id: string; name: string; rif: string | null } | null;
  _count: { items: number };
}

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

export default function QuotationsPage() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [converting, setConverting] = useState<string | null>(null);
  const router = useRouter();

  const fetchQuotations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (status) params.set('status', status);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/proxy/quotations?${params}`);
      const data = await res.json();
      setQuotations(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar cotizaciones' });
    } finally {
      setLoading(false);
    }
  }, [page, status, from, to]);

  useEffect(() => {
    fetchQuotations();
  }, [fetchQuotations]);

  async function openDetail(id: string) {
    try {
      const res = await fetch(`/api/proxy/quotations/${id}`);
      const data = await res.json();
      setDetail(data);
      setDetailOpen(true);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar detalle' });
    }
  }

  function handlePrint(id: string) {
    window.open(`/api/proxy/quotations/${id}/pdf`, '_blank');
  }

  async function handleChangeStatus(id: string, newStatus: string) {
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
      fetchQuotations();
      if (detailOpen) {
        const updated = await res.json().catch(() => null);
        if (updated) setDetail(updated);
        else setDetailOpen(false);
      }
      setMessage({ type: 'success', text: `Estado cambiado a ${STATUS_LABELS[newStatus] || newStatus}` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  async function handleConvert(id: string) {
    if (!confirm('¿Convertir esta cotizacion en factura? Se usara la tasa del dia.')) return;
    setConverting(id);
    try {
      const res = await fetch(`/api/proxy/quotations/${id}/convert`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
      const invoice = await res.json();
      setDetailOpen(false);
      setMessage({ type: 'success', text: `Factura ${invoice.number} creada exitosamente` });
      fetchQuotations();
      // Navigate to POS with the created invoice
      router.push(`/sales/pos?invoiceId=${invoice.id}`);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setConverting(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta cotizacion?')) return;
    try {
      // We'll use status change to REJECTED for now since there's no delete endpoint
      // Actually, for DRAFT we can just reject it
      const res = await fetch(`/api/proxy/quotations/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'REJECTED' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
      fetchQuotations();
      setDetailOpen(false);
      setMessage({ type: 'success', text: 'Cotizacion rechazada' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  const IVA_LABELS: Record<string, string> = {
    EXEMPT: 'Exento',
    REDUCED: 'Reducido 8%',
    GENERAL: 'General 16%',
    SPECIAL: 'Especial 31%',
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <FileCheck className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Cotizaciones</h1>
            <p className="text-slate-400 text-sm">{total} cotizaciones registradas</p>
          </div>
        </div>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="input-field !py-2.5 text-sm">
            <option value="">Todos los estados</option>
            <option value="DRAFT">Borrador</option>
            <option value="SENT">Enviada</option>
            <option value="APPROVED">Aprobada</option>
            <option value="REJECTED">Rechazada</option>
            <option value="EXPIRED">Expirada</option>
          </select>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} className="input-field !py-2.5 text-sm" placeholder="Desde" />
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} className="input-field !py-2.5 text-sm" placeholder="Hasta" />
          {(status || from || to) && (
            <button onClick={() => { setStatus(''); setFrom(''); setTo(''); setPage(1); }} className="btn-secondary !py-2.5 text-sm">
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Numero</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden sm:table-cell">Cliente</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Items</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Total USD</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Vence</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Fecha</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12">
                  <Loader2 className="animate-spin text-green-500 mx-auto" size={28} />
                </td></tr>
              ) : quotations.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-500">
                  No se encontraron cotizaciones
                </td></tr>
              ) : quotations.map(q => (
                <tr key={q.id} className="border-b border-slate-700/30 hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-mono text-green-400 text-xs">{q.number}</td>
                  <td className="px-4 py-3 text-slate-300 hidden sm:table-cell">{q.customer?.name || 'Sin cliente'}</td>
                  <td className="px-4 py-3 text-center text-slate-400">{q._count.items}</td>
                  <td className="px-4 py-3 text-right text-white font-medium">${q.totalUsd.toFixed(2)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[q.status] || ''}`}>
                      {STATUS_LABELS[q.status] || q.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs hidden lg:table-cell">
                    {q.expiresAt ? new Date(q.expiresAt).toLocaleDateString('es-VE') : '-'}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs hidden lg:table-cell">{new Date(q.createdAt).toLocaleDateString('es-VE')}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openDetail(q.id)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-blue-400" title="Ver detalle">
                        <Eye size={15} />
                      </button>
                      <button onClick={() => handlePrint(q.id)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-green-400" title="Imprimir PDF">
                        <Printer size={15} />
                      </button>
                      {['DRAFT', 'APPROVED'].includes(q.status) && (
                        <button
                          onClick={() => handleConvert(q.id)}
                          disabled={converting === q.id}
                          className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-emerald-400 disabled:opacity-40"
                          title="Convertir a factura"
                        >
                          {converting === q.id ? <Loader2 className="animate-spin" size={15} /> : <ArrowRightCircle size={15} />}
                        </button>
                      )}
                      {q.status === 'DRAFT' && (
                        <button onClick={() => handleDelete(q.id)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-red-400" title="Rechazar">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <span className="text-sm text-slate-400">Pag. {page} de {totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30">
                <ChevronLeft size={18} />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detailOpen && detail && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetailOpen(false)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white font-mono">{detail.number}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[detail.status] || ''}`}>
                    {STATUS_LABELS[detail.status] || detail.status}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Status change buttons */}
                {detail.status === 'DRAFT' && (
                  <button onClick={() => handleChangeStatus(detail.id, 'SENT')} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20">
                    Marcar Enviada
                  </button>
                )}
                {['DRAFT', 'SENT'].includes(detail.status) && (
                  <button onClick={() => handleChangeStatus(detail.id, 'APPROVED')} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20">
                    Aprobar
                  </button>
                )}
                {['DRAFT', 'SENT', 'APPROVED'].includes(detail.status) && detail.status !== 'REJECTED' && (
                  <button onClick={() => handleChangeStatus(detail.id, 'REJECTED')} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20">
                    Rechazar
                  </button>
                )}
                {['DRAFT', 'APPROVED'].includes(detail.status) && (
                  <button
                    onClick={() => handleConvert(detail.id)}
                    disabled={converting === detail.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 flex items-center gap-1.5 disabled:opacity-40"
                  >
                    {converting === detail.id ? <Loader2 className="animate-spin" size={12} /> : <ArrowRightCircle size={12} />}
                    Convertir a factura
                  </button>
                )}
                <button onClick={() => setDetailOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><X size={18} /></button>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div><span className="text-slate-500 block">Cliente</span><span className="text-white">{detail.customer?.name || 'Sin cliente'}</span></div>
                <div><span className="text-slate-500 block">Fecha</span><span className="text-white">{new Date(detail.createdAt).toLocaleDateString('es-VE')}</span></div>
                <div><span className="text-slate-500 block">Vence</span><span className="text-white">{detail.expiresAt ? new Date(detail.expiresAt).toLocaleDateString('es-VE') : '-'}</span></div>
                <div><span className="text-slate-500 block">Items</span><span className="text-white">{detail.items?.length || 0}</span></div>
              </div>

              {/* Items table */}
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider">Items</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left py-2 text-slate-400">Codigo</th>
                      <th className="text-left py-2 text-slate-400">Producto</th>
                      <th className="text-right py-2 text-slate-400">Cant.</th>
                      <th className="text-right py-2 text-slate-400">Precio USD</th>
                      <th className="text-right py-2 text-slate-400">IVA</th>
                      <th className="text-right py-2 text-slate-400">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items?.map((item: any) => (
                      <tr key={item.id} className="border-b border-slate-700/30">
                        <td className="py-2 text-slate-400 font-mono text-xs">{item.productCode}</td>
                        <td className="py-2 text-white">{item.productName}</td>
                        <td className="py-2 text-right text-slate-300">{item.quantity}</td>
                        <td className="py-2 text-right text-slate-300">${item.unitPriceUsd?.toFixed(2)}</td>
                        <td className="py-2 text-right text-slate-400 text-xs">{IVA_LABELS[item.ivaType] || item.ivaType}</td>
                        <td className="py-2 text-right text-white font-medium">${item.totalUsd?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="card p-4">
                <div className="flex justify-between text-sm mb-1"><span className="text-slate-400">Subtotal</span><span className="text-white">${detail.subtotalUsd?.toFixed(2)}</span></div>
                <div className="flex justify-between text-sm mb-1"><span className="text-slate-400">IVA</span><span className="text-white">${detail.ivaUsd?.toFixed(2)}</span></div>
                <div className="flex justify-between text-base font-bold border-t border-slate-700/50 pt-2 mt-2">
                  <span className="text-slate-300">Total USD</span><span className="text-green-400">${detail.totalUsd?.toFixed(2)}</span>
                </div>
              </div>

              {detail.notes && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider">Notas</h3>
                  <p className="text-sm text-slate-400">{detail.notes}</p>
                </div>
              )}

              {detail.convertedToInvoiceId && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                  Esta cotizacion fue convertida a factura.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
