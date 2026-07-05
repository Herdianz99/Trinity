-- Credito pre-aprobado y blindado (2026-07-05)
-- Campos de credito controlados en Customer + permisos nuevos.

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isEmployee" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditAuthorizedBy" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditReviewedAt" TIMESTAMP(3);

ALTER TYPE "PermissionKey" ADD VALUE IF NOT EXISTS 'MANAGE_CUSTOMER_CREDIT';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'OVERRIDE_CREDIT_BLOCK';
