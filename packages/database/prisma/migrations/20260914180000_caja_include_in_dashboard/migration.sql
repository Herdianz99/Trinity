-- Campo para excluir cajas (ej. "caja administración") del Resumen de Caja del dashboard.
ALTER TABLE "CashRegister" ADD COLUMN IF NOT EXISTS "includeInDashboard" BOOLEAN NOT NULL DEFAULT true;

-- Auto-excluir las cajas de administración existentes (las que NO aparecen en el POS):
-- son caja chica / pagos-gastos, no la caja real de mostrador que quiere ver la gerencia.
UPDATE "CashRegister" SET "includeInDashboard" = false WHERE "showInPos" = false;
