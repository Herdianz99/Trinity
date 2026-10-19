-- Opcion de empresa: mostrar "Tomar ubicacion" (GPS) en el formulario de cliente del POS (aditivo e idempotente).
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "customerLocationInPos" BOOLEAN NOT NULL DEFAULT false;
