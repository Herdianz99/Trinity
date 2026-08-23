-- "Oferta": marcador visual del producto. En el POS los productos en oferta salen
-- de primeros en la busqueda y resaltados. No afecta precios. Aditiva y segura (arranca en false).
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isOnSale" BOOLEAN NOT NULL DEFAULT false;
