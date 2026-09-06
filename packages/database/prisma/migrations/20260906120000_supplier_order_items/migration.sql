-- Lista de Pedidos a Proveedor (Sesion 121).
-- Tabla liviana de seguimiento de pedidos a proveedor, consultable por ventas.
-- Aditiva e idempotente. Ver spec: docs/superpowers/specs/2026-09-06-lista-pedidos-proveedor-design.md

-- Enum de estado (PENDING = en transito / pedido, RECEIVED = recibido)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupplierOrderStatus') THEN
    CREATE TYPE "SupplierOrderStatus" AS ENUM ('PENDING', 'RECEIVED');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "SupplierOrderItem" (
  "id"                      TEXT NOT NULL,
  "supplierRef"             TEXT NOT NULL,
  "productId"               TEXT,
  "productCode"             TEXT,
  "description"             TEXT NOT NULL,
  "quantityOrdered"         DOUBLE PRECISION NOT NULL,
  "unitCost"                DOUBLE PRECISION,
  "supplierName"            TEXT,
  "observation"             TEXT,
  "status"                  "SupplierOrderStatus" NOT NULL DEFAULT 'PENDING',
  "orderedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "receivedAt"              TIMESTAMP(3),
  "quantityReceived"        DOUBLE PRECISION,
  "receivedPurchaseOrderId" TEXT,
  "createdById"             TEXT,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupplierOrderItem_status_idx" ON "SupplierOrderItem"("status");
CREATE INDEX IF NOT EXISTS "SupplierOrderItem_supplierRef_idx" ON "SupplierOrderItem"("supplierRef");
CREATE INDEX IF NOT EXISTS "SupplierOrderItem_orderedAt_idx" ON "SupplierOrderItem"("orderedAt");

-- FKs (idempotentes)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierOrderItem_productId_fkey') THEN
    ALTER TABLE "SupplierOrderItem"
      ADD CONSTRAINT "SupplierOrderItem_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierOrderItem_createdById_fkey') THEN
    ALTER TABLE "SupplierOrderItem"
      ADD CONSTRAINT "SupplierOrderItem_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

-- Habilitar el permiso 'pedidos' en los roles que deben verlo/gestionarlo, sin pisar
-- lo ya configurado (idempotente). Ver: compras/ventas ven la lista; edicion la controla
-- el guard de rol en el API, no el permiso de modulo.
UPDATE "RolePermission"
SET "modules" = array_append("modules", 'pedidos')
WHERE "role" IN ('ADMIN', 'SUPERVISOR', 'BUYER', 'ACCOUNTANT', 'SELLER', 'CASHIER')
  AND NOT ('pedidos' = ANY("modules"));
