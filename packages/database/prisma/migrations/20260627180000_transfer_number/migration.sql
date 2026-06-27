-- Correlativo amigable para transferencias (Sesion 75)
ALTER TABLE "Transfer" ADD COLUMN IF NOT EXISTS "number" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Transfer_number_key" ON "Transfer"("number");
