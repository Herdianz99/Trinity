-- Fotos de productos (Fase 1) — tabla ProductImage + denormalizacion en Product

CREATE TABLE IF NOT EXISTS "ProductImage" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "thumbKey" TEXT NOT NULL,
  "mediumKey" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "bytes" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductImage_productId_idx" ON "ProductImage"("productId");

DO $$ BEGIN
  ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "primaryImageThumbUrl" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "primaryImageMediumUrl" TEXT;
