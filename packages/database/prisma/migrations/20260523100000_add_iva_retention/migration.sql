-- AlterEnum
ALTER TYPE "ReceiptItemType" ADD VALUE IF NOT EXISTS 'IVA_RETENTION';

-- AlterTable: CompanyConfig
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "retentionNextNumber" INTEGER NOT NULL DEFAULT 1;

-- CreateTable: IvaRetention
CREATE TABLE IF NOT EXISTS "IvaRetention" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "ivaBaseUsd" DOUBLE PRECISION NOT NULL,
    "ivaBaseBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionPct" DOUBLE PRECISION NOT NULL,
    "retentionUsd" DOUBLE PRECISION NOT NULL,
    "retentionBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IvaRetention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "IvaRetention_number_key" ON "IvaRetention"("number");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IvaRetention_purchaseOrderId_fkey') THEN
    ALTER TABLE "IvaRetention" ADD CONSTRAINT "IvaRetention_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IvaRetention_supplierId_fkey') THEN
    ALTER TABLE "IvaRetention" ADD CONSTRAINT "IvaRetention_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AlterTable: ReceiptItem - add ivaRetentionId
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "ivaRetentionId" TEXT;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReceiptItem_ivaRetentionId_fkey') THEN
    ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_ivaRetentionId_fkey" FOREIGN KEY ("ivaRetentionId") REFERENCES "IvaRetention"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
