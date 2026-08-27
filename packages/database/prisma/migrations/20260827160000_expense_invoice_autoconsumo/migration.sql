-- Autoconsumo: enlaza el gasto generado al facturar a una empresa del grupo con su factura de origen.
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "invoiceId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Expense_invoiceId_fkey' AND table_name = 'Expense'
  ) THEN
    ALTER TABLE "Expense"
      ADD CONSTRAINT "Expense_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Expense_invoiceId_idx" ON "Expense"("invoiceId");
