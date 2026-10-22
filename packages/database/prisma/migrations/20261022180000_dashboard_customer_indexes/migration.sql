-- Dashboard gerencial: el KPI "Clientes nuevos" (Customer.createdAt + EXISTS en Invoice.customerId)
-- tardaba 20-45 s con estadisticas viejas de Customer (plan nested loop sin indice). Aditivo e idempotente.
CREATE INDEX IF NOT EXISTS "Customer_createdAt_idx" ON "Customer"("createdAt");
CREATE INDEX IF NOT EXISTS "Invoice_customerId_idx" ON "Invoice"("customerId");
