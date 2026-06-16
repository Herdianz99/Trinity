# Control de Comandas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una página completa "Control de Comandas" (gateada por permiso) para ver comandas pendientes/fallidas y reimprimir por factura, con detección automática de fallos de impresión.

**Architecture:** Se amplía el ciclo de vida de `PrintJob` (`PENDING → PRINTING → PRINTED/FAILED`) para que un fallo de impresión deje de ser invisible. El monitor existente reporta éxito/fallo al backend. Una página nueva lista y filtra comandas; "reimprimir" clona la(s) comanda(s) de una factura como registros nuevos `PENDING` que las PCs de cada zona vuelven a imprimir por su polling normal. Acceso por permiso de sección `commands`.

**Tech Stack:** NestJS + Prisma 5 (API), Next.js App Router + React client components + Tailwind (web), PostgreSQL.

**Nota sobre pruebas:** El proyecto no tiene framework de tests (sin `test` script, sin `.spec.ts`, sin jest). La verificación de cada tarea es **build/typecheck + prueba manual con la app corriendo**, que es el patrón real del proyecto. No se inventan tests automatizados.

**Convenciones del proyecto a respetar (de CLAUDE.md):**
- Migraciones con `IF NOT EXISTS` / `ADD VALUE IF NOT EXISTS`; reflejar columnas nuevas en `deploy/fix-schema.sql`.
- Transacción Prisma para operaciones multi-tabla (la reimpresión multi-zona).
- `document.title` con patrón `'... | Trinity ERP'`.
- Fechas backend con `setUTCHours`; fechas locales frontend con `getFullYear()/getMonth()/getDate()`, nunca `toISOString()`.
- Commits: `tipo: Session X - descripción`. (Usar la sesión que corresponda; aquí se asume **Session 58**.)
- NO usar `taskkill`. Para puertos: `npx kill-port 4000 3000`.

---

## File Structure

**API (`apps/api`)**
- Modify: `apps/api/src/modules/print-jobs/print-jobs.service.ts` — `claim` → `PRINTING`; `markFailed`; `findPending` filtra `PENDING`; `findAll` con filtros; `reprintByInvoice`.
- Modify: `apps/api/src/modules/print-jobs/print-jobs.controller.ts` — endpoints nuevos (`markFailed`, `findAll`, `reprint`).
- Create: `apps/api/src/modules/print-jobs/dto/list-print-jobs.dto.ts` — query params del listado.

**Base de datos (`packages/database`)**
- Modify: `packages/database/prisma/schema.prisma` — enum `PrintStatus` (+`PRINTING`); modelo `PrintJob` (+`updatedAt`, `isReprint`, `reprintOfId`, `failureReason`).
- Create: `packages/database/prisma/migrations/20260616000000_print_jobs_control/migration.sql`.
- Modify: `deploy/fix-schema.sql` — red de seguridad para las columnas/valor nuevos.

**Web (`apps/web`)**
- Modify: `apps/web/src/components/print-monitor.tsx` — reportar `markPrinted`/`markFailed`; sello "REIMPRESIÓN"; traer `isReprint`.
- Create: `apps/web/src/app/(dashboard)/commands/page.tsx` — la página Control de Comandas.
- Modify: `apps/web/src/components/sidebar.tsx` — sección "COMANDAS" con permiso `commands`.
- Modify: `apps/web/src/app/(dashboard)/settings/role-permissions/page.tsx` — módulo `commands` en `MODULE_GROUPS`.

El proxy `apps/web/src/app/api/proxy/[...path]/route.ts` es genérico (passthrough) — **no se modifica**; los endpoints nuevos quedan disponibles automáticamente bajo `/api/proxy/print-jobs/...`.

---

## Task 1: Schema y migración (`PrintJob`)

**Files:**
- Modify: `packages/database/prisma/schema.prisma:1286-1301`
- Create: `packages/database/prisma/migrations/20260616000000_print_jobs_control/migration.sql`
- Modify: `deploy/fix-schema.sql`

- [ ] **Step 1: Agregar `PRINTING` al enum `PrintStatus`**

En `packages/database/prisma/schema.prisma`, el enum actual es:

```prisma
enum PrintStatus {
  PENDING
  PRINTED
  FAILED
}
```

Déjalo así (agrega `PRINTING` entre `PENDING` y `PRINTED`):

```prisma
enum PrintStatus {
  PENDING
  PRINTING
  PRINTED
  FAILED
}
```

