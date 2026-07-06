-- Correlativo visible para ajustes de inventario (ADJ-0001)
ALTER TABLE "InventoryAdjustment" ADD COLUMN IF NOT EXISTS "number" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryAdjustment_number_key" ON "InventoryAdjustment"("number");
