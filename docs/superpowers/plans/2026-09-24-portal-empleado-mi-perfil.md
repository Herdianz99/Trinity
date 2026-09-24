# Portal del empleado ("Mi Perfil") + Notificaciones — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a cada empleado (con su propio login) una sección "Mi Perfil" de solo-lectura con sus datos, límite de crédito, CxC, facturas, recibos de nómina (con la deducción aplicada a su deuda) y amonestaciones, más un buzón de notificaciones con acuse "enterado / en desacuerdo" + comentario; y que una amonestación genere automáticamente su notificación.

**Architecture:** Se ancla `User → Employee` con un campo `employeeId` nuevo (FK única y nullable). Un rol nuevo `EMPLOYEE` (permiso único `mi-perfil`) restringe a esos usuarios a su portal. Dos módulos NestJS nuevos: `me` (vistas de solo-lectura scoped por token) y `notifications` (emisor + buzón + acuse). El frontend añade la sección `/mi-perfil/*` y el emisor bajo RRHH. Todo scoping se resuelve desde `@CurrentUser`, nunca desde parámetros del navegador.

**Tech Stack:** NestJS + Prisma + PostgreSQL (apps/api); Next.js 14 App Router + Tailwind (apps/web); monorepo pnpm+turbo.

---

## Convenciones y verificación (LEER PRIMERO)

**El repo NO tiene harness de tests** (no hay jest ni `*.spec.ts` en uso). La verificación establecida del proyecto es:
- **Typecheck backend:** `cd apps/api && npx tsc --noEmit -p tsconfig.json` (debe salir sin output).
- **Typecheck frontend:** `cd apps/web && npx tsc --noEmit` (ignorar errores preexistentes ajenos a los archivos tocados).
- **E2E manual con JWT:** levantar local (`pnpm dev`), obtener un `accessToken` (login) y probar endpoints con `curl`, y las pantallas en el navegador (`http://localhost:3000`).

Por eso **cada tarea usa typecheck + prueba en runtime** en vez de tests unitarios. NO agregar jest/vitest (sería un cambio unilateral contra el patrón del repo).

**Reglas del repo que aplican a TODAS las tareas:**
- Migraciones Prisma **aditivas e idempotentes** (`IF NOT EXISTS`, `ADD VALUE IF NOT EXISTS`) y reflejadas en `deploy/fix-schema.sql`.
- `document.title` con patrón `'... | Trinity ERP'` en cada página nueva (useEffect).
- Fechas de negocio con el helper `apps/api/src/common/timezone.ts` cuando aplique; en frontend, fechas locales con getFullYear()/getMonth()/getDate(), nunca toISOString().
- Todo campo monetario USD ya trae su Bs calculado y guardado — el portal **solo lee**, no recalcula.
- Frontend llama al API vía proxy: `fetch('/api/proxy/<ruta-del-api>')`.
- Commits: `tipo: Session 141 - descripción` (esta es la Sesión 141). Push tras cada commit al terminar la sesión; los commits por tarea pueden quedar locales hasta el final.

**No desplegar** hasta terminar y que Diego lo apruebe. La migración es aditiva (segura).

---

## Estructura de archivos

**Backend (apps/api/src):**
- Modificar: `packages/database/prisma/schema.prisma` (User, Employee, DisciplinaryAction, enum UserRole, + modelos/enums de notificaciones)
- Crear: `packages/database/prisma/migrations/20260924120000_portal_empleado/migration.sql`
- Modificar: `deploy/fix-schema.sql`
- Modificar: `apps/api/src/modules/auth/role-permissions.ts` (rol EMPLOYEE)
- Modificar: `apps/api/src/modules/role-permissions/role-permissions.service.ts` (VALID_MODULES += 'mi-perfil')
- Modificar: `apps/api/src/modules/users/dto/create-user.dto.ts` + `users.service.ts` (campo employeeId)
- Modificar: `apps/api/src/modules/payroll/payroll.module.ts` (exportar PayrollPdfService)
- Crear módulo `me`: `apps/api/src/modules/me/{me.module.ts,me.service.ts,me.controller.ts}`
- Crear módulo `notifications`: `apps/api/src/modules/notifications/{notifications.module.ts,notifications.service.ts,notifications.controller.ts,dto/create-notification.dto.ts,dto/ack-notification.dto.ts}`
- Modificar: `apps/api/src/modules/disciplinary/disciplinary.service.ts` + `disciplinary.module.ts` (integración amonestación→notificación)
- Modificar: `apps/api/src/app.module.ts` (registrar MeModule, NotificationsModule)

**Frontend (apps/web/src):**
- Modificar: `apps/web/src/components/sidebar.tsx` (sección "Mi Perfil")
- Modificar: `apps/web/src/app/(auth)/login/page.tsx` (redirect EMPLOYEE)
- Crear: `apps/web/src/app/(dashboard)/mi-perfil/page.tsx` (dashboard) + subpáginas `datos/`, `cxc/`, `facturas/`, `recibos/`, `amonestaciones/`, `notificaciones/`
- Crear: `apps/web/src/app/(dashboard)/rrhh/notificaciones/page.tsx` (emisor)
- Modificar: `apps/web/src/app/(dashboard)/settings/users/page.tsx` (selector de empleado al crear/editar usuario)

---

## FASE 0 — Esquema y migración

### Task 1: Schema Prisma + migración + fix-schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260924120000_portal_empleado/migration.sql`
- Modify: `deploy/fix-schema.sql`

- [ ] **Step 1: Agregar `EMPLOYEE` al enum UserRole**

En `schema.prisma`, en `enum UserRole { ... }` (junto a los demás), añadir la última línea:

```prisma
enum UserRole {
  ADMIN
  SUPERVISOR
  CASHIER
  SELLER
  WAREHOUSE
  BUYER
  ACCOUNTANT
  AUDITOR
  RRHH
  SEGURIDAD
  EMPLOYEE
}
```

- [ ] **Step 2: Ancla User→Employee + inversa**

En `model User`, agregar el campo y la relación (dentro del modelo, junto a los demás campos escalares y relaciones):

```prisma
  employeeId          String?   @unique
  employee            Employee? @relation("EmployeeUser", fields: [employeeId], references: [id], onDelete: SetNull)
```

En `model Employee`, agregar la inversa:

```prisma
  user                User?     @relation("EmployeeUser")
```

- [ ] **Step 3: Modelos y enums de notificaciones**

Añadir al final de `schema.prisma` (después del bloque de nómina/disciplinary):

```prisma
enum NotificationType {
  INFORMATIVA
  REUNION
  AMONESTACION
}

enum NotificationAckState {
  PENDIENTE
  RECIBIDO
  RECHAZADO
}

model Notification {
  id                    String                  @id @default(cuid())
  title                 String
  body                  String
  type                  NotificationType        @default(INFORMATIVA)
  disciplinaryActionId  String?                 @unique
  disciplinaryAction    DisciplinaryAction?     @relation(fields: [disciplinaryActionId], references: [id], onDelete: Cascade)
  createdById           String
  createdBy             User                    @relation("NotificationCreator", fields: [createdById], references: [id])
  recipients            NotificationRecipient[]
  createdAt             DateTime                @default(now())
  updatedAt             DateTime                @updatedAt

  @@index([type])
  @@index([createdAt])
}

model NotificationRecipient {
  id              String               @id @default(cuid())
  notificationId  String
  notification    Notification         @relation(fields: [notificationId], references: [id], onDelete: Cascade)
  employeeId      String
  employee        Employee             @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  ackState        NotificationAckState @default(PENDIENTE)
  comment         String?
  ackAt           DateTime?
  createdAt       DateTime             @default(now())

  @@unique([notificationId, employeeId])
  @@index([employeeId, ackState])
}
```

- [ ] **Step 4: Relaciones inversas en User, Employee, DisciplinaryAction**

En `model User`, agregar la inversa nombrada:

```prisma
  notificationsCreated  Notification[]  @relation("NotificationCreator")
```

En `model Employee`, agregar:

```prisma
  notificationRecipients NotificationRecipient[]
```

En `model DisciplinaryAction`, agregar la inversa 1:1:

```prisma
  notification          Notification?
```

- [ ] **Step 5: Escribir la migración SQL idempotente**

Crear `packages/database/prisma/migrations/20260924120000_portal_empleado/migration.sql`:

```sql
-- Portal del empleado (Mi Perfil) + Notificaciones. Aditivo e idempotente.

-- 1) Rol EMPLOYEE
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'EMPLOYEE';

-- 2) Ancla User -> Employee
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_employeeId_key" ON "User"("employeeId");
DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Enums de notificaciones
DO $$ BEGIN CREATE TYPE "NotificationType" AS ENUM ('INFORMATIVA','REUNION','AMONESTACION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "NotificationAckState" AS ENUM ('PENDIENTE','RECIBIDO','RECHAZADO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Tabla Notification
CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL DEFAULT 'INFORMATIVA',
  "disciplinaryActionId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Notification_disciplinaryActionId_key" ON "Notification"("disciplinaryActionId");
CREATE INDEX IF NOT EXISTS "Notification_type_idx" ON "Notification"("type");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");
DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_disciplinaryActionId_fkey"
    FOREIGN KEY ("disciplinaryActionId") REFERENCES "DisciplinaryAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5) Tabla NotificationRecipient
CREATE TABLE IF NOT EXISTS "NotificationRecipient" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "ackState" "NotificationAckState" NOT NULL DEFAULT 'PENDIENTE',
  "comment" TEXT,
  "ackAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationRecipient_notificationId_employeeId_key" ON "NotificationRecipient"("notificationId","employeeId");
CREATE INDEX IF NOT EXISTS "NotificationRecipient_employeeId_ackState_idx" ON "NotificationRecipient"("employeeId","ackState");
DO $$ BEGIN
  ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_notificationId_fkey"
    FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 6: Reflejar en deploy/fix-schema.sql**

Añadir al final de `deploy/fix-schema.sql` el mismo bloque SQL del Step 5 (idempotente; red de seguridad del deploy). Copiar textualmente los apartados 1–5.

- [ ] **Step 7: Aplicar migración y generar cliente**

Run: `cd /c/Users/Diego/Desktop/Trinity && pnpm db:migrate` (nombre de migración: `portal_empleado` si lo pide) y luego `pnpm db:generate`
Expected: migración aplicada sin error; cliente Prisma regenerado con los nuevos modelos.

- [ ] **Step 8: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260924120000_portal_empleado deploy/fix-schema.sql
git commit -m "feat: Session 141 - schema portal empleado (User.employeeId, rol EMPLOYEE, Notification/NotificationRecipient)"
```

---

## FASE 1 — Rol, ancla en usuarios

### Task 2: Rol EMPLOYEE en el mapa de permisos

**Files:**
- Modify: `apps/api/src/modules/auth/role-permissions.ts`
- Modify: `apps/api/src/modules/role-permissions/role-permissions.service.ts`

- [ ] **Step 1: Añadir EMPLOYEE a ROLE_PERMISSIONS**

En `apps/api/src/modules/auth/role-permissions.ts`, dentro del objeto `ROLE_PERMISSIONS`, agregar:

```typescript
  EMPLOYEE: ['mi-perfil'],
```

- [ ] **Step 2: Registrar 'mi-perfil' como módulo válido**

En `apps/api/src/modules/role-permissions/role-permissions.service.ts`, en el array `VALID_MODULES`, agregar `'mi-perfil'` (junto a los otros módulos, antes de las claves de permiso en MAYÚSCULAS):

```typescript
  'exhibicion', 'mi-perfil',
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: sin output (o solo warnings preexistentes ajenos).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/auth/role-permissions.ts apps/api/src/modules/role-permissions/role-permissions.service.ts
git commit -m "feat: Session 141 - rol EMPLOYEE con permiso mi-perfil"
```

### Task 3: Campo employeeId en el CRUD de usuarios (backend)

**Files:**
- Modify: `apps/api/src/modules/users/dto/create-user.dto.ts`
- Modify: `apps/api/src/modules/users/users.service.ts`

- [ ] **Step 1: Agregar employeeId al DTO**

En `create-user.dto.ts`, agregar el campo (el `UpdateUserDto` ya lo hereda por `PartialType`):

```typescript
  @ApiProperty({ required: false, description: 'Empleado de nómina vinculado (para el portal Mi Perfil)' })
  @IsOptional()
  @IsString()
  employeeId?: string;
```

- [ ] **Step 2: Guardar employeeId en create**

En `users.service.ts`, método `create`, dentro del objeto `data` del `prisma.user.create`, agregar:

```typescript
      employeeId: dto.employeeId || null,
```

- [ ] **Step 3: Guardar employeeId en update**

En `users.service.ts`, método `update`, junto a las asignaciones condicionales de `data`, agregar:

```typescript
  if (dto.employeeId !== undefined) data.employeeId = dto.employeeId || null;
```

- [ ] **Step 4: Devolver el empleado vinculado en findOne/findAll**

En `users.service.ts`, en `findAll` y `findOne`, incluir el empleado para que el frontend muestre a quién está vinculado. Añadir al `select`/`include` de cada consulta (usar `include` si hoy no hay select restrictivo; si hay select, añadir la relación):

```typescript
      employee: { select: { id: true, code: true, customer: { select: { name: true } } } },
```

(Nota: el objeto de retorno ya elimina `password`; `employee` es seguro de exponer.)

- [ ] **Step 5: Typecheck**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: sin output.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/users
git commit -m "feat: Session 141 - vincular User a Employee (employeeId) en el CRUD de usuarios"
```

### Task 4: Selector de empleado en la pantalla de usuarios (frontend)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/settings/users/page.tsx`

- [ ] **Step 1: Cargar la lista de empleados para el selector**

En `users/page.tsx`, agregar estado y carga de empleados (usa el endpoint existente `GET /employees`):

```typescript
  const [employees, setEmployees] = useState<{ id: string; code: string | null; customer: { name: string } }[]>([]);
  useEffect(() => {
    fetch('/api/proxy/employees')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setEmployees(Array.isArray(data) ? data : data.items ?? []))
      .catch(() => setEmployees([]));
  }, []);
```

- [ ] **Step 2: Añadir el campo al formulario del modal**

En el form del modal de crear/editar usuario, agregar un `<select>` (incluir `employeeId` en el estado del formulario, valor por defecto `''`):

```tsx
<label className="text-sm block">
  <span className="text-slate-400">Empleado vinculado (portal Mi Perfil)</span>
  <select
    value={form.employeeId ?? ''}
    onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
    className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
  >
    <option value="">— Sin vincular —</option>
    {employees.map((emp) => (
      <option key={emp.id} value={emp.id}>
        {emp.customer?.name} {emp.code ? `(${emp.code})` : ''}
      </option>
    ))}
  </select>
</label>
```

- [ ] **Step 3: Enviar employeeId en submit**

En el `body` del `fetch` de crear y de editar usuario, incluir:

```typescript
        employeeId: form.employeeId || null,
```

Y al abrir el modal en modo edición, precargar `employeeId: user.employeeId ?? ''` en el estado del formulario.

- [ ] **Step 4: Verificar en runtime**

Levantar local, entrar como ADMIN a Configuración → Usuarios, crear/editar un usuario y confirmar que el selector lista empleados y que al guardar y reabrir queda seleccionado el empleado.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(dashboard)/settings/users/page.tsx"
git commit -m "feat: Session 141 - selector de empleado vinculado en la pantalla de usuarios"
```

---

## FASE 2 — Backend módulo `me` (vistas de solo-lectura)

### Task 5: Scaffold del módulo `me` + perfil + resolución segura del empleado

**Files:**
- Create: `apps/api/src/modules/me/me.module.ts`
- Create: `apps/api/src/modules/me/me.service.ts`
- Create: `apps/api/src/modules/me/me.controller.ts`
- Modify: `apps/api/src/modules/payroll/payroll.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Exportar PayrollPdfService desde PayrollModule**

En `payroll.module.ts`, asegurarse de que `PayrollPdfService` esté en `exports` (agregarlo si falta):

```typescript
  exports: [PayrollPdfService],
```

- [ ] **Step 2: Crear me.service.ts con el helper de resolución + perfil**

`apps/api/src/modules/me/me.service.ts`:

```typescript
import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MeService {
  constructor(private prisma: PrismaService) {}

  /**
   * Resuelve el empleado (y su customer) del usuario logueado. Lanza 403 si el usuario
   * no tiene un empleado vinculado (no debe ver el portal).
   */
  private async resolveEmployee(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { employeeId: true },
    });
    if (!user?.employeeId) {
      throw new ForbiddenException('Tu usuario no está vinculado a un empleado.');
    }
    const employee = await this.prisma.employee.findUnique({
      where: { id: user.employeeId },
      select: { id: true, customerId: true },
    });
    if (!employee) throw new ForbiddenException('Empleado no encontrado.');
    return employee; // { id, customerId }
  }

  async getPerfil(userId: string) {
    const { id } = await this.resolveEmployee(userId);
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      select: {
        id: true, code: true, bank: true, salaryBaseUsd: true, bonusUsd: true,
        frequency: true, isActive: true,
        department: { select: { name: true } },
        position: { select: { name: true } },
        customer: {
          select: {
            name: true, documentType: true, rif: true, phone: true, email: true,
            address: true, creditLimit: true, creditDays: true, code: true,
          },
        },
      },
    });
    return employee;
  }
}
```

- [ ] **Step 3: Crear me.controller.ts**

`apps/api/src/modules/me/me.controller.ts`:

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { MeService } from './me.service';

@ApiTags('Me - Mi Perfil')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('mi-perfil')
@Controller('me')
export class MeController {
  constructor(private service: MeService) {}

  @Get('perfil')
  getPerfil(@CurrentUser('id') userId: string) {
    return this.service.getPerfil(userId);
  }
}
```

> **Nota de seguridad:** `@RequireModule('mi-perfil')` permite el acceso a EMPLOYEE (permiso `mi-perfil`) y a ADMIN (`*`). Roles como cajero/vendedor NO tienen `mi-perfil` en su lista por defecto; si Diego quiere que también vean su portal, se agrega `'mi-perfil'` a esos roles en `ROLE_PERMISSIONS` (Task 2). Para v1 basta EMPLOYEE + ADMIN.

- [ ] **Step 4: Crear me.module.ts y registrar en app.module**

`apps/api/src/modules/me/me.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { MeService } from './me.service';
import { MeController } from './me.controller';
import { PayrollModule } from '../payroll/payroll.module';

