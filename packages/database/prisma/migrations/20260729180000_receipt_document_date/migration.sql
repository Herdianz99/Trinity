-- Fecha del recibo elegida por el usuario (antes solo existía createdAt = día de carga).
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "documentDate" TIMESTAMP(3);

-- Backfill: los recibos existentes toman como fecha su día-calendario de Caracas
-- (a medianoche UTC), consistente con cómo se guardan los nuevos (caracasDateKey).
UPDATE "Receipt"
SET "documentDate" = ((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Caracas')::date)::timestamp
WHERE "documentDate" IS NULL;
