# Plan — CxP y Libro de Compras: fechas correctas + montos fiscales exactos al procesar

Fecha: 2026-06-24
Alcance: **solo CxP (compras) y Libro de Compras.** No tocar CxC ni Libro de Ventas.

## Problema / contexto

1. **Vencimiento y tasa en documentos manuales** (CxC/CxP): el vencimiento se basaba en la
   fecha de recepción y la tasa del día era de solo lectura. (Ya corregido en código — ver Fase 0.)
2. **Fecha del Libro de Compras**: una factura puede tener fecha original (la que emitió el
   proveedor, ej. 28/05) distinta de la fecha de recepción (cuando la recibimos/declaramos, ej.
   02/06). El libro debe **declararla en el período de la recepción (junio)** pero **mostrar la
   fecha original (28/05)**. Hoy solo existe `entryDate`, que hace doble trabajo (período + display).
3. **Descuadre de céntimos al procesar facturas de compra**: cada proveedor maneja decimales
   distinto, así que la suma de líneas (que define el costo de inventario) difiere por céntimos del
   total impreso del documento. En el sistema viejo lo resolvían cargando la factura **y además**
   creando un documento de CxP fiscal aparte → **CxP duplicada** + doble trabajo. En Trinity hoy
   `process()` crea **1 sola** CxP + **1 sola** entrada de libro, pero copia los montos de las
   líneas (con el descuadre). Falta dejar **ajustar los montos exactos del documento** al procesar.

## Decisiones tomadas (con Diego)

- Vencimiento de documentos manuales se basa en **Fecha original** + días de crédito. (Fase 0)
- Tasa del día **editable** en CxC/CxP manuales; si no se envía, se usa la de hoy. (Fase 0)
- Libro de Compras: separar **período (recepción)** de **fecha mostrada (original)**.
- Pantalla de ajuste de montos fiscales al procesar: **siempre** que la serie sea fiscal.
- Aplica **solo a crédito** (v1). Contado fiscal queda como hoy (los pagos ya están registrados;
  ajustar céntimos descuadraría caja). Revisable a futuro.
- El **monto a pagar al proveedor = total exacto del documento** (con su conversión USD↔Bs).
- El **inventario/costo sigue saliendo de las líneas** (no se toca). Dos verdades: líneas → costo;
  montos escritos → libro + deuda + retención.
- **Retención** se calcula sobre el **IVA exacto** escrito.
- El **comprobante de retención** se declara con su documento: en el período de **recepción**.
- El **Libro de Compras es editable** por el contador (ya existe CRUD; solo falta exponer la
  fecha nueva en el modal).

## Fase 0 — Vencimiento + tasa editable (YA CODIFICADO, falta commit)

Hecho y typechequeado, pendiente de commit/deploy:
- `apps/web/.../receivables/new/page.tsx` y `.../payables/new/page.tsx`:
  vencimiento autocalculado desde `originalDate` (no `receptionDate`); "Tasa del día" pasó a input
  editable, se envía en el payload, con validación `> 0`.
- `apps/api/.../receivables/dto/create-receivable.dto.ts` y `payables/dto/create-payable.dto.ts`:
  campo opcional `exchangeRate?: number`.
- `apps/api/.../receivables.service.ts` y `payables.service.ts`: usan `dto.exchangeRate` si viene
  (>0); si no, caen a la tasa de hoy.

## Fase 1 — Migración: `documentDate` en `PurchaseBookEntry`

- `schema.prisma`: agregar `documentDate DateTime?` a `PurchaseBookEntry`.
- Migración idempotente `ALTER TABLE "PurchaseBookEntry" ADD COLUMN IF NOT EXISTS "documentDate" TIMESTAMP;`
- Replicar en `deploy/fix-schema.sql`.
- **Semántica final**:
  - `entryDate` = **período / cuándo se declara** (filtro y orden siguen sobre este campo).
  - `documentDate` = **fecha que se muestra** en el reporte. Si es null, el display cae a `entryDate`
    (así compras/notas existentes y filas viejas no cambian; no requiere backfill).
- Campos date-only fiscales → usar `new Date(str)` directo (medianoche UTC), **no** anclar a
  Caracas (regla de CLAUDE.md; el filtro de `purchase-book.service` ya usa setUTCHours, se deja).

## Fase 2 — Split de fechas en CxP manual + display del libro

- `payables.service.ts` (`create`), línea de factura y línea de retención del libro:
  - `entryDate = receptionDate || originalDate || hoy` (período → recepción)
  - `documentDate = originalDate || receptionDate || hoy` (display → original)
