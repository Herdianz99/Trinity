# Editar cantidades al enviar un traslado entre socios — Diseño

Fecha: 2026-08-07
Estado: en revisión (pendiente aprobación del spec)
Alcance: **traslados entre socios** (feature ya opt-in de las empresas integradas, ej. aceros/acerosmayor). No afecta a otras empresas ni al inventario/POS normales.

## Problema

Hoy, cuando una empresa socia (A) **solicita** mercancía a la otra (B), B solo puede
**Aprobar o Rechazar** — y al aprobar envía **exactamente lo solicitado**. El código
(`partner-transfers.service.ts` `approve()`) lee `rec.items` sin permitir edición, valida que
haya **≥ lo pedido** (si hay menos, **falla** con "stock insuficiente") y descuenta
`snap.quantity` fijo. No existe UI ni DTO para ajustar cantidades.

Eso no refleja el negocio real: **el que tiene la mercancía es quien decide cuánto suelta**.
Casos del usuario:
- Le piden 10 taladros y solo tiene 10 → quiere enviar **5** para no quedarse sin nada (hoy imposible).
- Le piden 10 discos y tiene 100 → quiere enviar **25** para evitar traslados futuros (hoy imposible).

## Objetivo

En el paso de **"Aprobar y enviar"**, que el que envía pueda **editar la cantidad por línea**:
enviar **menos** (incluido 0 = no enviar esa línea) o **más** de lo solicitado, **topado por su
stock disponible**. El que pidió recibe lo realmente enviado y ve **"Solicitaste X · Recibiste Y"**
más una **nota** opcional del que envió.

## Decisiones tomadas (brainstorming 2026-08-07)

1. **Cantidad editable por línea** al aprobar, **precargada con lo solicitado**.
2. **Tope = stock disponible** del almacén origen (no puede enviar lo que no tiene; sin negativos).
3. **0 en una línea = no se envía** esa línea. Si **todas** quedan en 0 → error (para eso está Rechazar).
4. Se conserva **solicitado vs enviado**: se muestra "Solicitaste 10 · Recibiste 5" en **ambos lados**.
5. **Una nota por traslado** (opcional), escrita por el que envía, visible para el que pidió.
6. El que envía **solo ajusta cantidades** de lo pedido; **no agrega productos nuevos** (fuera de alcance).
7. El que pidió **no re-aprueba**: la decisión del que envía es final (recibe lo enviado).

## Diseño

### 1. Modelo de datos (`PartnerTransfer`)

**Archivo:** `packages/database/prisma/schema.prisma` (modelo `PartnerTransfer`, ~líneas 651-669).

- El JSON `items` de cada línea pasa de `{ code, name, quantity, unitCost }` a
  `{ code, name, requestedQuantity, quantity, unitCost }`:
  - **`requestedQuantity`** = lo que pidió A (fijo, para mostrar "solicitado").
  - **`quantity`** = lo que B realmente envía (editable en approve; es lo que descuenta, cuesta y recibe A).
  - Al **crear la solicitud** (`request()`), `requestedQuantity = quantity = lo pedido`.
  - **Compatibilidad:** en traslados viejos sin `requestedQuantity`, tratarlo como `= quantity`.
- **Nota del que envía:** nuevo campo **`sendNote String?`** en `PartnerTransfer` (migración aditiva
  `ADD COLUMN IF NOT EXISTS` + red en `deploy/fix-schema.sql`). Se decidió **una nota por traslado**
  (no por línea). Debe **viajar al socio** por el mismo canal de sync que los items (ver §3).

### 2. Backend — `approve()` (el que envía)

**Archivo:** `apps/api/src/modules/integration/partner-transfers.service.ts` (`approve()`, ~línea 260).

- El DTO pasa de `{ fromWarehouseId, costBasis? }` a
  `{ fromWarehouseId, costBasis?, sendNote?, items: [{ code, sendQuantity }] }`.
- Reglas de validación (todas antes de descontar, en transacción):
  - Se parte del snapshot solicitado; se mapea cada línea a su `sendQuantity` del DTO (si falta una,
    default = lo solicitado, para no romper si la UI no la manda).
  - `sendQuantity` **≥ 0** y **≤ stock disponible** de esa línea en `fromWarehouseId`
    (mensaje claro: `"Solo tienes N de {code}"`). Reemplaza la validación actual contra `snap.quantity`.
  - Líneas con `sendQuantity == 0` se **excluyen** (no descuentan, no viajan, no cuestan).
  - Si **todas** quedan en 0 → `BadRequestException` ("No hay nada que enviar; usa Rechazar").
