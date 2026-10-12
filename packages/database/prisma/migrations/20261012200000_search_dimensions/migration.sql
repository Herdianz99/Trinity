-- Buscador: medidas "2x1" / "2 x 1" / "2 X 1" son lo mismo. El indice guarda "2 1 2x1" (como ya hace con las
-- fracciones "3/8" -> "3 8 3f8"); el API convierte lo que escribe el cliente a "2x1" (token exacto).
-- Antes: "TUBO RECT 2 X 1" quedaba como "2","x","1" y "BREAKER 2X20" como "2x20": cada forma solo encontraba la suya.
CREATE OR REPLACE FUNCTION product_search_normalize(input TEXT)
RETURNS TEXT AS $$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(unaccent(lower(COALESCE(input, ''))), '([0-9]+)/([0-9]+)', '\1 \2 \1f\2', 'g'),
      '\m([0-9]+) *x *([0-9]+)\M', '\1 \2 \1x\2', 'g'
    ),
    '[^a-z0-9 ]+', ' ', 'g'
  );
$$ LANGUAGE sql STABLE;

-- Reindexar: el trigger rearma el searchVector con la normalizacion nueva.
UPDATE "Product" SET "searchKeywords" = product_synonym_keywords(name, "categoryId");
