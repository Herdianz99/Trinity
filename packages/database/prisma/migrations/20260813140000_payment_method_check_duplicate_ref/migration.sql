-- Metodo de pago: opt-in para alertar referencias duplicadas al cobrar (Pago Movil, etc.)
ALTER TABLE "PaymentMethod" ADD COLUMN IF NOT EXISTS "checkDuplicateRef" BOOLEAN NOT NULL DEFAULT false;
