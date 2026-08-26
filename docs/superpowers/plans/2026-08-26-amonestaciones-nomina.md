# Amonestaciones / Llamados de atención (Nómina) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar llamados de atención al personal que escalan en 3 niveles (Llamado → Notificación → Amonestación) de forma independiente por tipo de falta, con acta PDF y fotos del acta firmada.

**Architecture:** Módulo backend nuevo `disciplinary` (NestJS + Prisma), gateado con el permiso existente `payroll` (todo vive en Nómina). El nivel de cada registro lo determina el conteo del hilo (empleado + tipo de falta): 1º=Llamado, 2º=Notificación, 3º+=Amonestación (topa ahí). Solo se puede eliminar el último de cada hilo. Frontend: 3 páginas Next.js bajo `payroll/` (lista, vista por empleado tipo stepper, catálogo de tipos de falta). Reusa `SpacesService`/`processProductImage` de `product-images` para las fotos, igual que el módulo `incidents`.

**Tech Stack:** NestJS, Prisma (PostgreSQL), pdfkit, Next.js (App Router, client components), Tailwind (tema oscuro), lucide-react.

**Nota sobre pruebas:** el repo **no tiene** framework de tests (`0` archivos `.spec.ts`). Siguiendo el patrón del proyecto, la verificación de cada tarea es **typecheck** (`tsc --noEmit`) + **prueba manual** contra la BD local (que ya tiene datos reales de la grande, con 61 empleados). No se introduce Jest.

**Gotchas del repo (de memoria del proyecto):**
- NO correr `nest build` ni `pnpm build` mientras el `dev` está encendido (borra `dist`/`.next` y tumba el server). Para typecheck usar `npx tsc --noEmit`.
- Migraciones: SIEMPRE `IF NOT EXISTS` / idempotentes, y reflejar en `deploy/fix-schema.sql`.
- Prisma en servidor usa v5 (`npx prisma@5.22.0`); local usa el del monorepo.

---

## Estructura de archivos

**Backend — crear** (todo en `apps/api/src/modules/disciplinary/`):
- `disciplinary.module.ts` — módulo, importa `ProductImagesModule`.
- `disciplinary.controller.ts` — rutas `/disciplinary` (+ `/fault-types`, `/by-employee/:id`, `/:id/pdf`).
- `disciplinary.service.ts` — CRUD tipos de falta + amonestaciones + lógica de escalado.
- `disciplinary-pdf.service.ts` — genera el acta PDF.
- `dto/create-fault-type.dto.ts`, `dto/create-disciplinary-action.dto.ts`, `dto/query-disciplinary.dto.ts`.

**Backend — modificar:**
- `packages/database/prisma/schema.prisma` — 3 modelos nuevos + 2 relaciones inversas.
- `packages/database/prisma/migrations/20260826160000_disciplinary_module/migration.sql` — crear.
- `deploy/fix-schema.sql` — anexar red de seguridad.
- `apps/api/src/app.module.ts` — registrar `DisciplinaryModule`.

**Frontend — crear** (bajo `apps/web/src/app/(dashboard)/payroll/`):
- `fault-types/page.tsx` — catálogo de tipos de falta.
- `disciplinary/page.tsx` — lista + filtros + modal de registro.
- `disciplinary/employee/[id]/page.tsx` — vista por empleado (stepper).

**Frontend — modificar:**
- `apps/web/src/components/sidebar.tsx` — 2 ítems en el grupo NOMINA.

---

## Task 1: Modelos Prisma + migración + fix-schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (Employee ~línea 2427, User ~línea 356, y modelos nuevos al final de la zona de nómina)
- Create: `packages/database/prisma/migrations/20260826160000_disciplinary_module/migration.sql`
- Modify: `deploy/fix-schema.sql` (anexar al final)

- [ ] **Step 1: Agregar los 3 modelos al schema**

Al final del bloque de modelos de nómina en `schema.prisma` (después de `model Position { ... }` o tras `PayrollRunLine`), añadir:

```prisma
// ============================================
// AMONESTACIONES / LLAMADOS DE ATENCION (NOMINA)
// ============================================

model FaultType {
  id        String               @id @default(cuid())
  name      String               @unique
  isActive  Boolean              @default(true)
  actions   DisciplinaryAction[]
  createdAt DateTime             @default(now())
  updatedAt DateTime             @updatedAt
}

model DisciplinaryAction {
  id          String                   @id @default(cuid())
  number      String                   @unique // correlativo LA-0001
  employeeId  String
  employee    Employee                 @relation(fields: [employeeId], references: [id])
  faultTypeId String
  faultType   FaultType                @relation(fields: [faultTypeId], references: [id])
  sequence    Int // ordinal dentro del hilo (empleado+falta): 1,2,3,4...
  level       String // LLAMADO | NOTIFICACION | AMONESTACION (se calcula del sequence y se persiste)
  occurredAt  DateTime // fecha del suceso
  reason      String // motivo / descripción
  attachments DisciplinaryAttachment[]
  createdById String
  createdBy   User                     @relation("DisciplinaryActionCreator", fields: [createdById], references: [id])
  createdAt   DateTime                 @default(now())
  updatedAt   DateTime                 @updatedAt

  @@index([employeeId, faultTypeId])
  @@index([occurredAt])
}

model DisciplinaryAttachment {
  id        String             @id @default(cuid())
  actionId  String
  action    DisciplinaryAction @relation(fields: [actionId], references: [id], onDelete: Cascade)
  thumbKey  String // miniatura 150px webp en Spaces
  mediumKey String // versión 800px webp en Spaces (lightbox)
  createdAt DateTime           @default(now())

  @@index([actionId])
}
```

- [ ] **Step 2: Agregar las relaciones inversas en Employee y User**

En `model Employee` (después de `lines PayrollRunLine[]`, ~línea 2427) añadir:

```prisma
  disciplinaryActions DisciplinaryAction[]
```

En `model User` (junto a las demás relaciones, ej. después de `damageReportsProcessed ...`, ~línea 361) añadir:

```prisma
  disciplinaryActions DisciplinaryAction[] @relation("DisciplinaryActionCreator")
```

- [ ] **Step 3: Crear la migración SQL (idempotente)**

Crear `packages/database/prisma/migrations/20260826160000_disciplinary_module/migration.sql`:

