-- Meta mensual del vendedor (Sesion 69)
ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "monthlyGoalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
