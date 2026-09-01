-- AlterTable: tasa y comision en el movimiento de divisas (idempotente)
ALTER TABLE "TreasuryMovement" ADD COLUMN IF NOT EXISTS "exchangeRate" DOUBLE PRECISION;
ALTER TABLE "TreasuryMovement" ADD COLUMN IF NOT EXISTS "commissionPct" DOUBLE PRECISION;
