-- Nuevo motivo de devolucion de ventas (NCV): error de despacho. Aditiva.
ALTER TYPE "SalesReturnReason" ADD VALUE IF NOT EXISTS 'ERROR_DESPACHO';
