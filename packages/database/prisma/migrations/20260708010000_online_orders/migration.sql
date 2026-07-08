DO $$ BEGIN
  CREATE TYPE "OnlineOrderStatus" AS ENUM ('POR_VERIFICAR','CONFIRMADO','FACTURADO','CANCELADO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "OnlineOrder" (
  "id" TEXT PRIMARY KEY,
  "number" TEXT NOT NULL UNIQUE,
  "customerName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "cedula" TEXT,
  "deliveryMethod" TEXT NOT NULL DEFAULT 'PICKUP',
  "address" TEXT,
  "paymentRef" TEXT,
  "notes" TEXT,
  "email" TEXT,
  "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" "OnlineOrderStatus" NOT NULL DEFAULT 'POR_VERIFICAR',
  "verifiedById" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "invoiceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "OnlineOrderItem" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL REFERENCES "OnlineOrder"("id") ON DELETE CASCADE,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "priceUsd" DOUBLE PRECISION NOT NULL,
  "priceBs" DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS "OnlineOrderItem_orderId_idx" ON "OnlineOrderItem" ("orderId");
