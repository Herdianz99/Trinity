-- Vendedor opcional en el recibo (solo cobro). Aditivo e idempotente.
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "sellerId" TEXT;
CREATE INDEX IF NOT EXISTS "Receipt_sellerId_idx" ON "Receipt"("sellerId");
DO $$ BEGIN
  ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
