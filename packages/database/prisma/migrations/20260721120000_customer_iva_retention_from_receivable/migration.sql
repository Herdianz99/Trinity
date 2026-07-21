-- Permitir que una retencion de IVA de cliente provenga de una Cuenta por Cobrar (Receivable)
-- ademas de una Factura (Invoice). Antes invoiceId era obligatorio; ahora es uno u otro.

-- invoiceId pasa a ser opcional
ALTER TABLE "CustomerIvaRetention" ALTER COLUMN "invoiceId" DROP NOT NULL;

-- Nuevo origen: la CxC
ALTER TABLE "CustomerIvaRetention" ADD COLUMN IF NOT EXISTS "receivableId" TEXT;

DO $$ BEGIN
  ALTER TABLE "CustomerIvaRetention"
    ADD CONSTRAINT "CustomerIvaRetention_receivableId_fkey"
    FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
