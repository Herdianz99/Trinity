-- AlterTable
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'CashRegister' AND column_name = 'fiscalMachineSerial'
  ) THEN
    ALTER TABLE "CashRegister" ADD COLUMN "fiscalMachineSerial" TEXT;
  END IF;
END $$;
