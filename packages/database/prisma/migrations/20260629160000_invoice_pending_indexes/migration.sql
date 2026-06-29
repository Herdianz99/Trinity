-- Indices para acelerar el calculo de "Disponible" (stock - reservado en facturas
-- en espera) y la lista de facturas en espera (Sesion 81). Sin estos, encontrar las
-- facturas PENDING y sus items implica escanear todo el historial; con el volumen de
-- la tienda grande eso crece. IF NOT EXISTS para idempotencia (red de seguridad).
CREATE INDEX IF NOT EXISTS "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX IF NOT EXISTS "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");
