'use client';

import { Loader2, Check, X } from 'lucide-react';

// Fila de "tomar costos del socio" (GET transfers/:id/cost-preview)
export interface CostChange {
  productId: string; code: string; name: string;
  currentCost: number; partnerCost: number; newCost: number;
  manualCost: boolean; manualPrice: boolean;
  bregaPct: number; gananciaPct: number; gananciaMayorPct: number; ivaMultiplier: number;
  currentPriceDetal: number; newPriceDetal: number;
  currentPriceMayor: number; newPriceMayor: number;
}

// Rojo si sube, verde si baja (mismo código de colores que procesar compra)
const deltaColor = (next: number, prev: number) =>
  next > prev + 0.000001 ? 'text-red-400' : next < prev - 0.000001 ? 'text-green-400' : 'text-white';
const pctChange = (next: number, prev: number) => (prev > 0 ? ((next - prev) / prev) * 100 : 0);

// Pantalla "tomar costos del socio" al recibir: costo anterior → nuevo y su efecto en el
// precio de venta, en rojo si sube y verde si baja (como procesar una compra).
export function CostChangesModal({ rows, partnerName, busy, error, onCancel, onReceive }: {
  rows: CostChange[];
  partnerName: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onReceive: (applyPartnerCosts: boolean) => void;
}) {
  const fmt = (n: number) => `$${n.toFixed(2)}`;
  // Los costos pueden tener hasta 4 decimales: mostrarlos con 2 escondería la diferencia real
  const fmtCost = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  const pct = (n: number) => `${Number(n.toFixed(2))}%`;
  const up = rows.filter((r) => !r.manualCost && r.newCost > r.currentCost).length;
  const down = rows.filter((r) => !r.manualCost && r.newCost < r.currentCost).length;
  const frozen = rows.filter((r) => r.manualCost).length;

  const Pct = ({ next, prev }: { next: number; prev: number }) => {
    const p = pctChange(next, prev);
    if (Math.abs(p) < 0.05) return null;
    return <span className={`block text-[10px] font-normal ${deltaColor(next, prev)}`}>{p > 0 ? '+' : ''}{p.toFixed(1)}%</span>;
  };
  const Flags = ({ r }: { r: CostChange }) => (
    <>
      {r.manualCost && (
        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-600/40 text-slate-300 border border-slate-500/40">Costo manual · no cambia</span>
      )}
      {!r.manualCost && r.manualPrice && (
        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">Precio manual · se conserva</span>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex sm:items-center sm:justify-center bg-black/60 backdrop-blur-sm sm:p-4">
      <div className="bg-slate-800 sm:border sm:border-slate-700 sm:rounded-xl shadow-2xl w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-5xl flex flex-col">
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-700/50 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white">Costos de {partnerName}</h2>
            <p className="text-sm text-slate-400">
              {rows.length} producto{rows.length === 1 ? '' : 's'} llega{rows.length === 1 ? '' : 'n'} con un costo base distinto al tuyo.
              ¿Quieres tomar el costo del socio para que ambas empresas tengan el mismo?
            </p>
          </div>
          <button onClick={onCancel} disabled={busy} aria-label="Cerrar" className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 flex-shrink-0"><X size={18} /></button>
        </div>

        {/* Resumen + leyenda */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 sm:px-6 py-2.5 border-b border-slate-700/50 text-xs flex-shrink-0">
          {up > 0 && <span className="text-red-400 font-medium">▲ {up} sube{up === 1 ? '' : 'n'} de costo</span>}
          {down > 0 && <span className="text-green-400 font-medium">▼ {down} baja{down === 1 ? '' : 'n'} de costo</span>}
          {frozen > 0 && <span className="text-slate-400">{frozen} con costo manual (no se cambia{frozen === 1 ? '' : 'n'})</span>}
          <span className="text-slate-500 sm:ml-auto">Precio = costo × brecha × ganancia × IVA · se mantiene tu % de ganancia</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {error && <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

          {/* Escritorio: tabla */}
          <table className="w-full text-sm hidden md:table">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-2 py-2 text-slate-400 font-medium text-xs">Código</th>
                <th className="text-left px-2 py-2 text-slate-400 font-medium text-xs">Producto</th>
                <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">Costo ant.</th>
                <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">Costo nuevo</th>
                <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs" title="Brecha aplicada al costo">Brecha</th>
                <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">Gan.% Detal</th>
                <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">P. Actual Detal</th>
                <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">P. Nuevo Detal</th>
                <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">P. Actual Mayor</th>
                <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">P. Nuevo Mayor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId} className={`border-b border-slate-700/30 align-top ${r.manualCost ? 'opacity-60' : ''}`}>
                  <td className="px-2 py-2 font-mono text-green-400 text-xs whitespace-nowrap">{r.code}</td>
                  <td className="px-2 py-2 text-white text-xs">
                    {r.name}
                    <div className="mt-1"><Flags r={r} /></div>
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-slate-400 text-xs">{fmtCost(r.currentCost)}</td>
                  <td className={`px-2 py-2 text-right font-mono text-xs font-bold ${r.manualCost ? 'text-slate-400 line-through' : deltaColor(r.newCost, r.currentCost)}`}>
                    {fmtCost(r.partnerCost)}
                    {!r.manualCost && <Pct next={r.newCost} prev={r.currentCost} />}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-slate-300 text-xs">{r.bregaPct > 0 ? `${r.bregaPct}%` : '—'}</td>
                  <td className="px-2 py-2 text-right font-mono text-slate-300 text-xs">{pct(r.gananciaPct)}</td>
                  <td className="px-2 py-2 text-right font-mono text-slate-400 text-xs">{fmt(r.currentPriceDetal)}</td>
                  <td className={`px-2 py-2 text-right font-mono text-xs font-bold ${deltaColor(r.newPriceDetal, r.currentPriceDetal)}`}>
                    {fmt(r.newPriceDetal)}
                    <Pct next={r.newPriceDetal} prev={r.currentPriceDetal} />
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-slate-400 text-xs">{fmt(r.currentPriceMayor)}</td>
                  <td className={`px-2 py-2 text-right font-mono text-xs font-bold ${deltaColor(r.newPriceMayor, r.currentPriceMayor)}`}>
                    {fmt(r.newPriceMayor)}
                    <Pct next={r.newPriceMayor} prev={r.currentPriceMayor} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Móvil: tarjetas */}
          <div className="md:hidden space-y-2.5">
            {rows.map((r) => (
              <div key={r.productId} className={`rounded-lg border border-slate-700/50 bg-slate-900/40 p-3 ${r.manualCost ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-2">
                  <span className="font-mono text-green-400 text-xs flex-shrink-0 mt-0.5">{r.code}</span>
                  <span className="text-white text-sm min-w-0 break-words">{r.name}</span>
                </div>
                <div className="mt-1"><Flags r={r} /></div>
                <div className="grid grid-cols-3 gap-2 mt-2.5 text-xs font-mono">
                  <span className="text-slate-500 font-sans">Costo</span>
                  <span className="text-slate-400 text-right">{fmtCost(r.currentCost)}</span>
                  <span className={`text-right font-bold ${r.manualCost ? 'text-slate-400 line-through' : deltaColor(r.newCost, r.currentCost)}`}>
                    {fmtCost(r.partnerCost)}{!r.manualCost && <Pct next={r.newCost} prev={r.currentCost} />}
                  </span>
                  <span className="text-slate-500 font-sans">Detal</span>
                  <span className="text-slate-400 text-right">{fmt(r.currentPriceDetal)}</span>
                  <span className={`text-right font-bold ${deltaColor(r.newPriceDetal, r.currentPriceDetal)}`}>
                    {fmt(r.newPriceDetal)}<Pct next={r.newPriceDetal} prev={r.currentPriceDetal} />
                  </span>
                  <span className="text-slate-500 font-sans">Mayor</span>
                  <span className="text-slate-400 text-right">{fmt(r.currentPriceMayor)}</span>
                  <span className={`text-right font-bold ${deltaColor(r.newPriceMayor, r.currentPriceMayor)}`}>
                    {fmt(r.newPriceMayor)}<Pct next={r.newPriceMayor} prev={r.currentPriceMayor} />
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  Brecha {r.bregaPct > 0 ? `${r.bregaPct}%` : '—'} · Ganancia detal {pct(r.gananciaPct)} · mayor {pct(r.gananciaMayorPct)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 px-4 sm:px-6 py-3 border-t border-slate-700/50 flex-shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={onCancel} disabled={busy} className="text-sm text-slate-400 hover:text-white transition-colors px-3 py-2">
            Cancelar
          </button>
          <button type="button" onClick={() => onReceive(false)} disabled={busy} className="btn-secondary !py-2.5 text-sm flex items-center justify-center gap-2">
            No, solo recibir
          </button>
          <button type="button" onClick={() => onReceive(true)} disabled={busy} className="btn-primary !py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
            Sí, tomar costos y recibir
          </button>
        </div>
      </div>
    </div>
  );
}
