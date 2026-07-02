-- ReceiptItem: FKs a comprobantes de retencion de compra
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "retentionVoucherId" TEXT;
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "islrRetentionVoucherId" TEXT;

-- IslrRetentionVoucherLine: soporte de CxP
ALTER TABLE "IslrRetentionVoucherLine" ADD COLUMN IF NOT EXISTS "payableId" TEXT;

-- appliedAt en los comprobantes
ALTER TABLE "RetentionVoucher" ADD COLUMN IF NOT EXISTS "appliedAt" TIMESTAMP(3);
ALTER TABLE "IslrRetentionVoucher" ADD COLUMN IF NOT EXISTS "appliedAt" TIMESTAMP(3);

-- Nuevos valores del enum (idempotente)
ALTER TYPE "ReceiptItemType" ADD VALUE IF NOT EXISTS 'PURCHASE_IVA_RETENTION';
ALTER TYPE "ReceiptItemType" ADD VALUE IF NOT EXISTS 'PURCHASE_ISLR_RETENTION';

-- FKs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ReceiptItem_retentionVoucherId_fkey') THEN
    ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_retentionVoucherId_fkey"
      FOREIGN KEY ("retentionVoucherId") REFERENCES "RetentionVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ReceiptItem_islrRetentionVoucherId_fkey') THEN
    ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_islrRetentionVoucherId_fkey"
      FOREIGN KEY ("islrRetentionVoucherId") REFERENCES "IslrRetentionVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'IslrRetentionVoucherLine_payableId_fkey') THEN
    ALTER TABLE "IslrRetentionVoucherLine" ADD CONSTRAINT "IslrRetentionVoucherLine_payableId_fkey"
      FOREIGN KEY ("payableId") REFERENCES "Payable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ANTI DOBLE-DESCUENTO (una sola vez): marcar como aplicados los comprobantes
-- preexistentes, para que solo los creados DESPUES aparezcan en el recibo.
-- OJO: esto va SOLO en esta migracion, NUNCA en fix-schema.sql.
UPDATE "RetentionVoucher" SET "appliedAt" = now() WHERE "appliedAt" IS NULL;
UPDATE "IslrRetentionVoucher" SET "appliedAt" = now() WHERE "appliedAt" IS NULL;
