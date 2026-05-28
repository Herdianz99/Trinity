-- Step 1: Create RetentionVoucherLine table
CREATE TABLE IF NOT EXISTS "RetentionVoucherLine" (
    "id" TEXT NOT NULL,
    "retentionVoucherId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "supplierInvoiceNumber" TEXT,
    "supplierControlNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "invoiceTotalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "invoiceTotalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableBaseUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableBaseBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionPct" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "retentionAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RetentionVoucherLine_pkey" PRIMARY KEY ("id")
);

-- Step 2: Add supplierId and retentionPct to RetentionVoucher (nullable first)
ALTER TABLE "RetentionVoucher" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE "RetentionVoucher" ADD COLUMN IF NOT EXISTS "retentionPct" DOUBLE PRECISION NOT NULL DEFAULT 75;

-- Step 3: Populate supplierId from the linked PurchaseOrder
UPDATE "RetentionVoucher" rv
SET "supplierId" = po."supplierId"
FROM "PurchaseOrder" po
WHERE rv."purchaseOrderId" = po."id"
  AND rv."supplierId" IS NULL;

-- Step 4: Migrate existing data — create one RetentionVoucherLine per existing RetentionVoucher
INSERT INTO "RetentionVoucherLine" (
    "id", "retentionVoucherId", "purchaseOrderId",
    "supplierInvoiceNumber", "supplierControlNumber", "invoiceDate",
    "invoiceTotalUsd", "invoiceTotalBs",
    "taxableBaseUsd", "taxableBaseBs",
    "ivaAmountUsd", "ivaAmountBs",
    "retentionPct", "retentionAmountUsd", "retentionAmountBs",
    "exchangeRate", "isManual", "createdAt"
)
SELECT
    'migrated_' || rv."id",
    rv."id",
    rv."purchaseOrderId",
    po."supplierInvoiceNumber",
    po."supplierControlNumber",
    po."invoiceDate",
    po."totalUsd",
    po."totalBs",
    po."taxableBaseUsd",
    po."taxableBaseBs",
    po."totalIvaUsd",
    po."totalIvaBs",
    COALESCE(
        (SELECT cc."ivaRetentionPct" FROM "CompanyConfig" cc WHERE cc."id" = 'singleton'),
        75
    ),
    rv."retentionAmountUsd",
    rv."retentionAmountBs",
    rv."exchangeRate",
    false,
    rv."createdAt"
FROM "RetentionVoucher" rv
JOIN "PurchaseOrder" po ON po."id" = rv."purchaseOrderId"
WHERE NOT EXISTS (
    SELECT 1 FROM "RetentionVoucherLine" rvl
    WHERE rvl."retentionVoucherId" = rv."id"
);

-- Step 5: Make supplierId NOT NULL (after populating)
ALTER TABLE "RetentionVoucher" ALTER COLUMN "supplierId" SET NOT NULL;

-- Step 6: Drop the unique constraint and column for purchaseOrderId
ALTER TABLE "RetentionVoucher" DROP CONSTRAINT IF EXISTS "RetentionVoucher_purchaseOrderId_key";
ALTER TABLE "RetentionVoucher" DROP COLUMN IF EXISTS "purchaseOrderId";

-- Step 7: Add foreign keys
ALTER TABLE "RetentionVoucher" ADD CONSTRAINT "RetentionVoucher_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RetentionVoucherLine" ADD CONSTRAINT "RetentionVoucherLine_retentionVoucherId_fkey"
    FOREIGN KEY ("retentionVoucherId") REFERENCES "RetentionVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RetentionVoucherLine" ADD CONSTRAINT "RetentionVoucherLine_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
