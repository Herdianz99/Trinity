-- Metodo de pago del proveedor: texto libre (como se le paga). Aditiva y segura (nullable).
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
