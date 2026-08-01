-- Traslados de inventario entre empresas socias (integracion). Tabla auxiliar,
-- aditiva; sin FK a Product/Warehouse (items = snapshot JSON, warehouses por id).
CREATE TABLE IF NOT EXISTS "PartnerTransfer" (
  "id"              TEXT NOT NULL,
  "number"          TEXT NOT NULL,
  "kind"            TEXT NOT NULL,
  "direction"       TEXT NOT NULL,
  "status"          TEXT NOT NULL,
  "partnerName"     TEXT NOT NULL,
  "notes"           TEXT,
  "items"           JSONB NOT NULL,
  "fromWarehouseId" TEXT,
  "toWarehouseId"   TEXT,
  "notified"        BOOLEAN NOT NULL DEFAULT false,
  "createdById"     TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerTransfer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerTransfer_number_key" ON "PartnerTransfer"("number");
