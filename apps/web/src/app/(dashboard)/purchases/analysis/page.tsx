'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3, Loader2, Package, AlertTriangle, TrendingUp,
  ShoppingCart, Search, Filter, ArrowUpDown,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MetricsHelpButton } from '@/components/metrics-help-modal';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts';

// ───── types ─────
interface AbcProduct {
  productId: string; productCode: string; productName: string; category: string;
  classification: 'A' | 'B' | 'C'; totalSalesUsd: number; totalUnitsSold: number;
  salesPct: number; cumulativePct: number; currentStock: number; minStock: number;
  costUsd: number; priceDetal: number; grossMarginPct: number; inventoryValueUsd: number;
}
interface RotationProduct {
  productId: string; productCode: string; productName: string; category: string;
  currentStock: number; minStock: number; unitsSold: number; rotationRate: number;
  daysOfInventory: number; dailySalesAvg: number; costUsd: number; inventoryValueUsd: number;
  reorderAlert: boolean; deadStockAlert: boolean; excessStockAlert: boolean;
}
interface ProfitProduct {
  productId: string; productCode: string; productName: string; category: string;
  revenue: number; cost: number; grossProfit: number; grossMarginPct: number; unitsSold: number;
}
interface Summary {
  totalProducts: number;
  classA: { count: number; salesPct: number };
  classB: { count: number; salesPct: number };
  classC: { count: number; salesPct: number };
  totalInventoryValueUsd: number;
  productsWithAlert: number;
  deadStockProducts: number;
  excessStockProducts: number;
  topProduct: { name: string; salesUsd: number } | null;
  mostProfitable: { name: string; marginPct: number } | null;
}
interface SupplierGroup {
  supplierId: string | null; supplierName: string;
  items: { productId: string; productCode: string; productName: string; currentStock: number; minStock: number; suggestedQty: number; costUsd: number; estimatedCost: number }[];
  totalEstimated: number;
}
interface PurchaseSuggestions { suppliers: SupplierGroup[]; grandTotal: number; }

