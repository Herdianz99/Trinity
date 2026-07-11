-- Caja de administración: showInPos=false NO aparece en el POS (se usa para pagar proveedores/gastos).
ALTER TABLE "CashRegister" ADD COLUMN IF NOT EXISTS "showInPos" BOOLEAN NOT NULL DEFAULT true;
