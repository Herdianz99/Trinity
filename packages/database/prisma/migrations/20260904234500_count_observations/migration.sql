-- Observaciones del conteo fisico (lo que el usuario nota DURANTE el conteo, antes de procesar).
-- Aditiva e idempotente.
ALTER TABLE "InventoryCount" ADD COLUMN IF NOT EXISTS "observations" TEXT;
