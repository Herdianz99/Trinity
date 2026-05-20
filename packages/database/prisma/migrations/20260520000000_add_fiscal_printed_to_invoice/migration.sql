-- AlterTable
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Invoice' AND column_name = 'fiscalPrinted'
  ) THEN
    ALTER TABLE "Invoice" ADD COLUMN "fiscalPrinted" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
