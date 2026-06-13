-- Correlativos independientes por tipo de documento dentro de cada serie.
-- Reemplaza el contador compartido Serie.lastNumber por contadores por tipo.

ALTER TABLE "Serie" ADD COLUMN IF NOT EXISTS "lastInvoiceNumber" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Serie" ADD COLUMN IF NOT EXISTS "lastCreditNoteNumber" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Serie" ADD COLUMN IF NOT EXISTS "lastDebitNoteNumber" INTEGER NOT NULL DEFAULT 0;

-- El contador compartido anterior corresponde a facturas: continuar desde ahi.
UPDATE "Serie" SET "lastInvoiceNumber" = "lastNumber" WHERE "lastInvoiceNumber" = 0 AND "lastNumber" > 0;

-- Fecha editable del documento de la nota (rige fecha en libro, PDF y tasa).
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "documentDate" TIMESTAMP(3);