- Descuento de stock: `decrement: sendQuantity` (no `snap.quantity`). `StockMovement TRANSFER_OUT`
  y la **CxC al socio** se calculan sobre lo enviado (a costo, como hoy).
- Persistir en `items`: `requestedQuantity` (del snapshot original) + `quantity` (= `sendQuantity`) +
  `unitCost`. Guardar `sendNote`. Estado → `SENT` (igual que hoy).

### 3. Sincronización al socio

**Archivo:** módulo `integration` (el push/`receiveIncoming` que ya sincroniza `{ number, items }`
al enviar). Como `items` ya lleva ahora `requestedQuantity` + `quantity`, esos viajan solos. **Falta
incluir `sendNote`** en el payload de sync y guardarlo en la copia del socio (extender
`receiveIncoming` para aceptar y persistir `sendNote`). *(Verificar al implementar el shape exacto del
push y de `receiveIncoming`.)*

### 4. Frontend — pantalla "Aprobar y enviar" (el que envía)

**Archivo:** `apps/web/src/app/(dashboard)/catalog/partner-transfers/[id]/page.tsx`
(tabla de items ~líneas 172-180; acción approve ~líneas 71-73 y botón ~113-148).

- La tabla de ítems pasa de **solo lectura → editable**: cada línea con un **input numérico**
  precargado con lo solicitado, mostrando **"disponible: N"** (stock del almacén origen elegido) y
  topado a ese N. Requiere que la pantalla conozca el stock disponible por línea del almacén origen
  seleccionado (endpoint de stock por almacén ya existe; se consulta al elegir `fromWarehouseId`).
- Un campo de **nota** (una sola, opcional).
- El botón "Aprobar y enviar" manda `{ fromWarehouseId, costBasis, sendNote, items: [{code, sendQuantity}] }`.
- Validación en cliente: no permitir teclear más que "disponible"; avisar si todas quedan en 0.

### 5. Frontend — vista de detalle (ambos lados)

Mismo `[id]/page.tsx` (y el lado que pidió). La tabla de ítems muestra **dos columnas**:
**Solicitado** (`requestedQuantity`) y **Enviado/Recibido** (`quantity`), resaltando las líneas donde
difieran. Si hay `sendNote`, mostrarla en el encabezado del traslado. En traslados viejos sin
`requestedQuantity`, mostrar una sola cantidad (compatibilidad).

## Casos borde

- **Enviar más de lo pedido** (piden 10, hay 100, envía 25): permitido hasta el stock.
- **Enviar menos / 0**: permitido; 0 excluye la línea.
- **Stock insuficiente para lo tecleado**: bloqueado con "Solo tienes N".
- **Todas en 0**: bloqueado (usar Rechazar).
- **Traslados ya creados** (sin `requestedQuantity`): se leen como `requestedQuantity = quantity`;
  no rompen la vista ni el approve.
- **kind = SEND** (B manda sin que A pida): fuera de este cambio — ahí B ya define las cantidades al crear.
  Este cambio aplica al flujo **REQUEST** (A pide, B ajusta y envía).

## Fuera de alcance

- Agregar productos nuevos no solicitados en el approve (solo se ajustan cantidades de lo pedido).
- Nota por línea (se eligió una por traslado).
- Re-aprobación por parte del que pidió (la decisión del que envía es final).

## Pruebas

- **Backend (manual, con las 2 instancias locales o mocks del sync):**
  - Piden 10, stock 10, enviar 5 → descuenta 5, quedan 5, CxC por 5, items con requested=10/quantity=5.
  - Piden 10, stock 100, enviar 25 → descuenta 25, CxC por 25.
  - Enviar más que el stock → error "Solo tienes N".
  - Una línea en 0 → esa no viaja; el resto sí.
  - Todas en 0 → error.
  - Verificar que `sendNote` y requested/quantity llegan al socio por el sync.
- **Frontend:** tabla editable con tope por "disponible", nota, y la vista "Solicitado vs Enviado/Recibido"
  en ambos lados. Compatibilidad con un traslado viejo (sin requestedQuantity).
- **Typecheck** API + Web limpio.
