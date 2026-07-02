-- PrintJob: invoiceId opcional + FK opcional a la nota
ALTER TABLE "PrintJob" ALTER COLUMN "invoiceId" DROP NOT NULL;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "creditDebitNoteId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PrintJob_creditDebitNoteId_fkey'
  ) THEN
    ALTER TABLE "PrintJob"
      ADD CONSTRAINT "PrintJob_creditDebitNoteId_fkey"
      FOREIGN KEY ("creditDebitNoteId") REFERENCES "CreditDebitNote"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreditDebitNote: auditoría de procesado de comandas
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "comandasProcessedAt" TIMESTAMP(3);
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "comandasProcessedById" TEXT;

-- PrintArea: área por defecto
ALTER TABLE "PrintArea" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;
