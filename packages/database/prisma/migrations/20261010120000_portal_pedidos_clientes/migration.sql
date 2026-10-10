-- Portal de pedidos para clientes (mayorista). Aditivo e idempotente.

-- 1) Rol CLIENT
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CLIENT';

-- 2) User -> Customer (usuario del portal)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_customerId_key" ON "User"("customerId");
DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Vendedor asignado al cliente
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "sellerId" TEXT;
CREATE INDEX IF NOT EXISTS "Customer_sellerId_idx" ON "Customer"("sellerId");
DO $$ BEGIN
  ALTER TABLE "Customer" ADD CONSTRAINT "Customer_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Marcas del pedido del portal en la factura en espera
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "fromPortal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "portalNote" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "clientUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "staffSeenAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Invoice_fromPortal_status_idx" ON "Invoice"("fromPortal", "status");

-- 5) Flags de empresa
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "clientPortalEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "keepPendingInvoices" BOOLEAN NOT NULL DEFAULT false;

-- 6) Modulo 'pedidos-clientes' a los roles existentes (ADMIN puede tener lista explicita, no '*')
UPDATE "RolePermission" SET modules = array_append(modules, 'pedidos-clientes')
WHERE role IN ('ADMIN','SUPERVISOR','CASHIER','SELLER') AND NOT ('pedidos-clientes' = ANY(modules));
