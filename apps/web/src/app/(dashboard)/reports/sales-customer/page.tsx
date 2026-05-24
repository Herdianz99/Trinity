'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart3, Loader2, Download, Calendar, DollarSign, Receipt, TrendingUp, Award, Users, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

/* ---------- Types ---------- */

interface CustomerRow {
  customerId: string;
  customerName: string;
  customerRif: string;
  invoiceCount: number;
  totalUsd: number;
  avgTicket: number;
  lastPurchase: string;
  pendingReceivable: number;
}

interface CustomerTotals {
  uniqueCustomers: number;
  totalUsd: number;
  invoiceCount: number;
  avgTicket: number;
}

interface CustomerReport {
  totals: CustomerTotals;
  topCustomer: string;
  rows: CustomerRow[];
}

type SortKey = 'customerName' | 'customerRif' | 'invoiceCount' | 'totalUsd' | 'avgTicket' | 'lastPurchase' | 'pendingReceivable';
type SortDir = 'asc' | 'desc';

/* ---------- Helpers ---------- */

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function defaultFrom() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function defaultTo() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  if (!iso) return '---';
  return new Date(iso).toLocaleDateString('es-VE');
}

/* ---------- Component ---------- */

export default function SalesByCustomerPage() {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [data, setData] = useState<CustomerReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('totalUsd');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    document.title = 'Ventas por Cliente | Trinity ERP';
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/proxy/reports/sales-by-customer?from=${from}&to=${to}`);
      if (!res.ok) throw new Error('Error al cargar reporte');
      const json: CustomerReport = await res.json();
      setData(json);
      setLoaded(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  const exportPdf = () => {
    window.open(`/api/proxy/reports/sales-by-customer/pdf?from=${from}&to=${to}`, '_blank');
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortedRows = useMemo(() => {
    if (!data) return [];
    const rows = [...data.rows];
    rows.sort((a, b) => {
      let aVal: any = a[sortKey];
      let bVal: any = b[sortKey];
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal as string).toLowerCase();
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }, [data, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown size={12} className="text-slate-600 ml-1 inline" />;
    return sortDir === 'asc'
      ? <ArrowUp size={12} className="text-green-400 ml-1 inline" />
      : <ArrowDown size={12} className="text-green-400 ml-1 inline" />;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Users className="text-purple-400" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Ventas por Cliente</h1>
            <p className="text-sm text-slate-400">Analisis de ventas desglosadas por cliente</p>
          </div>
        </div>
        {loaded && data && (
          <button onClick={exportPdf} className="btn-secondary flex items-center gap-2">
            <Download size={16} />
            Exportar PDF
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Desde</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="input-field !py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Hasta</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="input-field !py-2.5 text-sm"
            />
          </div>
          <button
            onClick={fetchReport}
            disabled={loading}
            className="btn-primary flex items-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Calendar size={16} />}
            Generar reporte
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-purple-400" size={32} />
        </div>
      )}

      {/* Report content */}
      {loaded && data && !loading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-t-2 border-purple-500 border-x border-b border-slate-700/40 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="text-purple-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Clientes Unicos</span>
              </div>
              <p className="text-2xl font-bold text-purple-400 tabular-nums">{data.totals.uniqueCustomers}</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-t-2 border-emerald-500 border-x border-b border-slate-700/40 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="text-emerald-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total USD</span>
              </div>
              <p className="text-2xl font-bold text-emerald-400 tabular-nums">${fmt(data.totals.totalUsd)}</p>
            </div>
            <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-t-2 border-blue-500 border-x border-b border-slate-700/40 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Receipt className="text-blue-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Facturas</span>
              </div>
              <p className="text-2xl font-bold text-blue-400 tabular-nums">{data.totals.invoiceCount}</p>
            </div>
            <div className="bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border-t-2 border-cyan-500 border-x border-b border-slate-700/40 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="text-cyan-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Ticket Prom</span>
              </div>
              <p className="text-2xl font-bold text-cyan-400 tabular-nums">${fmt(data.totals.avgTicket)}</p>
            </div>
            <div className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-t-2 border-amber-500 border-x border-b border-slate-700/40 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Award className="text-amber-400" size={18} />
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Cliente Top</span>
              </div>
              <p className="text-lg font-bold text-amber-400 truncate">{data.topCustomer || '---'}</p>
            </div>
          </div>

          {/* Sortable Table */}
          <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th
                      onClick={() => handleSort('customerName')}
                      className="text-left text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-slate-200 select-none"
                    >
                      Cliente <SortIcon col="customerName" />
                    </th>
                    <th
                      onClick={() => handleSort('customerRif')}
                      className="text-left text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-slate-200 select-none"
                    >
                      RIF <SortIcon col="customerRif" />
                    </th>
                    <th
                      onClick={() => handleSort('invoiceCount')}
                      className="text-right text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-slate-200 select-none"
                    >
                      Facturas <SortIcon col="invoiceCount" />
                    </th>
                    <th
                      onClick={() => handleSort('totalUsd')}
                      className="text-right text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-slate-200 select-none"
                    >
                      Total USD <SortIcon col="totalUsd" />
                    </th>
                    <th
                      onClick={() => handleSort('avgTicket')}
                      className="text-right text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-slate-200 select-none"
                    >
                      Ticket Prom <SortIcon col="avgTicket" />
                    </th>
                    <th
                      onClick={() => handleSort('lastPurchase')}
                      className="text-left text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-slate-200 select-none"
                    >
                      Ultima Compra <SortIcon col="lastPurchase" />
                    </th>
                    <th
                      onClick={() => handleSort('pendingReceivable')}
                      className="text-right text-xs text-slate-400 font-medium uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-slate-200 select-none"
                    >
                      CxC Pendiente <SortIcon col="pendingReceivable" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-sm">
                        Sin datos para el periodo seleccionado
                      </td>
                    </tr>
                  ) : (
                    sortedRows.map((row) => (
                      <tr key={row.customerId} className="border-b border-slate-700/30 hover:bg-slate-800/40">
                        <td className="px-4 py-3 text-sm text-slate-300 font-medium">{row.customerName}</td>
                        <td className="px-4 py-3 text-sm text-slate-400 font-mono">{row.customerRif || '---'}</td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">{row.invoiceCount}</td>
                        <td className="px-4 py-3 text-sm text-emerald-400 text-right tabular-nums font-medium">${fmt(row.totalUsd)}</td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">${fmt(row.avgTicket)}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{formatDate(row.lastPurchase)}</td>
                        <td className="px-4 py-3 text-sm text-right tabular-nums">
                          {row.pendingReceivable > 0 ? (
                            <span className="text-amber-400 font-medium">${fmt(row.pendingReceivable)}</span>
                          ) : (
                            <span className="text-slate-500">$0,00</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {!loaded && !loading && (
        <div className="text-center py-16">
          <Users className="mx-auto text-slate-600 mb-3" size={40} />
          <p className="text-slate-500 text-sm">
            Selecciona un rango de fechas, luego presiona &quot;Generar reporte&quot;
          </p>
        </div>
      )}
    </div>
  );
}
