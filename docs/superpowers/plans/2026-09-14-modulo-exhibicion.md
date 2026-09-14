# Módulo de Exhibición — Plan de Implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para seguimiento.

**Goal:** Construir un módulo independiente para controlar qué artículos están exhibidos y cuáles no, con bitácora de puestas/retiros y un reporte por rango de fechas con KPIs y export PDF/Excel.

**Architecture:** Módulo NestJS nuevo `exhibition` (patrón de `damage-reports`), protegido por el permiso de rol `exhibicion`. Estado actual en 3 campos nuevos de `Product` (reusa el buscador de productos) + tabla append-only `ExhibitionEntry` para la bitácora. Frontend en `/exhibition` con pestañas "Exhibición" (control) y "Reporte". No toca stock ni ventas.

**Tech Stack:** NestJS + Prisma (Postgres), Next.js (App Router) + React + Tailwind, `xlsx` (Excel), `pdfkit`/patrón PDF existente, helpers de zona horaria Caracas.

**Nota sobre verificación:** el repo **no tiene suite de tests** (sin script `test`, sin `.spec.ts`). Cada tarea se verifica con **`tsc --noEmit`** y **prueba manual/e2e en local** (el sistema ya corre en local: API `:4000`, web `:3000`, BD `grande_db` en Docker). Esta es la práctica establecida del proyecto.

**Spec de referencia:** `docs/superpowers/specs/2026-09-14-modulo-exhibicion-design.md`

**Regla de commits (CLAUDE.md):** `tipo: Session 126 - descripción`, y terminar el mensaje con la línea `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. NO desplegar; solo commit + push cuando el usuario lo indique.

---

## Task 1: Schema Prisma + migración (estado en Product + tabla ExhibitionEntry)

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (modelo `Product`, modelo `User`, + nuevos `ExhibitionEntry`, `enum ExhibitionAction`, `enum ExhibitionReason`)
- Create: `packages/database/prisma/migrations/20260914170000_modulo_exhibicion/migration.sql`

- [ ] **Step 1: Agregar los 3 campos de estado al modelo `Product`**

En `packages/database/prisma/schema.prisma`, dentro de `model Product { ... }`, junto a `showInStore`, agregar:

```prisma
  isExhibited        Boolean                  @default(false)
  exhibitedSince     DateTime?
  exhibitionLocation String?
  exhibitionEntries  ExhibitionEntry[]
```

- [ ] **Step 2: Agregar la relación inversa al modelo `User`**

En `model User { ... }`, agregar junto a las demás relaciones:

```prisma
  exhibitionEntries  ExhibitionEntry[]
```

- [ ] **Step 3: Agregar el modelo y los enums al final de la sección de modelos**

En `packages/database/prisma/schema.prisma` (al final del archivo, junto a otros modelos/enums):

```prisma
enum ExhibitionAction {
  PLACED
  REMOVED
}

enum ExhibitionReason {
  SOLD
  DAMAGED
  ROTATION
  OTHER
}

model ExhibitionEntry {
  id          String            @id @default(cuid())
  productId   String
  product     Product           @relation(fields: [productId], references: [id])
  action      ExhibitionAction
  location    String?
  reason      ExhibitionReason?
  note        String?
  createdAt   DateTime          @default(now())
  createdById String
  createdBy   User              @relation(fields: [createdById], references: [id])

  @@index([createdAt])
  @@index([productId])
  @@index([action])
}
```

- [ ] **Step 4: Crear la migración SQL idempotente**

Crear `packages/database/prisma/migrations/20260914170000_modulo_exhibicion/migration.sql`:

```sql
-- Estado de exhibicion en Product (aditivo, idempotente)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isExhibited" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "exhibitedSince" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "exhibitionLocation" TEXT;

