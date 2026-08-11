-- Foto opcional (una sola) por incidencia, guardada en Spaces por su key.
-- Aditiva e idempotente.
ALTER TABLE "Incident" ADD COLUMN IF NOT EXISTS "photoThumbKey" TEXT;
ALTER TABLE "Incident" ADD COLUMN IF NOT EXISTS "photoMediumKey" TEXT;
