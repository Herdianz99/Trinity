-- Verificacion del trigger de bitacora de precios (Sesion 162). Corre dentro de una transaccion y la deshace.
-- Uso local: docker exec -i trinity-postgres-1 psql -U trebol -d grande_db -v ON_ERROR_STOP=1 < apps/api/_price-log.test.sql
BEGIN;
CREATE TEMP TABLE t AS SELECT id FROM "Product" WHERE NOT "isService" ORDER BY code LIMIT 3;
CREATE TEMP TABLE u AS SELECT id FROM "User" LIMIT 1;
DO $$
DECLARE p1 TEXT; p2 TEXT; uid TEXT; n INT; r RECORD;
BEGIN
  SELECT id INTO p1 FROM t ORDER BY id LIMIT 1;
  SELECT id INTO p2 FROM t ORDER BY id OFFSET 1 LIMIT 1;
  SELECT id INTO uid FROM u;

  -- 1) cambio sellado -> fila con usuario/origen/documento
  UPDATE "Product" SET "priceDetal" = "priceDetal" + 1, "auditToken" = 'tok-1', "auditUserId" = uid,
    "auditSource" = 'PURCHASE', "auditRef" = 'FC-TEST' WHERE id = p1;
  SELECT * INTO r FROM "ProductPriceLog" WHERE "productId" = p1 ORDER BY "createdAt" DESC LIMIT 1;
  IF r.source <> 'PURCHASE' OR r."userId" IS DISTINCT FROM uid OR r.reference <> 'FC-TEST' OR r."batchId" <> 'tok-1'
     OR r."newPriceDetal" - r."oldPriceDetal" <> 1 THEN RAISE EXCEPTION 'caso 1 fallo: %', r; END IF;
  RAISE NOTICE 'OK 1 sellado';

  -- 2) cambio sin sello nuevo -> DIRECT_DB sin usuario (no hereda el sello anterior)
  UPDATE "Product" SET "priceDetal" = "priceDetal" + 1 WHERE id = p1;
  SELECT * INTO r FROM "ProductPriceLog" WHERE "productId" = p1 ORDER BY "createdAt" DESC, id LIMIT 1;
  SELECT count(*) INTO n FROM "ProductPriceLog" WHERE "productId" = p1 AND source = 'DIRECT_DB' AND "userId" IS NULL AND reference IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'caso 2 fallo: % filas DIRECT_DB', n; END IF;
  RAISE NOTICE 'OK 2 directo en BD';

  -- 3) cambio de un campo no vigilado -> sin fila
  SELECT count(*) INTO n FROM "ProductPriceLog" WHERE "productId" = p2;
  UPDATE "Product" SET "name" = "name" || ' ' WHERE id = p2;
  IF (SELECT count(*) FROM "ProductPriceLog" WHERE "productId" = p2) <> n THEN RAISE EXCEPTION 'caso 3 fallo'; END IF;
  RAISE NOTICE 'OK 3 campo no vigilado';

  -- 4) ruido de float -> sin fila
  UPDATE "Product" SET "costUsd" = "costUsd" + 0.000000001 WHERE id = p2;
  IF (SELECT count(*) FROM "ProductPriceLog" WHERE "productId" = p2) <> n THEN RAISE EXCEPTION 'caso 4 fallo'; END IF;
  RAISE NOTICE 'OK 4 ruido de float';

  -- 5) lote: mismo token en 3 productos -> 3 filas con el mismo batchId
  UPDATE "Product" SET "gananciaPct" = "gananciaPct" + 5, "auditToken" = 'lote-1', "auditUserId" = uid,
    "auditSource" = 'PRICE_ADJUSTMENT' WHERE id IN (SELECT id FROM t);
  SELECT count(*) INTO n FROM "ProductPriceLog" WHERE "batchId" = 'lote-1' AND source = 'PRICE_ADJUSTMENT';
  IF n <> 3 THEN RAISE EXCEPTION 'caso 5 fallo: %', n; END IF;
  RAISE NOTICE 'OK 5 lote';

  -- 6) usuario inexistente -> fila sin usuario, el update no falla
  UPDATE "Product" SET "costUsd" = "costUsd" + 1, "auditToken" = 'tok-6', "auditUserId" = 'no-existe' WHERE id = p2;
  IF NOT EXISTS (SELECT 1 FROM "ProductPriceLog" WHERE "batchId" = 'tok-6' AND "userId" IS NULL) THEN RAISE EXCEPTION 'caso 6 fallo'; END IF;
  RAISE NOTICE 'OK 6 usuario inexistente';

  -- 7) Bs con la tasa vigente
  SELECT * INTO r FROM "ProductPriceLog" WHERE "batchId" = 'tok-6';
  IF r."exchangeRate" > 0 AND abs(r."newCostBs" - round((r."newCostUsd" * r."exchangeRate")::numeric, 2)) > 0.01 THEN
    RAISE EXCEPTION 'caso 7 fallo: %', r; END IF;
  RAISE NOTICE 'OK 7 montos en Bs (tasa %)', r."exchangeRate";
END $$;
ROLLBACK;
