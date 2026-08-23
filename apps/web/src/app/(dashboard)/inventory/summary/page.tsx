'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  BarChart3, Loader2, ClipboardCheck, AlertTriangle, PackageX, TrendingDown,
  Boxes, ClipboardCheck as ClipboardIcon, ScanLine,
} from 'lucide-react';

interface Summary {
  period: { from: string; to: string };
  salud: {
    audit5sAvg: number | null;
    audit5sCount: number;
    audit5sByZone: { zone: string; avgIndex: number; count: number }[];
    damage: {
      totalReports: number;
      byStatus: Record<string, number>;
      damagedUnits: number;
      mermaCount: number;
      mermaUnits: number;
      mermaCostUsd: number;
      reemplazoCount: number;
    };
  };
  alertasRotacion: {
    totalInventoryValueUsd: number;
    lowStockCount: number;
    deadStockCount: number;
    topLowStock: { code: string; name: string; stock: number; minStock: number }[];
    topDeadStock: { code: string; name: string; stock: number; valueUsd: number }[];
  };
  exactitud: null | {
    date: string; warehouse: string | null;
    itemsCounted: number; withDiff: number;
    faltUnits: number; sobrUnits: number;
    faltUsd: number; sobrUsd: number; netUsd: number;
  };
}

function idxColor(idx: number) {
  if (idx >= 90) return 'text-green-400';
  if (idx >= 75) return 'text-amber-400';
  return 'text-red-400';
}
function idxBadge(idx: number) {
  if (idx >= 90) return 'bg-green-500/10 text-green-400 border-green-500/30';
  if (idx >= 75) return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  return 'bg-red-500/10 text-red-400 border-red-500/30';
}
const usd = (n: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function rangeFor(preset: 'hoy' | 'semana' | 'mes'): { from: string; to: string } {
  const now = new Date();
  const to = ymd(now);
  if (preset === 'hoy') return { from: to, to };
  if (preset === 'semana') { const f = new Date(now); f.setDate(f.getDate() - 6); return { from: ymd(f), to }; }
  return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to };
}

