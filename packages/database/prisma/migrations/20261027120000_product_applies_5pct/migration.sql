-- "Aplica 5%" en productos (Session 171): solo marca + filtro del catalogo por ahora (aditiva e idempotente).
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "applies5Pct" BOOLEAN NOT NULL DEFAULT false;