- `RetentionVoucher.issueDate` de la CxP manual → `receptionDate || originalDate || hoy`
  (la retención se declara con su documento). `RetentionVoucherLine.invoiceDate` queda en
  **original** (es la fecha real de la factura del proveedor).
- Frontend `fiscal/libro-compras/page.tsx`: mostrar `entry.documentDate ?? entry.entryDate` en
  **tabla, PDF y Excel** (solo display; el filtro/orden NO cambia).

## Fase 3 — Pantalla de montos fiscales al procesar (crédito fiscal)

### Backend
- `ProcessPurchaseBillDto` (`dto/receive-purchase-order.dto.ts`): agregar objeto opcional
  `fiscalAdjustment` con:
  - `exemptBase, taxableBase8, taxableBase16, taxableBase31, igtfPct` (en moneda del documento)
  - `originalDate, receptionDate` (o `creditDays`), `exchangeRate`
  - (la moneda y tasa: reutilizar las de la orden; permitir override de tasa)
- `process()` (`purchase-orders.service.ts`): si viene `fiscalAdjustment` (siempre en crédito fiscal):
  - Calcular `iva8/16/31`, `totalIva`, `igtf`, `total` desde las bases escritas (misma fórmula que
    `payables.service`).
  - **Payable**: `amountUsd/amountBs` = total exacto convertido; **llenar** los campos de desglose
    fiscal del Payable (hoy quedan en 0): `exemptBaseUsd/Bs`, `taxableBase8/16/31`, `iva8/16/31`,
    `totalIva`, `igtf`. `dueDate = originalDate + creditDays`. Setear `originalDate`/`receptionDate`
    en el Payable (hoy no se llenan).
  - **PurchaseBookEntry**: `exemptAmountBs`, `taxableBaseBs` (suma de bases gravadas), `ivaAmountBs`
    (= totalIva), `totalBs` (= total exacto); `entryDate = receptionDate`, `documentDate = originalDate`.
  - **Retención** (`RetentionVoucher` + `IvaRetention`): calcular sobre el `totalIva` exacto escrito;
    fechas en período de recepción.
  - **NO** sobrescribir los montos de las líneas ni los agregados de la orden (siguen alimentando el
    costo de inventario). Las dos verdades conviven a propósito.

### Frontend
- `purchases/[id]/page.tsx`, modal de "Procesar": agregar un paso/sección
  **"Montos fiscales del documento"** (solo crédito + serie fiscal), precargado con los montos
  calculados de la orden, con inputs para bases/IVA/IGTF + fechas (original, recepción, vencimiento) +
  tasa. Reutilizar el desglose de la pantalla de CxP. Enviar `fiscalAdjustment` en el payload de
  `POST /purchases/:id/process`.

## Fase 4 — Exponer `documentDate` en el CRUD del Libro de Compras

- `purchase-book` DTOs (`create`/`update`) y `service`: aceptar y guardar `documentDate`.
- Modal de crear/editar en `libro-compras/page.tsx`: dos campos de fecha claramente etiquetados:
  - **"Fecha documento"** (`documentDate`) — la que se muestra.
  - **"Fecha declaración / período"** (`entryDate`) — el mes en que se declara.
  - En crear manual, `documentDate` por defecto = `entryDate` si se deja vacío.

## Riesgos / consideraciones

- **Divergencia intencional** entre total de líneas (inventario) y total fiscal (libro/deuda). Es el
  objetivo; documentarlo en UI (ej. nota "El total fiscal puede diferir por céntimos del costo de
  inventario").
- No romper compras de **contado** ni **no fiscales** (no muestran la pantalla; flujo intacto).
- No romper compras **fiscales existentes** ni filas de libro viejas (`documentDate` null → fallback).
- Mantener el emparejamiento SENIAT factura↔retención (misma `entryDate` de recepción).
- Typecheck API + Web limpio antes de commit.

## Pre-deploy checklist

- Migración `documentDate` commiteada + en `deploy/fix-schema.sql`.
- DTOs nuevos (fiscalAdjustment, documentDate) commiteados.
- Verificar endpoints/módulos nuevos commiteados (no solo locales).
- Probar E2E en local con copia de prod: procesar una factura de compra a crédito fiscal con
  descuadre de céntimos y confirmar: 1 CxP con total exacto, 1 entrada de libro en período de
  recepción mostrando fecha original, retención sobre IVA exacto, inventario con costo de líneas.
