-- Totem Clover: rol TOTEM + publicidad en espera (Sesion 189). Idempotente (IF NOT EXISTS).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'TOTEM';

DO $$ BEGIN
  CREATE TYPE "TotemMediaKind" AS ENUM ('IMAGE', 'VIDEO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TotemMediaStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TotemAdType" AS ENUM ('IMAGE', 'VIDEO', 'PRODUCT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "TotemMedia" (
    "id" TEXT NOT NULL,
    "kind" "TotemMediaKind" NOT NULL,
    "status" "TotemMediaStatus" NOT NULL DEFAULT 'PROCESSING',
    "error" TEXT,
    "originalName" TEXT,
    "key" TEXT,
    "url" TEXT,
    "thumbKey" TEXT,
    "thumbUrl" TEXT,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" DOUBLE PRECISION,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TotemMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TotemConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "idleSeconds" INTEGER NOT NULL DEFAULT 45,
    "showCallToAction" BOOLEAN NOT NULL DEFAULT true,
    "introMediaId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TotemConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TotemAd" (
    "id" TEXT NOT NULL,
    "type" "TotemAdType" NOT NULL,
    "title" TEXT NOT NULL,
    "mediaId" TEXT,
    "productId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 8,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TotemAd_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TotemAd_sortOrder_idx" ON "TotemAd"("sortOrder");

DO $$ BEGIN
  ALTER TABLE "TotemConfig" ADD CONSTRAINT "TotemConfig_introMediaId_fkey" FOREIGN KEY ("introMediaId") REFERENCES "TotemMedia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TotemAd" ADD CONSTRAINT "TotemAd_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "TotemMedia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TotemAd" ADD CONSTRAINT "TotemAd_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
