-- =============================================================================
-- IDEMPOTENT SCHEMA FIX SCRIPT
-- Safe to run multiple times. Creates all missing schema elements.
-- Generated for Trinity project.
-- =============================================================================

-- =============================================================================
-- SECTION 1: CREATE ENUM TYPES (with exception handling for duplicates)
-- =============================================================================

DO $$ BEGIN CREATE TYPE "UserRole" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "IvaType" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "MovementType" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "NoteType" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "NoteOrigin" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "NoteStatus" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TransferStatus" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CountStatus" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReplacementStatus" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "LostSaleReason" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PurchaseStatus" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PermissionKey" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SessionStatus" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "InvoicePaymentType" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "InvoiceStatus" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "InvoiceType" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReceivableType" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReceivableStatus" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PayableStatus" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PaymentScheduleStatus" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReceiptType" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReceiptStatus" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReceiptItemType" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "DynamicKeyPerm" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ExchangeRateSource" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "QuotationStatus" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PrintStatus" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SupplierType" AS ENUM ('JURIDICA', 'NATURAL_RESIDENTE', 'NATURAL_NO_RESIDENTE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- SECTION 2: ADD ENUM VALUES (IF NOT EXISTS)
-- =============================================================================

-- UserRole
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ADMIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPERVISOR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CASHIER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SELLER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'WAREHOUSE';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'BUYER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ACCOUNTANT';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'AUDITOR';

-- IvaType
ALTER TYPE "IvaType" ADD VALUE IF NOT EXISTS 'EXEMPT';
ALTER TYPE "IvaType" ADD VALUE IF NOT EXISTS 'REDUCED';
ALTER TYPE "IvaType" ADD VALUE IF NOT EXISTS 'GENERAL';
ALTER TYPE "IvaType" ADD VALUE IF NOT EXISTS 'SPECIAL';

-- MovementType
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'PURCHASE';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'SALE';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'ADJUSTMENT_IN';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'ADJUSTMENT_OUT';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_IN';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_OUT';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'COUNT_ADJUST';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'RETURN_IN';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'RETURN_OUT';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'REPLACEMENT_IN';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'REPLACEMENT_OUT';

-- NoteType
ALTER TYPE "NoteType" ADD VALUE IF NOT EXISTS 'NCV';
ALTER TYPE "NoteType" ADD VALUE IF NOT EXISTS 'NDV';
ALTER TYPE "NoteType" ADD VALUE IF NOT EXISTS 'NCC';
ALTER TYPE "NoteType" ADD VALUE IF NOT EXISTS 'NDC';

-- NoteOrigin
ALTER TYPE "NoteOrigin" ADD VALUE IF NOT EXISTS 'MERCHANDISE';
ALTER TYPE "NoteOrigin" ADD VALUE IF NOT EXISTS 'MANUAL';

-- NoteStatus
ALTER TYPE "NoteStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "NoteStatus" ADD VALUE IF NOT EXISTS 'POSTED';
ALTER TYPE "NoteStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- TransferStatus
ALTER TYPE "TransferStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "TransferStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "TransferStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- CountStatus
ALTER TYPE "CountStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "CountStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "CountStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "CountStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- ReplacementStatus
ALTER TYPE "ReplacementStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "ReplacementStatus" ADD VALUE IF NOT EXISTS 'PROCESSED';
ALTER TYPE "ReplacementStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- LostSaleReason
ALTER TYPE "LostSaleReason" ADD VALUE IF NOT EXISTS 'SIN_STOCK';
ALTER TYPE "LostSaleReason" ADD VALUE IF NOT EXISTS 'PRECIO_ALTO';
ALTER TYPE "LostSaleReason" ADD VALUE IF NOT EXISTS 'DESCONTINUADO';
ALTER TYPE "LostSaleReason" ADD VALUE IF NOT EXISTS 'PEDIDO_NO_RECIBIDO';

-- PurchaseStatus
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'SENT';
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'RECEIVED';
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- PermissionKey
ALTER TYPE "PermissionKey" ADD VALUE IF NOT EXISTS 'OVERRIDE_PRICE';
ALTER TYPE "PermissionKey" ADD VALUE IF NOT EXISTS 'RETURN_INVOICE';
ALTER TYPE "PermissionKey" ADD VALUE IF NOT EXISTS 'CREDIT_NOTE_SALE';
ALTER TYPE "PermissionKey" ADD VALUE IF NOT EXISTS 'DEBIT_NOTE_SALE';
ALTER TYPE "PermissionKey" ADD VALUE IF NOT EXISTS 'RETURN_PURCHASE';
ALTER TYPE "PermissionKey" ADD VALUE IF NOT EXISTS 'CREDIT_NOTE_PURCHASE';
ALTER TYPE "PermissionKey" ADD VALUE IF NOT EXISTS 'DEBIT_NOTE_PURCHASE';
ALTER TYPE "PermissionKey" ADD VALUE IF NOT EXISTS 'MANAGE_EXPENSES';

-- SessionStatus
ALTER TYPE "SessionStatus" ADD VALUE IF NOT EXISTS 'OPEN';
ALTER TYPE "SessionStatus" ADD VALUE IF NOT EXISTS 'CLOSED';

-- InvoicePaymentType
ALTER TYPE "InvoicePaymentType" ADD VALUE IF NOT EXISTS 'CASH';
ALTER TYPE "InvoicePaymentType" ADD VALUE IF NOT EXISTS 'CREDIT';

-- InvoiceStatus
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PARTIAL_RETURN';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'RETURNED';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- InvoiceType
ALTER TYPE "InvoiceType" ADD VALUE IF NOT EXISTS 'SALE';
ALTER TYPE "InvoiceType" ADD VALUE IF NOT EXISTS 'DEBIT_NOTE';
ALTER TYPE "InvoiceType" ADD VALUE IF NOT EXISTS 'CREDIT_NOTE';

-- ReceivableType
ALTER TYPE "ReceivableType" ADD VALUE IF NOT EXISTS 'CUSTOMER_CREDIT';
ALTER TYPE "ReceivableType" ADD VALUE IF NOT EXISTS 'FINANCING_PLATFORM';
ALTER TYPE "ReceivableType" ADD VALUE IF NOT EXISTS 'MANUAL';

-- CustomerAdvanceStatus
DO $$ BEGIN CREATE TYPE "CustomerAdvanceStatus" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SupplierAdvanceStatus" AS ENUM (); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "CustomerAdvanceStatus" ADD VALUE IF NOT EXISTS 'AVAILABLE';
ALTER TYPE "CustomerAdvanceStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';
ALTER TYPE "CustomerAdvanceStatus" ADD VALUE IF NOT EXISTS 'CONSUMED';

-- SupplierAdvanceStatus
ALTER TYPE "SupplierAdvanceStatus" ADD VALUE IF NOT EXISTS 'AVAILABLE';
ALTER TYPE "SupplierAdvanceStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';
ALTER TYPE "SupplierAdvanceStatus" ADD VALUE IF NOT EXISTS 'CONSUMED';

-- ReceivableStatus
ALTER TYPE "ReceivableStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "ReceivableStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';
ALTER TYPE "ReceivableStatus" ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE "ReceivableStatus" ADD VALUE IF NOT EXISTS 'OVERDUE';

-- PayableStatus
ALTER TYPE "PayableStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "PayableStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';
ALTER TYPE "PayableStatus" ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE "PayableStatus" ADD VALUE IF NOT EXISTS 'OVERDUE';

-- PaymentScheduleStatus
ALTER TYPE "PaymentScheduleStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "PaymentScheduleStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "PaymentScheduleStatus" ADD VALUE IF NOT EXISTS 'EXECUTED';
ALTER TYPE "PaymentScheduleStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- ReceiptType
ALTER TYPE "ReceiptType" ADD VALUE IF NOT EXISTS 'COLLECTION';
ALTER TYPE "ReceiptType" ADD VALUE IF NOT EXISTS 'PAYMENT';

-- ReceiptStatus
ALTER TYPE "ReceiptStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "ReceiptStatus" ADD VALUE IF NOT EXISTS 'POSTED';
ALTER TYPE "ReceiptStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- ReceiptItemType
ALTER TYPE "ReceiptItemType" ADD VALUE IF NOT EXISTS 'RECEIVABLE';
ALTER TYPE "ReceiptItemType" ADD VALUE IF NOT EXISTS 'PAYABLE';
ALTER TYPE "ReceiptItemType" ADD VALUE IF NOT EXISTS 'DIFFERENTIAL';
ALTER TYPE "ReceiptItemType" ADD VALUE IF NOT EXISTS 'CREDIT_NOTE';
ALTER TYPE "ReceiptItemType" ADD VALUE IF NOT EXISTS 'DEBIT_NOTE';

-- DynamicKeyPerm
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'DELETE_CREDIT_NOTE_SALE';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'DELETE_DEBIT_NOTE_SALE';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'DELETE_CREDIT_NOTE_PURCHASE';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'DELETE_DEBIT_NOTE_PURCHASE';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'DELETE_RECEIPT_COLLECTION';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'DELETE_RECEIPT_PAYMENT';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'DELETE_RECEIVABLE';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'DELETE_PAYABLE';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'DELETE_EXPENSE';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'MODIFY_PRODUCT_PRICE';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'CANCEL_CASH_SESSION';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'CHANGE_EXCHANGE_RATE';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'MANUAL_STOCK_ADJUSTMENT';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'GIVE_DISCOUNT';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'ALLOW_CREDIT_INVOICE';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'MANUAL_CASH_MOVEMENT';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'SELL_NEGATIVE_STOCK';

-- ExchangeRateSource
ALTER TYPE "ExchangeRateSource" ADD VALUE IF NOT EXISTS 'BCV';
ALTER TYPE "ExchangeRateSource" ADD VALUE IF NOT EXISTS 'MANUAL';

-- QuotationStatus
ALTER TYPE "QuotationStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "QuotationStatus" ADD VALUE IF NOT EXISTS 'SENT';
ALTER TYPE "QuotationStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "QuotationStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "QuotationStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- PrintStatus
ALTER TYPE "PrintStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "PrintStatus" ADD VALUE IF NOT EXISTS 'PRINTED';
ALTER TYPE "PrintStatus" ADD VALUE IF NOT EXISTS 'FAILED';

-- =============================================================================
-- SECTION 3: CREATE TABLES IF NOT EXISTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS "CompanyConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "companyName" TEXT NOT NULL DEFAULT 'Trinity',
    "rif" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "bregaGlobalPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defaultGananciaPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defaultGananciaMayorPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defaultWarehouseId" TEXT,
    "invoicePrefix" TEXT NOT NULL DEFAULT 'FAC',
    "creditAuthPassword" TEXT,
    "quotationValidityDays" INTEGER NOT NULL DEFAULT 30,
    "overdueWarningDays" INTEGER NOT NULL DEFAULT 3,
    "ivaRetentionPct" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "islrRetentionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isIGTFContributor" BOOLEAN NOT NULL DEFAULT false,
    "igtfPct" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "fiscalCreditCode" TEXT NOT NULL DEFAULT '10',
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT true,
    "defaultCustomerId" TEXT,
    "logo" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ExchangeRate" (
    "id" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "date" DATE NOT NULL,
    "source" "ExchangeRateSource" NOT NULL DEFAULT 'MANUAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionKey" "PermissionKey" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RolePermission" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "modules" TEXT[] NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DynamicKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DynamicKey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DynamicKeyPermission" (
    "id" TEXT NOT NULL,
    "dynamicKeyId" TEXT NOT NULL,
    "permission" "DynamicKeyPerm" NOT NULL,
    CONSTRAINT "DynamicKeyPermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DynamicKeyLog" (
    "id" TEXT NOT NULL,
    "dynamicKeyId" TEXT NOT NULL,
    "permission" "DynamicKeyPerm" NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DynamicKeyLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Seller" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Seller_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PrintArea" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PrintArea_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "lastProductNumber" INTEGER NOT NULL DEFAULT 0,
    "commissionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "printAreaId" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rif" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "contactName" TEXT,
    "isRetentionAgent" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Product" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "barcode" TEXT,
    "supplierRef" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT,
    "brandId" TEXT,
    "supplierId" TEXT,
    "purchaseUnit" TEXT NOT NULL DEFAULT 'UNIT',
    "saleUnit" TEXT NOT NULL DEFAULT 'UNIT',
    "conversionFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bregaApplies" BOOLEAN NOT NULL DEFAULT true,
    "gananciaPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gananciaMayorPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaType" "IvaType" NOT NULL DEFAULT 'GENERAL',
    "priceDetal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priceMayor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "searchVector" tsvector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Warehouse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Stock" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "costUsd" DOUBLE PRECISION,
    "reason" TEXT,
    "reference" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Transfer" (
    "id" TEXT NOT NULL,
    "fromWarehouseId" TEXT NOT NULL,
    "toWarehouseId" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TransferItem" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "TransferItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InventoryCount" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "status" "CountStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InventoryCountItem" (
    "id" TEXT NOT NULL,
    "inventoryCountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "systemQuantity" DOUBLE PRECISION NOT NULL,
    "countedQuantity" DOUBLE PRECISION,
    "difference" DOUBLE PRECISION,
    CONSTRAINT "InventoryCountItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InventoryReplacement" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "status" "ReplacementStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "processedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryReplacement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryReplacement_number_key" ON "InventoryReplacement"("number");

CREATE TABLE IF NOT EXISTS "InventoryReplacementItem" (
    "id" TEXT NOT NULL,
    "replacementId" TEXT NOT NULL,
    "outProductId" TEXT NOT NULL,
    "outQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inProductId" TEXT NOT NULL,
    "inQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "InventoryReplacementItem_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "InventoryReplacement" ADD CONSTRAINT "InventoryReplacement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InventoryReplacementItem" ADD CONSTRAINT "InventoryReplacementItem_replacementId_fkey" FOREIGN KEY ("replacementId") REFERENCES "InventoryReplacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InventoryReplacementItem" ADD CONSTRAINT "InventoryReplacementItem_outProductId_fkey" FOREIGN KEY ("outProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InventoryReplacementItem" ADD CONSTRAINT "InventoryReplacementItem_inProductId_fkey" FOREIGN KEY ("inProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "LostSale" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "productCode" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "reason" "LostSaleReason" NOT NULL DEFAULT 'SIN_STOCK',
    "unitPriceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPriceBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stockAtMoment" DOUBLE PRECISION,
    "customerId" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LostSale_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "LostSale" ADD CONSTRAINT "LostSale_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LostSale" ADD CONSTRAINT "LostSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LostSale" ADD CONSTRAINT "LostSale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isCredit" BOOLEAN NOT NULL DEFAULT false,
    "creditDays" INTEGER NOT NULL DEFAULT 0,
    "supplierControlNumber" TEXT,
    "islrRetentionPct" DOUBLE PRECISION,
    "islrRetentionUsd" DOUBLE PRECISION,
    "islrRetentionBs" DOUBLE PRECISION,
    "notes" TEXT,
    "receivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "costBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalUsd" DOUBLE PRECISION NOT NULL,
    "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "documentType" TEXT NOT NULL DEFAULT 'V',
    "rif" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "creditLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creditDays" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PaymentMethod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDivisa" BOOLEAN NOT NULL DEFAULT false,
    "createsReceivable" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "fiscalCode" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CashRegister" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isFiscal" BOOLEAN NOT NULL DEFAULT false,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastInvoiceNumber" INTEGER NOT NULL DEFAULT 0,
    "comPort" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CashSession" (
    "id" TEXT NOT NULL,
    "cashRegisterId" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "closedById" TEXT,
    "openingBalanceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingBalanceBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingBalanceUsd" DOUBLE PRECISION,
    "closingBalanceBs" DOUBLE PRECISION,
    "status" "SessionStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "fiscalNumber" TEXT,
    "controlNumber" TEXT,
    "fiscalMachineSerial" TEXT,
    "cashRegisterId" TEXT NOT NULL,
    "customerId" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "paymentType" "InvoicePaymentType" NOT NULL DEFAULT 'CASH',
    "type" "InvoiceType" NOT NULL DEFAULT 'SALE',
    "subtotalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igtfUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igtfBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isCredit" BOOLEAN NOT NULL DEFAULT false,
    "creditDays" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "sellerId" TEXT,
    "cashierId" TEXT,
    "lockedById" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "ivaType" "IvaType" NOT NULL,
    "ivaAmount" DOUBLE PRECISION NOT NULL,
    "totalUsd" DOUBLE PRECISION NOT NULL,
    "unitPriceBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPriceWithoutIva" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPriceWithoutIvaBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priceOverridden" BOOLEAN NOT NULL DEFAULT false,
    "returnedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "methodId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "amountBs" DOUBLE PRECISION NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "reference" TEXT,
    "igtfUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igtfBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Receivable" (
    "id" TEXT NOT NULL,
    "type" "ReceivableType" NOT NULL,
    "customerId" TEXT,
    "platformName" TEXT,
    "reference" TEXT,
    "invoiceId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "amountBs" DOUBLE PRECISION NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "ReceivableStatus" NOT NULL DEFAULT 'PENDING',
    "paidAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReceivablePayment" (
    "id" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "amountBs" DOUBLE PRECISION NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "methodId" TEXT NOT NULL,
    "reference" TEXT,
    "cashSessionId" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReceivablePayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Payable" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "amountBs" DOUBLE PRECISION NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "retentionUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netPayableUsd" DOUBLE PRECISION NOT NULL,
    "netPayableBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "status" "PayableStatus" NOT NULL DEFAULT 'PENDING',
    "paidAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PayablePayment" (
    "id" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "amountBs" DOUBLE PRECISION NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "methodId" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayablePayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Receipt" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "ReceiptType" NOT NULL,
    "customerId" TEXT,
    "supplierId" TEXT,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalBsHistoric" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalBsToday" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "differentialBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hasDifferential" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "cashSessionId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReceiptItem" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "itemType" "ReceiptItemType" NOT NULL,
    "receivableId" TEXT,
    "payableId" TEXT,
    "creditDebitNoteId" TEXT,
    "description" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountBsHistoric" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountBsToday" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "differentialBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sign" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ReceiptItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReceiptPayment" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "methodId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReceiptPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PriceAdjustmentLog" (
    "id" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "adjustmentType" TEXT NOT NULL,
    "gananciaPct" DOUBLE PRECISION,
    "gananciaMayorPct" DOUBLE PRECISION,
    "productsAffected" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceAdjustmentLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PrintJob" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "printAreaId" TEXT NOT NULL,
    "status" "PrintStatus" NOT NULL DEFAULT 'PENDING',
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Quotation" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "convertedToInvoiceId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "QuotationItem" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPriceUsd" DOUBLE PRECISION NOT NULL,
    "unitPriceBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaType" "IvaType" NOT NULL,
    "ivaAmount" DOUBLE PRECISION NOT NULL,
    "ivaAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalUsd" DOUBLE PRECISION NOT NULL,
    "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CreditDebitNote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "NoteType" NOT NULL,
    "origin" "NoteOrigin" NOT NULL,
    "status" "NoteStatus" NOT NULL DEFAULT 'DRAFT',
    "invoiceId" TEXT,
    "cashRegisterId" TEXT,
    "fiscalNumber" TEXT,
    "machineSerial" TEXT,
    "fiscalPrinted" BOOLEAN NOT NULL DEFAULT false,
    "purchaseOrderId" TEXT,
    "subtotalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igtfUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igtfBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "manualAmountUsd" DOUBLE PRECISION,
    "manualPct" DOUBLE PRECISION,
    "notes" TEXT,
    "paidAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "appliedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreditDebitNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CreditDebitNoteItem" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPriceUsd" DOUBLE PRECISION NOT NULL,
    "unitPriceBs" DOUBLE PRECISION NOT NULL,
    "ivaType" "IvaType" NOT NULL,
    "ivaAmount" DOUBLE PRECISION NOT NULL,
    "ivaAmountBs" DOUBLE PRECISION NOT NULL,
    "totalUsd" DOUBLE PRECISION NOT NULL,
    "totalBs" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "CreditDebitNoteItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PaymentSchedule" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "PaymentScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "budgetUsd" DOUBLE PRECISION,
    "budgetBs" DOUBLE PRECISION,
    "budgetCurrency" TEXT,
    "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PaymentScheduleItem" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "payableId" TEXT,
    "creditDebitNoteId" TEXT,
    "supplierName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "totalAmountUsd" DOUBLE PRECISION NOT NULL,
    "totalAmountBs" DOUBLE PRECISION NOT NULL,
    "plannedAmountUsd" DOUBLE PRECISION NOT NULL,
    "plannedAmountBs" DOUBLE PRECISION NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentScheduleItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Expense" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "amountBs" DOUBLE PRECISION NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- =============================================================================
-- SECTION 4: ALTER TABLE ADD COLUMN IF NOT EXISTS (for existing tables missing newer columns)
-- =============================================================================

-- CompanyConfig
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "companyName" TEXT NOT NULL DEFAULT 'Trinity';
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "rif" TEXT;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "bregaGlobalPct" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "defaultGananciaPct" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "defaultGananciaMayorPct" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "defaultWarehouseId" TEXT;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "invoicePrefix" TEXT NOT NULL DEFAULT 'FAC';
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "creditAuthPassword" TEXT;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "quotationValidityDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "overdueWarningDays" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "ivaRetentionPct" DOUBLE PRECISION NOT NULL DEFAULT 75;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "islrRetentionPct" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "isIGTFContributor" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "igtfPct" DOUBLE PRECISION NOT NULL DEFAULT 3;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "fiscalCreditCode" TEXT NOT NULL DEFAULT '10';
UPDATE "CompanyConfig" SET "fiscalCreditCode" = '10' WHERE "fiscalCreditCode" = '01';
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "allowNegativeStock" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "defaultCustomerId" TEXT;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "logo" TEXT;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ExchangeRate
ALTER TABLE "ExchangeRate" ADD COLUMN IF NOT EXISTS "rate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ExchangeRate" ADD COLUMN IF NOT EXISTS "date" DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE "ExchangeRate" ADD COLUMN IF NOT EXISTS "source" "ExchangeRateSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "ExchangeRate" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "ExchangeRate" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "password" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'SELLER';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- UserPermission
ALTER TABLE "UserPermission" ADD COLUMN IF NOT EXISTS "userId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UserPermission" ADD COLUMN IF NOT EXISTS "permissionKey" "PermissionKey" NOT NULL DEFAULT 'OVERRIDE_PRICE';
ALTER TABLE "UserPermission" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- RolePermission
ALTER TABLE "RolePermission" ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'SELLER';
ALTER TABLE "RolePermission" ADD COLUMN IF NOT EXISTS "modules" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "RolePermission" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DynamicKey
ALTER TABLE "DynamicKey" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DynamicKey" ADD COLUMN IF NOT EXISTS "keyHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DynamicKey" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "DynamicKey" ADD COLUMN IF NOT EXISTS "createdById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DynamicKey" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "DynamicKey" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DynamicKeyPermission
ALTER TABLE "DynamicKeyPermission" ADD COLUMN IF NOT EXISTS "dynamicKeyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DynamicKeyPermission" ADD COLUMN IF NOT EXISTS "permission" "DynamicKeyPerm" NOT NULL DEFAULT 'DELETE_CREDIT_NOTE_SALE';

-- DynamicKeyLog
ALTER TABLE "DynamicKeyLog" ADD COLUMN IF NOT EXISTS "dynamicKeyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DynamicKeyLog" ADD COLUMN IF NOT EXISTS "permission" "DynamicKeyPerm" NOT NULL DEFAULT 'DELETE_CREDIT_NOTE_SALE';
ALTER TABLE "DynamicKeyLog" ADD COLUMN IF NOT EXISTS "action" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DynamicKeyLog" ADD COLUMN IF NOT EXISTS "entityType" TEXT;
ALTER TABLE "DynamicKeyLog" ADD COLUMN IF NOT EXISTS "entityId" TEXT;
ALTER TABLE "DynamicKeyLog" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Seller
ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "code" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- PrintArea
ALTER TABLE "PrintArea" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PrintArea" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "PrintArea" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PrintArea" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PrintArea" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Category
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "lastProductNumber" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "commissionPct" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "printAreaId" TEXT;
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Brand
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Supplier
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "rif" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactName" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "isRetentionAgent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Product
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "code" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "barcode" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "supplierRef" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "otherCode" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "saleBlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "brandId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "purchaseUnit" TEXT NOT NULL DEFAULT 'UNIT';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "saleUnit" TEXT NOT NULL DEFAULT 'UNIT';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "conversionFactor" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "manualCost" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "bregaApplies" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "gananciaPct" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "gananciaMayorPct" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "ivaType" "IvaType" NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "priceDetal" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "priceMayor" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "minStock" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "searchVector" tsvector;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Warehouse
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "location" TEXT;
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Stock
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "productId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- StockMovement
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "productId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "type" "MovementType" NOT NULL DEFAULT 'ADJUSTMENT_IN';
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "costUsd" DOUBLE PRECISION;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "reason" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "reference" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "sourceType" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "createdById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Transfer
ALTER TABLE "Transfer" ADD COLUMN IF NOT EXISTS "number" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Transfer_number_key" ON "Transfer"("number");
ALTER TABLE "Transfer" ADD COLUMN IF NOT EXISTS "fromWarehouseId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Transfer" ADD COLUMN IF NOT EXISTS "toWarehouseId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Transfer" ADD COLUMN IF NOT EXISTS "status" "TransferStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Transfer" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Transfer" ADD COLUMN IF NOT EXISTS "createdById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Transfer" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;
ALTER TABLE "Transfer" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Transfer" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- TransferItem
ALTER TABLE "TransferItem" ADD COLUMN IF NOT EXISTS "transferId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TransferItem" ADD COLUMN IF NOT EXISTS "productId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TransferItem" ADD COLUMN IF NOT EXISTS "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- InventoryCount
ALTER TABLE "InventoryCount" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "InventoryCount" ADD COLUMN IF NOT EXISTS "status" "CountStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "InventoryCount" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "InventoryCount" ADD COLUMN IF NOT EXISTS "createdById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "InventoryCount" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;
ALTER TABLE "InventoryCount" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "InventoryCount" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- InventoryCountItem
ALTER TABLE "InventoryCountItem" ADD COLUMN IF NOT EXISTS "inventoryCountId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "InventoryCountItem" ADD COLUMN IF NOT EXISTS "productId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "InventoryCountItem" ADD COLUMN IF NOT EXISTS "systemQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InventoryCountItem" ADD COLUMN IF NOT EXISTS "countedQuantity" DOUBLE PRECISION;
ALTER TABLE "InventoryCountItem" ADD COLUMN IF NOT EXISTS "difference" DOUBLE PRECISION;

-- PurchaseOrder
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "number" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "supplierId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "isCredit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "creditDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "supplierControlNumber" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "islrRetentionPct" DOUBLE PRECISION;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "islrRetentionUsd" DOUBLE PRECISION;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "islrRetentionBs" DOUBLE PRECISION;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3);
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "createdById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- PurchaseOrderItem
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "purchaseOrderId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "productId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "costBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "receivedQty" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Customer
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "documentType" TEXT NOT NULL DEFAULT 'V';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "rif" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditLimit" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- PaymentMethod
ALTER TABLE "PaymentMethod" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PaymentMethod" ADD COLUMN IF NOT EXISTS "isDivisa" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PaymentMethod" ADD COLUMN IF NOT EXISTS "createsReceivable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PaymentMethod" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PaymentMethod" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PaymentMethod" ADD COLUMN IF NOT EXISTS "fiscalCode" TEXT;
ALTER TABLE "PaymentMethod" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "PaymentMethod" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PaymentMethod" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CashRegister
ALTER TABLE "CashRegister" ADD COLUMN IF NOT EXISTS "code" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CashRegister" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CashRegister" ADD COLUMN IF NOT EXISTS "isFiscal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CashRegister" ADD COLUMN IF NOT EXISTS "isShared" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CashRegister" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CashRegister" ADD COLUMN IF NOT EXISTS "lastInvoiceNumber" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CashRegister" ADD COLUMN IF NOT EXISTS "comPort" TEXT;
ALTER TABLE "CashRegister" ADD COLUMN IF NOT EXISTS "fiscalMachineSerial" TEXT;
ALTER TABLE "CashRegister" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CashRegister" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CashSession
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "cashRegisterId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "openedById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "closedById" TEXT;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "openingBalanceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "openingBalanceBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "closingBalanceUsd" DOUBLE PRECISION;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "closingBalanceBs" DOUBLE PRECISION;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "status" "SessionStatus" NOT NULL DEFAULT 'OPEN';
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

-- Invoice
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "number" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "fiscalNumber" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "controlNumber" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "fiscalMachineSerial" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "cashRegisterId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paymentType" "InvoicePaymentType" NOT NULL DEFAULT 'CASH';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "type" "InvoiceType" NOT NULL DEFAULT 'SALE';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "subtotalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "ivaUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "igtfUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "igtfBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "subtotalBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "ivaBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "isCredit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "creditDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "createdById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "sellerId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "cashierId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "lockedById" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- InvoiceItem
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "invoiceId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "productId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "productName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "ivaType" "IvaType" NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "ivaAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "unitPriceBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "ivaAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "unitPriceWithoutIva" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "unitPriceWithoutIvaBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "discountPct" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "costBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "priceOverridden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "returnedQty" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Payment
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "invoiceId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "methodId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "amountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "amountBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "reference" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "igtfUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "igtfBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Receivable
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "type" "ReceivableType" NOT NULL DEFAULT 'CUSTOMER_CREDIT';
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "platformName" TEXT;
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "reference" TEXT;
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "invoiceId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "amountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "amountBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "status" "ReceivableStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "paidAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "paidAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ReceivablePayment
ALTER TABLE "ReceivablePayment" ADD COLUMN IF NOT EXISTS "receivableId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ReceivablePayment" ADD COLUMN IF NOT EXISTS "amountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ReceivablePayment" ADD COLUMN IF NOT EXISTS "amountBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ReceivablePayment" ADD COLUMN IF NOT EXISTS "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ReceivablePayment" ADD COLUMN IF NOT EXISTS "methodId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ReceivablePayment" ADD COLUMN IF NOT EXISTS "reference" TEXT;
ALTER TABLE "ReceivablePayment" ADD COLUMN IF NOT EXISTS "cashSessionId" TEXT;
ALTER TABLE "ReceivablePayment" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "ReceivablePayment" ADD COLUMN IF NOT EXISTS "createdById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ReceivablePayment" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Payable
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "supplierId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "purchaseOrderId" TEXT;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "amountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "amountBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "retentionUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "retentionBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "netPayableUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "netPayableBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "status" "PayableStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "paidAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "paidAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- PayablePayment
ALTER TABLE "PayablePayment" ADD COLUMN IF NOT EXISTS "payableId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PayablePayment" ADD COLUMN IF NOT EXISTS "amountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PayablePayment" ADD COLUMN IF NOT EXISTS "amountBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PayablePayment" ADD COLUMN IF NOT EXISTS "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PayablePayment" ADD COLUMN IF NOT EXISTS "methodId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PayablePayment" ADD COLUMN IF NOT EXISTS "reference" TEXT;
ALTER TABLE "PayablePayment" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "PayablePayment" ADD COLUMN IF NOT EXISTS "createdById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PayablePayment" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Receipt
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "number" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "type" "ReceiptType" NOT NULL DEFAULT 'COLLECTION';
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "status" "ReceiptStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "totalBsHistoric" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "totalBsToday" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "differentialBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "hasDifferential" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "cashSessionId" TEXT;
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "createdById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ReceiptItem
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "receiptId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "itemType" "ReceiptItemType" NOT NULL DEFAULT 'RECEIVABLE';
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "receivableId" TEXT;
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "payableId" TEXT;
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "creditDebitNoteId" TEXT;
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "amountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "amountBsHistoric" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "amountBsToday" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "differentialBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "sign" INTEGER NOT NULL DEFAULT 1;

-- ReceiptPayment
ALTER TABLE "ReceiptPayment" ADD COLUMN IF NOT EXISTS "receiptId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ReceiptPayment" ADD COLUMN IF NOT EXISTS "methodId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ReceiptPayment" ADD COLUMN IF NOT EXISTS "amountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ReceiptPayment" ADD COLUMN IF NOT EXISTS "amountBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ReceiptPayment" ADD COLUMN IF NOT EXISTS "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ReceiptPayment" ADD COLUMN IF NOT EXISTS "reference" TEXT;
ALTER TABLE "ReceiptPayment" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- PriceAdjustmentLog
ALTER TABLE "PriceAdjustmentLog" ADD COLUMN IF NOT EXISTS "filters" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "PriceAdjustmentLog" ADD COLUMN IF NOT EXISTS "adjustmentType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PriceAdjustmentLog" ADD COLUMN IF NOT EXISTS "gananciaPct" DOUBLE PRECISION;
ALTER TABLE "PriceAdjustmentLog" ADD COLUMN IF NOT EXISTS "gananciaMayorPct" DOUBLE PRECISION;
ALTER TABLE "PriceAdjustmentLog" ADD COLUMN IF NOT EXISTS "productsAffected" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PriceAdjustmentLog" ADD COLUMN IF NOT EXISTS "createdById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PriceAdjustmentLog" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- PrintJob
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "invoiceId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "printAreaId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "status" "PrintStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "items" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Quotation
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "number" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "subtotalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "subtotalBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "ivaUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "ivaBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "convertedToInvoiceId" TEXT;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "createdById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- QuotationItem
ALTER TABLE "QuotationItem" ADD COLUMN IF NOT EXISTS "quotationId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "QuotationItem" ADD COLUMN IF NOT EXISTS "productId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "QuotationItem" ADD COLUMN IF NOT EXISTS "productName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "QuotationItem" ADD COLUMN IF NOT EXISTS "productCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "QuotationItem" ADD COLUMN IF NOT EXISTS "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "QuotationItem" ADD COLUMN IF NOT EXISTS "unitPriceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "QuotationItem" ADD COLUMN IF NOT EXISTS "unitPriceBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "QuotationItem" ADD COLUMN IF NOT EXISTS "ivaType" "IvaType" NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "QuotationItem" ADD COLUMN IF NOT EXISTS "ivaAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "QuotationItem" ADD COLUMN IF NOT EXISTS "ivaAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "QuotationItem" ADD COLUMN IF NOT EXISTS "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "QuotationItem" ADD COLUMN IF NOT EXISTS "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreditDebitNote
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "number" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "type" "NoteType" NOT NULL DEFAULT 'NCV';
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "origin" "NoteOrigin" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "status" "NoteStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "invoiceId" TEXT;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "cashRegisterId" TEXT;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "fiscalNumber" TEXT;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "machineSerial" TEXT;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "fiscalPrinted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "purchaseOrderId" TEXT;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "subtotalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "ivaUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "igtfUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "igtfBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "subtotalBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "ivaBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "manualAmountUsd" DOUBLE PRECISION;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "manualPct" DOUBLE PRECISION;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "paidAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "appliedAt" TIMESTAMP(3);
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "documentDate" TIMESTAMP(3);
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "supplierDocNumber" TEXT;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "createdById" TEXT NOT NULL DEFAULT '';

-- Serie: contadores de correlativo independientes por tipo de documento
ALTER TABLE "Serie" ADD COLUMN IF NOT EXISTS "lastInvoiceNumber" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Serie" ADD COLUMN IF NOT EXISTS "lastCreditNoteNumber" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Serie" ADD COLUMN IF NOT EXISTS "lastDebitNoteNumber" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Serie" ADD COLUMN IF NOT EXISTS "lastReceivableNumber" INTEGER NOT NULL DEFAULT 0;
UPDATE "Serie" SET "lastInvoiceNumber" = "lastNumber" WHERE "lastInvoiceNumber" = 0 AND "lastNumber" > 0;

-- Serie alfanumerica de la factura del proveedor (libro de compras + CxP)
ALTER TABLE "PurchaseBookEntry" ADD COLUMN IF NOT EXISTS "supplierSerie" TEXT;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "serieProveedor" TEXT;
ALTER TABLE "PurchaseBookEntry" ADD COLUMN IF NOT EXISTS "creditDebitNoteId" TEXT;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreditDebitNoteItem
ALTER TABLE "CreditDebitNoteItem" ADD COLUMN IF NOT EXISTS "noteId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CreditDebitNoteItem" ADD COLUMN IF NOT EXISTS "productId" TEXT;
ALTER TABLE "CreditDebitNoteItem" ADD COLUMN IF NOT EXISTS "productName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CreditDebitNoteItem" ADD COLUMN IF NOT EXISTS "productCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CreditDebitNoteItem" ADD COLUMN IF NOT EXISTS "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CreditDebitNoteItem" ADD COLUMN IF NOT EXISTS "unitPriceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CreditDebitNoteItem" ADD COLUMN IF NOT EXISTS "unitPriceBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CreditDebitNoteItem" ADD COLUMN IF NOT EXISTS "ivaType" "IvaType" NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "CreditDebitNoteItem" ADD COLUMN IF NOT EXISTS "ivaAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CreditDebitNoteItem" ADD COLUMN IF NOT EXISTS "ivaAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CreditDebitNoteItem" ADD COLUMN IF NOT EXISTS "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CreditDebitNoteItem" ADD COLUMN IF NOT EXISTS "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- PaymentSchedule
ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "number" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "status" "PaymentScheduleStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "budgetUsd" DOUBLE PRECISION;
ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "budgetBs" DOUBLE PRECISION;
ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "budgetCurrency" TEXT;
ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "createdById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- PaymentScheduleItem
ALTER TABLE "PaymentScheduleItem" ADD COLUMN IF NOT EXISTS "scheduleId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PaymentScheduleItem" ADD COLUMN IF NOT EXISTS "payableId" TEXT;
ALTER TABLE "PaymentScheduleItem" ADD COLUMN IF NOT EXISTS "creditDebitNoteId" TEXT;
ALTER TABLE "PaymentScheduleItem" ADD COLUMN IF NOT EXISTS "supplierName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PaymentScheduleItem" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PaymentScheduleItem" ADD COLUMN IF NOT EXISTS "totalAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PaymentScheduleItem" ADD COLUMN IF NOT EXISTS "totalAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PaymentScheduleItem" ADD COLUMN IF NOT EXISTS "plannedAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PaymentScheduleItem" ADD COLUMN IF NOT EXISTS "plannedAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PaymentScheduleItem" ADD COLUMN IF NOT EXISTS "isPaid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PaymentScheduleItem" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ExpenseCategory
ALTER TABLE "ExpenseCategory" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ExpenseCategory" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "ExpenseCategory" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ExpenseCategory" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ExpenseCategory" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ExpenseCategory" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Expense
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "categoryId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "reference" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "amountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "amountBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "createdById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- Gastos a credito (proveedor + CxP)
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "isCredit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "creditDays" INTEGER;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "expenseId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Payable_expenseId_key" ON "Payable"("expenseId");
DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Payable" ADD CONSTRAINT "Payable_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- SECTION 5: CREATE UNIQUE INDEXES IF NOT EXISTS
-- =============================================================================

-- ExchangeRate unique on date
CREATE UNIQUE INDEX IF NOT EXISTS "ExchangeRate_date_key" ON "ExchangeRate"("date");

-- User unique on email
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- UserPermission composite unique
CREATE UNIQUE INDEX IF NOT EXISTS "UserPermission_userId_permissionKey_key" ON "UserPermission"("userId", "permissionKey");

-- RolePermission unique on role
CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_role_key" ON "RolePermission"("role");

-- DynamicKeyPermission composite unique
CREATE UNIQUE INDEX IF NOT EXISTS "DynamicKeyPermission_dynamicKeyId_permission_key" ON "DynamicKeyPermission"("dynamicKeyId", "permission");

-- Seller unique on code
CREATE UNIQUE INDEX IF NOT EXISTS "Seller_code_key" ON "Seller"("code");

-- Seller unique on userId
CREATE UNIQUE INDEX IF NOT EXISTS "Seller_userId_key" ON "Seller"("userId");

-- Category unique on code
CREATE UNIQUE INDEX IF NOT EXISTS "Category_code_key" ON "Category"("code");

-- Product unique on code
CREATE UNIQUE INDEX IF NOT EXISTS "Product_code_key" ON "Product"("code");

-- Product unique on barcode
CREATE UNIQUE INDEX IF NOT EXISTS "Product_barcode_key" ON "Product"("barcode");

-- Stock composite unique
CREATE UNIQUE INDEX IF NOT EXISTS "Stock_productId_warehouseId_key" ON "Stock"("productId", "warehouseId");

-- PurchaseOrder unique on number
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrder_number_key" ON "PurchaseOrder"("number");

-- PaymentMethod unique on name
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentMethod_name_key" ON "PaymentMethod"("name");

-- CashRegister unique on code
CREATE UNIQUE INDEX IF NOT EXISTS "CashRegister_code_key" ON "CashRegister"("code");

-- Invoice unique on number
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_number_key" ON "Invoice"("number");

-- Receipt unique on number
CREATE UNIQUE INDEX IF NOT EXISTS "Receipt_number_key" ON "Receipt"("number");

-- Quotation unique on number
CREATE UNIQUE INDEX IF NOT EXISTS "Quotation_number_key" ON "Quotation"("number");

-- CreditDebitNote unique on number
CREATE UNIQUE INDEX IF NOT EXISTS "CreditDebitNote_number_key" ON "CreditDebitNote"("number");

-- PaymentSchedule unique on number
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentSchedule_number_key" ON "PaymentSchedule"("number");

-- ExpenseCategory unique on name
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- =============================================================================
-- IvaRetention (2026-05-23)
-- =============================================================================

-- Enum value
ALTER TYPE "ReceiptItemType" ADD VALUE IF NOT EXISTS 'IVA_RETENTION';

-- CompanyConfig: retentionNextNumber
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "retentionNextNumber" INTEGER NOT NULL DEFAULT 1;

-- IvaRetention table
CREATE TABLE IF NOT EXISTS "IvaRetention" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "ivaBaseUsd" DOUBLE PRECISION NOT NULL,
    "ivaBaseBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionPct" DOUBLE PRECISION NOT NULL,
    "retentionUsd" DOUBLE PRECISION NOT NULL,
    "retentionBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IvaRetention_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "IvaRetention_number_key" ON "IvaRetention"("number");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IvaRetention_purchaseOrderId_fkey') THEN
    ALTER TABLE "IvaRetention" ADD CONSTRAINT "IvaRetention_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IvaRetention_supplierId_fkey') THEN
    ALTER TABLE "IvaRetention" ADD CONSTRAINT "IvaRetention_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ReceiptItem: ivaRetentionId
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "ivaRetentionId" TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReceiptItem_ivaRetentionId_fkey') THEN
    ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_ivaRetentionId_fkey" FOREIGN KEY ("ivaRetentionId") REFERENCES "IvaRetention"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Receivable: make invoiceId nullable, add documentNumber and description
ALTER TABLE "Receivable" ALTER COLUMN "invoiceId" DROP NOT NULL;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "documentNumber" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "description" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Payable: add documentNumber and description
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "documentNumber" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "description" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- CustomerAdvance table
CREATE TABLE IF NOT EXISTS "CustomerAdvance" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "amountBs" DOUBLE PRECISION NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "paidAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "CustomerAdvanceStatus" NOT NULL DEFAULT 'AVAILABLE',
    "reference" TEXT,
    "notes" TEXT,
    "methodId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerAdvance_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerAdvance_customerId_fkey') THEN
    ALTER TABLE "CustomerAdvance" ADD CONSTRAINT "CustomerAdvance_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerAdvance_methodId_fkey') THEN
    ALTER TABLE "CustomerAdvance" ADD CONSTRAINT "CustomerAdvance_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerAdvance_createdById_fkey') THEN
    ALTER TABLE "CustomerAdvance" ADD CONSTRAINT "CustomerAdvance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- SupplierAdvance table
CREATE TABLE IF NOT EXISTS "SupplierAdvance" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "amountBs" DOUBLE PRECISION NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "paidAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "SupplierAdvanceStatus" NOT NULL DEFAULT 'AVAILABLE',
    "reference" TEXT,
    "notes" TEXT,
    "methodId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierAdvance_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierAdvance_supplierId_fkey') THEN
    ALTER TABLE "SupplierAdvance" ADD CONSTRAINT "SupplierAdvance_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierAdvance_methodId_fkey') THEN
    ALTER TABLE "SupplierAdvance" ADD CONSTRAINT "SupplierAdvance_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierAdvance_createdById_fkey') THEN
    ALTER TABLE "SupplierAdvance" ADD CONSTRAINT "SupplierAdvance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- =============================================================================
-- SECTION: Fiscal fields for Receivable & Payable (2026-06-02)
-- =============================================================================

-- Receivable fiscal fields
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "number" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "isFiscal" BOOLEAN NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "controlFiscal" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "originalDate" TIMESTAMP(3); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "receptionDate" TIMESTAMP(3); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "paymentTerms" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "exemptBaseUsd" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "exemptBaseBs" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "taxableBase8Usd" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "taxableBase8Bs" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "taxableBase16Usd" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "taxableBase16Bs" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "taxableBase31Usd" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "taxableBase31Bs" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "iva8Usd" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "iva8Bs" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "iva16Usd" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "iva16Bs" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "iva31Usd" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "iva31Bs" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "totalIvaUsd" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "totalIvaBs" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "igtfPct" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "igtfUsd" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "igtfBs" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "createdById" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "Receivable_number_key" ON "Receivable"("number");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Receivable_createdById_fkey') THEN
    ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Payable fiscal fields
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "number" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "isFiscal" BOOLEAN NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "controlFiscal" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "originalDate" TIMESTAMP(3); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "receptionDate" TIMESTAMP(3); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "paymentTerms" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "exemptBaseUsd" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "exemptBaseBs" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "taxableBase8Usd" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "taxableBase8Bs" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "taxableBase16Usd" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "taxableBase16Bs" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "taxableBase31Usd" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "taxableBase31Bs" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "iva8Usd" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "iva8Bs" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "iva16Usd" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "iva16Bs" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "iva31Usd" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "iva31Bs" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "totalIvaUsd" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "totalIvaBs" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "igtfPct" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "igtfUsd" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "igtfBs" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "createdById" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "Payable_number_key" ON "Payable"("number");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payable_createdById_fkey') THEN
    ALTER TABLE "Payable" ADD CONSTRAINT "Payable_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- SalesBookEntry.receivableId FK
DO $$ BEGIN ALTER TABLE "SalesBookEntry" ADD COLUMN "receivableId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesBookEntry_receivableId_fkey') THEN
    ALTER TABLE "SalesBookEntry" ADD CONSTRAINT "SalesBookEntry_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- PurchaseBookEntry.payableId FK
DO $$ BEGIN ALTER TABLE "PurchaseBookEntry" ADD COLUMN "payableId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseBookEntry_payableId_fkey') THEN
    ALTER TABLE "PurchaseBookEntry" ADD CONSTRAINT "PurchaseBookEntry_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "Payable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Correlative counters in CompanyConfig
DO $$ BEGIN ALTER TABLE "CompanyConfig" ADD COLUMN "receivableNextNumber" INTEGER NOT NULL DEFAULT 1; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CompanyConfig" ADD COLUMN "payableNextNumber" INTEGER NOT NULL DEFAULT 1; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- =============================================================================
-- SECTION: Serie-based fiscal for CxC/CxP (Session 31)
-- =============================================================================

-- Add serieId to Receivable
DO $$ BEGIN ALTER TABLE "Receivable" ADD COLUMN "serieId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Receivable_serieId_fkey') THEN
    ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_serieId_fkey" FOREIGN KEY ("serieId") REFERENCES "Serie"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Add serieId to Payable
DO $$ BEGIN ALTER TABLE "Payable" ADD COLUMN "serieId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payable_serieId_fkey') THEN
    ALTER TABLE "Payable" ADD CONSTRAINT "Payable_serieId_fkey" FOREIGN KEY ("serieId") REFERENCES "Serie"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Add payableId to RetentionVoucherLine
DO $$ BEGIN ALTER TABLE "RetentionVoucherLine" ADD COLUMN "payableId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RetentionVoucherLine_payableId_fkey') THEN
    ALTER TABLE "RetentionVoucherLine" ADD CONSTRAINT "RetentionVoucherLine_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "Payable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Make purchaseOrderId nullable in RetentionVoucherLine
ALTER TABLE "RetentionVoucherLine" ALTER COLUMN "purchaseOrderId" DROP NOT NULL;

-- Drop obsolete columns
ALTER TABLE "Receivable" DROP COLUMN IF EXISTS "isFiscal";
ALTER TABLE "Receivable" DROP COLUMN IF EXISTS "controlFiscal";
ALTER TABLE "Payable" DROP COLUMN IF EXISTS "isFiscal";

-- =============================================================================
-- SECTION: ISLR RETENTION MODULE
-- =============================================================================

-- SupplierType on Supplier
DO $$ BEGIN ALTER TABLE "Supplier" ADD COLUMN "supplierType" "SupplierType"; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- CompanyConfig ISLR fields
DO $$ BEGIN ALTER TABLE "CompanyConfig" ADD COLUMN "islrRetentionNextNumber" INTEGER NOT NULL DEFAULT 1; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CompanyConfig" ADD COLUMN "unidadTributaria" DOUBLE PRECISION NOT NULL DEFAULT 43; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- IslrRetentionType table
CREATE TABLE IF NOT EXISTS "IslrRetentionType" (
    "id" TEXT NOT NULL,
    "codigo" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "baseImponiblePct" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "retentionPct" DOUBLE PRECISION NOT NULL,
    "sustraendoUt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "forPersonaJuridica" BOOLEAN NOT NULL DEFAULT false,
    "forPersonaResidente" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IslrRetentionType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "IslrRetentionType_codigo_key" ON "IslrRetentionType"("codigo");

-- IslrRetentionVoucher table
CREATE TABLE IF NOT EXISTS "IslrRetentionVoucher" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "serieId" TEXT,
    "status" "RetentionStatus" NOT NULL DEFAULT 'PENDING',
    "issueDate" TIMESTAMP(3),
    "retentionAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unidadTributaria" DOUBLE PRECISION NOT NULL DEFAULT 43,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IslrRetentionVoucher_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "IslrRetentionVoucher_number_key" ON "IslrRetentionVoucher"("number");

-- IslrRetentionVoucherLine table
CREATE TABLE IF NOT EXISTS "IslrRetentionVoucherLine" (
    "id" TEXT NOT NULL,
    "islrRetentionVoucherId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "islrRetentionTypeId" TEXT NOT NULL,
    "supplierInvoiceNumber" TEXT,
    "supplierControlNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "invoiceTotalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "invoiceTotalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableBaseUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableBaseBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseImponiblePct" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "retentionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sustraendoUt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sustraendoBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IslrRetentionVoucherLine_pkey" PRIMARY KEY ("id")
);

-- ISLR fields on PurchaseBookEntry
DO $$ BEGIN ALTER TABLE "PurchaseBookEntry" ADD COLUMN "isIslrRetentionLine" BOOLEAN NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PurchaseBookEntry" ADD COLUMN "islrRetentionAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PurchaseBookEntry" ADD COLUMN "islrRetentionVoucherId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PurchaseBookEntry" ADD COLUMN "islrRetentionVoucherNumber" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Foreign keys for ISLR tables
DO $$ BEGIN ALTER TABLE "IslrRetentionVoucher" ADD CONSTRAINT "IslrRetentionVoucher_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "IslrRetentionVoucher" ADD CONSTRAINT "IslrRetentionVoucher_serieId_fkey" FOREIGN KEY ("serieId") REFERENCES "Serie"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "IslrRetentionVoucher" ADD CONSTRAINT "IslrRetentionVoucher_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "IslrRetentionVoucherLine" ADD CONSTRAINT "IslrRetentionVoucherLine_islrRetentionVoucherId_fkey" FOREIGN KEY ("islrRetentionVoucherId") REFERENCES "IslrRetentionVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "IslrRetentionVoucherLine" ADD CONSTRAINT "IslrRetentionVoucherLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "IslrRetentionVoucherLine" ADD CONSTRAINT "IslrRetentionVoucherLine_islrRetentionTypeId_fkey" FOREIGN KEY ("islrRetentionTypeId") REFERENCES "IslrRetentionType"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PurchaseBookEntry" ADD CONSTRAINT "PurchaseBookEntry_islrRetentionVoucherId_fkey" FOREIGN KEY ("islrRetentionVoucherId") REFERENCES "IslrRetentionVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Supplier.islrConceptId (default ISLR concept)
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Supplier' AND column_name = 'islrConceptId') THEN ALTER TABLE "Supplier" ADD COLUMN "islrConceptId" TEXT; END IF; END $$;
DO $$ BEGIN ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_islrConceptId_fkey" FOREIGN KEY ("islrConceptId") REFERENCES "IslrRetentionType"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- DONE
-- =============================================================================

-- =============================================================================
-- CUSTOMER IVA RETENTIONS (retenciones de IVA sufridas - ventas)
-- =============================================================================

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isSpecialTaxpayer" BOOLEAN NOT NULL DEFAULT false;

ALTER TYPE "ReceiptItemType" ADD VALUE IF NOT EXISTS 'SALES_IVA_RETENTION';

CREATE TABLE IF NOT EXISTS "CustomerIvaRetention" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "taxableBaseUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableBaseBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionPct" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "retentionUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "voucherNumber" TEXT,
    "voucherDate" TIMESTAMP(3),
    "voucherReceivedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "salesBookEntryId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerIvaRetention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerIvaRetention_number_key" ON "CustomerIvaRetention"("number");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerIvaRetention_salesBookEntryId_key" ON "CustomerIvaRetention"("salesBookEntryId");

ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "customerIvaRetentionId" TEXT;

DO $$ BEGIN ALTER TABLE "CustomerIvaRetention" ADD CONSTRAINT "CustomerIvaRetention_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CustomerIvaRetention" ADD CONSTRAINT "CustomerIvaRetention_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CustomerIvaRetention" ADD CONSTRAINT "CustomerIvaRetention_salesBookEntryId_fkey" FOREIGN KEY ("salesBookEntryId") REFERENCES "SalesBookEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CustomerIvaRetention" ADD CONSTRAINT "CustomerIvaRetention_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_customerIvaRetentionId_fkey" FOREIGN KEY ("customerIvaRetentionId") REFERENCES "CustomerIvaRetention"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- BOOK DOCUMENT TYPES (tipo de documento y columnas de retencion en libros)
-- =============================================================================

ALTER TABLE "SalesBookEntry" ADD COLUMN IF NOT EXISTS "documentType" TEXT NOT NULL DEFAULT 'FACTURA';
ALTER TABLE "SalesBookEntry" ADD COLUMN IF NOT EXISTS "affectedDocNumber" TEXT;
ALTER TABLE "SalesBookEntry" ADD COLUMN IF NOT EXISTS "retentionAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SalesBookEntry" ADD COLUMN IF NOT EXISTS "retentionVoucherNumber" TEXT;
ALTER TABLE "PurchaseBookEntry" ADD COLUMN IF NOT EXISTS "documentType" TEXT NOT NULL DEFAULT 'FACTURA';
ALTER TABLE "PurchaseBookEntry" ADD COLUMN IF NOT EXISTS "affectedDocNumber" TEXT;
ALTER TABLE "PurchaseBookEntry" ADD COLUMN IF NOT EXISTS "documentDate" TIMESTAMP(3);

-- =============================================================================
-- CUSTOMER: empresa del grupo (sus facturas no comisionan)
-- =============================================================================

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isGroupCompany" BOOLEAN NOT NULL DEFAULT false;

-- =============================================================================
-- CONTROL DE COMANDAS (Session 58): estado PRINTING + campos de reimpresion
-- =============================================================================

ALTER TYPE "PrintStatus" ADD VALUE IF NOT EXISTS 'PRINTING';
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "isReprint" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "reprintOfId" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "PrintJob" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;

-- =============================================================================
-- ARQUEO DE CAJA POR MONEDA (Session 60): efectivo vs electronico + descuadre
-- =============================================================================

ALTER TABLE "PaymentMethod" ADD COLUMN IF NOT EXISTS "isCash" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "expectedUsd"   DOUBLE PRECISION;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "expectedBs"    DOUBLE PRECISION;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "differenceUsd" DOUBLE PRECISION;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "differenceBs"  DOUBLE PRECISION;
UPDATE "PaymentMethod" SET "isCash" = true
 WHERE id IN ('pm_cash_usd', 'pm_cash_bs') OR name IN ('Efectivo USD', 'Efectivo Bs');

-- =============================================================================
-- META MENSUAL DEL VENDEDOR (Session 69)
-- =============================================================================
ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "monthlyGoalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- =============================================================================
-- METODO DE PAGO "SALDO A FAVOR" (Session 80)
-- El sistema usa el id fijo 'pm_saldo_favor' al cruzar anticipos/notas de credito
-- (invoices.service.pay). Payment.methodId es FK a PaymentMethod, asi que la fila
-- DEBE existir o el cobro revienta con "Metodo de pago ... no encontrado".
-- BDs sembradas antes de que el seed lo incluyera no lo tienen -> esto lo auto-repara.
-- =============================================================================
INSERT INTO "PaymentMethod" (id, name, "isDivisa", "isCash", "createsReceivable", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES ('pm_saldo_favor', 'Saldo a Favor', false, false, false, true, 99, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- INDICES PARA "DISPONIBLE" / FACTURAS EN ESPERA (Session 81)
-- Aceleran encontrar facturas PENDING y sus items sin escanear todo el historial.
-- =============================================================================
CREATE INDEX IF NOT EXISTS "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX IF NOT EXISTS "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- =============================================================================
-- INDICE GIN DE BUSQUEDA DE PRODUCTOS (Session 81 follow-up)
-- La migracion 20260510000000 lo crea, pero en prod se habia perdido (la columna y
-- el trigger estaban, el indice GIN no) -> la busqueda hacia seq scan. Esto lo
-- re-crea y evita que vuelva a faltar. Acelera Product.searchVector @@ tsquery.
-- =============================================================================
CREATE INDEX IF NOT EXISTS "Product_searchVector_idx" ON "Product" USING GIN ("searchVector");

-- Funcion/trigger de busqueda NORMALIZADA (separadores P/ . - -> espacio, unaccent, +otherCode).
-- Idempotente; mantiene la version buena aunque migre. NO hace backfill (eso va en la migracion
-- 20260710170000). Sin esto, "asiento poceta" no encuentra "ASIENTO P/POCETA".
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW."searchVector" := to_tsvector('spanish',
    regexp_replace(
      unaccent(lower(
        COALESCE(NEW.name, '') || ' ' ||
        COALESCE(NEW.code, '') || ' ' ||
        COALESCE(NEW.barcode, '') || ' ' ||
        COALESCE(NEW."supplierRef", '') || ' ' ||
        COALESCE(NEW."otherCode", '')
      )),
      '[^a-z0-9 ]+', ' ', 'g'
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS product_search_vector_trigger ON "Product";
CREATE TRIGGER product_search_vector_trigger
  BEFORE INSERT OR UPDATE ON "Product"
  FOR EACH ROW EXECUTE FUNCTION update_product_search_vector();

-- =============================================================================
-- MODO DE COSTO DEL AJUSTE DE INVENTARIO (Session 101)
-- Elige si el REPORTE del ajuste usa costo puro ('COST') o costo + brecha ('BREGA').
-- 'BREGA' por defecto.
-- =============================================================================
ALTER TABLE "InventoryAdjustment" ADD COLUMN IF NOT EXISTS "costMode" TEXT NOT NULL DEFAULT 'BREGA';

-- =============================================================================
-- COMANDAS DE DEVOLUCION (Session 104)
-- PrintJob puede colgar de una nota (creditDebitNoteId); invoiceId opcional.
-- CreditDebitNote registra cuando se procesaron sus comandas (bloquea borrado).
-- PrintArea puede marcarse como "por defecto" (fallback de ruteo).
-- =============================================================================
ALTER TABLE "PrintJob" ALTER COLUMN "invoiceId" DROP NOT NULL;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "creditDebitNoteId" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PrintJob_creditDebitNoteId_fkey'
  ) THEN
    ALTER TABLE "PrintJob"
      ADD CONSTRAINT "PrintJob_creditDebitNoteId_fkey"
      FOREIGN KEY ("creditDebitNoteId") REFERENCES "CreditDebitNote"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "comandasProcessedAt" TIMESTAMP(3);
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "comandasProcessedById" TEXT;
ALTER TABLE "PrintArea" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- =============================================================================
-- RETENCIONES SOBRE CUENTAS POR PAGAR (Session 106)
-- Comprobantes de retencion (IVA/ISLR) seleccionables en el recibo de pago.
-- NOTA: el UPDATE de "marcar aplicados los viejos" va SOLO en la migracion, NO aqui.
-- =============================================================================
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "retentionVoucherId" TEXT;
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "islrRetentionVoucherId" TEXT;
ALTER TABLE "IslrRetentionVoucherLine" ADD COLUMN IF NOT EXISTS "payableId" TEXT;
ALTER TABLE "RetentionVoucher" ADD COLUMN IF NOT EXISTS "appliedAt" TIMESTAMP(3);
ALTER TABLE "IslrRetentionVoucher" ADD COLUMN IF NOT EXISTS "appliedAt" TIMESTAMP(3);
ALTER TYPE "ReceiptItemType" ADD VALUE IF NOT EXISTS 'PURCHASE_IVA_RETENTION';
ALTER TYPE "ReceiptItemType" ADD VALUE IF NOT EXISTS 'PURCHASE_ISLR_RETENTION';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ReceiptItem_retentionVoucherId_fkey') THEN
    ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_retentionVoucherId_fkey"
      FOREIGN KEY ("retentionVoucherId") REFERENCES "RetentionVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ReceiptItem_islrRetentionVoucherId_fkey') THEN
    ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_islrRetentionVoucherId_fkey"
      FOREIGN KEY ("islrRetentionVoucherId") REFERENCES "IslrRetentionVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'IslrRetentionVoucherLine_payableId_fkey') THEN
    ALTER TABLE "IslrRetentionVoucherLine" ADD CONSTRAINT "IslrRetentionVoucherLine_payableId_fkey"
      FOREIGN KEY ("payableId") REFERENCES "Payable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- =============================================================================
-- Credito pre-aprobado y blindado (2026-07-05)
-- =============================================================================
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isEmployee" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditAuthorizedBy" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditReviewedAt" TIMESTAMP(3);
ALTER TYPE "PermissionKey" ADD VALUE IF NOT EXISTS 'MANAGE_CUSTOMER_CREDIT';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'OVERRIDE_CREDIT_BLOCK';

-- =============================================================================
-- Dias de credito por defecto del proveedor (2026-07-06)
-- =============================================================================
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "creditDays" INTEGER NOT NULL DEFAULT 0;

-- =============================================================================
-- Correlativo visible para ajustes de inventario ADJ-0001 (2026-07-06)
-- =============================================================================
ALTER TABLE "InventoryAdjustment" ADD COLUMN IF NOT EXISTS "number" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryAdjustment_number_key" ON "InventoryAdjustment"("number");

-- =============================================================================
-- Fotos de productos (Fase 1)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "ProductImage" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "thumbKey" TEXT NOT NULL,
  "mediumKey" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "bytes" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProductImage_productId_idx" ON "ProductImage"("productId");
DO $$ BEGIN
  ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "primaryImageThumbUrl" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "primaryImageMediumUrl" TEXT;
-- Tienda online: flags de publicacion (Parte A)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "showInStore" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "storeFeatured" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Product_showInStore_idx" ON "Product" ("showInStore");

-- Tienda online: pedidos (Parte C)
DO $$ BEGIN
  CREATE TYPE "OnlineOrderStatus" AS ENUM ('POR_VERIFICAR','CONFIRMADO','FACTURADO','CANCELADO');
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE TABLE IF NOT EXISTS "OnlineOrder" (
  "id" TEXT PRIMARY KEY,
  "number" TEXT NOT NULL UNIQUE,
  "customerName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "cedula" TEXT,
  "deliveryMethod" TEXT NOT NULL DEFAULT 'PICKUP',
  "address" TEXT,
  "paymentRef" TEXT,
  "notes" TEXT,
  "email" TEXT,
  "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" "OnlineOrderStatus" NOT NULL DEFAULT 'POR_VERIFICAR',
  "verifiedById" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "invoiceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "OnlineOrderItem" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL REFERENCES "OnlineOrder"("id") ON DELETE CASCADE,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "priceUsd" DOUBLE PRECISION NOT NULL,
  "priceBs" DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS "OnlineOrderItem_orderId_idx" ON "OnlineOrderItem" ("orderId");
ALTER TABLE "OnlineOrder" ADD COLUMN IF NOT EXISTS "paymentProofUrl" TEXT;

-- Busqueda rapida de clientes en el POS: indices trigram (ILIKE '%...%' con muchos miles de clientes).
-- Sin esto, buscar por cedula/RIF hace seq scan (~150ms con 48k); con trgm baja a <2ms.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "idx_customer_name_trgm" ON "Customer" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_customer_rif_trgm" ON "Customer" USING gin ("rif" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_customer_phone_trgm" ON "Customer" USING gin ("phone" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_customer_email_trgm" ON "Customer" USING gin ("email" gin_trgm_ops);

-- Costo editable por item del ajuste de inventario (reporte + CxC/CxP).
ALTER TABLE "InventoryAdjustmentItem" ADD COLUMN IF NOT EXISTS "unitCostUsd" DOUBLE PRECISION;

-- Metodo de pago nullable en pagos de CxC/CxP: un cruce a cero (factura <-> su nota) no tiene metodo.
ALTER TABLE "ReceivablePayment" ALTER COLUMN "methodId" DROP NOT NULL;
ALTER TABLE "PayablePayment" ALTER COLUMN "methodId" DROP NOT NULL;

-- Despachos / comandas por retirar (mercancia pagada, retiro posterior/parcial). No toca stock.
DO $$ BEGIN CREATE TYPE "DispatchStatus" AS ENUM ('PENDIENTE','PARCIAL','COMPLETADO','CANCELADO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "Dispatch" (
  "id" TEXT NOT NULL, "number" TEXT NOT NULL, "invoiceId" TEXT NOT NULL,
  "status" "DispatchStatus" NOT NULL DEFAULT 'PENDIENTE', "scheduledDate" TIMESTAMP(3),
  "contactName" TEXT, "contactPhone" TEXT, "notes" TEXT, "createdById" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "Dispatch_number_key" ON "Dispatch"("number");
CREATE UNIQUE INDEX IF NOT EXISTS "Dispatch_invoiceId_key" ON "Dispatch"("invoiceId");
CREATE INDEX IF NOT EXISTS "Dispatch_status_idx" ON "Dispatch"("status");
CREATE TABLE IF NOT EXISTS "DispatchItem" (
  "id" TEXT NOT NULL, "dispatchId" TEXT NOT NULL, "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL, "productCode" TEXT, "printAreaId" TEXT, "printAreaName" TEXT,
  "quantityInvoiced" DOUBLE PRECISION NOT NULL, "quantityDelivered" DOUBLE PRECISION NOT NULL DEFAULT 0,
  CONSTRAINT "DispatchItem_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "DispatchItem_dispatchId_idx" ON "DispatchItem"("dispatchId");
CREATE INDEX IF NOT EXISTS "DispatchItem_printAreaId_idx" ON "DispatchItem"("printAreaId");
CREATE TABLE IF NOT EXISTS "DispatchDelivery" (
  "id" TEXT NOT NULL, "dispatchId" TEXT NOT NULL, "deliveredById" TEXT NOT NULL,
  "note" TEXT, "lines" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DispatchDelivery_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "DispatchDelivery_dispatchId_idx" ON "DispatchDelivery"("dispatchId");
DO $$ BEGIN ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "DispatchDelivery" ADD CONSTRAINT "DispatchDelivery_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "DispatchDelivery" ADD CONSTRAINT "DispatchDelivery_deliveredById_fkey" FOREIGN KEY ("deliveredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CashMovement.isCash: ¿afecta la gaveta física? (efectivo sí; electrónico no). Se deriva del método.
ALTER TABLE "CashMovement" ADD COLUMN IF NOT EXISTS "isCash" BOOLEAN NOT NULL DEFAULT true;
