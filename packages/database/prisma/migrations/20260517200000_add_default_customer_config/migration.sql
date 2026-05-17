-- AlterTable: Add isDefault to Customer
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Add defaultCustomerId to CompanyConfig
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "defaultCustomerId" TEXT;
