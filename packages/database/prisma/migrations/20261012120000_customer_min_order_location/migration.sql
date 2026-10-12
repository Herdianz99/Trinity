-- Cliente: monto minimo de pedido en el portal + ubicacion GPS para despachos (aditivo e idempotente).
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "minOrderUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "locationAccuracyM" DOUBLE PRECISION;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "locationUpdatedAt" TIMESTAMP(3);
