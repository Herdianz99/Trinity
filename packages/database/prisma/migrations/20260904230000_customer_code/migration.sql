-- Codigo de cliente correlativo CLI-000001 (6 digitos; la grande supera 50.000 clientes)
-- Aditiva e idempotente. El backfill numera a los clientes EXISTENTES por dia-calendario
-- de creacion (Caracas) y, dentro del mismo dia, alfabeticamente por nombre.

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "lastCustomerNumber" INTEGER NOT NULL DEFAULT 0;

-- Backfill: solo clientes sin codigo. createdAt se guarda en UTC -> convertir a fecha-Caracas
-- ((ts AT TIME ZONE 'UTC') AT TIME ZONE 'America/Caracas')::date. Orden: dia asc, nombre asc, id asc (desempate estable).
WITH ordered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      ORDER BY
        (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Caracas')::date ASC,
        LOWER("name") ASC,
        "id" ASC
    ) AS rn
  FROM "Customer"
  WHERE "code" IS NULL
)
UPDATE "Customer" c
SET "code" = 'CLI-' || LPAD(o.rn::text, 6, '0')
FROM ordered o
WHERE c."id" = o."id";

-- Contador = mayor numero ya asignado (robusto ante huecos). Asi los nuevos clientes continuan la serie.
UPDATE "CompanyConfig"
SET "lastCustomerNumber" = (
  SELECT COALESCE(MAX(CAST(SUBSTRING("code" FROM 5) AS INTEGER)), 0)
  FROM "Customer"
  WHERE "code" ~ '^CLI-[0-9]+$'
);

CREATE UNIQUE INDEX IF NOT EXISTS "Customer_code_key" ON "Customer"("code");
