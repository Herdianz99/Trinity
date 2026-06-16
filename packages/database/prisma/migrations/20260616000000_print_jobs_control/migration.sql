-- Nuevo valor del enum
ALTER TYPE "PrintStatus" ADD VALUE IF NOT EXISTS 'PRINTING';

-- Columnas nuevas en PrintJob
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "isReprint" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "reprintOfId" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

-- Backfill de updatedAt para filas existentes y luego enforce NOT NULL
UPDATE "PrintJob" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "PrintJob" ALTER COLUMN "updatedAt" SET NOT NULL;
