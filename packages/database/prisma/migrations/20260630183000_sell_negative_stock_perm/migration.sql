-- Permiso de clave dinamica para autorizar (al agregar el producto) una venta sin stock
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'SELL_NEGATIVE_STOCK';
