-- Campana de WhatsApp dentro de Trinity (Ventas > Campana WhatsApp). Aditiva e idempotente.
-- Opt-in por empresa: whatsappCampaignEnabled=false en todas; se activa solo en la grande.
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "whatsappCampaignEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "whatsappCampaignStoreName" TEXT NOT NULL DEFAULT 'El Trébol';
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "whatsappCampaignDailyLimit" INTEGER NOT NULL DEFAULT 50;

CREATE TABLE IF NOT EXISTS "WhatsappCampaignSend" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "userId" TEXT,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "template" TEXT NOT NULL,
  "edited" BOOLEAN NOT NULL DEFAULT false,
  "snapshot" JSONB NOT NULL,
  CONSTRAINT "WhatsappCampaignSend_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WhatsappCampaignSend_customerId_idx" ON "WhatsappCampaignSend"("customerId");
CREATE INDEX IF NOT EXISTS "WhatsappCampaignSend_sentAt_idx" ON "WhatsappCampaignSend"("sentAt");

CREATE TABLE IF NOT EXISTS "WhatsappCampaignContact" (
  "customerId" TEXT NOT NULL,
  "repliedAt" TIMESTAMP(3),
  "noWhatsappAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsappCampaignContact_pkey" PRIMARY KEY ("customerId")
);

CREATE TABLE IF NOT EXISTS "WhatsappCampaignTemplate" (
  "key" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsappCampaignTemplate_pkey" PRIMARY KEY ("key")
);
