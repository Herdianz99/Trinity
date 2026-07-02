-- Modo de costo para el reporte del ajuste de inventario:
-- 'COST' = costo puro, 'BREGA' = costo + brecha global (solo productos con bregaApplies).
ALTER TABLE "InventoryAdjustment" ADD COLUMN IF NOT EXISTS "costMode" TEXT NOT NULL DEFAULT 'BREGA';
