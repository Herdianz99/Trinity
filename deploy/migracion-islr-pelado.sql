-- Migracion ISLR: numeracion "pelada" + carga historica de junio (declarada en sistema anterior)
-- Contexto: el comprobante ISLR no usa el formato AAAAMM+consecutivo del SENIAT (ese es solo IVA).
-- Se corre DESPUES de desplegar el cambio de generateNumber (pelado) en el codigo.
-- Idempotente-ish: usa ids fijos e IF checks via ON CONFLICT donde aplica.

BEGIN;

-- 1) Normalizar los comprobantes propios de Trinity (julio) al formato pelado
UPDATE "IslrRetentionVoucher" SET number = '27' WHERE number = '20260700000027';
UPDATE "IslrRetentionVoucher" SET number = '28' WHERE number = '20260700000028';

-- 2) Carga historica de junio (comprobantes 24, 25, 26). Solo encabezado + linea.
--    NO se crea PurchaseBookEntry: junio queda declarado en el sistema anterior (no duplicar libro/SENIAT).
INSERT INTO "IslrRetentionVoucher"
  (id, number, "supplierId", "serieId", status, "issueDate",
   "retentionAmountUsd", "retentionAmountBs", "exchangeRate", "unidadTributaria",
   notes, "createdById", "createdAt", "updatedAt")
VALUES
  ('histislrv0000024','24','cmqwuizhi00w36jmie6crqdhh',NULL,'ISSUED','2026-06-01',
   0.42, 232.86, 554.4258, 43,
   'Carga historica - retencion declarada en sistema anterior (junio 2026)','cmqp7vopb00608gi2y24d4vrb','2026-06-01','2026-06-01'),
  ('histislrv0000025','25','cmqwuizhi00w36jmie6crqdhh',NULL,'ISSUED','2026-06-04',
   0.50, 277.26, 560.3753, 43,
   'Carga historica - retencion declarada en sistema anterior (junio 2026)','cmqp7vopb00608gi2y24d4vrb','2026-06-04','2026-06-04'),
  ('histislrv0000026','26','cmqwuk90600w46jmi4it3wizl',NULL,'ISSUED','2026-06-11',
   21.96, 12468.36, 567.6828, 43,
   'Carga historica - retencion declarada en sistema anterior (junio 2026)','cmqp7vopb00608gi2y24d4vrb','2026-06-11','2026-06-11')
ON CONFLICT (id) DO NOTHING;

INSERT INTO "IslrRetentionVoucherLine"
  (id, "islrRetentionVoucherId", "payableId", "islrRetentionTypeId",
   "supplierInvoiceNumber", "supplierControlNumber", "invoiceDate",
   "invoiceTotalUsd", "invoiceTotalBs", "taxableBaseUsd", "taxableBaseBs",
   "baseImponiblePct", "retentionPct", "sustraendoUt", "sustraendoBs",
   "retentionAmountUsd", "retentionAmountBs", "exchangeRate", "isManual", "createdAt")
VALUES
  ('histislrl0000024','histislrv0000024','cmqwumve600w76jmi6nwcw1h5','cmr4606dj000flajm7n8s4jo1',
   '4386268','00-07587776','2026-06-01',
   289.74, 160641.54, 8.4, 4657.18,
   100, 5, 0, 0,
   0.42, 232.86, 554.4258, false, '2026-06-01'),
  ('histislrl0000025','histislrv0000025','cmqwuot8300wi6jmi2giq7crn','cmr4606dj000flajm7n8s4jo1',
   '4387571','00-07589173','2026-06-04',
   341.33, 191273.50, 9.9, 5545.23,
   100, 5, 0, 0,
   0.50, 277.26, 560.3753, false, '2026-06-04'),
  ('histislrl0000026','histislrv0000026','cmqwuqp7w00wt6jmi6wvbo8c1','cmr4606kk001ilajm1kb11w4o',
   '000148538','00-00154488','2026-06-08',
   1273.89, 723164.76, 1098.18, 623417.90,
   100, 2, 0, 0,
   21.96, 12468.36, 567.6828, false, '2026-06-11')
ON CONFLICT (id) DO NOTHING;

-- Nota: el contador islrRetentionNextNumber se deja en 29 (siguiente pelado). No se toca.

COMMIT;
