-- CreateEnum: AdjustmentStatus
DO $$ BEGIN
  CREATE TYPE "AdjustmentStatus" AS ENUM ('DRAFT', 'PROCESSED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: AdjustmentType
DO $$ BEGIN
  CREATE TYPE "AdjustmentType" AS ENUM ('IN', 'OUT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable: InventoryAdjustment
CREATE TABLE IF NOT EXISTS "InventoryAdjustment" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "type" "AdjustmentType" NOT NULL,
    "status" "AdjustmentStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "processedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable: InventoryAdjustmentItem
CREATE TABLE IF NOT EXISTS "InventoryAdjustmentItem" (
    "id" TEXT NOT NULL,
    "inventoryAdjustmentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "InventoryAdjustmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryAdjustmentItem_inventoryAdjustmentId_productId_key" ON "InventoryAdjustmentItem"("inventoryAdjustmentId", "productId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "InventoryAdjustmentItem" ADD CONSTRAINT "InventoryAdjustmentItem_inventoryAdjustmentId_fkey" FOREIGN KEY ("inventoryAdjustmentId") REFERENCES "InventoryAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "InventoryAdjustmentItem" ADD CONSTRAINT "InventoryAdjustmentItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