```sql
-- Nomina: Amonestaciones / llamados de atencion (3 niveles por tipo de falta).
-- Aditivo e idempotente (IF NOT EXISTS + DO blocks para FKs).

CREATE TABLE IF NOT EXISTS "FaultType" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FaultType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FaultType_name_key" ON "FaultType"("name");

CREATE TABLE IF NOT EXISTS "DisciplinaryAction" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "faultTypeId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "level" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DisciplinaryAction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DisciplinaryAction_number_key" ON "DisciplinaryAction"("number");
CREATE INDEX IF NOT EXISTS "DisciplinaryAction_employeeId_faultTypeId_idx" ON "DisciplinaryAction"("employeeId", "faultTypeId");
CREATE INDEX IF NOT EXISTS "DisciplinaryAction_occurredAt_idx" ON "DisciplinaryAction"("occurredAt");

CREATE TABLE IF NOT EXISTS "DisciplinaryAttachment" (
  "id" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "thumbKey" TEXT NOT NULL,
  "mediumKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DisciplinaryAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DisciplinaryAttachment_actionId_idx" ON "DisciplinaryAttachment"("actionId");

DO $$ BEGIN
  ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_faultTypeId_fkey"
    FOREIGN KEY ("faultTypeId") REFERENCES "FaultType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DisciplinaryAttachment" ADD CONSTRAINT "DisciplinaryAttachment_actionId_fkey"
    FOREIGN KEY ("actionId") REFERENCES "DisciplinaryAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 4: Anexar la misma red de seguridad a `deploy/fix-schema.sql`**

Al final de `deploy/fix-schema.sql` pegar el mismo bloque de `CREATE TABLE IF NOT EXISTS ...` / índices / `DO $$ ... FK ...` del Step 3 (idéntico; es idempotente), precedido de un comentario:

```sql

-- =============================================================================
-- SECTION: Nomina — Amonestaciones (FaultType, DisciplinaryAction, DisciplinaryAttachment)
-- =============================================================================
```
(y debajo, el contenido íntegro del Step 3).

- [ ] **Step 5: Aplicar la migración en local y generar el cliente**

Asegurar `DATABASE_URL` apuntando a la BD local (grande) y correr:

Run:
```bash
cd "C:/Users/Diego/Desktop/Trinity"
pnpm --filter @trinity/database exec prisma migrate deploy
pnpm --filter @trinity/database exec prisma generate
```
Expected: "migration(s) applied" (o "No pending migrations" si ya estaba) y "Generated Prisma Client". Sin errores.

- [ ] **Step 6: Verificar que las tablas existen**

Run:
```bash
psql "$DATABASE_URL" -c "\dt \"DisciplinaryAction\"" -c "\dt \"FaultType\"" -c "\dt \"DisciplinaryAttachment\""
```
Expected: las 3 tablas listadas.

- [ ] **Step 7: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260826160000_disciplinary_module deploy/fix-schema.sql
git commit -m "feat(nomina): schema + migracion de Amonestaciones (FaultType, DisciplinaryAction, adjuntos)"
```

---

## Task 2: DTOs del módulo disciplinary

**Files:**
- Create: `apps/api/src/modules/disciplinary/dto/create-fault-type.dto.ts`
- Create: `apps/api/src/modules/disciplinary/dto/create-disciplinary-action.dto.ts`
- Create: `apps/api/src/modules/disciplinary/dto/query-disciplinary.dto.ts`

- [ ] **Step 1: create-fault-type.dto.ts**

```ts
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateFaultTypeDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

- [ ] **Step 2: create-disciplinary-action.dto.ts**

```ts
import { IsString, IsOptional, IsDateString, MaxLength, IsArray, ArrayMaxSize } from 'class-validator';

export class CreateDisciplinaryActionDto {
  @IsString()
  employeeId: string;

  @IsString()
  faultTypeId: string;

  @IsString()
  @MaxLength(2000)
  reason: string; // motivo / descripción

  // Fecha del suceso en ISO (idealmente con offset -04:00 de Caracas). Si no llega, se usa hoy.
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  // Fotos del acta firmada (data URIs base64). Se procesan a thumb+medium webp. Máximo 8.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  photos?: string[];
}
```

- [ ] **Step 3: query-disciplinary.dto.ts**

```ts
import { IsOptional, IsString, IsIn } from 'class-validator';

export class QueryDisciplinaryDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  faultTypeId?: string;

  @IsOptional()
  @IsIn(['LLAMADO', 'NOTIFICACION', 'AMONESTACION'])
  level?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/disciplinary/dto
git commit -m "feat(nomina): DTOs del modulo disciplinary"
```

---

## Task 3: Servicio disciplinary (tipos de falta + escalado + CRUD)

**Files:**
- Create: `apps/api/src/modules/disciplinary/disciplinary.service.ts`

- [ ] **Step 1: Escribir el servicio completo**

```ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';
import { SpacesService } from '../product-images/spaces.service';
import { processProductImage, dataUriToBuffer } from '../product-images/image-processing';
import { CreateFaultTypeDto } from './dto/create-fault-type.dto';
import { CreateDisciplinaryActionDto } from './dto/create-disciplinary-action.dto';
import { QueryDisciplinaryDto } from './dto/query-disciplinary.dto';

// El nivel sale del ordinal del hilo (empleado+falta): 1=Llamado, 2=Notificacion, 3+=Amonestacion.
export function levelForSequence(seq: number): string {
  if (seq <= 1) return 'LLAMADO';
  if (seq === 2) return 'NOTIFICACION';
  return 'AMONESTACION';
}

