-- Motivo, fecha y usuario de desactivacion de productos (Session 180). Idempotente.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "deactivationReason" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "deactivatedById" TEXT;

DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "Product_deactivatedById_fkey"
    FOREIGN KEY ("deactivatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Motivo, fecha, usuario y clave que autorizo el bloqueo para la venta (Session 180). Idempotente.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "saleBlockReason" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "saleBlockedAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "saleBlockedById" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "saleBlockAuthorizedBy" TEXT;

DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "Product_saleBlockedById_fkey"
    FOREIGN KEY ("saleBlockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
