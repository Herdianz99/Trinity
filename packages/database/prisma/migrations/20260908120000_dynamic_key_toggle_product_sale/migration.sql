-- Nuevo permiso de clave dinamica: activar/bloquear producto para la venta (idempotente)
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'TOGGLE_PRODUCT_SALE';
