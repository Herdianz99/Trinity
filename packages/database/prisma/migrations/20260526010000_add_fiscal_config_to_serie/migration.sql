-- Add fiscal config columns to Serie
ALTER TABLE "Serie" ADD COLUMN IF NOT EXISTS "comPort" TEXT;
ALTER TABLE "Serie" ADD COLUMN IF NOT EXISTS "fiscalMachineSerial" TEXT;

-- Migrate existing data from CashRegister to Serie
UPDATE "Serie" s
SET "comPort" = cr."comPort",
    "fiscalMachineSerial" = cr."fiscalMachineSerial"
FROM "CashRegister" cr
WHERE s."cashRegisterId" = cr."id"
  AND (cr."comPort" IS NOT NULL OR cr."fiscalMachineSerial" IS NOT NULL);

-- Drop columns from CashRegister
ALTER TABLE "CashRegister" DROP COLUMN IF EXISTS "comPort";
ALTER TABLE "CashRegister" DROP COLUMN IF EXISTS "fiscalMachineSerial";
