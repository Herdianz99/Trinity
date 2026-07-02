# Comandas de devolución (NCV) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que al "Procesar comandas" una devolución de venta (NCV mercancía) se encolen comandas de despacho por área, con un área por defecto como red de seguridad, y que la nota quede bloqueada para eliminar.

**Architecture:** Enfoque A — se reutiliza el pipeline de `PrintJob`/`PrintMonitor` ya existente. `PrintJob` pasa a apuntar opcionalmente a una nota (`creditDebitNoteId`) además de a una factura. Un helper compartido agrupa ítems por `category.printArea` con fallback al área `isDefault`. La generación es una acción nueva y separada de la impresión fiscal (que NO se toca).

**Tech Stack:** NestJS + Prisma (Postgres) en `apps/api`; Next.js 14 (App Router) en `apps/web`; monorepo pnpm.

**Nota sobre verificación:** el proyecto NO tiene tests automatizados (ni jest ni `.spec.ts`). La verificación establecida es **typecheck en 0 errores + prueba manual**. Este plan sigue ese patrón: cada tarea cierra con typecheck y commit; la prueba manual va al final.

**Comandos de verificación:**
- API: `pnpm --filter @trinity/api exec tsc --noEmit`
- Web: `pnpm --filter @trinity/web exec tsc --noEmit`
- BD local (Docker): contenedor `trinity-postgres-1`, base `trebol_db`, usuario `trebol`.

---

## Estructura de archivos

**Nuevos:**
- `packages/database/prisma/migrations/20260702170000_return_comandas/migration.sql`
- `apps/api/src/modules/print-jobs/print-area-grouping.ts` — helper compartido de agrupación.

**Modificados:**
- `packages/database/prisma/schema.prisma`
- `deploy/fix-schema.sql`
- `apps/api/src/modules/invoices/invoices.service.ts`
- `apps/api/src/modules/credit-debit-notes/credit-debit-notes.service.ts`
- `apps/api/src/modules/credit-debit-notes/credit-debit-notes.controller.ts`
- `apps/api/src/modules/print-jobs/print-jobs.service.ts`
- `apps/api/src/modules/print-areas/print-areas.service.ts`
- `apps/api/src/modules/print-areas/dto/update-print-area.dto.ts`
- `apps/web/src/app/(dashboard)/settings/print-areas/page.tsx`
- `apps/web/src/components/print-monitor.tsx`
- `apps/web/src/app/(dashboard)/credit-debit-notes/[id]/page.tsx`
- `apps/web/src/app/(dashboard)/commands/page.tsx`

---

## Task 1: Schema + migración + fix-schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260702170000_return_comandas/migration.sql`
- Modify: `deploy/fix-schema.sql`

- [ ] **Step 1: `PrintJob` — invoiceId opcional + relación a nota**

En `schema.prisma`, reemplazar el modelo `PrintJob` completo por:

```prisma
model PrintJob {
  id                String           @id @default(cuid())
  invoiceId         String?
  invoice           Invoice?         @relation(fields: [invoiceId], references: [id])
  creditDebitNoteId String?
  creditDebitNote   CreditDebitNote? @relation(fields: [creditDebitNoteId], references: [id])
  printAreaId       String
  printArea         PrintArea        @relation(fields: [printAreaId], references: [id])
  status            PrintStatus      @default(PENDING)
  items             Json
  isReprint         Boolean          @default(false)
  reprintOfId       String?
  failureReason     String?
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt
}
```

- [ ] **Step 2: `CreditDebitNote` — campos de proceso + relación inversa**

En el modelo `CreditDebitNote`, ubicar la línea `  items                CreditDebitNoteItem[]` y agregar **debajo**:

```prisma
  comandasProcessedAt   DateTime?
  comandasProcessedById String?
  printJobs             PrintJob[]
```

- [ ] **Step 3: `PrintArea` — flag por defecto**

En el modelo `PrintArea`, ubicar `  isActive    Boolean    @default(true)` y agregar **debajo**:

```prisma
  isDefault   Boolean    @default(false)
```

- [ ] **Step 4: Escribir la migración SQL**

Crear `packages/database/prisma/migrations/20260702170000_return_comandas/migration.sql`:

