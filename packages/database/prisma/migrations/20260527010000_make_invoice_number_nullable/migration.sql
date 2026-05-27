-- AlterTable: make Invoice.number nullable for pre-invoices without correlative
ALTER TABLE "Invoice" ALTER COLUMN "number" DROP NOT NULL;
