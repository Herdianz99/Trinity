-- =============================================================================
-- Trinity Schema Audit Script
-- Checks all enums, tables, and columns from the Prisma schema exist in the DB.
-- Only reports MISSING items. If everything is present, prints "Schema OK".
-- =============================================================================

-- Track whether anything is missing
CREATE TEMP TABLE IF NOT EXISTS _audit_results (msg TEXT);

-- =============================================================================
-- 1. CHECK ENUMS (25 total)
-- =============================================================================
DO $$
DECLARE
  _enum_name TEXT;
  _enum_value TEXT;
  _enum_exists BOOLEAN;
  _value_exists BOOLEAN;
  _enums TEXT[][] := ARRAY[
    -- UserRole
    ARRAY['UserRole', 'ADMIN'],
    ARRAY['UserRole', 'SUPERVISOR'],
    ARRAY['UserRole', 'CASHIER'],
    ARRAY['UserRole', 'SELLER'],
    ARRAY['UserRole', 'WAREHOUSE'],
    ARRAY['UserRole', 'BUYER'],
    ARRAY['UserRole', 'ACCOUNTANT'],
    ARRAY['UserRole', 'AUDITOR'],
    -- IvaType
    ARRAY['IvaType', 'EXEMPT'],
    ARRAY['IvaType', 'REDUCED'],
    ARRAY['IvaType', 'GENERAL'],
    ARRAY['IvaType', 'SPECIAL'],
    -- MovementType
    ARRAY['MovementType', 'PURCHASE'],
    ARRAY['MovementType', 'SALE'],
    ARRAY['MovementType', 'ADJUSTMENT_IN'],
    ARRAY['MovementType', 'ADJUSTMENT_OUT'],
    ARRAY['MovementType', 'TRANSFER_IN'],
    ARRAY['MovementType', 'TRANSFER_OUT'],
    ARRAY['MovementType', 'COUNT_ADJUST'],
    ARRAY['MovementType', 'RETURN_IN'],
    ARRAY['MovementType', 'RETURN_OUT'],
    -- NoteType
    ARRAY['NoteType', 'NCV'],
    ARRAY['NoteType', 'NDV'],
    ARRAY['NoteType', 'NCC'],
    ARRAY['NoteType', 'NDC'],
    -- NoteOrigin
    ARRAY['NoteOrigin', 'MERCHANDISE'],
    ARRAY['NoteOrigin', 'MANUAL'],
    -- NoteStatus
    ARRAY['NoteStatus', 'DRAFT'],
    ARRAY['NoteStatus', 'POSTED'],
    ARRAY['NoteStatus', 'CANCELLED'],
    -- TransferStatus
    ARRAY['TransferStatus', 'PENDING'],
    ARRAY['TransferStatus', 'APPROVED'],
    ARRAY['TransferStatus', 'CANCELLED'],
    -- CountStatus
    ARRAY['CountStatus', 'DRAFT'],
    ARRAY['CountStatus', 'IN_PROGRESS'],
    ARRAY['CountStatus', 'APPROVED'],
    ARRAY['CountStatus', 'CANCELLED'],
    -- PurchaseStatus
    ARRAY['PurchaseStatus', 'DRAFT'],
    ARRAY['PurchaseStatus', 'SENT'],
    ARRAY['PurchaseStatus', 'PARTIAL'],
    ARRAY['PurchaseStatus', 'RECEIVED'],
    ARRAY['PurchaseStatus', 'CANCELLED'],
    -- PermissionKey
    ARRAY['PermissionKey', 'OVERRIDE_PRICE'],
    ARRAY['PermissionKey', 'RETURN_INVOICE'],
    ARRAY['PermissionKey', 'CREDIT_NOTE_SALE'],
    ARRAY['PermissionKey', 'DEBIT_NOTE_SALE'],
    ARRAY['PermissionKey', 'RETURN_PURCHASE'],
    ARRAY['PermissionKey', 'CREDIT_NOTE_PURCHASE'],
    ARRAY['PermissionKey', 'DEBIT_NOTE_PURCHASE'],
    ARRAY['PermissionKey', 'MANAGE_EXPENSES'],
    -- SessionStatus
    ARRAY['SessionStatus', 'OPEN'],
    ARRAY['SessionStatus', 'CLOSED'],
    -- InvoicePaymentType
    ARRAY['InvoicePaymentType', 'CASH'],
    ARRAY['InvoicePaymentType', 'CREDIT'],
    -- InvoiceStatus
    ARRAY['InvoiceStatus', 'PENDING'],
    ARRAY['InvoiceStatus', 'PAID'],
    ARRAY['InvoiceStatus', 'PARTIAL_RETURN'],
    ARRAY['InvoiceStatus', 'RETURNED'],
    ARRAY['InvoiceStatus', 'CANCELLED'],
    -- InvoiceType
    ARRAY['InvoiceType', 'SALE'],
    ARRAY['InvoiceType', 'DEBIT_NOTE'],
    ARRAY['InvoiceType', 'CREDIT_NOTE'],
    -- ReceivableType
    ARRAY['ReceivableType', 'CUSTOMER_CREDIT'],
    ARRAY['ReceivableType', 'FINANCING_PLATFORM'],
    -- ReceivableStatus
    ARRAY['ReceivableStatus', 'PENDING'],
    ARRAY['ReceivableStatus', 'PARTIAL'],
    ARRAY['ReceivableStatus', 'PAID'],
    ARRAY['ReceivableStatus', 'OVERDUE'],
    -- PayableStatus
    ARRAY['PayableStatus', 'PENDING'],
    ARRAY['PayableStatus', 'PARTIAL'],
    ARRAY['PayableStatus', 'PAID'],
    ARRAY['PayableStatus', 'OVERDUE'],
    -- PaymentScheduleStatus
    ARRAY['PaymentScheduleStatus', 'DRAFT'],
    ARRAY['PaymentScheduleStatus', 'APPROVED'],
    ARRAY['PaymentScheduleStatus', 'EXECUTED'],
    ARRAY['PaymentScheduleStatus', 'CANCELLED'],
    -- ReceiptType
    ARRAY['ReceiptType', 'COLLECTION'],
    ARRAY['ReceiptType', 'PAYMENT'],
    -- ReceiptStatus
    ARRAY['ReceiptStatus', 'DRAFT'],
    ARRAY['ReceiptStatus', 'POSTED'],
    ARRAY['ReceiptStatus', 'CANCELLED'],
    -- ReceiptItemType
    ARRAY['ReceiptItemType', 'RECEIVABLE'],
    ARRAY['ReceiptItemType', 'PAYABLE'],
    ARRAY['ReceiptItemType', 'DIFFERENTIAL'],
    ARRAY['ReceiptItemType', 'CREDIT_NOTE'],
    ARRAY['ReceiptItemType', 'DEBIT_NOTE'],
    -- DynamicKeyPerm
    ARRAY['DynamicKeyPerm', 'DELETE_CREDIT_NOTE_SALE'],
    ARRAY['DynamicKeyPerm', 'DELETE_DEBIT_NOTE_SALE'],
    ARRAY['DynamicKeyPerm', 'DELETE_CREDIT_NOTE_PURCHASE'],
    ARRAY['DynamicKeyPerm', 'DELETE_DEBIT_NOTE_PURCHASE'],
    ARRAY['DynamicKeyPerm', 'DELETE_RECEIPT_COLLECTION'],
    ARRAY['DynamicKeyPerm', 'DELETE_RECEIPT_PAYMENT'],
    ARRAY['DynamicKeyPerm', 'DELETE_EXPENSE'],
    ARRAY['DynamicKeyPerm', 'MODIFY_PRODUCT_PRICE'],
    ARRAY['DynamicKeyPerm', 'CANCEL_CASH_SESSION'],
    ARRAY['DynamicKeyPerm', 'CHANGE_EXCHANGE_RATE'],
    ARRAY['DynamicKeyPerm', 'MANUAL_STOCK_ADJUSTMENT'],
    ARRAY['DynamicKeyPerm', 'GIVE_DISCOUNT'],
    ARRAY['DynamicKeyPerm', 'ALLOW_CREDIT_INVOICE'],
    -- ExchangeRateSource
    ARRAY['ExchangeRateSource', 'BCV'],
    ARRAY['ExchangeRateSource', 'MANUAL'],
    -- QuotationStatus
    ARRAY['QuotationStatus', 'DRAFT'],
    ARRAY['QuotationStatus', 'SENT'],
    ARRAY['QuotationStatus', 'APPROVED'],
    ARRAY['QuotationStatus', 'REJECTED'],
    ARRAY['QuotationStatus', 'EXPIRED'],
    -- PrintStatus
    ARRAY['PrintStatus', 'PENDING'],
    ARRAY['PrintStatus', 'PRINTED'],
    ARRAY['PrintStatus', 'FAILED']
  ];
