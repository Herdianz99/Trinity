-- Fecha que se MUESTRA en el libro de compras (fecha original del proveedor).
-- entryDate sigue siendo el periodo/declaracion (en CxP = fecha recepcion).
-- Si documentDate es null, el display cae a entryDate (compras/notas/filas viejas sin cambios).
ALTER TABLE "PurchaseBookEntry" ADD COLUMN IF NOT EXISTS "documentDate" TIMESTAMP(3);
