-- Gastos a credito: el gasto se le debe a un proveedor y genera una CxP (Payable).
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "isCredit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "creditDays" INTEGER;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;

-- Payable puede originarse de un gasto (ademas de una orden de compra).
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "expenseId" TEXT;

-- FKs (idempotentes)
DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Payable" ADD CONSTRAINT "Payable_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Unicidad de expenseId en Payable (1 gasto -> 1 CxP)
CREATE UNIQUE INDEX IF NOT EXISTS "Payable_expenseId_key" ON "Payable"("expenseId");
