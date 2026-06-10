-- AlterTable: Add islrConceptId to Supplier
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Supplier' AND column_name = 'islrConceptId'
  ) THEN
    ALTER TABLE "Supplier" ADD COLUMN "islrConceptId" TEXT;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Supplier_islrConceptId_fkey'
  ) THEN
    ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_islrConceptId_fkey"
      FOREIGN KEY ("islrConceptId") REFERENCES "IslrRetentionType"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