@Module({
  imports: [PayrollModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
```

En `app.module.ts`, importar y agregar `MeModule` al array `imports`.

- [ ] **Step 5: Typecheck**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: sin output.

- [ ] **Step 6: Prueba en runtime**

Levantar local. Con un token de un usuario vinculado a un empleado:
Run: `curl -s http://localhost:4000/me/perfil -H "Authorization: Bearer <TOKEN>"`
Expected: JSON con datos del empleado + customer (creditLimit, etc.). Con un usuario SIN empleado: `403`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/me apps/api/src/modules/payroll/payroll.module.ts apps/api/src/app.module.ts
git commit -m "feat: Session 141 - modulo me: GET /me/perfil (scoped por token)"
```

### Task 6: `/me/cxc`, `/me/facturas`, `/me/recibos`, `/me/amonestaciones`, `/me/resumen`

**Files:**
- Modify: `apps/api/src/modules/me/me.service.ts`
- Modify: `apps/api/src/modules/me/me.controller.ts`

- [ ] **Step 1: CxC del empleado (por customerId)**

En `me.service.ts`, agregar:

```typescript
  async getCxc(userId: string) {
    const { customerId } = await this.resolveEmployee(userId);
    if (!customerId) return [];
    const rows = await this.prisma.receivable.findMany({
      where: { customerId, status: { not: 'CANCELLED' } },
      select: {
        id: true, number: true, documentNumber: true, type: true,
        amountUsd: true, amountBs: true, paidAmountUsd: true, paidAmountBs: true,
        dueDate: true, originalDate: true, status: true, currency: true,
      },
      orderBy: [{ dueDate: 'asc' }, { originalDate: 'asc' }],
    });
    return rows.map((r) => ({ ...r, saldoUsd: Math.round((r.amountUsd - r.paidAmountUsd) * 100) / 100 }));
  }
```

- [ ] **Step 2: Facturas del empleado**

```typescript
  async getFacturas(userId: string) {
    const { customerId } = await this.resolveEmployee(userId);
    if (!customerId) return [];
    const rows = await this.prisma.invoice.findMany({
      where: { customerId },
      select: {
        id: true, number: true, fiscalNumber: true, status: true,
        totalUsd: true, totalBs: true, totalPaidUsd: true,
        isCredit: true, dueDate: true, createdAt: true, paidAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((i) => ({ ...i, saldoUsd: Math.round((i.totalUsd - i.totalPaidUsd) * 100) / 100 }));
  }
```

- [ ] **Step 3: Recibos de nómina + deducción a su deuda**

```typescript
  async getRecibos(userId: string) {
    const { id: employeeId } = await this.resolveEmployee(userId);
    const lines = await this.prisma.payrollRunLine.findMany({
      where: { employeeId, payrollRun: { status: 'CLOSED' } },
      select: {
        id: true, grossBs: true, totalDeductionsBs: true, netBs: true, netUsd: true,
        creditDeductionBs: true,
        payrollRun: { select: { id: true, number: true, periodFrom: true, periodTo: true, type: true, exchangeRate: true } },
      },
      orderBy: { payrollRun: { periodTo: 'desc' } },
    });
    return lines;
  }
```

> Confirmar el nombre de la relación en `PayrollRunLine` hacia la corrida (`payrollRun`). Si en el schema se llama distinto (p.ej. `run`), usar ese nombre en `where`, `select` y `orderBy`.

- [ ] **Step 4: Amonestaciones del empleado**

```typescript
  async getAmonestaciones(userId: string) {
    const { id: employeeId } = await this.resolveEmployee(userId);
    return this.prisma.disciplinaryAction.findMany({
      where: { employeeId },
      select: {
        id: true, number: true, level: true, sequence: true, occurredAt: true, reason: true,
        faultType: { select: { name: true } },
        attachments: { select: { id: true, thumbKey: true, mediumKey: true } },
      },
      orderBy: { occurredAt: 'desc' },
    });
  }
```

- [ ] **Step 5: Resumen para el dashboard del portal**

```typescript
  async getResumen(userId: string) {
    const { id: employeeId, customerId } = await this.resolveEmployee(userId);
    const [cxc, facturasPend, notifPend] = await Promise.all([
      customerId
        ? this.prisma.receivable.aggregate({
            where: { customerId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
            _sum: { amountUsd: true, paidAmountUsd: true },
          })
        : Promise.resolve({ _sum: { amountUsd: 0, paidAmountUsd: 0 } } as any),
      customerId
        ? this.prisma.invoice.count({ where: { customerId, status: 'PENDING' } })
        : Promise.resolve(0),
      this.prisma.notificationRecipient.count({ where: { employeeId, ackState: 'PENDIENTE' } }),
    ]);
    const saldoCxcUsd = Math.round(((cxc._sum.amountUsd || 0) - (cxc._sum.paidAmountUsd || 0)) * 100) / 100;
    return { saldoCxcUsd, facturasPendientes: facturasPend, notificacionesPendientes: notifPend };
  }
```

- [ ] **Step 6: Endpoints en el controller**

En `me.controller.ts`, agregar:

```typescript
  @Get('cxc')
  getCxc(@CurrentUser('id') userId: string) { return this.service.getCxc(userId); }

  @Get('facturas')
  getFacturas(@CurrentUser('id') userId: string) { return this.service.getFacturas(userId); }

  @Get('recibos')
  getRecibos(@CurrentUser('id') userId: string) { return this.service.getRecibos(userId); }

  @Get('amonestaciones')
  getAmonestaciones(@CurrentUser('id') userId: string) { return this.service.getAmonestaciones(userId); }

  @Get('resumen')
  getResumen(@CurrentUser('id') userId: string) { return this.service.getResumen(userId); }
```

- [ ] **Step 7: Typecheck + runtime**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json` (sin output).
Con token válido: `curl -s http://localhost:4000/me/cxc -H "Authorization: Bearer <TOKEN>"` (y `/me/facturas`, `/me/recibos`, `/me/amonestaciones`, `/me/resumen`) → JSON con datos del propio empleado.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/me
git commit -m "feat: Session 141 - me: cxc, facturas, recibos (con deduccion nomina), amonestaciones, resumen"
```

### Task 7: PDF del recibo propio (`/me/recibos/:lineId/pdf`)

**Files:**
- Modify: `apps/api/src/modules/me/me.service.ts`
- Modify: `apps/api/src/modules/me/me.controller.ts`

- [ ] **Step 1: Método que valida propiedad y genera el PDF**

En `me.service.ts`, inyectar `PayrollPdfService` en el constructor:

```typescript
import { PayrollPdfService } from '../payroll/payroll-pdf.service';
// ...
  constructor(private prisma: PrismaService, private payrollPdf: PayrollPdfService) {}
```

Y agregar:

```typescript
  async getReciboPdf(userId: string, lineId: string, overtime: boolean): Promise<Buffer> {
    const { id: employeeId } = await this.resolveEmployee(userId);
    const line = await this.prisma.payrollRunLine.findUnique({
      where: { id: lineId },
      select: { id: true, employeeId: true, payrollRunId: true },
    });
    if (!line || line.employeeId !== employeeId) {
      throw new ForbiddenException('Recibo no disponible.');
    }
    return this.payrollPdf.generateReceipt(line.payrollRunId, lineId, overtime);
  }
```

> Confirmar el nombre del campo FK a la corrida (`payrollRunId`) y la firma `generateReceipt(runId, lineId, overtime)` en `payroll-pdf.service.ts`. Ajustar si difiere.

- [ ] **Step 2: Endpoint que sirve el PDF**

En `me.controller.ts`, importar `Res`, `Param`, `Query` de `@nestjs/common` y `Response` de `express`, y agregar:

```typescript
  @Get('recibos/:lineId/pdf')
  async getReciboPdf(
    @CurrentUser('id') userId: string,
    @Param('lineId') lineId: string,
    @Query('overtime') overtime: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.getReciboPdf(userId, lineId, overtime !== 'false');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="recibo-${lineId}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
```

- [ ] **Step 3: Typecheck + runtime**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json` (sin output).
`curl -s http://localhost:4000/me/recibos/<LINE_ID>/pdf -H "Authorization: Bearer <TOKEN>" -o /tmp/recibo.pdf` → PDF válido. Probar con un `lineId` de OTRO empleado → `403`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/me
git commit -m "feat: Session 141 - me: descargar PDF del propio recibo (valida propiedad)"
```

---

## FASE 3 — Backend módulo `notifications`

### Task 8: Scaffold + crear notificación (emisor) con expansión de destino

**Files:**
- Create: `apps/api/src/modules/notifications/notifications.module.ts`
- Create: `apps/api/src/modules/notifications/notifications.service.ts`
- Create: `apps/api/src/modules/notifications/notifications.controller.ts`
- Create: `apps/api/src/modules/notifications/dto/create-notification.dto.ts`
- Create: `apps/api/src/modules/notifications/dto/ack-notification.dto.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: DTO de creación**

`apps/api/src/modules/notifications/dto/create-notification.dto.ts`:

```typescript
import { IsString, IsIn, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class TargetDto {
  @IsIn(['INDIVIDUAL', 'MULTIPLE', 'DEPARTMENT', 'ALL'])
  mode: 'INDIVIDUAL' | 'MULTIPLE' | 'DEPARTMENT' | 'ALL';

  @IsOptional() @IsArray() @IsString({ each: true })
  employeeIds?: string[];

  @IsOptional() @IsString()
  departmentId?: string;
}

export class CreateNotificationDto {
  @IsString() title: string;
  @IsString() body: string;
  @IsIn(['INFORMATIVA', 'REUNION', 'AMONESTACION'])
  type: 'INFORMATIVA' | 'REUNION' | 'AMONESTACION';

  @ValidateNested() @Type(() => TargetDto)
  target: TargetDto;
}
```

- [ ] **Step 2: DTO de acuse**

`apps/api/src/modules/notifications/dto/ack-notification.dto.ts`:

```typescript
import { IsIn, IsOptional, IsString } from 'class-validator';

export class AckNotificationDto {
  @IsIn(['RECIBIDO', 'RECHAZADO'])
  ackState: 'RECIBIDO' | 'RECHAZADO';

  @IsOptional() @IsString()
  comment?: string;
}
```

- [ ] **Step 3: Service — crear con expansión de destinatarios**

`apps/api/src/modules/notifications/notifications.service.ts`:

```typescript
import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { AckNotificationDto } from './dto/ack-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /** Expande el target a una lista de employeeIds (solo empleados activos). */
  private async resolveTargetEmployeeIds(target: CreateNotificationDto['target']): Promise<string[]> {
    if (target.mode === 'INDIVIDUAL' || target.mode === 'MULTIPLE') {
      const ids = target.employeeIds ?? [];
      if (!ids.length) throw new BadRequestException('Debes elegir al menos un empleado');
      const found = await this.prisma.employee.findMany({
        where: { id: { in: ids }, isActive: true }, select: { id: true },
      });
      return found.map((e) => e.id);
    }
    if (target.mode === 'DEPARTMENT') {
      if (!target.departmentId) throw new BadRequestException('Falta el departamento');
      const found = await this.prisma.employee.findMany({
        where: { departmentId: target.departmentId, isActive: true }, select: { id: true },
      });
      return found.map((e) => e.id);
    }
    // ALL
    const found = await this.prisma.employee.findMany({ where: { isActive: true }, select: { id: true } });
    return found.map((e) => e.id);
  }

  async create(dto: CreateNotificationDto, userId: string) {
    const employeeIds = await this.resolveTargetEmployeeIds(dto.target);
    if (!employeeIds.length) throw new BadRequestException('No hay empleados destinatarios');
    return this.prisma.notification.create({
      data: {
        title: dto.title.trim(),
        body: dto.body.trim(),
        type: dto.type,
        createdById: userId,
        recipients: { create: employeeIds.map((employeeId) => ({ employeeId })) },
      },
      include: { _count: { select: { recipients: true } } },
    });
  }
}
```

- [ ] **Step 4: Controller — endpoint de creación (roles emisores)**

`apps/api/src/modules/notifications/notifications.controller.ts`:

```typescript
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.RRHH, UserRole.SUPERVISOR)
  @Post()
  create(@Body() dto: CreateNotificationDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }
}
```

- [ ] **Step 5: Module + registrar**

`apps/api/src/modules/notifications/notifications.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

En `app.module.ts`, importar y agregar `NotificationsModule` a `imports`.

- [ ] **Step 6: Typecheck + runtime**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json` (sin output).
Con token de RRHH/ADMIN:
`curl -s -X POST http://localhost:4000/notifications -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d '{"title":"Reunion","body":"Manana 9am","type":"REUNION","target":{"mode":"ALL"}}'`
Expected: JSON con `_count.recipients > 0`. Con token de un rol no emisor → `403`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/notifications apps/api/src/app.module.ts
git commit -m "feat: Session 141 - notifications: crear + expansion de destino (individual/varios/depto/todos)"
```

### Task 9: Listado/detalle para el emisor + buzón y acuse del empleado

**Files:**
- Modify: `apps/api/src/modules/notifications/notifications.service.ts`
- Modify: `apps/api/src/modules/notifications/notifications.controller.ts`

- [ ] **Step 1: Service — listado emisor con conteos de acuse**

Agregar a `notifications.service.ts`:

```typescript
  async listForSender(query: { type?: string }) {
    return this.prisma.notification.findMany({
      where: query.type ? { type: query.type as any } : {},
      select: {
        id: true, title: true, type: true, createdAt: true,
        createdBy: { select: { name: true } },
        recipients: { select: { ackState: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }).then((rows) =>
      rows.map((n) => {
        const recibido = n.recipients.filter((r) => r.ackState === 'RECIBIDO').length;
        const rechazado = n.recipients.filter((r) => r.ackState === 'RECHAZADO').length;
        const pendiente = n.recipients.filter((r) => r.ackState === 'PENDIENTE').length;
        const { recipients, ...rest } = n;
        return { ...rest, total: n.recipients.length, recibido, rechazado, pendiente };
      }),
    );
  }

  async detailForSender(id: string) {
    const n = await this.prisma.notification.findUnique({
      where: { id },
      include: {
        createdBy: { select: { name: true } },
        recipients: {
          select: {
            id: true, ackState: true, comment: true, ackAt: true,
            employee: { select: { code: true, customer: { select: { name: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!n) throw new NotFoundException('Notificación no encontrada');
    return n;
  }
```

- [ ] **Step 2: Service — buzón del empleado + acuse (inmutable)**

Agregar (usa la resolución del empleado por el user del token; se replica el helper aquí para no acoplar con MeService):

```typescript
  private async employeeIdOf(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } });
    if (!user?.employeeId) throw new ForbiddenException('Tu usuario no está vinculado a un empleado.');
    return user.employeeId;
  }

  async inbox(userId: string, ackState?: string) {
    const employeeId = await this.employeeIdOf(userId);
    return this.prisma.notificationRecipient.findMany({
      where: { employeeId, ...(ackState ? { ackState: ackState as any } : {}) },
      select: {
        id: true, ackState: true, comment: true, ackAt: true,
        notification: {
          select: {
            id: true, title: true, body: true, type: true, createdAt: true,
            createdBy: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async ack(userId: string, recipientId: string, dto: AckNotificationDto) {
    const employeeId = await this.employeeIdOf(userId);
    const rec = await this.prisma.notificationRecipient.findUnique({ where: { id: recipientId } });
    if (!rec || rec.employeeId !== employeeId) throw new ForbiddenException('Notificación no disponible.');
    if (rec.ackState !== 'PENDIENTE') throw new BadRequestException('Esta notificación ya fue respondida.');
    return this.prisma.notificationRecipient.update({
      where: { id: recipientId },
      data: { ackState: dto.ackState, comment: dto.comment?.trim() || null, ackAt: new Date() },
    });
  }
```

- [ ] **Step 3: Controller — endpoints emisor + empleado**

Agregar a `notifications.controller.ts` (importar `Get`, `Patch`, `Param`, `Query`, `RequireModule`, `ModuleGuard`, `AckNotificationDto`):

```typescript
  // Emisor
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.RRHH, UserRole.SUPERVISOR)
  @Get()
  list(@Query('type') type?: string) { return this.service.listForSender({ type }); }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.RRHH, UserRole.SUPERVISOR)
  @Get(':id')
  detail(@Param('id') id: string) { return this.service.detailForSender(id); }

  // Empleado (buzón) — scoped por token
  @UseGuards(AuthGuard('jwt'), ModuleGuard)
  @RequireModule('mi-perfil')
  @Get('me/inbox')
  inbox(@CurrentUser('id') userId: string, @Query('ackState') ackState?: string) {
    return this.service.inbox(userId, ackState);
  }

  @UseGuards(AuthGuard('jwt'), ModuleGuard)
  @RequireModule('mi-perfil')
  @Patch('me/:recipientId/ack')
  ack(@CurrentUser('id') userId: string, @Param('recipientId') recipientId: string, @Body() dto: AckNotificationDto) {
    return this.service.ack(userId, recipientId, dto);
  }
```

> **Orden de rutas:** declarar `@Get('me/inbox')` y `@Patch('me/:recipientId/ack')` de forma que no colisionen con `@Get(':id')`. Como `me/inbox` es más específico y usa prefijo `me/`, Nest lo resuelve bien; si hubiera ambigüedad, mover los endpoints `me/*` ANTES de `@Get(':id')` en el archivo.

- [ ] **Step 4: Typecheck + runtime**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json` (sin output).
- Emisor: `curl -s http://localhost:4000/notifications -H "Authorization: Bearer <TOKEN_RRHH>"` → lista con conteos.
- Empleado: `curl -s http://localhost:4000/notifications/me/inbox -H "Authorization: Bearer <TOKEN_EMP>"` → su buzón.
- Acuse: `curl -s -X PATCH http://localhost:4000/notifications/me/<RECIPIENT_ID>/ack -H "Authorization: Bearer <TOKEN_EMP>" -H "Content-Type: application/json" -d '{"ackState":"RECIBIDO"}'` → OK; repetir → `400` (ya respondida). Con recipient de otro empleado → `403`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/notifications
git commit -m "feat: Session 141 - notifications: listado/detalle emisor + buzon y acuse inmutable del empleado"
```

### Task 10: Amonestación → notificación automática

**Files:**
- Modify: `apps/api/src/modules/disciplinary/disciplinary.service.ts`

- [ ] **Step 1: Crear la notificación dentro de la MISMA transacción**

En `disciplinary.service.ts`, método `create`, dentro del `this.prisma.$transaction(async (tx) => { ... })`, **después** de crear `action` (justo antes de `return tx.disciplinaryAction.create(...)` cambia a guardar el resultado y luego crea la notificación). Reescribir el final del bloque tx así:

```typescript
      const action = await tx.disciplinaryAction.create({
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

      // Notificación automática de respaldo: el empleado debe acusar "enterado / en desacuerdo".
      await tx.notification.create({
        data: {
          title: `${level}: ${faultType.name}`,
          body: `Se te registró un(a) ${level.toLowerCase()} por "${faultType.name}". Motivo: ${reason}`,
          type: 'AMONESTACION',
          disciplinaryActionId: action.id,
          createdById: userId,
          recipients: { create: [{ employeeId: dto.employeeId }] },
        },
      });

      return action;
```

> `faultType` y `level` ya están en scope (se cargaron/derivaron antes). Al eliminar el último llamado de un hilo, la notificación enlazada se borra en cascada por el FK `onDelete: Cascade` de `Notification.disciplinaryActionId` — no requiere código extra en el `delete`.

- [ ] **Step 2: Typecheck + runtime**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json` (sin output).
Crear una amonestación (por la pantalla de Nómina → Amonestaciones o por curl al endpoint existente) y verificar:
`curl -s http://localhost:4000/notifications/me/inbox -H "Authorization: Bearer <TOKEN_DEL_EMPLEADO_AMONESTADO>"` → aparece la notificación tipo AMONESTACION en PENDIENTE.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/disciplinary/disciplinary.service.ts
git commit -m "feat: Session 141 - amonestacion genera notificacion automatica (respaldo con acuse)"
```

---

## FASE 4 — Frontend: sección Mi Perfil + emisor

### Task 11: Sidebar "Mi Perfil" + landing/redirect del rol EMPLOYEE

**Files:**
- Modify: `apps/web/src/components/sidebar.tsx`
- Modify: `apps/web/src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Añadir la sección "Mi Perfil" al menú**

En `sidebar.tsx`, importar los íconos necesarios de `lucide-react` (`UserCircle`, `FileText`, `Bell`, `Receipt`, `AlertTriangle`, `CreditCard`) y agregar a `menuSections` una nueva sección con `permission: 'mi-perfil'`:

```typescript
  {
    key: 'mi-perfil',
    label: 'MI PERFIL',
    icon: <UserCircle size={20} />,
    permission: 'mi-perfil',
    items: [
      { label: 'Resumen', href: '/mi-perfil', icon: <UserCircle size={18} /> },
      { label: 'Mis datos', href: '/mi-perfil/datos', icon: <FileText size={18} /> },
      { label: 'Mis cuentas por cobrar', href: '/mi-perfil/cxc', icon: <CreditCard size={18} /> },
      { label: 'Mis facturas', href: '/mi-perfil/facturas', icon: <Receipt size={18} /> },
      { label: 'Mis recibos de nómina', href: '/mi-perfil/recibos', icon: <FileText size={18} /> },
      { label: 'Mis amonestaciones', href: '/mi-perfil/amonestaciones', icon: <AlertTriangle size={18} /> },
      { label: 'Notificaciones', href: '/mi-perfil/notificaciones', icon: <Bell size={18} /> },
    ],
  },
```

La lógica de `filteredSections`/`visibleItemsFor` ya muestra la sección a quien tenga el permiso `mi-perfil` (EMPLOYEE y ADMIN). No requiere caso especial.

- [ ] **Step 2: Redirigir al portal tras login para EMPLOYEE**

En `login/page.tsx`, cambiar el bloque de redirección:

```typescript
      if (data.mustChangePassword) {
        router.push('/change-password');
      } else {
        const role = data.user?.role ?? data.role;
        router.push(role === 'EMPLOYEE' ? '/mi-perfil' : '/dashboard');
      }
```

- [ ] **Step 3: Verificar en runtime**

Crear un usuario rol EMPLOYEE vinculado a un empleado; iniciar sesión y confirmar que aterriza en `/mi-perfil` y que el sidebar SOLO muestra "MI PERFIL". Con un ADMIN, confirmar que además de todo lo demás también ve "MI PERFIL" (si está vinculado a un empleado; si no, las páginas mostrarán el estado "no disponible").

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/sidebar.tsx "apps/web/src/app/(auth)/login/page.tsx"
git commit -m "feat: Session 141 - sidebar Mi Perfil + redirect de login para rol EMPLOYEE"
```

### Task 12: Página de Resumen del portal

**Files:**
- Create: `apps/web/src/app/(dashboard)/mi-perfil/page.tsx`

- [ ] **Step 1: Implementar la página**

`apps/web/src/app/(dashboard)/mi-perfil/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, Receipt, Bell } from 'lucide-react';

const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function MiPerfilResumenPage() {
  const [data, setData] = useState<{ saldoCxcUsd: number; facturasPendientes: number; notificacionesPendientes: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'Mi Perfil | Trinity ERP'; }, []);
  useEffect(() => {
    fetch('/api/proxy/me/resumen')
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'No disponible'); return r.json(); })
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="py-20 text-center text-slate-400">{error}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Mi Perfil</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/mi-perfil/cxc" className="card p-5 hover:bg-slate-800/40">
          <div className="flex items-center gap-3 text-slate-400"><CreditCard size={18} /> Saldo por cobrar</div>
          <div className="mt-2 text-2xl font-bold text-white font-mono">$ {fmt(data?.saldoCxcUsd ?? 0)}</div>
        </Link>
        <Link href="/mi-perfil/facturas" className="card p-5 hover:bg-slate-800/40">
          <div className="flex items-center gap-3 text-slate-400"><Receipt size={18} /> Facturas pendientes</div>
          <div className="mt-2 text-2xl font-bold text-white">{data?.facturasPendientes ?? 0}</div>
        </Link>
        <Link href="/mi-perfil/notificaciones" className="card p-5 hover:bg-slate-800/40">
          <div className="flex items-center gap-3 text-slate-400"><Bell size={18} /> Notificaciones pendientes</div>
          <div className="mt-2 text-2xl font-bold text-white">{data?.notificacionesPendientes ?? 0}</div>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar + Commit**

Navegar a `/mi-perfil` como EMPLOYEE y ver las 3 tarjetas con datos.
```bash
git add "apps/web/src/app/(dashboard)/mi-perfil/page.tsx"
git commit -m "feat: Session 141 - pagina resumen del portal Mi Perfil"
```

### Task 13: Página "Mis datos" (solo lectura)

**Files:**
- Create: `apps/web/src/app/(dashboard)/mi-perfil/datos/page.tsx`

- [ ] **Step 1: Implementar la página**

`apps/web/src/app/(dashboard)/mi-perfil/datos/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';

const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Perfil {
  code: string | null; bank: string | null; salaryBaseUsd: number; frequency: string;
  department: { name: string } | null; position: { name: string } | null;
  customer: { name: string; documentType: string; rif: string | null; phone: string | null; email: string | null; address: string | null; creditLimit: number; creditDays: number };
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-slate-700/30">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-200 text-right">{value ?? '—'}</span>
    </div>
  );
}

export default function MisDatosPage() {
  const [p, setP] = useState<Perfil | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { document.title = 'Mis datos | Trinity ERP'; }, []);
  useEffect(() => {
    fetch('/api/proxy/me/perfil')
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'No disponible'); return r.json(); })
      .then(setP).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="py-20 text-center text-slate-400">{error}</div>;
  if (!p) return <div className="py-20 text-center text-slate-400">Cargando…</div>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">Mis datos</h1>
      <div className="card p-6">
        <Row label="Nombre" value={p.customer.name} />
        <Row label="Documento" value={`${p.customer.documentType}-${p.customer.rif ?? ''}`} />
        <Row label="Teléfono" value={p.customer.phone} />
        <Row label="Correo" value={p.customer.email} />
        <Row label="Dirección" value={p.customer.address} />
        <Row label="Departamento" value={p.department?.name} />
        <Row label="Cargo" value={p.position?.name} />
        <Row label="Frecuencia de pago" value={p.frequency} />
        <Row label="Banco" value={p.bank} />
        <Row label="Límite de crédito" value={`$ ${fmt(p.customer.creditLimit)}`} />
        <Row label="Días de crédito" value={p.customer.creditDays} />
      </div>
      <p className="mt-3 text-xs text-slate-500">Si algún dato está incorrecto, contacta a Recursos Humanos.</p>
    </div>
  );
}
```

- [ ] **Step 2: Verificar + Commit**

Navegar a `/mi-perfil/datos` y confirmar los datos + límite de crédito.
```bash
git add "apps/web/src/app/(dashboard)/mi-perfil/datos/page.tsx"
git commit -m "feat: Session 141 - pagina Mis datos (solo lectura)"
```

### Task 14: Página "Mis CxC"

**Files:**
- Create: `apps/web/src/app/(dashboard)/mi-perfil/cxc/page.tsx`

- [ ] **Step 1: Implementar la página**

`apps/web/src/app/(dashboard)/mi-perfil/cxc/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';

const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-VE') : '—');

interface Cxc {
  id: string; number: string; documentNumber: string | null; type: string;
  amountUsd: number; paidAmountUsd: number; saldoUsd: number; dueDate: string | null; status: string;
}

export default function MisCxcPage() {
  const [rows, setRows] = useState<Cxc[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { document.title = 'Mis cuentas por cobrar | Trinity ERP'; }, []);
  useEffect(() => {
    fetch('/api/proxy/me/cxc')
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'No disponible'); return r.json(); })
      .then(setRows).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="py-20 text-center text-slate-400">{error}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Mis cuentas por cobrar</h1>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/30 text-slate-400">
              <th className="text-left px-4 py-3">Documento</th>
              <th className="text-left px-4 py-3">Vence</th>
              <th className="text-right px-4 py-3">Monto</th>
              <th className="text-right px-4 py-3">Pagado</th>
              <th className="text-right px-4 py-3">Saldo</th>
              <th className="text-center px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-700/30">
                <td className="px-4 py-3 text-slate-200">{r.documentNumber || r.number}</td>
                <td className="px-4 py-3 text-slate-400">{fmtDate(r.dueDate)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-200">$ {fmt(r.amountUsd)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-400">$ {fmt(r.paidAmountUsd)}</td>
                <td className="px-4 py-3 text-right font-mono text-white">$ {fmt(r.saldoUsd)}</td>
                <td className="px-4 py-3 text-center text-slate-300">{r.status}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-slate-500">No tienes cuentas por cobrar.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar + Commit**

```bash
git add "apps/web/src/app/(dashboard)/mi-perfil/cxc/page.tsx"
git commit -m "feat: Session 141 - pagina Mis CxC"
```

### Task 15: Página "Mis facturas"

**Files:**
- Create: `apps/web/src/app/(dashboard)/mi-perfil/facturas/page.tsx`

- [ ] **Step 1: Implementar la página**

Misma estructura que la de CxC (Task 14) pero con endpoint `/api/proxy/me/facturas`, `document.title = 'Mis facturas | Trinity ERP'`, y columnas: **Número** (`fiscalNumber || number`), **Fecha** (`createdAt`), **Total** (`totalUsd`), **Pagado** (`totalPaidUsd`), **Saldo** (`saldoUsd`), **Estado** (`status`). Interface:

```tsx
interface Factura { id: string; number: string; fiscalNumber: string | null; status: string; totalUsd: number; totalPaidUsd: number; saldoUsd: number; createdAt: string; isCredit: boolean; }
```

Copiar el componente de la Task 14 cambiando: el nombre del componente a `MisFacturasPage`, la URL del fetch, el `document.title`, el tipo, el encabezado `<h1>Mis facturas</h1>`, los `<th>` a Número/Fecha/Total/Pagado/Saldo/Estado, y las celdas a `f.fiscalNumber || f.number`, `fmtDate(f.createdAt)`, `$ {fmt(f.totalUsd)}`, `$ {fmt(f.totalPaidUsd)}`, `$ {fmt(f.saldoUsd)}`, `f.status`. Mensaje vacío: "No tienes facturas.".

- [ ] **Step 2: Verificar + Commit**

```bash
git add "apps/web/src/app/(dashboard)/mi-perfil/facturas/page.tsx"
git commit -m "feat: Session 141 - pagina Mis facturas"
```

### Task 16: Página "Mis recibos de nómina" (con deducción + PDF)

**Files:**
- Create: `apps/web/src/app/(dashboard)/mi-perfil/recibos/page.tsx`

- [ ] **Step 1: Implementar la página**

`apps/web/src/app/(dashboard)/mi-perfil/recibos/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { FileDown } from 'lucide-react';

const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-VE') : '—');

interface Recibo {
  id: string; grossBs: number; totalDeductionsBs: number; netBs: number; netUsd: number; creditDeductionBs: number;
  payrollRun: { id: string; number: string; periodFrom: string; periodTo: string; type: string };
}

export default function MisRecibosPage() {
  const [rows, setRows] = useState<Recibo[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { document.title = 'Mis recibos de nómina | Trinity ERP'; }, []);
  useEffect(() => {
    fetch('/api/proxy/me/recibos')
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'No disponible'); return r.json(); })
      .then(setRows).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="py-20 text-center text-slate-400">{error}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Mis recibos de nómina</h1>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/30 text-slate-400">
              <th className="text-left px-4 py-3">Período</th>
              <th className="text-right px-4 py-3">Bruto (Bs)</th>
              <th className="text-right px-4 py-3">Deducciones (Bs)</th>
              <th className="text-right px-4 py-3">Abono a deuda (Bs)</th>
              <th className="text-right px-4 py-3">Neto (Bs)</th>
              <th className="text-center px-4 py-3">Recibo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-700/30">
                <td className="px-4 py-3 text-slate-200">{fmtDate(r.payrollRun.periodFrom)} – {fmtDate(r.payrollRun.periodTo)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-200">{fmt(r.grossBs)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-400">{fmt(r.totalDeductionsBs)}</td>
                <td className="px-4 py-3 text-right font-mono text-amber-300">{fmt(r.creditDeductionBs)}</td>
                <td className="px-4 py-3 text-right font-mono text-white">{fmt(r.netBs)}</td>
                <td className="px-4 py-3 text-center">
                  <a href={`/api/proxy/me/recibos/${r.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-400 hover:underline">
                    <FileDown size={15} /> PDF
                  </a>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-slate-500">No tienes recibos.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar + Commit**

Confirmar que el enlace PDF abre el recibo propio.
```bash
git add "apps/web/src/app/(dashboard)/mi-perfil/recibos/page.tsx"
git commit -m "feat: Session 141 - pagina Mis recibos (con abono a deuda + PDF)"
```

### Task 17: Página "Mis amonestaciones"

**Files:**
- Create: `apps/web/src/app/(dashboard)/mi-perfil/amonestaciones/page.tsx`

- [ ] **Step 1: Implementar la página**

`apps/web/src/app/(dashboard)/mi-perfil/amonestaciones/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-VE') : '—');
const levelColor: Record<string, string> = {
  LLAMADO: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  NOTIFICACION: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  AMONESTACION: 'bg-red-500/15 text-red-400 border-red-500/20',
};

interface Amonestacion {
  id: string; number: string; level: string; occurredAt: string; reason: string;
  faultType: { name: string };
}

export default function MisAmonestacionesPage() {
  const [rows, setRows] = useState<Amonestacion[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { document.title = 'Mis amonestaciones | Trinity ERP'; }, []);
  useEffect(() => {
    fetch('/api/proxy/me/amonestaciones')
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'No disponible'); return r.json(); })
      .then(setRows).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="py-20 text-center text-slate-400">{error}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Mis amonestaciones</h1>
      <div className="space-y-3">
        {rows.map((a) => (
          <div key={a.id} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-200">{a.faultType.name}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${levelColor[a.level] || 'bg-slate-500/15 text-slate-400 border-slate-500/20'}`}>{a.level}</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">{a.number} · {fmtDate(a.occurredAt)}</div>
            <p className="text-sm text-slate-300 mt-2">{a.reason}</p>
          </div>
        ))}
        {rows.length === 0 && <div className="text-center py-12 text-slate-500">No tienes amonestaciones.</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar + Commit**

```bash
git add "apps/web/src/app/(dashboard)/mi-perfil/amonestaciones/page.tsx"
git commit -m "feat: Session 141 - pagina Mis amonestaciones"
```

### Task 18: Buzón de notificaciones del empleado (con acuse)

**Files:**
- Create: `apps/web/src/app/(dashboard)/mi-perfil/notificaciones/page.tsx`

- [ ] **Step 1: Implementar la página**

`apps/web/src/app/(dashboard)/mi-perfil/notificaciones/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';

const fmtDate = (s: string) => new Date(s).toLocaleString('es-VE');

interface Item {
  id: string; ackState: 'PENDIENTE' | 'RECIBIDO' | 'RECHAZADO'; comment: string | null; ackAt: string | null;
  notification: { id: string; title: string; body: string; type: string; createdAt: string; createdBy: { name: string } };
}

export default function MisNotificacionesPage() {
  const [rows, setRows] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [comments, setComments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => { document.title = 'Notificaciones | Trinity ERP'; }, []);
  async function load() {
    try {
      const r = await fetch('/api/proxy/notifications/me/inbox');
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'No disponible');
      setRows(await r.json());
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function ack(id: string, ackState: 'RECIBIDO' | 'RECHAZADO') {
    setSaving(id);
    try {
      const r = await fetch(`/api/proxy/notifications/me/${id}/ack`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ackState, comment: comments[id] || undefined }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Error');
      await load();
    } catch (e: any) { alert(e.message); } finally { setSaving(null); }
  }

  if (error) return <div className="py-20 text-center text-slate-400">{error}</div>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">Notificaciones</h1>
      <div className="space-y-3">
        {rows.map((it) => (
          <div key={it.id} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-200">{it.notification.title}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300">{it.notification.type}</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">{it.notification.createdBy?.name} · {fmtDate(it.notification.createdAt)}</div>
            <p className="text-sm text-slate-300 mt-2 whitespace-pre-wrap">{it.notification.body}</p>
            {it.ackState === 'PENDIENTE' ? (
              <div className="mt-3">
                <textarea
                  value={comments[it.id] || ''}
                  onChange={(e) => setComments({ ...comments, [it.id]: e.target.value })}
                  placeholder="Comentario (opcional)"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm"
                  rows={2}
                />
                <div className="flex gap-2 mt-2">
                  <button disabled={saving === it.id} onClick={() => ack(it.id, 'RECIBIDO')} className="btn-primary flex items-center gap-1 disabled:opacity-50"><Check size={15} /> Enterado</button>
                  <button disabled={saving === it.id} onClick={() => ack(it.id, 'RECHAZADO')} className="btn-secondary flex items-center gap-1 disabled:opacity-50"><X size={15} /> En desacuerdo</button>
                </div>
              </div>
            ) : (
              <div className="mt-3 text-xs">
                <span className={it.ackState === 'RECIBIDO' ? 'text-emerald-400' : 'text-red-400'}>
                  {it.ackState === 'RECIBIDO' ? 'Enterado' : 'En desacuerdo'}
                </span>
                <span className="text-slate-500"> · {it.ackAt ? fmtDate(it.ackAt) : ''}</span>
                {it.comment && <p className="text-slate-400 mt-1">“{it.comment}”</p>}
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <div className="text-center py-12 text-slate-500">No tienes notificaciones.</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar + Commit**

Como EMPLOYEE: ver una notificación PENDIENTE, responder "Enterado"/"En desacuerdo" con comentario, y confirmar que queda fija (sin botones) tras recargar.
```bash
git add "apps/web/src/app/(dashboard)/mi-perfil/notificaciones/page.tsx"
git commit -m "feat: Session 141 - buzon de notificaciones del empleado (acuse enterado/en desacuerdo)"
```

### Task 19: Pantalla del emisor (crear + tablero de acuse)

**Files:**
- Create: `apps/web/src/app/(dashboard)/rrhh/notificaciones/page.tsx`
- Modify: `apps/web/src/components/sidebar.tsx`

- [ ] **Step 1: Agregar ítem al menú de Nómina/RRHH**

En `sidebar.tsx`, en la sección cuyo `permission` es `'payroll'` (grupo Nómina/RRHH), agregar el ítem:

```typescript
      { label: 'Notificaciones', href: '/rrhh/notificaciones', icon: <Bell size={18} /> },
```

- [ ] **Step 2: Implementar la página del emisor**

`apps/web/src/app/(dashboard)/rrhh/notificaciones/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';

const fmtDate = (s: string) => new Date(s).toLocaleString('es-VE');

interface Sent { id: string; title: string; type: string; createdAt: string; total: number; recibido: number; rechazado: number; pendiente: number; }
interface Employee { id: string; code: string | null; customer: { name: string }; departmentId?: string | null; }
interface Department { id: string; name: string; }

export default function EmisorNotificacionesPage() {
  const [sent, setSent] = useState<Sent[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<{ title: string; body: string; type: string; mode: string; employeeIds: string[]; departmentId: string }>(
    { title: '', body: '', type: 'INFORMATIVA', mode: 'INDIVIDUAL', employeeIds: [], departmentId: '' },
  );

  useEffect(() => { document.title = 'Notificaciones | Trinity ERP'; }, []);
  async function loadSent() {
    const r = await fetch('/api/proxy/notifications');
    if (r.ok) setSent(await r.json());
  }
  useEffect(() => {
    loadSent();
    fetch('/api/proxy/employees').then((r) => (r.ok ? r.json() : [])).then((d) => setEmployees(Array.isArray(d) ? d : d.items ?? [])).catch(() => {});
    fetch('/api/proxy/departments').then((r) => (r.ok ? r.json() : [])).then((d) => setDepartments(Array.isArray(d) ? d : d.items ?? [])).catch(() => {});
  }, []);

  async function submit() {
    if (!form.title.trim() || !form.body.trim()) { setError('Título y mensaje son obligatorios'); return; }
    setSaving(true); setError('');
    try {
      const target: any = { mode: form.mode };
      if (form.mode === 'INDIVIDUAL' || form.mode === 'MULTIPLE') target.employeeIds = form.employeeIds;
      if (form.mode === 'DEPARTMENT') target.departmentId = form.departmentId;
      const r = await fetch('/api/proxy/notifications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title.trim(), body: form.body.trim(), type: form.type, target }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Error al enviar');
      setOpen(false);
      setForm({ title: '', body: '', type: 'INFORMATIVA', mode: 'INDIVIDUAL', employeeIds: [], departmentId: '' });
      loadSent();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Notificaciones</h1>
        <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Nueva notificación</button>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/30 text-slate-400">
              <th className="text-left px-4 py-3">Título</th>
              <th className="text-center px-4 py-3">Tipo</th>
              <th className="text-left px-4 py-3">Enviada</th>
              <th className="text-center px-4 py-3">Enterados</th>
              <th className="text-center px-4 py-3">Desacuerdo</th>
              <th className="text-center px-4 py-3">Pendientes</th>
            </tr>
          </thead>
          <tbody>
            {sent.map((n) => (
              <tr key={n.id} className="border-b border-slate-700/30">
                <td className="px-4 py-3 text-slate-200">{n.title}</td>
                <td className="px-4 py-3 text-center text-slate-400">{n.type}</td>
                <td className="px-4 py-3 text-slate-400">{fmtDate(n.createdAt)}</td>
                <td className="px-4 py-3 text-center text-emerald-400">{n.recibido}/{n.total}</td>
                <td className="px-4 py-3 text-center text-red-400">{n.rechazado}</td>
                <td className="px-4 py-3 text-center text-slate-300">{n.pendiente}</td>
              </tr>
            ))}
            {sent.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-slate-500">No has enviado notificaciones.</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Nueva notificación</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            {error && <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
            <div className="space-y-3">
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Título" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
              <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Mensaje" rows={4} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200">
                <option value="INFORMATIVA">Informativa</option>
                <option value="REUNION">Reunión</option>
              </select>
              <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value, employeeIds: [], departmentId: '' })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200">
                <option value="INDIVIDUAL">A un empleado</option>
                <option value="MULTIPLE">A varios empleados</option>
                <option value="DEPARTMENT">A un departamento</option>
                <option value="ALL">A todos</option>
              </select>
              {(form.mode === 'INDIVIDUAL' || form.mode === 'MULTIPLE') && (
                <select
                  multiple={form.mode === 'MULTIPLE'}
                  value={form.mode === 'MULTIPLE' ? form.employeeIds : form.employeeIds[0] || ''}
                  onChange={(e) => {
                    const vals = form.mode === 'MULTIPLE'
                      ? Array.from(e.target.selectedOptions).map((o) => o.value)
                      : [e.target.value];
                    setForm({ ...form, employeeIds: vals });
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 min-h-[42px]"
                >
                  {form.mode === 'INDIVIDUAL' && <option value="">— Elige —</option>}
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.customer?.name} {e.code ? `(${e.code})` : ''}</option>)}
                </select>
              )}
              {form.mode === 'DEPARTMENT' && (
                <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200">
                  <option value="">— Elige departamento —</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setOpen(false)} className="btn-secondary">Cancelar</button>
              <button onClick={submit} disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

> Confirmar que existe el endpoint `GET /departments` (usado por el select de departamento). Si el path difiere (p.ej. `/payroll/departments`), ajustar la URL del fetch. Si no existiera un endpoint de departamentos, agregar uno mínimo en el módulo payroll o quitar la opción DEPARTMENT del selector.

- [ ] **Step 3: Verificar + Commit**

Como RRHH/ADMIN: crear una notificación "A todos", verla en la tabla con conteos, y confirmar (como EMPLOYEE) que llega al buzón.
```bash
git add "apps/web/src/app/(dashboard)/rrhh/notificaciones/page.tsx" apps/web/src/components/sidebar.tsx
git commit -m "feat: Session 141 - pantalla emisor de notificaciones (crear + tablero de acuse)"
```

---

## FASE 5 — Cierre

### Task 20: Verificación e2e integral + documentación

**Files:**
- Modify: `PROGRESS.md`
- Modify: `PROJECT.md` (si corresponde según convención del repo)

- [ ] **Step 1: Typecheck final**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json` y `cd apps/web && npx tsc --noEmit`
Expected: sin errores nuevos en los archivos tocados.

- [ ] **Step 2: E2E manual completo**

Con el sistema levantado (`pnpm dev`):
1. Crear usuario rol `EMPLOYEE` vinculado a un empleado real (Configuración → Usuarios).
2. Iniciar sesión con ese usuario → aterriza en `/mi-perfil`, sidebar solo muestra "MI PERFIL".
3. Recorrer las 6 sub-secciones; confirmar que TODO es del propio empleado.
4. Con OTRO token, confirmar (por curl) que no se puede acceder a datos ajenos (`/me/recibos/<lineIdAjeno>/pdf` → 403).
5. Como RRHH: enviar notificación a un departamento; como el empleado: acusar; confirmar que queda fija.
6. Crear una amonestación al empleado; confirmar que aparece la notificación automática tipo AMONESTACION y su acuse.

- [ ] **Step 3: Actualizar PROGRESS.md**

Agregar la entrada de la Sesión 141 (portal del empleado + notificaciones), marcando **SIN DESPLEGAR** y que la migración es aditiva. Seguir el formato de las entradas previas.

- [ ] **Step 4: Commit final + push**

```bash
git add PROGRESS.md PROJECT.md
git commit -m "docs: Session 141 - portal del empleado (Mi Perfil) + notificaciones"
git push origin main
```

- [ ] **Step 5: Nota de deploy para Diego**

Recordar el checklist de pre-deploy (CLAUDE.md): la migración `20260924120000_portal_empleado` debe estar commiteada, `app.module.ts` con `MeModule`/`NotificationsModule`, y `deploy/fix-schema.sql` actualizado. Deploy grande: `ssh root@... "cd /opt/Trinity && git pull origin main && bash deploy.sh"`.

---

## Self-Review (cobertura del spec)

- ✅ Ancla `User.employeeId` (Opción A) → Task 1, 3, 4.
- ✅ Rol `EMPLOYEE` solo-portal + landing → Task 2, 11.
- ✅ Seguridad scoped por token (`/me/*`, ack por dueño, emisor por rol) → Task 5–9.
- ✅ Datos personales + límite crédito (solo lectura) → Task 5, 13.
- ✅ CxC → Task 6, 14. Facturas → Task 6, 15.
- ✅ Recibos de nómina + **deducción de nómina** (`creditDeductionBs`) + PDF → Task 6, 7, 16.
- ✅ Amonestaciones → Task 6, 17.
- ✅ Notificaciones (modelos, emisor individual/varios/depto/todos, buzón, acuse inmutable "enterado/en desacuerdo" + comentario) → Task 8, 9, 18, 19.
- ✅ Amonestación → notificación automática → Task 10.
- ✅ Migración aditiva + fix-schema → Task 1.
- ✅ Fuera de alcance (evaluaciones/progreso, edición de datos, correo/push) — no se implementan, consistente con el spec.

**Riesgos/confirmaciones marcadas en el plan (verificar durante ejecución):** nombre exacto de la relación `PayrollRunLine → PayrollRun` y del campo `payrollRunId`; firma de `PayrollPdfService.generateReceipt`; existencia de `GET /employees` y `GET /departments`; forma exacta del retorno de login (`data.user?.role`).
