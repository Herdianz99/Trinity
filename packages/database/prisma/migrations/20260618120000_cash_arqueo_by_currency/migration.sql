-- Flag para distinguir efectivo físico (gaveta) de pagos electrónicos
ALTER TABLE "PaymentMethod" ADD COLUMN IF NOT EXISTS "isCash" BOOLEAN NOT NULL DEFAULT false;

-- Snapshot del esperado y diferencia al cerrar la sesión (auditoría de descuadres)
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "expectedUsd"   DOUBLE PRECISION;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "expectedBs"    DOUBLE PRECISION;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "differenceUsd" DOUBLE PRECISION;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "differenceBs"  DOUBLE PRECISION;

-- Marcar como efectivo los métodos de gaveta (por id de seed y por nombre, por robustez)
UPDATE "PaymentMethod"
   SET "isCash" = true
 WHERE id IN ('pm_cash_usd', 'pm_cash_bs')
    OR name IN ('Efectivo USD', 'Efectivo Bs');