-- Enums (guardados por si ya existen)
DO $$ BEGIN
  CREATE TYPE "ExhibitionAction" AS ENUM ('PLACED', 'REMOVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ExhibitionReason" AS ENUM ('SOLD', 'DAMAGED', 'ROTATION', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Bitacora
CREATE TABLE IF NOT EXISTS "ExhibitionEntry" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "action" "ExhibitionAction" NOT NULL,
  "location" TEXT,
  "reason" "ExhibitionReason",
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "ExhibitionEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExhibitionEntry_createdAt_idx" ON "ExhibitionEntry"("createdAt");
CREATE INDEX IF NOT EXISTS "ExhibitionEntry_productId_idx" ON "ExhibitionEntry"("productId");
CREATE INDEX IF NOT EXISTS "ExhibitionEntry_action_idx" ON "ExhibitionEntry"("action");

DO $$ BEGIN
  ALTER TABLE "ExhibitionEntry" ADD CONSTRAINT "ExhibitionEntry_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ExhibitionEntry" ADD CONSTRAINT "ExhibitionEntry_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
```

- [ ] **Step 5: Generar el cliente Prisma y aplicar en local**

Run:
```bash
pnpm --filter @trinity/database generate
export DATABASE_URL="postgresql://trebol:trebol_secret_2024@localhost:5432/grande_db?schema=public"
pnpm --filter @trinity/database exec prisma migrate deploy
```
Expected: migración `20260914170000_modulo_exhibicion` aplicada; `prisma generate` sin errores.

- [ ] **Step 6: Verificar columnas y tabla en la BD local**

Run:
```bash
docker exec -e PGPASSWORD='trebol_secret_2024' trinity-postgres-1 psql -U trebol -d grande_db -c "\d \"ExhibitionEntry\"" -c "SELECT column_name FROM information_schema.columns WHERE table_name='Product' AND column_name IN ('isExhibited','exhibitedSince','exhibitionLocation');"
```
Expected: la tabla `ExhibitionEntry` existe con sus columnas; las 3 columnas nuevas de `Product` aparecen.

- [ ] **Step 7: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260914170000_modulo_exhibicion/migration.sql
git commit -m "feat: Session 126 - Exhibicion: schema (Product state + ExhibitionEntry)"
```

---

## Task 2: DTOs del módulo

**Files:**
- Create: `apps/api/src/modules/exhibition/dto/place-item.dto.ts`
- Create: `apps/api/src/modules/exhibition/dto/remove-item.dto.ts`
- Create: `apps/api/src/modules/exhibition/dto/query-products.dto.ts`
- Create: `apps/api/src/modules/exhibition/dto/query-activity.dto.ts`

- [ ] **Step 1: `place-item.dto.ts`**

```typescript
import { IsString, IsOptional } from 'class-validator';

export class PlaceItemDto {
  @IsString()
  productId: string;

  @IsOptional()
  @IsString()
  location?: string;
}
```

- [ ] **Step 2: `remove-item.dto.ts`**

```typescript
import { IsString, IsOptional, IsIn } from 'class-validator';

export class RemoveItemDto {
  @IsString()
  productId: string;

  @IsOptional()
  @IsIn(['SOLD', 'DAMAGED', 'ROTATION', 'OTHER'])
  reason?: 'SOLD' | 'DAMAGED' | 'ROTATION' | 'OTHER';

  @IsOptional()
  @IsString()
  note?: string;
}
```

- [ ] **Step 3: `query-products.dto.ts`** (lista con estado + filtros)

```typescript
import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class QueryProductsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsString()
  location?: string;

  // OJO: enableImplicitConversion convierte "true"->true por el tipo boolean,
  // por eso hay que aceptar ambos (mismo bug/fix de query-payables/receivables).
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  exhibited?: boolean;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number;
}
```

- [ ] **Step 4: `query-activity.dto.ts`** (reporte por rango)

```typescript
import { IsOptional, IsString, IsIn, IsDateString } from 'class-validator';

export class QueryActivityDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['PLACED', 'REMOVED'])
  action?: 'PLACED' | 'REMOVED';

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  brandId?: string;
}
```

- [ ] **Step 5: Typecheck y commit**

```bash
pnpm --filter @trinity/api exec tsc --noEmit
git add apps/api/src/modules/exhibition/dto
git commit -m "feat: Session 126 - Exhibicion: DTOs"
```
Expected typecheck: EXIT 0.

---

## Task 3: Servicio principal (place / remove / products / history)

**Files:**
- Create: `apps/api/src/modules/exhibition/exhibition.service.ts`

- [ ] **Step 1: Crear el servicio con los métodos de control y listado**

```typescript
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';
import { PlaceItemDto } from './dto/place-item.dto';
import { RemoveItemDto } from './dto/remove-item.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { QueryActivityDto } from './dto/query-activity.dto';

@Injectable()
export class ExhibitionService {
  constructor(private readonly prisma: PrismaService) {}

  // Lista productos con su estado de exhibicion + filtros (reusa el patron de products)
  async findProducts(query: QueryProductsDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: Prisma.ProductWhereInput = { isActive: true };

    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.brandId) where.brandId = query.brandId;
    if (query.exhibited !== undefined) where.isExhibited = query.exhibited;
    if (query.location) {
      where.exhibitionLocation = { contains: query.location, mode: 'insensitive' };
    }
    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
        { barcode: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        select: {
          id: true, code: true, name: true, barcode: true,
          isExhibited: true, exhibitedSince: true, exhibitionLocation: true,
          category: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
        },
        orderBy: [{ isExhibited: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    const now = Date.now();
    const data = rows.map((p) => ({
      ...p,
      daysExhibited: p.exhibitedSince
        ? Math.floor((now - new Date(p.exhibitedSince).getTime()) / 86400000)
        : null,
    }));

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // Poner en exhibicion
  async place(dto: PlaceItemDto, userId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    if (product.isExhibited) throw new BadRequestException('El producto ya esta en exhibicion');

    const location = dto.location?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: dto.productId },
        data: { isExhibited: true, exhibitedSince: new Date(), exhibitionLocation: location },
      });
      return tx.exhibitionEntry.create({
        data: { productId: dto.productId, action: 'PLACED', location, createdById: userId },
      });
    });
  }

  // Retirar de exhibicion
  async remove(dto: RemoveItemDto, userId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    if (!product.isExhibited) throw new BadRequestException('El producto no esta en exhibicion');

    const prevLocation = product.exhibitionLocation;

    return this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: dto.productId },
        data: { isExhibited: false, exhibitedSince: null, exhibitionLocation: null },
      });
      return tx.exhibitionEntry.create({
        data: {
          productId: dto.productId,
          action: 'REMOVED',
          location: prevLocation,
          reason: dto.reason ?? null,
          note: dto.note?.trim() || null,
          createdById: userId,
        },
      });
    });
  }

  // Historial completo de un producto
  async history(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, code: true, name: true, isExhibited: true, exhibitionLocation: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const entries = await this.prisma.exhibitionEntry.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, name: true } } },
    });

    return { product, entries };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @trinity/api exec tsc --noEmit`
Expected: EXIT 0 (habrá referencias a métodos de activity/summary que se agregan en la Task 4; si tsc marca solo eso, continuar — se completan antes del controller). Si prefieres 0 limpio, agrega la Task 4 antes de compilar el controller (Task 6).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/exhibition/exhibition.service.ts
git commit -m "feat: Session 126 - Exhibicion: service (place/remove/products/history)"
```

---

## Task 4: Servicio — reporte de actividad + KPIs

**Files:**
- Modify: `apps/api/src/modules/exhibition/exhibition.service.ts` (agregar 2 métodos a la clase)

- [ ] **Step 1: Agregar `activity()` y `summary()` a la clase `ExhibitionService`**

Agregar estos métodos dentro de la clase (antes del cierre `}`):

```typescript
  // Construye el rango de fechas Caracas para createdAt (timestamp)
  private dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!from && !to) return undefined;
    const range: Prisma.DateTimeFilter = {};
    if (from) range.gte = caracasDayStart(from);
    if (to) range.lte = caracasDayEnd(to);
    return range;
  }

  // Reporte: toda la actividad (puestas + retiros) del rango
  async activity(query: QueryActivityDto) {
    const where: Prisma.ExhibitionEntryWhereInput = {};
    const range = this.dateRange(query.from, query.to);
    if (range) where.createdAt = range;
    if (query.action) where.action = query.action;
    if (query.categoryId) where.product = { categoryId: query.categoryId };
    if (query.brandId) {
      where.product = { ...(where.product as object), brandId: query.brandId };
    }

    const entries = await this.prisma.exhibitionEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true } },
        product: {
          select: {
            id: true, code: true, name: true,
            category: { select: { name: true } },
            brand: { select: { name: true } },
          },
        },
      },
    });

    return entries;
  }

  // KPIs del rango
  async summary(query: QueryActivityDto) {
    const range = this.dateRange(query.from, query.to);
    const rangeWhere: Prisma.ExhibitionEntryWhereInput = range ? { createdAt: range } : {};

    const [currentlyExhibited, placedCount, removedCount, exhibitedProducts, topRaw] =
      await Promise.all([
        this.prisma.product.count({ where: { isExhibited: true, isActive: true } }),
        this.prisma.exhibitionEntry.count({ where: { ...rangeWhere, action: 'PLACED' } }),
        this.prisma.exhibitionEntry.count({ where: { ...rangeWhere, action: 'REMOVED' } }),
        this.prisma.product.findMany({
          where: { isExhibited: true, isActive: true },
          select: { exhibitedSince: true },
        }),
        this.prisma.exhibitionEntry.groupBy({
          by: ['productId'],
          where: { ...rangeWhere, action: 'PLACED' },
          _count: { productId: true },
          orderBy: { _count: { productId: 'desc' } },
          take: 5,
        }),
      ]);

    // Tiempo promedio en exhibicion (dias) de los actualmente exhibidos
    const now = Date.now();
    const days = exhibitedProducts
      .filter((p) => p.exhibitedSince)
      .map((p) => (now - new Date(p.exhibitedSince as Date).getTime()) / 86400000);
    const avgDaysExhibited =
      days.length > 0 ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : 0;

    // Nombres de los top
    const topIds = topRaw.map((t) => t.productId);
    const topProducts = topIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: topIds } },
          select: { id: true, code: true, name: true },
        })
      : [];
    const top = topRaw.map((t) => ({
      product: topProducts.find((p) => p.id === t.productId) || null,
      placedCount: t._count.productId,
    }));

    return { currentlyExhibited, placedCount, removedCount, avgDaysExhibited, top };
  }
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @trinity/api exec tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/exhibition/exhibition.service.ts
git commit -m "feat: Session 126 - Exhibicion: reporte de actividad + KPIs"
```

---

## Task 5: Servicio de export (PDF + Excel)

**Files:**
- Create: `apps/api/src/modules/exhibition/exhibition-report.service.ts`

Sigue el patrón de `payables-pdf.service.ts` (usa `xlsx` para Excel y `pdfkit` para PDF; confirmar el import de PDF que use ese servicio y replicarlo).

- [ ] **Step 1: Revisar el patrón de PDF existente**

Run:
```bash
sed -n '1,40p' apps/api/src/modules/payables/payables-pdf.service.ts
```
Expected: ver cómo importa PDFKit/`xlsx` y arma el documento; replicar ese estilo exacto abajo.

- [ ] **Step 2: Crear `exhibition-report.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import { caracasParts } from '../../common/timezone';

