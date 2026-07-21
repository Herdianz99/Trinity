-- Motivo de la devolución de ventas (NCV): enum + columna en CreditDebitNote. Aditiva.
DO $$ BEGIN
  CREATE TYPE "SalesReturnReason" AS ENUM ('ASESORIA', 'CLIENTE', 'FALTANTE_ALMACEN', 'PRODUCTO_DEFECTUOSO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "motivo" "SalesReturnReason";
