-- Add MANUAL to ReceivableType enum
ALTER TYPE "ReceivableType" ADD VALUE IF NOT EXISTS 'MANUAL';

-- Create CustomerAdvanceStatus enum
DO $$ BEGIN CREATE TYPE "CustomerAdvanceStatus" AS ENUM ('AVAILABLE', 'PARTIAL', 'CONSUMED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Make Receivable.invoiceId nullable
ALTER TABLE "Receivable" ALTER COLUMN "invoiceId" DROP NOT NULL;

-- Add documentNumber and description to Receivable
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "documentNumber" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "description" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Add documentNumber and description to Payable
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "documentNumber" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "description" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Create CustomerAdvance table
CREATE TABLE IF NOT EXISTS "CustomerAdvance" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "amountBs" DOUBLE PRECISION NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "paidAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "CustomerAdvanceStatus" NOT NULL DEFAULT 'AVAILABLE',
    "reference" TEXT,
    "notes" TEXT,
    "methodId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerAdvance_pkey" PRIMARY KEY ("id")
);

-- Add foreign keys for CustomerAdvance (idempotent)
DO $$ BEGIN
  ALTER TABLE "CustomerAdvance" ADD CONSTRAINT "CustomerAdvance_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CustomerAdvance" ADD CONSTRAINT "CustomerAdvance_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CustomerAdvance" ADD CONSTRAINT "CustomerAdvance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create SupplierAdvanceStatus enum
DO $$ BEGIN CREATE TYPE "SupplierAdvanceStatus" AS ENUM ('AVAILABLE', 'PARTIAL', 'CONSUMED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Create SupplierAdvance table
CREATE TABLE IF NOT EXISTS "SupplierAdvance" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "amountBs" DOUBLE PRECISION NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "paidAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "SupplierAdvanceStatus" NOT NULL DEFAULT 'AVAILABLE',
    "reference" TEXT,
    "notes" TEXT,
    "methodId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierAdvance_pkey" PRIMARY KEY ("id")
);

-- Add foreign keys for SupplierAdvance (idempotent)
DO $$ BEGIN
  ALTER TABLE "SupplierAdvance" ADD CONSTRAINT "SupplierAdvance_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupplierAdvance" ADD CONSTRAINT "SupplierAdvance_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupplierAdvance" ADD CONSTRAINT "SupplierAdvance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
