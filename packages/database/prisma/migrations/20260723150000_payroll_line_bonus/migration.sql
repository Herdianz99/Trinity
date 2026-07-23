-- Bonificación por línea de nómina: monto en USD (snapshot del empleado, editable) + su equivalente
-- en Bs (calculado con la tasa de la corrida). Es una asignación que suma al bruto/neto, igual que
-- las horas extra; aparece como concepto solo en el recibo "con horas extra".
ALTER TABLE "PayrollRunLine" ADD COLUMN IF NOT EXISTS "bonusUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PayrollRunLine" ADD COLUMN IF NOT EXISTS "bonusBs" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Envío de recibos por correo: marca el último envío de cada recibo (para mostrar el estado en la UI).
ALTER TABLE "PayrollRunLine" ADD COLUMN IF NOT EXISTS "receiptSentAt" TIMESTAMP(3);
