-- Redondea Stock.quantity a 2 decimales en CADA escritura (INSERT/UPDATE).
-- Motivo: la columna es DOUBLE PRECISION y el saldo se ajusta con increment/decrement
-- (Prisma) en ~14 servicios. La aritmetica en coma flotante acumula ruido
-- (ej. 947.8 -> 947.8000000000002, 0.1+0.2 -> 0.30000000000000004).
-- Un trigger BEFORE cubre TODOS los caminos de escritura (actuales, futuros y SQL manual)
-- de forma atomica, sin tocar los call-sites. El negocio maneja como maximo 2 decimales.

CREATE OR REPLACE FUNCTION trg_round_stock_quantity()
RETURNS trigger AS $$
BEGIN
  IF NEW.quantity IS NOT NULL THEN
    NEW.quantity := round(NEW.quantity::numeric, 2)::double precision;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stock_round_quantity ON "Stock";
CREATE TRIGGER stock_round_quantity
  BEFORE INSERT OR UPDATE OF quantity ON "Stock"
  FOR EACH ROW
  EXECUTE FUNCTION trg_round_stock_quantity();
