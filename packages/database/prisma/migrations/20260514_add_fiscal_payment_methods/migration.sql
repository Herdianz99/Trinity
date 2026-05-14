-- CreateTable
CREATE TABLE "FiscalPaymentMethod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fiscalCode" TEXT NOT NULL,
    "isDivisa" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FiscalPaymentMethod_name_key" ON "FiscalPaymentMethod"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalPaymentMethod_fiscalCode_key" ON "FiscalPaymentMethod"("fiscalCode");

-- Seed default payment methods
INSERT INTO "FiscalPaymentMethod" ("id", "name", "fiscalCode", "isDivisa", "isActive", "createdAt", "updatedAt") VALUES
  ('fpm_efectivo',       'Efectivo',         '01', false, true, NOW(), NOW()),
  ('fpm_punto_de_venta', 'Punto de Venta',   '02', false, true, NOW(), NOW()),
  ('fpm_cheque',         'Cheque',           '03', false, true, NOW(), NOW()),
  ('fpm_transferencia',  'Transferencia',    '04', false, true, NOW(), NOW()),
  ('fpm_pago_movil',     'Pago Movil',       '05', false, true, NOW(), NOW()),
  ('fpm_efectivo_usd',   'Efectivo USD',     '06', true,  true, NOW(), NOW()),
  ('fpm_zelle',          'Zelle',            '07', true,  true, NOW(), NOW());
