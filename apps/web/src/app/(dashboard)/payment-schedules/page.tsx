'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Filter,
} from 'lucide-react';

interface PaymentSchedule {
  id: string;
  number: string;
  title: string;
  status: string;
  budgetUsd: number | null;
  budgetBs: number | null;
  budgetCurrency: string | null;
  totalUsd: number;
  totalBs: number;
  exchangeRate: number;
  createdBy: { id: string; name: string };
  createdAt: string;
  _count: { items: number };
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  APPROVED: 'Aprobado',
  EXECUTED: 'Ejecutado',
  CANCELLED: 'Cancelado',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20',
  APPROVED: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  EXECUTED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  CANCELLED: 'bg-red-500/15 text-red-400 border-red-500/20',
};

const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PaymentSchedulesPage() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<PaymentSchedule[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '25');
      if (status) params.set('status', status);
      if (search) params.set('search', search);

      const res = await fetch(`/api/proxy/payment-schedules?${params}`);
      const data = await res.json();
      setSchedules(data.data || []);
      setTotal(data.total || 0);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar programaciones' });
    } finally {
      setLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [message]);

  const totalPages = Math.ceil(total / 25);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Toast */}
      {message && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${message.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-emerald-500/90 text-white'}`}>
          {message.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <CalendarClock className="text-blue-400" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Programacion de Pagos</h1>
            <p className="text-sm text-zinc-500">{total} programaciones</p>
          </div>
        </div>
        <button
          onClick={() => router.push('/payment-schedules/new')}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={18} />
          Nueva programacion
        </button>
      </div>

      {/* Filters */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Estado</label>
            <select
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 min-w-[160px]"
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            >
              <option value="">Todos</option>
              <option value="DRAFT">Borrador</option>
              <option value="APPROVED">Aprobado</option>
              <option value="EXECUTED">Ejecutado</option>
              <option value="CANCELLED">Cancelado</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-zinc-500 mb-1">Busqueda</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
              <input
                type="text"
                placeholder="Buscar por numero o titulo..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1); } }}
              />
            </div>
          </div>
          <button
            onClick={() => { setSearch(searchInput); setPage(1); }}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm transition-colors"
          >
            <Filter size={16} />
            Filtrar
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-zinc-500" size={32} />
          </div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">
            <CalendarClock className="mx-auto mb-3 opacity-40" size={40} />
            <p>No hay programaciones</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="text-left px-4 py-3 font-medium">Numero</th>
                <th className="text-left px-4 py-3 font-medium">Titulo</th>
                <th className="text-right px-4 py-3 font-medium">Total USD</th>
                <th className="text-right px-4 py-3 font-medium">Total Bs</th>
                <th className="text-right px-4 py-3 font-medium">Presupuesto</th>
                <th className="text-center px-4 py-3 font-medium">Estado</th>
                <th className="text-left px-4 py-3 font-medium">Creado por</th>
                <th className="text-left px-4 py-3 font-medium">Fecha</th>
                <th className="text-center px-4 py-3 font-medium">Items</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/40 cursor-pointer transition-colors"
                  onClick={() => router.push(`/payment-schedules/${s.id}`)}
                >
                  <td className="px-4 py-3 font-mono text-blue-400 font-medium">{s.number}</td>
                  <td className="px-4 py-3 text-zinc-200">{s.title}</td>
                  <td className="px-4 py-3 text-right text-zinc-200 font-medium">${fmt(s.totalUsd)}</td>
                  <td className="px-4 py-3 text-right text-zinc-400">Bs {fmt(s.totalBs)}</td>
                  <td className="px-4 py-3 text-right text-zinc-400">
                    {s.budgetUsd ? `$${fmt(s.budgetUsd)}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[s.status] || 'bg-zinc-500/15 text-zinc-400'}`}>
                      {STATUS_LABELS[s.status] || s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{s.createdBy.name}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {new Date(s.createdAt).toLocaleDateString('es-VE')}
                  </td>
                  <td className="px-4 py-3 text-center text-zinc-400">{s._count.items}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <span className="text-sm text-zinc-500">
              Pagina {page} de {totalPages} ({total} resultados)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
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
