-- Datos de Pago Movil que la tienda online muestra en el checkout.
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "storePagoMovilBank" TEXT;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "storePagoMovilRif" TEXT;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "storePagoMovilPhone" TEXT;
