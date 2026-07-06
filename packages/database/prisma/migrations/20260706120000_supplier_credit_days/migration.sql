-- Dias de credito por defecto del proveedor (autorellena la forma de pago en compras)
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "creditDays" INTEGER NOT NULL DEFAULT 0;
