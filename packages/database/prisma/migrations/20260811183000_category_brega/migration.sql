-- Brecha propia por categoría raíz. Aditiva e idempotente. Default 0 = usar la brecha global.
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "bregaPct" DOUBLE PRECISION NOT NULL DEFAULT 0;
