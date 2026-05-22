'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ShoppingCart,
  Plus,
  Loader2,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface PurchaseBill {
  id: string;
  number: string;
  supplierInvoiceNumber: string | null;
  invoiceDate: string;
  totalUsd: number;
  status: 'PENDING' | 'PROCESSED' | 'CANCELLED';
  supplier: { id: string; name: string };
}

interface Supplier {
  id: string;
  name: string;
}

const STATUS_BADGES: Record<string, string> = {
  PENDING: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  PROCESSED: 'text-green-400 border-green-500/30 bg-green-500/10',
  CANCELLED: 'text-red-400 border-red-500/30 bg-red-500/10',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PROCESSED: 'Procesada',
  CANCELLED: 'Cancelada',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export default function PurchasesPage() {
  const router = useRouter();
  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    document.title = 'Facturas de Compra | Trinity ERP';
  }, []);

  // Fetch suppliers for filter dropdown
  useEffect(() => {
    fetch('/api/proxy/suppliers?isActive=true')
      .then(r => r.json())
      .then(data => {
        setSuppliers(Array.isArray(data) ? data : data.data || []);
      })
      .catch(() => {});
  }, []);

  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (filterSupplier) params.set('supplierId', filterSupplier);
      if (filterStatus) params.set('status', filterStatus);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/proxy/purchases?${params}`);
      if (res.ok) {
        const data = await res.json();
        setBills(data.data || []);
        setTotal(data.meta?.total || 0);
        setTotalPages(data.meta?.totalPages || 1);
      }
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar facturas de compra' });
    } finally {
      setLoading(false);
    }
  }, [page, filterSupplier, filterStatus, from, to]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  async function handleCancel(id: string) {
    if (!confirm('¿Cancelar esta factura de compra?')) return;
    try {
      const res = await fetch(`/api/proxy/purchases/${id}/cancel`, {
        method: 'PATCH',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al cancelar');
      }
      fetchBills();
      setMessage({ type: 'success', text: 'Factura cancelada exitosamente' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al cancelar' });
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <ShoppingCart className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Facturas de Compra</h1>
            <p className="text-slate-400 text-sm">{total} facturas registradas</p>
          </div>
        </div>
        <Link href="/purchases/new" className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nueva factura de compra
        </Link>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select
            value={filterSupplier}
            onChange={e => { setFilterSupplier(e.target.value); setPage(1); }}
            className="input-field !py-2 text-sm"
          >
            <option value="">Todos los proveedores</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
            className="input-field !py-2 text-sm"
          >
            <option value="">Todos los estados</option>
            <option value="PENDING">Pendiente</option>
            <option value="PROCESSED">Procesada</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
          <input
            type="date"
            value={from}
            onChange={e => { setFrom(e.target.value); setPage(1); }}
            className="input-field !py-2 text-sm"
            placeholder="Desde"
          />
          <input
            type="date"
            value={to}
            onChange={e => { setTo(e.target.value); setPage(1); }}
            className="input-field !py-2 text-sm"
            placeholder="Hasta"
          />
        </div>
        {(filterSupplier || filterStatus || from || to) && (
          <button
            onClick={() => { setFilterSupplier(''); setFilterStatus(''); setFrom(''); setTo(''); setPage(1); }}
            className="mt-3 btn-secondary !py-2 text-sm"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">N° Doc</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">N° Factura prov.</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Proveedor</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden sm:table-cell">Fecha</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Total USD</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium w-24">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <Loader2 className="animate-spin text-green-500 mx-auto" size={28} />
                  </td>
                </tr>
              ) : bills.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    No se encontraron facturas de compra
                  </td>
                </tr>
              ) : (
                bills.map(bill => (
                  <tr
                    key={bill.id}
                    className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors cursor-pointer"
                    onClick={() => router.push(`/purchases/${bill.id}`)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-green-400 font-medium">
                        {bill.number}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 hidden md:table-cell">
                      {bill.supplierInvoiceNumber || '-'}
                    </td>
                    <td className="px-4 py-3 text-white">
                      {bill.supplier.name}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs hidden sm:table-cell">
                      {formatDate(bill.invoiceDate)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-white font-medium">
                      ${bill.totalUsd.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGES[bill.status] || ''}`}>
                        {STATUS_LABELS[bill.status] || bill.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                        <Link
                          href={`/purchases/${bill.id}`}
                          className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-blue-400 inline-flex"
                          title="Ver detalle"
                        >
                          <Eye size={15} />
                        </Link>
                        {bill.status === 'PENDING' && (
                          <button
                            onClick={() => handleCancel(bill.id)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                            title="Cancelar factura"
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <span className="text-sm text-slate-400">Pag. {page} de {totalPages}</span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
