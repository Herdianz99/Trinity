-- La nota de crédito guarda el descuento de la línea (copia de InvoiceItem.discountPct)
-- para poder mandarlo a la máquina fiscal (comando p-) y mostrarlo en el PDF, igual que la factura.
ALTER TABLE "CreditDebitNoteItem" ADD COLUMN IF NOT EXISTS "discountPct" DOUBLE PRECISION NOT NULL DEFAULT 0;
