-- Fix: Apply SQL from migrations that were marked as "applied" but never executed
-- All statements use IF NOT EXISTS so they're safe to re-run

-- Migration: 20260517200000_add_default_customer_config
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "defaultCustomerId" TEXT;

-- Migration: 20260517210000_add_paid_amount_to_credit_debit_note
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "paidAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Migration: 20260517233000_add_igtf_to_credit_debit_note
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "igtfUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "igtfBs" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Migration: 20260517234000_add_fiscal_printed_and_machine_serial
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "fiscalPrinted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "fiscalMachineSerial" TEXT;

-- Migration: 20260518000000_add_machine_serial_to_credit_note
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "machineSerial" TEXT;
