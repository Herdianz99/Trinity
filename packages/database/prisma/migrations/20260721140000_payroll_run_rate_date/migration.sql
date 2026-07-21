-- Fecha de la tasa de una corrida de nomina (editable): a veces la tasa BCV se registra al
-- dia siguiente, asi que se guarda de que dia-Caracas proviene la tasa. Aditiva y opcional.
ALTER TABLE "PayrollRun" ADD COLUMN IF NOT EXISTS "rateDate" TIMESTAMP(3);
