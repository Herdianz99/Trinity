// Cálculo centralizado del descuento de la programación de pagos.
// El descuento se resuelve a NIVEL DE ÍTEM (documento): si el ítem tiene un discountPct
// propio (override, incluso 0) se usa ese; si es null, hereda el descuento del proveedor.
// Se usa tanto en el detalle (findOne) como en los PDF (completo y vencidos) para que el
// neto sea siempre consistente.

export const round2 = (n: number): number => Math.round(n * 100) / 100;

// % efectivo de un ítem: su override si existe, si no el del proveedor.
export function effectivePct(
  itemDiscountPct: number | null | undefined,
  supplierPct: number,
): number {
  const pct = itemDiscountPct == null ? (supplierPct || 0) : itemDiscountPct;
  return Math.max(0, Math.min(100, pct));
}

// Descuento y neto de un ítem sobre su monto planificado, según el % efectivo.
export function itemNet(
  plannedUsd: number,
  plannedBs: number,
  pct: number,
): { discountUsd: number; discountBs: number; netUsd: number; netBs: number } {
  const discountUsd = round2(plannedUsd * (pct / 100));
  const discountBs = round2(plannedBs * (pct / 100));
  return {
    discountUsd,
    discountBs,
    netUsd: round2(plannedUsd - discountUsd),
    netBs: round2(plannedBs - discountBs),
  };
}
