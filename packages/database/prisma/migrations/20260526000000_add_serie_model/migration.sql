-- CreateTable
CREATE TABLE IF NOT EXISTS "Serie" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "isFiscal" BOOLEAN NOT NULL DEFAULT false,
    "isVatExempt" BOOLEAN NOT NULL DEFAULT false,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "cashRegisterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Serie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Serie_name_key" ON "Serie"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "Serie_cashRegisterId_key" ON "Serie"("cashRegisterId");

-- AddForeignKey
ALTER TABLE "Serie" ADD CONSTRAINT "Serie_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add serieId to Invoice
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "serieId" TEXT;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_serieId_fkey" FOREIGN KEY ("serieId") REFERENCES "Serie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add serieId to CreditDebitNote
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "serieId" TEXT;
ALTER TABLE "CreditDebitNote" ADD CONSTRAINT "CreditDebitNote_serieId_fkey" FOREIGN KEY ("serieId") REFERENCES "Serie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add serieId to RetentionVoucher
ALTER TABLE "RetentionVoucher" ADD COLUMN IF NOT EXISTS "serieId" TEXT;
ALTER TABLE "RetentionVoucher" ADD CONSTRAINT "RetentionVoucher_serieId_fkey" FOREIGN KEY ("serieId") REFERENCES "Serie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Remove isFiscal and lastInvoiceNumber from CashRegister
ALTER TABLE "CashRegister" DROP COLUMN IF EXISTS "isFiscal";
ALTER TABLE "CashRegister" DROP COLUMN IF EXISTS "lastInvoiceNumber";
