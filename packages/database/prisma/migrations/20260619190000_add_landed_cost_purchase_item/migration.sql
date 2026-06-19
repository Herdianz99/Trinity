-- Costo aterrizado (costo de factura + recargo repartido). Usado solo para inventario/precio, no para la factura.
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "landedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "landedCostBs" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill: para filas existentes el costo aterrizado = costo neto de factura (sin recargo aplicado aún)
UPDATE "PurchaseOrderItem" SET "landedCostUsd" = "netCostUsd" WHERE "landedCostUsd" = 0 AND "netCostUsd" <> 0;
UPDATE "PurchaseOrderItem" SET "landedCostBs"  = "netCostBs"  WHERE "landedCostBs"  = 0 AND "netCostBs"  <> 0;
