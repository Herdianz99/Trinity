-- Flag opt-in por empresa: exigir direccion del cliente (aviso en POS, patron del telefono).
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "requireCustomerAddress" BOOLEAN NOT NULL DEFAULT false;