type ActivityRow = {
  createdAt: Date;
  action: 'PLACED' | 'REMOVED';
  location: string | null;
  reason: string | null;
  createdBy: { name: string } | null;
  product: { code: string; name: string; category: { name: string } | null } | null;
};

const ACTION_LABEL: Record<string, string> = { PLACED: 'Puesto', REMOVED: 'Retirado' };
const REASON_LABEL: Record<string, string> = {
  SOLD: 'Vendido', DAMAGED: 'Dañado', ROTATION: 'Rotación', OTHER: 'Otro',
};

@Injectable()
export class ExhibitionReportService {
  private fmtDate(d: Date): string {
    const { ymd, hour } = caracasParts(new Date(d));
    const hh = String(hour).padStart(2, '0');
    return `${ymd} ${hh}:00`;
  }

  buildXlsx(rows: ActivityRow[]): Buffer {
    const aoa = [
      ['Fecha', 'Código', 'Artículo', 'Categoría', 'Acción', 'Ubicación', 'Motivo', 'Usuario'],
      ...rows.map((r) => [
        this.fmtDate(r.createdAt),
        r.product?.code ?? '',
        r.product?.name ?? '',
        r.product?.category?.name ?? '',
        ACTION_LABEL[r.action] ?? r.action,
        r.location ?? '',
        r.reason ? (REASON_LABEL[r.reason] ?? r.reason) : '',
        r.createdBy?.name ?? '',
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Exhibición');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  buildPdf(rows: ActivityRow[]): Promise<Buffer> {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      doc.fontSize(14).text('Reporte de Exhibición', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(8);
      rows.forEach((r) => {
        const line = [
          this.fmtDate(r.createdAt),
          r.product?.code ?? '',
          (r.product?.name ?? '').slice(0, 40),
          ACTION_LABEL[r.action] ?? r.action,
          r.location ?? '',
          r.reason ? (REASON_LABEL[r.reason] ?? r.reason) : '',
          r.createdBy?.name ?? '',
        ].join('  |  ');
        doc.text(line);
      });
      if (rows.length === 0) doc.text('Sin actividad en el rango seleccionado.');
      doc.end();
    });
  }
}
```

> Si `payables-pdf.service.ts` NO usa `pdfkit` sino otra librería (ej. `pdfmake`), reemplazar el bloque `buildPdf` por el estilo exacto de ese servicio (mismo import y API). Verificarlo en el Step 1.

- [ ] **Step 3: Typecheck y commit**

```bash
pnpm --filter @trinity/api exec tsc --noEmit
git add apps/api/src/modules/exhibition/exhibition-report.service.ts
git commit -m "feat: Session 126 - Exhibicion: export PDF/Excel"
```
Expected typecheck: EXIT 0.

---

## Task 6: Controller + módulo + registro en app.module

**Files:**
- Create: `apps/api/src/modules/exhibition/exhibition.controller.ts`
- Create: `apps/api/src/modules/exhibition/exhibition.module.ts`
- Modify: `apps/api/src/app.module.ts` (import + agregar a `imports`)

- [ ] **Step 1: Crear `exhibition.controller.ts`**

```typescript
import { Controller, Get, Post, Body, Param, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { ExhibitionService } from './exhibition.service';
import { ExhibitionReportService } from './exhibition-report.service';
import { PlaceItemDto } from './dto/place-item.dto';
import { RemoveItemDto } from './dto/remove-item.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { QueryActivityDto } from './dto/query-activity.dto';

@ApiTags('exhibition')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('exhibicion')
@Controller('exhibition')
export class ExhibitionController {
  constructor(
    private readonly service: ExhibitionService,
    private readonly report: ExhibitionReportService,
  ) {}

  @Get('products')
  findProducts(@Query() query: QueryProductsDto) {
    return this.service.findProducts(query);
  }

  @Post('place')
  place(@Body() dto: PlaceItemDto, @CurrentUser() user: { id: string }) {
    return this.service.place(dto, user.id);
  }

  @Post('remove')
  remove(@Body() dto: RemoveItemDto, @CurrentUser() user: { id: string }) {
    return this.service.remove(dto, user.id);
  }

  @Get('activity')
  activity(@Query() query: QueryActivityDto) {
    return this.service.activity(query);
  }

  @Get('summary')
  summary(@Query() query: QueryActivityDto) {
    return this.service.summary(query);
  }

  @Get('products/:id/history')
  history(@Param('id') id: string) {
    return this.service.history(id);
  }

  @Get('activity/xlsx')
  async xlsx(@Query() query: QueryActivityDto, @Res() res: Response) {
    const rows = await this.service.activity(query);
    const buffer = this.report.buildXlsx(rows as any);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="exhibicion.xlsx"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('activity/pdf')
  async pdf(@Query() query: QueryActivityDto, @Res() res: Response) {
    const rows = await this.service.activity(query);
    const buffer = await this.report.buildPdf(rows as any);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="exhibicion.pdf"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
```

> Nota de orden de rutas: `activity/xlsx` y `activity/pdf` son estáticas y no colisionan con `products/:id/history`. Mantener `products/:id/history` con su prefijo `products/` evita choque con `activity`.

- [ ] **Step 2: Crear `exhibition.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ExhibitionService } from './exhibition.service';
import { ExhibitionReportService } from './exhibition-report.service';
import { ExhibitionController } from './exhibition.controller';

@Module({
  controllers: [ExhibitionController],
  providers: [ExhibitionService, ExhibitionReportService],
})
export class ExhibitionModule {}
```

> `PrismaService` se inyecta vía el `PrismaModule` global del proyecto (igual que `damage-reports`, que no lo importa explícitamente). Si en el proyecto `PrismaModule` NO es global, agregar `imports: [PrismaModule]`. Verificar mirando `damage-reports.module.ts` (no lo importa → es global).

- [ ] **Step 3: Registrar en `app.module.ts`**

En `apps/api/src/app.module.ts`, junto a `import { DamageReportsModule } ...`:

```typescript
import { ExhibitionModule } from './modules/exhibition/exhibition.module';
```

Y en el array `imports: [ ... ]`, junto a `DamageReportsModule,`:

```typescript
    ExhibitionModule,
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @trinity/api exec tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 5: Verificar rutas montadas (API corriendo en local)**

Run:
```bash
grep -E "ExhibitionController|/exhibition" /c/Users/Diego/Desktop/Trinity/_dev-api-test.log | tail -10
```
Expected: ver rutas `Mapped {/exhibition/products, GET}`, `/exhibition/place POST`, etc. (nest watch recompila al guardar). Si el dev no está corriendo, arrancarlo como en la sesión (`cd apps/api && pnpm dev`).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/exhibition/exhibition.controller.ts apps/api/src/modules/exhibition/exhibition.module.ts apps/api/src/app.module.ts
git commit -m "feat: Session 126 - Exhibicion: controller + registro del modulo"
```

---

## Task 7: Permisos del módulo (`exhibicion`)

**Files:**
- Modify: `apps/api/src/modules/role-permissions/role-permissions.service.ts` (`VALID_MODULES`)
- Modify: `apps/api/src/modules/auth/role-permissions.ts` (defaults por rol)
- Modify: `apps/web/src/app/(dashboard)/settings/role-permissions/page.tsx` (`MODULE_GROUPS`)

- [ ] **Step 1: Agregar `'exhibicion'` a `VALID_MODULES`**

En `apps/api/src/modules/role-permissions/role-permissions.service.ts`, en el array `VALID_MODULES`, agregar `'exhibicion'` junto a `'almacen'`:

```typescript
  'users', 'settings', 'expenses', 'payment-schedules', 'store', 'payroll', 'incidents', 'divisas', 'bancos', 'almacen', 'exhibicion',
```

- [ ] **Step 2: Agregar a los defaults de rol**

En `apps/api/src/modules/auth/role-permissions.ts`, agregar `'exhibicion'` a `SUPERVISOR` y `WAREHOUSE` (ADMIN ya tiene `*`):

```typescript
  SUPERVISOR: ['dashboard', 'sales', 'quotations', 'catalog', 'inventory', 'purchases', 'pedidos', 'cash', 'receivables', 'payables', 'expenses', 'payment-schedules', 'fiscal', 'incidents', 'bancos', 'exhibicion', 'RETURN_INVOICE', 'CREDIT_NOTE_SALE', 'DEBIT_NOTE_SALE', 'RETURN_PURCHASE', 'CREDIT_NOTE_PURCHASE', 'DEBIT_NOTE_PURCHASE', 'MANAGE_EXPENSES'],
```

```typescript
  WAREHOUSE: ['dashboard', 'inventory-consult', 'almacen', 'exhibicion'],
```

- [ ] **Step 3: Agregar el checkbox en la UI de permisos**

En `apps/web/src/app/(dashboard)/settings/role-permissions/page.tsx`, en `MODULE_GROUPS` → grupo `'Acceso a Modulos'`, junto a la línea de `almacen`:

```typescript
      { key: 'almacen', label: 'Almacén (5S + reporte de daños)' },
      { key: 'exhibicion', label: 'Exhibición' },
```

- [ ] **Step 4: Typecheck (API + web) y commit**

```bash
pnpm --filter @trinity/api exec tsc --noEmit
pnpm --filter web exec tsc --noEmit
git add apps/api/src/modules/role-permissions/role-permissions.service.ts apps/api/src/modules/auth/role-permissions.ts "apps/web/src/app/(dashboard)/settings/role-permissions/page.tsx"
git commit -m "feat: Session 126 - Exhibicion: permiso de rol 'exhibicion'"
```
Expected typecheck: EXIT 0 en ambos.

---

## Task 8: Sidebar — sección "EXHIBICIÓN"

**Files:**
- Modify: `apps/web/src/components/sidebar.tsx`

- [ ] **Step 1: Asegurar el import del ícono**

En `apps/web/src/components/sidebar.tsx`, verificar que `Store` (o el ícono elegido) esté importado de `lucide-react`. Si no, agregarlo al import existente de `lucide-react` (ej. `Store`).

- [ ] **Step 2: Agregar la sección al array `menuSections`**

Junto a la sección `almacen` (usar el mismo shape), agregar:

```tsx
  {
    key: 'exhibicion',
    label: 'EXHIBICIÓN',
    icon: <Store size={20} />,
    permission: 'exhibicion',
    items: [
      { label: 'Exhibición', href: '/exhibition', icon: <Store size={18} /> },
      { label: 'Reporte', href: '/exhibition/reporte', icon: <BarChart3 size={18} /> },
    ],
  },
```

> `BarChart3` ya está importado (lo usan otras secciones). Confirmar con un grep si hay duda.

- [ ] **Step 3: Typecheck y commit**

```bash
pnpm --filter web exec tsc --noEmit
git add apps/web/src/components/sidebar.tsx
git commit -m "feat: Session 126 - Exhibicion: seccion en el menu"
```
Expected typecheck: EXIT 0.

---

## Task 9: Página de control `/exhibition`

**Files:**
- Create: `apps/web/src/app/(dashboard)/exhibition/page.tsx`

Reusa el proxy `/api/proxy/...` (patrón de todas las páginas). Buscador + filtros + toggle poner/retirar con modal de motivo. (El escaneo de barras se agrega en la Task 11 para no mezclar responsabilidades.)

- [ ] **Step 1: Crear la página con la lista y las acciones**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Store, Search, Plus, X, Loader2, History } from 'lucide-react';

interface Prod {
  id: string;
  code: string;
  name: string;
  barcode: string | null;
  isExhibited: boolean;
  exhibitedSince: string | null;
  exhibitionLocation: string | null;
  daysExhibited: number | null;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
}

const REASONS = [
  { value: 'SOLD', label: 'Vendido' },
  { value: 'DAMAGED', label: 'Dañado' },
  { value: 'ROTATION', label: 'Rotación' },
  { value: 'OTHER', label: 'Otro' },
];

export default function ExhibitionPage() {
  const [rows, setRows] = useState<Prod[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [exhibitedFilter, setExhibitedFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  // Modal poner
  const [placeTarget, setPlaceTarget] = useState<Prod | null>(null);
  const [placeLocation, setPlaceLocation] = useState('');
  // Modal retirar
  const [removeTarget, setRemoveTarget] = useState<Prod | null>(null);
  const [removeReason, setRemoveReason] = useState('OTHER');
  const [removeNote, setRemoveNote] = useState('');

  useEffect(() => { document.title = 'Exhibición | Trinity ERP'; }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '50');
      if (search) params.set('search', search);
      if (exhibitedFilter === 'yes') params.set('exhibited', 'true');
      if (exhibitedFilter === 'no') params.set('exhibited', 'false');
      const res = await fetch(`/api/proxy/exhibition/products?${params}`);
      const data = await res.json();
      setRows(data.data || []);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar artículos' });
    } finally {
      setLoading(false);
    }
  }, [search, exhibitedFilter]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 4000); return () => clearTimeout(t); }
  }, [message]);

  async function confirmPlace() {
    if (!placeTarget) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/proxy/exhibition/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: placeTarget.id, location: placeLocation || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Error');
      setMessage({ type: 'success', text: 'Artículo puesto en exhibición' });
      setPlaceTarget(null); setPlaceLocation('');
      await fetchRows();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally { setProcessing(false); }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/proxy/exhibition/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: removeTarget.id, reason: removeReason, note: removeNote || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Error');
      setMessage({ type: 'success', text: 'Artículo retirado de exhibición' });
      setRemoveTarget(null); setRemoveReason('OTHER'); setRemoveNote('');
      await fetchRows();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally { setProcessing(false); }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <Store size={22} className="text-green-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Exhibición</h1>
          <p className="text-sm text-slate-400">Control de artículos en exhibición</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <form onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); }} className="flex-1 min-w-[220px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por código, nombre o código de barras…"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200"
          />
        </form>
        <select
          value={exhibitedFilter}
          onChange={(e) => setExhibitedFilter(e.target.value as any)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
        >
          <option value="all">Todos</option>
          <option value="yes">Exhibidos</option>
          <option value="no">No exhibidos</option>
        </select>
      </div>

      {message && (
        <div className={`mb-3 px-4 py-2 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* Tabla */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-500"><Loader2 className="animate-spin mx-auto" /></div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-slate-500">Sin artículos</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-800">
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Artículo</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Ubicación</th>
                <th className="px-4 py-3 text-center">Días</th>
                <th className="px-4 py-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={`border-b border-slate-800/50 ${p.isExhibited ? 'bg-green-500/5' : ''}`}>
                  <td className="px-4 py-2.5 text-slate-300 font-mono text-xs">{p.code}</td>
                  <td className="px-4 py-2.5 text-slate-200">{p.name}</td>
                  <td className="px-4 py-2.5">
                    {p.isExhibited
                      ? <span className="text-green-400">Exhibido</span>
                      : <span className="text-slate-500">No exhibido</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{p.exhibitionLocation || '—'}</td>
                  <td className="px-4 py-2.5 text-center text-slate-400">{p.daysExhibited ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {p.isExhibited ? (
                      <button onClick={() => setRemoveTarget(p)} className="px-3 py-1.5 rounded-lg text-red-400 bg-red-500/10 hover:bg-red-500/20 text-xs">
                        Retirar
                      </button>
                    ) : (
                      <button onClick={() => { setPlaceTarget(p); setPlaceLocation(''); }} className="px-3 py-1.5 rounded-lg text-green-400 bg-green-500/10 hover:bg-green-500/20 text-xs inline-flex items-center gap-1">
                        <Plus size={14} /> Exhibir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal poner */}
      {placeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPlaceTarget(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Exhibir: {placeTarget.name}</h3>
              <button onClick={() => setPlaceTarget(null)}><X size={18} className="text-slate-500" /></button>
            </div>
            <label className="block text-xs text-slate-500 mb-1">Ubicación (opcional)</label>
            <input value={placeLocation} onChange={(e) => setPlaceLocation(e.target.value)} placeholder="Ej. Vitrina 3, Entrada…" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 mb-4" />
            <button onClick={confirmPlace} disabled={processing} className="btn-primary w-full disabled:opacity-50">
              {processing ? 'Guardando…' : 'Confirmar exhibición'}
            </button>
          </div>
        </div>
      )}

      {/* Modal retirar */}
      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setRemoveTarget(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Retirar: {removeTarget.name}</h3>
              <button onClick={() => setRemoveTarget(null)}><X size={18} className="text-slate-500" /></button>
            </div>
            <label className="block text-xs text-slate-500 mb-1">Motivo</label>
            <select value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 mb-3">
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <label className="block text-xs text-slate-500 mb-1">Nota (opcional)</label>
            <input value={removeNote} onChange={(e) => setRemoveNote(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 mb-4" />
            <button onClick={confirmRemove} disabled={processing} className="btn-primary w-full disabled:opacity-50">
              {processing ? 'Guardando…' : 'Confirmar retiro'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck y commit**

```bash
pnpm --filter web exec tsc --noEmit
git add "apps/web/src/app/(dashboard)/exhibition/page.tsx"
git commit -m "feat: Session 126 - Exhibicion: pagina de control"
```
Expected typecheck: EXIT 0.

- [ ] **Step 3: Verificación manual (local)**

Con el usuario ADMIN, entrar a `http://localhost:3000/exhibition`: buscar un artículo, "Exhibir" con una ubicación, verificar que pase a estado Exhibido; "Retirar" con motivo, verificar que vuelva a No exhibido.

---

## Task 10: Página de reporte `/exhibition/reporte`

**Files:**
- Create: `apps/web/src/app/(dashboard)/exhibition/reporte/page.tsx`

- [ ] **Step 1: Crear la página de reporte con rango, KPIs, tabla y export**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Download, FileText, Loader2 } from 'lucide-react';

interface Entry {
  id: string;
  createdAt: string;
  action: 'PLACED' | 'REMOVED';
  location: string | null;
  reason: string | null;
  createdBy: { name: string } | null;
  product: { code: string; name: string; category: { name: string } | null } | null;
}
interface Summary {
  currentlyExhibited: number;
  placedCount: number;
  removedCount: number;
  avgDaysExhibited: number;
  top: { product: { code: string; name: string } | null; placedCount: number }[];
}

const ACTION_LABEL: Record<string, string> = { PLACED: 'Puesto', REMOVED: 'Retirado' };
const REASON_LABEL: Record<string, string> = { SOLD: 'Vendido', DAMAGED: 'Dañado', ROTATION: 'Rotación', OTHER: 'Otro' };

// Rango en fecha LOCAL (navegador = Caracas), formato YYYY-MM-DD
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function rangeFor(preset: string): { from: string; to: string } {
  const now = new Date();
  const today = ymd(now);
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'week') {
    const d = new Date(now); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day);
    return { from: ymd(d), to: today };
  }
  if (preset === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: ymd(d), to: today };
  }
  return { from: today, to: today };
}

export default function ExhibitionReportPage() {
  const [preset, setPreset] = useState('today');
  const [from, setFrom] = useState(rangeFor('today').from);
  const [to, setTo] = useState(rangeFor('today').to);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = 'Reporte de Exhibición | Trinity ERP'; }, []);

  function applyPreset(p: string) {
    setPreset(p);
    if (p !== 'custom') { const r = rangeFor(p); setFrom(r.from); setTo(r.to); }
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from, to }).toString();
      const [aRes, sRes] = await Promise.all([
        fetch(`/api/proxy/exhibition/activity?${qs}`),
        fetch(`/api/proxy/exhibition/summary?${qs}`),
      ]);
      setEntries(await aRes.json());
      setSummary(await sRes.json());
    } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportUrl = (fmt: 'pdf' | 'xlsx') => `/api/proxy/exhibition/activity/${fmt}?${new URLSearchParams({ from, to })}`;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <BarChart3 size={22} className="text-green-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Reporte de Exhibición</h1>
          <p className="text-sm text-slate-400">Actividad por rango de fechas</p>
        </div>
      </div>

      {/* Rango */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex gap-1">
          {[['today', 'Hoy'], ['week', 'Semana'], ['month', 'Mes'], ['custom', 'Personalizado']].map(([k, l]) => (
            <button key={k} onClick={() => applyPreset(k)} className={`px-3 py-2 rounded-lg text-sm ${preset === k ? 'bg-green-500/20 text-green-400' : 'bg-slate-800 text-slate-400'}`}>{l}</button>
          ))}
        </div>
        {preset === 'custom' && (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
          </>
        )}
        <div className="ml-auto flex gap-2">
          <a href={exportUrl('pdf')} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm"><FileText size={16} /> PDF</a>
          <a href={exportUrl('xlsx')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm"><Download size={16} /> Excel</a>
        </div>
      </div>

      {/* KPIs */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Kpi label="Exhibidos ahora" value={summary.currentlyExhibited} />
          <Kpi label="Puestas (período)" value={summary.placedCount} />
          <Kpi label="Retiros (período)" value={summary.removedCount} />
          <Kpi label="Días prom. en vitrina" value={summary.avgDaysExhibited} />
        </div>
      )}

      {/* Tabla actividad */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-500"><Loader2 className="animate-spin mx-auto" /></div>
        ) : entries.length === 0 ? (
          <div className="p-10 text-center text-slate-500">Sin actividad en el rango</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-800">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Artículo</th>
                <th className="px-4 py-3">Acción</th>
                <th className="px-4 py-3">Ubicación</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Usuario</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-slate-800/50">
                  <td className="px-4 py-2.5 text-slate-400">{new Date(e.createdAt).toLocaleString('es-VE')}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{e.product?.code}</td>
                  <td className="px-4 py-2.5 text-slate-200">{e.product?.name}</td>
                  <td className="px-4 py-2.5">
                    <span className={e.action === 'PLACED' ? 'text-green-400' : 'text-red-400'}>{ACTION_LABEL[e.action]}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{e.location || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-400">{e.reason ? REASON_LABEL[e.reason] : '—'}</td>
                  <td className="px-4 py-2.5 text-slate-400">{e.createdBy?.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-100">{value}</p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck y commit**

```bash
pnpm --filter web exec tsc --noEmit
git add "apps/web/src/app/(dashboard)/exhibition/reporte/page.tsx"
git commit -m "feat: Session 126 - Exhibicion: pagina de reporte con KPIs y export"
```
Expected typecheck: EXIT 0.

- [ ] **Step 3: Verificación manual (local)**

Entrar a `http://localhost:3000/exhibition/reporte`: cambiar entre Hoy/Semana/Mes/Personalizado, ver que los KPIs y la tabla cambian; descargar PDF y Excel y confirmar que abren con la actividad del rango.

---

## Task 11: Escaneo de código de barras en la página de control

**Files:**
- Modify: `apps/web/src/app/(dashboard)/exhibition/page.tsx`

- [ ] **Step 1: Localizar el componente/hook de escaneo del POS**

Run:
```bash
grep -rn "BarcodeDetector\|Scanner\|scan\|BarcodeScanner\|NATIVE_BARCODE_FORMATS" "apps/web/src/app/(dashboard)/sales/pos/page.tsx" | head
grep -rln "BarcodeDetector\|Scanner" apps/web/src/components | head
```
Expected: identificar el componente reutilizable (si existe) o el patrón usado en el POS.

- [ ] **Step 2: Integrar el escaneo**

Si hay un componente reutilizable (ej. `<BarcodeScannerButton onScan={...} />`), agregarlo junto al buscador en `exhibition/page.tsx`, y en `onScan` setear `setSearch(code)` (dispara `fetchRows`, que ya busca por `barcode`). Si NO hay componente reutilizable, agregar un botón que setee el término de búsqueda escaneado usando el mismo hook/lib del POS. Reusar exactamente el mismo enfoque del POS para no divergir.

> Este paso depende del código real del POS (Step 1). No inventar una API de escaneo distinta; replicar la del POS.

- [ ] **Step 3: Typecheck y commit**

```bash
pnpm --filter web exec tsc --noEmit
git add "apps/web/src/app/(dashboard)/exhibition/page.tsx"
git commit -m "feat: Session 126 - Exhibicion: escaneo de codigo de barras"
```
Expected typecheck: EXIT 0.

---

## Task 12: Historial por artículo (modal)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/exhibition/page.tsx`

- [ ] **Step 1: Agregar estado, fetch y botón de historial**

En `exhibition/page.tsx`, agregar el estado y la función:

```tsx
  const [historyTarget, setHistoryTarget] = useState<Prod | null>(null);
  const [historyEntries, setHistoryEntries] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function openHistory(p: Prod) {
    setHistoryTarget(p); setHistoryLoading(true); setHistoryEntries([]);
    try {
      const res = await fetch(`/api/proxy/exhibition/products/${p.id}/history`);
      const data = await res.json();
      setHistoryEntries(data.entries || []);
    } finally { setHistoryLoading(false); }
  }
```

En la columna "Acción" de cada fila, agregar junto al botón existente:

```tsx
                    <button onClick={() => openHistory(p)} title="Historial" className="ml-2 p-1.5 rounded-lg text-slate-400 hover:bg-slate-800">
                      <History size={14} />
                    </button>
```

Y el modal al final del componente (antes del cierre del `return`):

```tsx
      {historyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setHistoryTarget(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-lg max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-white mb-3">Historial: {historyTarget.name}</h3>
            {historyLoading ? (
              <Loader2 className="animate-spin mx-auto text-slate-500" />
            ) : historyEntries.length === 0 ? (
              <p className="text-slate-500 text-sm">Sin movimientos.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {historyEntries.map((e) => (
                  <li key={e.id} className="flex justify-between border-b border-slate-800/50 pb-1.5">
                    <span className={e.action === 'PLACED' ? 'text-green-400' : 'text-red-400'}>
                      {e.action === 'PLACED' ? 'Puesto' : 'Retirado'}
                      {e.location ? ` · ${e.location}` : ''}
                    </span>
                    <span className="text-slate-500">{new Date(e.createdAt).toLocaleString('es-VE')} · {e.createdBy?.name || ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
```

> `History` ya está importado de `lucide-react` en la Task 9.

- [ ] **Step 2: Typecheck y commit**

```bash
pnpm --filter web exec tsc --noEmit
git add "apps/web/src/app/(dashboard)/exhibition/page.tsx"
git commit -m "feat: Session 126 - Exhibicion: historial por articulo"
```
Expected typecheck: EXIT 0.

---

## Task 13: Verificación end-to-end + permiso en local + PROGRESS

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Dar el permiso `exhibicion` al rol de prueba en la BD local**

Run:
```bash
docker exec -e PGPASSWORD='trebol_secret_2024' trinity-postgres-1 psql -U trebol -d grande_db -c "UPDATE \"RolePermission\" SET modules = array_append(modules,'exhibicion') WHERE role='ACCOUNTANT' AND NOT ('exhibicion' = ANY(modules));"
docker exec trinity-postgres-1 redis-cli DEL "role-permissions:ACCOUNTANT" 2>/dev/null || true
```
> Con ADMIN no hace falta (tiene `*`). Este paso es solo para probar el gating con un rol no-admin si se desea.

- [ ] **Step 2: Prueba end-to-end (API con token, como en la sesión)**

Firmar un JWT ADMIN y probar el ciclo completo:
```bash
SECRET=$(grep -E "^JWT_SECRET=" apps/api/.env | cut -d= -f2- | sed 's/^"//; s/"$//')
AID=$(docker exec -e PGPASSWORD='trebol_secret_2024' trinity-postgres-1 psql -U trebol -d grande_db -tA -c "SELECT id FROM \"User\" WHERE role='ADMIN' LIMIT 1;")
JWT_SECRET="$SECRET" AID="$AID" node -e '
const c=require("crypto"); const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
(async()=>{const n=Math.floor(Date.now()/1e3);
const h=b({alg:"HS256",typ:"JWT"});const p=b({sub:process.env.AID,role:"ADMIN",permissions:["*"],iat:n,exp:n+600});
const s=c.createHmac("sha256",process.env.JWT_SECRET).update(h+"."+p).digest("base64url");const t=h+"."+p+"."+s;
const H={headers:{Authorization:"Bearer "+t,"Content-Type":"application/json"}};
const pid=(await(await fetch("http://localhost:4000/exhibition/products?limit=1",H)).json()).data[0].id;
console.log("place:",(await fetch("http://localhost:4000/exhibition/place",{...H,method:"POST",body:JSON.stringify({productId:pid,location:"Vitrina Test"})})).status);
console.log("summary:",JSON.stringify(await(await fetch("http://localhost:4000/exhibition/summary?from="+new Date().toISOString().slice(0,10)+"&to="+new Date().toISOString().slice(0,10),H)).json()));
console.log("remove:",(await fetch("http://localhost:4000/exhibition/remove",{...H,method:"POST",body:JSON.stringify({productId:pid,reason:"ROTATION"})})).status);
})();'
```
Expected: `place: 201`, `summary` con `currentlyExhibited>=1` y `placedCount>=1`, `remove: 201`.

- [ ] **Step 3: Prueba manual en el navegador**

Verificar los criterios de aceptación del spec (§Criterios de aceptación): exhibir/retirar, filtros, reporte por rango con export PDF/Excel, historial, y gating por permiso.

- [ ] **Step 4: Actualizar PROGRESS.md**

Agregar una entrada en la sección del 2026-09-14 describiendo el módulo de Exhibición (modelos, endpoints, páginas, permiso), marcándolo **SIN DESPLEGAR**.

- [ ] **Step 5: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: Session 126 - Exhibicion: modulo completo (sin desplegar)"
```

- [ ] **Step 6: Push (cuando el usuario lo autorice)**

```bash
git push origin main
```
> NO desplegar. El deploy lo hace Diego. Recordar que la migración es aditiva/idempotente y el módulo queda invisible hasta asignar el permiso `exhibicion` a un rol.

---

## Self-Review (cobertura del spec)

- Estado + bitácora → Task 1 (schema), Task 3 (place/remove escriben estado y entry). ✓
- Solo presencia (sin cantidad) → sin campos de cantidad. ✓
- Ubicación texto libre opcional → `exhibitionLocation` + `location` en entry. ✓
- Reporte = toda la actividad por rango → Task 4 (`activity`) + Task 10 (página). ✓
- Rangos hoy/semana/mes/personalizado → Task 10 (`rangeFor`/presets) + Caracas en backend (`dateRange`). ✓
- Aparte del stock → ningún `StockMovement`/kardex tocado. ✓
- Permiso `exhibicion` asignable por rol → Task 7 (VALID_MODULES + defaults + UI) + Task 8 (sidebar). ✓
- Extras: export PDF/Excel → Task 5 + Task 10; KPIs + tiempo en exhibición → Task 4 + Task 10; motivo al retirar → Task 2/3/9. ✓
- UX: buscar/escáner → Task 9 + Task 11; filtros → Task 9/10; historial por artículo → Task 12; ver exhibidos/no exhibidos → Task 9. ✓
- Foto: NO incluida (no-goal). ✓

Sin placeholders. Nombres/tipos consistentes entre tareas (`ExhibitionEntry`, `action`, `reason`, `findProducts`, `activity`, `summary`, `place`, `remove`, `history`).
