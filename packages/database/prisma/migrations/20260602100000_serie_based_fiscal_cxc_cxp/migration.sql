-- Serie-based fiscal for CxC/CxP: add serieId, payableId to RetentionVoucherLine, drop isFiscal

-- Add serieId to Receivable
DO $$ BEGIN
  ALTER TABLE "Receivable" ADD COLUMN "serieId" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add serieId to Payable
DO $$ BEGIN
  ALTER TABLE "Payable" ADD COLUMN "serieId" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add payableId to RetentionVoucherLine
DO $$ BEGIN
  ALTER TABLE "RetentionVoucherLine" ADD COLUMN "payableId" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Make purchaseOrderId nullable in RetentionVoucherLine
ALTER TABLE "RetentionVoucherLine" ALTER COLUMN "purchaseOrderId" DROP NOT NULL;

-- Add FK: Receivable.serieId -> Serie.id
DO $$ BEGIN
  ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_serieId_fkey"
    FOREIGN KEY ("serieId") REFERENCES "Serie"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add FK: Payable.serieId -> Serie.id
DO $$ BEGIN
  ALTER TABLE "Payable" ADD CONSTRAINT "Payable_serieId_fkey"
    FOREIGN KEY ("serieId") REFERENCES "Serie"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add FK: RetentionVoucherLine.payableId -> Payable.id
DO $$ BEGIN
  ALTER TABLE "RetentionVoucherLine" ADD CONSTRAINT "RetentionVoucherLine_payableId_fkey"
    FOREIGN KEY ("payableId") REFERENCES "Payable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Drop obsolete columns
ALTER TABLE "Receivable" DROP COLUMN IF EXISTS "isFiscal";
ALTER TABLE "Receivable" DROP COLUMN IF EXISTS "controlFiscal";
ALTER TABLE "Payable" DROP COLUMN IF EXISTS "isFiscal";
