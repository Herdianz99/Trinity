-- Un cruce de documentos a cero (factura ↔ su nota) no tiene metodo de pago real.
-- Se permite methodId NULL en los pagos de CxC/CxP. Migracion segura (no destructiva).
ALTER TABLE "ReceivablePayment" ALTER COLUMN "methodId" DROP NOT NULL;
ALTER TABLE "PayablePayment" ALTER COLUMN "methodId" DROP NOT NULL;
