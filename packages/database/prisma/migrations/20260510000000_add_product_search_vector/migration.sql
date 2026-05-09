-- Add search vector column to Product table
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "searchVector" tsvector;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS "Product_searchVector_idx" ON "Product" USING GIN ("searchVector");

-- Create function to update search vector
CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW."searchVector" := to_tsvector('spanish',
    COALESCE(NEW.name, '') || ' ' ||
    COALESCE(NEW.code, '') || ' ' ||
    COALESCE(NEW.barcode, '') || ' ' ||
    COALESCE(NEW."supplierRef", '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update search vector on insert/update
DROP TRIGGER IF EXISTS product_search_vector_trigger ON "Product";
CREATE TRIGGER product_search_vector_trigger
  BEFORE INSERT OR UPDATE ON "Product"
  FOR EACH ROW
  EXECUTE FUNCTION update_product_search_vector();

-- Update existing products to populate search vector
UPDATE "Product" SET "searchVector" = to_tsvector('spanish',
  COALESCE(name, '') || ' ' ||
  COALESCE(code, '') || ' ' ||
  COALESCE(barcode, '') || ' ' ||
  COALESCE("supplierRef", '')
);
