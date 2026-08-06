-- Fecha del anticipo elegida por el usuario (medianoche UTC de la fecha-Caracas). Aditiva/idempotente.
ALTER TABLE "CustomerAdvance" ADD COLUMN IF NOT EXISTS "documentDate" TIMESTAMP(3);
ALTER TABLE "SupplierAdvance" ADD COLUMN IF NOT EXISTS "documentDate" TIMESTAMP(3);
