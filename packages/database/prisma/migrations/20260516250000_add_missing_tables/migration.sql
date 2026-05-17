-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('NCV', 'NDV', 'NCC', 'NDC');
CREATE TYPE "NoteOrigin" AS ENUM ('MERCHANDISE', 'MANUAL');
CREATE TYPE "NoteStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');
CREATE TYPE "PrintStatus" AS ENUM ('PENDING', 'PRINTED', 'FAILED');

-- CreateTable
CREATE TABLE "PrintArea" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "printAreaId" TEXT NOT NULL,
    "status" "PrintStatus" NOT NULL DEFAULT 'PENDING',
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceAdjustmentLog" (
    "id" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "adjustmentType" TEXT NOT NULL,
    "gananciaPct" DOUBLE PRECISION,
    "gananciaMayorPct" DOUBLE PRECISION,
    "productsAffected" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceAdjustmentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditDebitNote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "NoteType" NOT NULL,
    "origin" "NoteOrigin" NOT NULL,
    "status" "NoteStatus" NOT NULL DEFAULT 'DRAFT',
    "invoiceId" TEXT,
    "cashRegisterId" TEXT,
    "fiscalNumber" TEXT,
    "purchaseOrderId" TEXT,
    "subtotalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "manualAmountUsd" DOUBLE PRECISION,
    "manualPct" DOUBLE PRECISION,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditDebitNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditDebitNoteItem" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPriceUsd" DOUBLE PRECISION NOT NULL,
    "unitPriceBs" DOUBLE PRECISION NOT NULL,
    "ivaType" "IvaType" NOT NULL,
    "ivaAmount" DOUBLE PRECISION NOT NULL,
    "ivaAmountBs" DOUBLE PRECISION NOT NULL,
    "totalUsd" DOUBLE PRECISION NOT NULL,
    "totalBs" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CreditDebitNoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditDebitNote_number_key" ON "CreditDebitNote"("number");

-- AddForeignKey: PrintJob
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_printAreaId_fkey" FOREIGN KEY ("printAreaId") REFERENCES "PrintArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Category.printAreaId
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "printAreaId" TEXT;
ALTER TABLE "Category" ADD CONSTRAINT "Category_printAreaId_fkey" FOREIGN KEY ("printAreaId") REFERENCES "PrintArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: CreditDebitNote
ALTER TABLE "CreditDebitNote" ADD CONSTRAINT "CreditDebitNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreditDebitNote" ADD CONSTRAINT "CreditDebitNote_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreditDebitNote" ADD CONSTRAINT "CreditDebitNote_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: CreditDebitNoteItem
ALTER TABLE "CreditDebitNoteItem" ADD CONSTRAINT "CreditDebitNoteItem_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "CreditDebitNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
