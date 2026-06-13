-- Limpieza SOLO del lado de VENTAS (datos de prueba)
-- Conserva: productos, stock (restaurado), clientes, compras, libro de compras,
--           usuarios, cajas, series (correlativos reseteados), config.
-- Borra: facturas de venta + items + pagos, retenciones IVA de cliente,
--        libro de ventas, recibos de cobro (+items/pagos), CxC, NCV/NDV,
--        movimientos de caja (reintegros) y movimientos de stock de venta.
-- Restaura el stock revirtiendo las salidas tipo SALE.

BEGIN;

-- 1. Restaurar stock: revertir salidas de venta (quantity es negativo)
UPDATE "Stock" s
SET "quantity" = s."quantity" - m.qty,
    "updatedAt" = now()
FROM (
  SELECT "productId", "warehouseId", SUM("quantity") AS qty
  FROM "StockMovement"
  WHERE type = 'SALE'
  GROUP BY "productId", "warehouseId"
) m
WHERE s."productId" = m."productId" AND s."warehouseId" = m."warehouseId";

-- 2. Recibos de cobro y sus dependencias
DELETE FROM "ReceiptItem"    WHERE "receiptId" IN (SELECT id FROM "Receipt" WHERE type = 'COLLECTION');
DELETE FROM "ReceiptPayment" WHERE "receiptId" IN (SELECT id FROM "Receipt" WHERE type = 'COLLECTION');
DELETE FROM "ReceivablePayment";                  -- pagos de CxC (lado ventas)
DELETE FROM "Receipt" WHERE type = 'COLLECTION';

-- 3. Movimientos de caja (reintegros de retencion). No hay gastos/manuales aqui.
DELETE FROM "CashMovement";

-- 4. Retenciones IVA de cliente (FK a Invoice y a SalesBookEntry)
DELETE FROM "CustomerIvaRetention";

-- 5. Libro de ventas
DELETE FROM "SalesBookEntry";

-- 6. Notas de credito/debito de VENTA (NCV/NDV)
DELETE FROM "CreditDebitNoteItem" WHERE "noteId" IN (SELECT id FROM "CreditDebitNote" WHERE type IN ('NCV','NDV'));
DELETE FROM "CreditDebitNote"     WHERE type IN ('NCV','NDV');

-- 7. Cuentas por cobrar (CxC) de ventas
DELETE FROM "Receivable";

-- 8. Facturas de venta
DELETE FROM "PrintJob";
DELETE FROM "Payment";
DELETE FROM "InvoiceItem";
DELETE FROM "Invoice";

-- 9. Movimientos de stock de venta (ya revertidos al stock)
DELETE FROM "StockMovement" WHERE type = 'SALE';

-- 10. Reset de correlativos (legacy + por tipo de documento)
UPDATE "Serie" SET "lastNumber" = 0, "lastInvoiceNumber" = 0, "lastCreditNoteNumber" = 0, "lastDebitNoteNumber" = 0, "lastReceivableNumber" = 0;
UPDATE "CompanyConfig" SET "retentionNextNumber" = 1;

COMMIT;
