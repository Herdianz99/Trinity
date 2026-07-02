# Retenciones (IVA + ISLR) sobre Cuentas por Pagar como documentos del recibo — Diseño

- **Fecha:** 2026-07-02
- **Autor:** Diego + Claude
- **Estado:** Aprobado (dirección), pendiente de plan de implementación

## Contexto

Las **Cuentas por Pagar (CxP / `Payable`)** son facturas de proveedor "solo montos" (no tocan
inventario). Les corresponde **retención de IVA e ISLR**. Hoy:

- **IVA sobre CxP**: existe un flujo *inline* al crear la CxP (`createRetention`) que crea un
  comprobante `RetentionVoucher` (aparece en `/purchases/retentions`, ISSUED), mete su línea al
  **libro de compras**, y **le RESTA el neto a la CxP** (`netPayable = monto − retención`).
- **ISLR sobre CxP**: **no existe** (el modelo `IslrRetentionVoucherLine` solo referencia
  facturas de compra `PurchaseOrder`, no payables).
- **Recibo de pago** (`Receipt` tipo PAYMENT, `receipts/payment`): ya es documento+signo
  (`ReceiptItem.sign`, total = Σ(monto × signo)). Trae CxP (+) y notas (NCC −/NDC +). La lista de
  "retenciones IVA" del proveedor la arma desde el modelo **legado `IvaRetention`**, que **nadie
  crea** → esa lista sale **siempre vacía**. No hay tipo ISLR en el recibo.

El problema del modelo actual: la retención "restada adentro de la CxP" no es un documento que el
usuario pueda ver/elegir al pagar. Diego quiere el modelo correcto: **la CxP y cada retención son
documentos separados; el neteo se hace en el recibo de pago** seleccionándolos.

## Objetivo

Que al pagar un proveedor, en el recibo de pago se puedan seleccionar **3 documentos** — la CxP (+),
la retención de IVA (−) y la retención de ISLR (−) — y el monto a pagar salga del neteo. Las
retenciones se crean como comprobantes (inline al crear la CxP y/o desde sus pantallas), aparecen en
`/purchases/retentions` (IVA) y `/purchases/islr-retentions` (ISLR), y van al **libro de compras** al
crearse.

## Decisiones tomadas

1. **Retenciones = documentos, no restan el neto.** La CxP queda a **monto completo** (`netPayable =
   monto`). El neteo lo hace el recibo con signos.
2. **Dos flujos de creación** (ambos): **inline** al crear la CxP (tildar IVA y/o ISLR) **y** desde
   las **pantallas** `/purchases/retentions` y `/purchases/islr-retentions`.
3. **Pantallas**: al elegir proveedor, muestran una **lista única mezclada** de facturas de compra
   (FC) + cuentas por pagar (CxP), cada fila etiquetada por tipo.
4. **Inline** crea el comprobante **ya emitido** (ISSUED) → va al libro al instante.
5. **Solo compras** (proveedores). No aplica a ventas/clientes.
6. Se construye sobre los **comprobantes** `RetentionVoucher` (IVA) e `IslrRetentionVoucher` (ISLR);
   el modelo legado `IvaRetention` se deja intacto/dormido.

## Modelo de datos (`schema.prisma`)

- **`ReceiptItem`**: agregar `retentionVoucherId String?` (→ `RetentionVoucher`) e
  `islrRetentionVoucherId String?` (→ `IslrRetentionVoucher`) con sus relaciones.
- **`ReceiptItemType`** (enum): agregar `PURCHASE_IVA_RETENTION` y `PURCHASE_ISLR_RETENTION`.
  (Se deja `IVA_RETENTION`/`ivaRetentionId` legado sin tocar.)
- **`RetentionVoucher`**: agregar `appliedAt DateTime?` y `receiptItems ReceiptItem[]`.
- **`IslrRetentionVoucher`**: agregar `appliedAt DateTime?` y `receiptItems ReceiptItem[]`.
- **`IslrRetentionVoucherLine`**: agregar `payableId String?` + relación (el `purchaseOrderId` ya es
  opcional). Espejo de `RetentionVoucherLine`, que ya tiene ambos.
- **`Payable`**: agregar relación inversa `islrRetentionVoucherLines IslrRetentionVoucherLine[]`.
  El `netPayableUsd/Bs` pasa a ser **siempre = monto** (ya no se reduce). `retentionUsd/Bs` quedan
  en 0 (informativos/deprecados; el neteo ahora es externo).
- Migración con `IF NOT EXISTS` + espejo en `deploy/fix-schema.sql`. FKs vía `DO $$` guardado por
  `information_schema` (Postgres no soporta `ADD CONSTRAINT IF NOT EXISTS`).

