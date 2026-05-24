-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "RetentionStatus" AS ENUM ('PENDING', 'ISSUED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "RetentionVoucher" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "status" "RetentionStatus" NOT NULL DEFAULT 'PENDING',
    "issueDate" TIMESTAMP(3),
    "retentionAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RetentionVoucher_number_key" ON "RetentionVoucher"("number");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RetentionVoucher_purchaseOrderId_key" ON "RetentionVoucher"("purchaseOrderId");

-- AddForeignKey
ALTER TABLE "RetentionVoucher" ADD CONSTRAINT "RetentionVoucher_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionVoucher" ADD CONSTRAINT "RetentionVoucher_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add new columns to PurchaseBookEntry
ALTER TABLE "PurchaseBookEntry" ADD COLUMN IF NOT EXISTS "isRetentionLine" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PurchaseBookEntry" ADD COLUMN IF NOT EXISTS "retentionVoucherId" TEXT;

-- AddForeignKey
ALTER TABLE "PurchaseBookEntry" ADD CONSTRAINT "PurchaseBookEntry_retentionVoucherId_fkey" FOREIGN KEY ("retentionVoucherId") REFERENCES "RetentionVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
