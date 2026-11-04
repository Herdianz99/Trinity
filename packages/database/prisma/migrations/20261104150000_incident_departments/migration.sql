-- Departamentos de incidencias (Session 179). Cada incidencia y cada tipo pertenecen a un
-- departamento; lo existente queda en "Seguridad" (miembros: rol SEGURIDAD). Idempotente.

CREATE TABLE IF NOT EXISTS "IncidentDepartment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "viewerDepartmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IncidentDepartment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "IncidentDepartment_name_key" ON "IncidentDepartment"("name");

-- Departamento inicial: Seguridad (dueño de todo lo existente)
INSERT INTO "IncidentDepartment" ("id", "name", "roles", "updatedAt")
VALUES ('incdept_seguridad', 'Seguridad', ARRAY['SEGURIDAD']::TEXT[], CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "incidentDepartmentId" TEXT;
ALTER TABLE "IncidentType" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;
ALTER TABLE "Incident" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;

UPDATE "IncidentType" SET "departmentId" = (SELECT "id" FROM "IncidentDepartment" WHERE "name" = 'Seguridad') WHERE "departmentId" IS NULL;
UPDATE "Incident" SET "departmentId" = (SELECT "id" FROM "IncidentDepartment" WHERE "name" = 'Seguridad') WHERE "departmentId" IS NULL;

ALTER TABLE "IncidentType" ALTER COLUMN "departmentId" SET NOT NULL;
ALTER TABLE "Incident" ALTER COLUMN "departmentId" SET NOT NULL;

-- El nombre del tipo pasa a ser unico POR departamento
DROP INDEX IF EXISTS "IncidentType_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "IncidentType_departmentId_name_key" ON "IncidentType"("departmentId", "name");
CREATE INDEX IF NOT EXISTS "Incident_departmentId_idx" ON "Incident"("departmentId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_incidentDepartmentId_fkey') THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_incidentDepartmentId_fkey" FOREIGN KEY ("incidentDepartmentId") REFERENCES "IncidentDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IncidentType_departmentId_fkey') THEN
    ALTER TABLE "IncidentType" ADD CONSTRAINT "IncidentType_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "IncidentDepartment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Incident_departmentId_fkey') THEN
    ALTER TABLE "Incident" ADD CONSTRAINT "Incident_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "IncidentDepartment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