```sql
-- PrintJob: invoiceId opcional + FK opcional a la nota
ALTER TABLE "PrintJob" ALTER COLUMN "invoiceId" DROP NOT NULL;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "creditDebitNoteId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PrintJob_creditDebitNoteId_fkey'
  ) THEN
    ALTER TABLE "PrintJob"
      ADD CONSTRAINT "PrintJob_creditDebitNoteId_fkey"
      FOREIGN KEY ("creditDebitNoteId") REFERENCES "CreditDebitNote"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreditDebitNote: auditoría de procesado de comandas
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "comandasProcessedAt" TIMESTAMP(3);
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "comandasProcessedById" TEXT;

-- PrintArea: área por defecto
ALTER TABLE "PrintArea" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 5: Espejo en `deploy/fix-schema.sql`**

Agregar al final de `deploy/fix-schema.sql`:

```sql
-- =============================================================================
-- COMANDAS DE DEVOLUCION (Session 104)
-- PrintJob puede colgar de una nota (creditDebitNoteId); invoiceId opcional.
-- CreditDebitNote registra cuando se procesaron sus comandas (bloquea borrado).
-- PrintArea puede marcarse como "por defecto" (fallback de ruteo).
-- =============================================================================
ALTER TABLE "PrintJob" ALTER COLUMN "invoiceId" DROP NOT NULL;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "creditDebitNoteId" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PrintJob_creditDebitNoteId_fkey'
  ) THEN
    ALTER TABLE "PrintJob"
      ADD CONSTRAINT "PrintJob_creditDebitNoteId_fkey"
      FOREIGN KEY ("creditDebitNoteId") REFERENCES "CreditDebitNote"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "comandasProcessedAt" TIMESTAMP(3);
ALTER TABLE "CreditDebitNote" ADD COLUMN IF NOT EXISTS "comandasProcessedById" TEXT;
ALTER TABLE "PrintArea" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 6: Aplicar migración local + regenerar cliente**

Run:
```bash
pnpm --filter @trinity/database exec prisma migrate deploy
pnpm --filter @trinity/database exec prisma generate
```
Expected: "1 migration applied" (o "No pending migrations" si ya estaba) y "Generated Prisma Client".

Si `migrate deploy` reporta drift, aplicar el SQL directo y luego generar:
```bash
docker exec -i trinity-postgres-1 psql -U trebol -d trebol_db < packages/database/prisma/migrations/20260702170000_return_comandas/migration.sql
pnpm --filter @trinity/database exec prisma generate
```

- [ ] **Step 7: Verificar columnas en la BD**

Run:
```bash
docker exec trinity-postgres-1 psql -U trebol -d trebol_db -c "\d \"PrintJob\"" | grep creditDebitNoteId
docker exec trinity-postgres-1 psql -U trebol -d trebol_db -c "\d \"PrintArea\"" | grep isDefault
```
Expected: ambas columnas listadas.

- [ ] **Step 8: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260702170000_return_comandas deploy/fix-schema.sql
git commit -m "feat: Sesion 104 - schema comandas de devolucion (PrintJob->nota, PrintArea.isDefault)"
```

---

## Task 2: Helper compartido de agrupación + refactor de la factura

**Files:**
- Create: `apps/api/src/modules/print-jobs/print-area-grouping.ts`
- Modify: `apps/api/src/modules/invoices/invoices.service.ts:989-1021`

- [ ] **Step 1: Crear el helper**

Crear `apps/api/src/modules/print-jobs/print-area-grouping.ts`:

```typescript
import { Prisma } from '@prisma/client';

export interface ComandaItemInput {
  productId: string;
  productName: string;
  quantity: number;
}

export interface PrintAreaGroup {
  printAreaId: string;
  items: { code: string; supplierRef: string; name: string; quantity: number }[];
}

/**
 * Agrupa ítems por `category.printArea`. Los ítems cuya categoría no tiene área
 * caen en el área marcada `isDefault` (o, si no hay ninguna default, la primera
 * área existente). Devuelve [] solo si NO existe ninguna PrintArea en el sistema.
 * Se usa tanto al cobrar una factura como al procesar comandas de una devolución.
 */
