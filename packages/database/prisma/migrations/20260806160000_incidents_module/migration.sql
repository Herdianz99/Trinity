-- Modulo de INCIDENCIAS (seguridad). Aditivo e idempotente.

CREATE TABLE IF NOT EXISTS "IncidentType" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncidentType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "IncidentType_name_key" ON "IncidentType"("name");

CREATE TABLE IF NOT EXISTS "Incident" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "typeId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "involvedName" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Incident_number_key" ON "Incident"("number");
CREATE INDEX IF NOT EXISTS "Incident_typeId_idx" ON "Incident"("typeId");
CREATE INDEX IF NOT EXISTS "Incident_occurredAt_idx" ON "Incident"("occurredAt");

DO $$ BEGIN
  ALTER TABLE "Incident" ADD CONSTRAINT "Incident_typeId_fkey"
    FOREIGN KEY ("typeId") REFERENCES "IncidentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Incident" ADD CONSTRAINT "Incident_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tipos de incidencia por defecto (idempotente por nombre).
INSERT INTO "IncidentType" ("id","name","isActive","createdAt","updatedAt") VALUES
  ('inctype_empleado','Empleado',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('inctype_robo','Robo/Hurto',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('inctype_cliente','Cliente',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('inctype_proveedor','Proveedor',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('inctype_accidente','Accidente',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('inctype_dano','Daño a propiedad',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('inctype_otro','Otro',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Habilitar el modulo 'incidents' a los roles ADMIN y SUPERVISOR existentes (idempotente).
UPDATE "RolePermission" SET modules = array_append(modules,'incidents')
WHERE role IN ('ADMIN','SUPERVISOR') AND NOT ('incidents' = ANY(modules));
