-- Busqueda de productos tolerante a separadores (P/, -, .), acentos y orden de palabras.
-- "ASIENTO P/POCETA" ahora indexa 'asiento' + 'poceta' (antes 'p/poceta' pegado).
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW."searchVector" := to_tsvector('spanish',
    regexp_replace(
      unaccent(lower(
        COALESCE(NEW.name, '') || ' ' ||
        COALESCE(NEW.code, '') || ' ' ||
        COALESCE(NEW.barcode, '') || ' ' ||
        COALESCE(NEW."supplierRef", '') || ' ' ||
        COALESCE(NEW."otherCode", '')
      )),
      '[^a-z0-9 ]+', ' ', 'g'
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- El trigger product_search_vector_trigger ya existe y llama a la funcion por nombre;
-- reemplazar la funcion basta. Backfill de todos los productos con el vector nuevo:
UPDATE "Product" SET "searchVector" = to_tsvector('spanish',
  regexp_replace(
    unaccent(lower(
      COALESCE(name, '') || ' ' ||
      COALESCE(code, '') || ' ' ||
      COALESCE(barcode, '') || ' ' ||
      COALESCE("supplierRef", '') || ' ' ||
      COALESCE("otherCode", '')
    )),
    '[^a-z0-9 ]+', ' ', 'g'
  )
);