export async function buildPrintAreaGroups(
  tx: Prisma.TransactionClient,
  items: ComandaItemInput[],
): Promise<PrintAreaGroup[]> {
  if (items.length === 0) return [];

  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    include: { category: { include: { printArea: true } } },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  // ¿Algún ítem sin área de categoría? Solo entonces resolvemos el fallback.
  const needFallback = items.some(
    (i) => !productMap.get(i.productId)?.category?.printAreaId,
  );
  let fallbackAreaId: string | null = null;
  if (needFallback) {
    const def = await tx.printArea.findFirst({ where: { isDefault: true } });
    fallbackAreaId =
      def?.id ??
      (await tx.printArea.findFirst({ orderBy: { createdAt: 'asc' } }))?.id ??
      null;
  }

  const groups: Record<string, PrintAreaGroup> = {};
  for (const item of items) {
    const product = productMap.get(item.productId);
    const areaId = product?.category?.printAreaId ?? fallbackAreaId;
    if (!areaId) continue; // no hay NINGUNA área en el sistema
    if (!groups[areaId]) groups[areaId] = { printAreaId: areaId, items: [] };
    groups[areaId].items.push({
      code: product?.code ?? '',
      supplierRef: product?.supplierRef ?? '',
      name: item.productName,
      quantity: item.quantity,
    });
  }
  return Object.values(groups);
}
```

- [ ] **Step 2: Importar el helper en `invoices.service.ts`**

Agregar junto a los demás imports del archivo:

```typescript
import { buildPrintAreaGroups } from '../print-jobs/print-area-grouping';
```

- [ ] **Step 3: Reemplazar el bloque inline de PrintJobs de la factura**

En `invoices.service.ts`, reemplazar el bloque actual (líneas ~989-1021, desde
`// Create PrintJobs grouped by print area` hasta el `for (const group ...) { ... }`
inclusive) por:

```typescript
      // Create PrintJobs grouped by print area (con fallback al área por defecto)
      const printGroups = await buildPrintAreaGroups(
        tx,
        invoice.items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
        })),
      );
      for (const group of printGroups) {
        await tx.printJob.create({
          data: {
            invoiceId: id,
            printAreaId: group.printAreaId,
            items: group.items,
          },
        });
      }
```

- [ ] **Step 4: Typecheck API**

Run: `pnpm --filter @trinity/api exec tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/print-jobs/print-area-grouping.ts apps/api/src/modules/invoices/invoices.service.ts
git commit -m "feat: Sesion 104 - helper de agrupacion por area con fallback + refactor factura"
```

---

## Task 3: Backend — acción "Procesar comandas" + bloqueo de borrado

**Files:**
- Modify: `apps/api/src/modules/credit-debit-notes/credit-debit-notes.service.ts`
- Modify: `apps/api/src/modules/credit-debit-notes/credit-debit-notes.controller.ts`

- [ ] **Step 1: Importar el helper en el service**

En `credit-debit-notes.service.ts`, agregar junto a los imports:

```typescript
import { buildPrintAreaGroups } from '../print-jobs/print-area-grouping';
```

- [ ] **Step 2: Agregar el método `processComandas`**

En la clase `CreditDebitNotesService`, agregar este método (por ejemplo, después de `post`):

```typescript
  // Encola comandas de despacho de una devolución de venta (NCV mercancía) por área.
  // NO imprime ni toca lo fiscal: solo crea PrintJobs que las PCs de despacho levantan
  // por su zona. Idempotente: si ya se procesaron, rechaza. Marca la nota para bloquear
  // su eliminación.
  async processComandas(id: string, userId: string) {
    const note = await this.prisma.creditDebitNote.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!note) throw new NotFoundException('Nota no encontrada');
    if (note.type !== 'NCV' || note.origin !== 'MERCHANDISE') {
      throw new BadRequestException(
        'Solo las devoluciones de venta de mercancía generan comandas',
      );
    }
    if (note.status !== 'POSTED') {
      throw new BadRequestException('Confirma la nota antes de procesar las comandas');
    }
    if (note.comandasProcessedAt) {
      throw new BadRequestException('Las comandas de esta nota ya fueron procesadas');
    }

    const zones = await this.prisma.$transaction(async (tx) => {
      const groups = await buildPrintAreaGroups(
        tx,
        note.items
          .filter((i) => i.productId)
          .map((i) => ({
            productId: i.productId as string,
            productName: i.productName,
            quantity: i.quantity,
          })),
      );
      for (const group of groups) {
        await tx.printJob.create({
          data: {
            creditDebitNoteId: id,
            printAreaId: group.printAreaId,
            items: group.items,
          },
        });
      }
      // Solo se marca procesada (y se bloquea el borrado) si de verdad salió algo.
      if (groups.length > 0) {
        await tx.creditDebitNote.update({
          where: { id },
          data: { comandasProcessedAt: new Date(), comandasProcessedById: userId },
        });
      }
      return groups.length;
    });

    return { zones };
  }
```

