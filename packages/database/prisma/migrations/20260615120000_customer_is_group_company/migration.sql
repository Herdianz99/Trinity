-- Empresa del grupo: sus facturas se reflejan en el reporte pero no comisionan
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isGroupCompany" BOOLEAN NOT NULL DEFAULT false;
