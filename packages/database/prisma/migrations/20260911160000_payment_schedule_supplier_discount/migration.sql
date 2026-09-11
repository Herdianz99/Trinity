-- Descuento por proveedor en programaciones de pago
CREATE TABLE IF NOT EXISTS "PaymentScheduleSupplierDiscount" (
  "id" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "supplierName" TEXT NOT NULL,
  "discountPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentScheduleSupplierDiscount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentScheduleSupplierDiscount_scheduleId_supplierName_key"
  ON "PaymentScheduleSupplierDiscount"("scheduleId", "supplierName");

DO $$ BEGIN
  ALTER TABLE "PaymentScheduleSupplierDiscount" ADD CONSTRAINT "PaymentScheduleSupplierDiscount_scheduleId_fkey"
    FOREIGN KEY ("scheduleId") REFERENCES "PaymentSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
