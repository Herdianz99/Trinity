-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "CompanyConfig" ADD COLUMN "quotationValidityDays" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "convertedToInvoiceId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPriceUsd" DOUBLE PRECISION NOT NULL,
    "ivaType" "IvaType" NOT NULL,
    "ivaAmount" DOUBLE PRECISION NOT NULL,
    "totalUsd" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_number_key" ON "Quotation"("number");

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