- [ ] **Step 3: Guardar el borrado tras procesar**

En el método `remove(id)`, ubicar la guarda existente:

```typescript
    if (note.fiscalPrinted) {
      throw new BadRequestException('No se puede eliminar: la nota ya fue impresa por la maquina fiscal');
    }
```

y agregar **inmediatamente debajo**:

```typescript
    if (note.comandasProcessedAt) {
      throw new BadRequestException('No se puede eliminar: ya se procesaron las comandas de despacho');
    }
```

- [ ] **Step 4: Endpoint en el controller**

En `credit-debit-notes.controller.ts`, agregar debajo del método `post`:

```typescript
  @Post(':id/process-comandas')
  processComandas(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.processComandas(id, userId);
  }
```

- [ ] **Step 5: Typecheck API**

Run: `pnpm --filter @trinity/api exec tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/credit-debit-notes/credit-debit-notes.service.ts apps/api/src/modules/credit-debit-notes/credit-debit-notes.controller.ts
git commit -m "feat: Sesion 104 - endpoint process-comandas + bloqueo de borrado tras procesar"
```

---

## Task 4: Backend — que las consultas de comandas incluyan la nota

**Files:**
- Modify: `apps/api/src/modules/print-jobs/print-jobs.service.ts`

- [ ] **Step 1: `findPending` incluye `creditDebitNote`**

En `findPending`, reemplazar el bloque `include: { ... }` por:

```typescript
      include: {
        invoice: {
          select: {
            id: true,
            number: true,
            customer: { select: { name: true } },
            seller: { select: { name: true } },
          },
        },
        creditDebitNote: {
          select: {
            id: true,
            number: true,
            invoice: {
              select: {
                number: true,
                customer: { select: { name: true } },
              },
            },
          },
        },
        printArea: { select: { id: true, name: true } },
      },
```

- [ ] **Step 2: `findAll` incluye `creditDebitNote`**

En `findAll`, reemplazar el bloque `include: { ... }` por:

```typescript
      include: {
        invoice: { select: { id: true, number: true } },
        creditDebitNote: { select: { id: true, number: true } },
        printArea: { select: { id: true, name: true } },
      },
```

- [ ] **Step 3: Typecheck API**

Run: `pnpm --filter @trinity/api exec tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/print-jobs/print-jobs.service.ts
git commit -m "feat: Sesion 104 - print-jobs incluye la nota de credito en las consultas"
```

---

## Task 5: Backend — área por defecto en print-areas

**Files:**
- Modify: `apps/api/src/modules/print-areas/dto/update-print-area.dto.ts`
- Modify: `apps/api/src/modules/print-areas/print-areas.service.ts:27-30`

- [ ] **Step 1: DTO acepta `isDefault`**

Reemplazar el contenido de `update-print-area.dto.ts` por:

```typescript
import { PartialType } from '@nestjs/swagger';
import { CreatePrintAreaDto } from './create-print-area.dto';
import { IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePrintAreaDto extends PartialType(CreatePrintAreaDto) {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
```

- [ ] **Step 2: `update` limpia el default anterior**

En `print-areas.service.ts`, reemplazar el método `update` por:

```typescript
  async update(id: string, dto: UpdatePrintAreaDto) {
    await this.findOne(id);
    // Solo puede haber una área por defecto: al marcar una, se limpian las demás.
    if (dto.isDefault === true) {
      return this.prisma.$transaction(async (tx) => {
        await tx.printArea.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
        return tx.printArea.update({ where: { id }, data: dto });
      });
    }
    return this.prisma.printArea.update({ where: { id }, data: dto });
  }
```

- [ ] **Step 3: Typecheck API**

Run: `pnpm --filter @trinity/api exec tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/print-areas/dto/update-print-area.dto.ts apps/api/src/modules/print-areas/print-areas.service.ts
git commit -m "feat: Sesion 104 - area de impresion por defecto (isDefault, unica)"
```

---

## Task 6: Frontend — toggle "por defecto" en Áreas de Impresión

**Files:**
- Modify: `apps/web/src/app/(dashboard)/settings/print-areas/page.tsx`

- [ ] **Step 1: Import del ícono `Star`**

En la línea de import de `lucide-react`, agregar `Star`:

