-- Nomina: Amonestaciones / llamados de atencion (3 niveles por tipo de falta).
-- Aditivo e idempotente (IF NOT EXISTS + DO blocks para FKs).

CREATE TABLE IF NOT EXISTS "FaultType" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FaultType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FaultType_name_key" ON "FaultType"("name");

CREATE TABLE IF NOT EXISTS "DisciplinaryAction" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "faultTypeId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "level" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DisciplinaryAction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DisciplinaryAction_number_key" ON "DisciplinaryAction"("number");
CREATE INDEX IF NOT EXISTS "DisciplinaryAction_employeeId_faultTypeId_idx" ON "DisciplinaryAction"("employeeId", "faultTypeId");
CREATE INDEX IF NOT EXISTS "DisciplinaryAction_occurredAt_idx" ON "DisciplinaryAction"("occurredAt");

CREATE TABLE IF NOT EXISTS "DisciplinaryAttachment" (
  "id" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "thumbKey" TEXT NOT NULL,
  "mediumKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DisciplinaryAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DisciplinaryAttachment_actionId_idx" ON "DisciplinaryAttachment"("actionId");

DO $$ BEGIN
  ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_faultTypeId_fkey"
    FOREIGN KEY ("faultTypeId") REFERENCES "FaultType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DisciplinaryAttachment" ADD CONSTRAINT "DisciplinaryAttachment_actionId_fkey"
    FOREIGN KEY ("actionId") REFERENCES "DisciplinaryAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
