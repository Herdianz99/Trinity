-- AlterTable: distinguir movimiento simple (transferencia USD) de compra de divisas (idempotente)
ALTER TABLE "TreasuryMovement" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'MOVIMIENTO';
