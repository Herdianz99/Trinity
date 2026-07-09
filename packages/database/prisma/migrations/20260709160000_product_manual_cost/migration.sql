-- Costo manual: cuando está tildado, ninguna operación automática (recepción de
-- compra, reemplazo de inventario) actualiza el costUsd del producto.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "manualCost" BOOLEAN NOT NULL DEFAULT false;
