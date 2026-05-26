-- Script to clean ALL test/transactional data
-- Keeps: CompanyConfig, Users, CashRegisters, Warehouses, Categories, Brands, Suppliers, Products, PaymentMethods, PrintAreas

BEGIN;

-- Audit & logs
DELETE FROM "DynamicKeyLog";
DELETE FROM "PriceAdjustmentLog";
DELETE FROM "PurchaseOrderLog";
DELETE FROM "ProductCostHistory";

-- Receipt payments & items
DELETE FROM "ReceiptPayment";
DELETE FROM "ReceiptItem";
DELETE FROM "Receipt";

-- Receivables
DELETE FROM "ReceivablePayment";
DELETE FROM "Receivable";

-- Payables & scheduling
DELETE FROM "PaymentScheduleItem";
DELETE FROM "PaymentSchedule";
DELETE FROM "PayablePayment";
DELETE FROM "Payable";

-- Purchase book & retentions
DELETE FROM "PurchaseBookEntry";
DELETE FROM "RetentionVoucher";
DELETE FROM "IvaRetention";

-- Credit/Debit notes
DELETE FROM "CreditDebitNoteItem";
DELETE FROM "CreditDebitNote";

-- Invoices
DELETE FROM "PrintJob";
DELETE FROM "Payment";
DELETE FROM "InvoiceItem";
DELETE FROM "Invoice";

-- Quotations
DELETE FROM "QuotationItem";
DELETE FROM "Quotation";

-- Cash sessions & movements
DELETE FROM "CashMovement";
DELETE FROM "Expense";
DELETE FROM "CashSession";

-- Purchase orders
DELETE FROM "PurchaseOrderItem";
DELETE FROM "PurchaseOrder";

-- Inventory movements & stock
DELETE FROM "StockMovement";
DELETE FROM "Stock";

-- Transfers & counts
DELETE FROM "TransferItem";
DELETE FROM "Transfer";
DELETE FROM "InventoryCountItem";
DELETE FROM "InventoryCount";
DELETE FROM "SupplierProduct";

-- Reset correlatives
UPDATE "CashRegister" SET "lastInvoiceNumber" = 0;
UPDATE "CompanyConfig" SET "retentionNextNumber" = 1;

COMMIT;
