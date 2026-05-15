-- AlterTable: CashRegister - add isShared
ALTER TABLE "CashRegister" ADD COLUMN "isShared" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: CashSession - split balance into USD/Bs
ALTER TABLE "CashSession" ADD COLUMN "openingBalanceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CashSession" ADD COLUMN "openingBalanceBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CashSession" ADD COLUMN "closingBalanceUsd" DOUBLE PRECISION;
ALTER TABLE "CashSession" ADD COLUMN "closingBalanceBs" DOUBLE PRECISION;

-- Migrate existing data: copy openingBalance -> openingBalanceUsd, closingBalance -> closingBalanceUsd
UPDATE "CashSession" SET "openingBalanceUsd" = "openingBalance";
UPDATE "CashSession" SET "closingBalanceUsd" = "closingBalance" WHERE "closingBalance" IS NOT NULL;

-- Drop old columns
ALTER TABLE "CashSession" DROP COLUMN "openingBalance";
ALTER TABLE "CashSession" DROP COLUMN "closingBalance";
