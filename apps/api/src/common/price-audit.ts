import { randomUUID } from 'crypto';

/**
 * Bitacora de costos y precios (Sesion 162).
 *
 * El trigger `product_price_log_trg` registra en `ProductPriceLog` todo cambio de costo, precios, % de
 * ganancia o precio manual de un producto. Para saber QUIEN y DESDE DONDE, cada `product.create/update`
 * que toque esos campos debe mezclar en su `data` el sello de `priceAudit()`. El trigger solo confia en el
 * sello si `auditToken` cambio en ese mismo update; si no, registra el cambio como `DIRECT_DB` (sin usuario).
 *
 * Para un cambio masivo (muchos productos en una sola accion) pasar el mismo `token` a todas las filas:
 * el reporte las agrupa como un solo evento.
 */
export type PriceAuditSource =
  | 'CREATE'
  | 'MANUAL_EDIT'
  | 'PRICE_ADJUSTMENT'
  | 'PURCHASE'
  | 'GLOBAL_BREGA'
  | 'CATEGORY_BREGA'
  | 'IMPORT'
  | 'INTEGRATION'
  | 'PARTNER_TRANSFER'
  | 'INVENTORY_REPLACEMENT';

export function priceAudit(
  userId: string | null | undefined,
  source: PriceAuditSource,
  ref?: string | null,
  token?: string,
) {
  return {
    auditToken: token ?? randomUUID(),
    auditUserId: userId ?? null,
    auditSource: source,
    auditRef: ref ?? null,
  };
}

/** Token compartido para un cambio masivo. */
export const newPriceAuditBatch = () => randomUUID();
