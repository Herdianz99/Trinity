-- Libro mayor de caja (tabla madre del arqueo). Cada linea de pago/movimiento escribe una fila.
DO $$ BEGIN CREATE TYPE "CashDir" AS ENUM ('IN','OUT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CashLedgerEntry" (
  "id" TEXT NOT NULL,
  "cashSessionId" TEXT NOT NULL,
  "direction" "CashDir" NOT NULL,
  "amountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "amountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL,
  "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "methodId" TEXT,
  "isCash" BOOLEAN NOT NULL DEFAULT true,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "reason" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashLedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CashLedgerEntry_cashSessionId_idx" ON "CashLedgerEntry"("cashSessionId");
CREATE INDEX IF NOT EXISTS "CashLedgerEntry_sourceType_sourceId_idx" ON "CashLedgerEntry"("sourceType","sourceId");

DO $$ BEGIN ALTER TABLE "CashLedgerEntry" ADD CONSTRAINT "CashLedgerEntry_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CashLedgerEntry" ADD CONSTRAINT "CashLedgerEntry_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Interruptor del arqueo por ledger (default false = método viejo hasta validar).
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "useCashLedger" BOOLEAN NOT NULL DEFAULT false;
