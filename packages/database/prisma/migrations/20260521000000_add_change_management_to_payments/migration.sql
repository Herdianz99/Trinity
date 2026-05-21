-- AlterTable: Add change management fields to Invoice
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "totalPaidUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "changeBs" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable: Add change management fields to Payment
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "changeAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "changeMethodId" TEXT;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Payment_changeMethodId_fkey'
  ) THEN
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_changeMethodId_fkey" FOREIGN KEY ("changeMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
