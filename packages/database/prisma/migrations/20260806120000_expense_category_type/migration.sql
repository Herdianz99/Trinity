-- Clasificacion de categorias de gasto: FIXED (fijo) | EXTRAORDINARY (extraordinario).
-- Aditiva e idempotente. Los registros existentes quedan como 'EXTRAORDINARY' por default.
ALTER TABLE "ExpenseCategory" ADD COLUMN IF NOT EXISTS "expenseType" TEXT NOT NULL DEFAULT 'EXTRAORDINARY';
