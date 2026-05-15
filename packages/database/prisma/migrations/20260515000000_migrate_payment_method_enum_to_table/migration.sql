-- Migration: PaymentMethod enum → PaymentMethod table
-- Also removes FiscalPaymentMethod table (replaced by PaymentMethod.fiscalCode)

-- Step 1: Rename existing enum columns to temporary text columns
-- This preserves the data while we restructure
ALTER TABLE "Payment" ADD COLUMN "method_old" TEXT;
UPDATE "Payment" SET "method_old" = "method"::text;
ALTER TABLE "Payment" DROP COLUMN "method";

ALTER TABLE "ReceivablePayment" ADD COLUMN "method_old" TEXT;
UPDATE "ReceivablePayment" SET "method_old" = "method"::text;
ALTER TABLE "ReceivablePayment" DROP COLUMN "method";

ALTER TABLE "PayablePayment" ADD COLUMN "method_old" TEXT;
UPDATE "PayablePayment" SET "method_old" = "method"::text;
ALTER TABLE "PayablePayment" DROP COLUMN "method";

-- Step 2: Drop the enum type (now no columns reference it)
DROP TYPE "PaymentMethod";

-- Step 3: Create the PaymentMethod table
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDivisa" BOOLEAN NOT NULL DEFAULT false,
    "createsReceivable" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "fiscalCode" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentMethod_name_key" ON "PaymentMethod"("name");

ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 4: Insert default payment methods (parents without children)
INSERT INTO "PaymentMethod" ("id", "name", "isDivisa", "createsReceivable", "isActive", "sortOrder", "updatedAt") VALUES
    ('pm_cash_usd',      'Efectivo USD',   true,  false, true, 1, CURRENT_TIMESTAMP),
    ('pm_cash_bs',       'Efectivo Bs',    false, false, true, 2, CURRENT_TIMESTAMP),
    ('pm_punto_venta',   'Punto de Venta', false, false, true, 3, CURRENT_TIMESTAMP),
    ('pm_pago_movil',    'Pago Movil',     false, false, true, 4, CURRENT_TIMESTAMP),
    ('pm_zelle',         'Zelle',          true,  false, true, 5, CURRENT_TIMESTAMP),
    ('pm_transferencia', 'Transferencia',  false, false, true, 6, CURRENT_TIMESTAMP),
    ('pm_cashea',        'Cashea',         true,  true,  true, 7, CURRENT_TIMESTAMP),
    ('pm_crediagro',     'Crediagro',      true,  true,  true, 8, CURRENT_TIMESTAMP);

-- Step 5: Insert children for Punto de Venta
INSERT INTO "PaymentMethod" ("id", "name", "isDivisa", "createsReceivable", "isActive", "sortOrder", "fiscalCode", "parentId", "updatedAt") VALUES
    ('pm_pdv_banesco',    'Punto de Venta Banesco',    false, false, true, 1, 'PDB', 'pm_punto_venta', CURRENT_TIMESTAMP),
    ('pm_pdv_mercantil',  'Punto de Venta Mercantil',  false, false, true, 2, 'PDM', 'pm_punto_venta', CURRENT_TIMESTAMP),
    ('pm_pdv_provincial', 'Punto de Venta Provincial', false, false, true, 3, 'PDP', 'pm_punto_venta', CURRENT_TIMESTAMP);

-- Step 6: Insert children for Pago Movil
INSERT INTO "PaymentMethod" ("id", "name", "isDivisa", "createsReceivable", "isActive", "sortOrder", "fiscalCode", "parentId", "updatedAt") VALUES
    ('pm_pm_banesco',   'Pago Movil Banesco',   false, false, true, 1, 'PMB', 'pm_pago_movil', CURRENT_TIMESTAMP),
    ('pm_pm_mercantil', 'Pago Movil Mercantil', false, false, true, 2, 'PMM', 'pm_pago_movil', CURRENT_TIMESTAMP);

-- Step 7: Add methodId FK column to Payment, migrate data, make NOT NULL
ALTER TABLE "Payment" ADD COLUMN "methodId" TEXT;

UPDATE "Payment" SET "methodId" = CASE "method_old"
    WHEN 'CASH_USD' THEN 'pm_cash_usd'
    WHEN 'CASH_BS' THEN 'pm_cash_bs'
    WHEN 'PUNTO_DE_VENTA' THEN 'pm_punto_venta'
    WHEN 'PAGO_MOVIL' THEN 'pm_pago_movil'
    WHEN 'ZELLE' THEN 'pm_zelle'
    WHEN 'TRANSFERENCIA' THEN 'pm_transferencia'
    WHEN 'CASHEA' THEN 'pm_cashea'
    WHEN 'CREDIAGRO' THEN 'pm_crediagro'
    ELSE 'pm_cash_usd'
END;

ALTER TABLE "Payment" DROP COLUMN "method_old";
ALTER TABLE "Payment" ALTER COLUMN "methodId" SET NOT NULL;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_methodId_fkey"
    FOREIGN KEY ("methodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 8: Add methodId FK column to ReceivablePayment, migrate data
ALTER TABLE "ReceivablePayment" ADD COLUMN "methodId" TEXT;

UPDATE "ReceivablePayment" SET "methodId" = CASE "method_old"
    WHEN 'CASH_USD' THEN 'pm_cash_usd'
    WHEN 'CASH_BS' THEN 'pm_cash_bs'
    WHEN 'PUNTO_DE_VENTA' THEN 'pm_punto_venta'
    WHEN 'PAGO_MOVIL' THEN 'pm_pago_movil'
    WHEN 'ZELLE' THEN 'pm_zelle'
    WHEN 'TRANSFERENCIA' THEN 'pm_transferencia'
    WHEN 'CASHEA' THEN 'pm_cashea'
    WHEN 'CREDIAGRO' THEN 'pm_crediagro'
    ELSE 'pm_cash_usd'
END;

ALTER TABLE "ReceivablePayment" DROP COLUMN "method_old";
ALTER TABLE "ReceivablePayment" ALTER COLUMN "methodId" SET NOT NULL;
ALTER TABLE "ReceivablePayment" ADD CONSTRAINT "ReceivablePayment_methodId_fkey"
    FOREIGN KEY ("methodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 9: Add methodId FK column to PayablePayment, migrate data
ALTER TABLE "PayablePayment" ADD COLUMN "methodId" TEXT;

UPDATE "PayablePayment" SET "methodId" = CASE "method_old"
    WHEN 'CASH_USD' THEN 'pm_cash_usd'
    WHEN 'CASH_BS' THEN 'pm_cash_bs'
    WHEN 'PUNTO_DE_VENTA' THEN 'pm_punto_venta'
    WHEN 'PAGO_MOVIL' THEN 'pm_pago_movil'
    WHEN 'ZELLE' THEN 'pm_zelle'
    WHEN 'TRANSFERENCIA' THEN 'pm_transferencia'
    WHEN 'CASHEA' THEN 'pm_cashea'
    WHEN 'CREDIAGRO' THEN 'pm_crediagro'
    ELSE 'pm_cash_usd'
END;

ALTER TABLE "PayablePayment" DROP COLUMN "method_old";
ALTER TABLE "PayablePayment" ALTER COLUMN "methodId" SET NOT NULL;
ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_methodId_fkey"
    FOREIGN KEY ("methodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 10: Drop FiscalPaymentMethod table (replaced by PaymentMethod.fiscalCode)
DROP TABLE IF EXISTS "FiscalPaymentMethod";
