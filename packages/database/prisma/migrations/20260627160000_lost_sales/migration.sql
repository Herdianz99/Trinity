-- Ventas perdidas / demanda insatisfecha (Sesion 74)

DO $$ BEGIN
  CREATE TYPE "LostSaleReason" AS ENUM ('SIN_STOCK', 'PRECIO_ALTO', 'DESCONTINUADO', 'PEDIDO_NO_RECIBIDO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "LostSale" (
  "id" TEXT NOT NULL,
  "productId" TEXT,
  "productName" TEXT NOT NULL,
  "productCode" TEXT,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "reason" "LostSaleReason" NOT NULL DEFAULT 'SIN_STOCK',
  "unitPriceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "unitPriceBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "estimatedUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "estimatedBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "stockAtMoment" DOUBLE PRECISION,
  "customerId" TEXT,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LostSale_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LostSale_createdAt_idx" ON "LostSale"("createdAt");
CREATE INDEX IF NOT EXISTS "LostSale_productId_idx" ON "LostSale"("productId");

DO $$ BEGIN
  ALTER TABLE "LostSale" ADD CONSTRAINT "LostSale_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LostSale" ADD CONSTRAINT "LostSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LostSale" ADD CONSTRAINT "LostSale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
