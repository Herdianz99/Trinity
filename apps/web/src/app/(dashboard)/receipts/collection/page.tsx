'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileText, Search, Loader2, ChevronLeft, ChevronRight, Plus, Eye,
} from 'lucide-react';

interface Receipt {
  id: string;
  number: string;
  type: string;
  customer: { id: string; name: string; rif: string | null } | null;
  status: string;
  totalUsd: number;
  totalBsHistoric: number;
  totalBsToday: number;
  differentialBs: number;
  hasDifferential: boolean;
  exchangeRate: number;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  POSTED: 'text-green-400 border-green-500/30 bg-green-500/10',
  CANCELLED: 'text-red-400 border-red-500/30 bg-red-500/10',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  POSTED: 'Procesado',
  CANCELLED: 'Cancelado',
};

export default function ReceiptsCollectionPage() {
  const router = useRouter();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: 'COLLECTION', page: String(page), limit: '20' });
      if (status) params.set('status', status);
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const res = await fetch(`/api/proxy/receipts?${params}`);
      const json = await res.json();
      setReceipts(json.data || []);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, status, from, to]);

  useEffect(() => { fetchReceipts(); }, [fetchReceipts]);

  const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FileText className="text-green-400" size={28} />
            Recibos de Cobro
          </h1>
          <p className="text-slate-400 mt-1">
            {total} recibo{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/receipts/new?type=COLLECTION"
          className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors"
        >
          <Plus size={18} />
          Nuevo recibo
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="bg-slate-700 border border-slate-600 text-slate-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="DRAFT">Borrador</option>
          <option value="POSTED">Procesado</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => { setFrom(e.target.value); setPage(1); }}
          className="bg-slate-700 border border-slate-600 text-slate-200 rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => { setTo(e.target.value); setPage(1); }}
          className="bg-slate-700 border border-slate-600 text-slate-200 rounded-lg px-3 py-2 text-sm"
        />
        {(status || from || to) && (
          <button
            onClick={() => { setStatus(''); setFrom(''); setTo(''); setPage(1); }}
            className="text-xs text-slate-400 hover:text-white"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-green-400" size={32} />
          </div>
        ) : receipts.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            No hay recibos de cobro registrados
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Numero</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Cliente</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Total USD</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Total Bs hist.</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Diferencial Bs</th>
                  <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                  <th className="text-center px-4 py-3 text-slate-400 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-700/30 hover:bg-slate-700/20 cursor-pointer transition-colors"
                    onClick={() => router.push(`/receipts/${r.id}`)}
                  >
                    <td className="px-4 py-3 text-white font-mono font-medium">{r.number}</td>
                    <td className="px-4 py-3 text-slate-300">{r.customer?.name || '—'}</td>
                    <td className="px-4 py-3 text-right text-white font-mono">${fmt(r.totalUsd)}</td>
                    <td className="px-4 py-3 text-right text-slate-300 font-mono">{fmt(r.totalBsHistoric)} Bs</td>
                    <td className={`px-4 py-3 text-right font-mono ${r.differentialBs > 0 ? 'text-amber-400' : r.differentialBs < 0 ? 'text-green-400' : 'text-slate-500'}`}>
                      {r.hasDifferential ? `${r.differentialBs > 0 ? '+' : ''}${fmt(r.differentialBs)} Bs` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[r.status] || 'text-slate-400'}`}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {new Date(r.createdAt).toLocaleDateString('es-VE')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/receipts/${r.id}`); }}
                        className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <span className="text-sm text-slate-400">
              Pagina {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
