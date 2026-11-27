-- Horario de atención de asesores para escalado del chatbot (Sesión 198)
ALTER TABLE "ChatbotConfig" ADD COLUMN IF NOT EXISTS "advisorSchedule" JSONB;
