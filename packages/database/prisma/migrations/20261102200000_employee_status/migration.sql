-- Estados de empleado (Session 177): ademas de Activo/Inactivo -> Vacaciones, Reposo, Permiso especial,
-- Retiro voluntario, Despido justificado. "isActive" se mantiene sincronizado (= entra en nomina).
-- Aditiva e idempotente.
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "statusFrom" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "statusTo" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "statusNote" TEXT;

-- Backfill: los empleados inactivos quedan con estado INACTIVE.
UPDATE "Employee" SET "status" = 'INACTIVE' WHERE "isActive" = false AND "status" = 'ACTIVE';