@Injectable()
export class DisciplinaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaces: SpacesService,
  ) {}

  private withPhotoUrls<
    T extends { attachments?: { id: string; thumbKey: string; mediumKey: string }[] },
  >(a: T) {
    const atts = a.attachments || [];
    const { attachments, ...rest } = a as any;
    return {
      ...rest,
      photos: atts.map((x) => ({
        id: x.id,
        thumbUrl: this.spaces.cdnUrl(x.thumbKey),
        mediumUrl: this.spaces.cdnUrl(x.mediumKey),
      })),
    };
  }

  // ============ TIPOS DE FALTA (abiertos a cualquiera con modulo 'payroll') ============

  findAllTypes() {
    return this.prisma.faultType.findMany({ orderBy: { name: 'asc' } });
  }

  findActiveTypes() {
    return this.prisma.faultType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  async createType(dto: CreateFaultTypeDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('El nombre del tipo de falta es obligatorio');
    const exists = await this.prisma.faultType.findUnique({ where: { name } });
    if (exists) throw new BadRequestException('Ya existe un tipo de falta con ese nombre');
    return this.prisma.faultType.create({ data: { name, isActive: dto.isActive ?? true } });
  }

  async updateType(id: string, dto: Partial<CreateFaultTypeDto>) {
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.faultType.update({ where: { id }, data });
  }

  async toggleTypeActive(id: string) {
    const t = await this.prisma.faultType.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tipo de falta no encontrado');
    return this.prisma.faultType.update({ where: { id }, data: { isActive: !t.isActive } });
  }

  // ============ AMONESTACIONES ============

  private buildWhere(query: QueryDisciplinaryDto) {
    const where: any = {};
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.faultTypeId) where.faultTypeId = query.faultTypeId;
    if (query.level) where.level = query.level;
    if (query.from || query.to) {
      where.occurredAt = {};
      if (query.from) where.occurredAt.gte = caracasDayStart(query.from);
      if (query.to) where.occurredAt.lte = caracasDayEnd(query.to);
    }
    return where;
  }

  async findAll(query: QueryDisciplinaryDto) {
    const where = this.buildWhere(query);
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 25;
    const [data, total] = await Promise.all([
      this.prisma.disciplinaryAction.findMany({
        where,
        include: {
          faultType: { select: { id: true, name: true } },
          employee: { select: { id: true, code: true, customer: { select: { name: true } } } },
          createdBy: { select: { name: true } },
          attachments: { select: { id: true, thumbKey: true, mediumKey: true }, orderBy: { createdAt: 'asc' } },
        },
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.disciplinaryAction.count({ where }),
    ]);
    return { data: data.map((d) => this.withPhotoUrls(d)), total, page, limit };
  }

  // Vista por empleado: agrupa por tipo de falta en "hilos" para el stepper.
  async byEmployee(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        code: true,
        customer: { select: { name: true, rif: true, documentType: true } },
        position: { select: { name: true } },
        department: { select: { name: true } },
      },
    });
    if (!employee) throw new NotFoundException('Empleado no encontrado');

    const actions = await this.prisma.disciplinaryAction.findMany({
      where: { employeeId },
      include: {
        faultType: { select: { id: true, name: true } },
        attachments: { select: { id: true, thumbKey: true, mediumKey: true }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: [{ faultTypeId: 'asc' }, { sequence: 'asc' }],
    });

    const threadsMap = new Map<string, { faultType: { id: string; name: string }; count: number; maxLevel: string; actions: any[] }>();
    for (const a of actions) {
      let t = threadsMap.get(a.faultTypeId);
      if (!t) { t = { faultType: a.faultType, count: 0, maxLevel: 'LLAMADO', actions: [] }; threadsMap.set(a.faultTypeId, t); }
      t.count++;
      t.maxLevel = levelForSequence(t.count);
      t.actions.push(this.withPhotoUrls(a));
    }
    return { employee, threads: Array.from(threadsMap.values()) };
  }

  async findOne(id: string) {
    const a = await this.prisma.disciplinaryAction.findUnique({
      where: { id },
      include: {
        faultType: { select: { id: true, name: true } },
        employee: { select: { id: true, code: true, customer: { select: { name: true } } } },
        createdBy: { select: { name: true } },
        attachments: { select: { id: true, thumbKey: true, mediumKey: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!a) throw new NotFoundException('Llamado no encontrado');
    return this.withPhotoUrls(a);
  }

  async create(dto: CreateDisciplinaryActionDto, userId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!employee) throw new BadRequestException('Empleado no encontrado');
    const faultType = await this.prisma.faultType.findUnique({ where: { id: dto.faultTypeId } });
    if (!faultType) throw new BadRequestException('Tipo de falta no encontrado');
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException('El motivo es obligatorio');
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    const rawPhotos = dto.photos?.length ? dto.photos : [];
    if (rawPhotos.length > 8) throw new BadRequestException('Máximo 8 fotos por llamado');

    // Fotos a Spaces ANTES de crear la fila (rollback safety), igual que incidents.
    const uploaded: { thumbKey: string; mediumKey: string }[] = [];
    try {
      for (const photo of rawPhotos) {
        let processed;
        try {
          processed = await processProductImage(dataUriToBuffer(photo));
        } catch {
          throw new BadRequestException('Una de las fotos no es una imagen válida');
        }
        const stamp = Date.now().toString(36);
        const rand = Math.random().toString(36).slice(2, 8);
        const thumbKey = `disciplinary/${stamp}-${rand}-thumb.webp`;
        const mediumKey = `disciplinary/${stamp}-${rand}-medium.webp`;
        await Promise.all([
          this.spaces.uploadPublic(thumbKey, processed.thumb, 'image/webp'),
          this.spaces.uploadPublic(mediumKey, processed.medium, 'image/webp'),
        ]);
        uploaded.push({ thumbKey, mediumKey });
      }

      const action = await this.prisma.$transaction(async (tx) => {
        // Conteo del hilo (empleado+falta) → escalado.
        const n = await tx.disciplinaryAction.count({
          where: { employeeId: dto.employeeId, faultTypeId: dto.faultTypeId },
        });
        const sequence = n + 1;
        const level = levelForSequence(sequence);
        // Correlativo LA-XXXX (zero-padded → orden desc por número sirve).
        const last = await tx.disciplinaryAction.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
        const lastNum = last ? parseInt(last.number.replace(/\D/g, ''), 10) || 0 : 0;
        const number = `LA-${String(lastNum + 1).padStart(4, '0')}`;

        return tx.disciplinaryAction.create({
          data: {
            number,
            employeeId: dto.employeeId,
            faultTypeId: dto.faultTypeId,
            sequence,
            level,
            occurredAt,
            reason,
            createdById: userId,
            attachments: { create: uploaded },
          },
          include: {
            faultType: { select: { id: true, name: true } },
            employee: { select: { id: true, code: true, customer: { select: { name: true } } } },
            createdBy: { select: { name: true } },
            attachments: { select: { id: true, thumbKey: true, mediumKey: true }, orderBy: { createdAt: 'asc' } },
          },
        });
      });
      return this.withPhotoUrls(action);
    } catch (e) {
      await Promise.all(
        uploaded.flatMap((u) => [this.spaces.delete(u.thumbKey), this.spaces.delete(u.mediumKey)]),
      );
      throw e;
    }
  }

  async remove(id: string) {
    const action = await this.prisma.disciplinaryAction.findUnique({
      where: { id },
      include: { attachments: { select: { thumbKey: true, mediumKey: true } } },
    });
    if (!action) throw new NotFoundException('Llamado no encontrado');

    // Solo se puede eliminar el ÚLTIMO del hilo (mayor sequence en empleado+falta).
    const agg = await this.prisma.disciplinaryAction.aggregate({
      where: { employeeId: action.employeeId, faultTypeId: action.faultTypeId },
      _max: { sequence: true },
    });
    if (action.sequence !== agg._max.sequence) {
      throw new BadRequestException('Solo se puede eliminar el último llamado de cada tipo de falta');
    }

    await this.prisma.disciplinaryAction.delete({ where: { id } });
    await Promise.all(
      action.attachments.flatMap((a) => [this.spaces.delete(a.thumbKey), this.spaces.delete(a.mediumKey)]),
    );
    return { ok: true };
  }
}
```

- [ ] **Step 2: Verificar API de SpacesService (cdnUrl/uploadPublic/delete)**

Run:
```bash
grep -nE "cdnUrl|uploadPublic|delete" apps/api/src/modules/product-images/spaces.service.ts
```
Expected: los 3 métodos existen (los usa `incidents.service.ts`). Si `delete` tuviera otro nombre, ajustar las llamadas.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/disciplinary/disciplinary.service.ts
git commit -m "feat(nomina): servicio disciplinary con escalado por tipo de falta y borrado del ultimo"
```

---

## Task 4: Acta PDF

**Files:**
- Create: `apps/api/src/modules/disciplinary/disciplinary-pdf.service.ts`

- [ ] **Step 1: Escribir el servicio de PDF**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

const LEVEL_LABEL: Record<string, string> = {
  LLAMADO: 'LLAMADO DE ATENCIÓN',
  NOTIFICACION: 'NOTIFICACIÓN',
  AMONESTACION: 'AMONESTACIÓN',
};
const fmtDate = (d: Date) => new Date(d).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' });

@Injectable()
export class DisciplinaryPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(id: string): Promise<Buffer> {
    const a = await this.prisma.disciplinaryAction.findUnique({
      where: { id },
      include: {
        faultType: { select: { name: true } },
        employee: {
          include: {
            customer: { select: { name: true, documentType: true, rif: true } },
            position: { select: { name: true } },
            department: { select: { name: true } },
          },
        },
      },
    });
    if (!a) throw new NotFoundException('Llamado no encontrado');

    const c = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
      select: { companyName: true, rif: true },
    });
    const company = { name: c?.companyName || 'Trinity', rif: c?.rif || '' };

    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (ch) => chunks.push(ch as Buffer));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const L = 50;
    const W = doc.page.width - 100;
    let y = 50;

    doc.fontSize(13).font('Helvetica-Bold').fillColor('#000').text(company.name, L, y, { width: W, align: 'center' });
    y += 17;
    if (company.rif) {
      doc.fontSize(9).font('Helvetica').fillColor('#333').text(`RIF: ${company.rif}`, L, y, { width: W, align: 'center' });
      y += 14;
    }
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#b91c1c').text(LEVEL_LABEL[a.level] || a.level, L, y, { width: W, align: 'center' });
    y += 22;
    doc.moveTo(L, y).lineTo(L + W, y).stroke('#999');
    y += 14;

    const cust = a.employee.customer;
    doc.fillColor('#111');
    const row = (label: string, value: string) => {
      doc.fontSize(10).font('Helvetica-Bold').text(label, L, y, { width: 140 });
      doc.font('Helvetica').text(value, L + 140, y, { width: W - 140 });
      y += 16;
    };
    row('N° de acta:', a.number);
    row('Empleado:', cust?.name || '-');
    row('Cédula:', cust ? `${cust.documentType || 'V'}-${cust.rif || ''}` : '-');
    row('Cargo:', a.employee.position?.name || '-');
    row('Departamento:', a.employee.department?.name || '-');
    row('Tipo de falta:', a.faultType.name);
    row('Nivel:', LEVEL_LABEL[a.level] || a.level);
    row('Fecha del suceso:', fmtDate(a.occurredAt));
    y += 8;

    doc.fontSize(10).font('Helvetica-Bold').text('Motivo / Descripción:', L, y);
    y += 15;
    doc.font('Helvetica').fillColor('#111').text(a.reason, L, y, { width: W });
    y += Math.max(40, doc.heightOfString(a.reason, { width: W })) + 30;

    // Firmas al pie
    const sigY = Math.max(y, doc.page.height - 130);
    const half = W / 2;
    doc.moveTo(L, sigY).lineTo(L + half - 20, sigY).stroke('#333');
    doc.moveTo(L + half + 20, sigY).lineTo(L + W, sigY).stroke('#333');
    doc.fontSize(9).font('Helvetica').fillColor('#333');
    doc.text('Firma del empleado', L, sigY + 4, { width: half - 20, align: 'center' });
    doc.text('Firma del supervisor / RRHH', L + half + 20, sigY + 4, { width: half - 20, align: 'center' });

    doc.end();
    return done;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/disciplinary/disciplinary-pdf.service.ts
git commit -m "feat(nomina): acta PDF de amonestacion"
```

---

## Task 5: Controlador + módulo + registro en app.module

**Files:**
- Create: `apps/api/src/modules/disciplinary/disciplinary.controller.ts`
- Create: `apps/api/src/modules/disciplinary/disciplinary.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: disciplinary.controller.ts** (rutas estáticas antes de `:id`)

```ts
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { DisciplinaryService } from './disciplinary.service';
import { DisciplinaryPdfService } from './disciplinary-pdf.service';
import { CreateFaultTypeDto } from './dto/create-fault-type.dto';
import { CreateDisciplinaryActionDto } from './dto/create-disciplinary-action.dto';
import { QueryDisciplinaryDto } from './dto/query-disciplinary.dto';

@ApiTags('disciplinary')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('payroll')
@Controller('disciplinary')
export class DisciplinaryController {
  constructor(
    private readonly service: DisciplinaryService,
    private readonly pdf: DisciplinaryPdfService,
  ) {}

  // ---- Tipos de falta (abiertos a cualquiera con el modulo payroll) ----
  @Get('fault-types')
  findAllTypes() {
    return this.service.findAllTypes();
  }

  @Get('fault-types/active')
  findActiveTypes() {
    return this.service.findActiveTypes();
  }

  @Post('fault-types')
  createType(@Body() dto: CreateFaultTypeDto) {
    return this.service.createType(dto);
  }

  @Patch('fault-types/:id')
  updateType(@Param('id') id: string, @Body() dto: Partial<CreateFaultTypeDto>) {
    return this.service.updateType(id, dto);
  }

  @Patch('fault-types/:id/toggle-active')
  toggleTypeActive(@Param('id') id: string) {
    return this.service.toggleTypeActive(id);
  }

  // ---- Vista por empleado (stepper) ----
  @Get('by-employee/:employeeId')
  byEmployee(@Param('employeeId') employeeId: string) {
    return this.service.byEmployee(employeeId);
  }

  // ---- Acta PDF (antes de rutas con :id genérico) ----
  @Get(':id/pdf')
  async pdfActa(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdf.generate(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="acta-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // ---- Amonestaciones ----
  @Get()
  findAll(@Query() query: QueryDisciplinaryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateDisciplinaryActionDto, @CurrentUser() user: { id: string }) {
    return this.service.create(dto, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
```

- [ ] **Step 2: disciplinary.module.ts**

```ts
import { Module } from '@nestjs/common';
import { DisciplinaryService } from './disciplinary.service';
import { DisciplinaryPdfService } from './disciplinary-pdf.service';
import { DisciplinaryController } from './disciplinary.controller';
import { ProductImagesModule } from '../product-images/product-images.module';

@Module({
  imports: [ProductImagesModule], // reutiliza SpacesService para las fotos del acta
  controllers: [DisciplinaryController],
  providers: [DisciplinaryService, DisciplinaryPdfService],
})
export class DisciplinaryModule {}
```

- [ ] **Step 3: Registrar en app.module.ts**

En `apps/api/src/app.module.ts`, junto a los demás imports de módulos (después de la línea `import { IncidentsModule } ...`, ~línea 69) añadir:

```ts
import { DisciplinaryModule } from './modules/disciplinary/disciplinary.module';
```

Y en el array `imports: [...]` del `@Module`, después de `PayrollModule,` (~línea 140) añadir:

```ts
    DisciplinaryModule,
```

- [ ] **Step 4: Typecheck del API**

Run:
```bash
cd apps/api && npx tsc --noEmit
```
Expected: sin errores. (Si aparece que `disciplinaryAction`/`faultType` no existen en el cliente Prisma, correr de nuevo `pnpm --filter @trinity/database exec prisma generate` de Task 1 Step 5.)

- [ ] **Step 5: Prueba manual del backend (API dev encendido)**

Con el API dev corriendo (puerto 4000) y un JWT válido, o desde la UI en el paso de frontend. Verificación mínima por curl (reemplazar TOKEN):
```bash
curl -s -X POST localhost:4000/disciplinary/fault-types -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" -d '{"name":"Puntualidad"}'
curl -s localhost:4000/disciplinary/fault-types -H "Authorization: Bearer TOKEN"
```
Expected: el POST devuelve el tipo creado con `id`; el GET lo lista.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/disciplinary/disciplinary.controller.ts apps/api/src/modules/disciplinary/disciplinary.module.ts apps/api/src/app.module.ts
git commit -m "feat(nomina): controlador + modulo disciplinary registrado en app.module"
```

---

## Task 6: Frontend — Catálogo de tipos de falta

**Files:**
- Create: `apps/web/src/app/(dashboard)/payroll/fault-types/page.tsx`

- [ ] **Step 1: Escribir la página** (clon del patrón de `incidents/types/page.tsx`, proxy `disciplinary/fault-types`)

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Layers, Plus, Pencil, ToggleLeft, ToggleRight, Loader2, X } from 'lucide-react';

interface FaultType {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export default function FaultTypesPage() {
  const [types, setTypes] = useState<FaultType[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FaultType | null>(null);
  const [formName, setFormName] = useState('');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  useEffect(() => { document.title = 'Tipos de falta | Trinity ERP'; }, []);

  const fetchTypes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/disciplinary/fault-types');
      const data = await res.json();
      setTypes(Array.isArray(data) ? data : []);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar tipos de falta' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTypes(); }, [fetchTypes]);
  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 4000); return () => clearTimeout(t); }
  }, [message]);

  function openCreate() { setEditing(null); setFormName(''); setModalOpen(true); }
  function openEdit(t: FaultType) { setEditing(t); setFormName(t.name); setModalOpen(true); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    try {
      const url = editing ? `/api/proxy/disciplinary/fault-types/${editing.id}` : '/api/proxy/disciplinary/fault-types';
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Error'); }
      setMessage({ type: 'success', text: editing ? 'Tipo actualizado' : 'Tipo creado' });
      setModalOpen(false);
      fetchTypes();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      const res = await fetch(`/api/proxy/disciplinary/fault-types/${id}/toggle-active`, { method: 'PATCH' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Error'); }
      fetchTypes();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Layers className="text-blue-400" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Tipos de falta</h1>
            <p className="text-sm text-slate-400">{types.length} tipos</p>
          </div>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
          <Plus size={16} /> Nuevo tipo
        </button>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-xl border text-sm font-medium ${message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
          {message.text}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-700/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800/60 border-b border-slate-700/50">
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Nombre</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="text-center py-12"><Loader2 className="animate-spin inline-block text-slate-500" size={24} /></td></tr>
            ) : types.length === 0 ? (
              <tr><td colSpan={3} className="text-center py-12 text-slate-500">No hay tipos de falta</td></tr>
            ) : (
              types.map((t) => (
                <tr key={t.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 text-slate-200 font-medium">{t.name}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${t.isActive ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-slate-500/10 text-slate-500 border-slate-500/30'}`}>
                      {t.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-blue-400 transition-colors" title="Editar"><Pencil size={14} /></button>
                      <button onClick={() => handleToggle(t.id)} className="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-amber-400 transition-colors" title={t.isActive ? 'Desactivar' : 'Activar'}>
                        {t.isActive ? <ToggleRight size={16} className="text-green-400" /> : <ToggleLeft size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-100">{editing ? 'Editar tipo de falta' : 'Nuevo tipo de falta'}</h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nombre *</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} required autoFocus
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm"
                  placeholder="Ej: Puntualidad, Procedimiento, Uniforme…" />
              </div>
              <button type="submit" disabled={processing}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {processing && <Loader2 size={16} className="animate-spin" />}
                {editing ? 'Actualizar' : 'Crear'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar en el navegador**

Con el web dev encendido, entrar a `/payroll/fault-types`. Crear "Puntualidad" y "Procedimiento", editarlos y activar/desactivar. Expected: se crean, listan y togglean sin error.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(dashboard)/payroll/fault-types/page.tsx"
git commit -m "feat(nomina): catalogo de tipos de falta (frontend)"
```

---

## Task 7: Frontend — Lista de amonestaciones + modal de registro

**Files:**
- Create: `apps/web/src/app/(dashboard)/payroll/disciplinary/page.tsx`

**Contrato de datos** (del backend Task 3/5):
- `GET /disciplinary?employeeId&faultTypeId&level&from&to&page&limit` → `{ data: Action[], total, page, limit }`
- `Action` = `{ id, number, sequence, level, occurredAt, reason, faultType: {id,name}, employee: {id, code, customer:{name}}, createdBy:{name}, photos: [{id,thumbUrl,mediumUrl}] }`
- `GET /disciplinary/fault-types/active` → `FaultType[]`
- `GET /employees?isActive=true` → `Employee[]` con `{ id, code, customer:{name} }`
- `POST /disciplinary` body `{ employeeId, faultTypeId, occurredAt, reason, photos? }`

- [ ] **Step 1: Escribir la página con filtros y modal**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ShieldAlert, Plus, Loader2, X, FileText, User, Filter } from 'lucide-react';

interface FaultType { id: string; name: string; isActive: boolean; }
interface EmployeeLite { id: string; code: string | null; customer: { name: string }; }
interface Action {
  id: string; number: string; sequence: number; level: string; occurredAt: string; reason: string;
  faultType: { id: string; name: string };
  employee: { id: string; code: string | null; customer: { name: string } };
  createdBy?: { name: string };
  photos: { id: string; thumbUrl: string; mediumUrl: string }[];
}

const LEVELS: Record<string, { label: string; cls: string }> = {
  LLAMADO: { label: 'Llamado de atención', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  NOTIFICACION: { label: 'Notificación', cls: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  AMONESTACION: { label: 'Amonestación', cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
};

// Downscale a max 1600px y a JPEG base64 para no subir fotos enormes.
async function fileToDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = document.createElement('img');
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
  const max = 1600;
  let { width, height } = img;
  if (width > max || height > max) {
    const scale = Math.min(max / width, max / height);
    width = Math.round(width * scale); height = Math.round(height * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export default function DisciplinaryPage() {
  const [items, setItems] = useState<Action[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [faultTypes, setFaultTypes] = useState<FaultType[]>([]);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  // Filtros
  const [fEmployee, setFEmployee] = useState('');
  const [fType, setFType] = useState('');
  const [fLevel, setFLevel] = useState('');

  // Modal registro
  const [modalOpen, setModalOpen] = useState(false);
  const [mEmployee, setMEmployee] = useState('');
  const [mType, setMType] = useState('');
  const [mDate, setMDate] = useState('');
  const [mReason, setMReason] = useState('');
  const [mPhotos, setMPhotos] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => { document.title = 'Amonestaciones | Trinity ERP'; }, []);

  useEffect(() => {
    fetch('/api/proxy/disciplinary/fault-types/active').then((r) => r.json()).then((d) => setFaultTypes(Array.isArray(d) ? d : []));
    fetch('/api/proxy/employees?isActive=true').then((r) => r.json()).then((d) => setEmployees(Array.isArray(d) ? d : []));
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (fEmployee) p.set('employeeId', fEmployee);
      if (fType) p.set('faultTypeId', fType);
      if (fLevel) p.set('level', fLevel);
      p.set('page', String(page)); p.set('limit', '25');
      const res = await fetch(`/api/proxy/disciplinary?${p.toString()}`);
      const data = await res.json();
      setItems(data.data || []);
      setTotal(data.total || 0);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar amonestaciones' });
    } finally {
      setLoading(false);
    }
  }, [fEmployee, fType, fLevel, page]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 4000); return () => clearTimeout(t); }
  }, [message]);

  // Preview del nivel que tocará (conteo actual del hilo + 1).
  useEffect(() => {
    if (!mEmployee || !mType) { setPreview(null); return; }
    const p = new URLSearchParams({ employeeId: mEmployee, faultTypeId: mType, limit: '1' });
    fetch(`/api/proxy/disciplinary?${p.toString()}`).then((r) => r.json()).then((d) => {
      const next = (d.total || 0) + 1;
      const lvl = next <= 1 ? 'LLAMADO' : next === 2 ? 'NOTIFICACION' : 'AMONESTACION';
      setPreview(`Este será el ${next}º de esta falta → ${LEVELS[lvl].label}`);
    }).catch(() => setPreview(null));
  }, [mEmployee, mType]);

  function openModal() {
    setMEmployee(''); setMType(''); setMReason(''); setMPhotos([]); setPreview(null);
    const now = new Date();
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    setMDate(local);
    setModalOpen(true);
  }

  async function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const encoded: string[] = [];
    for (const f of files.slice(0, 8)) encoded.push(await fileToDataUrl(f));
    setMPhotos((prev) => [...prev, ...encoded].slice(0, 8));
    e.target.value = '';
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    try {
      const res = await fetch('/api/proxy/disciplinary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: mEmployee,
          faultTypeId: mType,
          occurredAt: mDate ? `${mDate}T12:00:00-04:00` : undefined,
          reason: mReason,
          photos: mPhotos,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Error'); }
      const created = await res.json();
      setMessage({ type: 'success', text: `Registrado ${created.number} (${LEVELS[created.level]?.label || created.level})` });
      setModalOpen(false);
      fetchItems();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <ShieldAlert className="text-red-400" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Amonestaciones</h1>
            <p className="text-sm text-slate-400">{total} registros</p>
          </div>
        </div>
        <button onClick={openModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors">
          <Plus size={16} /> Registrar llamado
        </button>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-xl border text-sm font-medium ${message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
          {message.text}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-slate-700/50 bg-slate-800/30">
        <Filter size={16} className="text-slate-500" />
        <select value={fEmployee} onChange={(e) => { setPage(1); setFEmployee(e.target.value); }}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm">
          <option value="">Todos los empleados</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.customer.name}{e.code ? ` (${e.code})` : ''}</option>)}
        </select>
        <select value={fType} onChange={(e) => { setPage(1); setFType(e.target.value); }}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm">
          <option value="">Todas las faltas</option>
          {faultTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={fLevel} onChange={(e) => { setPage(1); setFLevel(e.target.value); }}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm">
          <option value="">Todos los niveles</option>
          <option value="LLAMADO">Llamado de atención</option>
          <option value="NOTIFICACION">Notificación</option>
          <option value="AMONESTACION">Amonestación</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-xl border border-slate-700/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800/60 border-b border-slate-700/50">
              <th className="text-left px-4 py-3 text-slate-400 font-medium">N°</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Empleado</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Tipo de falta</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Nivel</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Motivo</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Acta</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12"><Loader2 className="animate-spin inline-block text-slate-500" size={24} /></td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-slate-500">No hay amonestaciones</td></tr>
            ) : (
              items.map((a) => (
                <tr key={a.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 text-slate-300 font-mono text-xs">{a.number}</td>
                  <td className="px-4 py-3">
                    <Link href={`/payroll/disciplinary/employee/${a.employee.id}`}
                      className="text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1">
                      <User size={13} /> {a.employee.customer.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{a.faultType.name}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${LEVELS[a.level]?.cls || ''}`}>
                      {LEVELS[a.level]?.label || a.level}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{new Date(a.occurredAt).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' })}</td>
                  <td className="px-4 py-3 text-slate-300 max-w-xs truncate" title={a.reason}>{a.reason}</td>
                  <td className="px-4 py-3 text-center">
                    <a href={`/api/proxy/disciplinary/${a.id}/pdf`} target="_blank" rel="noreferrer"
                      className="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-blue-400 inline-flex" title="Acta PDF"><FileText size={15} /></a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm disabled:opacity-40">Anterior</button>
          <span className="text-slate-400 text-sm">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm disabled:opacity-40">Siguiente</button>
        </div>
      )}

      {/* Modal registro */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-100">Registrar llamado</h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Empleado *</label>
                <select value={mEmployee} onChange={(e) => setMEmployee(e.target.value)} required
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm">
                  <option value="">Selecciona…</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.customer.name}{e.code ? ` (${e.code})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tipo de falta *</label>
                <select value={mType} onChange={(e) => setMType(e.target.value)} required
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm">
                  <option value="">Selecciona…</option>
                  {faultTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {preview && (
                <div className="px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-sm">{preview}</div>
              )}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Fecha del suceso *</label>
                <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} required
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Motivo *</label>
                <textarea value={mReason} onChange={(e) => setMReason(e.target.value)} required rows={3} maxLength={2000}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm"
                  placeholder="Describe lo ocurrido…" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Foto(s) del acta firmada (opcional)</label>
                <input type="file" accept="image/*" multiple onChange={onPickPhotos}
                  className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-700 file:text-slate-200" />
                {mPhotos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {mPhotos.map((p, i) => (
                      <div key={i} className="relative">
                        <img src={p} alt="" className="w-14 h-14 object-cover rounded-lg border border-slate-700" />
                        <button type="button" onClick={() => setMPhotos((prev) => prev.filter((_, j) => j !== i))}
                          className="absolute -top-1.5 -right-1.5 bg-red-600 rounded-full p-0.5"><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button type="submit" disabled={processing}
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {processing && <Loader2 size={16} className="animate-spin" />}
                Registrar
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar en el navegador**

Entrar a `/payroll/disciplinary`. Registrar un llamado a un empleado con "Puntualidad" → debe salir "Llamado de atención". Repetir mismo empleado+falta → "Notificación" → "Amonestación" → "Amonestación". Registrar otra falta al mismo empleado → arranca en "Llamado" (hilo independiente). Abrir el Acta PDF. Probar filtros. Expected: escalado correcto por hilo, PDF abre, filtros funcionan.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(dashboard)/payroll/disciplinary/page.tsx"
git commit -m "feat(nomina): lista de amonestaciones + registro con escalado en vivo (frontend)"
```

---

## Task 8: Frontend — Vista por empleado (stepper)

**Files:**
- Create: `apps/web/src/app/(dashboard)/payroll/disciplinary/employee/[id]/page.tsx`

**Contrato** (`GET /disciplinary/by-employee/:employeeId`):
`{ employee: { id, code, customer:{name,rif,documentType}, position:{name}, department:{name} }, threads: [ { faultType:{id,name}, count, maxLevel, actions: [ { id, number, sequence, level, occurredAt, reason, photos } ] } ] }`

- [ ] **Step 1: Escribir la página**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Trash2, FileText, User } from 'lucide-react';

const STEPS = ['LLAMADO', 'NOTIFICACION', 'AMONESTACION'];
const STEP_LABEL: Record<string, string> = { LLAMADO: 'Llamado', NOTIFICACION: 'Notificación', AMONESTACION: 'Amonestación' };
const LEVEL_CLS: Record<string, string> = {
  LLAMADO: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  NOTIFICACION: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  AMONESTACION: 'bg-red-500/10 text-red-400 border-red-500/30',
};

interface Action { id: string; number: string; sequence: number; level: string; occurredAt: string; reason: string; photos: { id: string; thumbUrl: string; mediumUrl: string }[]; }
interface Thread { faultType: { id: string; name: string }; count: number; maxLevel: string; actions: Action[]; }
interface Data { employee: { id: string; code: string | null; customer: { name: string; rif: string | null; documentType: string | null }; position?: { name: string }; department?: { name: string } }; threads: Thread[]; }

export default function EmployeeDisciplinaryPage() {
  const params = useParams();
  const employeeId = params.id as string;
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/disciplinary/by-employee/${employeeId}`);
      if (!res.ok) throw new Error('Error al cargar');
      setData(await res.json());
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar el historial' });
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    if (data) document.title = `Amonestaciones — ${data.employee.customer.name} | Trinity ERP`;
  }, [data]);
  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 4000); return () => clearTimeout(t); }
  }, [message]);

  async function deleteLast(action: Action) {
    if (!confirm(`¿Eliminar el último llamado (${action.number} — ${STEP_LABEL[action.level]})? Esta acción baja el hilo un escalón.`)) return;
    try {
      const res = await fetch(`/api/proxy/disciplinary/${action.id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Error'); }
      setMessage({ type: 'success', text: 'Llamado eliminado' });
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  if (loading) return <div className="p-12 text-center"><Loader2 className="animate-spin inline-block text-slate-500" size={28} /></div>;
  if (!data) return <div className="p-12 text-center text-slate-500">No encontrado</div>;

  const cust = data.employee.customer;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Link href="/payroll/disciplinary" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft size={16} /> Volver a amonestaciones
      </Link>

      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20"><User className="text-blue-400" size={22} /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-100">{cust.name}</h1>
          <p className="text-sm text-slate-400">
            {cust.documentType || 'V'}-{cust.rif || '—'}
            {data.employee.position?.name ? ` · ${data.employee.position.name}` : ''}
            {data.employee.department?.name ? ` · ${data.employee.department.name}` : ''}
          </p>
        </div>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-xl border text-sm font-medium ${message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
          {message.text}
        </div>
      )}

      {data.threads.length === 0 ? (
        <div className="p-12 text-center text-slate-500 rounded-xl border border-slate-700/50">Este empleado no tiene llamados registrados.</div>
      ) : (
        <div className="space-y-5">
          {data.threads.map((th) => {
            const reached = STEPS.indexOf(th.maxLevel); // 0,1,2
            const last = th.actions[th.actions.length - 1];
            return (
              <div key={th.faultType.id} className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-100">{th.faultType.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${LEVEL_CLS[th.maxLevel]}`}>{STEP_LABEL[th.maxLevel]}</span>
                </div>

                {/* Stepper */}
                <div className="flex items-center gap-2 mb-4">
                  {STEPS.map((s, i) => (
                    <div key={s} className="flex items-center gap-2 flex-1">
                      <div className={`flex items-center gap-1.5 ${i <= reached ? 'text-slate-100' : 'text-slate-600'}`}>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${i <= reached ? LEVEL_CLS[s] : 'border-slate-700 text-slate-600'}`}>{i + 1}</span>
                        <span className="text-xs font-medium">{STEP_LABEL[s]}</span>
                      </div>
                      {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 ${i < reached ? 'bg-slate-500' : 'bg-slate-700'}`} />}
                    </div>
                  ))}
                </div>

                {/* Eventos del hilo */}
                <div className="space-y-2">
                  {th.actions.map((a) => (
                    <div key={a.id} className="flex items-start justify-between gap-3 px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-700/30">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-slate-400">{a.number}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${LEVEL_CLS[a.level]}`}>{STEP_LABEL[a.level]}</span>
                          <span className="text-xs text-slate-500">{new Date(a.occurredAt).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' })}</span>
                        </div>
                        <p className="text-sm text-slate-300 mt-1">{a.reason}</p>
                        {a.photos.length > 0 && (
                          <div className="flex gap-1.5 mt-1.5">
                            {a.photos.map((p) => (
                              <a key={p.id} href={p.mediumUrl} target="_blank" rel="noreferrer">
                                <img src={p.thumbUrl} alt="" className="w-10 h-10 object-cover rounded border border-slate-700" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <a href={`/api/proxy/disciplinary/${a.id}/pdf`} target="_blank" rel="noreferrer"
                          className="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-blue-400" title="Acta PDF"><FileText size={14} /></a>
                        {a.id === last.id && (
                          <button onClick={() => deleteLast(a)}
                            className="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-red-400" title="Eliminar (solo el último)"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar en el navegador**

Desde la lista, clic en el nombre de un empleado → abre `/payroll/disciplinary/employee/[id]`. Verificar: un hilo por tipo de falta, stepper marcando el nivel alcanzado, eventos listados, botón eliminar SOLO en el último de cada hilo. Eliminar el último de un hilo con 3 → baja a "Notificación". Intentar eliminar uno intermedio no debe ser posible (no aparece el botón). Expected: todo coherente.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(dashboard)/payroll/disciplinary/employee/[id]/page.tsx"
git commit -m "feat(nomina): vista por empleado tipo stepper + eliminar el ultimo del hilo (frontend)"
```

---

## Task 9: Navegación en el sidebar

**Files:**
- Modify: `apps/web/src/components/sidebar.tsx` (grupo `key: 'payroll'`, ~línea 220-226)

- [ ] **Step 1: Agregar 2 ítems al grupo NOMINA**

En el array `items` del grupo `payroll`, después de `{ label: 'Parametros', href: '/payroll/parameters', ... }`, añadir:

```tsx
      { label: 'Amonestaciones', href: '/payroll/disciplinary', icon: <AlertTriangle size={18} /> },
      { label: 'Tipos de falta', href: '/payroll/fault-types', icon: <Layers size={18} /> },
```

(Ambos iconos `AlertTriangle` y `Layers` ya están importados en `sidebar.tsx` — no hace falta tocar imports.)

- [ ] **Step 2: Verificar**

Recargar la app. En el menú NOMINA deben aparecer "Amonestaciones" y "Tipos de falta" y navegar correctamente. Expected: ambos visibles para un usuario con permiso `payroll`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/sidebar.tsx
git commit -m "feat(nomina): entradas de Amonestaciones y Tipos de falta en el sidebar"
```

---

## Task 10: Verificación integral + checklist pre-deploy

- [ ] **Step 1: Typecheck backend y frontend**

Run (con los `dev` apagados para el build del web; typecheck del API con tsc):
```bash
cd apps/api && npx tsc --noEmit
cd ../web && npx tsc --noEmit
```
Expected: sin errores en ninguno.

- [ ] **Step 2: Prueba e2e manual (flujo completo)**

1. Crear tipos de falta "Puntualidad" y "Procedimiento".
2. A un empleado: registrar Puntualidad ×3 → Llamado, Notificación, Amonestación; una 4ª → Amonestación (topa).
3. Al mismo empleado: registrar Procedimiento ×1 → Llamado (hilo independiente, no afectado por Puntualidad).
4. Abrir vista por empleado → 2 hilos con sus steppers correctos.
5. Descargar acta PDF de una amonestación → datos y firmas correctos.
6. Adjuntar foto en un registro → se ve la miniatura y abre el lightbox.
7. Eliminar el último de Puntualidad → baja a Amonestación (seguía en 3) / al nivel que corresponda; el botón eliminar solo aparece en el último.

Expected: todos los puntos OK.

- [ ] **Step 3: Checklist pre-deploy (regla del proyecto)**

Verificar antes de decirle a Diego que despliegue:
- `git status` limpio (todo commiteado y pusheado): controller, service, pdf, module, dtos, `app.module.ts`, migración, `fix-schema.sql`, schema.prisma, 3 páginas web, sidebar.
- La migración `20260826160000_disciplinary_module` está commiteada.
- `app.module.ts` importa y registra `DisciplinaryModule`.
- El endpoint nuevo lo consume el frontend vía `/api/proxy/disciplinary/*` (no requiere config extra de proxy — es catch-all).

- [ ] **Step 4: Push**

```bash
git push origin main
```

- [ ] **Step 5: Deploy (lo ejecuta Diego)**

Recordar a Diego el comando de deploy del proyecto:
```bash
ssh root@134.209.164.59 "cd /opt/Trinity && git pull origin main && bash deploy.sh"
```
(La grande `inversiones` es donde vive nómina con empleados reales. `deploy.sh` corre `prisma migrate deploy` + `fix-schema.sql` como red de seguridad.)

---

## Self-Review (cobertura del spec)

- **Escalado por tipo de falta:** Task 3 (`levelForSequence` + conteo por `employeeId+faultTypeId`), Task 7/8 (UI por hilo). ✅
- **Topa en Amonestación:** `levelForSequence` devuelve AMONESTACION para seq≥3. ✅
- **Catálogo administrable por cualquiera con módulo Nómina:** `@RequireModule('payroll')`, Task 6 (CRUD). ✅
- **Eliminar solo el último:** Task 3 `remove()` valida `sequence === max`. UI solo muestra el botón en el último (Task 8). ✅
- **Acta PDF + adjuntar foto del acta firmada:** Task 4 (PDF), Task 3 (adjuntos a Spaces), Task 7 (subida), Task 8 (visualización). ✅
- **No afecta nómina:** sin toques al cálculo/PayrollRun. ✅
- **Sin override manual / sin edición intermedia:** no hay endpoint de update de nivel ni de edición de acción. ✅
- **Consistencia de tipos/rutas:** `level` ∈ {LLAMADO,NOTIFICACION,AMONESTACION} en DTO, servicio, PDF y UI; rutas `disciplinary/fault-types`, `disciplinary/by-employee/:id`, `disciplinary/:id/pdf`, `disciplinary` coinciden entre controller y las 3 páginas. ✅
