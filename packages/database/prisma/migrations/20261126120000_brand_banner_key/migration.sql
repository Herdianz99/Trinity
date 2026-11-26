-- Banner panoramico por marca para /marcas/[slug] en la tienda online
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "bannerKey" TEXT;
