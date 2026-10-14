-- Bitacora de costos y precios (Sesion 162). Spec: docs/superpowers/specs/2026-10-14-bitacora-precios-design.md
-- Un trigger en "Product" registra en "ProductPriceLog" cada cambio de costo/precio/% de ganancia/precio manual.
-- La atribucion (usuario, origen, documento) viaja en las columnas "audit*" del propio producto: la API las
-- llena con un auditToken nuevo en cada update. Si el token no cambio, nadie sello el cambio => DIRECT_DB.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "auditToken" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "auditUserId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "auditSource" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "auditRef" TEXT;

CREATE TABLE IF NOT EXISTS "ProductPriceLog" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "productId" TEXT NOT NULL,
  "userId" TEXT,
  "source" TEXT NOT NULL,
  "reference" TEXT,
  "batchId" TEXT,
  "oldCostUsd" DOUBLE PRECISION,
  "newCostUsd" DOUBLE PRECISION,
  "oldPriceDetal" DOUBLE PRECISION,
  "newPriceDetal" DOUBLE PRECISION,
  "oldPriceMayor" DOUBLE PRECISION,
  "newPriceMayor" DOUBLE PRECISION,
  "oldGananciaPct" DOUBLE PRECISION,
  "newGananciaPct" DOUBLE PRECISION,
  "oldGananciaMayorPct" DOUBLE PRECISION,
  "newGananciaMayorPct" DOUBLE PRECISION,
  "oldManualPrice" BOOLEAN,
  "newManualPrice" BOOLEAN,
  "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "newCostBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "newPriceDetalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "newPriceMayorBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductPriceLog_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductPriceLog_productId_fkey') THEN
    ALTER TABLE "ProductPriceLog" ADD CONSTRAINT "ProductPriceLog_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductPriceLog_userId_fkey') THEN
    ALTER TABLE "ProductPriceLog" ADD CONSTRAINT "ProductPriceLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ProductPriceLog_productId_createdAt_idx" ON "ProductPriceLog"("productId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProductPriceLog_createdAt_idx" ON "ProductPriceLog"("createdAt");
CREATE INDEX IF NOT EXISTS "ProductPriceLog_batchId_idx" ON "ProductPriceLog"("batchId");

CREATE OR REPLACE FUNCTION product_price_log_fn() RETURNS trigger AS $$
DECLARE
  stamped BOOLEAN;
  v_source TEXT;
  v_user TEXT;
  v_rate DOUBLE PRECISION;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Solo campos vigilados; diferencias de redondeo (ruido de float) no cuentan.
    IF round(COALESCE(NEW."costUsd", 0)::numeric, 4) = round(COALESCE(OLD."costUsd", 0)::numeric, 4)
       AND round(COALESCE(NEW."priceDetal", 0)::numeric, 4) = round(COALESCE(OLD."priceDetal", 0)::numeric, 4)
       AND round(COALESCE(NEW."priceMayor", 0)::numeric, 4) = round(COALESCE(OLD."priceMayor", 0)::numeric, 4)
       AND round(COALESCE(NEW."gananciaPct", 0)::numeric, 4) = round(COALESCE(OLD."gananciaPct", 0)::numeric, 4)
       AND round(COALESCE(NEW."gananciaMayorPct", 0)::numeric, 4) = round(COALESCE(OLD."gananciaMayorPct", 0)::numeric, 4)
       AND NEW."manualPrice" IS NOT DISTINCT FROM OLD."manualPrice" THEN
      RETURN NEW;
    END IF;
    stamped := NEW."auditToken" IS DISTINCT FROM OLD."auditToken";
  ELSE
    stamped := NEW."auditToken" IS NOT NULL;
  END IF;

  IF stamped THEN
    v_source := COALESCE(NEW."auditSource", CASE WHEN TG_OP = 'INSERT' THEN 'CREATE' ELSE 'MANUAL_EDIT' END);
    v_user := NEW."auditUserId";
  ELSE
    v_source := CASE WHEN TG_OP = 'INSERT' THEN 'CREATE' ELSE 'DIRECT_DB' END;
    v_user := NULL;
  END IF;
  -- Usuario inexistente (p.ej. id de otra empresa) => sin usuario, en vez de romper el update por la FK.
  IF v_user IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = v_user) THEN
    v_user := NULL;
  END IF;

  SELECT "rate" INTO v_rate FROM "ExchangeRate"
   WHERE "date" <= (now() AT TIME ZONE 'America/Caracas')::date
   ORDER BY "date" DESC LIMIT 1;
  v_rate := COALESCE(v_rate, 0);

  INSERT INTO "ProductPriceLog" (
    "productId", "userId", "source", "reference", "batchId",
    "oldCostUsd", "newCostUsd", "oldPriceDetal", "newPriceDetal", "oldPriceMayor", "newPriceMayor",
    "oldGananciaPct", "newGananciaPct", "oldGananciaMayorPct", "newGananciaMayorPct",
    "oldManualPrice", "newManualPrice",
    "exchangeRate", "newCostBs", "newPriceDetalBs", "newPriceMayorBs"
  ) VALUES (
    NEW."id", v_user, v_source, CASE WHEN stamped THEN NEW."auditRef" END, CASE WHEN stamped THEN NEW."auditToken" END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD."costUsd" END, NEW."costUsd",
    CASE WHEN TG_OP = 'UPDATE' THEN OLD."priceDetal" END, NEW."priceDetal",
    CASE WHEN TG_OP = 'UPDATE' THEN OLD."priceMayor" END, NEW."priceMayor",
    CASE WHEN TG_OP = 'UPDATE' THEN OLD."gananciaPct" END, NEW."gananciaPct",
    CASE WHEN TG_OP = 'UPDATE' THEN OLD."gananciaMayorPct" END, NEW."gananciaMayorPct",
    CASE WHEN TG_OP = 'UPDATE' THEN OLD."manualPrice" END, NEW."manualPrice",
    v_rate,
    round((COALESCE(NEW."costUsd", 0) * v_rate)::numeric, 2),
    round((COALESCE(NEW."priceDetal", 0) * v_rate)::numeric, 2),
    round((COALESCE(NEW."priceMayor", 0) * v_rate)::numeric, 2)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- AFTER (no BEFORE): la fila del producto ya existe cuando se inserta el log (FK productId en INSERT).
DROP TRIGGER IF EXISTS product_price_log_trg ON "Product";
CREATE TRIGGER product_price_log_trg
  AFTER INSERT OR UPDATE ON "Product"
  FOR EACH ROW EXECUTE FUNCTION product_price_log_fn();

-- Permiso nuevo: SUPERVISOR lo trae de entrada (ADMIN tiene '*').
UPDATE "RolePermission" SET modules = array_append(modules, 'bitacora-precios')
WHERE role = 'SUPERVISOR' AND NOT ('bitacora-precios' = ANY(modules)) AND NOT ('*' = ANY(modules));
