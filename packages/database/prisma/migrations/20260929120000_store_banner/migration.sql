-- Banners administrables de la tienda online (hero + franja de oferta)
CREATE TABLE IF NOT EXISTS "StoreBanner" (
    "id" TEXT NOT NULL,
    "placement" TEXT NOT NULL DEFAULT 'HERO',
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "tag" TEXT,
    "imageKey" TEXT,
    "linkUrl" TEXT,
    "linkLabel" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreBanner_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StoreBanner_placement_isActive_idx" ON "StoreBanner"("placement", "isActive");
