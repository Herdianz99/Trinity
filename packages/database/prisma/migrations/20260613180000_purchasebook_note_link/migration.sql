-- Link de la linea del libro de compras a la nota (NCC/NDC) que la genero, para editarla luego.
ALTER TABLE "PurchaseBookEntry" ADD COLUMN IF NOT EXISTS "creditDebitNoteId" TEXT;