const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'];
const ABC_COLORS: Record<string, string> = { A: '#10b981', B: '#3b82f6', C: '#64748b' };
const ABC_BADGES: Record<string, string> = {
  A: 'bg-green-500/10 text-green-400 border-green-500/20',
  B: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  C: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

function fmtUsd(n: number) { return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export default function InventoryAnalysisPage() {
  const router = useRouter();

  // ── Period selector ──
  const [periodType, setPeriodType] = useState<'30' | '60' | '90' | 'custom'>('30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // ── Data ──
  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [abcData, setAbcData] = useState<AbcProduct[]>([]);
  const [rotationData, setRotationData] = useState<RotationProduct[]>([]);
  const [profitData, setProfitData] = useState<ProfitProduct[]>([]);
  const [suggestions, setSuggestions] = useState<PurchaseSuggestions | null>(null);

  // ── Filters ──
  const [abcFilter, setAbcFilter] = useState<'ALL' | 'A' | 'B' | 'C'>('ALL');
  const [rotationAlertsOnly, setRotationAlertsOnly] = useState(false);

  useEffect(() => { document.title = 'Analisis de Inventario | Trinity ERP'; }, []);

  function getDateRange(): { from: string; to: string } {
    if (periodType === 'custom') return { from: customFrom, to: customTo };
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - Number(periodType));
    return {
      from: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`,
      to: `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, '0')}-${String(to.getDate()).padStart(2, '0')}`,
    };
  }

  const analyze = useCallback(async () => {
    const { from, to } = getDateRange();
    if (!from || !to) return;
    setLoading(true);
    setAnalyzed(false);

    try {
      const qs = `from=${from}&to=${to}`;
      const [sumRes, abcRes, rotRes, profRes, sugRes] = await Promise.all([
        fetch(`/api/proxy/inventory-analysis/summary?${qs}`),
        fetch(`/api/proxy/inventory-analysis/abc?${qs}`),
        fetch(`/api/proxy/inventory-analysis/rotation?${qs}`),
        fetch(`/api/proxy/inventory-analysis/profitability?${qs}`),
        fetch(`/api/proxy/inventory-analysis/purchase-suggestions?${qs}`),
      ]);

      if (sumRes.ok) setSummary(await sumRes.json());
      if (abcRes.ok) setAbcData(await abcRes.json());
      if (rotRes.ok) setRotationData(await rotRes.json());
      if (profRes.ok) setProfitData(await profRes.json());
      if (sugRes.ok) setSuggestions(await sugRes.json());
      setAnalyzed(true);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodType, customFrom, customTo]);

  // Auto-analyze on mount
  useEffect(() => { analyze(); }, [analyze]);

  // ── Filtered data ──
  const filteredAbc = abcFilter === 'ALL' ? abcData : abcData.filter(p => p.classification === abcFilter);
  const filteredRotation = rotationAlertsOnly
    ? rotationData.filter(p => p.reorderAlert || p.deadStockAlert || p.excessStockAlert)
    : rotationData;

  // ── Chart data ──
  const abcChartData = [
    { name: 'Clase A', value: summary?.classA.salesPct || 0, count: summary?.classA.count || 0, fill: ABC_COLORS.A },
    { name: 'Clase B', value: summary?.classB.salesPct || 0, count: summary?.classB.count || 0, fill: ABC_COLORS.B },
    { name: 'Clase C', value: summary?.classC.salesPct || 0, count: summary?.classC.count || 0, fill: ABC_COLORS.C },
  ];

  const topProfitChart = profitData.slice(0, 10);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <BarChart3 className="text-emerald-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Analisis de Inventario</h1>
            <p className="text-slate-400 text-sm">Clasificacion ABC, rotacion y rentabilidad</p>
          </div>
        </div>
        <MetricsHelpButton metricKeys={['abc', 'rotacion', 'diasInventario', 'rentabilidad', 'margen', 'valorInventario', 'sugerenciaCompra']} />
      </div>

      {/* Period selector */}
      <div className="card p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-400 font-medium">Periodo:</span>
          {(['30', '60', '90'] as const).map(d => (
            <button
              key={d}
              onClick={() => setPeriodType(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${periodType === d ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-700 border border-transparent'}`}
            >
              {d} dias
            </button>
          ))}
          <button
            onClick={() => setPeriodType('custom')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${periodType === 'custom' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-700 border border-transparent'}`}
          >
            Personalizado
          </button>

          {periodType === 'custom' && (
            <>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="input-field !py-1.5 !w-auto text-sm" />
              <span className="text-slate-500">a</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="input-field !py-1.5 !w-auto text-sm" />
            </>
          )}

          <button
            onClick={analyze}
            disabled={loading}
            className="btn-primary !py-1.5 text-sm flex items-center gap-2 ml-auto"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
            Analizar
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-emerald-500" size={32} />
        </div>
      )}

      {/* Results */}
      {!loading && analyzed && summary && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10"><Package className="text-emerald-400" size={20} /></div>
                <div>
                  <p className="text-xs text-slate-500 uppercase">Productos analizados</p>
                  <p className="text-2xl font-bold text-white">{summary.totalProducts}</p>
                </div>
              </div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10"><TrendingUp className="text-blue-400" size={20} /></div>
                <div>
                  <p className="text-xs text-slate-500 uppercase">Valor inventario</p>
                  <p className="text-2xl font-bold text-white">{fmtUsd(summary.totalInventoryValueUsd)}</p>
                </div>
              </div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10"><AlertTriangle className="text-red-400" size={20} /></div>
                <div>
                  <p className="text-xs text-slate-500 uppercase">Con alerta stock</p>
                  <p className="text-2xl font-bold text-white">{summary.productsWithAlert}
                    {summary.productsWithAlert > 0 && <span className="text-xs ml-1.5 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">{summary.productsWithAlert}</span>}
                  </p>
                </div>
              </div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10"><Package className="text-amber-400" size={20} /></div>
                <div>
                  <p className="text-xs text-slate-500 uppercase">Stock muerto</p>
                  <p className="text-2xl font-bold text-white">{summary.deadStockProducts}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="abc">
            <TabsList>
              <TabsTrigger value="abc">Clasificacion ABC</TabsTrigger>
              <TabsTrigger value="rotation">Rotacion</TabsTrigger>
              <TabsTrigger value="profitability">Rentabilidad</TabsTrigger>
              <TabsTrigger value="suggestions">Sugerencias de compra</TabsTrigger>
            </TabsList>

            {/* ═══ TAB: ABC ═══ */}
            <TabsContent value="abc">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                {/* Bar chart */}
                <div className="card p-4 lg:col-span-2">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Ventas USD por clasificacion</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={abcChartData}>
                      <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickFormatter={v => `${v}%`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                        labelStyle={{ color: '#e2e8f0' }}
                        itemStyle={{ color: '#e2e8f0' }}
                        formatter={(value: any, _name: any, props: any) => [`${Number(value).toFixed(1)}% (${props.payload.count} productos)`, '% de ventas']}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {abcChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Pie summary */}
                <div className="card p-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Distribucion</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={abcChartData} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3}>
                        {abcChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} labelStyle={{ color: '#e2e8f0' }} itemStyle={{ color: '#e2e8f0' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-2">
                    {abcChartData.map(d => (
                      <div key={d.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.fill }} />
                          <span className="text-slate-300">{d.name}</span>
                        </div>
                        <span className="text-slate-400">{d.count} prod. ({d.value.toFixed(1)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ABC Filter */}
              <div className="flex items-center gap-2 mb-3">
                <Filter size={14} className="text-slate-500" />
                {(['ALL', 'A', 'B', 'C'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setAbcFilter(f)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${abcFilter === f ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    {f === 'ALL' ? 'Todos' : `Clase ${f}`}
                  </button>
                ))}
                <span className="text-xs text-slate-500 ml-2">{filteredAbc.length} productos</span>
              </div>

              {/* ABC table */}
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="text-center px-3 py-3 text-slate-400 font-medium w-16">Clase</th>
                        <th className="text-left px-3 py-3 text-slate-400 font-medium">Codigo</th>
                        <th className="text-left px-3 py-3 text-slate-400 font-medium">Producto</th>
                        <th className="text-left px-3 py-3 text-slate-400 font-medium">Categoria</th>
                        <th className="text-right px-3 py-3 text-slate-400 font-medium">Ventas USD</th>
                        <th className="text-right px-3 py-3 text-slate-400 font-medium">Uds.</th>
                        <th className="text-right px-3 py-3 text-slate-400 font-medium">% total</th>
                        <th className="text-right px-3 py-3 text-slate-400 font-medium">% acum.</th>
                        <th className="text-right px-3 py-3 text-slate-400 font-medium">Stock</th>
                        <th className="text-right px-3 py-3 text-slate-400 font-medium" title="Basado en precio y costo actual del producto">Margen teórico</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAbc.length === 0 ? (
                        <tr><td colSpan={10} className="text-center py-8 text-slate-500">Sin datos para el periodo seleccionado</td></tr>
                      ) : filteredAbc.map(p => (
                        <tr key={p.productId} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                          <td className="px-3 py-2.5 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${ABC_BADGES[p.classification]}`}>{p.classification}</span>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-emerald-400">{p.productCode}</td>
                          <td className="px-3 py-2.5 text-white">{p.productName}</td>
                          <td className="px-3 py-2.5 text-slate-400 text-xs">{p.category}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-white">{fmtUsd(p.totalSalesUsd)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-300">{p.totalUnitsSold}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-300">{p.salesPct.toFixed(1)}%</td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-400">{p.cumulativePct.toFixed(1)}%</td>
                          <td className={`px-3 py-2.5 text-right font-mono ${p.currentStock <= p.minStock ? 'text-red-400' : 'text-slate-300'}`}>{p.currentStock}</td>
                          <td className={`px-3 py-2.5 text-right font-mono ${p.grossMarginPct >= 30 ? 'text-green-400' : p.grossMarginPct >= 15 ? 'text-amber-400' : 'text-red-400'}`}>{p.grossMarginPct.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* ═══ TAB: Rotacion ═══ */}
            <TabsContent value="rotation">
              <div className="flex items-center gap-3 mb-4">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rotationAlertsOnly}
                    onChange={e => setRotationAlertsOnly(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500/40"
                  />
                  Solo con alertas
                </label>
                <span className="text-xs text-slate-500">{filteredRotation.length} productos</span>
              </div>

              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="text-left px-3 py-3 text-slate-400 font-medium">Codigo</th>
                        <th className="text-left px-3 py-3 text-slate-400 font-medium">Producto</th>
                        <th className="text-right px-3 py-3 text-slate-400 font-medium">Stock</th>
                        <th className="text-right px-3 py-3 text-slate-400 font-medium">Min.</th>
                        <th className="text-right px-3 py-3 text-slate-400 font-medium">Ventas periodo</th>
                        <th className="text-right px-3 py-3 text-slate-400 font-medium">Rotacion</th>
                        <th className="text-right px-3 py-3 text-slate-400 font-medium">Dias inv.</th>
                        <th className="text-right px-3 py-3 text-slate-400 font-medium">Vta/dia</th>
                        <th className="text-left px-3 py-3 text-slate-400 font-medium">Alerta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRotation.length === 0 ? (
                        <tr><td colSpan={9} className="text-center py-8 text-slate-500">Sin datos</td></tr>
                      ) : filteredRotation.map(p => (
                        <tr key={p.productId} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                          <td className="px-3 py-2.5 font-mono text-xs text-emerald-400">{p.productCode}</td>
                          <td className="px-3 py-2.5 text-white">{p.productName}</td>
                          <td className={`px-3 py-2.5 text-right font-mono ${p.currentStock <= p.minStock ? 'text-red-400' : 'text-slate-300'}`}>{p.currentStock}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-500">{p.minStock}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-300">{p.unitsSold}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-white">{p.rotationRate.toFixed(1)}x</td>
                          <td className={`px-3 py-2.5 text-right font-mono font-semibold ${p.daysOfInventory > 180 ? 'text-amber-400' : p.daysOfInventory < 15 ? 'text-red-400' : 'text-white'}`}>
                            {p.daysOfInventory > 9000 ? '∞' : p.daysOfInventory}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-400">{p.dailySalesAvg.toFixed(1)}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex gap-1 flex-wrap">
                              {p.reorderAlert && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">Stock bajo</span>}
                              {p.excessStockAlert && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Exceso</span>}
                              {p.deadStockAlert && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 border border-slate-500/20">Sin movimiento</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* ═══ TAB: Rentabilidad ═══ */}
            <TabsContent value="profitability">
              {/* Top 10 chart */}
              {topProfitChart.length > 0 && (
                <div className="card p-4 mb-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Top 10 mas rentables</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topProfitChart} layout="vertical" margin={{ left: 140, right: 20, top: 5, bottom: 5 }}>
                      <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickFormatter={v => `$${v}`} />
                      <YAxis type="category" dataKey="productName" tick={{ fill: '#cbd5e1', fontSize: 11 }} width={130} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                        labelStyle={{ color: '#e2e8f0' }}
                        itemStyle={{ color: '#e2e8f0' }}
                        formatter={(value: any) => [fmtUsd(Number(value)), 'Ganancia']}
                      />
                      <Bar dataKey="grossProfit" radius={[0, 4, 4, 0]}>
                        {topProfitChart.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Profit table */}
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="text-left px-3 py-3 text-slate-400 font-medium">Codigo</th>
                        <th className="text-left px-3 py-3 text-slate-400 font-medium">Producto</th>
                        <th className="text-left px-3 py-3 text-slate-400 font-medium">Categoria</th>
                        <th className="text-right px-3 py-3 text-slate-400 font-medium">Ventas USD</th>
                        <th className="text-right px-3 py-3 text-slate-400 font-medium">Costo USD</th>
                        <th className="text-right px-3 py-3 text-slate-400 font-medium">Ganancia USD</th>
                        <th className="text-right px-3 py-3 text-slate-400 font-medium">Margen%</th>
                        <th className="text-right px-3 py-3 text-slate-400 font-medium">Uds.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitData.length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-8 text-slate-500">Sin datos</td></tr>
                      ) : profitData.map(p => (
                        <tr key={p.productId} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                          <td className="px-3 py-2.5 font-mono text-xs text-emerald-400">{p.productCode}</td>
                          <td className="px-3 py-2.5 text-white">{p.productName}</td>
                          <td className="px-3 py-2.5 text-slate-400 text-xs">{p.category}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-white">{fmtUsd(p.revenue)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-400">{fmtUsd(p.cost)}</td>
                          <td className={`px-3 py-2.5 text-right font-mono font-semibold ${p.grossProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtUsd(p.grossProfit)}</td>
                          <td className={`px-3 py-2.5 text-right font-mono ${p.grossMarginPct >= 30 ? 'text-green-400' : p.grossMarginPct >= 15 ? 'text-amber-400' : 'text-red-400'}`}>{p.grossMarginPct.toFixed(1)}%</td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-300">{p.unitsSold}</td>
                        </tr>
                      ))}
                    </tbody>
                    {profitData.length > 0 && (
                      <tfoot>
                        <tr className="border-t border-slate-700/50 bg-slate-800/30">
                          <td colSpan={3} className="px-3 py-3 text-slate-300 font-semibold">Total</td>
                          <td className="px-3 py-3 text-right font-mono text-white font-semibold">{fmtUsd(profitData.reduce((s, p) => s + p.revenue, 0))}</td>
                          <td className="px-3 py-3 text-right font-mono text-slate-400">{fmtUsd(profitData.reduce((s, p) => s + p.cost, 0))}</td>
                          <td className="px-3 py-3 text-right font-mono text-green-400 font-semibold">{fmtUsd(profitData.reduce((s, p) => s + p.grossProfit, 0))}</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* ═══ TAB: Sugerencias de compra ═══ */}
            <TabsContent value="suggestions">
              {!suggestions || suggestions.suppliers.length === 0 ? (
                <div className="card p-8 text-center text-slate-500">
                  No hay productos bajo stock minimo en este periodo
                </div>
              ) : (
                <div className="space-y-4">
                  {suggestions.suppliers.map(group => (
                    <div key={group.supplierId || '__none__'} className="card overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50 border-b border-slate-700/50">
                        <div className="flex items-center gap-2">
                          <ShoppingCart size={16} className="text-emerald-400" />
                          <span className="text-white font-semibold">{group.supplierName}</span>
                          <span className="text-xs text-slate-500">({group.items.length} productos)</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-mono text-emerald-400 font-semibold">{fmtUsd(group.totalEstimated)}</span>
                          {group.supplierId && (
                            <button
                              onClick={() => router.push(`/purchases/new?supplierId=${group.supplierId}`)}
                              className="btn-primary !py-1 !px-3 text-xs flex items-center gap-1"
                            >
                              <ShoppingCart size={12} /> Crear orden
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-700/30">
                              <th className="text-left px-4 py-2 text-slate-400 font-medium text-xs">Codigo</th>
                              <th className="text-left px-4 py-2 text-slate-400 font-medium text-xs">Producto</th>
                              <th className="text-right px-4 py-2 text-slate-400 font-medium text-xs">Stock</th>
                              <th className="text-right px-4 py-2 text-slate-400 font-medium text-xs">Min.</th>
                              <th className="text-right px-4 py-2 text-slate-400 font-medium text-xs">Sugerido</th>
                              <th className="text-right px-4 py-2 text-slate-400 font-medium text-xs">Costo unit.</th>
                              <th className="text-right px-4 py-2 text-slate-400 font-medium text-xs">Costo total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.items.map(item => (
                              <tr key={item.productId} className="border-b border-slate-700/20 hover:bg-slate-800/30">
                                <td className="px-4 py-2 font-mono text-xs text-emerald-400">{item.productCode}</td>
                                <td className="px-4 py-2 text-white">{item.productName}</td>
                                <td className="px-4 py-2 text-right font-mono text-red-400">{item.currentStock}</td>
                                <td className="px-4 py-2 text-right font-mono text-slate-500">{item.minStock}</td>
                                <td className="px-4 py-2 text-right font-mono text-white font-semibold">{item.suggestedQty}</td>
                                <td className="px-4 py-2 text-right font-mono text-slate-300">{fmtUsd(item.costUsd)}</td>
                                <td className="px-4 py-2 text-right font-mono text-white">{fmtUsd(item.estimatedCost)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}

                  {/* Grand total */}
                  <div className="card p-4 flex items-center justify-between">
                    <span className="text-slate-300 font-semibold">Inversion total estimada</span>
                    <span className="text-2xl font-mono font-bold text-emerald-400">{fmtUsd(suggestions.grandTotal)}</span>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* No data state */}
      {!loading && !analyzed && (
        <div className="card p-12 text-center">
          <BarChart3 size={48} className="text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">Selecciona un periodo y presiona "Analizar"</p>
        </div>
      )}
    </div>
  );
}
