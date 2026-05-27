-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SerieType" AS ENUM ('SALES', 'PURCHASES');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "Serie" ADD COLUMN IF NOT EXISTS "type" "SerieType" NOT NULL DEFAULT 'SALES';

-- Update series linked to purchase orders to PURCHASES type
UPDATE "Serie"
SET "type" = 'PURCHASES'
WHERE id IN (
  SELECT DISTINCT "serieId" FROM "PurchaseOrder" WHERE "serieId" IS NOT NULL
);
