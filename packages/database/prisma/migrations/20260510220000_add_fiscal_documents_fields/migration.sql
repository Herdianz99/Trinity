-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN "supplierControlNumber" TEXT,
ADD COLUMN "islrRetentionPct" DOUBLE PRECISION,
ADD COLUMN "islrRetentionUsd" DOUBLE PRECISION,
ADD COLUMN "islrRetentionBs" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "CompanyConfig" ADD COLUMN "islrRetentionPct" DOUBLE PRECISION NOT NULL DEFAULT 0;
