-- Recepcion de mercancia (modulo Almacen). Ficha DOCUMENTAL: NO mueve stock ni kardex.
-- Chofer/placa, proveedor que envio, lo recibido y lo devuelto por defecto/dano, con fotos.
-- Aditivo e idempotente.

CREATE TABLE IF NOT EXISTS "GoodsReceipt" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "warehouseId" TEXT,
  "supplierId" TEXT,
  "supplierName" TEXT NOT NULL,
  "driverName" TEXT,
  "truckPlate" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'REGISTRADO',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GoodsReceipt_number_key" ON "GoodsReceipt"("number");
CREATE INDEX IF NOT EXISTS "GoodsReceipt_status_idx" ON "GoodsReceipt"("status");
CREATE INDEX IF NOT EXISTS "GoodsReceipt_date_idx" ON "GoodsReceipt"("date");

CREATE TABLE IF NOT EXISTS "GoodsReceiptItem" (
  "id" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "productCode" TEXT,
  "qtyReceived" DOUBLE PRECISION NOT NULL,
  "qtyReturned" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "returnReason" TEXT,
  "note" TEXT,
  CONSTRAINT "GoodsReceiptItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GoodsReceiptItem_receiptId_idx" ON "GoodsReceiptItem"("receiptId");

CREATE TABLE IF NOT EXISTS "GoodsReceiptPhoto" (
  "id" TEXT NOT NULL,
  "receiptId" TEXT,
  "itemId" TEXT,
  "thumbKey" TEXT NOT NULL,
  "mediumKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoodsReceiptPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GoodsReceiptPhoto_receiptId_idx" ON "GoodsReceiptPhoto"("receiptId");
CREATE INDEX IF NOT EXISTS "GoodsReceiptPhoto_itemId_idx" ON "GoodsReceiptPhoto"("itemId");

-- Foreign keys (idempotentes)
DO $$ BEGIN
  ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_receiptId_fkey"
    FOREIGN KEY ("receiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "GoodsReceiptPhoto" ADD CONSTRAINT "GoodsReceiptPhoto_receiptId_fkey"
    FOREIGN KEY ("receiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "GoodsReceiptPhoto" ADD CONSTRAINT "GoodsReceiptPhoto_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "GoodsReceiptItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
