-- Dimension banco retirada del modulo de divisas: bankId pasa a opcional (idempotente)
ALTER TABLE "TreasuryMovement" ALTER COLUMN "bankId" DROP NOT NULL;
