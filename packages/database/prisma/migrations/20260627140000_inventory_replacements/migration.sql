-- Reemplazos de inventario (Sesion 71)
-- Canje: sale un articulo y entra otro en su lugar (ej. 2 rollos -> 200 metros)

-- 1. Nuevos valores del enum MovementType
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'REPLACEMENT_IN';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'REPLACEMENT_OUT';

-- 2. Enum de estado del reemplazo
DO $$ BEGIN
  CREATE TYPE "ReplacementStatus" AS ENUM ('DRAFT', 'PROCESSED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Tablas
CREATE TABLE IF NOT EXISTS "InventoryReplacement" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "status" "ReplacementStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL,
  "processedById" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryReplacement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryReplacement_number_key" ON "InventoryReplacement"("number");

CREATE TABLE IF NOT EXISTS "InventoryReplacementItem" (
  "id" TEXT NOT NULL,
  "replacementId" TEXT NOT NULL,
  "outProductId" TEXT NOT NULL,
  "outQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "outCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "inProductId" TEXT NOT NULL,
  "inQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "inCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  CONSTRAINT "InventoryReplacementItem_pkey" PRIMARY KEY ("id")
);

-- 4. Foreign keys (idempotentes)
DO $$ BEGIN
  ALTER TABLE "InventoryReplacement" ADD CONSTRAINT "InventoryReplacement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InventoryReplacementItem" ADD CONSTRAINT "InventoryReplacementItem_replacementId_fkey" FOREIGN KEY ("replacementId") REFERENCES "InventoryReplacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InventoryReplacementItem" ADD CONSTRAINT "InventoryReplacementItem_outProductId_fkey" FOREIGN KEY ("outProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InventoryReplacementItem" ADD CONSTRAINT "InventoryReplacementItem_inProductId_fkey" FOREIGN KEY ("inProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
