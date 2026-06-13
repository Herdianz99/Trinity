-- Claves dinamicas para eliminar CxC (Receivable) y CxP (Payable).
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'DELETE_RECEIVABLE';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'DELETE_PAYABLE';
