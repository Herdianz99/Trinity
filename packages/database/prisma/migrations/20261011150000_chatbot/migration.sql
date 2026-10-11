-- Chatbot de ventas, Fase 2 (bot dentro de Trinity). Aditivo e idempotente. Arranca APAGADO (enabled=false).
-- Spec: docs/superpowers/specs/2026-10-11-chatbot-bot-trinity-design.md

DO $$ BEGIN CREATE TYPE "ChatbotChannel" AS ENUM ('TEST', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'WEB');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ChatbotConversationStatus" AS ENUM ('BOT', 'ESCALATED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ChatbotMessageRole" AS ENUM ('USER', 'BOT', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ChatbotConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT NOT NULL DEFAULT 'claude-haiku-5-5',
    "effort" TEXT NOT NULL DEFAULT 'low',
    "botName" TEXT NOT NULL DEFAULT 'Asistente virtual',
    "greeting" TEXT,
    "addressText" TEXT,
    "hoursText" TEXT,
    "deliveryText" TEXT,
    "paymentText" TEXT,
    "partnersText" TEXT,
    "extraInfo" TEXT,
    "divisaDiscountPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "divisaExceptionCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "divisaExceptionProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "monthlyBudgetUsd" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatbotConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChatbotConversation" (
    "id" TEXT NOT NULL,
    "channel" "ChatbotChannel" NOT NULL DEFAULT 'TEST',
    "externalId" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "status" "ChatbotConversationStatus" NOT NULL DEFAULT 'BOT',
    "escalationReason" TEXT,
    "escalationSummary" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatbotConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChatbotMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "ChatbotMessageRole" NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "productImages" JSONB,
    "toolCalls" JSONB,
    "apiContent" JSONB,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatbotMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChatbotSearchLog" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatbotSearchLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChatbotConversation_status_updatedAt_idx" ON "ChatbotConversation"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "ChatbotConversation_channel_externalId_idx" ON "ChatbotConversation"("channel", "externalId");
CREATE INDEX IF NOT EXISTS "ChatbotMessage_conversationId_createdAt_idx" ON "ChatbotMessage"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "ChatbotSearchLog_createdAt_idx" ON "ChatbotSearchLog"("createdAt");

DO $$ BEGIN
  ALTER TABLE "ChatbotConversation" ADD CONSTRAINT "ChatbotConversation_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ChatbotMessage" ADD CONSTRAINT "ChatbotMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "ChatbotConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ChatbotSearchLog" ADD CONSTRAINT "ChatbotSearchLog_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "ChatbotConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Modulo de permiso 'chatbot' al ADMIN (puede tener lista explicita en vez de '*').
UPDATE "RolePermission" SET modules = array_append(modules, 'chatbot')
WHERE role = 'ADMIN' AND NOT ('chatbot' = ANY(modules)) AND NOT ('*' = ANY(modules));
