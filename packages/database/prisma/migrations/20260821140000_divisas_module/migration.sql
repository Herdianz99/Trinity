-- Modulo COMPRA DE DIVISAS / TESORERIA (aislado, permiso 'divisas'). Aditivo e idempotente.

CREATE TABLE IF NOT EXISTS "TreasuryCompany" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TreasuryCompany_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TreasuryCompany_name_key" ON "TreasuryCompany"("name");

CREATE TABLE IF NOT EXISTS "TreasuryBank" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TreasuryBank_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TreasuryBank_name_key" ON "TreasuryBank"("name");

CREATE TABLE IF NOT EXISTS "TreasuryMovement" (
  "id" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "companyId" TEXT NOT NULL,
  "bankId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amountUsd" DOUBLE PRECISION NOT NULL,
  "modalidad" TEXT,
  "counterparty" TEXT,
  "reference" TEXT,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMADO',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TreasuryMovement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TreasuryMovement_companyId_date_idx" ON "TreasuryMovement"("companyId","date");
CREATE INDEX IF NOT EXISTS "TreasuryMovement_bankId_date_idx" ON "TreasuryMovement"("bankId","date");
CREATE INDEX IF NOT EXISTS "TreasuryMovement_date_idx" ON "TreasuryMovement"("date");

DO $$ BEGIN
  ALTER TABLE "TreasuryMovement" ADD CONSTRAINT "TreasuryMovement_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "TreasuryCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TreasuryMovement" ADD CONSTRAINT "TreasuryMovement_bankId_fkey"
    FOREIGN KEY ("bankId") REFERENCES "TreasuryBank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TreasuryMovement" ADD CONSTRAINT "TreasuryMovement_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Habilitar el modulo 'divisas' al rol ADMIN existente (idempotente).
UPDATE "RolePermission" SET modules = array_append(modules,'divisas')
WHERE role = 'ADMIN' AND NOT ('divisas' = ANY(modules));
