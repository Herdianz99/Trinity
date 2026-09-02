-- IP-lock por usuario (acceso solo en sitio). Aditivo, defaults inofensivos.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "restrictToOnSiteIp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "allowedIps" TEXT NOT NULL DEFAULT '';