- [ ] **Step 2: Agregar campos nuevos al modelo `PrintJob`**

El modelo actual:

```prisma
model PrintJob {
  id          String      @id @default(cuid())
  invoiceId   String
  invoice     Invoice     @relation(fields: [invoiceId], references: [id])
  printAreaId String
  printArea   PrintArea   @relation(fields: [printAreaId], references: [id])
  status      PrintStatus @default(PENDING)
  items       Json
  createdAt   DateTime    @default(now())
}
```

Reemplázalo por:

```prisma
model PrintJob {
  id            String      @id @default(cuid())
  invoiceId     String
  invoice       Invoice     @relation(fields: [invoiceId], references: [id])
  printAreaId   String
  printArea     PrintArea   @relation(fields: [printAreaId], references: [id])
  status        PrintStatus @default(PENDING)
  items         Json
  isReprint     Boolean     @default(false)
  reprintOfId   String?
  failureReason String?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
}
```

- [ ] **Step 3: Crear la migración SQL manual (idempotente)**

Crea el archivo `packages/database/prisma/migrations/20260616000000_print_jobs_control/migration.sql` con:

```sql
-- Nuevo valor del enum
ALTER TYPE "PrintStatus" ADD VALUE IF NOT EXISTS 'PRINTING';

-- Columnas nuevas en PrintJob
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "isReprint" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "reprintOfId" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

-- Backfill de updatedAt para filas existentes y luego enforce NOT NULL
UPDATE "PrintJob" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "PrintJob" ALTER COLUMN "updatedAt" SET NOT NULL;
```

> Nota: `ADD VALUE` a un enum no puede ir dentro de la misma transacción que usa ese valor; aquí no se usa, así que es seguro. Postgres ejecuta cada statement por separado.

- [ ] **Step 4: Reflejar en `deploy/fix-schema.sql` (red de seguridad)**

Añade al final de `deploy/fix-schema.sql` el mismo bloque idempotente (sin el `ALTER ... SET NOT NULL` final, para no fallar si hay filas sin backfill en un estado intermedio):

```sql
-- Control de Comandas (Session 58)
ALTER TYPE "PrintStatus" ADD VALUE IF NOT EXISTS 'PRINTING';
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "isReprint" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "reprintOfId" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "PrintJob" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
```

- [ ] **Step 5: Aplicar la migración en local y regenerar el cliente**

Run:
```bash
pnpm --filter @trinity/database migrate
pnpm --filter @trinity/database generate
```
Expected: la migración `20260616000000_print_jobs_control` aparece como aplicada y el cliente Prisma se regenera sin errores. Si el seed falla con P2022, aplicar `deploy/fix-schema.sql` (ver memoria del proyecto `local-setup-fix-schema`).

- [ ] **Step 6: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260616000000_print_jobs_control deploy/fix-schema.sql
git commit -m "feat(db): Session 58 - PrintJob estados PRINTING + campos de reimpresion"
```

---

## Task 2: Backend — service, controller y DTO

**Files:**
- Create: `apps/api/src/modules/print-jobs/dto/list-print-jobs.dto.ts`
- Modify: `apps/api/src/modules/print-jobs/print-jobs.service.ts`
- Modify: `apps/api/src/modules/print-jobs/print-jobs.controller.ts`

- [ ] **Step 1: Crear el DTO del listado**

Crea `apps/api/src/modules/print-jobs/dto/list-print-jobs.dto.ts`:

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ListPrintJobsDto {
  @ApiPropertyOptional({ description: 'Fecha desde (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'Fecha hasta (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ description: 'Id de la zona/area de impresion' })
  @IsOptional()
  @IsString()
  printAreaId?: string;

  @ApiPropertyOptional({ description: 'Estado: PENDING | PRINTING | PRINTED | FAILED' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Numero de factura (busqueda parcial)' })
  @IsOptional()
  @IsString()
  invoiceNumber?: string;
}
```

- [ ] **Step 2: Reescribir el service**

Reemplaza el contenido completo de `apps/api/src/modules/print-jobs/print-jobs.service.ts` por:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ListPrintJobsDto } from './dto/list-print-jobs.dto';

@Injectable()
export class PrintJobsService {
  constructor(private readonly prisma: PrismaService) {}

