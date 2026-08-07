-- Metodo de pago en movimientos manuales de caja.
ALTER TABLE "CashMovement" ADD COLUMN IF NOT EXISTS "methodId" TEXT;

DO $$ BEGIN
  ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_methodId_fkey"
    FOREIGN KEY ("methodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "CashMovement_methodId_idx" ON "CashMovement"("methodId");