```typescript
import {
  Printer, Plus, Edit2, Trash2, Loader2, X, ToggleLeft, ToggleRight, Star
} from 'lucide-react';
```

- [ ] **Step 2: `isDefault` en la interfaz**

En `interface PrintArea`, agregar debajo de `isActive: boolean;`:

```typescript
  isDefault: boolean;
```

- [ ] **Step 3: Handler para marcar por defecto**

Agregar esta función junto a `handleToggleActive`:

```typescript
  async function handleSetDefault(area: PrintArea) {
    if (area.isDefault) return;
    try {
      const res = await fetch(`/api/proxy/print-areas/${area.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      });
      if (res.ok) {
        fetchAreas();
        setMessage({ type: 'success', text: `"${area.name}" es ahora el área por defecto` });
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: err.message || 'Error al marcar por defecto' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error al marcar por defecto' });
    }
  }
```

- [ ] **Step 4: Badge "Por defecto" junto al nombre**

Reemplazar la celda del nombre:

```tsx
                  <td className="px-4 py-3 text-white font-medium">{area.name}</td>
```

por:

```tsx
                  <td className="px-4 py-3 text-white font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {area.name}
                      {area.isDefault && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Star size={10} className="fill-amber-400" /> Por defecto
                        </span>
                      )}
                    </span>
                  </td>
```

- [ ] **Step 5: Botón "marcar por defecto" en Acciones**

En el `<div>` de acciones (el que tiene los botones de toggle/editar/eliminar), agregar como
**primer** botón, antes del de activar/desactivar:

```tsx
                      <button
                        onClick={() => handleSetDefault(area)}
                        disabled={area.isDefault}
                        className={`p-1.5 rounded-lg transition-colors ${
                          area.isDefault
                            ? 'text-amber-400 cursor-default'
                            : 'hover:bg-slate-700 text-slate-400 hover:text-amber-400'
                        }`}
                        title={area.isDefault ? 'Área por defecto' : 'Marcar como área por defecto'}
                      >
                        <Star size={14} className={area.isDefault ? 'fill-amber-400' : ''} />
                      </button>
```

- [ ] **Step 6: Typecheck web**

Run: `pnpm --filter @trinity/web exec tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/(dashboard)/settings/print-areas/page.tsx"
git commit -m "feat: Sesion 104 - UI para marcar area de impresion por defecto"
```

---

## Task 7: Frontend — `PrintMonitor` dibuja la variante "DEVOLUCIÓN"

**Files:**
- Modify: `apps/web/src/components/print-monitor.tsx`

- [ ] **Step 1: Extender la interfaz `PrintJob`**

Reemplazar la interfaz `PrintJob` por:

```typescript
interface PrintJob {
  id: string;
  invoiceId: string | null;
  invoice: {
    number: string;
    customer?: { name: string } | null;
    seller?: { name: string } | null;
  } | null;
  creditDebitNote?: {
    number: string;
    invoice?: { number: string; customer?: { name: string } | null } | null;
  } | null;
  printAreaId: string;
  printArea: { name: string };
  status: string;
  items: PrintJobItem[];
  isReprint?: boolean;
  createdAt: string;
}
```

- [ ] **Step 2: Derivar labels en `buildTicketText` (camino del agente)**

Al **inicio** de `buildTicketText` (justo después de calcular `dateStr`/`timeStr`/`totalUnits`),
agregar:

```typescript
    const isReturn = !!job.creditDebitNote;
    const title = isReturn ? 'DEVOLUCION' : 'COMANDA';
    const docNumber = isReturn ? job.creditDebitNote!.number : (job.invoice?.number || 'S/N');
    const affectedInvoice = isReturn ? (job.creditDebitNote!.invoice?.number || '') : '';
    const customerName = isReturn
      ? (job.creditDebitNote!.invoice?.customer?.name || 'Contado')
      : (job.invoice?.customer?.name || 'Contado');
    const sellerName = isReturn ? '' : (job.invoice?.seller?.name || '');
    const signLabel = isReturn ? 'Recibido por (firma)' : 'Despachado por (firma)';
