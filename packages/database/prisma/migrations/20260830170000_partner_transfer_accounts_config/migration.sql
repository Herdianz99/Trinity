-- Configuracion de CxC/CxP en traslados entre empresas socias.
-- Aditiva e idempotente (IF NOT EXISTS). Default true = preserva el comportamiento actual
-- (los traslados generan cuentas); las empresas que solo mueven mercancia lo apagan.
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "partnerTransferCreatesAccounts" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "partnerTransferCustomerId" TEXT;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "partnerTransferSupplierId" TEXT;
