'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileText, Search, Loader2, ChevronLeft, ChevronRight, ChevronDown, Plus, Eye, Trash2, X, ListTree,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

interface Receipt {
  id: string;
  number: string;
  type: string;
  customer: { id: string; name: string; rif: string | null } | null;
  platformName: string | null;
  seller: { id: string; code: string; name: string } | null;
  status: string;
  totalUsd: number;
  totalBsHistoric: number;
  totalBsToday: number;
  differentialBs: number;
  hasDifferential: boolean;
  exchangeRate: number;
  documentDate: string | null;
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
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [sellers, setSellers] = useState<{ id: string; code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: 'COLLECTION', page: String(page), limit: '20' });
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      if (sellerId) params.set('sellerId', sellerId);
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const res = await fetch(`/api/proxy/receipts?${params}`);
      const json = await res.json();
      setReceipts(json.data || []);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, status, search, sellerId, from, to]);

  useEffect(() => { document.title = 'Recibos de Cobro | Trinity ERP'; }, []);
  useEffect(() => {
    fetch('/api/proxy/sellers').then((r) => (r.ok ? r.json() : [])).then((d) => setSellers(Array.isArray(d) ? d : d.data || [])).catch(() => {});
  }, []);
  // Debounce de la caja de busqueda: aplica el filtro 400ms despues de dejar de escribir
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);
  useEffect(() => { fetchReceipts(); }, [fetchReceipts]);

  async function handleDelete(id: string, number: string) {
    if (!confirm(`Eliminar el recibo ${number}? Se borrara permanentemente.`)) return;
    try {
      const res = await fetch(`/api/proxy/receipts/${id}`, { method: 'DELETE' });
      if (res.ok) fetchReceipts();
    } catch { /* ignore */ }
  }

  const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Construye los params con los filtros activos (compartido por ambos reportes).
  function reportParams() {
    const params = new URLSearchParams({ type: 'COLLECTION' });
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    if (sellerId) params.set('sellerId', sellerId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return params;
  }

  // Reporte resumen (una fila por recibo).
  function openReport() {
    window.open(`/api/proxy/receipts/report/pdf?${reportParams()}`, '_blank');
  }

  // Reporte detallado: cada recibo con los documentos que se cobraron (facturas/notas).
  function openDetailedReport() {
    window.open(`/api/proxy/receipts/report/detailed/pdf?${reportParams()}`, '_blank');
  }

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
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-medium transition-colors border border-slate-600"
                title="Reportes de recibos de cobro (mismos filtros del listado)"
              >
                <FileText size={18} /> Reportes <ChevronDown size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700 text-slate-200 min-w-[260px]">
              <DropdownMenuItem onClick={openReport} className="cursor-pointer text-slate-200 focus:bg-slate-700 focus:text-white gap-2">
                <FileText size={14} /> Reporte resumen
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openDetailedReport} className="cursor-pointer text-slate-200 focus:bg-slate-700 focus:text-white gap-2">
                <ListTree size={14} /> Reporte detallado (documentos)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link
            href="/receipts/new?type=COLLECTION"
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors"
          >
            <Plus size={18} />
            Nuevo recibo
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por cliente o N° de recibo"
            className="w-full bg-slate-700 border border-slate-600 text-slate-200 rounded-lg pl-9 pr-9 py-2 text-sm placeholder:text-slate-500"
          />
          {searchInput && (
            <button onClick={() => setSearchInput('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300" title="Limpiar">
              <X size={16} />
            </button>
          )}
        </div>
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
        <select
          value={sellerId}
          onChange={(e) => { setSellerId(e.target.value); setPage(1); }}
          className="bg-slate-700 border border-slate-600 text-slate-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todos los vendedores</option>
          {sellers.map((s) => <option key={s.id} value={s.id}>{s.code ? `${s.code} — ${s.name}` : s.name}</option>)}
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
        {(status || from || to || searchInput || sellerId) && (
          <button
            onClick={() => { setStatus(''); setFrom(''); setTo(''); setSearchInput(''); setSellerId(''); setPage(1); }}
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
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Vendedor</th>
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
                    <td className="px-4 py-3 text-slate-300">
                      {r.customer?.name || (r.platformName ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-cyan-400">{r.platformName}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">Plataforma</span>
                        </span>
                      ) : '—')}
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs">{r.seller?.name || '—'}</td>
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
                      {new Date(r.documentDate ?? r.createdAt).toLocaleDateString('es-VE', { timeZone: 'UTC' })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push(`/receipts/${r.id}`); }}
                          className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
                          title="Ver"
                        >
                          <Eye size={16} />
                        </button>
                        {(r.status === 'DRAFT' || r.status === 'CANCELLED') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(r.id, r.number); }}
                            className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors text-slate-400 hover:text-red-400"
                            title="Eliminar"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
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
