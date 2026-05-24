'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Loader2, Search, CheckCircle, Ban, Eye, X, Calendar,
  FileText, ChevronLeft, ChevronRight,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface RetentionVoucher {
  id: string;
  number: string;
  status: 'PENDING' | 'ISSUED' | 'CANCELLED';
  issueDate: string | null;
  retentionAmountUsd: number;
  retentionAmountBs: number;
  exchangeRate: number;
  notes: string | null;
  purchaseOrder: {
    id: string;
    number: string;
    purchaseNumber: number;
    invoiceDate: string | null;
    totalIvaUsd: number;
    totalIvaBs: number;
    totalUsd: number;
    totalBs: number;
    exchangeRate: number;
    supplierControlNumber: string | null;
    supplierInvoiceNumber: string | null;
    supplier: { id: string; name: string; rif: string | null };
  };
  createdBy: { id: string; name: string };
  createdAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const STATUS_BADGES: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  ISSUED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  CANCELLED: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  ISSUED: 'Emitida',
  CANCELLED: 'Anulada',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function RetentionsPage() {
  const now = new Date();

  // Filters
  const [status, setStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Data
  const [vouchers, setVouchers] = useState<RetentionVoucher[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Issue modal
  const [issueModal, setIssueModal] = useState<RetentionVoucher | null>(null);
  const [issueDate, setIssueDate] = useState(toLocalDateStr(now));
  const [issuing, setIssuing] = useState(false);

  // Detail modal
  const [detailModal, setDetailModal] = useState<RetentionVoucher | null>(null);

  useEffect(() => { document.title = 'Retenciones IVA | Trinity ERP'; }, []);

  // ── Fetch ──────────────────────────────────────────────────────────────

  const fetchData = useCallback(async (p = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      params.set('page', String(p));
      params.set('limit', '50');

      const res = await fetch(`/api/proxy/retention-vouchers?${params}`);
      if (!res.ok) throw new Error('Error al cargar retenciones');
      const data = await res.json();
      setVouchers(data.data || []);
      setTotal(data.total || 0);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, fromDate, toDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Counts by status ──────────────────────────────────────────────────

  const pendingCount = vouchers.filter(v => v.status === 'PENDING').length;
  const issuedCount = vouchers.filter(v => v.status === 'ISSUED').length;
  const cancelledCount = vouchers.filter(v => v.status === 'CANCELLED').length;

  // ── Issue handler ─────────────────────────────────────────────────────

  async function handleIssue() {
    if (!issueModal) return;
    setIssuing(true);
    try {
      const res = await fetch(`/api/proxy/retention-vouchers/${issueModal.id}/issue`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueDate }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al emitir');
      }
      setIssueModal(null);
      fetchData(page);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIssuing(false);
    }
  }

  // ── Cancel handler ────────────────────────────────────────────────────

  async function handleCancel(id: string) {
    if (!confirm('¿Anular este comprobante de retención?')) return;
    try {
      const res = await fetch(`/api/proxy/retention-vouchers/${id}/cancel`, { method: 'PATCH' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al anular');
      }
      fetchData(page);
    } catch (err: any) {
      setError(err.message);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <Shield className="text-purple-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Comprobantes de Retencion IVA</h1>
          <p className="text-sm text-slate-400">Gestion de comprobantes de retencion por compras</p>
        </div>
      </div>

      {/* Status counters */}
      <div className="flex flex-wrap gap-3">
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-2 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-xs text-amber-400 font-medium">{pendingCount} Pendientes</span>
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-4 py-2 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-xs text-emerald-400 font-medium">{issuedCount} Emitidas</span>
        </div>
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-2 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <span className="text-xs text-red-400 font-medium">{cancelledCount} Anuladas</span>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300"><X size={16} /></button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Estado</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
              <option value="">Todos</option>
              <option value="PENDING">Pendiente</option>
              <option value="ISSUED">Emitida</option>
              <option value="CANCELLED">Anulada</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Desde</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Hasta</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
          </div>
          <button onClick={() => fetchData(1)} disabled={loading}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm flex items-center gap-2 disabled:opacity-50 h-[38px]">
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
            Buscar
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-3 py-2.5 text-slate-400 font-medium">N&deg; Retencion</th>
                <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Factura</th>
                <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Proveedor</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Monto USD</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Monto Bs</th>
                <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Fecha emision</th>
                <th className="text-center px-3 py-2.5 text-slate-400 font-medium">Estado</th>
                <th className="text-center px-3 py-2.5 text-slate-400 font-medium w-32">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-10 text-slate-500">
                  <Loader2 className="animate-spin mx-auto" size={24} />
                </td></tr>
              ) : vouchers.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-slate-500">
                  <Shield size={32} className="mx-auto mb-2 text-slate-600" />
                  No hay comprobantes de retencion
                </td></tr>
              ) : (
                vouchers.map(v => (
                  <tr key={v.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors group">
                    <td className="px-3 py-2.5 text-purple-400 font-mono font-bold">{v.number}</td>
                    <td className="px-3 py-2.5">
                      <a href={`/purchases/${v.purchaseOrder.id}`}
                        className="text-blue-400 hover:text-blue-300 font-mono text-xs">
                        {v.purchaseOrder.number}
                      </a>
                    </td>
                    <td className="px-3 py-2.5 text-slate-200">
                      <div className="truncate max-w-[180px]">{v.purchaseOrder.supplier.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{v.purchaseOrder.supplier.rif || 'S/R'}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-300 tabular-nums font-mono">${fmt(v.retentionAmountUsd)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-300 tabular-nums font-mono">Bs {fmt(v.retentionAmountBs)}</td>
                    <td className="px-3 py-2.5 text-slate-300">{fmtDate(v.issueDate)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${STATUS_BADGES[v.status]}`}>
                        {STATUS_LABELS[v.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setDetailModal(v)}
                          className="p-1.5 rounded hover:bg-slate-600/60 text-slate-400 hover:text-blue-400 transition-colors"
                          title="Ver detalle">
                          <Eye size={15} />
                        </button>
                        {v.status === 'PENDING' && (
                          <button onClick={() => { setIssueModal(v); setIssueDate(toLocalDateStr(now)); }}
                            className="p-1.5 rounded hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400 transition-colors"
                            title="Emitir">
                            <CheckCircle size={15} />
                          </button>
                        )}
                        {(v.status === 'PENDING' || v.status === 'ISSUED') && (
                          <button onClick={() => handleCancel(v.id)}
                            className="p-1.5 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                            title="Anular">
                            <Ban size={15} />
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
            <span className="text-xs text-slate-500">{total} comprobantes</span>
            <div className="flex items-center gap-1">
              <button onClick={() => fetchData(page - 1)} disabled={page <= 1}
                className="p-1.5 rounded hover:bg-slate-700 text-slate-400 disabled:opacity-30">
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-slate-400 px-2">{page} / {totalPages}</span>
              <button onClick={() => fetchData(page + 1)} disabled={page >= totalPages}
                className="p-1.5 rounded hover:bg-slate-700 text-slate-400 disabled:opacity-30">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Issue Modal */}
      {issueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-100">Emitir retencion</h2>
              <button onClick={() => setIssueModal(null)} className="p-1 rounded hover:bg-slate-700 text-slate-400">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">N&deg; Retencion</p>
                  <p className="text-purple-400 font-mono font-bold">{issueModal.number}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Factura vinculada</p>
                  <p className="text-blue-400 font-mono">{issueModal.purchaseOrder.number}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Proveedor</p>
                  <p className="text-slate-200">{issueModal.purchaseOrder.supplier.name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Monto retencion</p>
                  <p className="text-slate-200 font-mono">${fmt(issueModal.retentionAmountUsd)} / Bs {fmt(issueModal.retentionAmountBs)}</p>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Fecha de emision *</label>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-2.5 text-slate-500" size={14} />
                  <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200" />
                </div>
              </div>

              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2">
                <p className="text-xs text-emerald-400">Al emitir se registrara en el libro de compras</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-700">
              <button onClick={() => setIssueModal(null)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm">
                Cancelar
              </button>
              <button onClick={handleIssue} disabled={issuing || !issueDate}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center gap-2 disabled:opacity-50">
                {issuing ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                Confirmar emision
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-100">Detalle de retencion</h2>
              <button onClick={() => setDetailModal(null)} className="p-1 rounded hover:bg-slate-700 text-slate-400">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">N&deg; Retencion</p>
                  <p className="text-purple-400 font-mono font-bold text-lg">{detailModal.number}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Estado</p>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${STATUS_BADGES[detailModal.status]}`}>
                    {STATUS_LABELS[detailModal.status]}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Factura</p>
                  <p className="text-blue-400 font-mono">{detailModal.purchaseOrder.number}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Proveedor</p>
                  <p className="text-slate-200">{detailModal.purchaseOrder.supplier.name}</p>
                  <p className="text-xs text-slate-500 font-mono">{detailModal.purchaseOrder.supplier.rif}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">IVA factura $</p>
                  <p className="text-slate-200 font-mono">${fmt(detailModal.purchaseOrder.totalIvaUsd)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Monto retenido $</p>
                  <p className="text-purple-400 font-mono font-bold">${fmt(detailModal.retentionAmountUsd)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Monto retenido Bs</p>
                  <p className="text-purple-400 font-mono font-bold">Bs {fmt(detailModal.retentionAmountBs)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Tasa</p>
                  <p className="text-slate-300 font-mono">{fmt(detailModal.exchangeRate)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Fecha emision</p>
                  <p className="text-slate-300">{fmtDate(detailModal.issueDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Creado</p>
                  <p className="text-slate-300 text-xs">{fmtDate(detailModal.createdAt)} por {detailModal.createdBy.name}</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end px-5 py-4 border-t border-slate-700">
              <button onClick={() => setDetailModal(null)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
