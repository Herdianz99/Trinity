-- AlterTable: Add isFiscal to CashRegister, remove currentUserId and openedAt
ALTER TABLE "CashRegister" ADD COLUMN "isFiscal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CashRegister" DROP COLUMN IF EXISTS "currentUserId";
ALTER TABLE "CashRegister" DROP COLUMN IF EXISTS "openedAt";

-- AlterTable: Rename userId to openedById in CashSession, add closedById
ALTER TABLE "CashSession" RENAME COLUMN "userId" TO "openedById";
ALTER TABLE "CashSession" ADD COLUMN "closedById" TEXT;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
