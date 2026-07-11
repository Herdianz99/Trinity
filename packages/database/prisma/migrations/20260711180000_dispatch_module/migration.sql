-- Despachos / comandas por retirar: mercancia pagada que el cliente retira despues
-- (posiblemente por partes). NO toca inventario (el stock ya salio al cobrar la factura).
DO $$ BEGIN CREATE TYPE "DispatchStatus" AS ENUM ('PENDIENTE','PARCIAL','COMPLETADO','CANCELADO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Dispatch" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "status" "DispatchStatus" NOT NULL DEFAULT 'PENDIENTE',
  "scheduledDate" TIMESTAMP(3),
  "contactName" TEXT,
  "contactPhone" TEXT,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Dispatch_number_key" ON "Dispatch"("number");
CREATE UNIQUE INDEX IF NOT EXISTS "Dispatch_invoiceId_key" ON "Dispatch"("invoiceId");
CREATE INDEX IF NOT EXISTS "Dispatch_status_idx" ON "Dispatch"("status");

CREATE TABLE IF NOT EXISTS "DispatchItem" (
  "id" TEXT NOT NULL,
  "dispatchId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "productCode" TEXT,
  "printAreaId" TEXT,
  "printAreaName" TEXT,
  "quantityInvoiced" DOUBLE PRECISION NOT NULL,
  "quantityDelivered" DOUBLE PRECISION NOT NULL DEFAULT 0,
  CONSTRAINT "DispatchItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DispatchItem_dispatchId_idx" ON "DispatchItem"("dispatchId");
CREATE INDEX IF NOT EXISTS "DispatchItem_printAreaId_idx" ON "DispatchItem"("printAreaId");

CREATE TABLE IF NOT EXISTS "DispatchDelivery" (
  "id" TEXT NOT NULL,
  "dispatchId" TEXT NOT NULL,
  "deliveredById" TEXT NOT NULL,
  "note" TEXT,
  "lines" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DispatchDelivery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DispatchDelivery_dispatchId_idx" ON "DispatchDelivery"("dispatchId");

DO $$ BEGIN ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "DispatchDelivery" ADD CONSTRAINT "DispatchDelivery_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "DispatchDelivery" ADD CONSTRAINT "DispatchDelivery_deliveredById_fkey" FOREIGN KEY ("deliveredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
