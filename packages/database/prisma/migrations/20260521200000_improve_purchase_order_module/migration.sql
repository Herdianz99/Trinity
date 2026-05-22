-- AlterTable: Product - add isService
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Product' AND column_name='isService') THEN
    ALTER TABLE "Product" ADD COLUMN "isService" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- AlterTable: PurchaseOrder - add invoiceDate, receivedDate, currency, surchargeUsd, surchargeDistribution, totalWithSurchargeUsd
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='PurchaseOrder' AND column_name='invoiceDate') THEN
    ALTER TABLE "PurchaseOrder" ADD COLUMN "invoiceDate" TIMESTAMP(3);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='PurchaseOrder' AND column_name='receivedDate') THEN
    ALTER TABLE "PurchaseOrder" ADD COLUMN "receivedDate" TIMESTAMP(3);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='PurchaseOrder' AND column_name='currency') THEN
    ALTER TABLE "PurchaseOrder" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='PurchaseOrder' AND column_name='surchargeUsd') THEN
    ALTER TABLE "PurchaseOrder" ADD COLUMN "surchargeUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='PurchaseOrder' AND column_name='surchargeDistribution') THEN
    ALTER TABLE "PurchaseOrder" ADD COLUMN "surchargeDistribution" TEXT NOT NULL DEFAULT 'PROPORTIONAL';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='PurchaseOrder' AND column_name='totalWithSurchargeUsd') THEN
    ALTER TABLE "PurchaseOrder" ADD COLUMN "totalWithSurchargeUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Update PurchaseOrder.exchangeRate default from 0 to 1
ALTER TABLE "PurchaseOrder" ALTER COLUMN "exchangeRate" SET DEFAULT 1;

-- AlterTable: StockMovement - change costUsd to non-nullable with default, add stockAfter
DO $$ BEGIN
  ALTER TABLE "StockMovement" ALTER COLUMN "costUsd" SET NOT NULL;
  ALTER TABLE "StockMovement" ALTER COLUMN "costUsd" SET DEFAULT 0;
  UPDATE "StockMovement" SET "costUsd" = 0 WHERE "costUsd" IS NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StockMovement' AND column_name='stockAfter') THEN
    ALTER TABLE "StockMovement" ADD COLUMN "stockAfter" DOUBLE PRECISION NOT NULL DEFAULT 0;
  END IF;
END $$;
