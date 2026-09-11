-- BankAccount
CREATE TABLE IF NOT EXISTS "BankAccount" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "accountNumber" TEXT,
  "accountType" TEXT NOT NULL DEFAULT 'CORRIENTE',
  "currency" TEXT NOT NULL DEFAULT 'VES',
  "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "openingBalanceBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "openingBalanceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "openingDate" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- BankMovement
CREATE TABLE IF NOT EXISTS "BankMovement" (
  "id" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "direction" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "amountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "amountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "type" TEXT NOT NULL,
  "reference" TEXT,
  "description" TEXT,
  "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
  "sourceId" TEXT,
  "transferGroupId" TEXT,
  "reconciled" BOOLEAN NOT NULL DEFAULT false,
  "reconciledAt" TIMESTAMP(3),
  "reconciledById" TEXT,
  "statementDate" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BankMovement_pkey" PRIMARY KEY ("id")
);

-- PaymentMethod.bankAccountId
ALTER TABLE "PaymentMethod" ADD COLUMN IF NOT EXISTS "bankAccountId" TEXT;

-- CompanyConfig.bancosEnabled
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "bancosEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Indexes
CREATE INDEX IF NOT EXISTS "BankMovement_bankAccountId_date_idx" ON "BankMovement"("bankAccountId", "date");
CREATE INDEX IF NOT EXISTS "BankMovement_sourceType_sourceId_idx" ON "BankMovement"("sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "BankMovement_bankAccountId_reconciled_idx" ON "BankMovement"("bankAccountId", "reconciled");

-- Foreign keys (idempotente vía bloque DO)
DO $$ BEGIN
  ALTER TABLE "BankMovement" ADD CONSTRAINT "BankMovement_bankAccountId_fkey"
    FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "BankMovement" ADD CONSTRAINT "BankMovement_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "BankMovement" ADD CONSTRAINT "BankMovement_reconciledById_fkey"
    FOREIGN KEY ("reconciledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_bankAccountId_fkey"
    FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Habilitar el módulo 'bancos' para el rol ADMIN (acceso por rol; opt-in real por empresa = bancosEnabled)
UPDATE "RolePermission"
SET "modules" = array_append("modules", 'bancos')
WHERE "role" = 'ADMIN' AND NOT ('bancos' = ANY("modules"));
