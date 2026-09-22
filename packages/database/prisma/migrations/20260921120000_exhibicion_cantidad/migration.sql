-- Cantidad exhibida + retiro automático (aditivo, idempotente)

-- Cantidad de unidades en vitrina por producto
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "exhibitedQuantity" INTEGER NOT NULL DEFAULT 0;

-- Cantidad e indicador de automático en la bitácora
ALTER TABLE "ExhibitionEntry" ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ExhibitionEntry" ADD COLUMN IF NOT EXISTS "isAutomatic" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: los productos ya exhibidos (modelo binario previo) pasan a 1 unidad
UPDATE "Product" SET "exhibitedQuantity" = 1 WHERE "isExhibited" = true AND "exhibitedQuantity" = 0;
