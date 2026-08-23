-- Modulo de ALMACEN (aislado, permiso 'almacen', opt-in useAlmacenOps).
-- Auditoria 5S + Reporte de daños de inventario. Aditivo e idempotente.

-- Flag opt-in por empresa
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "useAlmacenOps" BOOLEAN NOT NULL DEFAULT false;

-- Auditoria 5S
CREATE TABLE IF NOT EXISTS "Audit5S" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "zone" TEXT NOT NULL,
  "scoreCleanliness" INTEGER NOT NULL,
  "scoreOrder" INTEGER NOT NULL,
  "scoreSafety" INTEGER NOT NULL,
  "observations" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Audit5S_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Audit5S_number_key" ON "Audit5S"("number");
CREATE INDEX IF NOT EXISTS "Audit5S_date_idx" ON "Audit5S"("date");

-- Reporte de daños
CREATE TABLE IF NOT EXISTS "DamageReport" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "zone" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
  "resolution" TEXT,
  "replacementId" TEXT,
  "createdById" TEXT NOT NULL,
  "processedById" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DamageReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DamageReport_number_key" ON "DamageReport"("number");
CREATE UNIQUE INDEX IF NOT EXISTS "DamageReport_replacementId_key" ON "DamageReport"("replacementId");
CREATE INDEX IF NOT EXISTS "DamageReport_status_idx" ON "DamageReport"("status");
CREATE INDEX IF NOT EXISTS "DamageReport_date_idx" ON "DamageReport"("date");

CREATE TABLE IF NOT EXISTS "DamageReportItem" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "productCode" TEXT,
  "quantity" DOUBLE PRECISION NOT NULL,
  "note" TEXT,
  CONSTRAINT "DamageReportItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DamageReportItem_reportId_idx" ON "DamageReportItem"("reportId");

CREATE TABLE IF NOT EXISTS "DamageReportPhoto" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "thumbKey" TEXT NOT NULL,
  "mediumKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DamageReportPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DamageReportPhoto_itemId_idx" ON "DamageReportPhoto"("itemId");

-- Foreign keys (idempotentes)
DO $$ BEGIN
  ALTER TABLE "Audit5S" ADD CONSTRAINT "Audit5S_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_replacementId_fkey"
    FOREIGN KEY ("replacementId") REFERENCES "InventoryReplacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_processedById_fkey"
    FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DamageReportItem" ADD CONSTRAINT "DamageReportItem_reportId_fkey"
    FOREIGN KEY ("reportId") REFERENCES "DamageReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DamageReportItem" ADD CONSTRAINT "DamageReportItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DamageReportPhoto" ADD CONSTRAINT "DamageReportPhoto_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "DamageReportItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Habilitar el permiso 'almacen' a los roles que lo usan (idempotente).
UPDATE "RolePermission" SET modules = array_append(modules,'almacen')
WHERE role = 'WAREHOUSE' AND NOT ('almacen' = ANY(modules));
UPDATE "RolePermission" SET modules = array_append(modules,'almacen')
WHERE role = 'AUDITOR' AND NOT ('almacen' = ANY(modules));
