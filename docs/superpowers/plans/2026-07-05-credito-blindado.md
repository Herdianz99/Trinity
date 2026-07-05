# Crédito pre-aprobado y blindado — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el crédito en una propiedad pre-aprobada del cliente (cupo/días dictados por administración con permiso), con el POS ejecutando sin clave por venta y el backend bloqueando ventas a crédito sobre-cupo o con vencidos (override con una sola clave dinámica).

**Architecture:** Cambios en `Customer` (campos de crédito controlados) + `invoices.service.pay` (blindaje backend) + `customers.service` (validación/permiso) + POS y form de cliente. Sin nuevas dependencias.

**Tech Stack:** NestJS + Prisma (API), Next.js 14 (web).

## Convención de verificación (el proyecto NO tiene tests)

Cada tarea cierra con **typecheck (`tsc --noEmit`) + prueba funcional concreta + commit**. No se introduce jest (el proyecto verifica así — ver PROGRESS.md).

## Decisiones (del spec `2026-07-05-credito-blindado-design.md`)

- `creditAuthorizedBy` y `creditReviewedAt` en `Customer` (no en Invoice).
- Días fijos en POS; venta normal sin clave (se quita el gate `ALLOW_CREDIT_INVOICE`).
- Editar crédito del cliente requiere `MANAGE_CUSTOMER_CREDIT` (permiso de usuario, chequeado en el service).
- Excepciones (cupo/vencidos) → una sola clave `OVERRIDE_CREDIT_BLOCK`.
- Si `creditLimit > 0` → `creditDays` (>0) y `creditAuthorizedBy` obligatorios.

---

### Task 1: Schema — campos de crédito en Customer + enums + migración

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260705200000_credito_blindado/migration.sql`
- Modify: `deploy/fix-schema.sql`

- [ ] **Step 1: Editar el schema**

En `model Customer`, agregar (junto a `isGroupCompany`):

```prisma
  isEmployee        Boolean  @default(false)
  creditAuthorizedBy String?
  creditReviewedAt   DateTime?
```

En `enum PermissionKey`, agregar al final:

```prisma
  MANAGE_CUSTOMER_CREDIT
```

En `enum DynamicKeyPerm`, agregar al final:

```prisma
  OVERRIDE_CREDIT_BLOCK
```

- [ ] **Step 2: Crear la migración**

`packages/database/prisma/migrations/20260705200000_credito_blindado/migration.sql`:

```sql
-- Credito pre-aprobado y blindado

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isEmployee" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditAuthorizedBy" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditReviewedAt" TIMESTAMP(3);

ALTER TYPE "PermissionKey" ADD VALUE IF NOT EXISTS 'MANAGE_CUSTOMER_CREDIT';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'OVERRIDE_CREDIT_BLOCK';
```

- [ ] **Step 3: Espejar en `deploy/fix-schema.sql`**

Agregar al final de `deploy/fix-schema.sql`:

```sql
-- Credito pre-aprobado y blindado (2026-07-05)
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isEmployee" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditAuthorizedBy" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditReviewedAt" TIMESTAMP(3);
ALTER TYPE "PermissionKey" ADD VALUE IF NOT EXISTS 'MANAGE_CUSTOMER_CREDIT';
ALTER TYPE "DynamicKeyPerm" ADD VALUE IF NOT EXISTS 'OVERRIDE_CREDIT_BLOCK';
```

- [ ] **Step 4: Aplicar y regenerar**

Desde `packages/database`:

```bash
npx prisma migrate deploy
npx prisma generate
```

Nota: `ALTER TYPE ... ADD VALUE` no corre dentro de una transacción con otros statements en algunas versiones; si `migrate deploy` falla por eso, separar los `ALTER TYPE` en su propio archivo de migración. Expected: migración aplicada, cliente regenerado con los campos nuevos.

- [ ] **Step 5: Verificar**

```bash
psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='Customer' AND column_name IN ('isEmployee','creditAuthorizedBy','creditReviewedAt');"
psql "$DATABASE_URL" -c "SELECT unnest(enum_range(NULL::\"PermissionKey\")) WHERE unnest::text='MANAGE_CUSTOMER_CREDIT';"
```

Expected: las 3 columnas + el valor del enum presentes.

- [ ] **Step 6: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260705200000_credito_blindado deploy/fix-schema.sql
git commit -m "feat: schema credito blindado (Customer + enums MANAGE_CUSTOMER_CREDIT / OVERRIDE_CREDIT_BLOCK)"
```