BEGIN
  FOR i IN 1..array_length(_enums, 1) LOOP
    _enum_name := _enums[i][1];
    _enum_value := _enums[i][2];

    -- Check if the enum type exists
    SELECT EXISTS(
      SELECT 1 FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = _enum_name AND n.nspname = 'public'
    ) INTO _enum_exists;

    IF NOT _enum_exists THEN
      INSERT INTO _audit_results (msg)
        VALUES ('MISSING ENUM TYPE: ' || _enum_name);
    ELSE
      -- Check if the enum value exists
      SELECT EXISTS(
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = _enum_name AND n.nspname = 'public' AND e.enumlabel = _enum_value
      ) INTO _value_exists;

      IF NOT _value_exists THEN
        INSERT INTO _audit_results (msg)
          VALUES ('MISSING ENUM VALUE: ' || _enum_name || '.' || _enum_value);
      END IF;
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- 2. CHECK TABLES (47 total)
-- =============================================================================
DO $$
DECLARE
  _table_name TEXT;
  _tables TEXT[] := ARRAY[
    'CompanyConfig',
    'ExchangeRate',
    'User',
    'UserPermission',
    'RolePermission',
    'DynamicKey',
    'DynamicKeyPermission',
    'DynamicKeyLog',
    'Seller',
    'PrintArea',
    'Category',
    'Brand',
    'Supplier',
    'Product',
    'Warehouse',
    'Stock',
    'StockMovement',
    'Transfer',
    'TransferItem',
    'InventoryCount',
    'InventoryCountItem',
    'PurchaseOrder',
    'PurchaseOrderItem',
    'Customer',
    'PaymentMethod',
    'CashRegister',
    'CashSession',
    'Invoice',
    'InvoiceItem',
    'Payment',
    'Receivable',
    'ReceivablePayment',
    'Payable',
    'PayablePayment',
    'Receipt',
    'ReceiptItem',
    'ReceiptPayment',
    'PriceAdjustmentLog',
    'PrintJob',
    'Quotation',
    'QuotationItem',
    'CreditDebitNote',
    'CreditDebitNoteItem',
    'PaymentSchedule',
    'PaymentScheduleItem',
    'ExpenseCategory',
    'Expense'
  ];
