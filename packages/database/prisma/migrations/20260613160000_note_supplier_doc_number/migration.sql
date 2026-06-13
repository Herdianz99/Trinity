-- N° de la nota que entrega el proveedor (NCC/NDC de compra), para el libro de compras.
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "supplierDocNumber" TEXT;