---

### Task 2: Customer DTO + service (validación condicional + auto-sello + permiso)

**Files:**
- Modify: `apps/api/src/modules/customers/dto/create-customer.dto.ts`
- Modify: `apps/api/src/modules/customers/customers.service.ts`
- Modify: `apps/api/src/modules/customers/customers.controller.ts`

- [ ] **Step 1: Agregar campos al DTO**

En `create-customer.dto.ts`, agregar (junto a `isGroupCompany`):

```typescript
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEmployee?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  creditAuthorizedBy?: string;
```

(No agregar `creditReviewedAt` — lo setea el service.)

- [ ] **Step 2: Helper de permiso + validación en el service**

En `customers.service.ts`, agregar un método privado y usarlo en `create` y `update`. Reemplazar los `create`/`update` actuales (que hacían `prisma.customer.create/update({ data: dto })`) por versiones con validación. Código completo:

```typescript
private async assertCanEditCredit(userId: string) {
  const perm = await this.prisma.userPermission.findFirst({
    where: { userId, permissionKey: 'MANAGE_CUSTOMER_CREDIT' },
  });
  if (!perm) {
    // ADMIN siempre puede
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (user?.role !== 'ADMIN') {
      throw new ForbiddenException('No tiene permiso para editar el crédito del cliente (MANAGE_CUSTOMER_CREDIT)');
    }
  }
}

private validateCreditFields(creditLimit: number, creditDays: number | undefined, authBy: string | undefined) {
  if (creditLimit > 0) {
    if (!creditDays || creditDays <= 0) {
      throw new BadRequestException('Si el límite de crédito es mayor a 0, los días de crédito son obligatorios');
    }
    if (!authBy || !authBy.trim()) {
      throw new BadRequestException('Si el límite de crédito es mayor a 0, "Autorizado por" es obligatorio');
    }
  }
}

async create(dto: CreateCustomerDto, userId: string) {
  const creditLimit = dto.creditLimit ?? 0;
  if (creditLimit > 0) {
    await this.assertCanEditCredit(userId);
    this.validateCreditFields(creditLimit, dto.creditDays, dto.creditAuthorizedBy);
  }
  return this.prisma.customer.create({
    data: { ...dto, creditReviewedAt: creditLimit > 0 ? new Date() : null },
  });
}

async update(id: string, dto: UpdateCustomerDto, userId: string) {
  const current = await this.prisma.customer.findUnique({ where: { id } });
  if (!current) throw new NotFoundException('Cliente no encontrado');

  const nextLimit = dto.creditLimit ?? current.creditLimit;
  const nextDays = dto.creditDays ?? current.creditDays;
  const nextAuth = dto.creditAuthorizedBy ?? current.creditAuthorizedBy ?? undefined;

  const touchesCredit =
    (dto.creditLimit !== undefined && dto.creditLimit !== current.creditLimit) ||
    (dto.creditDays !== undefined && dto.creditDays !== current.creditDays) ||
    (dto.creditAuthorizedBy !== undefined && dto.creditAuthorizedBy !== current.creditAuthorizedBy);

  if (touchesCredit) await this.assertCanEditCredit(userId);
  if (nextLimit > 0) this.validateCreditFields(nextLimit, nextDays, nextAuth);

  const creditChanged =
    (dto.creditLimit !== undefined && dto.creditLimit !== current.creditLimit) ||
    (dto.creditDays !== undefined && dto.creditDays !== current.creditDays);

  return this.prisma.customer.update({
    where: { id },
    data: { ...dto, ...(creditChanged ? { creditReviewedAt: new Date() } : {}) },
  });
}
```

Asegurar imports en el service: `ForbiddenException`, `BadRequestException`, `NotFoundException` desde `@nestjs/common`.

- [ ] **Step 3: Pasar `userId` desde el controller**

En `customers.controller.ts`, en los handlers `create` y `update`, inyectar el usuario y pasarlo. Ejemplo (ajustar a la firma real):

