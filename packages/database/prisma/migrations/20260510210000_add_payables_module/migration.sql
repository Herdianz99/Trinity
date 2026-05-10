-- CreateEnum
CREATE TYPE "PayableStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE');

-- AlterTable
ALTER TABLE "CompanyConfig" ADD COLUMN     "ivaRetentionPct" DOUBLE PRECISION NOT NULL DEFAULT 75;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "creditDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isCredit" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Payable" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "amountBs" DOUBLE PRECISION NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "retentionUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netPayableUsd" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "PayableStatus" NOT NULL DEFAULT 'PENDING',
    "paidAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayablePayment" (
    "id" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "amountBs" DOUBLE PRECISION NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayablePayment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "Payable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
