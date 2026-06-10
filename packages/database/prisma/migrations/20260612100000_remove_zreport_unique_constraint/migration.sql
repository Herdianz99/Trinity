-- DropIndex
DROP INDEX IF EXISTS "ZReport_zNumber_machineSerial_key";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ZReport_zNumber_machineSerial_idx" ON "ZReport"("zNumber", "machineSerial");
