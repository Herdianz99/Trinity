-- Gasto de autoconsumo al facturar a una empresa del grupo: ahora opt-in por empresa (aditiva e idempotente).
-- Default false en todas; en la grande (trinity_db) se activa despues del deploy.
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "groupAutoConsumptionExpense" BOOLEAN NOT NULL DEFAULT false;
