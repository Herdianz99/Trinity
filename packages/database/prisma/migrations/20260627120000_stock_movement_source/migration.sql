-- Origen del movimiento de inventario para auditoria (Sesion 70)
-- sourceType: SALE_INVOICE | PURCHASE_ORDER | INVENTORY_ADJUSTMENT | INVENTORY_COUNT | CREDIT_DEBIT_NOTE | TRANSFER | REPLACEMENT
-- sourceId: ID real del documento origen, para abrirlo desde el movimiento
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "sourceType" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;
