-- Reporte de ofertas vendidas: snapshot de Product.isOnSale en la linea de factura.
-- Gasto de nomina: enlace unico Expense -> PayrollRun. Aditiva e idempotente.
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "wasOnSale" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "payrollRunId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Expense_payrollRunId_key" ON "Expense"("payrollRunId");
DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_payrollRunId_fkey"
    FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
