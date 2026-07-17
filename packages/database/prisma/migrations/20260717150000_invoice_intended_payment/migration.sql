-- Método de pago previsto por el vendedor (Cashea/Crediagro): aviso al cajero al retomar
-- la pre-factura. Aditivo y nullable — no afecta instalaciones de una sola empresa.
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "intendedPaymentMethodId" TEXT;
DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_intendedPaymentMethodId_fkey"
    FOREIGN KEY ("intendedPaymentMethodId") REFERENCES "PaymentMethod"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
