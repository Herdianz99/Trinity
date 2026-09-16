-- Nuevo motivo de devolucion de ventas (NCV): cambio de nota a fiscal. Aditiva.
ALTER TYPE "SalesReturnReason" ADD VALUE IF NOT EXISTS 'CAMBIO_NOTA_A_FISCAL';
