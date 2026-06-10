-- =============================================================================
-- Migration: Add ISLR Retention Module
-- Creates SupplierType enum, IslrRetentionType, IslrRetentionVoucher,
-- IslrRetentionVoucherLine tables and adds related columns.
-- =============================================================================

-- 1. Create SupplierType enum
DO $$ BEGIN CREATE TYPE "SupplierType" AS ENUM ('JURIDICA', 'NATURAL_RESIDENTE', 'NATURAL_NO_RESIDENTE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add supplierType to Supplier
DO $$ BEGIN ALTER TABLE "Supplier" ADD COLUMN "supplierType" "SupplierType"; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 3. Add ISLR fields to CompanyConfig
DO $$ BEGIN ALTER TABLE "CompanyConfig" ADD COLUMN "islrRetentionNextNumber" INTEGER NOT NULL DEFAULT 1; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CompanyConfig" ADD COLUMN "unidadTributaria" DOUBLE PRECISION NOT NULL DEFAULT 43; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 4. Create IslrRetentionType table
CREATE TABLE IF NOT EXISTS "IslrRetentionType" (
    "id" TEXT NOT NULL,
    "codigo" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "baseImponiblePct" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "retentionPct" DOUBLE PRECISION NOT NULL,
    "sustraendoUt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "forPersonaJuridica" BOOLEAN NOT NULL DEFAULT false,
    "forPersonaResidente" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IslrRetentionType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IslrRetentionType_codigo_key" ON "IslrRetentionType"("codigo");

-- 5. Create IslrRetentionVoucher table
CREATE TABLE IF NOT EXISTS "IslrRetentionVoucher" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "serieId" TEXT,
    "status" "RetentionStatus" NOT NULL DEFAULT 'PENDING',
    "issueDate" TIMESTAMP(3),
    "retentionAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unidadTributaria" DOUBLE PRECISION NOT NULL DEFAULT 43,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IslrRetentionVoucher_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IslrRetentionVoucher_number_key" ON "IslrRetentionVoucher"("number");

-- 6. Create IslrRetentionVoucherLine table
CREATE TABLE IF NOT EXISTS "IslrRetentionVoucherLine" (
    "id" TEXT NOT NULL,
    "islrRetentionVoucherId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "islrRetentionTypeId" TEXT NOT NULL,
    "supplierInvoiceNumber" TEXT,
    "supplierControlNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "invoiceTotalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "invoiceTotalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableBaseUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableBaseBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseImponiblePct" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "retentionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sustraendoUt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sustraendoBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IslrRetentionVoucherLine_pkey" PRIMARY KEY ("id")
);

-- 7. Add ISLR fields to PurchaseBookEntry
DO $$ BEGIN ALTER TABLE "PurchaseBookEntry" ADD COLUMN "isIslrRetentionLine" BOOLEAN NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PurchaseBookEntry" ADD COLUMN "islrRetentionAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PurchaseBookEntry" ADD COLUMN "islrRetentionVoucherId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PurchaseBookEntry" ADD COLUMN "islrRetentionVoucherNumber" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 8. Foreign keys
DO $$ BEGIN ALTER TABLE "IslrRetentionVoucher" ADD CONSTRAINT "IslrRetentionVoucher_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "IslrRetentionVoucher" ADD CONSTRAINT "IslrRetentionVoucher_serieId_fkey" FOREIGN KEY ("serieId") REFERENCES "Serie"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "IslrRetentionVoucher" ADD CONSTRAINT "IslrRetentionVoucher_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "IslrRetentionVoucherLine" ADD CONSTRAINT "IslrRetentionVoucherLine_islrRetentionVoucherId_fkey" FOREIGN KEY ("islrRetentionVoucherId") REFERENCES "IslrRetentionVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "IslrRetentionVoucherLine" ADD CONSTRAINT "IslrRetentionVoucherLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "IslrRetentionVoucherLine" ADD CONSTRAINT "IslrRetentionVoucherLine_islrRetentionTypeId_fkey" FOREIGN KEY ("islrRetentionTypeId") REFERENCES "IslrRetentionType"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "PurchaseBookEntry" ADD CONSTRAINT "PurchaseBookEntry_islrRetentionVoucherId_fkey" FOREIGN KEY ("islrRetentionVoucherId") REFERENCES "IslrRetentionVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
