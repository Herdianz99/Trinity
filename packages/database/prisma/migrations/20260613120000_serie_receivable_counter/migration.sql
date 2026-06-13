-- Correlativo de CxC (cuentas por cobrar) dirigido por la serie, con contador propio.
ALTER TABLE "Serie" ADD COLUMN IF NOT EXISTS "lastReceivableNumber" INTEGER NOT NULL DEFAULT 0;
