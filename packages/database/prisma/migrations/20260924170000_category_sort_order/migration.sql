-- Orden manual de familias/categorías en el catálogo con fotos. Aditivo e idempotente.
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
