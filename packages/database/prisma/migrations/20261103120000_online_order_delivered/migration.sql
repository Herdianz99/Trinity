-- Pedidos online: estado ENTREGADO (Session 178). Se marca desde FACTURADO cuando la factura
-- ya esta cobrada; guarda cuando y quien. Aditiva e idempotente.
ALTER TYPE "OnlineOrderStatus" ADD VALUE IF NOT EXISTS 'ENTREGADO';
ALTER TABLE "OnlineOrder" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "OnlineOrder" ADD COLUMN IF NOT EXISTS "deliveredById" TEXT;
