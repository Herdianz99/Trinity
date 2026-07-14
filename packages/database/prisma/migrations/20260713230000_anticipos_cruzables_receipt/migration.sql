-- Anticipos cruzables en recibos + permisos de borrado con clave dinamica
-- Aditiva e idempotente (IF NOT EXISTS). PG12+ permite ALTER TYPE ADD VALUE en transaccion.

-- Nuevos itemTypes de recibo para cruzar anticipos
ALTER TYPE "ReceiptItemType" ADD VALUE IF NOT EXISTS 'CUSTOMER_ADVANCE';
ALTER TYPE "ReceiptItemType" ADD VALUE IF NOT EXISTS 'SUPPLIER_ADVANCE';

-- Nuevos permisos de clave dinamica para borrar anticipos
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'DELETE_CUSTOMER_ADVANCE';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'DELETE_SUPPLIER_ADVANCE';

-- FKs del ReceiptItem hacia los anticipos
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "customerAdvanceId" TEXT;
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "supplierAdvanceId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReceiptItem_customerAdvanceId_fkey') THEN
    ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_customerAdvanceId_fkey"
      FOREIGN KEY ("customerAdvanceId") REFERENCES "CustomerAdvance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReceiptItem_supplierAdvanceId_fkey') THEN
    ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_supplierAdvanceId_fkey"
      FOREIGN KEY ("supplierAdvanceId") REFERENCES "SupplierAdvance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
