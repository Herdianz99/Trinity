// Bitacora de costos y precios: piezas compartidas por el reporte (/inventory/price-log) y la
// pestaña "Historial de precios" de la ficha del producto.

export interface PriceLogRow {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  userId: string | null;
  userName: string | null;
  source: string;
  sourceLabel: string;
  reference: string | null;
  batchId: string | null;
  count: number;
  oldCostUsd: number | null; newCostUsd: number | null;
  oldPriceDetal: number | null; newPriceDetal: number | null;
  oldPriceMayor: number | null; newPriceMayor: number | null;
  oldGananciaPct: number | null; newGananciaPct: number | null;
  oldGananciaMayorPct: number | null; newGananciaMayorPct: number | null;
  oldManualPrice: boolean | null; newManualPrice: boolean | null;
  exchangeRate: number;
  newPriceDetalBs: number;
  createdAt: string;
}

export const PRICE_LOG_SOURCES: { value: string; label: string }[] = [
  { value: 'MANUAL_EDIT', label: 'Edición en ficha' },
  { value: 'PRICE_ADJUSTMENT', label: 'Ajuste masivo' },
  { value: 'PURCHASE', label: 'Compra' },
  { value: 'GLOBAL_BREGA', label: 'Cambio de brecha global' },
  { value: 'CATEGORY_BREGA', label: 'Cambio de brecha de categoría' },
  { value: 'IMPORT', label: 'Importación' },
  { value: 'INTEGRATION', label: 'Integración con empresa socia' },
  { value: 'PARTNER_TRANSFER', label: 'Traslado entre empresas' },
  { value: 'INVENTORY_REPLACEMENT', label: 'Reemplazo de inventario' },
  { value: 'CREATE', label: 'Creación del producto' },
  { value: 'DIRECT_DB', label: 'Directo en base de datos' },
];

const SOURCE_TONE: Record<string, string> = {
  MANUAL_EDIT: 'bg-sky-500/10 text-sky-300 border-sky-500/20',
  PRICE_ADJUSTMENT: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
  PURCHASE: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  DIRECT_DB: 'bg-red-500/10 text-red-300 border-red-500/20',
};

export function SourceBadge({ row }: { row: Pick<PriceLogRow, 'source' | 'sourceLabel' | 'reference'> }) {
  const tone = SOURCE_TONE[row.source] ?? 'bg-slate-500/10 text-slate-300 border-slate-500/20';
  return (
    <span className="inline-flex flex-col">
      <span className={`inline-block w-fit px-2 py-0.5 rounded border text-xs font-medium ${tone}`}>{row.sourceLabel}</span>
      {row.reference && <span className="text-[11px] text-slate-500 mt-0.5">{row.reference}</span>}
    </span>
  );
}

const money = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${n.toLocaleString('es-VE', { maximumFractionDigits: 2 })}%`;
const changed = (a: number | null, b: number | null) => a === null || b === null || Math.abs(a - b) > 0.00005;

/** Lista de "Campo: antes → después" solo con lo que cambio. En la creacion (sin "antes") muestra el valor inicial. */
export function PriceLogChanges({ row }: { row: PriceLogRow }) {
  const isCreate = row.oldCostUsd === null && row.oldPriceDetal === null;
  const items: { label: string; old: string | null; neu: string; diff?: number | null }[] = [];
  const add = (label: string, a: number | null, b: number | null, f: (n: number) => string, withDiff = false) => {
    if (b === null) return;
    if (!isCreate && !changed(a, b)) return;
    const diff = withDiff && a ? ((b - a) / a) * 100 : null;
    items.push({ label, old: isCreate || a === null ? null : f(a), neu: f(b), diff });
  };
  add('Costo', row.oldCostUsd, row.newCostUsd, (n) => `$${money(n)}`, true);
  add('Detal', row.oldPriceDetal, row.newPriceDetal, (n) => `$${money(n)}`, true);
  add('Mayor', row.oldPriceMayor, row.newPriceMayor, (n) => `$${money(n)}`, true);
  add('% gan. detal', row.oldGananciaPct, row.newGananciaPct, pct);
  add('% gan. mayor', row.oldGananciaMayorPct, row.newGananciaMayorPct, pct);
  if (row.newManualPrice !== null && (isCreate ? row.newManualPrice : row.oldManualPrice !== row.newManualPrice)) {
    items.push({ label: 'Precio manual', old: isCreate ? null : row.oldManualPrice ? 'Sí' : 'No', neu: row.newManualPrice ? 'Sí' : 'No' });
  }
  if (items.length === 0) return <span className="text-slate-500 text-xs">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((it) => (
        <div key={it.label} className="text-xs whitespace-nowrap">
          <span className="text-slate-500">{it.label}: </span>
          {it.old !== null && <span className="text-slate-400 line-through decoration-slate-600">{it.old}</span>}
          {it.old !== null && <span className="text-slate-600"> → </span>}
          <span className="text-white font-medium">{it.neu}</span>
          {it.diff != null && Math.abs(it.diff) >= 0.01 && (
            <span className={`ml-1.5 font-semibold ${it.diff > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {it.diff > 0 ? '▲' : '▼'} {Math.abs(it.diff).toLocaleString('es-VE', { maximumFractionDigits: 1 })}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Fecha y hora local del navegador (= Caracas para el usuario). */
export function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const h = d.getHours() % 12 || 12;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`;
}
