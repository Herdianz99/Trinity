-- SalesBookEntry
ALTER TABLE "SalesBookEntry" ADD COLUMN IF NOT EXISTS "documentType" TEXT NOT NULL DEFAULT 'FACTURA';
ALTER TABLE "SalesBookEntry" ADD COLUMN IF NOT EXISTS "affectedDocNumber" TEXT;
ALTER TABLE "SalesBookEntry" ADD COLUMN IF NOT EXISTS "retentionAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SalesBookEntry" ADD COLUMN IF NOT EXISTS "retentionVoucherNumber" TEXT;

-- PurchaseBookEntry
ALTER TABLE "PurchaseBookEntry" ADD COLUMN IF NOT EXISTS "documentType" TEXT NOT NULL DEFAULT 'FACTURA';
ALTER TABLE "PurchaseBookEntry" ADD COLUMN IF NOT EXISTS "affectedDocNumber" TEXT;

-- Backfill: las lineas de retencion de venta existentes pasan su monto/comprobante a las columnas nuevas
UPDATE "SalesBookEntry"
SET "documentType" = 'RETENCION',
    "retentionAmountBs" = "ivaAmountBs",
    "retentionVoucherNumber" = "notes",
    "affectedDocNumber" = "invoiceNumber",
    "ivaAmountBs" = 0
WHERE "isRetentionLine" = true AND "documentType" = 'FACTURA';

-- Backfill: CxC fiscales existentes (receivableId no nulo) marcadas como CXC
UPDATE "SalesBookEntry" SET "documentType" = 'CXC'
WHERE "receivableId" IS NOT NULL AND "isRetentionLine" = false AND "documentType" = 'FACTURA';

-- Backfill: lineas de retencion en libro de compras
UPDATE "PurchaseBookEntry" SET "documentType" = 'RETENCION_IVA'
WHERE "isRetentionLine" = true AND "documentType" = 'FACTURA';
UPDATE "PurchaseBookEntry" SET "documentType" = 'RETENCION_ISLR'
WHERE "isIslrRetentionLine" = true AND "documentType" = 'FACTURA';
