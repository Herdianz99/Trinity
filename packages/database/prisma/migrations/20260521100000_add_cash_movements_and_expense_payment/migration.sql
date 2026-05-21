-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CashMovementType') THEN
    CREATE TYPE "CashMovementType" AS ENUM ('INCOME', 'EXPENSE');
  END IF;
END $$;

-- AlterEnum: Add MANUAL_CASH_MOVEMENT to DynamicKeyPerm
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'MANUAL_CASH_MOVEMENT';

-- CreateTable
CREATE TABLE IF NOT EXISTS "CashMovement" (
    "id" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "isManual" BOOLEAN NOT NULL DEFAULT true,
    "expenseId" TEXT,
    "dynamicKeyId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CashMovement_expenseId_key" ON "CashMovement"("expenseId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CashMovement_cashSessionId_fkey') THEN
    ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CashMovement_expenseId_fkey') THEN
    ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CashMovement_createdById_fkey') THEN
    ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AlterTable: Add cashSessionId and methodId to Expense
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "cashSessionId" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "methodId" TEXT;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_cashSessionId_fkey') THEN
    ALTER TABLE "Expense" ADD CONSTRAINT "Expense_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_methodId_fkey') THEN
    ALTER TABLE "Expense" ADD CONSTRAINT "Expense_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
