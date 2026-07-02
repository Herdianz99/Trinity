# Comandas de devolución (NCV) — Diseño

- **Fecha:** 2026-07-02
- **Autor:** Diego + Claude
- **Estado:** Aprobado, pendiente de plan de implementación

## Contexto

Las **facturas** ya generan "comandas" de despacho: al cobrar (`invoices.service.pay()`)
se agrupan los ítems por `category.printArea` y se crea un `PrintJob` PENDING por área.
Las PCs de despacho (una por zona) las levantan por polling (`PrintMonitor`), con reserva
atómica (`claim`) y reporte de impreso/fallido. Fallback a `window.print()` si el agente
local está caído.

Las **devoluciones de venta** (Nota de Crédito de Venta, `NCV`, origen `MERCHANDISE`) hoy
NO generan comandas. El almacén no recibe un soporte físico de qué mercancía está
regresando el cliente. Esta feature agrega esas comandas.

## Objetivo

Que al procesar una devolución de cliente, cada área de despacho reciba una comanda
"DEVOLUCIÓN" con los ítems que le corresponden, como soporte de lo que **entró** ese día.

## No-objetivos (explícito — NO se toca)

- La **impresión fiscal** de la nota de crédito (`sendToFiscalPrinter` en `handlePost`).
- El **recibo de devolución** al cliente (`printReturnReceipt`).
- La **unificación** del render agente vs navegador del ticket (Tema 1, se difiere).
- Notas de **compra** (`NCC`/`NDC`) y notas **manuales** (sin ítems): no generan comandas.
- **Reimpresión** de comandas de devolución (YAGNI; se puede sumar luego espejando
  `reprintByInvoice`).

## Decisiones tomadas

1. **Paso nuevo separado** "Procesar comandas", distinto de "Confirmar nota".
2. **Exige nota confirmada** (`status = POSTED`). Se puede **eliminar** hasta antes de
   procesar; una vez procesadas las comandas, se **bloquea** eliminar.
3. **Sin candado de rol**: cualquier usuario logueado puede procesar (control operativo).
4. **Alcance**: solo `NCV` + `MERCHANDISE`.
5. **Enfoque A**: `PrintJob` con FK opcional a la nota (se reutiliza toda la tubería).
6. **Área por defecto**: un ítem cuya categoría no tiene área cae en un área marcada como
   "por defecto". Aplica a **devoluciones y facturas**. Nunca se produce "cero comandas".

## Modelo de datos

**`PrintJob`** (`packages/database/prisma/schema.prisma`)
- `invoiceId` pasa a **opcional** (`String?`), relación `invoice Invoice?`.
- Nuevo `creditDebitNoteId String?` + relación `creditDebitNote CreditDebitNote?`.
- Invariante (en código, no en schema): exactamente uno de `invoiceId` / `creditDebitNoteId`.

**`CreditDebitNote`**
- Nuevo `comandasProcessedAt DateTime?`.
- Nuevo `comandasProcessedById String?`.
- Relación inversa `printJobs PrintJob[]`.

**`PrintArea`**
- Nuevo `isDefault Boolean @default(false)`. A lo sumo una en `true`.

**Migración** (`IF NOT EXISTS`, según regla del proyecto) + espejo en `deploy/fix-schema.sql`:
- `ALTER TABLE "PrintJob" ALTER COLUMN "invoiceId" DROP NOT NULL;`
- `ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "creditDebitNoteId" TEXT;`
- FK `PrintJob.creditDebitNoteId → CreditDebitNote(id)` dentro de un `DO $$ ... $$`
  guardado por `information_schema` (Postgres no soporta `ADD CONSTRAINT IF NOT EXISTS`).
- `ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "comandasProcessedAt" TIMESTAMP(3);`
- `ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "comandasProcessedById" TEXT;`
- `ALTER TABLE "PrintArea" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;`

## Backend

### Helper compartido de agrupación por área (con fallback a default)

Nuevo `apps/api/src/modules/print-jobs/print-area-grouping.ts`:

```
buildPrintAreaGroups(tx, items: { productId, productName, quantity }[])
  → { printAreaId, items: { code, supplierRef, name, quantity }[] }[]
```

- Carga los productos con `category.printArea`.
- Resuelve el área de cada ítem: `product.category.printAreaId` ó, si es null, el área
  `isDefault=true`; si no hubiera ninguna default, la **primera** `PrintArea` existente
  (último recurso para no perder nada). Si no existe **ninguna** área, devuelve `[]`.
- Agrupa y devuelve la estructura lista para crear `PrintJob`.

Refactor: `invoices.service.pay()` (bloque ~989-1021) pasa a usar este helper en vez del
grupo inline. Efecto de negocio nuevo: ítems de factura sin área ahora caen al área por
defecto (antes se omitían). Es el comportamiento deseado (decisión 6).

### Nueva acción "Procesar comandas"

- Controller: `POST /credit-debit-notes/:id/process-comandas` (solo JWT, sin rol).
- Service `processComandas(id, userId)`:
  - Carga la nota con `items`.
  - Valida `type = NCV` && `origin = MERCHANDISE` (si no → 400).
  - Valida `status = POSTED` (si no → 400 "confirma la nota primero").
  - Valida `!comandasProcessedAt` (si no → 400 "las comandas ya fueron procesadas").
  - `buildPrintAreaGroups(tx, note.items)`; en transacción crea un `PrintJob` por grupo con
    `creditDebitNoteId = id`, y setea `comandasProcessedAt = now()`, `comandasProcessedById`.
  - Devuelve `{ zones: N }`. (Con el fallback, `N ≥ 1` siempre que exista alguna área.)
