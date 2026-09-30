-- Exportacion de pagos a Bancaribe: datos bancarios del proveedor y marca de exportacion
-- por item de la programacion (anti doble pago). Aditiva e idempotente.
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "bankAccount" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "bankDocType" TEXT;

ALTER TABLE "PaymentScheduleItem" ADD COLUMN IF NOT EXISTS "bankExportedAt" TIMESTAMP(3);
ALTER TABLE "PaymentScheduleItem" ADD COLUMN IF NOT EXISTS "bankExportRate" DOUBLE PRECISION;
ALTER TABLE "PaymentScheduleItem" ADD COLUMN IF NOT EXISTS "bankExportAmountBs" DOUBLE PRECISION;
