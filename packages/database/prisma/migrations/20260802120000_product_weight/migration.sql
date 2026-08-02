-- Peso unitario del producto (kg) para la guia de carga en el PDF de factura.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "weight" DOUBLE PRECISION NOT NULL DEFAULT 0;
