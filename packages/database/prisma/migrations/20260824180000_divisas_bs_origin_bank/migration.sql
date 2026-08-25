-- Modulo divisas: soporte de Bs (cargas por empresa + Bs gastado por movimiento) y
-- maestro de "Banco de origen". Todo aditivo e idempotente.

-- Maestro de banco de origen (Bs)
CREATE TABLE IF NOT EXISTS "TreasuryOriginBank" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TreasuryOriginBank_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TreasuryOriginBank_name_key" ON "TreasuryOriginBank"("name");

-- Cargas de Bs por empresa
CREATE TABLE IF NOT EXISTS "TreasuryBsLoad" (
  "id"          TEXT NOT NULL,
  "date"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "companyId"   TEXT NOT NULL,
  "amountBs"    DOUBLE PRECISION NOT NULL,
  "note"        TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TreasuryBsLoad_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TreasuryBsLoad_companyId_date_idx" ON "TreasuryBsLoad"("companyId", "date");
DO $$ BEGIN
  ALTER TABLE "TreasuryBsLoad" ADD CONSTRAINT "TreasuryBsLoad_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "TreasuryCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Nuevas columnas en el movimiento: Bs gastado + banco de origen
ALTER TABLE "TreasuryMovement" ADD COLUMN IF NOT EXISTS "amountBs" DOUBLE PRECISION;
ALTER TABLE "TreasuryMovement" ADD COLUMN IF NOT EXISTS "originBankId" TEXT;
DO $$ BEGIN
  ALTER TABLE "TreasuryMovement" ADD CONSTRAINT "TreasuryMovement_originBankId_fkey"
    FOREIGN KEY ("originBankId") REFERENCES "TreasuryOriginBank"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
