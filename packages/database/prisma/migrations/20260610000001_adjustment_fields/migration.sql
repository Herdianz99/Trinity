-- Renombrar reason a description
DO $$ BEGIN
  ALTER TABLE "InventoryAdjustment" RENAME COLUMN "reason" TO "description";
EXCEPTION
  WHEN undefined_column THEN
    -- Si reason no existe, agregar description
    ALTER TABLE "InventoryAdjustment" ADD COLUMN IF NOT EXISTS "description" TEXT;
END $$;

-- Agregar campos de cliente y proveedor
ALTER TABLE "InventoryAdjustment" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "InventoryAdjustment" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
