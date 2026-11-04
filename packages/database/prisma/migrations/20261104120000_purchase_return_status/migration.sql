-- Estado de devolucion de las compras (Session 179): NONE | PARTIAL | TOTAL, calculado con las
-- NCC de mercancia confirmadas (POSTED). Va aparte de "status" (PROCESSED se sigue usando para
-- retenciones y validaciones). Aditiva e idempotente.
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "returnStatus" TEXT NOT NULL DEFAULT 'NONE';

-- Backfill: por producto, cantidad comprada vs devuelta en NCC de mercancia confirmadas.
WITH bought AS (
  SELECT "purchaseOrderId", "productId", SUM("quantity") AS qty
  FROM "PurchaseOrderItem"
  GROUP BY "purchaseOrderId", "productId"
),
returned AS (
  SELECT n."purchaseOrderId", i."productId", SUM(i."quantity") AS qty
  FROM "CreditDebitNoteItem" i
  JOIN "CreditDebitNote" n ON n."id" = i."noteId"
  WHERE n."type" = 'NCC' AND n."origin" = 'MERCHANDISE' AND n."status" = 'POSTED'
    AND n."purchaseOrderId" IS NOT NULL AND i."productId" IS NOT NULL
  GROUP BY n."purchaseOrderId", i."productId"
),
agg AS (
  SELECT b."purchaseOrderId",
         BOOL_OR(COALESCE(r.qty, 0) > 0) AS any_ret,
         BOOL_AND(COALESCE(r.qty, 0) >= b.qty) AS all_ret
  FROM bought b
  LEFT JOIN returned r ON r."purchaseOrderId" = b."purchaseOrderId" AND r."productId" = b."productId"
  GROUP BY b."purchaseOrderId"
)
UPDATE "PurchaseOrder" po
SET "returnStatus" = CASE WHEN agg.all_ret THEN 'TOTAL' ELSE 'PARTIAL' END
FROM agg
WHERE agg."purchaseOrderId" = po."id" AND agg.any_ret;
