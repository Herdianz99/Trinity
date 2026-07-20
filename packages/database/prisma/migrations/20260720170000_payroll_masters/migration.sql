-- Convierte departamento/cargo de nómina en tablas maestras y agrega bonificación al empleado.
-- Aditivo e idempotente. Backfillea los valores de texto existentes a los maestros.

-- 1. Maestros
CREATE TABLE IF NOT EXISTS "Department" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "Department_name_key" ON "Department"("name");

CREATE TABLE IF NOT EXISTS "Position" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL,
  "defaultSalaryUsd" DOUBLE PRECISION NOT NULL DEFAULT 0, "defaultBonusUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Position_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "Position_name_key" ON "Position"("name");

-- 2. Nuevas columnas del empleado
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "positionId" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bonusUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- 3. Backfill: sembrar los maestros desde los valores de texto existentes y enlazar los FKs.
--    Guardado por la existencia de las columnas viejas para ser idempotente entre corridas.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Employee' AND column_name = 'department') THEN
    INSERT INTO "Department" ("id", "name", "updatedAt")
      SELECT gen_random_uuid()::text, TRIM("department"), CURRENT_TIMESTAMP
      FROM "Employee"
      WHERE "department" IS NOT NULL AND TRIM("department") <> ''
      GROUP BY TRIM("department")
    ON CONFLICT ("name") DO NOTHING;
    UPDATE "Employee" e SET "departmentId" = d."id"
      FROM "Department" d WHERE d."name" = TRIM(e."department") AND e."departmentId" IS NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Employee' AND column_name = 'cargo') THEN
    INSERT INTO "Position" ("id", "name", "updatedAt")
      SELECT gen_random_uuid()::text, TRIM("cargo"), CURRENT_TIMESTAMP
      FROM "Employee"
      WHERE "cargo" IS NOT NULL AND TRIM("cargo") <> ''
      GROUP BY TRIM("cargo")
    ON CONFLICT ("name") DO NOTHING;
    UPDATE "Employee" e SET "positionId" = p."id"
      FROM "Position" p WHERE p."name" = TRIM(e."cargo") AND e."positionId" IS NULL;
  END IF;
END $$;

-- 4. Llaves foráneas
DO $$ BEGIN ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Employee" ADD CONSTRAINT "Employee_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Dropear las columnas de texto viejas (ya migradas a los maestros)
ALTER TABLE "Employee" DROP COLUMN IF EXISTS "department";
ALTER TABLE "Employee" DROP COLUMN IF EXISTS "cargo";
