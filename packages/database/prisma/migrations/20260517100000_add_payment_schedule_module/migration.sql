-- CreateEnum
CREATE TYPE "PaymentScheduleStatus" AS ENUM ('DRAFT', 'APPROVED', 'EXECUTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PaymentSchedule" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "PaymentScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "budgetUsd" DOUBLE PRECISION,
    "budgetBs" DOUBLE PRECISION,
    "budgetCurrency" TEXT,
    "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentScheduleItem" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "payableId" TEXT,
    "creditDebitNoteId" TEXT,
    "supplierName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "totalAmountUsd" DOUBLE PRECISION NOT NULL,
    "totalAmountBs" DOUBLE PRECISION NOT NULL,
    "plannedAmountUsd" DOUBLE PRECISION NOT NULL,
    "plannedAmountBs" DOUBLE PRECISION NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSchedule_number_key" ON "PaymentSchedule"("number");

-- AddForeignKey
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentScheduleItem" ADD CONSTRAINT "PaymentScheduleItem_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "PaymentSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentScheduleItem" ADD CONSTRAINT "PaymentScheduleItem_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "Payable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentScheduleItem" ADD CONSTRAINT "PaymentScheduleItem_creditDebitNoteId_fkey" FOREIGN KEY ("creditDebitNoteId") REFERENCES "CreditDebitNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
