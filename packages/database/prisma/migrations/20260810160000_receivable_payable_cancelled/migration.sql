-- Estado CANCELLED para CxC/CxP: lo usa la ANULACIÓN de ajustes de inventario procesados
-- (revierte stock + cancela la cuenta que generó, conservando el número). Aditivo e idempotente.
-- ALTER TYPE ... ADD VALUE IF NOT EXISTS es valido en PostgreSQL 12+ (ambos servers son 15/16).
ALTER TYPE "ReceivableStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "PayableStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