  async findPending(printAreaId: string) {
    return this.prisma.printJob.findMany({
      where: {
        printAreaId,
        status: 'PENDING',
      },
      include: {
        invoice: { select: { id: true, number: true } },
        printArea: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markPrinted(id: string) {
    const job = await this.prisma.printJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Trabajo de impresion no encontrado');

    return this.prisma.printJob.update({
      where: { id },
      data: { status: 'PRINTED' },
    });
  }

  async markFailed(id: string, reason?: string) {
    const job = await this.prisma.printJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Trabajo de impresion no encontrado');

    return this.prisma.printJob.update({
      where: { id },
      data: {
        status: 'FAILED',
        failureReason: reason?.slice(0, 500) ?? null,
      },
    });
  }

  /**
   * Reserva atomica de una comanda: solo tiene exito si seguia PENDING.
   * Pasa la comanda a PRINTING. Si varias pestanas/PCs de la misma zona
   * consultan a la vez, solo UNA obtiene count === 1; las demas reciben
   * false y no imprimen. Asi se evita la impresion duplicada.
   */
  async claim(id: string): Promise<{ claimed: boolean }> {
    const result = await this.prisma.printJob.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'PRINTING' },
    });
    return { claimed: result.count === 1 };
  }

  async findAll(query: ListPrintJobsDto) {
    const where: any = {};

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        const f = new Date(query.from);
        f.setUTCHours(0, 0, 0, 0);
        where.createdAt.gte = f;
      }
      if (query.to) {
        const t = new Date(query.to);
        t.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = t;
      }
    }

    if (query.printAreaId) where.printAreaId = query.printAreaId;
    if (query.status) where.status = query.status;
    if (query.invoiceNumber) {
      where.invoice = {
        number: { contains: query.invoiceNumber, mode: 'insensitive' },
      };
    }

    return this.prisma.printJob.findMany({
      where,
      include: {
        invoice: { select: { id: true, number: true } },
        printArea: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  /**
   * Reimprime TODAS las comandas de una factura. Por cada zona toma la comanda
   * mas reciente y crea un clon nuevo (isReprint=true, status=PENDING) que la
   * PC de esa zona imprimira en su siguiente poll. Devuelve cuantas zonas se
   * reencolaron. Multi-tabla -> transaccion.
   */
  async reprintByInvoice(invoiceId: string): Promise<{ zones: number }> {
    const jobs = await this.prisma.printJob.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
    });

    if (jobs.length === 0) {
      throw new NotFoundException('Esta factura no tiene comandas');
    }

    // Una comanda (la mas reciente) por zona
    const byArea = new Map<string, (typeof jobs)[number]>();
    for (const job of jobs) {
      if (!byArea.has(job.printAreaId)) byArea.set(job.printAreaId, job);
    }

    const originals = Array.from(byArea.values());

    await this.prisma.$transaction(
      originals.map((job) =>
        this.prisma.printJob.create({
          data: {
            invoiceId: job.invoiceId,
            printAreaId: job.printAreaId,
            items: job.items as any,
            isReprint: true,
            reprintOfId: job.id,
            status: 'PENDING',
          },
        }),
      ),
    );

    return { zones: originals.length };
  }
}
```

- [ ] **Step 3: Reescribir el controller**

Reemplaza el contenido completo de `apps/api/src/modules/print-jobs/print-jobs.controller.ts` por:

```typescript
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrintJobsService } from './print-jobs.service';
import { ListPrintJobsDto } from './dto/list-print-jobs.dto';

@ApiTags('Print Jobs')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('print-jobs')
export class PrintJobsController {
  constructor(private readonly service: PrintJobsService) {}

  @Get()
  findAll(@Query() query: ListPrintJobsDto) {
    return this.service.findAll(query);
  }

  @Get('pending')
  findPending(@Query('printAreaId') printAreaId: string) {
    return this.service.findPending(printAreaId);
  }

  @Patch(':id/printed')
  markPrinted(@Param('id') id: string) {
    return this.service.markPrinted(id);
  }

  @Patch(':id/failed')
  markFailed(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.service.markFailed(id, body?.reason);
  }

  @Patch(':id/claim')
  claim(@Param('id') id: string) {
    return this.service.claim(id);
  }

