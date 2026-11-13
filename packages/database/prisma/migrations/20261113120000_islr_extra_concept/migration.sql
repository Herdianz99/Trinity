-- Conceptos adicionales en un comprobante de retencion ISLR (base manual sobre la misma factura).
ALTER TABLE "IslrRetentionVoucherLine" ADD COLUMN IF NOT EXISTS "isExtraConcept" BOOLEAN NOT NULL DEFAULT false;
