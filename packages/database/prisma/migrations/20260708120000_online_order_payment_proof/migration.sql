-- AlterTable: captura del pago (Pago Movil) que sube el cliente desde la tienda
ALTER TABLE "OnlineOrder" ADD COLUMN IF NOT EXISTS "paymentProofUrl" TEXT;