  @Post('reprint/:invoiceId')
  reprint(@Param('invoiceId') invoiceId: string) {
    return this.service.reprintByInvoice(invoiceId);
  }
}
```

> Nota de routing: `@Get('pending')` se declara después de `@Get()`; en NestJS el orden no afecta porque las rutas son exactas (`/print-jobs` vs `/print-jobs/pending`). El `@Post('reprint/:invoiceId')` no choca con `:id` porque está bajo el segmento literal `reprint`.

- [ ] **Step 4: Verificar que el API compila (typecheck/build)**

Run:
```bash
pnpm --filter @trinity/api build
```
Expected: build sin errores de TypeScript. Si Prisma se queja de tipos (`isReprint`, etc.), confirmar que se corrió `pnpm --filter @trinity/database generate` en la Task 1.

- [ ] **Step 5: Prueba manual rápida de los endpoints**

Levanta el API (`pnpm --filter @trinity/api dev`) y, con un token válido, verifica:
```bash
# Listado (debe responder 200 con un array)
curl -s "http://localhost:4000/print-jobs?status=PENDING" -H "Authorization: Bearer <TOKEN>"
```
Expected: array JSON (vacío o con comandas). El endpoint `reprint/:invoiceId` se probará de punta a punta en la Task 4.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/print-jobs
git commit -m "feat(api): Session 58 - listado, markFailed y reimpresion de comandas"
```

---

## Task 3: Monitor de impresión — reportar resultado y sello REIMPRESIÓN

**Files:**
- Modify: `apps/web/src/components/print-monitor.tsx`

- [ ] **Step 1: Agregar `isReprint` a la interfaz `PrintJob`**

En `apps/web/src/components/print-monitor.tsx`, la interfaz (líneas ~12-21) debe incluir el campo nuevo:

```typescript
interface PrintJob {
  id: string;
  invoiceId: string;
  invoice: { number: string };
  printAreaId: string;
  printArea: { name: string };
  status: string;
  items: PrintJobItem[];
  isReprint?: boolean;
  createdAt: string;
}
```

- [ ] **Step 2: Helpers para reportar al backend**

Justo después de `claimJob` (≈línea 51), agrega dos helpers:

```typescript
  const reportPrinted = useCallback(async (jobId: string) => {
    try {
      await fetch(`/api/proxy/print-jobs/${jobId}/printed`, { method: 'PATCH' });
    } catch {}
  }, []);

  const reportFailed = useCallback(async (jobId: string, reason: string) => {
    try {
      await fetch(`/api/proxy/print-jobs/${jobId}/failed`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
    } catch {}
  }, []);
```

- [ ] **Step 3: Sello "REIMPRESIÓN" en el ticket del agente**

En `buildTicketText`, justo después de la línea del título COMANDA / zona (después de `lines.push('{{LINE}}');` que sigue a la zona, ≈línea 68), inserta:

```typescript
    if (job.isReprint) {
      lines.push('{{CENTER}}{{BOLD}}** REIMPRESION **{{/BOLD}}{{/CENTER}}');
      lines.push('{{LINE}}');
    }
```

- [ ] **Step 4: Conectar el resultado real de impresión en `handlePrint`**

`handlePrint` recibe `job: PrintJob`. Modifica el bloque del agente y el fallback para reportar. El bloque del agente queda así (reemplaza el `try { ... } catch {}` de las líneas ≈96-109):

```typescript
    // Try printing via Trinity Agent first
    try {
      const { isAgentRunning, printTicket } = await import('@/lib/trinity-agent');
      const agentUp = await isAgentRunning();
      if (agentUp) {
        const content = buildTicketText(job);
        const printed = await printTicket(content);
        if (printed) {
          await reportPrinted(job.id);
          isPrinting.current = false;
          setPrinting(false);
          return;
        }
        // El agente estaba arriba pero la impresion fallo (papel, impresora, etc.)
        await reportFailed(job.id, 'El agente reporto error al imprimir (revise papel/impresora)');
        isPrinting.current = false;
        setPrinting(false);
        return;
      }
    } catch {}

    // Fallback: use window.print() (sin garantia de exito real -> se marca PRINTED)
    setCurrentJob(job);
    await new Promise((resolve) => setTimeout(resolve, 100));
    window.print();
    await reportPrinted(job.id);

    setCurrentJob(null);
    isPrinting.current = false;
    setPrinting(false);
```

Actualiza el array de dependencias del `useCallback` de `handlePrint` para incluir los nuevos helpers:

```typescript
  }, [buildTicketText, reportPrinted, reportFailed]);
```

