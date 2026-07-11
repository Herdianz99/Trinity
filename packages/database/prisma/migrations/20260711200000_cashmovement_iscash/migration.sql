-- ¿El movimiento de caja afecta la gaveta física? (efectivo sí; electrónico no).
-- Se deriva del método al crear. default true = comportamiento viejo (todo era efectivo).
ALTER TABLE "CashMovement" ADD COLUMN IF NOT EXISTS "isCash" BOOLEAN NOT NULL DEFAULT true;

-- Backfill de gastos: los movimientos ligados a un gasto toman el isCash de su método.
UPDATE "CashMovement" cm
SET "isCash" = COALESCE(pm."isCash", true)
FROM "Expense" e
LEFT JOIN "PaymentMethod" pm ON pm."id" = e."methodId"
WHERE cm."expenseId" = e."id" AND e."methodId" IS NOT NULL;