function Stat({ label, value, sub, tone = 'default' }: { label: string; value: string; sub?: string; tone?: 'default' | 'red' | 'green' | 'amber' }) {
  const toneCls = tone === 'red' ? 'text-red-400' : tone === 'green' ? 'text-green-400' : tone === 'amber' ? 'text-amber-400' : 'text-white';
  return (
    <div className="card p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-bold ${toneCls}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

const PRESETS: { key: 'hoy' | 'semana' | 'mes'; label: string }[] = [
  { key: 'hoy', label: 'Hoy' }, { key: 'semana', label: '7 días' }, { key: 'mes', label: 'Este mes' },
];

export default function InventorySummaryPage() {
  const [preset, setPreset] = useState<'hoy' | 'semana' | 'mes'>('mes');
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = 'Resumen de inventario | Trinity ERP'; }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = rangeFor(preset);
      const res = await fetch(`/api/proxy/inventory-analysis/manager-summary?from=${from}&to=${to}`);
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [preset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <BarChart3 className="text-green-400" size={24} />
          <div>
            <h1 className="text-xl font-bold text-white">Resumen de inventario</h1>
            <p className="text-sm text-slate-400">Panorama operativo para gerencia.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => setPreset(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${preset === p.key ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'text-slate-400 border-slate-700/50 hover:bg-slate-800/60'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading || !data ? (
        <div className="p-12 text-center text-slate-500"><Loader2 className="animate-spin inline" size={24} /></div>
      ) : (
        <>
          {/* ── Bloque 1: Salud operativa (5S + daños) ── */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2"><ClipboardCheck size={16} /> Salud operativa</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="card p-4">
                <p className="text-xs text-slate-500">Índice 5S promedio</p>
                {data.salud.audit5sAvg === null
                  ? <p className="text-2xl font-bold text-slate-600">—</p>
                  : <p className={`text-2xl font-bold ${idxColor(data.salud.audit5sAvg)}`}>{data.salud.audit5sAvg}%</p>}
                <p className="text-xs text-slate-500 mt-0.5">{data.salud.audit5sCount} auditoría(s)</p>
              </div>
              <Stat label="Reportes de daño" value={String(data.salud.damage.totalReports)} sub={`${data.salud.damage.damagedUnits} u. dañadas`} tone={data.salud.damage.totalReports ? 'amber' : 'default'} />
              <Stat label="Merma (pérdida)" value={usd(data.salud.damage.mermaCostUsd)} sub={`${data.salud.damage.mermaCount} reporte(s) · ${data.salud.damage.mermaUnits} u.`} tone={data.salud.damage.mermaCostUsd > 0 ? 'red' : 'default'} />
              <Stat label="Resueltos por reemplazo" value={String(data.salud.damage.reemplazoCount)} tone="green" />
            </div>
            {data.salud.audit5sByZone.length > 0 && (
              <div className="card p-4">
                <p className="text-xs text-slate-500 mb-2">Índice 5S por zona</p>
                <div className="flex flex-wrap gap-2">
                  {data.salud.audit5sByZone.map((z) => (
                    <span key={z.zone} className={`px-2.5 py-1 rounded-lg text-xs border ${idxBadge(z.avgIndex)}`}>
                      {z.zone}: <b>{z.avgIndex}%</b> <span className="opacity-60">({z.count})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {data.salud.audit5sCount === 0 && data.salud.damage.totalReports === 0 && (
              <p className="text-xs text-slate-600">Sin actividad del módulo de almacén en el período.</p>
            )}
          </section>

          {/* ── Bloque 2: Alertas y rotación ── */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2"><AlertTriangle size={16} /> Alertas y rotación</h2>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Bajo mínimo / quiebre" value={String(data.alertasRotacion.lowStockCount)} tone={data.alertasRotacion.lowStockCount ? 'red' : 'green'} />
              <Stat label="Stock muerto (sin ventas)" value={String(data.alertasRotacion.deadStockCount)} tone={data.alertasRotacion.deadStockCount ? 'amber' : 'green'} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="card p-0 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-700/50 flex items-center gap-2 text-xs font-semibold text-slate-300"><TrendingDown size={14} className="text-red-400" /> Top bajo mínimo</div>
                {data.alertasRotacion.topLowStock.length === 0
                  ? <p className="p-4 text-xs text-slate-500">Nada bajo mínimo.</p>
                  : data.alertasRotacion.topLowStock.map((p) => (
                    <div key={p.code} className="px-4 py-2 border-b border-slate-700/20 last:border-0 flex items-center gap-3 text-sm">
                      <span className="font-mono text-xs text-slate-500 whitespace-nowrap">{p.code}</span>
                      <span className="text-white flex-1 break-words">{p.name}</span>
                      <span className="text-xs text-red-400 whitespace-nowrap">{p.stock} / mín {p.minStock}</span>
                    </div>
                  ))}
              </div>
              <div className="card p-0 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-700/50 flex items-center gap-2 text-xs font-semibold text-slate-300"><PackageX size={14} className="text-amber-400" /> Top stock muerto (por valor)</div>
                {data.alertasRotacion.topDeadStock.length === 0
                  ? <p className="p-4 text-xs text-slate-500">Sin stock muerto.</p>
                  : data.alertasRotacion.topDeadStock.map((p) => (
                    <div key={p.code} className="px-4 py-2 border-b border-slate-700/20 last:border-0 flex items-center gap-3 text-sm">
                      <span className="font-mono text-xs text-slate-500 whitespace-nowrap">{p.code}</span>
                      <span className="text-white flex-1 break-words">{p.name}</span>
                      <span className="text-xs text-amber-400 whitespace-nowrap">{usd(p.valueUsd)}</span>
                    </div>
                  ))}
              </div>
            </div>
            <p className="text-xs text-slate-600">
              Ver detalle en <Link href="/inventory/alerts" className="text-green-400 hover:underline">Alertas de inventario</Link>.
            </p>
          </section>

          {/* ── Bloque 3: Exactitud (conteo físico) ── */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2"><ScanLine size={16} /> Exactitud (último conteo físico)</h2>
            {!data.exactitud ? (
              <p className="text-xs text-slate-600">No hay conteos físicos aprobados.</p>
            ) : (
              <>
                <p className="text-xs text-slate-500">
                  {data.exactitud.warehouse || '—'} · {new Date(data.exactitud.date).toLocaleDateString('es-VE')} · {data.exactitud.itemsCounted} ítems contados · {data.exactitud.withDiff} con diferencia
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Stat label="Faltantes" value={`${data.exactitud.faltUnits} u.`} sub={usd(data.exactitud.faltUsd)} tone="red" />
                  <Stat label="Sobrantes" value={`${data.exactitud.sobrUnits} u.`} sub={usd(data.exactitud.sobrUsd)} tone="green" />
                  <Stat label="Diferencia neta" value={usd(data.exactitud.netUsd)} tone={data.exactitud.netUsd < 0 ? 'red' : 'green'} />
                  <div className="card p-4 flex flex-col justify-center">
                    <Link href="/inventory/count" className="text-sm text-green-400 hover:underline inline-flex items-center gap-1"><ClipboardIcon size={14} /> Ver conteos</Link>
                  </div>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