> Importante: con esto, `claim` deja la comanda en `PRINTING`, y `handlePrint` la mueve a `PRINTED` o `FAILED`. La comanda nunca se queda en `PRINTING` salvo que el navegador se cierre a mitad — ese caso queda visible como "imprimiendo" en la pantalla de control, que es el comportamiento correcto.

- [ ] **Step 5: Verificar build del web**

Run:
```bash
pnpm --filter @trinity/web build
```
Expected: build sin errores de TypeScript/ESLint.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/print-monitor.tsx
git commit -m "feat(web): Session 58 - monitor reporta impresion/fallo y sello REIMPRESION"
```

---

## Task 4: Página Control de Comandas

**Files:**
- Create: `apps/web/src/app/(dashboard)/commands/page.tsx`

- [ ] **Step 1: Crear la página**

Crea `apps/web/src/app/(dashboard)/commands/page.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, RotateCw, Search, Printer } from 'lucide-react';

interface PrintArea {
  id: string;
  name: string;
}

interface PrintJob {
  id: string;
  invoiceId: string;
  invoice: { id: string; number: string | null };
  printArea: { id: string; name: string };
  status: 'PENDING' | 'PRINTING' | 'PRINTED' | 'FAILED';
  items: { code: string; name: string; quantity: number }[];
  isReprint: boolean;
  failureReason: string | null;
  createdAt: string;
}

