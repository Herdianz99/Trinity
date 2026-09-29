-- Icono (emoji) de categoría y logo de marca para la tienda online
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "icon" TEXT;
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "logoKey" TEXT;
