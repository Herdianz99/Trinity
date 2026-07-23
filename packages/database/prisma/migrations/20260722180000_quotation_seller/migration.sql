-- Vendedor en cotizaciones: se setea al crear (vendedor de sesion) y se copia a la factura al convertir.
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "sellerId" TEXT;

CREATE INDEX IF NOT EXISTS "Quotation_sellerId_idx" ON "Quotation"("sellerId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Quotation_sellerId_fkey' AND table_name = 'Quotation'
  ) THEN
    ALTER TABLE "Quotation"
      ADD CONSTRAINT "Quotation_sellerId_fkey"
      FOREIGN KEY ("sellerId") REFERENCES "Seller"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
