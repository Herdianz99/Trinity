-- Customer: flag de contribuyente especial
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isSpecialTaxpayer" BOOLEAN NOT NULL DEFAULT false;

-- ReceiptItemType: nuevo valor (PG 12+ permite ADD VALUE en transacción si no se usa en la misma)
ALTER TYPE "ReceiptItemType" ADD VALUE IF NOT EXISTS 'SALES_IVA_RETENTION';

-- Tabla de retenciones sufridas
CREATE TABLE IF NOT EXISTS "CustomerIvaRetention" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "taxableBaseUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableBaseBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionPct" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "retentionUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "voucherNumber" TEXT,
    "voucherDate" TIMESTAMP(3),
    "voucherReceivedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "salesBookEntryId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerIvaRetention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerIvaRetention_number_key" ON "CustomerIvaRetention"("number");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerIvaRetention_salesBookEntryId_key" ON "CustomerIvaRetention"("salesBookEntryId");

-- FK en ReceiptItem
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "customerIvaRetentionId" TEXT;

-- FKs (DO block para idempotencia)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerIvaRetention_invoiceId_fkey') THEN
    ALTER TABLE "CustomerIvaRetention" ADD CONSTRAINT "CustomerIvaRetention_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerIvaRetention_customerId_fkey') THEN
    ALTER TABLE "CustomerIvaRetention" ADD CONSTRAINT "CustomerIvaRetention_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerIvaRetention_salesBookEntryId_fkey') THEN
    ALTER TABLE "CustomerIvaRetention" ADD CONSTRAINT "CustomerIvaRetention_salesBookEntryId_fkey"
      FOREIGN KEY ("salesBookEntryId") REFERENCES "SalesBookEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerIvaRetention_createdById_fkey') THEN
    ALTER TABLE "CustomerIvaRetention" ADD CONSTRAINT "CustomerIvaRetention_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReceiptItem_customerIvaRetentionId_fkey') THEN
    ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_customerIvaRetentionId_fkey"
      FOREIGN KEY ("customerIvaRetentionId") REFERENCES "CustomerIvaRetention"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