```typescript
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Post()
create(@Body() dto: CreateCustomerDto, @CurrentUser('id') userId: string) {
  return this.customersService.create(dto, userId);
}

@Patch(':id')
update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @CurrentUser('id') userId: string) {
  return this.customersService.update(id, dto, userId);
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @trinity/api exec tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 5: Prueba funcional (con API corriendo)**

Con un usuario ADMIN, crear un cliente con `creditLimit=100` sin `creditDays` → debe dar 400. Con `creditDays=15` y `creditAuthorizedBy="Admin"` → crea OK y `creditReviewedAt` queda seteado. Verificar en BD:

```bash
psql "$DATABASE_URL" -c "SELECT name, \"creditLimit\", \"creditDays\", \"creditAuthorizedBy\", \"creditReviewedAt\" FROM \"Customer\" ORDER BY \"createdAt\" DESC LIMIT 1;"
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/customers
git commit -m "feat: validacion y permiso de credito en customers.service (MANAGE_CUSTOMER_CREDIT)"
```

---

### Task 3: `pay()` — días desde el cliente + blindaje (cupo/vencidos + override)

**Files:**
- Modify: `apps/api/src/modules/invoices/dto/pay-invoice.dto.ts`
- Modify: `apps/api/src/modules/invoices/invoices.service.ts`

- [ ] **Step 1: DTO — flag de override**

En `pay-invoice.dto.ts`, agregar:

```typescript
  @IsOptional()
  @IsBoolean()
  overrideCreditBlockAuthorized?: boolean;
```

- [ ] **Step 2: Blindaje en `pay()`**

En `invoices.service.ts`, dentro del `if (dto.isCredit)` (bloque de validación de crédito ~líneas 568-591), reemplazar la validación de cupo actual por esta versión que añade el override y el bloqueo por vencidos. `caracasDateKey` ya está importado (línea 12):

```typescript
if (dto.isCredit) {
  if (invoice.customer) {
    // 1) Cupo
    const pendingReceivables = await this.prisma.receivable.aggregate({
      where: { customerId: invoice.customerId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
      _sum: { amountUsd: true },
    });
    const currentDebt = pendingReceivables._sum.amountUsd || 0;
    const availableCredit = invoice.customer.creditLimit - currentDebt;
    const overLimit = effectiveTotalUsd > availableCredit + 0.01;

    // 2) Vencidos (status OVERDUE o dueDate < hoy Caracas, cubre el desfase del cron)
    const overdueCount = await this.prisma.receivable.count({
      where: {
        customerId: invoice.customerId,
        OR: [
          { status: 'OVERDUE' },
          { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: caracasDateKey() } },
        ],
      },
    });
    const hasOverdue = overdueCount > 0;

    if ((overLimit || hasOverdue) && !dto.overrideCreditBlockAuthorized) {
      const reasons: string[] = [];
      if (overLimit) reasons.push(`excede el cupo (disponible $${availableCredit.toFixed(2)}, requerido $${effectiveTotalUsd.toFixed(2)})`);
      if (hasOverdue) reasons.push('tiene facturas vencidas');
      throw new BadRequestException(`No se puede facturar a crédito: el cliente ${reasons.join(' y ')}. Requiere autorización de supervisor.`);
    }
  }
}
```

- [ ] **Step 3: Homologar `creditDays`/`dueDate` desde el cliente**

En `pay()`, en el bloque que crea la `Receivable` (~líneas 830-846) y en el `invoice.update` (~líneas 949-977), usar **la misma fuente**. Cambiar ambos cálculos a partir de `customer.creditDays`:

En la creación de la Receivable, cambiar:
```typescript
const creditDays = dto.creditDays || invoice.customer?.creditDays || 30;
```
por:
```typescript
const creditDays = invoice.customer?.creditDays ?? dto.creditDays ?? 30;
```

En el `invoice.update`, cambiar:
```typescript
    isCredit: dto.isCredit || false,
    creditDays: dto.creditDays || 0,
    dueDate: dto.isCredit
      ? new Date(Date.now() + (dto.creditDays || 30) * 86400000)
      : null,
```
por (calcular `creditDays` una sola vez arriba y reusarlo):
```typescript
    isCredit: dto.isCredit || false,
    creditDays: dto.isCredit ? (invoice.customer?.creditDays ?? dto.creditDays ?? 30) : 0,
    dueDate: dto.isCredit
      ? new Date(Date.now() + (invoice.customer?.creditDays ?? dto.creditDays ?? 30) * 86400000)
      : null,
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @trinity/api exec tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 5: Prueba funcional**

