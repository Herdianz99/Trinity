-- Modulos extra por usuario (ademas de los de su rol). Aditiva.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "extraModules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
