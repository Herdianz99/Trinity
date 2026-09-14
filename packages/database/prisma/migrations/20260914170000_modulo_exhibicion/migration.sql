-- Estado de exhibicion en Product (aditivo, idempotente)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isExhibited" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "exhibitedSince" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "exhibitionLocation" TEXT;

-- Enums (guardados por si ya existen)
DO $$ BEGIN
  CREATE TYPE "ExhibitionAction" AS ENUM ('PLACED', 'REMOVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ExhibitionReason" AS ENUM ('SOLD', 'DAMAGED', 'ROTATION', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Bitacora
CREATE TABLE IF NOT EXISTS "ExhibitionEntry" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "action" "ExhibitionAction" NOT NULL,
  "location" TEXT,
  "reason" "ExhibitionReason",
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "ExhibitionEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExhibitionEntry_createdAt_idx" ON "ExhibitionEntry"("createdAt");
CREATE INDEX IF NOT EXISTS "ExhibitionEntry_productId_idx" ON "ExhibitionEntry"("productId");
CREATE INDEX IF NOT EXISTS "ExhibitionEntry_action_idx" ON "ExhibitionEntry"("action");

DO $$ BEGIN
  ALTER TABLE "ExhibitionEntry" ADD CONSTRAINT "ExhibitionEntry_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ExhibitionEntry" ADD CONSTRAINT "ExhibitionEntry_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