```

- [ ] **Step 3: Usar los labels en el cuerpo de `buildTicketText`**

Reemplazar el bloque que arma título, datos de factura y firma. Buscar desde
`lines.push('{{CENTER}}{{BIG}}COMANDA{{/BIG}}{{/CENTER}}');` hasta
`lines.push('{{BOLD}}Despachado por (firma){{/BOLD}}');` y reemplazar por:

```typescript
    // Encabezado: titulo + zona destacada
    lines.push(`{{CENTER}}{{BIG}}${title}{{/BIG}}{{/CENTER}}`);
    lines.push(`{{CENTER}}{{BOLD}}${job.printArea.name}{{/BOLD}}{{/CENTER}}`);
    lines.push('{{LINE}}');

    // Sello de reimpresion
    if (job.isReprint) {
      lines.push('{{CENTER}}{{BOLD}}** REIMPRESION **{{/BOLD}}{{/CENTER}}');
      lines.push('{{LINE}}');
    }

    // Datos del documento
    if (isReturn) {
      lines.push(`{{BOLD}}Nota: ${docNumber}{{/BOLD}}`);
      if (affectedInvoice) lines.push(`Factura afectada: ${affectedInvoice}`);
    } else {
      lines.push(`{{BOLD}}Factura: ${docNumber}{{/BOLD}}`);
    }
    lines.push(`${dateStr} ${timeStr}`);
    lines.push(`{{BOLD}}Cliente:{{/BOLD}} ${customerName}`);
    if (sellerName) {
      lines.push(`{{BOLD}}Vendedor:{{/BOLD}} ${sellerName}`);
    }
    lines.push('{{LINE}}');

    // Items
    for (const item of job.items) {
      const name = (item.name || 'Producto').toUpperCase();
      lines.push(`{{BOLD}}${item.quantity} x ${name}{{/BOLD}}`);
      const ref = item.supplierRef ? `  Ref: ${item.supplierRef}` : '';
      lines.push(`   Cod: ${item.code || '-'}${ref}`);
    }

    lines.push('{{LINE}}');
    lines.push(`{{BOLD}}Renglones: ${job.items.length}  |  Unidades: ${totalUnits}{{/BOLD}}`);

    // Firma
    lines.push('{{FEED:3}}');
    lines.push('________________________________');
    lines.push(`{{BOLD}}${signLabel}{{/BOLD}}`);
```

(Se mantienen intactas las líneas `{{FEED:1}}` y `{{CUT}}` que venían después.)

- [ ] **Step 4: Variante en el fallback HTML (`window.print()`)**

En el JSX del `currentJob` (el bloque `#print-ticket`), reemplazar el header. Buscar
`<div style={{ fontSize: '26px', ... }}>COMANDA</div>` y su contenedor hasta el div de
`Factura: {currentJob.invoice.number || 'S/N'}`, y reemplazar por:

```tsx
            <div style={{ fontSize: '26px', fontWeight: 'bold', letterSpacing: '2px' }}>
              {currentJob.creditDebitNote ? 'DEVOLUCION' : 'COMANDA'}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
              {currentJob.printArea.name}
            </div>
            {currentJob.isReprint && (
              <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '2px' }}>** REIMPRESION **</div>
            )}
            {currentJob.creditDebitNote ? (
              <>
                <div style={{ fontSize: '16px', marginTop: '4px' }}>Nota: {currentJob.creditDebitNote.number}</div>
                {currentJob.creditDebitNote.invoice?.number && (
                  <div style={{ fontSize: '13px' }}>Factura afectada: {currentJob.creditDebitNote.invoice.number}</div>
                )}
              </>
            ) : (
              <div style={{ fontSize: '16px', marginTop: '4px' }}>
                Factura: {currentJob.invoice?.number || 'S/N'}
              </div>
            )}
```

- [ ] **Step 5: Cliente/vendedor y firma en el HTML**

En el bloque de cliente/vendedor del HTML, reemplazar:

```tsx
            <div>Cliente: {currentJob.invoice?.customer?.name || 'Contado'}</div>
            {currentJob.invoice?.seller?.name && (
              <div>Vendedor: {currentJob.invoice.seller.name}</div>
            )}
```

por:

```tsx
            <div>Cliente: {(currentJob.creditDebitNote ? currentJob.creditDebitNote.invoice?.customer?.name : currentJob.invoice?.customer?.name) || 'Contado'}</div>
            {!currentJob.creditDebitNote && currentJob.invoice?.seller?.name && (
              <div>Vendedor: {currentJob.invoice.seller.name}</div>
            )}
```

Y en la sección de firma, reemplazar `Despachado por (firma)` por:

```tsx
              {currentJob.creditDebitNote ? 'Recibido por (firma)' : 'Despachado por (firma)'}
```

- [ ] **Step 6: Typecheck web**

