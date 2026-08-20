-- Marca por almacen: si es false, su stock NO cuenta como disponible para la venta
-- (ej: "Articulos dañados"). El POS lo excluye al mostrar existencia; sigue contando
-- en inventario fisico / kardex / reportes. Aditiva y segura (arranca en true).
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "countsForSale" BOOLEAN NOT NULL DEFAULT true;
