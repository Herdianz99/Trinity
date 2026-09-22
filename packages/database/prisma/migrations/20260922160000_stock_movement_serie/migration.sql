-- Denormaliza la serie del documento origen en el movimiento de stock, para poder filtrar
-- /inventory/movements por serie fiscal vs nota de entrega (isFiscal). Aditiva/idempotente.
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "serieId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StockMovement_serieId_fkey'
  ) THEN
    ALTER TABLE "StockMovement"
      ADD CONSTRAINT "StockMovement_serieId_fkey"
      FOREIGN KEY ("serieId") REFERENCES "Serie"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "StockMovement_serieId_idx" ON "StockMovement"("serieId");

-- Backfill historico: resolver la serie del documento origen (venta / compra / nota).
UPDATE "StockMovement" m
  SET "serieId" = i."serieId"
  FROM "Invoice" i
  WHERE m."sourceType" = 'SALE_INVOICE' AND m."sourceId" = i."id"
    AND m."serieId" IS NULL AND i."serieId" IS NOT NULL;

UPDATE "StockMovement" m
  SET "serieId" = p."serieId"
  FROM "PurchaseOrder" p
  WHERE m."sourceType" = 'PURCHASE_ORDER' AND m."sourceId" = p."id"
    AND m."serieId" IS NULL AND p."serieId" IS NOT NULL;

UPDATE "StockMovement" m
  SET "serieId" = n."serieId"
  FROM "CreditDebitNote" n
  WHERE m."sourceType" = 'CREDIT_DEBIT_NOTE' AND m."sourceId" = n."id"
    AND m."serieId" IS NULL AND n."serieId" IS NOT NULL;
