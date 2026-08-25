-- Permitir adjuntar PDF (no solo imágenes) a la factura de compra.
-- Se distingue el tipo con "mimeType": "image/webp" (por defecto, filas existentes) o "application/pdf".
ALTER TABLE "PurchaseAttachment"
    ADD COLUMN IF NOT EXISTS "mimeType" TEXT NOT NULL DEFAULT 'image/webp';
