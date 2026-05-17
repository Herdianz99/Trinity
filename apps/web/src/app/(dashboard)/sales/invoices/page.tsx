'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  FileText,
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Printer,
  Trash2,
  X,
} from 'lucide-react';

interface Invoice {
  id: string;
  number: string;
  status: string;
  paymentType: string;
  totalUsd: number;
  totalBs: number;
  exchangeRate: number;
  isCredit: boolean;
  createdAt: string;
  customer: { id: string; name: string; rif: string | null } | null;
  seller: { id: string; code: string; name: string } | null;
  cashRegister: { id: string; code: string; name: string } | null;
  _count: { items: number };
}

interface Seller {
  id: string;
  code: string;
  name: string;
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

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch sellers for dropdown
  useEffect(() => {
    fetch('/api/proxy/sellers').then(r => r.json()).then(data => {
      setSellers(Array.isArray(data) ? data : data.data || []);
    }).catch(() => {});
  }, []);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (status) params.set('status', status);
      if (paymentType) params.set('paymentType', paymentType);
      if (searchDebounced) params.set('search', searchDebounced);
      if (sellerId) params.set('sellerId', sellerId);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/proxy/invoices?${params}`);
      const data = await res.json();
      setInvoices(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar facturas' });
    } finally {
      setLoading(false);
    }
  }, [page, status, paymentType, searchDebounced, sellerId, from, to]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  async function openDetail(id: string) {
    try {
      const res = await fetch(`/api/proxy/invoices/${id}`);
      const data = await res.json();
      setDetail(data);
      setDetailOpen(true);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar detalle' });
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta factura en espera?')) return;
    try {
      const res = await fetch(`/api/proxy/invoices/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
      fetchInvoices();
      setDetailOpen(false);
      setMessage({ type: 'success', text: 'Factura eliminada' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  function handlePrint(id: string) {
    window.open(`/api/proxy/invoices/${id}/pdf`, '_blank');
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <FileText className="text-green-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Facturas</h1>
          <p className="text-slate-400 text-sm">{total} facturas registradas</p>
        </div>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 mb-6 space-y-3">
        {/* Search bar */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por factura, cliente o cedula/RIF..."
            className="input-field !py-2.5 !pl-9 text-sm w-full"
          />
        </div>
        {/* Dropdowns and dates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="input-field !py-2.5 text-sm">
            <option value="">Todos los estados</option>
            <option value="PENDING">Pendiente</option>
            <option value="PAID">Pagada</option>
            <option value="PARTIAL_RETURN">Dev. Parcial</option>
            <option value="RETURNED">Devuelta</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
          <select value={paymentType} onChange={e => { setPaymentType(e.target.value); setPage(1); }} className="input-field !py-2.5 text-sm">
            <option value="">Tipo de pago</option>
            <option value="CASH">Contado</option>
            <option value="CREDIT">Credito</option>
          </select>
          <select value={sellerId} onChange={e => { setSellerId(e.target.value); setPage(1); }} className="input-field !py-2.5 text-sm">
            <option value="">Todos los vendedores</option>
            {sellers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} className="input-field !py-2.5 text-sm" placeholder="Desde" />
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} className="input-field !py-2.5 text-sm" placeholder="Hasta" />
          {(status || paymentType || from || to || search || sellerId) && (
            <button onClick={() => { setStatus(''); setPaymentType(''); setFrom(''); setTo(''); setSearch(''); setSellerId(''); setPage(1); }} className="btn-secondary !py-2.5 text-sm">
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
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Vendedor</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Total USD</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Total Bs</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Fecha</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12">
                  <Loader2 className="animate-spin text-green-500 mx-auto" size={28} />
                </td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-500">
                  No se encontraron facturas
                </td></tr>
              ) : invoices.map(inv => (
                <tr key={inv.id} className="border-b border-slate-700/30 hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link href={`/sales/invoices/${inv.id}`} className="text-green-400 hover:text-green-300 hover:underline">
                      {inv.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-300 hidden sm:table-cell">{inv.customer?.name || 'Sin cliente'}</td>
                  <td className="px-4 py-3 text-slate-400 hidden md:table-cell text-xs">{inv.seller?.name || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[inv.status] || ''}`}>
                        {STATUS_LABELS[inv.status] || inv.status}
                      </span>
                      {inv.status !== 'PENDING' && inv.status !== 'CANCELLED' && (
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${PAYMENT_TYPE_COLORS[inv.paymentType] || ''}`}>
                          {PAYMENT_TYPE_LABELS[inv.paymentType] || inv.paymentType}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-white font-medium">${inv.totalUsd.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-slate-400 hidden lg:table-cell">Bs {inv.totalBs.toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs hidden lg:table-cell">{new Date(inv.createdAt).toLocaleDateString('es-VE')}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Link href={`/sales/invoices/${inv.id}`} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-blue-400 inline-flex" title="Ver detalle">
                        <Eye size={15} />
                      </Link>
                      {['PAID', 'PARTIAL_RETURN', 'RETURNED'].includes(inv.status) && (
                        <button onClick={() => handlePrint(inv.id)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-green-400" title="Imprimir PDF">
                          <Printer size={15} />
                        </button>
                      )}
                      {inv.status === 'PENDING' && (
                        <button onClick={() => handleDelete(inv.id)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-red-400" title="Eliminar">
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
              <div>
                <h2 className="text-lg font-bold text-white font-mono">{detail.number}</h2>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[detail.status] || ''}`}>{STATUS_LABELS[detail.status] || detail.status}</span>
                  {detail.paymentType && detail.status !== 'PENDING' && detail.status !== 'CANCELLED' && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${PAYMENT_TYPE_COLORS[detail.paymentType] || ''}`}>{PAYMENT_TYPE_LABELS[detail.paymentType] || detail.paymentType}</span>
                  )}
                </div>
              </div>
              <button onClick={() => setDetailOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div><span className="text-slate-500 block">Cliente</span><span className="text-white">{detail.customer?.name || 'Sin cliente'}</span></div>
                <div><span className="text-slate-500 block">Tasa</span><span className="text-white">Bs {detail.exchangeRate?.toFixed(2)}</span></div>
                <div><span className="text-slate-500 block">Fecha</span><span className="text-white">{new Date(detail.createdAt).toLocaleDateString('es-VE')}</span></div>
                <div><span className="text-slate-500 block">Caja</span><span className="text-white">{detail.cashRegister?.code}</span></div>
              </div>

              {/* Items table */}
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider">Items</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left py-2 text-slate-400">Producto</th>
                      <th className="text-right py-2 text-slate-400">Cant.</th>
                      <th className="text-right py-2 text-slate-400">Precio</th>
                      <th className="text-right py-2 text-slate-400">IVA</th>
                      <th className="text-right py-2 text-slate-400">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items?.map((item: any) => (
                      <tr key={item.id} className="border-b border-slate-700/30">
                        <td className="py-2 text-white">{item.productName}</td>
                        <td className="py-2 text-right text-slate-300">{item.quantity}</td>
                        <td className="py-2 text-right text-slate-300">${item.unitPrice?.toFixed(2)}</td>
                        <td className="py-2 text-right text-slate-400 text-xs">{item.ivaType}</td>
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
                {detail.igtfUsd > 0 && (
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-amber-400">IGTF (3%)</span>
                    <span className="text-amber-400">${detail.igtfUsd?.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold border-t border-slate-700/50 pt-2 mt-2">
                  <span className="text-slate-300">Total USD</span><span className="text-green-400">${detail.totalUsd?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm"><span className="text-slate-400">Total Bs</span><span className="text-slate-300">Bs {detail.totalBs?.toFixed(2)}</span></div>
              </div>

              {/* Payments */}
              {detail.payments?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider">Pagos</h3>
                  <div className="space-y-1">
                    {detail.payments.map((p: any) => (
                      <div key={p.id} className="flex justify-between text-sm px-3 py-2 rounded-lg bg-slate-700/30">
                        <span className="text-slate-300">{p.method.replace(/_/g, ' ')}</span>
                        <div>
                          <span className="text-white">${p.amountUsd?.toFixed(2)}</span>
                          {p.reference && <span className="text-slate-500 text-xs ml-2">Ref: {p.reference}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
