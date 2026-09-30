-- Aprobacion de traspasos bancarios: cuentas que exigen aceptar (con clave dinamica) los
-- ingresos por traspaso. Aditiva e idempotente.
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'APPROVE_BANK_TRANSFER';

ALTER TABLE "BankAccount" ADD COLUMN IF NOT EXISTS "requiresTransferApproval" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "BankMovement" ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "BankMovement" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "BankMovement" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;
ALTER TABLE "BankMovement" ADD COLUMN IF NOT EXISTS "approvalKeyName" TEXT;
ALTER TABLE "BankMovement" ADD COLUMN IF NOT EXISTS "approvalNote" TEXT;

DO $$ BEGIN
  ALTER TABLE "BankMovement" ADD CONSTRAINT "BankMovement_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
