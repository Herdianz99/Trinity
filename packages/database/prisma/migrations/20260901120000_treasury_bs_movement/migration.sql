-- CreateTable
CREATE TABLE IF NOT EXISTS "TreasuryBsMovement" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountBs" DOUBLE PRECISION NOT NULL,
    "counterparty" TEXT,
    "reference" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMADO',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TreasuryBsMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TreasuryBsMovement_companyId_date_idx" ON "TreasuryBsMovement"("companyId", "date");
CREATE INDEX IF NOT EXISTS "TreasuryBsMovement_date_idx" ON "TreasuryBsMovement"("date");

-- AddForeignKey (idempotente)
DO $$ BEGIN
  ALTER TABLE "TreasuryBsMovement" ADD CONSTRAINT "TreasuryBsMovement_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "TreasuryCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TreasuryBsMovement" ADD CONSTRAINT "TreasuryBsMovement_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
