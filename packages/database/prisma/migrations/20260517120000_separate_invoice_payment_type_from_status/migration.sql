-- CreateEnum: InvoicePaymentType
CREATE TYPE "InvoicePaymentType" AS ENUM ('CASH', 'CREDIT');

-- Add paymentType column to Invoice
ALTER TABLE "Invoice" ADD COLUMN "paymentType" "InvoicePaymentType" NOT NULL DEFAULT 'CASH';

-- Migrate data: set paymentType for CREDIT invoices
UPDATE "Invoice" SET "paymentType" = 'CREDIT' WHERE status = 'CREDIT';

-- Convert status column to TEXT for migration
ALTER TABLE "Invoice" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Invoice" ALTER COLUMN "status" TYPE TEXT;

-- Migrate status values
UPDATE "Invoice" SET status = 'PAID' WHERE status = 'CREDIT';
UPDATE "Invoice" SET status = 'PENDING' WHERE status = 'DRAFT';
UPDATE "Invoice" SET status = 'PARTIAL_RETURN' WHERE status = 'PARTIALLY_RETURNED';
UPDATE "Invoice" SET status = 'PENDING' WHERE status = 'PARTIAL';

-- Drop old enum and create updated one
DROP TYPE "InvoiceStatus";
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'PARTIAL_RETURN', 'RETURNED', 'CANCELLED');

-- Convert column back to enum
ALTER TABLE "Invoice" ALTER COLUMN "status" TYPE "InvoiceStatus" USING status::"InvoiceStatus";
ALTER TABLE "Invoice" ALTER COLUMN "status" SET DEFAULT 'PENDING';
