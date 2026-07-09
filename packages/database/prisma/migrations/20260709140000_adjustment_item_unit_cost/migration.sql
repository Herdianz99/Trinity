-- Costo efectivo editado a mano por item del ajuste (reporte + CxC/CxP). Aditivo y nullable.
ALTER TABLE "InventoryAdjustmentItem" ADD COLUMN IF NOT EXISTS "unitCostUsd" DOUBLE PRECISION;
