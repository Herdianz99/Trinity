'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Activity, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

interface Movement {
  id: string;
  productId: string;
  warehouseId: string;
  type: string;
  quantity: number;
  reason: string | null;
  reference: string | null;
  createdById: string;
  createdAt: string;
  product: { id: string; code: string; name: string };
  warehouse: { id: string; name: string };
}

interface Warehouse { id: string; name: string; }

const TYPE_BADGES: Record<string, string> = {
  PURCHASE: 'bg-green-500/10 text-green-400 border-green-500/20',
  SALE: 'bg-red-500/10 text-red-400 border-red-500/20',
  ADJUSTMENT_IN: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  ADJUSTMENT_OUT: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  TRANSFER_IN: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  TRANSFER_OUT: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  COUNT_ADJUST: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

const TYPE_LABELS: Record<string, string> = {
  PURCHASE: 'Compra',
  SALE: 'Venta',
  ADJUSTMENT_IN: 'Ajuste +',
  ADJUSTMENT_OUT: 'Ajuste -',
  TRANSFER_IN: 'Transfer. entrada',
  TRANSFER_OUT: 'Transfer. salida',
  COUNT_ADJUST: 'Ajuste conteo',
};

type DateRange = 'today' | 'week' | 'month' | 'custom';

export default function MovementsPage() {
  const searchParams = useSearchParams();
  const initialProductId = searchParams.get('productId') || '';

  const [movements, setMovements] = useState<Movement[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);

  // Filters
  const [filterProductId, setFilterProductId] = useState(initialProductId);
  const [filterWarehouseId, setFilterWarehouseId] = useState('');
  const [filterType, setFilterType] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  function getDateRange(): { from?: string; to?: string } {
    const now = new Date();
    if (dateRange === 'today') {
      const d = now.toISOString().split('T')[0];
      return { from: d, to: d };
    }
    if (dateRange === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      return { from: start.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
    }
    if (dateRange === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: start.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
    }
    if (dateRange === 'custom') {
      return { from: customFrom || undefined, to: customTo || undefined };
    }
    return {};
  }

  const fetchMovements = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '25');
      if (filterProductId) params.set('productId', filterProductId);
      if (filterWarehouseId) params.set('warehouseId', filterWarehouseId);
      if (filterType) params.set('type', filterType);
      const range = getDateRange();
      if (range.from) params.set('from', range.from);
      if (range.to) params.set('to', range.to);

      const res = await fetch(`/api/proxy/stock-movements?${params}`);
      if (res.ok) {
        const data = await res.json();
        setMovements(data.data);
        setTotal(data.meta.total);
        setTotalPages(data.meta.totalPages);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [page, filterProductId, filterWarehouseId, filterType, dateRange, customFrom, customTo]);

  const fetchWarehouses = useCallback(async () => {
    const res = await fetch('/api/proxy/warehouses');
    if (res.ok) setWarehouses(await res.json());
  }, []);

  useEffect(() => { fetchWarehouses(); }, [fetchWarehouses]);
  useEffect(() => { fetchMovements(); }, [fetchMovements]);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <Activity className="text-green-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Movimientos de Stock</h1>
          <p className="text-slate-400 text-sm">{total} movimientos</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6 space-y-3">
        {/* Date range selector */}
        <div className="flex flex-wrap gap-2">
          {(['today', 'week', 'month', 'custom'] as DateRange[]).map(r => (
            <button
              key={r}
              onClick={() => { setDateRange(r); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                dateRange === r
                  ? 'bg-green-500/20 text-green-400 border-green-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              {r === 'today' ? 'Hoy' : r === 'week' ? 'Esta semana' : r === 'month' ? 'Este mes' : 'Personalizado'}
            </button>
          ))}
        </div>

        {dateRange === 'custom' && (
          <div className="flex gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Desde</label>
              <input type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setPage(1); }} className="input-field !py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Hasta</label>
              <input type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setPage(1); }} className="input-field !py-1.5 text-sm" />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select
            value={filterWarehouseId}
            onChange={(e) => { setFilterWarehouseId(e.target.value); setPage(1); }}
            className="input-field !py-2 text-sm"
          >
            <option value="">Todos los almacenes</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
            className="input-field !py-2 text-sm"
          >
            <option value="">Todos los tipos</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input
            type="text"
            value={filterProductId}
            onChange={(e) => { setFilterProductId(e.target.value); setPage(1); }}
            placeholder="ID de producto..."
            className="input-field !py-2 text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Producto</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Almacen</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Tipo</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Cantidad</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Motivo</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Referencia</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12"><Loader2 className="animate-spin text-green-500 mx-auto" size={28} /></td></tr>
              ) : movements.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-500">No hay movimientos en este periodo</td></tr>
              ) : movements.map(m => (
                <tr key={m.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 text-slate-300 text-xs whitespace-nowrap">
                    {new Date(m.createdAt).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-green-400">{m.product.code}</span>
                    <span className="text-white ml-2">{m.product.name}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 hidden md:table-cell">{m.warehouse.name}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${TYPE_BADGES[m.type] || ''}`}>
                      {TYPE_LABELS[m.type] || m.type}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-medium ${m.quantity > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {m.quantity > 0 ? '+' : ''}{m.quantity}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs hidden lg:table-cell">{m.reason || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs hidden lg:table-cell">{m.reference || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <span className="text-sm text-slate-400">Pagina {page} de {totalPages} ({total} movimientos)</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30 transition-colors">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30 transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
