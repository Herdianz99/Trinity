/**
 * Formatea el VALOR de la tasa de cambio con 4 decimales (formato es-VE).
 * Usar SOLO para mostrar la tasa en si (Bs/USD), nunca para montos en Bs.
 */
export function fmtRate(rate: number | null | undefined): string {
  return (rate ?? 0).toLocaleString('es-VE', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}