## Backend

### 1. Inline al crear la CxP (`payables.service.create` + `CreatePayableDto`)

- DTO: mantener `createRetention?`/`retentionPct?` (IVA). Agregar `createIslrRetention?` +
  `islrRetentionTypeId?` (concepto ISLR; default = `supplier.islrConceptId`).
- **IVA inline**: seguir creando el `RetentionVoucher` (ISSUED) + su línea de libro (negativa), pero
  **NO reducir el neto** (quitar el `payable.update` que setea `retentionUsd/Bs`/`netPayable`).
- **ISLR inline** (nuevo, si `createIslrRetention` && fiscal && base > 0): crear
  `IslrRetentionVoucher` (ISSUED) con línea `payableId`, y su línea de libro negativa. Base imponible
  ISLR = `exemptBase + taxableBase8 + taxableBase16 + taxableBase31` (monto sin IVA). Fórmula igual a
  la de factura de compra (concepto: `baseImponiblePct`, `retentionPct`, sustraendo solo si el
  proveedor es `NATURAL_RESIDENTE`). **No** reduce el neto.
- El `netPayable` de la CxP se crea = monto, sin importar las retenciones.

### 2. Pantallas standalone aceptan CxP (`retention-vouchers.service` IVA + `islr-retention-vouchers.service`)

- Nuevo `getAvailableDocuments(supplierId)` en cada servicio → **lista mezclada**:
  `[{ docType: 'PURCHASE_ORDER'|'PAYABLE', id, number, invoiceDate, base/iva, ... }]`
  - IVA: FCs `PROCESSED` con IVA > 0 + CxP fiscales con IVA > 0, excluyendo las que ya están en un
    comprobante IVA activo (por `purchaseOrderId`/`payableId`).
  - ISLR: FCs `PROCESSED` con subtotal > 0 + CxP fiscales con base sin IVA > 0, excluyendo las que ya
    están en un comprobante ISLR activo.
- `create`/`update`: cada línea trae `purchaseOrderId` **o** `payableId`; se calcula desde el doc
  correspondiente y se guarda la FK correcta. Validaciones espejo de las que ya existen para FC
  (pertenece al proveedor; no repetida en otro comprobante activo).
- `issue`: la línea del libro (`PurchaseBookEntry`) lleva la FK que corresponda (`purchaseOrderId` o
  `payableId`). `PurchaseBookEntry` ya tiene ambos campos → sin cambio de schema ahí.

### 3. Recibo de pago selecciona comprobantes de retención (`receipts.service`)

- `create`: manejar ítems nuevos:
  - `retentionVoucherId` → validar `RetentionVoucher` `status='ISSUED'` y `appliedAt=null`; monto =
    `retentionAmountUsd/Bs`; `itemType='PURCHASE_IVA_RETENTION'`; `sign=-1`. Marcar `appliedAt`.
  - `islrRetentionVoucherId` → idem con `IslrRetentionVoucher`; `itemType='PURCHASE_ISLR_RETENTION'`.
  - El total sigue siendo Σ(monto × signo) → CxP (+) − retenciones (−).
- `cancel`: al anular el recibo, revertir `appliedAt=null` en los comprobantes de retención incluidos
  (igual que hoy se revierte para otros ítems).

### 4. Documentos del proveedor para el pago (`receipts.service.getPendingDocuments`, rama PAYMENT)

- Reemplazar la consulta al modelo muerto `IvaRetention` por:
  - `RetentionVoucher` where `supplierId`, `status='ISSUED'`, `appliedAt=null` → doc con
    `retentionVoucherId`, `documentType='PURCHASE_IVA_RETENTION'`, `sign=-1`, monto = retención.
  - `IslrRetentionVoucher` where `supplierId`, `status='ISSUED'`, `appliedAt=null` → doc con
    `islrRetentionVoucherId`, `documentType='PURCHASE_ISLR_RETENTION'`, `sign=-1`.
- Devolver `[...payableDocs, ...noteDocs, ...retentionDocsIva, ...retentionDocsIslr]`.

## Frontend

- **Crear CxP** (`payables/new`): junto al toggle de retención IVA existente, agregar toggle de
  retención **ISLR** + dropdown de **concepto** (default el del proveedor). El neto mostrado = monto
  (ya no se descuenta en pantalla).
- **Pantallas** `/purchases/retentions/new` y `/purchases/islr-retentions/new`: el selector de
  documentos muestra la **lista mezclada** (FC / CxP con etiqueta de tipo).
