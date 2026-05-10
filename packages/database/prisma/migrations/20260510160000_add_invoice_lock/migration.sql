-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "lockedById" TEXT,
ADD COLUMN "lockedAt" TIMESTAMP(3);
