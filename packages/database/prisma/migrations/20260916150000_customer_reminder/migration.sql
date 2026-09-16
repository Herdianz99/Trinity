-- Recordatorios de cobro por WhatsApp: fecha del último mensaje + observación por cliente. Aditiva.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "lastReminderAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "reminderNote" TEXT;
