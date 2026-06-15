'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Loader2, Search, DollarSign, Receipt, TrendingUp, FileText, Building2, Download, Users } from 'lucide-react';

/* ---------- Types ---------- */

interface Seller {
  id: string;
  name: string;
}

interface CategoryRow {
  categoryName: string;
  units: number;
  baseUsd: number;
  commissionPct: number;
  commissionUsd: number;
  ivaNotasUsd: number;
}

interface InvoiceRow {
  id: string;
  number: string;
  customer: { id: string; name: string } | null;
  totalUsd: number;
  paidAt: string;
  itemCount: number;
  isGroup: boolean;
}

interface CommissionReport {
  sellerId: string;
  from: string;
  to: string;
  invoiceCount: number;
  totalSoldUsd: number;
  totalCommissionUsd: number;
  totalIvaNotasUsd: number;
  totalGroupSoldUsd: number;
  groupInvoiceCount: number;
  categories: CategoryRow[];
  invoices: InvoiceRow[];
}

interface SellerCommission extends CommissionReport {
  sellerCode: string;
  sellerName: string;
}

interface AllCommissionReport {
  from: string;
  to: string;
  sellers: SellerCommission[];
  grandTotals: {
    totalSoldUsd: number;
    totalCommissionUsd: number;
    totalIvaNotasUsd: number;
    totalGroupSoldUsd: number;
    invoiceCount: number;
    groupInvoiceCount: number;
    sellerCount: number;
  };
}

const ALL = 'all';

/* ---------- Helpers ---------- */

