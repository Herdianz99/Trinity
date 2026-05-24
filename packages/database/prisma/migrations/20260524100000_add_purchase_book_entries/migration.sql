-- CreateTable
CREATE TABLE IF NOT EXISTS "PurchaseBookEntry" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "supplierControlNumber" TEXT,
    "supplierInvoiceNumber" TEXT,
    "supplierName" TEXT NOT NULL,
    "supplierRif" TEXT NOT NULL,
    "exemptAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableBaseBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionVoucherNumber" TEXT,
    "retentionAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseBookEntry_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PurchaseBookEntry" ADD CONSTRAINT "PurchaseBookEntry_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBookEntry" ADD CONSTRAINT "PurchaseBookEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
