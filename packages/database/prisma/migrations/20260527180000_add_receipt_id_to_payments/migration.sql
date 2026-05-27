-- AlterTable: Add receiptId to ReceivablePayment
ALTER TABLE "ReceivablePayment" ADD COLUMN IF NOT EXISTS "receiptId" TEXT;

-- AlterTable: Add receiptId to PayablePayment
ALTER TABLE "PayablePayment" ADD COLUMN IF NOT EXISTS "receiptId" TEXT;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ReceivablePayment_receiptId_fkey'
  ) THEN
    ALTER TABLE "ReceivablePayment" ADD CONSTRAINT "ReceivablePayment_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PayablePayment_receiptId_fkey'
  ) THEN
    ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
