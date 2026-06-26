'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Loader2, Search, FileDown, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { MetricsHelpButton } from '@/components/metrics-help-modal';

type Nivel = 'RECIEN_INGRESADO' | 'NUEVO_SIN_ROTACION' | 'STOCK_MUERTO';
interface AlertItem {
  productId: string; productCode: string; productName: string; category: string;
  supplierId: string | null; supplierName: string;
  currentStock: number; minStock: number; costUsd: number; inventoryValueUsd: number;
  lastEntryDate: string; lastEntrySource: 'PURCHASE' | 'CREATED';
  daysSinceEntry: number; soldSinceEntry: boolean; periodSales: number; daysOfInventory: number;
  alerts: { agotado: boolean; bajoMinimo: boolean; sinRotacion: Nivel | null; exceso: boolean };
}

type ReportKey = 'agotados' | 'bajo-minimo' | 'sin-rotacion' | 'exceso' | 'todos';

const REPORTS: { key: ReportKey; label: string }[] = [
  { key: 'agotados', label: 'Agotados' },
  { key: 'bajo-minimo', label: 'Bajo mínimo' },
  { key: 'sin-rotacion', label: 'Sin rotación' },
  { key: 'exceso', label: 'Exceso' },
  { key: 'todos', label: 'Todos' },
];

const NIVEL_BADGE: Record<Nivel, { label: string; cls: string }> = {
  RECIEN_INGRESADO: { label: 'Recién ingresado', cls: 'bg-slate-500/10 text-slate-300 border-slate-500/20' },
  NUEVO_SIN_ROTACION: { label: 'Nuevo sin rotación', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  STOCK_MUERTO: { label: 'Stock muerto', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

function matchesReport(it: AlertItem, r: ReportKey): boolean {
  switch (r) {
    case 'agotados': return it.alerts.agotado;
    case 'bajo-minimo': return it.alerts.bajoMinimo;
    case 'sin-rotacion': return !!it.alerts.sinRotacion;
    case 'exceso': return it.alerts.exceso;
    default: return it.alerts.agotado || it.alerts.bajoMinimo || !!it.alerts.sinRotacion || it.alerts.exceso;
  }
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function InventoryAlertsPage() {
  const [period, setPeriod] = useState<'30' | '60' | '90'>('30');
  const [report, setReport] = useState<ReportKey>('agotados');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AlertItem[]>([]);

  useEffect(() => { document.title = 'Alertas de Inventario | Trinity ERP'; }, []);

  function getRange() {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - Number(period));
    const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { from: f(from), to: f(to) };
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = getRange();
      const res = await fetch(`/api/proxy/inventory-analysis/alerts?from=${from}&to=${to}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  useEffect(() => { load(); }, [load]);

  function estadoTexto(it: AlertItem): string {
    if (it.alerts.agotado) return 'Agotado';
    if (it.alerts.sinRotacion) return NIVEL_BADGE[it.alerts.sinRotacion].label;
    if (it.alerts.exceso) return `Exceso (${it.daysOfInventory} d)`;
    if (it.alerts.bajoMinimo) return 'Bajo mínimo';
    return '';
  }

  const filtered = items
    .filter((it) => matchesReport(it, report))
    .filter((it) => !search || it.productCode.toLowerCase().includes(search.toLowerCase()) || it.productName.toLowerCase().includes(search.toLowerCase()));

  function exportExcel() {
    const aoa: (string | number)[][] = [
      ['Código', 'Producto', 'Proveedor', 'Stock', 'Mínimo', 'Última entrada', 'Días', 'Estado'],
      ...filtered.map((it) => [
        it.productCode, it.productName, it.supplierName, it.currentStock, it.minStock,
        fmtDate(it.lastEntryDate), it.daysSinceEntry, estadoTexto(it),
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Alertas');
    XLSX.writeFile(wb, `alertas-${report}.xlsx`);
  }

  function exportPdf() {
    const { from, to } = getRange();
    window.open(`/api/proxy/inventory-analysis/alerts/pdf?from=${from}&to=${to}&report=${report}`, '_blank');
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="text-red-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Alertas de Inventario</h1>
            <p className="text-slate-400 text-sm">Agotados, bajo mínimo, sin rotación y exceso</p>
          </div>
        </div>
        <MetricsHelpButton metricKeys={['agotado', 'bajoMinimo', 'sinRotacion', 'exceso', 'valorInventario']} />
      </div>

      {/* Controls */}
      <div className="card p-4 mb-6 flex flex-wrap items-center gap-3">
        {/* Report selector */}
        <div className="flex flex-wrap gap-2">
          {REPORTS.map((r) => (
            <button
              key={r.key}
              onClick={() => setReport(r.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${report === r.key ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-700 border border-transparent'}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Period (relevant for excess) */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-500">Período (exceso):</span>
          {(['30', '60', '90'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setPeriod(d)}
              className={`px-2.5 py-1 rounded text-xs font-medium ${period === d ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Search + exports */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código o nombre..."
            className="input-field !pl-9 w-full"
          />
        </div>
        <span className="text-xs text-slate-500">{filtered.length} artículos</span>
        <button onClick={exportExcel} className="btn-secondary !py-1.5 text-sm flex items-center gap-2">
          <FileDown size={16} /> Excel
        </button>
        <button onClick={exportPdf} className="btn-secondary !py-1.5 text-sm flex items-center gap-2">
          <FileText size={16} /> PDF
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-emerald-500" size={32} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-3 py-3 text-slate-400 font-medium">Código</th>
                  <th className="text-left px-3 py-3 text-slate-400 font-medium">Producto</th>
                  <th className="text-left px-3 py-3 text-slate-400 font-medium">Proveedor</th>
                  <th className="text-right px-3 py-3 text-slate-400 font-medium">Stock</th>
                  <th className="text-right px-3 py-3 text-slate-400 font-medium">Mín.</th>
                  <th className="text-left px-3 py-3 text-slate-400 font-medium">Últ. entrada</th>
                  <th className="text-right px-3 py-3 text-slate-400 font-medium">Días</th>
                  <th className="text-left px-3 py-3 text-slate-400 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-slate-500">Sin artículos en este reporte</td></tr>
                ) : filtered.map((it) => (
                  <tr key={it.productId} className="border-b border-slate-700/30 hover:bg-slate-800/40">
                    <td className="px-3 py-2.5 font-mono text-xs text-emerald-400">{it.productCode}</td>
                    <td className="px-3 py-2.5 text-white">{it.productName}</td>
                    <td className="px-3 py-2.5 text-slate-400 text-xs">{it.supplierName}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${it.currentStock <= it.minStock ? 'text-red-400' : 'text-slate-300'}`}>{it.currentStock}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-500">{it.minStock}</td>
                    <td className="px-3 py-2.5 text-slate-400 text-xs">
                      {fmtDate(it.lastEntryDate)}{it.lastEntrySource === 'CREATED' && <span className="text-slate-600"> (creado)</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-300">{it.daysSinceEntry}</td>
                    <td className="px-3 py-2.5">
                      {it.alerts.agotado && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/20">Agotado</span>}
                      {it.alerts.sinRotacion && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${NIVEL_BADGE[it.alerts.sinRotacion].cls}`}>{NIVEL_BADGE[it.alerts.sinRotacion].label}</span>}
                      {it.alerts.exceso && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/20">Exceso</span>}
                      {!it.alerts.agotado && !it.alerts.sinRotacion && it.alerts.bajoMinimo && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">Bajo mínimo</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
