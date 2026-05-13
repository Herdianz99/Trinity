-- CreateTable
CREATE TABLE "Seller" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Seller_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Seller_code_key" ON "Seller"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_userId_key" ON "Seller"("userId");

-- AddForeignKey
ALTER TABLE "Seller" ADD CONSTRAINT "Seller_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add commissionPct to Category
ALTER TABLE "Category" ADD COLUMN "commissionPct" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Clear existing sellerId values (they stored User IDs, not Seller IDs)
UPDATE "Invoice" SET "sellerId" = NULL WHERE "sellerId" IS NOT NULL;

-- AddForeignKey from Invoice.sellerId to Seller
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add cashierId to Invoice
ALTER TABLE "Invoice" ADD COLUMN "cashierId" TEXT;

-- AddForeignKey from Invoice.cashierId to User
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add new fields to InvoiceItem
ALTER TABLE "InvoiceItem" ADD COLUMN "unitPriceWithoutIva" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN "unitPriceWithoutIvaBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN "costBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