const STATUS_META: Record<string, { label: string; cls: string; rank: number }> = {
  FAILED:   { label: 'Fallida',     cls: 'bg-red-500/15 text-red-400 border-red-500/30',       rank: 0 },
  PENDING:  { label: 'En cola',     cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',  rank: 1 },
  PRINTING: { label: 'Imprimiendo', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30',     rank: 2 },
  PRINTED:  { label: 'Impresa',     cls: 'bg-green-500/15 text-green-400 border-green-500/30',   rank: 3 },
};

const REFRESH_MS = 10000;

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function CommandsPage() {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [areas, setAreas] = useState<PrintArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(todayLocal());
  const [to, setTo] = useState(todayLocal());
  const [areaId, setAreaId] = useState('');
  const [status, setStatus] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [reprinting, setReprinting] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { document.title = 'Control de Comandas | Trinity ERP'; }, []);

  useEffect(() => {
    fetch('/api/proxy/print-areas')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: PrintArea[]) => setAreas(data))
      .catch(() => {});
  }, []);

  const fetchJobs = useCallback(async () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (areaId) params.set('printAreaId', areaId);
    if (status) params.set('status', status);
    if (invoiceNumber.trim()) params.set('invoiceNumber', invoiceNumber.trim());

    try {
      const res = await fetch(`/api/proxy/print-jobs?${params.toString()}`);
      if (res.ok) {
        const data: PrintJob[] = await res.json();
        // Fallidas y pendientes primero; dentro, mas recientes primero
        data.sort((a, b) => {
          const r = STATUS_META[a.status].rank - STATUS_META[b.status].rank;
          if (r !== 0) return r;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        setJobs(data);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [from, to, areaId, status, invoiceNumber]);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  async function handleReprint(job: PrintJob) {
    const ok = window.confirm(
      `Reimprimir la factura ${job.invoice.number || 'S/N'}? Se enviara a todas sus zonas.`,
    );
    if (!ok) return;

    setReprinting(job.invoiceId);
    try {
      const res = await fetch(`/api/proxy/print-jobs/reprint/${job.invoiceId}`, {
        method: 'POST',
      });
      if (res.ok) {
        const data: { zones: number } = await res.json();
        setToast(`Reimpresion enviada a ${data.zones} zona(s). Saldra en la(s) impresora(s) de despacho.`);
        fetchJobs();
      } else {
        setToast('No se pudo reimprimir. Intenta de nuevo.');
      }
    } catch {
      setToast('Error de conexion al reimprimir.');
    } finally {
      setReprinting(null);
    }
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString('es-VE', { hour12: false });
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <ClipboardList size={22} className="text-green-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Control de Comandas</h1>
          <p className="text-sm text-slate-400">
            Revisa el estado de las comandas y reimprime las que no salieron
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-4 mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Desde</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="w-full input" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Hasta</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="w-full input" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Zona</label>
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className="w-full input">
            <option value="">Todas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Estado</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full input">
            <option value="">Todos</option>
            <option value="FAILED">Fallida</option>
            <option value="PENDING">En cola</option>
            <option value="PRINTING">Imprimiendo</option>
            <option value="PRINTED">Impresa</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Factura</label>
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="N. de factura" className="w-full input pl-8" />
          </div>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-green-500 border-t-transparent rounded-full" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          No hay comandas para los filtros seleccionados.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-left">
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Factura</th>
                <th className="px-4 py-3 font-medium">Zona</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Hora</th>
                <th className="px-4 py-3 font-medium text-right">Accion</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const meta = STATUS_META[job.status];
                const units = job.items.reduce((s, i) => s + (i.quantity || 0), 0);
                return (
                  <tr key={job.id} className="border-b border-slate-800 hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${meta.cls}`}>
                        {meta.label}
                      </span>
                      {job.isReprint && (
                        <span className="ml-1.5 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                          REIMP.
                        </span>
                      )}
                      {job.status === 'FAILED' && job.failureReason && (
                        <p className="text-[11px] text-red-400/80 mt-1">{job.failureReason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-white">{job.invoice.number || 'S/N'}</td>
                    <td className="px-4 py-3 text-slate-300">{job.printArea.name}</td>
                    <td className="px-4 py-3 text-slate-300">{job.items.length} reng. / {units} und.</td>
                    <td className="px-4 py-3 text-slate-400">{formatTime(job.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleReprint(job)}
                        disabled={reprinting === job.invoiceId}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium btn-primary disabled:opacity-50"
                      >
                        {reprinting === job.invoiceId ? (
                          <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                        ) : (
                          <RotateCw size={13} />
                        )}
                        Reimprimir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 text-sm font-medium shadow-2xl backdrop-blur-sm">
          <Printer size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
```

> Nota: las clases `card`, `input`, `btn-primary` son utilidades ya usadas en otras páginas del proyecto (ver `role-permissions/page.tsx`). Si `input` no existiera como clase utilitaria, replicar las clases de un `<input>` existente de otra página de formulario.

- [ ] **Step 2: Verificar build del web**

Run:
```bash
pnpm --filter @trinity/web build
```
Expected: build sin errores. La ruta `/commands` queda generada.

- [ ] **Step 3: Prueba manual de punta a punta**

Con API + web corriendo (`pnpm dev` o cada uno) y sesión iniciada:
1. Navega a `http://localhost:3000/commands`.
2. Verifica que carga comandas del día. Cobra una factura de prueba con productos de una zona con área de impresión → debe aparecer una comanda.
3. Pulsa "Reimprimir" en una fila → confirma → debe aparecer el toast con el número de zonas y, segundos después, una nueva fila marcada **REIMP.** en estado "En cola" (y luego "Impresa"/"Fallida" según el agente).
4. Si la factura tiene 2 zonas, verifica que la reimpresión crea una comanda nueva por **cada** zona.

Expected: el flujo completo funciona; la reimpresión sale en la(s) impresora(s) de despacho con el sello REIMPRESIÓN.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(dashboard)/commands/page.tsx"
git commit -m "feat(web): Session 58 - pagina Control de Comandas"
```

---

## Task 5: Menú y permiso de sección `commands`

**Files:**
- Modify: `apps/web/src/components/sidebar.tsx`
- Modify: `apps/web/src/app/(dashboard)/settings/role-permissions/page.tsx:35-54`

- [ ] **Step 1: Importar el icono en el sidebar**

En `apps/web/src/components/sidebar.tsx`, asegúrate de que `ClipboardList` esté en el import de `lucide-react` (junto a los demás iconos, p. ej. donde se importan `Banknote`, `Package`, etc.). Si no está, agrégalo:

```typescript
import { /* ...iconos existentes..., */ ClipboardList } from 'lucide-react';
```

- [ ] **Step 2: Agregar la sección COMANDAS al menú**

En el array `menuSections` (≈línea 65), agrega una sección nueva justo **después** del bloque `sales` (después de su `},` de cierre, ≈línea 79):

```typescript
  {
    key: 'commands',
    label: 'COMANDAS',
    icon: <ClipboardList size={20} />,
    permission: 'commands',
    items: [
      { label: 'Control de Comandas', href: '/commands', icon: <ClipboardList size={18} /> },
    ],
  },
```

- [ ] **Step 3: Agregar el módulo `commands` a Permisos por rol**

En `apps/web/src/app/(dashboard)/settings/role-permissions/page.tsx`, dentro de `MODULE_GROUPS`, grupo `'Acceso a Modulos'` (≈líneas 38-53), agrega el ítem después de `{ key: 'sales', label: 'Ventas y POS' }`:

```typescript
      { key: 'commands', label: 'Control de Comandas' },
```

- [ ] **Step 4: Verificar build del web**

Run:
```bash
pnpm --filter @trinity/web build
```
Expected: build sin errores.

- [ ] **Step 5: Prueba manual del permiso**

1. Como ADMIN: la sección "COMANDAS" aparece en el menú y `/commands` es accesible.
2. En *Configuración → Permisos por rol*, activa "Control de Comandas" para otro rol (p. ej. SUPERVISOR), guarda; tras el próximo login de ese rol, debe ver la sección.
3. Un rol sin el permiso `commands` NO ve la sección en el menú.

Expected: el gating por permiso de sección funciona igual que los demás módulos.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/sidebar.tsx "apps/web/src/app/(dashboard)/settings/role-permissions/page.tsx"
git commit -m "feat(web): Session 58 - menu COMANDAS y permiso de seccion commands"
```

---

## Task 6: Cierre — build completo, docs y push

**Files:**
- Modify: `PROGRESS.md`
- Modify: `PROJECT.md`

- [ ] **Step 1: Build completo del monorepo**

Run:
```bash
pnpm build
```
Expected: `turbo build` verde en `@trinity/api` y `@trinity/web`.

- [ ] **Step 2: Actualizar PROGRESS.md y PROJECT.md**

Agrega en `PROGRESS.md` la entrada de la sesión (Control de Comandas: estados PRINTING/FAILED, detección de fallos, página y reimpresión por factura, permiso `commands`). En `PROJECT.md` documenta el módulo nuevo y el permiso de sección `commands` si hay una lista de módulos/permiso. Sigue el estilo/formato existente de ambos archivos (leerlos antes de editar).

- [ ] **Step 3: Commit y push**

```bash
git add PROGRESS.md PROJECT.md
git commit -m "docs: Session 58 - Control de Comandas (estados, reimpresion, permiso)"
git push origin main
```
Expected: push correcto a GitHub.

- [ ] **Step 4: Recordatorio de deploy (lo hace el usuario)**

El deploy lo ejecuta Diego (ver memoria `deploy-lo-hace-el-usuario`). Antes de avisar que está listo para deploy, correr el **pre-deploy checklist** de CLAUDE.md: confirmar que están commiteados schema, migración, `deploy/fix-schema.sql`, DTO, controller, service, módulo, página y `sidebar.tsx`. El comando de deploy es:
```
ssh root@134.209.220.233 "cd /opt/Trinity && git pull origin main && bash deploy.sh"
```
La migración con `ADD VALUE IF NOT EXISTS` + el bloque en `fix-schema.sql` cubren la columna/valor nuevos en producción.

---

## Self-Review (cobertura del spec)

- **Estados PENDING/PRINTING/PRINTED/FAILED** → Task 1 (enum) + Task 2 (`claim`→PRINTING, `markFailed`) + Task 3 (monitor reporta). ✅
- **Campos isReprint/reprintOfId/failureReason/updatedAt** → Task 1. ✅
- **Detección automática de fallos** → Task 3, Step 4 (agente arriba pero `printed===false` → `markFailed`). ✅
- **window.print() sin garantía → PRINTED** → Task 3, Step 4. ✅
- **Listado con filtros (fecha/zona/estado/factura)** → Task 2 (`findAll`) + Task 4 (UI). ✅
- **Reimpresión por factura abanicando a todas las zonas** → Task 2 (`reprintByInvoice`, una por zona, transacción) + Task 4 (botón). ✅
- **Sello REIMPRESIÓN en el ticket** → Task 3, Step 3. ✅
- **Vista por defecto hoy + fallidas/pendientes arriba** → Task 4 (`todayLocal`, sort por rank). ✅
- **Página completa en menú + permiso `commands`** → Task 4 + Task 5. ✅
- **Reglas del proyecto** (IF NOT EXISTS, fix-schema, setUTCHours, fechas locales, document.title, transacción, commits con sesión, push, deploy del usuario) → repartidas y explícitas. ✅

Sin placeholders. Nombres consistentes entre tareas (`markFailed`, `reprintByInvoice`, `isReprint`, `reprintOfId`, `failureReason`, permiso `commands`, ruta `/commands`).