function formatUsd(n: number): string {
  return `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-VE');
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ---------- Category breakdown table (reusable) ---------- */

function CategoryBreakdown({ categories }: { categories: CategoryRow[] }) {
  const totals = {
    units: categories.reduce((s, c) => s + c.units, 0),
    baseUsd: categories.reduce((s, c) => s + c.baseUsd, 0),
    commissionUsd: categories.reduce((s, c) => s + c.commissionUsd, 0),
    ivaNotasUsd: categories.reduce((s, c) => s + c.ivaNotasUsd, 0),
  };

  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="bg-slate-800/80 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                Categoria
              </th>
              <th className="bg-slate-800/80 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                Unidades
              </th>
              <th className="bg-slate-800/80 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                Base USD
              </th>
              <th className="bg-slate-800/80 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                Comision %
              </th>
              <th className="bg-slate-800/80 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                Comision USD
              </th>
              <th className="bg-slate-800/80 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                IVA Notas
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">
                  Sin datos de categorias
                </td>
              </tr>
            ) : (
              <>
                {categories.map((cat) => (
                  <tr
                    key={cat.categoryName}
                    className="border-t border-slate-700/30 hover:bg-slate-800/30"
                  >
                    <td className="px-4 py-3 text-sm text-slate-300">{cat.categoryName}</td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">
                      {cat.units}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">
                      {formatUsd(cat.baseUsd)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">
                      {cat.commissionPct.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">
                      {formatUsd(cat.commissionUsd)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">
                      {formatUsd(cat.ivaNotasUsd)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-600 bg-slate-800/60 font-bold">
                  <td className="px-4 py-3 text-sm text-slate-100">Total</td>
                  <td className="px-4 py-3 text-sm text-slate-100 text-right tabular-nums">
                    {totals.units}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-100 text-right tabular-nums">
                    {formatUsd(totals.baseUsd)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-100 text-right tabular-nums">
                    &mdash;
                  </td>
                  <td className="px-4 py-3 text-sm text-emerald-400 text-right tabular-nums">
                    {formatUsd(totals.commissionUsd)}
                  </td>
                  <td className="px-4 py-3 text-sm text-emerald-400 text-right tabular-nums">
                    {formatUsd(totals.ivaNotasUsd)}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Summary card ---------- */

function SummaryCard({
  icon,
  label,
  value,
  valueClass,
  sub,
  border,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass: string;
  sub?: string;
  border?: string;
}) {
  return (
    <div className={`bg-slate-800/40 border ${border ?? 'border-slate-700/50'} rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

/* ---------- Component ---------- */

export default function CommissionsReportPage() {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  /* Sellers */
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [sellersLoading, setSellersLoading] = useState(true);

  /* Filters */
  const [sellerId, setSellerId] = useState('');
  const [dateFrom, setDateFrom] = useState(toDateString(firstOfMonth));
  const [dateTo, setDateTo] = useState(toDateString(now));

  /* Report data */
  const [report, setReport] = useState<CommissionReport | null>(null);
  const [allReport, setAllReport] = useState<AllCommissionReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'Comisiones | Trinity ERP'; }, []);

  /* Fetch sellers on mount */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/proxy/sellers');
        if (!res.ok) throw new Error('Error al cargar vendedores');
        const data = await res.json();
        const list: Seller[] = Array.isArray(data) ? data : data.data ?? [];
        setSellers(list);
        if (list.length > 0) setSellerId(list[0].id);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setSellersLoading(false);
      }
    })();
  }, []);

  /* Fetch report */
  const fetchReport = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    setError('');
    try {
      if (sellerId === ALL) {
        const res = await fetch(
          `/api/proxy/sellers/commission-report-all?from=${dateFrom}&to=${dateTo}`,
        );
        if (!res.ok) throw new Error('Error al cargar reporte de comisiones');
        const data: AllCommissionReport = await res.json();
        setAllReport(data);
        setReport(null);
      } else {
        const res = await fetch(
          `/api/proxy/sellers/${sellerId}/commission-report?from=${dateFrom}&to=${dateTo}`,
        );
        if (!res.ok) throw new Error('Error al cargar reporte de comisiones');
        const data: CommissionReport = await res.json();
        setReport(data);
        setAllReport(null);
      }
      setLoaded(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sellerId, dateFrom, dateTo]);

  /* Export PDF (server-generated) */
  const exportPdf = () => {
    if (!sellerId) return;
    const url =
      sellerId === ALL
        ? `/api/proxy/sellers/commission-report-all/pdf?from=${dateFrom}&to=${dateTo}`
        : `/api/proxy/sellers/${sellerId}/commission-report/pdf?from=${dateFrom}&to=${dateTo}`;
    window.open(url, '_blank');
  };

  const hasData = loaded && (report !== null || allReport !== null);

  return (
    <div className="p-6 space-y-6">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <BarChart3 className="text-green-400" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Reporte de comisiones</h1>
            <p className="text-sm text-slate-400">
              Resumen de ventas y comisiones por vendedor
            </p>
          </div>
        </div>
        {hasData && (
          <button
            onClick={exportPdf}
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Download size={16} />
            Exportar PDF
          </button>
        )}
      </div>

      {/* ---- Error ---- */}
      {error && (
        <div className="px-4 py-3 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400">
          {error}
        </div>
      )}

      {/* ---- Filters ---- */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Seller */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Vendedor</label>
            <select
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              disabled={sellersLoading}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500"
            >
              {sellersLoading && <option value="">Cargando...</option>}
              {!sellersLoading && <option value={ALL}>— Todos los vendedores —</option>}
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date from */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500"
            />
          </div>

          {/* Date to */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500"
            />
          </div>

          {/* Generate button */}
          <button
            onClick={fetchReport}
            disabled={loading || !sellerId}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
            Generar reporte
          </button>
        </div>
      </div>

      {/* ---- Single seller report ---- */}
      {loaded && report && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              icon={<DollarSign className="text-emerald-400" size={18} />}
              label="Total vendido USD"
              value={formatUsd(report.totalSoldUsd)}
              valueClass="text-emerald-400"
            />
            <SummaryCard
              icon={<TrendingUp className="text-green-400" size={18} />}
              label="Total comision USD"
              value={formatUsd(report.totalCommissionUsd)}
              valueClass="text-green-400"
            />
            <SummaryCard
              icon={<Receipt className="text-blue-400" size={18} />}
              label="Facturas"
              value={String(report.invoiceCount)}
              valueClass="text-blue-400"
            />
            <SummaryCard
              icon={<Building2 className="text-amber-400" size={18} />}
              label="Vendido al grupo"
              value={formatUsd(report.totalGroupSoldUsd)}
              valueClass="text-amber-400"
              sub={`${report.groupInvoiceCount} fact. · no comisiona`}
              border="border-amber-500/20"
            />
          </div>

          {/* Category breakdown */}
          <div>
            <h2 className="text-lg font-semibold text-slate-100 mb-3">Resumen por categoria</h2>
            <CategoryBreakdown categories={report.categories} />
          </div>

          {/* Invoice list */}
          <div>
            <h2 className="text-lg font-semibold text-slate-100 mb-3">Facturas cobradas</h2>
            {report.invoices.length === 0 ? (
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-8 text-center">
                <FileText className="mx-auto text-slate-600 mb-2" size={32} />
                <p className="text-sm text-slate-500">No hay facturas cobradas en este periodo</p>
              </div>
            ) : (
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="bg-slate-800/80 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                          # Factura
                        </th>
                        <th className="bg-slate-800/80 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                          Cliente
                        </th>
                        <th className="bg-slate-800/80 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                          Total USD
                        </th>
                        <th className="bg-slate-800/80 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                          Fecha cobro
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.invoices.map((inv) => (
                        <tr
                          key={inv.id}
                          className="border-t border-slate-700/30 hover:bg-slate-800/30"
                        >
                          <td className="px-4 py-3 text-sm text-slate-300 font-mono">{inv.number}</td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            <span className="inline-flex items-center gap-2">
                              {inv.customer?.name ?? 'Sin cliente'}
                              {inv.isGroup && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                  <Building2 size={10} />
                                  Grupo
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">
                            {formatUsd(inv.totalUsd)}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">{formatDate(inv.paidAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ---- All sellers report ---- */}
      {loaded && allReport && (
        <>
          {/* Grand total cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              icon={<DollarSign className="text-emerald-400" size={18} />}
              label="Total vendido USD"
              value={formatUsd(allReport.grandTotals.totalSoldUsd)}
              valueClass="text-emerald-400"
            />
            <SummaryCard
              icon={<TrendingUp className="text-green-400" size={18} />}
              label="Total comision USD"
              value={formatUsd(allReport.grandTotals.totalCommissionUsd)}
              valueClass="text-green-400"
            />
            <SummaryCard
              icon={<Users className="text-blue-400" size={18} />}
              label="Vendedores"
              value={String(allReport.grandTotals.sellerCount)}
              valueClass="text-blue-400"
              sub={`${allReport.grandTotals.invoiceCount} fact.`}
            />
            <SummaryCard
              icon={<Building2 className="text-amber-400" size={18} />}
              label="Vendido al grupo"
              value={formatUsd(allReport.grandTotals.totalGroupSoldUsd)}
              valueClass="text-amber-400"
              sub={`${allReport.grandTotals.groupInvoiceCount} fact. · no comisiona`}
              border="border-amber-500/20"
            />
          </div>

          {allReport.sellers.length === 0 ? (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-8 text-center">
              <FileText className="mx-auto text-slate-600 mb-2" size={32} />
              <p className="text-sm text-slate-500">No hay ventas de vendedores en este periodo</p>
            </div>
          ) : (
            allReport.sellers.map((s) => (
              <div key={s.sellerId}>
                <div className="flex items-baseline gap-2 mb-3">
                  <h2 className="text-lg font-semibold text-slate-100">{s.sellerName}</h2>
                  <span className="text-xs text-slate-500 font-mono">{s.sellerCode}</span>
                  <span className="ml-auto text-sm text-green-400 font-semibold tabular-nums">
                    Comision: {formatUsd(s.totalCommissionUsd)}
                  </span>
                </div>
                <CategoryBreakdown categories={s.categories} />
                {s.groupInvoiceCount > 0 && (
                  <p className="text-xs text-amber-400 mt-2">
                    Vendido al grupo (no comisiona): {formatUsd(s.totalGroupSoldUsd)} ({s.groupInvoiceCount} fact.)
                  </p>
                )}
              </div>
            ))
          )}
        </>
      )}

      {/* ---- Empty state before generating ---- */}
      {!loaded && !loading && (
        <div className="text-center py-16">
          <BarChart3 className="mx-auto text-slate-600 mb-3" size={40} />
          <p className="text-slate-500 text-sm">
            Selecciona un vendedor y rango de fechas, luego presiona &quot;Generar reporte&quot;
          </p>
        </div>
      )}
    </div>
  );
}
