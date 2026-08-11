// Helpers PUROS de cálculo de precios/brecha. Sin dependencias de Nest ni Prisma.
// Centralizan la fórmula que antes estaba duplicada en ~13 servicios.

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Brecha efectiva a aplicar a un producto.
 * Regla: si el producto no lleva brecha -> 0; si la categoría raíz tiene brecha>0 -> esa; si no -> la global.
 */
export function resolveBregaPct(args: {
  bregaApplies: boolean;
  categoryBregaPct: number; // brecha de la categoría RAÍZ del producto (0 si no tiene / no aplica)
  bregaGlobalPct: number;
}): number {
  if (!args.bregaApplies) return 0;
  return args.categoryBregaPct > 0 ? args.categoryBregaPct : (args.bregaGlobalPct || 0);
}

/** Costo efectivo = costo + brecha (para márgenes y reportes). NO incluye ganancia ni IVA. */
export function effectiveCost(costUsd: number, bregaPct: number): number {
  return costUsd * (1 + bregaPct / 100);
}

/** Precios de venta detal/mayor a partir del costo, brecha, ganancias y el multiplicador de IVA ya resuelto. */
export function computeSellingPrices(args: {
  costUsd: number;
  gananciaPct: number;
  gananciaMayorPct: number;
  ivaMultiplier: number;
  bregaPct: number;
}): { priceDetal: number; priceMayor: number } {
  const base = args.costUsd * (1 + args.bregaPct / 100);
  return {
    priceDetal: round2(base * (1 + args.gananciaPct / 100) * args.ivaMultiplier),
    priceMayor: round2(base * (1 + args.gananciaMayorPct / 100) * args.ivaMultiplier),
  };
}
