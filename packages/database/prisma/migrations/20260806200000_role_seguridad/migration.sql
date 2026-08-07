-- Nuevo rol SEGURIDAD (por defecto solo el modulo de incidencias). Aditivo e idempotente.
-- ALTER TYPE ... ADD VALUE IF NOT EXISTS es valido en PostgreSQL 12+ (ambos servers son 15/16).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SEGURIDAD';