Run: `pnpm --filter @trinity/web exec tsc --noEmit`
Expected: 0 errores. (Nota: `job.invoice` ahora es opcional; los accesos ya usan `?.`.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/print-monitor.tsx
git commit -m "feat: Sesion 104 - PrintMonitor dibuja comanda DEVOLUCION (agente + navegador)"
```

---

## Task 8: Frontend — botón "Procesar comandas" + indicador en la nota

**Files:**
- Modify: `apps/web/src/app/(dashboard)/credit-debit-notes/[id]/page.tsx`

- [ ] **Step 1: Campo `comandasProcessedAt` en la interfaz**

En `interface NoteDetail`, agregar debajo de `fiscalPrinted: boolean;`:

```typescript
  comandasProcessedAt: string | null;
```

- [ ] **Step 2: Estado + handler**

Junto a `const [posting, setPosting] = useState(false);`, agregar:

```typescript
  const [processingComandas, setProcessingComandas] = useState(false);
```

Y agregar este handler junto a `handlePost`:

```typescript
  async function handleProcessComandas() {
    if (!confirm('¿Procesar las comandas de despacho de esta devolución? Se enviarán a las áreas de impresión y la nota ya no se podrá eliminar.')) return;
    setProcessingComandas(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/credit-debit-notes/${id}/process-comandas`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Error al procesar comandas');
      if ((data.zones ?? 0) === 0) {
        setMessage({ type: 'error', text: 'No hay áreas de impresión configuradas; no se generaron comandas' });
      } else {
        setMessage({ type: 'success', text: `Comandas enviadas a ${data.zones} área(s) de despacho` });
      }
      fetchNote();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessingComandas(false);
    }
  }
```

- [ ] **Step 3: Bloquear borrado en el cliente**

Reemplazar la línea de `canDelete`:

```typescript
  const canDelete = note.status !== 'CANCELLED' && !note.fiscalPrinted && !note.appliedAt && (note.paidAmountUsd || 0) === 0;
```

por:

```typescript
  const canDelete = note.status !== 'CANCELLED' && !note.fiscalPrinted && !note.comandasProcessedAt && !note.appliedAt && (note.paidAmountUsd || 0) === 0;
```

- [ ] **Step 4: Botón + badge en el header de acciones**

Dentro del bloque `{note.status === 'POSTED' && ( <> ... </> )}`, agregar **antes** del botón
"Imprimir PDF":

```tsx
              {note.type === 'NCV' && note.origin === 'MERCHANDISE' && !note.comandasProcessedAt && (
                <button onClick={handleProcessComandas} disabled={processingComandas} className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 transition-colors">
                  {processingComandas ? <Loader2 className="animate-spin" size={14} /> : <Printer size={14} />} Procesar comandas
                </button>
              )}
              {note.type === 'NCV' && note.origin === 'MERCHANDISE' && note.comandasProcessedAt && (
                <span className="text-xs px-2.5 py-1 rounded-full border text-blue-400 border-blue-500/30 bg-blue-500/10 flex items-center gap-1">
                  <CheckCircle size={12} /> Comandas procesadas
                </span>
              )}
```

- [ ] **Step 5: Typecheck web**

Run: `pnpm --filter @trinity/web exec tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(dashboard)/credit-debit-notes/[id]/page.tsx"
git commit -m "feat: Sesion 104 - boton Procesar comandas + badge + bloqueo de borrado en la nota"
```

---

## Task 9: Frontend — Control de Comandas tolera jobs de nota

**Files:**
- Modify: `apps/web/src/app/(dashboard)/commands/page.tsx`

- [ ] **Step 1: Extender la interfaz `PrintJob`**

Reemplazar la interfaz `PrintJob` por:

```typescript
interface PrintJob {
  id: string;
  invoiceId: string | null;
  invoice: { id: string; number: string | null } | null;
  creditDebitNote?: { id: string; number: string } | null;
  printArea: { id: string; name: string };
  status: 'PENDING' | 'PRINTING' | 'PRINTED' | 'FAILED';
  items: { code: string; name: string; quantity: number }[];
  isReprint: boolean;
  failureReason: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Mostrar N° de nota cuando el job es de devolución**

Reemplazar la celda del documento:

```tsx
                    <td className="px-4 py-3 font-medium text-white">{job.invoice.number || 'S/N'}</td>
```

por:

```tsx
                    <td className="px-4 py-3 font-medium text-white">
                      {job.creditDebitNote ? (
                        <span className="inline-flex items-center gap-1.5">
                          {job.creditDebitNote.number}
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">DEVOL.</span>
                        </span>
                      ) : (
                        job.invoice?.number || 'S/N'
                      )}
                    </td>
```

- [ ] **Step 3: La reimpresión solo aplica a jobs de factura**

La reimpresión existente es por factura (`reprintByInvoice`); un job de nota no tiene
`invoiceId`. Reemplazar el botón Reimprimir por una versión que se desactiva en jobs de nota:

```tsx
                      {job.invoiceId ? (
                        <button
                          onClick={() => handleReprint(job)}
                          disabled={reprinting === job.invoiceId}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {reprinting === job.invoiceId ? (
                            <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                          ) : (
                            <RotateCw size={13} />
                          )}
                          Reimprimir
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
```

- [ ] **Step 4: Ajustar `handleReprint` para tipar el job**

En `handleReprint`, la primera línea usa `job.invoice.number`. Reemplazar la referencia
`job.invoice.number` por `job.invoice?.number` en el `confirm(...)` de esa función.

- [ ] **Step 5: Typecheck web**

Run: `pnpm --filter @trinity/web exec tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(dashboard)/commands/page.tsx"
git commit -m "feat: Sesion 104 - Control de Comandas muestra jobs de devolucion"
```

---

## Task 10: Prueba manual + documentación

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Levantar el sistema local**

API y web corriendo (Postgres/Redis en Docker ya arriba). Ver que el API compiló sin errores.

- [ ] **Step 2: Configurar un área por defecto**

En Configuración → Áreas de Impresión, marcar una con la estrella. Verificar que al marcar
otra, la anterior se desmarca (solo una queda "Por defecto").

- [ ] **Step 3: Flujo de la devolución**

1. Crear una NCV de mercancía (DRAFT) → verificar que aparece "Eliminar".
2. Confirmar la nota (POSTED) → sigue "Eliminar"; aparece "Procesar comandas".
3. Click "Procesar comandas" → toast "Comandas enviadas a N área(s)"; el botón se reemplaza
   por el badge "Comandas procesadas"; "Eliminar" desaparece.
4. Intentar borrar por API (`DELETE /credit-debit-notes/:id`) → 400 "ya se procesaron las
   comandas de despacho".
5. Volver a "Procesar comandas" (recargando) → ya no está disponible; por API el endpoint
   responde 400 "ya fueron procesadas".

- [ ] **Step 4: Verificar el ticket**

Con una PC configurada a una zona (o el fallback `window.print()`), verificar que la comanda
sale con título **DEVOLUCION**, N° de nota, "Factura afectada", y firma **"Recibido por"**.
Un producto sin área de categoría debe salir en el área por defecto.

- [ ] **Step 5: Verificar factura (regresión del fallback)**

Cobrar una factura con al menos un producto cuya categoría NO tenga área → su comanda ahora
debe salir en el área por defecto (antes no salía).

- [ ] **Step 6: Actualizar PROGRESS.md**

Agregar al inicio (antes de la Sesión 103) una entrada "## Sesion 104 (2026-07-02) — Comandas
de devolución (NCV)" resumiendo: paso separado "Procesar comandas" (exige POSTED), bloqueo de
borrado, área por defecto (aplica a devoluciones y facturas), `PrintJob` polimórfico, y que NO
se tocó la impresión fiscal. Marcar como PENDIENTE DEPLOY.

- [ ] **Step 7: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: Sesion 104 - comandas de devolucion (resumen y pruebas)"
```

---

## Checklist de cobertura del spec

- Modelo `PrintJob` polimórfico + `CreditDebitNote.comandasProcessedAt` + `PrintArea.isDefault` → Task 1.
- Helper de agrupación con fallback + refactor factura (aplica a facturas) → Task 2.
- Endpoint `process-comandas` (NCV/MERCHANDISE, POSTED, idempotente) + bloqueo de borrado → Task 3.
- Consultas de comandas incluyen la nota → Task 4.
- Área por defecto única (backend) → Task 5; (frontend) → Task 6.
- Variante "DEVOLUCIÓN" en ambos caminos de impresión → Task 7.
- Botón/badge/bloqueo en la nota → Task 8.
- Control de Comandas tolera jobs de nota → Task 9.
- Prueba manual + regresión de factura + docs → Task 10.
