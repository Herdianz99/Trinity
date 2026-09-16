-- Descuento % por documento (override) en la programación de pagos. Aditiva.
-- null = hereda el descuento del proveedor; un valor (incluso 0) = override explícito.
ALTER TABLE "PaymentScheduleItem" ADD COLUMN IF NOT EXISTS "discountPct" DOUBLE PRECISION;
