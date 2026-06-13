-- Serie alfanumerica de la factura del proveedor (ej. "A") en libro de compras y CxP.
ALTER TABLE "PurchaseBookEntry" ADD COLUMN IF NOT EXISTS "supplierSerie" TEXT;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "serieProveedor" TEXT;