BEGIN
  FOREACH _table_name IN ARRAY _tables LOOP
    IF NOT EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = _table_name
    ) THEN
      INSERT INTO _audit_results (msg)
        VALUES ('MISSING TABLE: ' || _table_name);
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- 3. CHECK COLUMNS (all scalar fields for each table)
-- =============================================================================
DO $$
DECLARE
  _rec RECORD;
BEGIN
  FOR _rec IN (
    WITH expected_columns(table_name, column_name) AS (VALUES
      -- CompanyConfig
      ('CompanyConfig', 'id'),
      ('CompanyConfig', 'companyName'),
      ('CompanyConfig', 'rif'),
      ('CompanyConfig', 'address'),
      ('CompanyConfig', 'phone'),
      ('CompanyConfig', 'email'),
      ('CompanyConfig', 'bregaGlobalPct'),
      ('CompanyConfig', 'defaultGananciaPct'),
      ('CompanyConfig', 'defaultGananciaMayorPct'),
      ('CompanyConfig', 'defaultWarehouseId'),
      ('CompanyConfig', 'invoicePrefix'),
      ('CompanyConfig', 'creditAuthPassword'),
      ('CompanyConfig', 'quotationValidityDays'),
      ('CompanyConfig', 'overdueWarningDays'),
      ('CompanyConfig', 'ivaRetentionPct'),
      ('CompanyConfig', 'islrRetentionPct'),
      ('CompanyConfig', 'isIGTFContributor'),
      ('CompanyConfig', 'igtfPct'),
      ('CompanyConfig', 'fiscalCreditCode'),
      ('CompanyConfig', 'allowNegativeStock'),
      ('CompanyConfig', 'defaultCustomerId'),
      ('CompanyConfig', 'logo'),
      ('CompanyConfig', 'updatedAt'),
      -- ExchangeRate
      ('ExchangeRate', 'id'),
      ('ExchangeRate', 'rate'),
      ('ExchangeRate', 'date'),
      ('ExchangeRate', 'source'),
      ('ExchangeRate', 'createdById'),
      ('ExchangeRate', 'createdAt'),
      -- User
      ('User', 'id'),
      ('User', 'name'),
      ('User', 'email'),
      ('User', 'password'),
      ('User', 'role'),
      ('User', 'isActive'),
      ('User', 'mustChangePassword'),
      ('User', 'lastLoginAt'),
      ('User', 'createdAt'),
      ('User', 'updatedAt'),
      -- UserPermission
      ('UserPermission', 'id'),
      ('UserPermission', 'userId'),
      ('UserPermission', 'permissionKey'),
      ('UserPermission', 'createdAt'),
      -- RolePermission
      ('RolePermission', 'id'),
      ('RolePermission', 'role'),
      ('RolePermission', 'modules'),
      ('RolePermission', 'updatedAt'),
      -- DynamicKey
      ('DynamicKey', 'id'),
      ('DynamicKey', 'name'),
      ('DynamicKey', 'keyHash'),
      ('DynamicKey', 'isActive'),
      ('DynamicKey', 'createdById'),
      ('DynamicKey', 'createdAt'),
      ('DynamicKey', 'updatedAt'),
      -- DynamicKeyPermission
      ('DynamicKeyPermission', 'id'),
      ('DynamicKeyPermission', 'dynamicKeyId'),
      ('DynamicKeyPermission', 'permission'),
      -- DynamicKeyLog
      ('DynamicKeyLog', 'id'),
      ('DynamicKeyLog', 'dynamicKeyId'),
      ('DynamicKeyLog', 'permission'),
      ('DynamicKeyLog', 'action'),
      ('DynamicKeyLog', 'entityType'),
      ('DynamicKeyLog', 'entityId'),
      ('DynamicKeyLog', 'createdAt'),
      -- Seller
      ('Seller', 'id'),
      ('Seller', 'code'),
      ('Seller', 'name'),
      ('Seller', 'phone'),
      ('Seller', 'isActive'),
      ('Seller', 'userId'),
      ('Seller', 'createdAt'),
      ('Seller', 'updatedAt'),
      -- PrintArea
      ('PrintArea', 'id'),
      ('PrintArea', 'name'),
      ('PrintArea', 'description'),
      ('PrintArea', 'isActive'),
      ('PrintArea', 'createdAt'),
      ('PrintArea', 'updatedAt'),
      -- Category
      ('Category', 'id'),
      ('Category', 'name'),
      ('Category', 'code'),
      ('Category', 'lastProductNumber'),
      ('Category', 'commissionPct'),
      ('Category', 'printAreaId'),
      ('Category', 'parentId'),
      ('Category', 'createdAt'),
      -- Brand
      ('Brand', 'id'),
      ('Brand', 'name'),
      ('Brand', 'createdAt'),
      -- Supplier
      ('Supplier', 'id'),
      ('Supplier', 'name'),
      ('Supplier', 'rif'),
      ('Supplier', 'phone'),
      ('Supplier', 'email'),
      ('Supplier', 'address'),
      ('Supplier', 'contactName'),
      ('Supplier', 'isRetentionAgent'),
      ('Supplier', 'isActive'),
      ('Supplier', 'createdAt'),
      ('Supplier', 'updatedAt'),
      -- Product
      ('Product', 'id'),
      ('Product', 'code'),
      ('Product', 'barcode'),
      ('Product', 'supplierRef'),
      ('Product', 'name'),
      ('Product', 'description'),
      ('Product', 'categoryId'),
      ('Product', 'brandId'),
      ('Product', 'supplierId'),
      ('Product', 'purchaseUnit'),
      ('Product', 'saleUnit'),
      ('Product', 'conversionFactor'),
      ('Product', 'costUsd'),
      ('Product', 'bregaApplies'),
      ('Product', 'gananciaPct'),
      ('Product', 'gananciaMayorPct'),
      ('Product', 'ivaType'),
      ('Product', 'priceDetal'),
      ('Product', 'priceMayor'),
      ('Product', 'minStock'),
      ('Product', 'isActive'),
      ('Product', 'searchVector'),
      ('Product', 'createdAt'),
      ('Product', 'updatedAt'),
      -- Warehouse
      ('Warehouse', 'id'),
      ('Warehouse', 'name'),
      ('Warehouse', 'location'),
      ('Warehouse', 'isDefault'),
      ('Warehouse', 'isActive'),
      ('Warehouse', 'createdAt'),
      -- Stock
      ('Stock', 'id'),
      ('Stock', 'productId'),
      ('Stock', 'warehouseId'),
      ('Stock', 'quantity'),
      ('Stock', 'updatedAt'),
      -- StockMovement
      ('StockMovement', 'id'),
      ('StockMovement', 'productId'),
      ('StockMovement', 'warehouseId'),
      ('StockMovement', 'type'),
      ('StockMovement', 'quantity'),
      ('StockMovement', 'costUsd'),
      ('StockMovement', 'reason'),
      ('StockMovement', 'reference'),
      ('StockMovement', 'createdById'),
      ('StockMovement', 'createdAt'),
      -- Transfer
      ('Transfer', 'id'),
      ('Transfer', 'fromWarehouseId'),
      ('Transfer', 'toWarehouseId'),
      ('Transfer', 'status'),
      ('Transfer', 'notes'),
      ('Transfer', 'createdById'),
      ('Transfer', 'approvedById'),
      ('Transfer', 'createdAt'),
      ('Transfer', 'updatedAt'),
      -- TransferItem
      ('TransferItem', 'id'),
      ('TransferItem', 'transferId'),
      ('TransferItem', 'productId'),
      ('TransferItem', 'quantity'),
      -- InventoryCount
      ('InventoryCount', 'id'),
      ('InventoryCount', 'warehouseId'),
      ('InventoryCount', 'status'),
      ('InventoryCount', 'notes'),
      ('InventoryCount', 'createdById'),
      ('InventoryCount', 'approvedById'),
      ('InventoryCount', 'createdAt'),
      ('InventoryCount', 'updatedAt'),
      -- InventoryCountItem
      ('InventoryCountItem', 'id'),
      ('InventoryCountItem', 'inventoryCountId'),
      ('InventoryCountItem', 'productId'),
      ('InventoryCountItem', 'systemQuantity'),
      ('InventoryCountItem', 'countedQuantity'),
      ('InventoryCountItem', 'difference'),
      -- PurchaseOrder
      ('PurchaseOrder', 'id'),
      ('PurchaseOrder', 'number'),
      ('PurchaseOrder', 'supplierId'),
      ('PurchaseOrder', 'status'),
      ('PurchaseOrder', 'totalUsd'),
      ('PurchaseOrder', 'totalBs'),
      ('PurchaseOrder', 'exchangeRate'),
      ('PurchaseOrder', 'isCredit'),
      ('PurchaseOrder', 'creditDays'),
      ('PurchaseOrder', 'supplierControlNumber'),
      ('PurchaseOrder', 'islrRetentionPct'),
      ('PurchaseOrder', 'islrRetentionUsd'),
      ('PurchaseOrder', 'islrRetentionBs'),
      ('PurchaseOrder', 'notes'),
      ('PurchaseOrder', 'receivedAt'),
      ('PurchaseOrder', 'createdById'),
      ('PurchaseOrder', 'createdAt'),
      ('PurchaseOrder', 'updatedAt'),
      -- PurchaseOrderItem
      ('PurchaseOrderItem', 'id'),
      ('PurchaseOrderItem', 'purchaseOrderId'),
      ('PurchaseOrderItem', 'productId'),
      ('PurchaseOrderItem', 'quantity'),
      ('PurchaseOrderItem', 'costUsd'),
      ('PurchaseOrderItem', 'costBs'),
      ('PurchaseOrderItem', 'totalUsd'),
      ('PurchaseOrderItem', 'totalBs'),
      ('PurchaseOrderItem', 'receivedQty'),
      -- Customer
      ('Customer', 'id'),
      ('Customer', 'name'),
      ('Customer', 'documentType'),
      ('Customer', 'rif'),
      ('Customer', 'phone'),
      ('Customer', 'email'),
      ('Customer', 'address'),
      ('Customer', 'creditLimit'),
      ('Customer', 'creditDays'),
      ('Customer', 'isDefault'),
      ('Customer', 'isActive'),
      ('Customer', 'createdAt'),
      ('Customer', 'updatedAt'),
      -- PaymentMethod
      ('PaymentMethod', 'id'),
      ('PaymentMethod', 'name'),
      ('PaymentMethod', 'isDivisa'),
      ('PaymentMethod', 'createsReceivable'),
      ('PaymentMethod', 'isActive'),
      ('PaymentMethod', 'sortOrder'),
      ('PaymentMethod', 'fiscalCode'),
      ('PaymentMethod', 'parentId'),
      ('PaymentMethod', 'createdAt'),
      ('PaymentMethod', 'updatedAt'),
      -- CashRegister
      ('CashRegister', 'id'),
      ('CashRegister', 'code'),
      ('CashRegister', 'name'),
      ('CashRegister', 'isFiscal'),
      ('CashRegister', 'isShared'),
      ('CashRegister', 'isActive'),
      ('CashRegister', 'lastInvoiceNumber'),
      ('CashRegister', 'comPort'),
      ('CashRegister', 'createdAt'),
      ('CashRegister', 'updatedAt'),
      -- CashSession
      ('CashSession', 'id'),
      ('CashSession', 'cashRegisterId'),
      ('CashSession', 'openedById'),
      ('CashSession', 'closedById'),
      ('CashSession', 'openingBalanceUsd'),
      ('CashSession', 'openingBalanceBs'),
      ('CashSession', 'closingBalanceUsd'),
      ('CashSession', 'closingBalanceBs'),
      ('CashSession', 'status'),
      ('CashSession', 'notes'),
      ('CashSession', 'openedAt'),
      ('CashSession', 'closedAt'),
      -- Invoice
      ('Invoice', 'id'),
      ('Invoice', 'number'),
      ('Invoice', 'fiscalNumber'),
      ('Invoice', 'controlNumber'),
      ('Invoice', 'fiscalMachineSerial'),
      ('Invoice', 'cashRegisterId'),
      ('Invoice', 'customerId'),
      ('Invoice', 'status'),
      ('Invoice', 'paymentType'),
      ('Invoice', 'type'),
      ('Invoice', 'subtotalUsd'),
      ('Invoice', 'ivaUsd'),
      ('Invoice', 'totalUsd'),
      ('Invoice', 'totalBs'),
      ('Invoice', 'exchangeRate'),
      ('Invoice', 'igtfUsd'),
      ('Invoice', 'igtfBs'),
      ('Invoice', 'subtotalBs'),
      ('Invoice', 'ivaBs'),
      ('Invoice', 'isCredit'),
      ('Invoice', 'creditDays'),
      ('Invoice', 'dueDate'),
      ('Invoice', 'paidAt'),
      ('Invoice', 'notes'),
      ('Invoice', 'createdById'),
      ('Invoice', 'sellerId'),
      ('Invoice', 'cashierId'),
      ('Invoice', 'lockedById'),
      ('Invoice', 'lockedAt'),
      ('Invoice', 'createdAt'),
      ('Invoice', 'updatedAt'),
      -- InvoiceItem
      ('InvoiceItem', 'id'),
      ('InvoiceItem', 'invoiceId'),
      ('InvoiceItem', 'productId'),
      ('InvoiceItem', 'productName'),
      ('InvoiceItem', 'quantity'),
      ('InvoiceItem', 'unitPrice'),
      ('InvoiceItem', 'ivaType'),
      ('InvoiceItem', 'ivaAmount'),
      ('InvoiceItem', 'totalUsd'),
      ('InvoiceItem', 'unitPriceBs'),
      ('InvoiceItem', 'ivaAmountBs'),
      ('InvoiceItem', 'totalBs'),
      ('InvoiceItem', 'unitPriceWithoutIva'),
      ('InvoiceItem', 'unitPriceWithoutIvaBs'),
      ('InvoiceItem', 'discountPct'),
      ('InvoiceItem', 'costUsd'),
      ('InvoiceItem', 'costBs'),
      ('InvoiceItem', 'priceOverridden'),
      -- Payment
      ('Payment', 'id'),
      ('Payment', 'invoiceId'),
      ('Payment', 'methodId'),
      ('Payment', 'amountUsd'),
      ('Payment', 'amountBs'),
      ('Payment', 'exchangeRate'),
      ('Payment', 'reference'),
      ('Payment', 'igtfUsd'),
      ('Payment', 'igtfBs'),
      ('Payment', 'createdAt'),
      -- Receivable
      ('Receivable', 'id'),
      ('Receivable', 'type'),
      ('Receivable', 'customerId'),
      ('Receivable', 'platformName'),
      ('Receivable', 'reference'),
      ('Receivable', 'invoiceId'),
      ('Receivable', 'amountUsd'),
      ('Receivable', 'amountBs'),
      ('Receivable', 'exchangeRate'),
      ('Receivable', 'dueDate'),
      ('Receivable', 'status'),
      ('Receivable', 'paidAmountUsd'),
      ('Receivable', 'paidAmountBs'),
      ('Receivable', 'paidAt'),
      ('Receivable', 'notes'),
      ('Receivable', 'createdAt'),
      ('Receivable', 'updatedAt'),
      -- ReceivablePayment
      ('ReceivablePayment', 'id'),
      ('ReceivablePayment', 'receivableId'),
      ('ReceivablePayment', 'amountUsd'),
      ('ReceivablePayment', 'amountBs'),
      ('ReceivablePayment', 'exchangeRate'),
      ('ReceivablePayment', 'methodId'),
      ('ReceivablePayment', 'reference'),
      ('ReceivablePayment', 'cashSessionId'),
      ('ReceivablePayment', 'notes'),
      ('ReceivablePayment', 'createdById'),
      ('ReceivablePayment', 'createdAt'),
      -- Payable
      ('Payable', 'id'),
      ('Payable', 'supplierId'),
      ('Payable', 'purchaseOrderId'),
      ('Payable', 'amountUsd'),
      ('Payable', 'amountBs'),
      ('Payable', 'exchangeRate'),
      ('Payable', 'retentionUsd'),
      ('Payable', 'retentionBs'),
      ('Payable', 'netPayableUsd'),
      ('Payable', 'netPayableBs'),
      ('Payable', 'dueDate'),
      ('Payable', 'status'),
      ('Payable', 'paidAmountUsd'),
      ('Payable', 'paidAmountBs'),
      ('Payable', 'paidAt'),
      ('Payable', 'notes'),
      ('Payable', 'createdAt'),
      ('Payable', 'updatedAt'),
      -- PayablePayment
      ('PayablePayment', 'id'),
      ('PayablePayment', 'payableId'),
      ('PayablePayment', 'amountUsd'),
      ('PayablePayment', 'amountBs'),
      ('PayablePayment', 'exchangeRate'),
      ('PayablePayment', 'methodId'),
      ('PayablePayment', 'reference'),
      ('PayablePayment', 'notes'),
      ('PayablePayment', 'createdById'),
      ('PayablePayment', 'createdAt'),
      -- Receipt
      ('Receipt', 'id'),
      ('Receipt', 'number'),
      ('Receipt', 'type'),
      ('Receipt', 'customerId'),
      ('Receipt', 'supplierId'),
      ('Receipt', 'status'),
      ('Receipt', 'totalUsd'),
      ('Receipt', 'totalBsHistoric'),
      ('Receipt', 'totalBsToday'),
      ('Receipt', 'exchangeRate'),
      ('Receipt', 'differentialBs'),
      ('Receipt', 'hasDifferential'),
      ('Receipt', 'notes'),
      ('Receipt', 'cashSessionId'),
      ('Receipt', 'createdById'),
      ('Receipt', 'createdAt'),
      ('Receipt', 'updatedAt'),
      -- ReceiptItem
      ('ReceiptItem', 'id'),
      ('ReceiptItem', 'receiptId'),
      ('ReceiptItem', 'itemType'),
      ('ReceiptItem', 'receivableId'),
      ('ReceiptItem', 'payableId'),
      ('ReceiptItem', 'creditDebitNoteId'),
      ('ReceiptItem', 'description'),
      ('ReceiptItem', 'amountUsd'),
      ('ReceiptItem', 'amountBsHistoric'),
      ('ReceiptItem', 'amountBsToday'),
      ('ReceiptItem', 'differentialBs'),
      ('ReceiptItem', 'sign'),
      -- ReceiptPayment
      ('ReceiptPayment', 'id'),
      ('ReceiptPayment', 'receiptId'),
      ('ReceiptPayment', 'methodId'),
      ('ReceiptPayment', 'amountUsd'),
      ('ReceiptPayment', 'amountBs'),
      ('ReceiptPayment', 'exchangeRate'),
      ('ReceiptPayment', 'reference'),
      ('ReceiptPayment', 'createdAt'),
      -- PriceAdjustmentLog
      ('PriceAdjustmentLog', 'id'),
      ('PriceAdjustmentLog', 'filters'),
      ('PriceAdjustmentLog', 'adjustmentType'),
      ('PriceAdjustmentLog', 'gananciaPct'),
      ('PriceAdjustmentLog', 'gananciaMayorPct'),
      ('PriceAdjustmentLog', 'productsAffected'),
      ('PriceAdjustmentLog', 'createdById'),
      ('PriceAdjustmentLog', 'createdAt'),
      -- PrintJob
      ('PrintJob', 'id'),
      ('PrintJob', 'invoiceId'),
      ('PrintJob', 'printAreaId'),
      ('PrintJob', 'status'),
      ('PrintJob', 'items'),
      ('PrintJob', 'createdAt'),
      -- Quotation
      ('Quotation', 'id'),
      ('Quotation', 'number'),
      ('Quotation', 'customerId'),
      ('Quotation', 'status'),
      ('Quotation', 'subtotalUsd'),
      ('Quotation', 'subtotalBs'),
      ('Quotation', 'ivaUsd'),
      ('Quotation', 'ivaBs'),
      ('Quotation', 'totalUsd'),
      ('Quotation', 'totalBs'),
      ('Quotation', 'exchangeRate'),
      ('Quotation', 'notes'),
      ('Quotation', 'expiresAt'),
      ('Quotation', 'convertedToInvoiceId'),
      ('Quotation', 'createdById'),
      ('Quotation', 'createdAt'),
      ('Quotation', 'updatedAt'),
      -- QuotationItem
      ('QuotationItem', 'id'),
      ('QuotationItem', 'quotationId'),
      ('QuotationItem', 'productId'),
      ('QuotationItem', 'productName'),
      ('QuotationItem', 'productCode'),
      ('QuotationItem', 'quantity'),
      ('QuotationItem', 'unitPriceUsd'),
      ('QuotationItem', 'unitPriceBs'),
      ('QuotationItem', 'ivaType'),
      ('QuotationItem', 'ivaAmount'),
      ('QuotationItem', 'ivaAmountBs'),
      ('QuotationItem', 'totalUsd'),
      ('QuotationItem', 'totalBs'),
      -- CreditDebitNote
      ('CreditDebitNote', 'id'),
      ('CreditDebitNote', 'number'),
      ('CreditDebitNote', 'type'),
      ('CreditDebitNote', 'origin'),
      ('CreditDebitNote', 'status'),
      ('CreditDebitNote', 'invoiceId'),
      ('CreditDebitNote', 'cashRegisterId'),
      ('CreditDebitNote', 'fiscalNumber'),
      ('CreditDebitNote', 'machineSerial'),
      ('CreditDebitNote', 'fiscalPrinted'),
      ('CreditDebitNote', 'purchaseOrderId'),
      ('CreditDebitNote', 'subtotalUsd'),
      ('CreditDebitNote', 'ivaUsd'),
      ('CreditDebitNote', 'igtfUsd'),
      ('CreditDebitNote', 'igtfBs'),
      ('CreditDebitNote', 'totalUsd'),
      ('CreditDebitNote', 'subtotalBs'),
      ('CreditDebitNote', 'ivaBs'),
      ('CreditDebitNote', 'totalBs'),
      ('CreditDebitNote', 'exchangeRate'),
      ('CreditDebitNote', 'manualAmountUsd'),
      ('CreditDebitNote', 'manualPct'),
      ('CreditDebitNote', 'notes'),
      ('CreditDebitNote', 'paidAmountUsd'),
      ('CreditDebitNote', 'appliedAt'),
      ('CreditDebitNote', 'createdById'),
      ('CreditDebitNote', 'createdAt'),
      ('CreditDebitNote', 'updatedAt'),
      -- CreditDebitNoteItem
      ('CreditDebitNoteItem', 'id'),
      ('CreditDebitNoteItem', 'noteId'),
      ('CreditDebitNoteItem', 'productId'),
      ('CreditDebitNoteItem', 'productName'),
      ('CreditDebitNoteItem', 'productCode'),
      ('CreditDebitNoteItem', 'quantity'),
      ('CreditDebitNoteItem', 'unitPriceUsd'),
      ('CreditDebitNoteItem', 'unitPriceBs'),
      ('CreditDebitNoteItem', 'ivaType'),
      ('CreditDebitNoteItem', 'ivaAmount'),
      ('CreditDebitNoteItem', 'ivaAmountBs'),
      ('CreditDebitNoteItem', 'totalUsd'),
      ('CreditDebitNoteItem', 'totalBs'),
      -- PaymentSchedule
      ('PaymentSchedule', 'id'),
      ('PaymentSchedule', 'number'),
      ('PaymentSchedule', 'title'),
      ('PaymentSchedule', 'status'),
      ('PaymentSchedule', 'budgetUsd'),
      ('PaymentSchedule', 'budgetBs'),
      ('PaymentSchedule', 'budgetCurrency'),
      ('PaymentSchedule', 'totalUsd'),
      ('PaymentSchedule', 'totalBs'),
      ('PaymentSchedule', 'exchangeRate'),
      ('PaymentSchedule', 'notes'),
      ('PaymentSchedule', 'createdById'),
      ('PaymentSchedule', 'createdAt'),
      ('PaymentSchedule', 'updatedAt'),
      -- PaymentScheduleItem
      ('PaymentScheduleItem', 'id'),
      ('PaymentScheduleItem', 'scheduleId'),
      ('PaymentScheduleItem', 'payableId'),
      ('PaymentScheduleItem', 'creditDebitNoteId'),
      ('PaymentScheduleItem', 'supplierName'),
      ('PaymentScheduleItem', 'description'),
      ('PaymentScheduleItem', 'totalAmountUsd'),
      ('PaymentScheduleItem', 'totalAmountBs'),
      ('PaymentScheduleItem', 'plannedAmountUsd'),
      ('PaymentScheduleItem', 'plannedAmountBs'),
      ('PaymentScheduleItem', 'isPaid'),
      ('PaymentScheduleItem', 'createdAt'),
      -- ExpenseCategory
      ('ExpenseCategory', 'id'),
      ('ExpenseCategory', 'name'),
      ('ExpenseCategory', 'description'),
      ('ExpenseCategory', 'isActive'),
      ('ExpenseCategory', 'isDefault'),
      ('ExpenseCategory', 'createdAt'),
      ('ExpenseCategory', 'updatedAt'),
      -- Expense
      ('Expense', 'id'),
      ('Expense', 'categoryId'),
      ('Expense', 'description'),
      ('Expense', 'reference'),
      ('Expense', 'amountUsd'),
      ('Expense', 'amountBs'),
      ('Expense', 'exchangeRate'),
      ('Expense', 'date'),
      ('Expense', 'notes'),
      ('Expense', 'createdById'),
      ('Expense', 'createdAt'),
      ('Expense', 'updatedAt')
    )
    SELECT ec.table_name, ec.column_name
    FROM expected_columns ec
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns ic
      WHERE ic.table_schema = 'public'
        AND ic.table_name = ec.table_name
        AND ic.column_name = ec.column_name
    )
  ) LOOP
    INSERT INTO _audit_results (msg)
      VALUES ('MISSING COLUMN: ' || _rec.table_name || '.' || _rec.column_name);
  END LOOP;
END $$;

-- =============================================================================
-- 4. FINAL REPORT
-- =============================================================================
DO $$
DECLARE
  _count INT;
  _rec RECORD;
BEGIN
  SELECT COUNT(*) INTO _count FROM _audit_results;

  IF _count = 0 THEN
    RAISE NOTICE 'Schema OK';
  ELSE
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SCHEMA AUDIT: % issue(s) found', _count;
    RAISE NOTICE '========================================';
    FOR _rec IN SELECT msg FROM _audit_results ORDER BY msg LOOP
      RAISE NOTICE '%', _rec.msg;
    END LOOP;
  END IF;
END $$;

-- Cleanup
DROP TABLE IF EXISTS _audit_results;
