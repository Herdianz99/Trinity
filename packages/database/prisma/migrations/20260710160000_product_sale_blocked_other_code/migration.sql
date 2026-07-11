-- Bloqueo de venta + codigo alterno en Product (aditivo, idempotente)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "saleBlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "otherCode" TEXT;
