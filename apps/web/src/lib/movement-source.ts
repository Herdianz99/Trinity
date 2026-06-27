// Mapea el origen de un movimiento de inventario (StockMovement.sourceType + sourceId)
// a la ruta del documento que lo genero, para auditar abriendo el documento desde el movimiento.
//
// Solo los movimientos creados a partir de la Sesion 70 traen sourceType/sourceId.
// Los viejos, la carga inicial de Wensoft, los ajustes manuales y (por ahora) las
// transferencias no tienen origen navegable y devuelven null.

export type MovementSourceType =
  | 'SALE_INVOICE'
  | 'PURCHASE_ORDER'
  | 'INVENTORY_ADJUSTMENT'
  | 'INVENTORY_COUNT'
  | 'CREDIT_DEBIT_NOTE'
  | 'TRANSFER' // sin pagina de detalle todavia
  | 'REPLACEMENT'; // reemplazos de inventario (a futuro)

const SOURCE_MAP: Record<string, { href: (id: string) => string; label: string }> = {
  SALE_INVOICE: { href: (id) => `/sales/invoices/${id}`, label: 'Ver factura' },
  PURCHASE_ORDER: { href: (id) => `/purchases/${id}`, label: 'Ver compra' },
  INVENTORY_ADJUSTMENT: { href: (id) => `/inventory/adjustments/${id}`, label: 'Ver ajuste' },
  INVENTORY_COUNT: { href: (id) => `/inventory/count/${id}`, label: 'Ver conteo' },
  CREDIT_DEBIT_NOTE: { href: (id) => `/credit-debit-notes/${id}`, label: 'Ver nota' },
  REPLACEMENT: { href: (id) => `/inventory/replacements/${id}`, label: 'Ver reemplazo' },
  // TRANSFER: pendiente — se agrega cuando exista la pagina de detalle de transferencias
};

/**
 * Devuelve { href, label } para navegar al documento origen del movimiento,
 * o null si el movimiento no tiene un documento navegable.
 */
export function getMovementSource(
  sourceType?: string | null,
  sourceId?: string | null,
): { href: string; label: string } | null {
  if (!sourceType || !sourceId) return null;
  const entry = SOURCE_MAP[sourceType];
  if (!entry) return null;
  return { href: entry.href(sourceId), label: entry.label };
}
