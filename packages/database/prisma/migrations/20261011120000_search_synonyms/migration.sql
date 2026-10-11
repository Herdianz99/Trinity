-- Sinonimos de busqueda de productos (Fase 1 del chatbot). Aditivo e idempotente.
-- Cada regla activa agrega palabras ("cabilla, 3/8") al indice de los productos cuyo NOMBRE
-- contiene sus matchTerms ("barra resalte") dentro de sus categorias (vacio = todas).
-- Las busquedas no cambian: siguen usando "searchVector" @@ to_tsquery(...).

CREATE TABLE IF NOT EXISTS "SearchSynonym" (
  "id"          TEXT NOT NULL,
  "terms"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "matchTerms"  TEXT NOT NULL,
  "categoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isActive"    BOOLEAN NOT NULL DEFAULT false,
  "notes"       TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchSynonym_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SearchSynonym_isActive_idx" ON "SearchSynonym"("isActive");
DO $$ BEGIN
  ALTER TABLE "SearchSynonym" ADD CONSTRAINT "SearchSynonym_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "searchKeywords" TEXT NOT NULL DEFAULT '';

CREATE EXTENSION IF NOT EXISTS unaccent;

-- Normaliza texto para el indice: sin acentos, minusculas, separadores -> espacio.
-- Cada fraccion N/M se conserva como "N M NfM": "3/8" sigue encontrandose con "3 8" (como antes)
-- y ademas con el token exacto "3f8" que arma productSearchTsQuery al escribir "3/8".
CREATE OR REPLACE FUNCTION product_search_normalize(input TEXT)
RETURNS TEXT AS $$
  SELECT regexp_replace(
    regexp_replace(unaccent(lower(COALESCE(input, ''))), '([0-9]+)/([0-9]+)', '\1 \2 \1f\2', 'g'),
    '[^a-z0-9 ]+', ' ', 'g'
  );
$$ LANGUAGE sql STABLE;

-- Palabras clave de un producto segun las reglas ACTIVAS (separadas por ", ").
-- matchTerms se compara como palabras EXACTAS (config 'simple': sin raices ni prefijos): "pego" no toca "pega", "12mm" no toca "120mm".
CREATE OR REPLACE FUNCTION product_synonym_keywords(p_name TEXT, p_category_id TEXT)
RETURNS TEXT AS $$
  WITH v AS MATERIALIZED (SELECT to_tsvector('simple', product_search_normalize(p_name)) AS v)
  SELECT COALESCE(string_agg(array_to_string(s."terms", ', '), ', ' ORDER BY s."createdAt", s."id"), '')
  FROM "SearchSynonym" s, v
  WHERE s."isActive"
    AND (cardinality(s."categoryIds") = 0 OR p_category_id = ANY(s."categoryIds"))
    AND numnode(plainto_tsquery('simple', product_search_normalize(s."matchTerms"))) > 0
    AND v.v @@ plainto_tsquery('simple', product_search_normalize(s."matchTerms"));
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  -- Las palabras clave solo dependen del nombre y la categoria: un cambio de precio/stock no las recalcula.
  -- Al cambiar las reglas, el API hace UPDATE de "searchKeywords" y aqui solo se rearma el vector.
  IF TG_OP = 'INSERT'
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW."categoryId" IS DISTINCT FROM OLD."categoryId" THEN
    NEW."searchKeywords" := product_synonym_keywords(NEW.name, NEW."categoryId");
  END IF;
  NEW."searchVector" := to_tsvector('spanish', product_search_normalize(
    COALESCE(NEW.name, '') || ' ' ||
    COALESCE(NEW.code, '') || ' ' ||
    COALESCE(NEW.barcode, '') || ' ' ||
    COALESCE(NEW."supplierRef", '') || ' ' ||
    COALESCE(NEW."otherCode", '') || ' ' ||
    COALESCE(NEW."searchKeywords", '')
  ));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- El trigger product_search_vector_trigger ya existe y llama a la funcion por nombre.
-- Backfill con la normalizacion nueva (fracciones) — la tabla de reglas esta vacia o igual que antes.
UPDATE "Product" SET "searchKeywords" = product_synonym_keywords(name, "categoryId");