- **No imprime ni toca lo fiscal**: solo encola PrintJobs.

### Bloqueo de borrado

`remove()` agrega guarda: `if (note.comandasProcessedAt) → 400 "No se puede eliminar: ya se
procesaron las comandas de despacho"`. (Se suma a las guardas ya existentes: `fiscalPrinted`,
aplicada/pagada, cruzada en recibo.)

### Consultas de comandas

`print-jobs.service.ts`:
- `findPending(printAreaId)` y `findAll(...)`: incluir la relación `creditDebitNote`
  (`number`, `type`, `invoice.number` de la factura afectada, `invoice.customer.name`)
  además de `invoice`. Cada job trae la que corresponda.

### Áreas de impresión — default

`print-areas.service.ts` (+ dto/controller): permitir marcar `isDefault`. Al marcar una,
se limpia el flag en las demás (una sola default). Validación mínima.

## Frontend

### `PrintMonitor` — variante "DEVOLUCIÓN" (aditiva, sin unificar)

`apps/web/src/components/print-monitor.tsx`:
- Interfaz `PrintJob`: `invoice` opcional; agregar `creditDebitNote?` con `number`,
  factura afectada y cliente.
- Derivar título/labels según el origen del job:
  - Factura → título "COMANDA", firma "Despachado por (firma)" (igual que hoy).
  - Nota → título **"DEVOLUCIÓN"**, muestra **N° de nota** + "Factura afectada", firma
    **"Recibido por (firma)"** (la mercancía entra).
- Aplicar en **ambos** caminos: `buildTicketText()` (agente) y el bloque HTML del
  `window.print()`. Cambios aditivos; la divergencia entre ambos se resuelve aparte (Tema 1).

### Página de la nota — botón + indicador

`apps/web/src/app/(dashboard)/credit-debit-notes/[id]/page.tsx`:
- Botón **"Procesar comandas"** visible sólo si
  `status = POSTED && type = NCV && origin = MERCHANDISE && !comandasProcessedAt`.
  Al hacer clic → `POST /process-comandas`; toast "N comandas enviadas a las áreas".
- Tras procesar: badge **"Comandas procesadas ✓"** con fecha.
- `canDelete` agrega `&& !note.comandasProcessedAt` (además del refuerzo en backend).

### Configuración — Áreas de Impresión

`apps/web/src/app/(dashboard)/settings/print-areas/page.tsx`: toggle/badge "Área por
defecto" por fila; marcar una desmarca las demás.

### Control de Comandas — tolerar jobs de nota

`apps/web/src/app/(dashboard)/commands/page.tsx`: donde hoy lee `job.invoice.number`,
mostrar el N° de nota cuando el job venga de una devolución (no romper si `invoice` es null),
idealmente con una etiqueta "Devolución".

## Casos borde

- **Ítem sin área y sin default**: cae en la primera área existente (nunca se pierde).
- **Ninguna `PrintArea` configurada**: `processComandas` no crea jobs; devuelve `{zones:0}` y
  la UI avisa "no hay áreas de impresión configuradas". La nota queda **sin** marcar como
  procesada (no hay a dónde despachar) y sigue eliminable. (Config inválida, no flujo normal.)
- **Doble click / reintento**: la validación `!comandasProcessedAt` lo hace idempotente-seguro.
- **Eliminar tras procesar**: bloqueado en backend y oculto en UI.

## Verificación

- `pnpm --filter @trinity/api tsc` y typecheck web en 0 errores.
- Prueba manual (local con impresora/servidor de despacho):
  1. Crear NCV mercancía en DRAFT → se puede eliminar.
  2. Confirmar (POSTED) → sigue eliminable; aparece "Procesar comandas".
  3. Procesar → salen comandas "DEVOLUCIÓN" por área (con ítems sin área en la default);
     el botón se reemplaza por el badge; "Eliminar" desaparece; el backend rechaza el delete.
  4. Factura con un ítem cuya categoría no tiene área → ahora imprime en la default.

## Archivos afectados

- `packages/database/prisma/schema.prisma` + nueva migración + `deploy/fix-schema.sql`
- `apps/api/src/modules/print-jobs/print-area-grouping.ts` (nuevo)
- `apps/api/src/modules/invoices/invoices.service.ts` (usar helper)
- `apps/api/src/modules/credit-debit-notes/credit-debit-notes.service.ts` (`processComandas`, guarda `remove`)
- `apps/api/src/modules/credit-debit-notes/credit-debit-notes.controller.ts` (endpoint)
- `apps/api/src/modules/print-jobs/print-jobs.service.ts` (includes)
- `apps/api/src/modules/print-areas/` (service/dto/controller `isDefault`)
- `apps/web/src/components/print-monitor.tsx`
- `apps/web/src/app/(dashboard)/credit-debit-notes/[id]/page.tsx`
- `apps/web/src/app/(dashboard)/settings/print-areas/page.tsx`
- `apps/web/src/app/(dashboard)/commands/page.tsx`
