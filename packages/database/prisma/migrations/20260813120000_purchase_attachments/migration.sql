-- Imágenes adjuntas a la factura de compra (foto/escaneo de la factura física del proveedor).
CREATE TABLE IF NOT EXISTS "PurchaseAttachment" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "thumbKey" TEXT NOT NULL,
    "fullKey" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PurchaseAttachment_purchaseOrderId_idx" ON "PurchaseAttachment"("purchaseOrderId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'PurchaseAttachment_purchaseOrderId_fkey'
    ) THEN
        ALTER TABLE "PurchaseAttachment"
            ADD CONSTRAINT "PurchaseAttachment_purchaseOrderId_fkey"
            FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'PurchaseAttachment_uploadedById_fkey'
    ) THEN
        ALTER TABLE "PurchaseAttachment"
            ADD CONSTRAINT "PurchaseAttachment_uploadedById_fkey"
            FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
