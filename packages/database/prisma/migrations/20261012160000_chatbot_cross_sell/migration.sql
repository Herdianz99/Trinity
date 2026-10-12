-- Venta cruzada del chatbot (aditivo e idempotente).
DO $$ BEGIN
  CREATE TYPE "CrossSellRuleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'SUGGESTED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ChatbotCrossSellRule" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "offerTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "excludeTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" "CrossSellRuleStatus" NOT NULL DEFAULT 'PAUSED',
  "statsBaseCount" INTEGER,
  "statsPairPct" DOUBLE PRECISION,
  "statsLift" DOUBLE PRECISION,
  "statsAt" TIMESTAMP(3),
  "timesOffered" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatbotCrossSellRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChatbotCrossSellRule_key_key" ON "ChatbotCrossSellRule"("key");
CREATE INDEX IF NOT EXISTS "ChatbotCrossSellRule_status_idx" ON "ChatbotCrossSellRule"("status");

CREATE TABLE IF NOT EXISTS "ChatbotCrossSellOffer" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatbotCrossSellOffer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChatbotCrossSellOffer_conversationId_ruleId_key"
  ON "ChatbotCrossSellOffer"("conversationId", "ruleId");

ALTER TABLE "ChatbotConfig" ADD COLUMN IF NOT EXISTS "crossSellAnalyzedAt" TIMESTAMP(3);

-- Reglas iniciales APAGADAS (el usuario las prueba y activa).
INSERT INTO "ChatbotCrossSellRule" ("id", "key", "trigger", "offerTerms", "excludeTerms", "status", "updatedAt") VALUES
  (gen_random_uuid()::text, 'esmeril|disco de corte|disco de desbaste', 'esmeril', ARRAY['disco de corte', 'disco de desbaste'], ARRAY[]::TEXT[], 'PAUSED', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'taladro|mecha', 'taladro', ARRAY['mecha'], ARRAY[]::TEXT[], 'PAUSED', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'pintura|brocha|rodillo', 'pintura', ARRAY['brocha', 'rodillo'], ARRAY['brocha', 'rodillo', 'thinner'], 'PAUSED', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'cabilla|alambre', 'cabilla', ARRAY['alambre'], ARRAY[]::TEXT[], 'PAUSED', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'poceta|lavamanos', 'poceta', ARRAY['lavamanos'], ARRAY[]::TEXT[], 'PAUSED', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
