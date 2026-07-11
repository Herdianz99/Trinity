// Helpers y metadata compartidos entre la lista de despachos y la página de detalle.

export const DISPATCH_STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDIENTE:  { label: 'Pendiente',  cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  PARCIAL:    { label: 'Parcial',    cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  COMPLETADO: { label: 'Completado', cls: 'bg-green-500/15 text-green-400 border-green-500/30' },
  CANCELADO:  { label: 'Cancelado',  cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
};

export const fmtQty = (n: number) => Number(n).toLocaleString('es-VE', { maximumFractionDigits: 3 });

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Fecha (date-only, guardada a medianoche UTC) -> 'YYYY-MM-DD' sin corrimiento de zona.
export function isoToDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function isOverdue(iso: string | null, status: string): boolean {
  if (!iso || status === 'COMPLETADO' || status === 'CANCELADO') return false;
  return iso.slice(0, 10) < todayLocal();
}
