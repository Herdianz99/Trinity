-- Restore unique constraint on ZReport (was removed by mistake)
DROP INDEX IF EXISTS "ZReport_zNumber_machineSerial_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "ZReport_zNumber_machineSerial_key" ON "ZReport"("zNumber", "machineSerial");