- **Recibo de pago** (`receipts/payment` + `receipts/new`): la lista de documentos del proveedor ahora
  incluye los comprobantes de retención (IVA + ISLR) como documentos con signo −. Se muestran con su
  etiqueta ("Ret. IVA" / "Ret. ISLR") y se netean en el total. El detalle del recibo (`receipts/[id]`)
  ya renderiza por `itemType` → agregar las dos etiquetas nuevas.
- **Detalle CxP** (`payables/[id]`): mostrar los comprobantes de retención asociados (links a sus
  pantallas) y el neto = monto.

## Libro de compras

- Sin lógica nueva: los comprobantes ya generan sus líneas (`PurchaseBookEntry`: la línea de la
  factura la crea la CxP al ser fiscal; la línea de retención negativa la crea el comprobante al
  emitirse). El ISLR-sobre-CxP entra por el mismo camino con `payableId` + `islrRetentionVoucherId` +
  `isIslrRetentionLine`. **Verificación**: confirmar que el libro (`purchase-book.service`) lista las
  líneas de retención por payable igual que por factura de compra.

## Casos borde / consideraciones

- **Cambio de comportamiento (neto)**: las CxP nuevas quedan con neto = monto. Las CxP **históricas**
  que ya tenían el neto reducido por el inline viejo **no se migran** (quedan como están). El cambio es
  hacia adelante.
- **Evitar doble descuento con comprobantes preexistentes (CRÍTICO)**: al cambiar `getPendingDocuments`
  para que muestre los comprobantes de retención como documentos −, los comprobantes **ya existentes**
  aparecerían de golpe (y en las CxP históricas el neto ya venía reducido → se restaría dos veces).
  **Mitigación en la migración**: marcar `appliedAt = now()` en **todos los `RetentionVoucher` e
  `IslrRetentionVoucher` existentes al momento del deploy**, de modo que **solo los comprobantes creados
  DESPUÉS** de esta feature aparezcan como pendientes en el recibo. Los históricos quedan fuera del
  neteo del recibo (su efecto ya está en el neto reducido o ya fue declarado).
- **Doble retención**: un documento (FC o CxP) no puede estar en dos comprobantes activos del mismo
  tipo (validación ya existente para FC, se extiende a CxP).
- **Retención ya aplicada en un recibo**: no se puede volver a seleccionar (`appliedAt` la excluye);
  no se puede eliminar el comprobante si está aplicado.
- **CxP no fiscal**: no genera retención (igual que hoy el IVA inline exige `isFiscal`).

## Fuera de alcance

- El modelo legado `IvaRetention` y su rama en el recibo (se dejan dormidos, sin borrar).
- TXT SENIAT de ISLR (el de IVA ya existe; el de ISLR se ve aparte si se pide).
- Retención de ISLR del lado de **ventas** (cliente que nos retiene) — no aplica acá.

## Verificación

- API + Web typecheck en 0 (no hay tests automatizados en el proyecto).
- Prueba manual:
  1. Crear CxP fiscal tildando retención IVA **y** ISLR → aparecen 2 comprobantes en
     `/purchases/retentions` y `/purchases/islr-retentions`; ambos en el libro; la CxP queda con
     **neto = monto** (sin descuento).
  2. Ir a `/purchases/islr-retentions/new`, elegir proveedor → la lista mezcla FC + CxP; crear un
     comprobante ISLR seleccionando una CxP; emitir → entra al libro.
  3. Recibo de pago del proveedor → aparecen la CxP (+), la Ret. IVA (−) y la Ret. ISLR (−);
     seleccionarlas → el total a pagar = CxP − IVA − ISLR. Postear el recibo → las retenciones quedan
     `appliedAt`; anular el recibo → se liberan.
  4. Libro de compras del período → la factura suma y las dos retenciones restan.

## Archivos afectados

- `packages/database/prisma/schema.prisma` + migración + `deploy/fix-schema.sql`
- `apps/api/src/modules/payables/payables.service.ts` + `dto/create-payable.dto.ts`
- `apps/api/src/modules/retention-vouchers/retention-vouchers.service.ts` (+ dto/controller)
- `apps/api/src/modules/islr-retention-vouchers/islr-retention-vouchers.service.ts` (+ dto/controller)
- `apps/api/src/modules/receipts/receipts.service.ts` (+ dto de ítems)
- `apps/web/src/app/(dashboard)/payables/new/page.tsx` + `payables/[id]/page.tsx`
- `apps/web/src/app/(dashboard)/purchases/retentions/new/page.tsx`
- `apps/web/src/app/(dashboard)/purchases/islr-retentions/new/page.tsx`
- `apps/web/src/app/(dashboard)/receipts/new/page.tsx` + `receipts/payment/page.tsx` + `receipts/[id]/page.tsx`
