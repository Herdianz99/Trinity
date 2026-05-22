-- Step 1: Recreate enum with new values
-- Drop default first to remove dependency on enum type
ALTER TABLE "PurchaseOrder" ALTER COLUMN "status" DROP DEFAULT;
-- Convert column to text
ALTER TABLE "PurchaseOrder" ALTER COLUMN "status" TYPE TEXT;
-- Map old values to new ones
UPDATE "PurchaseOrder" SET status = 'PENDING' WHERE status IN ('DRAFT', 'SENT');
UPDATE "PurchaseOrder" SET status = 'PROCESSED' WHERE status IN ('RECEIVED', 'PARTIAL');
-- Drop old enum and create new one
DROP TYPE "PurchaseStatus";
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'PROCESSED', 'CANCELLED');
-- Convert column back to enum with new default
ALTER TABLE "PurchaseOrder" ALTER COLUMN "status" TYPE "PurchaseStatus" USING status::"PurchaseStatus";
ALTER TABLE "PurchaseOrder" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"PurchaseStatus";

-- Step 2: Add new columns to PurchaseOrder
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "purchaseNumber" INTEGER DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "supplierSerialNumber" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "supplierInvoiceNumber" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "discountGlobalPct" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "discountGlobalUsd" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "discountGlobalBs" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "subtotalUsd" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "subtotalBs" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "exemptAmountUsd" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "exemptAmountBs" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "taxableBaseUsd" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "taxableBaseBs" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "totalIvaUsd" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "totalIvaBs" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "totalSurchargeUsd" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "totalSurchargeBs" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "retentionVoucherNumber" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "responsibleId" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3);
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT;

-- Step 3: Add new columns to PurchaseOrderItem
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "discountPct" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "discountUsd" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "discountBs" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "netCostUsd" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "netCostBs" DOUBLE PRECISION DEFAULT 0;

-- Step 4: Backfill existing data
UPDATE "PurchaseOrder" SET "responsibleId" = "createdById" WHERE "responsibleId" IS NULL;
UPDATE "PurchaseOrder" SET "subtotalUsd" = "totalUsd", "subtotalBs" = "totalBs" WHERE "subtotalUsd" = 0 AND "totalUsd" > 0;
UPDATE "PurchaseOrderItem" SET "netCostUsd" = "costUsd", "netCostBs" = "costBs" WHERE "netCostUsd" = 0 AND "costUsd" > 0;

-- Step 5: Backfill purchaseNumber with sequential numbers
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt") as rn
  FROM "PurchaseOrder"
)
UPDATE "PurchaseOrder" po SET "purchaseNumber" = n.rn
FROM numbered n WHERE po.id = n.id;

-- Step 6: Add foreign keys
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseOrder_responsibleId_fkey') THEN
    ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseOrder_warehouseId_fkey') THEN
    ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