1. Cliente con cupo 300 / 15 días, sin vencidos → facturar $120 a crédito **sin** override → OK; la CxC y la factura quedan con `dueDate` = hoy+15 (iguales).
2. Forzar una CxC de ese cliente a vencida (en BD: `UPDATE "Receivable" SET "dueDate"='2020-01-01', status='OVERDUE' WHERE ...`) → intentar otra venta a crédito **sin** override → 400 "tiene facturas vencidas". Con `overrideCreditBlockAuthorized:true` → OK.
3. Facturar por encima del cupo sin override → 400; con override → OK.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/invoices
git commit -m "feat: blindaje credito en pay (bloqueo cupo/vencidos + override) + dueDate desde el cliente"
```

---

### Task 4: Receivables — filtro "Solo empleados"

**Files:**
- Modify: `apps/api/src/modules/receivables/dto/query-receivables.dto.ts`
- Modify: `apps/api/src/modules/receivables/receivables.service.ts`

- [ ] **Step 1: DTO**

En `query-receivables.dto.ts`, agregar:

```typescript
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  employeeOnly?: boolean;
```

(Asegurar imports `IsBoolean`, `IsOptional`, `Transform` — seguir el patrón del `overdue` existente.)

- [ ] **Step 2: `findAll` where**

En `receivables.service.ts findAll`, después de armar el `where`, agregar:

```typescript
if (query.employeeOnly) {
  where.customer = { ...(where.customer || {}), isEmployee: true };
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @trinity/api exec tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/receivables
git commit -m "feat: filtro employeeOnly en cuentas por cobrar"
```

---

### Task 5: Frontend — form de cliente (campos de crédito gated + validación + isEmployee)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/sales/customers/new/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/sales/customers/[id]/page.tsx`

- [ ] **Step 1: Estado y permiso**

En ambas páginas, agregar al `defaultForm` (new) / al mapeo inicial ([id]):

```typescript
isEmployee: false,
creditAuthorizedBy: '',
```

Y leer el permiso del usuario actual (una vez, en un `useEffect`):

```typescript
const [canEditCredit, setCanEditCredit] = useState(false);
const [reviewedAt, setReviewedAt] = useState<string | null>(null);
useEffect(() => {
  fetch('/api/proxy/auth/me').then(r => r.json()).then(u => {
    setCanEditCredit(u.role === 'ADMIN' || (u.permissions || []).includes('MANAGE_CUSTOMER_CREDIT'));
  }).catch(() => {});
}, []);
```

(En `[id]`, además setear `setReviewedAt(data.creditReviewedAt)` al cargar el cliente.)

- [ ] **Step 2: Campos de crédito deshabilitados + "Autorizado por" + fecha**

Envolver los inputs `creditLimit`/`creditDays` con `disabled={!canEditCredit}` y agregar debajo:

```tsx
<div>
  <label className="text-xs text-slate-400 mb-1 block">Autorizado por {form.creditLimit > 0 && <span className="text-red-400">*</span>}</label>
  <input type="text" value={form.creditAuthorizedBy}
    disabled={!canEditCredit}
    onChange={e => setForm(f => ({ ...f, creditAuthorizedBy: e.target.value }))}
    className="input-field !py-2 text-sm disabled:opacity-50" />
</div>
{reviewedAt && (
  <p className="text-xs text-slate-500">Crédito analizado: {new Date(reviewedAt).toLocaleDateString()}</p>
)}
{!canEditCredit && (
  <p className="text-xs text-amber-400">Solo administración puede editar el crédito.</p>
)}
```

- [ ] **Step 3: Toggle "Es empleado"**

Replicar el bloque `<label>` toggle de `isGroupCompany` para `isEmployee`:

```tsx
<label className="flex items-start gap-3 p-3 rounded-lg border border-slate-700/50 bg-slate-800/30 cursor-pointer hover:border-amber-500/30 transition-colors">
  <input type="checkbox" checked={form.isEmployee}
    onChange={e => setForm(f => ({ ...f, isEmployee: e.target.checked }))}
    className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500" />
  <span>
    <span className="text-sm text-slate-200 block">Es empleado</span>
    <span className="text-xs text-slate-500">Marca al cliente como empleado (para reportes / cobro por sueldo).</span>
  </span>
</label>
```

- [ ] **Step 4: Validación antes de submit**

En el `handleAdd`/`handleSave`, antes del fetch:

```typescript
if (form.creditLimit > 0 && (!form.creditDays || form.creditDays <= 0)) {
  setMessage({ type: 'error', text: 'Con límite de crédito, los días son obligatorios' }); return;
}
if (form.creditLimit > 0 && !form.creditAuthorizedBy.trim()) {
  setMessage({ type: 'error', text: 'Con límite de crédito, "Autorizado por" es obligatorio' }); return;
}
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @trinity/web exec tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(dashboard)/sales/customers"
git commit -m "feat: form cliente - credito gated + autorizado por + es empleado"
```

---

### Task 6: Frontend — POS (días fijos, sin clave normal, override en excepciones)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/sales/pos/page.tsx`

- [ ] **Step 1: Días del cliente, solo lectura**

Cambiar el estado `creditDays` (línea ~220): en vez de `useState(30)` fijo, poblar desde el cliente. Al seleccionar/cargar el cliente de crédito, `setCreditDays(customer.creditDays || 0)`. En el modal de crédito (líneas ~2280-2346), el input de días pasa a **solo lectura**:

```tsx
<label className="text-sm text-slate-300 mb-1.5 block">Días de crédito (definidos por administración)</label>
<input type="number" value={creditDays} readOnly disabled
  className="input-field !py-3 md:!py-2 opacity-70" />
```

- [ ] **Step 2: Consultar estado de crédito del cliente y decidir clave**

Al abrir el modal de crédito (o al pulsar "Confirmar crédito"), consultar vencidos/cupo:

```typescript
const [creditStatus, setCreditStatus] = useState<{ availableCredit: number; totalOverdue: number } | null>(null);
async function loadCreditStatus(custId: string) {
  try {
    const res = await fetch(`/api/proxy/receivables/by-customer/${custId}`);
    if (res.ok) setCreditStatus(await res.json());
  } catch { setCreditStatus(null); }
}
```

(Llamar `loadCreditStatus(customerId)` al abrir el modal de crédito. El endpoint `GET /receivables/by-customer/:id` devuelve `availableCredit` y `totalOverdue`.)

- [ ] **Step 3: Reemplazar el gate `ALLOW_CREDIT_INVOICE` por lógica condicional**

El botón "Confirmar crédito" (líneas ~2320-2340) ya no abre siempre el `DynamicKeyModal`. Nueva lógica:

```typescript
function onConfirmCreditClick() {
  if (!customerId) { setMessage({ type: 'error', text: 'Debe asignar un cliente para facturar a crédito' }); return; }
  const total = cartTotalUsd; // total de la venta en USD (usar la variable real del POS)
  const overdue = (creditStatus?.totalOverdue || 0) > 0;
  const overLimit = creditStatus ? total > (creditStatus.availableCredit + 0.01) : false;
  if (overdue || overLimit) {
    setCreditKeyOpen(true);   // pedirá OVERRIDE_CREDIT_BLOCK
  } else {
    handleConfirmCredit(false); // sin override, pasa directo
  }
}
```

Cambiar el `DynamicKeyModal` de crédito (líneas ~2738-2749) a:

```tsx
<DynamicKeyModal
  isOpen={creditKeyOpen}
  onClose={() => setCreditKeyOpen(false)}
  onAuthorized={() => { setCreditKeyOpen(false); handleConfirmCredit(true); }}
  permission="OVERRIDE_CREDIT_BLOCK"
  action="Autorizar crédito con vencidos o sobre cupo"
  entityType="Customer"
  entityId={customerId || undefined}
  title="Autorizar excepción de crédito"
  description={`El cliente tiene facturas vencidas o excede su cupo. Clave de supervisor para autorizar.`}
/>
```

- [ ] **Step 4: `handleConfirmCredit` recibe y envía el override**

Cambiar `handleConfirmCredit()` para aceptar el flag y mandarlo en el `pay` (payload líneas ~1033-1039). Quitar `creditDays` del payload (el backend lo toma del cliente):

```typescript
async function handleConfirmCredit(override: boolean) {
  // ... dentro del body del PATCH /invoices/:id/pay:
  body: JSON.stringify({
    payments: [],
    isCredit: true,
    cashRegisterId: selectedCashRegister?.id || undefined,
    negativeStockAuthorized: cart.some(i => i.authorizedNegative) || undefined,
    overrideCreditBlockAuthorized: override || undefined,
  }),
}
```

Y el botón "Confirmar crédito" ahora llama `onConfirmCreditClick`. Mostrar en el modal un aviso si `creditStatus` indica vencidos/sobre-cupo (texto rojo).

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @trinity/web exec tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(dashboard)/sales/pos/page.tsx"
git commit -m "feat: POS - credito con dias fijos, sin clave normal, override OVERRIDE_CREDIT_BLOCK en excepciones"
```

---

### Task 7: Frontend — filtro "Solo empleados" en Cuentas por Cobrar

**Files:**
- Modify: `apps/web/src/app/(dashboard)/receivables/page.tsx`

- [ ] **Step 1: Estado + checkbox + query**

Agregar un estado `employeeOnly` y un checkbox junto al de "Solo vencidas" (líneas ~412-457), e incluirlo en el querystring del fetch de receivables:

```tsx
<label className="flex items-center gap-2 text-sm text-slate-300">
  <input type="checkbox" checked={employeeOnly}
    onChange={e => setEmployeeOnly(e.target.checked)}
    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-amber-500" />
  Solo empleados
</label>
```

En el fetch, añadir `&employeeOnly=true` cuando esté activo (mismo patrón que `overdue`).

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @trinity/web exec tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(dashboard)/receivables/page.tsx"
git commit -m "feat: filtro 'Solo empleados' en cuentas por cobrar"
```

---

### Task 8: Prueba funcional end-to-end + checklist de deploy

- [ ] **Step 1: Levantar API + web**

```bash
pnpm dev
```

- [ ] **Step 2: Flujo completo**

1. Como ADMIN, dar permiso `MANAGE_CUSTOMER_CREDIT` a un usuario de administración (en `/settings/users` o vía API). Con un usuario SIN el permiso, abrir un cliente → los campos de crédito salen **bloqueados**.
2. Con el usuario autorizado, poner cupo 300 / 15 días / autorizado por "Juan" → guarda; sin autorizado-por → error.
3. En el POS, venta a crédito a ese cliente por $120 → pasa **sin clave**; la factura y la CxC quedan con vencimiento a 15 días.
4. Marcar esa CxC como vencida (BD) → nueva venta a crédito → pide clave `OVERRIDE_CREDIT_BLOCK`; sin ella, bloquea.
5. En Cuentas por Cobrar, marcar el cliente como empleado y filtrar "Solo empleados".

- [ ] **Step 3: Pre-deploy checklist**

- [ ] Migración `20260705200000_credito_blindado` + `fix-schema.sql` commiteados.
- [ ] Módulos backend (customers, invoices, receivables) commiteados.
- [ ] **Asignar `MANAGE_CUSTOMER_CREDIT`** a los usuarios de administración EN PROD tras el deploy (si no, solo ADMIN podrá editar créditos).
- [ ] Avisar al equipo: **ya no se pide clave por cada venta a crédito** (cambio de la Sesión 99); la clave solo aparece con vencidos/sobre-cupo.
- [ ] Deploy lo hace Diego (`git pull && bash deploy.sh`).

---

## Fuera de alcance (fases futuras)

- Sistema de **puntos/scoring** de crédito por historial de pago.
- Endurecer los overrides a validación de clave **en el backend** (hoy frontend-gated).
- Historial versionado de análisis de crédito.
- Guard de permisos genérico aplicado a más endpoints (aquí el chequeo es puntual en el service).

## Self-review (hecho)

- **Cobertura del spec:** campos Customer + enums ✓ (T1); permiso + validación condicional + auto-sello ✓ (T2); días desde cliente + homologación dueDate + blindaje cupo/vencidos + override ✓ (T3); filtro empleados ✓ (T4, T7); form cliente gated + autorizado-por + isEmployee ✓ (T5); POS sin clave normal + override única ✓ (T6). Puntos/scoring y endurecer overrides → fuera de alcance (coincide con el spec).
- **Placeholders:** ninguno; código completo. Las referencias a nº de línea son orientativas (del análisis del código actual).
- **Consistencia de tipos/nombres:** `overrideCreditBlockAuthorized` usado igual en DTO, pay() y POS; `OVERRIDE_CREDIT_BLOCK` en enum, migración, POS; `MANAGE_CUSTOMER_CREDIT` en enum, service, frontend; `creditReviewedAt`/`creditAuthorizedBy`/`isEmployee` consistentes en schema, DTO, service y forms.
