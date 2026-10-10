# Portal de pedidos para clientes (mayorista) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que clientes seleccionados entren con su propio usuario (rol `CLIENT`) a un portal propio donde montan uno o varios pedidos (que quedan como facturas en espera normales) y ven sus facturas y estado de cuenta; la empresa los procesa en el POS el día del despacho.

**Architecture:** Rol nuevo `CLIENT` + vínculo `User.customerId`. Un guard GLOBAL (`ClientPortalGuard`) aplica una lista blanca: un CLIENT solo puede llamar rutas `@PortalAllowed()` (módulo `/portal` + auth). El módulo `portal` reutiliza la búsqueda de productos del POS (`ProductsService.findAll`), el cálculo de facturas (`InvoicesService.create/updateItems`) y las vistas de `/me` (`MeService`), mapeando a DTOs seguros (sin costos). Lado empresa: módulo `client-orders` (lista, visto, contador), marcas en el POS, dos flags en `/config`, vendedor asignado y acceso al portal en la ficha del cliente.

**Tech Stack:** NestJS + Prisma 5 + PostgreSQL (apps/api); Next.js 14 App Router + Tailwind (apps/web); monorepo pnpm.

**Spec:** `docs/superpowers/specs/2026-10-10-portal-pedidos-clientes-design.md`

---

## Convenciones y verificación (LEER PRIMERO)

**El repo NO tiene harness de tests** y el usuario pidió explícitamente no agregar código de pruebas. Verificación de cada tarea:
- **Typecheck backend:** `cd apps/api && npx tsc --noEmit -p tsconfig.json` → sin output.
- **Typecheck frontend:** `cd apps/web && npx tsc --noEmit -p . 2>&1 | grep -E "<archivos tocados>"` → sin output (hay errores preexistentes ajenos; solo importan los de archivos tocados).
- **Runtime:** levantar local (ver memoria `local-dev-startup`), probar endpoints con `curl` y pantallas en `http://localhost:3000`.

Obtener token para curl (API local en :4000):
```bash
login() { curl -s -X POST localhost:4000/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"$2\"}" | node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken"; }
ADMIN=$(login admin@trinity.com 'Admin123!')   # ajustar a un admin local real
```

**Reglas del repo que aplican a TODAS las tareas:**
- Migraciones **aditivas e idempotentes** (`IF NOT EXISTS`, `ADD VALUE IF NOT EXISTS`) y copiadas a `deploy/fix-schema.sql`.
- `document.title` con patrón `'… | Trinity ERP'` en cada página nueva.
- Montos Bs guardados se calculan al guardar con la tasa del día (lo hace `InvoicesService`); el portal solo **muestra** Bs referenciales.
- Frontend llama al API vía `fetch('/api/proxy/<ruta>')`.
- Commits: `tipo: Session 156 - descripción` + línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push después de cada commit.
- **No desplegar** hasta terminar todo y que el usuario lo apruebe. Deploy solo en la mayorista (`ssh root@134.209.164.59 "bash /opt/deploy-trinity-mayor.sh"`).

---

## Estructura de archivos

**Base de datos**
- Modificar: `packages/database/prisma/schema.prisma`
- Crear: `packages/database/prisma/migrations/20261010120000_portal_pedidos_clientes/migration.sql`
- Modificar: `deploy/fix-schema.sql`

**API (apps/api/src)**
- Crear: `common/decorators/portal-allowed.decorator.ts`, `common/guards/client-portal.guard.ts`, `common/temp-password.ts`
- Modificar: `app.module.ts` (APP_GUARD + módulos nuevos)
- Modificar: `modules/auth/role-permissions.ts`, `modules/role-permissions/role-permissions.service.ts`
- Modificar: `modules/auth/auth.controller.ts`, `modules/auth/auth.service.ts`
- Modificar: `modules/company-config/company-config.controller.ts`, `modules/company-config/dto/update-company-config.dto.ts`
- Modificar: `modules/invoices/invoices.service.ts`, `modules/quotations/quotations.service.ts`
- Modificar: `modules/me/me.service.ts`, `modules/me/me.module.ts`
- Crear: `modules/portal/{portal.module.ts,portal.service.ts,portal.controller.ts,dto/portal-order.dto.ts}`
- Modificar: `modules/customers/{customers.controller.ts,customers.module.ts,dto/create-customer.dto.ts}`; Crear: `modules/customers/customer-portal-access.service.ts`, `modules/customers/dto/portal-access.dto.ts`
- Modificar: `modules/users/users.service.ts` (usa `common/temp-password.ts`)
- Crear: `modules/client-orders/{client-orders.module.ts,client-orders.service.ts,client-orders.controller.ts}`

**Web (apps/web/src)**
- Crear: `components/qty-input.tsx`; Modificar: `app/(dashboard)/sales/pos/page.tsx`
- Modificar: `middleware.ts`, `app/(auth)/login/page.tsx`
- Crear: `app/(portal)/layout.tsx`, `app/(portal)/portal-header.tsx`, `app/(portal)/portal/page.tsx`, `app/(portal)/portal/pedido/[id]/page.tsx`
- Modificar: `app/(dashboard)/config/page.tsx`
- Modificar: `app/(dashboard)/sales/customers/[id]/page.tsx`; Crear: `components/customer-portal-access.tsx`
- Modificar: `components/sidebar.tsx`, `app/(dashboard)/settings/role-permissions/page.tsx`, `app/(dashboard)/settings/users/page.tsx`
- Crear: `app/(dashboard)/sales/pedidos-clientes/page.tsx`

---

## FASE 0 — Esquema

### Task 1: Schema Prisma + migración + fix-schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20261010120000_portal_pedidos_clientes/migration.sql`
- Modify: `deploy/fix-schema.sql`

- [ ] **Step 1: Rol CLIENT.** En `enum UserRole`, agregar `CLIENT` como último valor (después de `EMPLOYEE`).

- [ ] **Step 2: User → Customer.** En `model User`, debajo de la línea `employee            Employee?           @relation("EmployeeUser", ...)`, agregar:

```prisma
  // Portal de pedidos (rol CLIENT): ficha de cliente vinculada a este usuario.
  customerId          String?             @unique
  customer            Customer?           @relation("CustomerPortalUser", fields: [customerId], references: [id], onDelete: SetNull)
```

- [ ] **Step 3: Customer.** En `model Customer`, debajo de `employee              Employee?`, agregar:

```prisma
  // Vendedor asignado: los pedidos que el cliente monta en el portal llevan este vendedor.
  sellerId              String?
  seller                Seller?              @relation("CustomerAssignedSeller", fields: [sellerId], references: [id], onDelete: SetNull)
  portalUser            User?                @relation("CustomerPortalUser")
```
y antes de la `}` final del modelo: `  @@index([sellerId])`.

- [ ] **Step 4: Seller.** En `model Seller`, debajo de `receipts        Receipt[]`, agregar:

```prisma
  customers       Customer[] @relation("CustomerAssignedSeller")
```

- [ ] **Step 5: Invoice.** En `model Invoice`, debajo de `lockedAt            DateTime?`, agregar:

```prisma
  // Portal de clientes: pedido montado por el propio cliente (rol CLIENT).
  fromPortal          Boolean            @default(false)
  portalNote          String?            // nota del cliente para identificar el pedido ("Obra Los Pinos")
  clientUpdatedAt     DateTime?          // ultima modificacion hecha por el cliente
  staffSeenAt         DateTime?          // ultima vez que alguien de la empresa lo vio
```
y debajo de `@@index([status])`: `  @@index([fromPortal, status])`.

- [ ] **Step 6: CompanyConfig.** En `model CompanyConfig`, debajo de `requireCustomerAddress  Boolean  @default(false)`, agregar:

```prisma
  // Portal de pedidos para clientes (rol CLIENT). Apagado = los CLIENT no pueden entrar.
  clientPortalEnabled     Boolean  @default(false)
  // No borrar las facturas en espera a medianoche (pedidos que duran varios dias).
  keepPendingInvoices     Boolean  @default(false)
```

- [ ] **Step 7: Migración.** Crear `packages/database/prisma/migrations/20261010120000_portal_pedidos_clientes/migration.sql`:

```sql
-- Portal de pedidos para clientes (mayorista). Aditivo e idempotente.

-- 1) Rol CLIENT
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CLIENT';

-- 2) User -> Customer (usuario del portal)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_customerId_key" ON "User"("customerId");
DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Vendedor asignado al cliente
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "sellerId" TEXT;
CREATE INDEX IF NOT EXISTS "Customer_sellerId_idx" ON "Customer"("sellerId");
DO $$ BEGIN
  ALTER TABLE "Customer" ADD CONSTRAINT "Customer_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Marcas del pedido del portal en la factura en espera
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "fromPortal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "portalNote" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "clientUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "staffSeenAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Invoice_fromPortal_status_idx" ON "Invoice"("fromPortal", "status");

-- 5) Flags de empresa
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "clientPortalEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "keepPendingInvoices" BOOLEAN NOT NULL DEFAULT false;

-- 6) Modulo 'pedidos-clientes' a los roles existentes (ADMIN puede tener lista explicita, no '*')
UPDATE "RolePermission" SET modules = array_append(modules, 'pedidos-clientes')
WHERE role IN ('ADMIN','SUPERVISOR','CASHIER','SELLER') AND NOT ('pedidos-clientes' = ANY(modules));
```

- [ ] **Step 8: fix-schema.** Al final de `deploy/fix-schema.sql`, agregar `-- Session 156: portal de pedidos para clientes` seguido del MISMO contenido SQL del Step 7.

- [ ] **Step 9: Aplicar y generar**

Run: `cd packages/database && npx prisma validate && npx prisma migrate deploy && npx prisma generate`
Expected: `The schema at prisma/schema.prisma is valid`, `1 migration applied` (o "No pending migrations" si ya estaba), `Generated Prisma Client`.

- [ ] **Step 10: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20261010120000_portal_pedidos_clientes deploy/fix-schema.sql
git commit -m "feat: Session 156 - Portal clientes: schema (rol CLIENT, User.customerId, Customer.sellerId, marcas de pedido, flags)"
git push origin main
```

---

## FASE 1 — Seguridad base

### Task 2: Permisos del rol + decorador + guard global (lista blanca)

**Files:**
- Modify: `apps/api/src/modules/auth/role-permissions.ts`
- Modify: `apps/api/src/modules/role-permissions/role-permissions.service.ts:7-15`
- Create: `apps/api/src/common/decorators/portal-allowed.decorator.ts`
- Create: `apps/api/src/common/guards/client-portal.guard.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/modules/auth/auth.controller.ts`

- [ ] **Step 1: Defaults por rol.** En `role-permissions.ts`: agregar `'pedidos-clientes'` al final de los arrays de `SUPERVISOR`, `CASHIER` y `SELLER`, y una entrada nueva al final del objeto:

```ts
  CLIENT: ['portal'],
```

- [ ] **Step 2: Módulos válidos.** En `role-permissions.service.ts`, en `VALID_MODULES`, después de `'mi-perfil',` agregar `'pedidos-clientes', 'portal',`.

- [ ] **Step 3: Decorador.** Crear `apps/api/src/common/decorators/portal-allowed.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

export const PORTAL_ALLOWED_KEY = 'portal_allowed';

/**
 * Marca rutas que un usuario rol CLIENT (portal de pedidos) SI puede llamar.
 * Todo lo demas le da 403 (ClientPortalGuard). No afecta a ningun otro rol.
 */
export const PortalAllowed = () => SetMetadata(PORTAL_ALLOWED_KEY, true);
```

- [ ] **Step 4: Guard.** Crear `apps/api/src/common/guards/client-portal.guard.ts`:

```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { PORTAL_ALLOWED_KEY } from '../decorators/portal-allowed.decorator';

/**
 * Candado del portal de clientes (rol CLIENT). Corre como guard GLOBAL (APP_GUARD), ANTES
 * que el AuthGuard('jwt') de cada controlador, por eso decodifica el token por su cuenta:
 *  - Sin token / token invalido / rol distinto de CLIENT -> no hace nada (el resto de roles
 *    queda exactamente igual; el AuthGuard de la ruta decide como siempre).
 *  - Rol CLIENT -> LISTA BLANCA: solo rutas marcadas con @PortalAllowed(). Todo lo demas da
 *    403, aunque la ruta no tenga candado propio (la mayoria del API solo exige JWT).
 *  - Rol CLIENT con el portal apagado en /config -> 403 en todo.
 */
@Injectable()
export class ClientPortalGuard implements CanActivate {
  private readonly jwt = new JwtService();

  constructor(
    private reflector: Reflector,
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header || !header.startsWith('Bearer ')) return true;

    let payload: any;
    try {
      payload = this.jwt.verify(header.slice(7), {
        secret: this.config.get('JWT_SECRET', 'default-secret'),
      });
    } catch {
      return true; // token vencido/invalido: lo rechaza el AuthGuard de la ruta (401)
    }
    if (payload?.role !== 'CLIENT') return true;

    const allowed = this.reflector.getAllAndOverride<boolean>(PORTAL_ALLOWED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowed) {
      throw new ForbiddenException('Esta opción no está disponible en el portal de clientes.');
    }

    const cfg = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
      select: { clientPortalEnabled: true },
    });
    if (!cfg?.clientPortalEnabled) {
      throw new ForbiddenException({ code: 'PORTAL_DISABLED', message: 'El portal de clientes no está habilitado.' });
    }
    return true;
  }
}
```

- [ ] **Step 5: Registrar el guard.** En `app.module.ts`: agregar imports

```ts
import { APP_GUARD } from '@nestjs/core';
import { ClientPortalGuard } from './common/guards/client-portal.guard';
```
y en `@Module({...})`, después del array `imports: [...]`, agregar:

```ts
  providers: [{ provide: APP_GUARD, useClass: ClientPortalGuard }],
```

- [ ] **Step 6: Auth accesible al CLIENT.** En `auth.controller.ts`: importar `import { PortalAllowed } from '../../common/decorators/portal-allowed.decorator';` y agregar `@PortalAllowed()` en la línea anterior a `@Controller('auth')` (aplica a login, refresh, me, my-ip, change-password).

- [ ] **Step 7: Typecheck**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: sin output.

- [ ] **Step 8: Runtime (regresión staff).** Levantar el API. Con `$ADMIN`: `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $ADMIN" localhost:4000/products?limit=1` → `200` (el guard no afecta a otros roles). Sin token: `curl -s -o /dev/null -w "%{http_code}\n" localhost:4000/products` → `401`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/auth/role-permissions.ts apps/api/src/modules/role-permissions/role-permissions.service.ts apps/api/src/common/decorators/portal-allowed.decorator.ts apps/api/src/common/guards/client-portal.guard.ts apps/api/src/app.module.ts apps/api/src/modules/auth/auth.controller.ts
git commit -m "feat: Session 156 - Portal clientes: rol CLIENT con lista blanca global (ClientPortalGuard)"
git push origin main
```

### Task 3: Auth — login del CLIENT, límite de intentos, refresh con IP-lock

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts`

- [ ] **Step 1: Imports y constantes.** Cambiar la primera línea de imports a:

```ts
import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
```
agregar `import { RedisService } from '../../redis/redis.service';` y, antes de `@Injectable()`:

```ts
// Limite de intentos fallidos de login por IP + correo (no solo IP: los empleados del local
// comparten la IP publica y un limite por IP bloquearia a todos por los errores de uno).
const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_S = 15 * 60;
```
Agregar `private redis: RedisService,` al final del constructor.

- [ ] **Step 2: Helpers.** Dentro de la clase, antes de `async login(`:

```ts
  private loginFailKey(ip: string | undefined, email: string) {
    return `login-fail:${ip || 'noip'}:${normalizeEmail(email)}`;
  }

  // Un CLIENT solo entra si el portal esta encendido y su ficha de cliente existe y esta activa.
  private async assertClientCanLogin(customerId: string | null) {
    const cfg = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
      select: { clientPortalEnabled: true },
    });
    if (!cfg?.clientPortalEnabled) throw new ForbiddenException('El portal de clientes no está habilitado.');
    if (!customerId) throw new ForbiddenException('Tu usuario no está vinculado a un cliente.');
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { isActive: true } });
    if (!customer?.isActive) throw new ForbiddenException('Tu ficha de cliente está inactiva.');
  }
```

- [ ] **Step 3: login().** Reemplazar el inicio de `login` hasta el chequeo de contraseña (inclusive) por:

```ts
  async login(email: string, password: string, ip?: string) {
    const failKey = this.loginFailKey(ip, email);
    const fails = Number(await this.redis.get(failKey)) || 0;
    if (fails >= LOGIN_MAX_FAILS) {
      throw new HttpException(
        'Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const registerFail = () => this.redis.set(failKey, String(fails + 1), LOGIN_WINDOW_S);

    // Busqueda case-insensitive: el casing del email no debe impedir entrar.
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: normalizeEmail(email), mode: 'insensitive' } },
    });
    if (!user) {
      await registerFail();
      throw new UnauthorizedException('Credenciales invalidas');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Usuario inactivo');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await registerFail();
      throw new UnauthorizedException('Credenciales invalidas');
    }
    await this.redis.del(failKey);

    if (user.role === 'CLIENT') await this.assertClientCanLogin(user.customerId);
```
(el resto de `login` —IP-lock, lastLoginAt, payload— queda igual).

- [ ] **Step 4: refresh.** En `refreshToken`, después de `if (!user || !user.isActive) { throw ... }` agregar:

```ts
      if (user.role === 'CLIENT') await this.assertClientCanLogin(user.customerId);
```
y en `newPayload` agregar como última propiedad (hoy se pierde y el IP-lock deja de aplicar tras refrescar):

```ts
        restrictToOnSiteIp: user.restrictToOnSiteIp,
```

- [ ] **Step 5: Typecheck** — `cd apps/api && npx tsc --noEmit -p tsconfig.json` → sin output.

- [ ] **Step 6: Runtime.** 11 intentos con clave mala del mismo correo:
`for i in $(seq 1 11); do curl -s -o /dev/null -w "%{http_code} " -X POST localhost:4000/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@trinity.com","password":"mala"}'; done` → diez `401` y luego `429`. Luego reiniciar el API (con Redis caído el contador vive en memoria) o esperar 15 min y verificar que el login correcto funciona.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/auth/auth.service.ts
git commit -m "feat: Session 156 - Login: limite de intentos por IP+correo, chequeo de portal para CLIENT, refresh conserva IP-lock"
git push origin main
```

### Task 4: `/config` — flags nuevos y ocultar datos sensibles a no-ADMIN

**Files:**
- Modify: `apps/api/src/modules/company-config/dto/update-company-config.dto.ts`
- Modify: `apps/api/src/modules/company-config/company-config.controller.ts`

- [ ] **Step 1: DTO.** Debajo de `requireCustomerAddress?: boolean;` agregar:

```ts

  // Portal de pedidos para clientes (rol CLIENT).
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  clientPortalEnabled?: boolean;

  // No borrar las facturas en espera a medianoche.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  keepPendingInvoices?: boolean;
```

- [ ] **Step 2: Controller.** Reemplazar el método `get()` por:

```ts
  // GET abierto a cualquier usuario logueado (POS, sidebar...). A quien no es ADMIN no se le
  // entregan datos sensibles: la clave de autorizacion de credito ni la whitelist de IPs.
  @Get()
  async get(@CurrentUser('role') role: UserRole) {
    const config = await this.configService.get();
    if (role === UserRole.ADMIN) return config;
    const { creditAuthPassword, allowedIps, ...safe } = config;
    return safe;
  }
```
e importar `import { CurrentUser } from '../../common/decorators/current-user.decorator';`.

- [ ] **Step 3: Typecheck** → sin output.

- [ ] **Step 4: Runtime.** Con un token de cajero/vendedor: `curl -s -H "Authorization: Bearer $SELLER" localhost:4000/config | grep -c creditAuthPassword` → `0`. Con `$ADMIN` → `1`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/company-config
git commit -m "feat: Session 156 - /config: flags clientPortalEnabled/keepPendingInvoices y no exponer creditAuthPassword/allowedIps a no-ADMIN"
git push origin main
```

---

## FASE 2 — Facturas en espera

### Task 5: InvoicesService (extra del portal, lock en update, visto, conservar en espera) + cron

**Files:**
- Modify: `apps/api/src/modules/invoices/invoices.service.ts`
- Modify: `apps/api/src/modules/quotations/quotations.service.ts:433-455`

- [ ] **Step 1: Exportar lock + helper.** Reemplazar `const LOCK_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes` por:

```ts
export const LOCK_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// true si la factura esta tomada (retomada en el POS) y el bloqueo no ha vencido.
export function isLockActive(lockedById: string | null, lockedAt: Date | null): boolean {
  return !!lockedById && !!lockedAt && Date.now() - new Date(lockedAt).getTime() < LOCK_EXPIRY_MS;
}

// Datos extra que el portal de clientes graba junto con la factura en espera.
export interface PortalInvoiceExtra {
  fromPortal?: boolean;
  portalNote?: string | null;
  clientUpdatedAt?: Date;
}
```

- [ ] **Step 2: create().** Cambiar la firma a:

```ts
  async create(
    dto: CreateInvoiceDto,
    user: { id: string; role: UserRole },
    extra?: PortalInvoiceExtra,
  ) {
```
y en `this.prisma.invoice.create({ data: { ... } })`, después de `sellerId,` agregar `...(extra ?? {}),`.

- [ ] **Step 3: updateItems().** Cambiar la firma a:

```ts
  async updateItems(
    id: string,
    dto: CreateInvoiceDto,
    user: { id: string; role: UserRole },
    opts?: { extra?: PortalInvoiceExtra; rejectIfLocked?: boolean },
  ) {
```
Dentro de `this.prisma.$transaction(async (tx) => {`, ANTES de `await tx.invoiceItem.deleteMany(...)`, agregar:

```ts
      // Portal: re-chequear con la fila BLOQUEADA (FOR UPDATE) que nadie de la empresa la
      // haya tomado ni cobrado entre la validacion y el guardado.
      if (opts?.rejectIfLocked) {
        const rows = await tx.$queryRaw<{ status: string; lockedById: string | null; lockedAt: Date | null }[]>`
          SELECT status::text AS status, "lockedById", "lockedAt" FROM "Invoice" WHERE id = ${id} FOR UPDATE`;
        const row = rows[0];
        if (!row || row.status !== 'PENDING') {
          throw new ConflictException('Este pedido ya fue procesado por la empresa.');
        }
        if (isLockActive(row.lockedById, row.lockedAt)) {
          throw new ConflictException('El pedido está siendo procesado por la empresa y no se puede modificar.');
        }
      }
```
y en el `data` del `tx.invoice.update`, después de `lockedAt: null,` agregar `...(opts?.extra ?? {}),`.

- [ ] **Step 4: retake() marca visto.** En `retake`, reemplazar el `data` del update de bloqueo por:

```ts
      data: {
        lockedById: user.id,
        lockedAt: new Date(),
        // Pedido del portal: retomarlo en el POS cuenta como "visto" por la empresa.
        ...(invoice.fromPortal ? { staffSeenAt: new Date() } : {}),
      },
```

- [ ] **Step 5: findPending() respeta "conservar".** Al inicio de `findPending(todayOnly = false)` agregar:

```ts
    // Con "Conservar facturas en espera" el cajon del POS muestra TODAS (no solo las de hoy),
    // porque ya no se borran a medianoche y los pedidos duran varios dias.
    if (todayOnly) {
      const cfg = await this.prisma.companyConfig.findUnique({
        where: { id: 'singleton' },
        select: { keepPendingInvoices: true },
      });
      if (cfg?.keepPendingInvoices) todayOnly = false;
    }
```

- [ ] **Step 6: Cron.** En `quotations.service.ts`, al inicio de `deleteOldPendingInvoices()` agregar:

```ts
    // Opcion de empresa: conservar las facturas en espera (pedidos de varios dias).
    const cfg = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
      select: { keepPendingInvoices: true },
    });
    if (cfg?.keepPendingInvoices) return 0;
```

- [ ] **Step 7: Typecheck** → sin output.

- [ ] **Step 8: Runtime.** Activar el flag: `curl -s -X PATCH -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"keepPendingInvoices":true}' localhost:4000/config >/dev/null`. Poner una factura en espera con fecha de ayer: `psql "$DATABASE_URL" -c "UPDATE \"Invoice\" SET \"createdAt\" = now() - interval '2 days' WHERE id = '<id-de-una-en-espera>'"`. `curl -s -H "Authorization: Bearer $ADMIN" "localhost:4000/invoices/pending?today=true" | grep -c <id>` → `1`. Volver el flag a `false` → `0`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/invoices/invoices.service.ts apps/api/src/modules/quotations/quotations.service.ts
git commit -m "feat: Session 156 - Facturas en espera: extra del portal, bloqueo FOR UPDATE, visto al retomar y opcion conservar"
git push origin main
```

---

## FASE 3 — API del portal

### Task 6: MeService — funciones por cliente reutilizables

**Files:**
- Modify: `apps/api/src/modules/me/me.service.ts`
- Modify: `apps/api/src/modules/me/me.module.ts`

- [ ] **Step 1: Métodos por customerId.** En `MeService`, agregar después de `resolveEmployee`:

```ts
  // ---- Vistas por cliente (las usan /me del empleado y /portal del cliente) ----

  async customerCxc(customerId: string) {
    const rows = await this.prisma.receivable.findMany({
      // Solo las pendientes (mismo filtro que el saldo del resumen): las pagadas/anuladas no se muestran
      where: { customerId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
      select: {
        id: true, number: true, documentNumber: true, type: true,
        amountUsd: true, amountBs: true, paidAmountUsd: true, paidAmountBs: true,
        dueDate: true, originalDate: true, status: true, currency: true,
      },
      orderBy: [{ dueDate: 'asc' }, { originalDate: 'asc' }],
    });
    return rows.map((r) => ({ ...r, saldoUsd: r2(r.amountUsd - r.paidAmountUsd) }));
  }

  // excludePending: el portal muestra los pedidos en espera aparte ("Mis pedidos").
  async customerFacturas(customerId: string, opts: { excludePending?: boolean } = {}) {
    const rows = await this.prisma.invoice.findMany({
      where: { customerId, ...(opts.excludePending ? { status: { not: 'PENDING' as const } } : {}) },
      select: {
        id: true, number: true, fiscalNumber: true, status: true,
        totalUsd: true, totalBs: true, totalPaidUsd: true,
        isCredit: true, dueDate: true, createdAt: true, paidAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((i) => ({ ...i, saldoUsd: r2(i.totalUsd - i.totalPaidUsd) }));
  }

  async customerFacturaPdf(customerId: string, invoiceId: string): Promise<Buffer> {
    // Permiso: solo facturas de ESE cliente.
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, customerId: true },
    });
    if (!invoice || invoice.customerId !== customerId) {
      throw new ForbiddenException('Factura no disponible.');
    }
    return this.invoicePdf.generatePdf(invoiceId);
  }
```

- [ ] **Step 2: Delegar los existentes.** Reemplazar los cuerpos de `getCxc`, `getFacturas` y `getFacturaPdf` por:

```ts
  async getCxc(userId: string) {
    const { customerId } = await this.resolveEmployee(userId);
    if (!customerId) return [];
    return this.customerCxc(customerId);
  }

  async getFacturas(userId: string) {
    const { customerId } = await this.resolveEmployee(userId);
    if (!customerId) return [];
    return this.customerFacturas(customerId);
  }
```
```ts
  async getFacturaPdf(userId: string, invoiceId: string): Promise<Buffer> {
    const { customerId } = await this.resolveEmployee(userId);
    if (!customerId) throw new ForbiddenException('Factura no disponible.');
    return this.customerFacturaPdf(customerId, invoiceId);
  }
```

- [ ] **Step 3: Exportar.** En `me.module.ts` agregar `exports: [MeService],` al `@Module`.

- [ ] **Step 4: Typecheck** → sin output. **Runtime (regresión):** con el usuario de un empleado, `/mi-perfil` sigue mostrando CxC y facturas, y el PDF abre.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/me
git commit -m "refactor: Session 156 - MeService: vistas de CxC/facturas por cliente reutilizables"
git push origin main
```

### Task 7: Módulo `portal`

**Files:**
- Create: `apps/api/src/modules/portal/dto/portal-order.dto.ts`
- Create: `apps/api/src/modules/portal/portal.service.ts`
- Create: `apps/api/src/modules/portal/portal.controller.ts`
- Create: `apps/api/src/modules/portal/portal.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: DTO.** Crear `dto/portal-order.dto.ts` (sin precio ni descuento: con `forbidNonWhitelisted` el API rechaza con 400 si alguien los manda):

```ts
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PortalOrderItemDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  quantity: number;
}

export class PortalOrderDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  portalNote?: string;

  @ApiProperty({ type: [PortalOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'El pedido debe tener al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => PortalOrderItemDto)
  items: PortalOrderItemDto[];
}
```

- [ ] **Step 2: Service.** Crear `portal.service.ts`:

```ts
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { InvoicesService, isLockActive } from '../invoices/invoices.service';
import { MeService } from '../me/me.service';
import { caracasDateKey } from '../../common/timezone';
import { PortalOrderDto, PortalOrderItemDto } from './dto/portal-order.dto';

const r2 = (n: number) => Math.round((n || 0) * 100) / 100;
const r3 = (n: number) => Math.round((n || 0) * 1000) / 1000;
const LOCKED_MSG = 'El pedido está siendo procesado por la empresa y no se puede modificar.';

type OrderState = 'ABIERTO' | 'EN_USO';

@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private products: ProductsService,
    private invoices: InvoicesService,
    private me: MeService,
  ) {}

  // Cliente del usuario logueado. SIEMPRE desde la BD (nunca del body ni del token).
  async resolveCustomer(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        isActive: true, role: true,
        customer: {
          select: { id: true, name: true, code: true, documentType: true, rif: true, isActive: true, sellerId: true },
        },
      },
    });
    if (!user || !user.isActive || user.role !== 'CLIENT' || !user.customer || !user.customer.isActive) {
      throw new ForbiddenException('Tu usuario no tiene acceso al portal.');
    }
    return user.customer;
  }

  private async todayRate(): Promise<number | null> {
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: caracasDateKey() } });
    return rate?.rate ?? null;
  }

  private async assertRate() {
    if (!(await this.todayRate())) {
      throw new BadRequestException('Todavía no está cargada la tasa del día. Intenta de nuevo más tarde.');
    }
  }

  // Existencia vendible = suma de almacenes que cuentan para la venta (igual que el POS).
  private sellableStock(stock: { quantity: number; warehouse?: { countsForSale?: boolean | null } | null }[]) {
    return stock.reduce((s, x) => s + (x.warehouse?.countsForSale === false ? 0 : x.quantity || 0), 0);
  }

  // DTO SEGURO: nunca costo, % ganancia, proveedor, precio mayor ni stock por almacen.
  private toPortalProduct(p: any, reserved: Record<string, number>, rate: number | null) {
    const stock = r3(this.sellableStock(p.stock ?? []));
    return {
      id: p.id as string,
      code: p.code as string,
      name: p.name as string,
      description: (p.description ?? null) as string | null,
      thumbUrl: (p.primaryImageThumbUrl ?? null) as string | null,
      imageUrl: (p.primaryImageMediumUrl ?? p.primaryImageThumbUrl ?? null) as string | null,
      priceUsd: p.priceDetal as number,
      priceBs: rate ? r2(p.priceDetal * rate) : null,
      isOnSale: !!p.isOnSale,
      isService: !!p.isService,
      stock,
      available: r3(stock - (reserved[p.id] || 0)),
    };
  }

  private orderState(inv: { lockedById: string | null; lockedAt: Date | null }): OrderState {
    return isLockActive(inv.lockedById, inv.lockedAt) ? 'EN_USO' : 'ABIERTO';
  }

  // Une renglones repetidos del mismo producto (suma cantidades).
  private mergeItems(items: PortalOrderItemDto[]) {
    const map = new Map<string, number>();
    for (const it of items) map.set(it.productId, r3((map.get(it.productId) || 0) + it.quantity));
    return [...map.entries()].map(([productId, quantity]) => ({ productId, quantity }));
  }

  private async ownOrder(customerId: string, id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      select: { id: true, customerId: true, fromPortal: true, status: true, lockedById: true, lockedAt: true },
    });
    if (!inv || inv.customerId !== customerId || !inv.fromPortal) throw new NotFoundException('Pedido no encontrado');
    if (inv.status !== 'PENDING') throw new ConflictException('Este pedido ya fue procesado por la empresa.');
    return inv;
  }

  // ---------- Datos del portal ----------

  async getMe(userId: string) {
    const c = await this.resolveCustomer(userId);
    const [cfg, rate] = await Promise.all([
      this.prisma.companyConfig.findUnique({
        where: { id: 'singleton' },
        select: { companyName: true, allowNegativeStock: true },
      }),
      this.todayRate(),
    ]);
    return {
      customer: { name: c.name, code: c.code, documentType: c.documentType, rif: c.rif },
      companyName: cfg?.companyName ?? '',
      allowNegativeStock: cfg?.allowNegativeStock ?? true,
      rate,
    };
  }

  // MISMA busqueda del POS (ProductsService.findAll: tolerante a P/, tildes y orden de
  // palabras; 500 resultados; ofertas primero). Solo se quitan los bloqueados y sin precio.
  async searchProducts(userId: string, search: string) {
    await this.resolveCustomer(userId);
    const q = (search || '').trim();
    if (!q) return { data: [], total: 0 };
    const [res, reserved, rate] = await Promise.all([
      this.products.findAll({ search: q, limit: 500, page: 1, onSaleFirst: true }),
      this.invoices.getReservedStock(),
      this.todayRate(),
    ]);
    const data = res.data
      .filter((p: any) => !p.saleBlocked && p.priceDetal > 0)
      .map((p: any) => this.toPortalProduct(p, reserved, rate));
    return { data, total: data.length };
  }

  // ---------- Pedidos ----------

  async listOrders(userId: string) {
    const c = await this.resolveCustomer(userId);
    const rows = await this.prisma.invoice.findMany({
      where: { customerId: c.id, status: 'PENDING', fromPortal: true },
      select: {
        id: true, portalNote: true, createdAt: true, clientUpdatedAt: true,
        totalUsd: true, totalBs: true, lockedById: true, lockedAt: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(({ lockedById, lockedAt, _count, ...r }) => ({
      ...r,
      itemCount: _count.items,
      state: this.orderState({ lockedById, lockedAt }),
    }));
  }

  async getOrder(userId: string, id: string) {
    const c = await this.resolveCustomer(userId);
    await this.ownOrder(c.id, id);
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true, portalNote: true, createdAt: true, clientUpdatedAt: true, lockedById: true, lockedAt: true,
        items: { select: { productId: true, productName: true, quantity: true } },
      },
    });
    if (!inv) throw new NotFoundException('Pedido no encontrado');
    const productIds = inv.items.map((i) => i.productId);
    const [products, reserved, rate] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: productIds } },
        include: { stock: { include: { warehouse: { select: { countsForSale: true } } } } },
      }),
      this.invoices.getReservedStock(),
      this.todayRate(),
    ]);
    const pmap = new Map(products.map((p) => [p.id, this.toPortalProduct(p, reserved, rate)]));
    return {
      id: inv.id,
      portalNote: inv.portalNote,
      createdAt: inv.createdAt,
      clientUpdatedAt: inv.clientUpdatedAt,
      state: this.orderState(inv),
      items: inv.items.map((it) => {
        const p = pmap.get(it.productId);
        return {
          productId: it.productId,
          code: p?.code ?? '',
          name: p?.name ?? it.productName,
          thumbUrl: p?.thumbUrl ?? null,
          // Precio ACTUAL (referencial): se factura al precio y tasa del dia del despacho.
          priceUsd: p?.priceUsd ?? 0,
          isService: p?.isService ?? false,
          stock: p?.stock ?? 0,
          // El reservado incluye a este mismo pedido: se le suma su cantidad para que el
          // cliente vea lo que realmente le queda disponible.
          available: r3((p?.available ?? 0) + it.quantity),
          quantity: it.quantity,
        };
      }),
    };
  }

  async createOrder(userId: string, dto: PortalOrderDto) {
    const c = await this.resolveCustomer(userId);
    await this.assertRate();
    // Precio de lista y descuento 0 SIEMPRE: el DTO del portal no trae precio ni descuento.
    const inv = await this.invoices.create(
      { customerId: c.id, sellerId: c.sellerId ?? undefined, items: this.mergeItems(dto.items) },
      { id: userId, role: UserRole.CLIENT },
      { fromPortal: true, portalNote: dto.portalNote?.trim() || null, clientUpdatedAt: new Date() },
    );
    return this.getOrder(userId, inv.id);
  }

  async updateOrder(userId: string, id: string, dto: PortalOrderDto) {
    const c = await this.resolveCustomer(userId);
    const inv = await this.ownOrder(c.id, id);
    if (this.orderState(inv) === 'EN_USO') throw new ConflictException(LOCKED_MSG);
    await this.assertRate();
    await this.invoices.updateItems(
      id,
      { customerId: c.id, items: this.mergeItems(dto.items) },
      { id: userId, role: UserRole.CLIENT },
      { extra: { portalNote: dto.portalNote?.trim() || null, clientUpdatedAt: new Date() }, rejectIfLocked: true },
    );
    return this.getOrder(userId, id);
  }

  async deleteOrder(userId: string, id: string) {
    const c = await this.resolveCustomer(userId);
    const inv = await this.ownOrder(c.id, id);
    if (this.orderState(inv) === 'EN_USO') throw new ConflictException(LOCKED_MSG);
    return this.invoices.delete(id, { id: userId, role: UserRole.CLIENT });
  }

  // ---------- Mi cuenta ----------

  async cuentaCxc(userId: string) {
    const c = await this.resolveCustomer(userId);
    return this.me.customerCxc(c.id);
  }

  async cuentaFacturas(userId: string) {
    const c = await this.resolveCustomer(userId);
    return this.me.customerFacturas(c.id, { excludePending: true });
  }

  async cuentaFacturaPdf(userId: string, invoiceId: string) {
    const c = await this.resolveCustomer(userId);
    return this.me.customerFacturaPdf(c.id, invoiceId);
  }
}
```

- [ ] **Step 3: Controller.** Crear `portal.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PortalAllowed } from '../../common/decorators/portal-allowed.decorator';
import { PortalService } from './portal.service';
import { PortalOrderDto } from './dto/portal-order.dto';

// Unico modulo que un usuario CLIENT puede llamar (ver ClientPortalGuard). Todo se acota al
// cliente vinculado al usuario (PortalService.resolveCustomer), nunca a parametros del navegador.
@ApiTags('Portal de clientes')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@PortalAllowed()
@Controller('portal')
export class PortalController {
  constructor(private service: PortalService) {}

  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.service.getMe(userId);
  }

  @Get('products')
  products(@CurrentUser('id') userId: string, @Query('search') search?: string) {
    return this.service.searchProducts(userId, search || '');
  }

  @Get('orders')
  listOrders(@CurrentUser('id') userId: string) {
    return this.service.listOrders(userId);
  }

  @Get('orders/:id')
  getOrder(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.getOrder(userId, id);
  }

  @Post('orders')
  createOrder(@CurrentUser('id') userId: string, @Body() dto: PortalOrderDto) {
    return this.service.createOrder(userId, dto);
  }

  @Patch('orders/:id')
  updateOrder(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: PortalOrderDto) {
    return this.service.updateOrder(userId, id, dto);
  }

  @Delete('orders/:id')
  deleteOrder(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.deleteOrder(userId, id);
  }

  @Get('cuenta/cxc')
  cxc(@CurrentUser('id') userId: string) {
    return this.service.cuentaCxc(userId);
  }

  @Get('cuenta/facturas')
  facturas(@CurrentUser('id') userId: string) {
    return this.service.cuentaFacturas(userId);
  }

  @Get('cuenta/facturas/:id/pdf')
  async facturaPdf(@CurrentUser('id') userId: string, @Param('id') id: string, @Res() res: Response) {
    const buffer = await this.service.cuentaFacturaPdf(userId, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="factura-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
```

- [ ] **Step 4: Module.** Crear `portal.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { ProductsModule } from '../products/products.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { MeModule } from '../me/me.module';

@Module({
  imports: [ProductsModule, InvoicesModule, MeModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
```
En `app.module.ts`: `import { PortalModule } from './modules/portal/portal.module';` y agregar `PortalModule,` al final del array `imports`.

- [ ] **Step 5: Typecheck** → sin output.

- [ ] **Step 6: Runtime.** Crear un usuario CLIENT de prueba vinculado a un cliente activo (por SQL, mientras no exista la pantalla de la Task 8):

```bash
HASH=$(cd apps/api && node -e "require('bcrypt').hash('Cliente123',10).then(console.log)")
psql "$DATABASE_URL" -c "INSERT INTO \"User\"(id,name,email,password,role,\"isActive\",\"mustChangePassword\",\"customerId\",\"createdAt\",\"updatedAt\") VALUES ('portaltest','Cliente Prueba','cliente@prueba.com','$HASH','CLIENT',true,false,'<id-cliente>',now(),now())"
curl -s -X PATCH -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"clientPortalEnabled":true}' localhost:4000/config >/dev/null
CLI=$(login cliente@prueba.com Cliente123)
for p in products customers invoices config receivables "invoices/pending"; do printf "$p "; curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $CLI" "localhost:4000/$p"; done
```
Expected: todos `403`.
```bash
curl -s -H "Authorization: Bearer $CLI" "localhost:4000/portal/products?search=tubo" | grep -cE "costUsd|gananciaPct|priceMayor|supplier"   # -> 0
curl -s -X POST -H "Authorization: Bearer $CLI" -H 'Content-Type: application/json' -d '{"items":[{"productId":"<id>","quantity":2,"unitPrice":0.01}]}' localhost:4000/portal/orders   # -> 400 (property unitPrice should not exist)
curl -s -X POST -H "Authorization: Bearer $CLI" -H 'Content-Type: application/json' -d '{"portalNote":"Prueba","items":[{"productId":"<id>","quantity":2.5}]}' localhost:4000/portal/orders   # -> 201 con state ABIERTO
curl -s -H "Authorization: Bearer $CLI" localhost:4000/portal/orders   # -> lista con el pedido
```
Con el portal apagado (`clientPortalEnabled:false`) → `/portal/orders` da `403` y el login del cliente da `403`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/portal apps/api/src/app.module.ts
git commit -m "feat: Session 156 - API del portal de clientes: busqueda segura, pedidos y mi cuenta"
git push origin main
```

---

## FASE 4 — API lado empresa

### Task 8: Cliente — vendedor asignado + acceso al portal

**Files:**
- Create: `apps/api/src/common/temp-password.ts`
- Modify: `apps/api/src/modules/users/users.service.ts`
- Modify: `apps/api/src/modules/customers/dto/create-customer.dto.ts`
- Create: `apps/api/src/modules/customers/dto/portal-access.dto.ts`
- Create: `apps/api/src/modules/customers/customer-portal-access.service.ts`
- Modify: `apps/api/src/modules/customers/customers.controller.ts`, `customers.module.ts`

- [ ] **Step 1: Clave temporal compartida.** Crear `common/temp-password.ts` moviendo la función de `users.service.ts`:

```ts
import * as crypto from 'crypto';

// Clave temporal legible (sin 0/O/1/l/I). El usuario la cambia en su primer login.
export function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(crypto.randomInt(chars.length));
  }
  return password;
}
```
En `users.service.ts`: borrar la función local `generateTempPassword` y el `import * as crypto from 'crypto';`, y agregar `import { generateTempPassword } from '../../common/temp-password';`.

- [ ] **Step 2: sellerId en el DTO.** En `create-customer.dto.ts`, al final de la clase:

```ts

  // Vendedor asignado (los pedidos del portal llevan este vendedor). null = sin vendedor.
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  sellerId?: string | null;
```
(verificar que `IsString` esté importado; `create`/`update` del service ya hacen `...dto`).

- [ ] **Step 3: DTOs del acceso.** Crear `dto/portal-access.dto.ts`:

```ts
import { IsBoolean, IsEmail, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePortalAccessDto {
  @ApiProperty()
  @IsEmail({}, { message: 'El correo no es valido' })
  email: string;
}

export class UpdatePortalAccessDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  resetPassword?: boolean;
}
```

- [ ] **Step 4: Service.** Crear `customer-portal-access.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeEmail } from '../../common/email';
import { generateTempPassword } from '../../common/temp-password';
import { CreatePortalAccessDto, UpdatePortalAccessDto } from './dto/portal-access.dto';

const USER_SELECT = {
  id: true, email: true, name: true, isActive: true, lastLoginAt: true, mustChangePassword: true,
} as const;

// Usuario rol CLIENT vinculado a una ficha de cliente (portal de pedidos).
@Injectable()
export class CustomerPortalAccessService {
  constructor(private prisma: PrismaService) {}

  private async assertCustomer(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true } });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    return customer;
  }

  async get(customerId: string) {
    await this.assertCustomer(customerId);
    const user = await this.prisma.user.findUnique({ where: { customerId }, select: USER_SELECT });
    return { user };
  }

  async create(customerId: string, dto: CreatePortalAccessDto) {
    const customer = await this.assertCustomer(customerId);
    if (await this.prisma.user.findUnique({ where: { customerId } })) {
      throw new ConflictException('Este cliente ya tiene acceso al portal');
    }
    const email = normalizeEmail(dto.email);
    const dup = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (dup) throw new ConflictException('El email ya esta registrado');

    const temporaryPassword = generateTempPassword();
    const user = await this.prisma.user.create({
      data: {
        name: customer.name,
        email,
        password: await bcrypt.hash(temporaryPassword, 10),
        role: 'CLIENT',
        customerId,
        isActive: true,
        mustChangePassword: true,
      },
      select: USER_SELECT,
    });
    return { user, temporaryPassword };
  }

  async update(customerId: string, dto: UpdatePortalAccessDto) {
    const user = await this.prisma.user.findUnique({ where: { customerId } });
    if (!user) throw new NotFoundException('Este cliente no tiene acceso al portal');
    const data: Prisma.UserUpdateInput = {};
    let temporaryPassword: string | undefined;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.resetPassword) {
      temporaryPassword = generateTempPassword();
      data.password = await bcrypt.hash(temporaryPassword, 10);
      data.mustChangePassword = true;
    }
    const updated = await this.prisma.user.update({ where: { id: user.id }, data, select: USER_SELECT });
    return { user: updated, temporaryPassword };
  }
}
```

- [ ] **Step 5: Controller.** En `customers.controller.ts` agregar imports:

```ts
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CustomerPortalAccessService } from './customer-portal-access.service';
import { CreatePortalAccessDto, UpdatePortalAccessDto } from './dto/portal-access.dto';
```
inyectar `private readonly portalAccess: CustomerPortalAccessService,` en el constructor, y agregar estos métodos al final de la clase:

```ts
  // ---- Acceso al portal de pedidos (usuario rol CLIENT de este cliente) ----
  @Get(':id/portal-access')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  getPortalAccess(@Param('id') id: string) {
    return this.portalAccess.get(id);
  }

  @Post(':id/portal-access')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  createPortalAccess(@Param('id') id: string, @Body() dto: CreatePortalAccessDto) {
    return this.portalAccess.create(id, dto);
  }

  @Patch(':id/portal-access')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  updatePortalAccess(@Param('id') id: string, @Body() dto: UpdatePortalAccessDto) {
    return this.portalAccess.update(id, dto);
  }
```
En `customers.module.ts`: `providers: [CustomersService, CustomerPortalAccessService],` (con su import).

- [ ] **Step 6: Typecheck** → sin output.

- [ ] **Step 7: Runtime.**
```bash
curl -s -X POST -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"email":"otro@cliente.com"}' localhost:4000/customers/<id-cliente-2>/portal-access   # -> { user, temporaryPassword }
curl -s -X PATCH -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"sellerId":"<id-vendedor>"}' localhost:4000/customers/<id-cliente-2> | grep -o '"sellerId":"[^"]*"'
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $SELLER" localhost:4000/customers/<id-cliente-2>/portal-access   # -> 403
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/common/temp-password.ts apps/api/src/modules/users/users.service.ts apps/api/src/modules/customers
git commit -m "feat: Session 156 - Clientes: vendedor asignado y acceso al portal (crear, activar, reiniciar clave)"
git push origin main
```

### Task 9: Módulo `client-orders` (pantalla y contador de la empresa)

**Files:**
- Create: `apps/api/src/modules/client-orders/client-orders.service.ts`
- Create: `apps/api/src/modules/client-orders/client-orders.controller.ts`
- Create: `apps/api/src/modules/client-orders/client-orders.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Service.**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isLockActive } from '../invoices/invoices.service';

// "Sin ver" = nunca visto por la empresa, o el cliente lo modifico despues de la ultima vista.
const isUnseen = (r: { staffSeenAt: Date | null; clientUpdatedAt: Date | null }) =>
  !r.staffSeenAt || (!!r.clientUpdatedAt && r.clientUpdatedAt > r.staffSeenAt);

@Injectable()
export class ClientOrdersService {
  constructor(private prisma: PrismaService) {}

  private async sellerOf(userId: string) {
    const seller = await this.prisma.seller.findUnique({ where: { userId }, select: { id: true } });
    return seller?.id ?? null;
  }

  async list(q: { sellerId?: string; mine?: boolean }, userId: string) {
    let sellerId = q.sellerId || undefined;
    // "Mis clientes": pedidos del vendedor vinculado al usuario (ninguno si no tiene vendedor).
    if (q.mine) sellerId = (await this.sellerOf(userId)) ?? '__none__';

    const rows = await this.prisma.invoice.findMany({
      where: { fromPortal: true, status: 'PENDING', ...(sellerId ? { sellerId } : {}) },
      select: {
        id: true, portalNote: true, createdAt: true, clientUpdatedAt: true, staffSeenAt: true,
        totalUsd: true, totalBs: true, lockedById: true, lockedAt: true,
        customer: { select: { id: true, name: true, code: true } },
        seller: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { clientUpdatedAt: 'desc' },
    });

    const lockerIds = rows.filter((r) => isLockActive(r.lockedById, r.lockedAt)).map((r) => r.lockedById!);
    const lockers = lockerIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: lockerIds } }, select: { id: true, name: true } })
      : [];
    const lockerMap = new Map(lockers.map((u) => [u.id, u.name]));

    return rows.map(({ _count, lockedById, lockedAt, ...r }) => {
      const locked = isLockActive(lockedById, lockedAt);
      return {
        ...r,
        itemCount: _count.items,
        unseen: isUnseen(r),
        state: locked ? 'EN_USO' : 'ABIERTO',
        lockedByName: locked ? lockerMap.get(lockedById!) ?? null : null,
      };
    });
  }

  async findOne(id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true, fromPortal: true, status: true, portalNote: true, createdAt: true, clientUpdatedAt: true,
        totalUsd: true, totalBs: true,
        customer: { select: { id: true, name: true, code: true, documentType: true, rif: true } },
        seller: { select: { id: true, name: true } },
        items: { select: { productId: true, productName: true, quantity: true, totalUsd: true } },
      },
    });
    if (!inv || !inv.fromPortal) throw new NotFoundException('Pedido no encontrado');
    const codes = await this.prisma.product.findMany({
      where: { id: { in: inv.items.map((i) => i.productId) } },
      select: { id: true, code: true },
    });
    const codeMap = new Map(codes.map((p) => [p.id, p.code]));
    return { ...inv, items: inv.items.map((i) => ({ ...i, productCode: codeMap.get(i.productId) ?? null })) };
  }

  async markSeen(id: string) {
    await this.prisma.invoice.updateMany({ where: { id, fromPortal: true }, data: { staffSeenAt: new Date() } });
    return { ok: true };
  }

  // Vendedor con vendedor vinculado: solo cuenta los de SUS clientes. Resto de roles: todos.
  async unseenCount(user: { id: string; role: UserRole }) {
    const sellerId = user.role === 'SELLER' ? await this.sellerOf(user.id) : null;
    const rows = await this.prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS n FROM "Invoice"
      WHERE "fromPortal" = true AND status = 'PENDING'
        AND ("staffSeenAt" IS NULL OR "clientUpdatedAt" > "staffSeenAt")
        ${sellerId ? Prisma.sql`AND "sellerId" = ${sellerId}` : Prisma.empty}`);
    return { count: rows[0]?.n ?? 0 };
  }
}
```

- [ ] **Step 2: Controller.**

```ts
import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { ClientOrdersService } from './client-orders.service';

@ApiTags('Pedidos de clientes')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('pedidos-clientes')
@Controller('client-orders')
export class ClientOrdersController {
  constructor(private service: ClientOrdersService) {}

  @Get('unseen-count')
  unseenCount(@CurrentUser() user: { id: string; role: UserRole }) {
    return this.service.unseenCount(user);
  }

  @Get()
  list(
    @CurrentUser('id') userId: string,
    @Query('sellerId') sellerId?: string,
    @Query('mine') mine?: string,
  ) {
    return this.service.list({ sellerId, mine: mine === 'true' }, userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/seen')
  markSeen(@Param('id') id: string) {
    return this.service.markSeen(id);
  }
}
```

- [ ] **Step 3: Module** (`client-orders.module.ts`):

```ts
import { Module } from '@nestjs/common';
import { ClientOrdersController } from './client-orders.controller';
import { ClientOrdersService } from './client-orders.service';

@Module({
  controllers: [ClientOrdersController],
  providers: [ClientOrdersService],
})
export class ClientOrdersModule {}
```
Registrar `ClientOrdersModule` en `app.module.ts` (import + al final de `imports`).

- [ ] **Step 4: Typecheck** → sin output.

- [ ] **Step 5: Runtime.** `curl -s -H "Authorization: Bearer $ADMIN" localhost:4000/client-orders/unseen-count` → `{"count":1}` (el pedido de prueba). `curl -s -X PATCH -H "Authorization: Bearer $ADMIN" localhost:4000/client-orders/<id>/seen` y repetir → `{"count":0}`. Editar el pedido como cliente (PATCH /portal/orders/<id>) → vuelve a `1`. Un usuario WAREHOUSE → `403`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/client-orders apps/api/src/app.module.ts
git commit -m "feat: Session 156 - API pedidos de clientes para la empresa: lista, detalle, visto y contador"
git push origin main
```

---

## FASE 5 — Web

### Task 10: `QtyInput` compartido (acepta punto y coma)

**Files:**
- Create: `apps/web/src/components/qty-input.tsx`
- Modify: `apps/web/src/app/(dashboard)/sales/pos/page.tsx:120-165`

- [ ] **Step 1: Componente.** Crear `components/qty-input.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

// Input de cantidad compartido (POS y portal de clientes). Permite borrar todo mientras se
// escribe (no reaparece el 0) y decimales (0.25). Acepta PUNTO y COMA: algunos teclados
// Android en español solo muestran la coma en el teclado numerico -> se convierte a punto.
// Mantiene el texto crudo mientras se edita y confirma al salir; si queda vacio, 0 o
// invalido, revierte al valor anterior.
export default function QtyInput({
  value,
  onCommit,
  className,
  disabled,
}: {
  value: number;
  onCommit: (qty: number) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState<string>(String(value));
  const [editing, setEditing] = useState(false);

  // Si el valor cambia desde afuera (botones +/-), refrescar el texto cuando no se esta editando.
  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      disabled={disabled}
      onFocus={(e) => {
        setEditing(true);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        // coma -> punto; solo digitos y un punto
        let v = e.target.value.replace(/,/g, '.').replace(/[^0-9.]/g, '');
        const parts = v.split('.');
        if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
        setText(v);
      }}
      onBlur={() => {
        setEditing(false);
        const n = parseFloat(text);
        if (!isNaN(n) && n > 0) onCommit(n);
        else setText(String(value)); // revertir: nunca queda en vacio/0/negativo
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={className}
    />
  );
}
```

- [ ] **Step 2: POS usa el compartido.** En `sales/pos/page.tsx`: borrar el comentario `// Input de cantidad que permite borrar...` y la función `function QtyInput({...}) {...}` completa (líneas ~120-165), y agregar junto a los demás imports de componentes: `import QtyInput from '@/components/qty-input';`. Los usos (`<QtyInput value=... onCommit=... className=... />`) no cambian.

- [ ] **Step 3: Typecheck** — `cd apps/web && npx tsc --noEmit -p . 2>&1 | grep -E "qty-input|sales/pos"` → sin output.

- [ ] **Step 4: Runtime (POS).** En el POS (escritorio y vista móvil con DevTools): agregar un producto, borrar la cantidad completa (queda vacío, no reaparece 0), escribir `2,5` → queda `2.5`; escribir `3.75` → `3.75`; dejar vacío y salir → vuelve al valor anterior.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/qty-input.tsx "apps/web/src/app/(dashboard)/sales/pos/page.tsx"
git commit -m "feat: Session 156 - QtyInput compartido: acepta coma como decimal (POS y portal)"
git push origin main
```

### Task 11: Middleware y login para el rol CLIENT

**Files:**
- Modify: `apps/web/src/middleware.ts`
- Modify: `apps/web/src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Ruta de la empresa.** En `ROUTE_PERMISSION_MAP`, ANTES de `['/sales', ['sales']],`, agregar:

```ts
  ['/sales/pedidos-clientes', ['pedidos-clientes']],
```

- [ ] **Step 2: Encierro del CLIENT.** En `middleware()`, justo después del bloque `if (payload.mustChangePassword && ...) { ... }`, agregar:

```ts
  // Portal de clientes: un usuario CLIENT solo navega su portal (y cambiar clave); cualquier
  // otra pantalla lo manda a /portal. Al reves, el personal no usa /portal.
  if (!pathname.startsWith('/api/')) {
    const isClient = payload.role === 'CLIENT';
    if (isClient && !pathname.startsWith('/portal') && !pathname.startsWith('/change-password')) {
      return NextResponse.redirect(new URL('/portal', request.url));
    }
    if (!isClient && pathname.startsWith('/portal')) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }
```

- [ ] **Step 3: Login.** En `login/page.tsx`, reemplazar `router.push(role === 'EMPLOYEE' ? '/mi-perfil' : '/dashboard');` por:

```ts
        router.push(role === 'EMPLOYEE' ? '/mi-perfil' : role === 'CLIENT' ? '/portal' : '/dashboard');
```

- [ ] **Step 4: Typecheck** → sin output para `middleware|login`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/middleware.ts "apps/web/src/app/(auth)/login/page.tsx"
git commit -m "feat: Session 156 - Web: el rol CLIENT solo navega /portal"
git push origin main
```

### Task 12: Layout del portal + "Mis pedidos" / "Mi cuenta"

**Files:**
- Create: `apps/web/src/app/(portal)/layout.tsx`
- Create: `apps/web/src/app/(portal)/portal-header.tsx`
- Create: `apps/web/src/app/(portal)/portal/page.tsx`

- [ ] **Step 1: Layout** (`app/(portal)/layout.tsx`):

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import SessionKeeper from '@/components/session-keeper';
import { NavGuardProvider } from '@/components/nav-guard';
import { SERVER_API_URL, forwardClientIpFromHeaders } from '@/lib/server-api';
import PortalHeader from './portal-header';

async function getUser(token: string) {
  try {
    const res = await fetch(`${SERVER_API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}`, ...forwardClientIpFromHeaders() },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// Portal de pedidos para clientes (rol CLIENT): sin el menu del ERP, pensado para el celular.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get('accessToken')?.value;
  if (!token) redirect('/login');
  const user = await getUser(token);
  if (user && user.role !== 'CLIENT') redirect('/dashboard');

  return (
    <div className="min-h-screen bg-slate-950">
      <PortalHeader name={user?.name ?? ''} />
      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-4 pb-28">
        <NavGuardProvider>{children}</NavGuardProvider>
      </main>
      <SessionKeeper />
    </div>
  );
}
```

- [ ] **Step 2: Cabecera** (`app/(portal)/portal-header.tsx`):

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, ShoppingBag } from 'lucide-react';

export default function PortalHeader({ name }: { name: string }) {
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-3">
        <Link href="/portal" className="flex items-center gap-2 min-w-0">
          <span className="p-1.5 rounded-lg bg-emerald-600/15 border border-emerald-600/30">
            <ShoppingBag size={18} className="text-emerald-400" />
          </span>
          <span className="text-sm font-semibold text-white truncate">Portal de pedidos</span>
        </Link>
        <span className="ml-auto text-xs text-slate-400 truncate max-w-[40%]">{name}</span>
        <button onClick={logout} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800" aria-label="Salir">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Página principal** (`app/(portal)/portal/page.tsx`):

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, Lock, Trash2, FileDown, Wallet } from 'lucide-react';

const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-VE') : '—');
const fmtDateTime = (s: string | null) =>
  s ? new Date(s).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const statusLabel: Record<string, string> = {
  PENDING: 'Pendiente', PARTIAL: 'Parcial', OVERDUE: 'Vencido', PAID: 'Pagada',
  PARTIAL_RETURN: 'Dev. parcial', RETURNED: 'Devuelta', CANCELLED: 'Anulada',
};

interface Order {
  id: string; portalNote: string | null; createdAt: string; clientUpdatedAt: string | null;
  totalUsd: number; totalBs: number; itemCount: number; state: 'ABIERTO' | 'EN_USO';
}
interface Cxc { id: string; number: string; documentNumber: string | null; amountUsd: number; saldoUsd: number; dueDate: string | null; status: string; }
interface Factura { id: string; number: string | null; fiscalNumber: string | null; status: string; totalUsd: number; saldoUsd: number; createdAt: string; }
interface PortalMe { customer: { name: string; code: string | null; documentType: string; rif: string | null }; companyName: string; }

async function getJson(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'No disponible');
  return r.json();
}

export default function PortalHomePage() {
  const router = useRouter();
  const [tab, setTab] = useState<'pedidos' | 'cuenta'>('pedidos');
  const [me, setMe] = useState<PortalMe | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cxc, setCxc] = useState<Cxc[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { document.title = 'Mis pedidos | Trinity ERP'; }, []);

  const loadOrders = useCallback(async () => {
    setOrders(await getJson('/api/proxy/portal/orders'));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [m] = await Promise.all([getJson('/api/proxy/portal/me'), loadOrders()]);
        setMe(m);
        const [c, f] = await Promise.all([
          getJson('/api/proxy/portal/cuenta/cxc').catch(() => []),
          getJson('/api/proxy/portal/cuenta/facturas').catch(() => []),
        ]);
        setCxc(c); setFacturas(f);
      } catch (e: any) { setError(e.message); } finally { setLoading(false); }
    })();
  }, [loadOrders]);

  async function deleteOrder(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/proxy/portal/orders/${id}`, { method: 'DELETE' });
      if (!res.ok) alert((await res.json().catch(() => ({}))).message || 'No se pudo eliminar');
      await loadOrders();
    } finally { setDeleting(false); setConfirmDelete(null); }
  }

  if (loading) {
    return <div className="py-24 flex items-center justify-center text-slate-400 gap-2"><Loader2 className="animate-spin" size={18} /> Cargando…</div>;
  }
  if (error) {
    return (
      <div className="max-w-md mx-auto py-24 text-center">
        <p className="text-slate-300 font-medium">Portal no disponible</p>
        <p className="text-slate-500 text-sm mt-1">{error}</p>
      </div>
    );
  }

  const saldo = cxc.reduce((s, r) => s + (r.saldoUsd || 0), 0);

  return (
    <div className="space-y-4">
      <div>
        {me?.companyName && <p className="text-xs text-slate-500">{me.companyName}</p>}
        <h1 className="text-xl font-bold text-white">{me?.customer.name}</h1>
        {me?.customer.rif && <p className="text-xs text-slate-400">{me.customer.documentType}-{me.customer.rif}</p>}
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
        {(['pedidos', 'cuenta'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            {t === 'pedidos' ? `Mis pedidos (${orders.length})` : 'Mi cuenta'}
          </button>
        ))}
      </div>

      {tab === 'pedidos' && (
        <div className="space-y-3">
          <button onClick={() => router.push('/portal/pedido/nuevo')} className="btn-primary w-full flex items-center justify-center gap-2 !py-3">
            <Plus size={18} /> Nuevo pedido
          </button>
          {orders.length === 0 && <p className="text-center text-slate-500 text-sm py-10">No tienes pedidos abiertos.</p>}
          {orders.map((o) => (
            <div key={o.id} className="card p-4">
              <button onClick={() => router.push(`/portal/pedido/${o.id}`)} className="w-full text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-100 truncate">{o.portalNote || 'Pedido sin nombre'}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Creado {fmtDate(o.createdAt)} · modificado {fmtDateTime(o.clientUpdatedAt || o.createdAt)}</p>
                  </div>
                  {o.state === 'EN_USO' ? (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300"><Lock size={11} /> En proceso</span>
                  ) : (
                    <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">Abierto</span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-slate-400">{o.itemCount} producto(s)</span>
                  <span className="font-mono font-bold text-white">$ {fmt(o.totalUsd)}</span>
                </div>
              </button>
              {o.state === 'ABIERTO' && (confirmDelete === o.id ? (
                <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-xs text-red-300 mb-2">¿Eliminar este pedido completo?</p>
                  <div className="flex gap-2">
                    <button disabled={deleting} onClick={() => deleteOrder(o.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white disabled:opacity-50">Sí, eliminar</button>
                    <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 text-slate-200">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(o.id)} className="mt-3 text-xs text-red-400 hover:text-red-300 inline-flex items-center gap-1">
                  <Trash2 size={13} /> Eliminar pedido
                </button>
              ))}
            </div>
          ))}
          <p className="text-[11px] text-slate-500 text-center">Los totales son referenciales: se facturan al precio y tasa del día del despacho.</p>
        </div>
      )}

      {tab === 'cuenta' && (
        <div className="space-y-4">
          <div className="card p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10"><Wallet size={18} className="text-blue-400" /></div>
            <div>
              <div className="text-xs text-slate-400">Saldo por pagar</div>
              <div className="text-xl font-bold text-white font-mono">$ {fmt(saldo)}</div>
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <h2 className="px-4 py-3 text-sm font-semibold text-white border-b border-slate-700/50">Estado de cuenta</h2>
            {cxc.length === 0 ? <p className="text-center py-8 text-slate-500 text-sm">No tienes cuentas pendientes.</p> : (
              <div className="divide-y divide-slate-800">
                {cxc.map((r) => (
                  <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-200 truncate">{r.documentNumber || r.number}</p>
                      <p className="text-[11px] text-slate-500">Vence {fmtDate(r.dueDate)} · {statusLabel[r.status] || r.status}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono text-white">$ {fmt(r.saldoUsd)}</p>
                      <p className="text-[11px] text-slate-500 font-mono">de $ {fmt(r.amountUsd)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-0 overflow-hidden">
            <h2 className="px-4 py-3 text-sm font-semibold text-white border-b border-slate-700/50">Mis facturas</h2>
            {facturas.length === 0 ? <p className="text-center py-8 text-slate-500 text-sm">No tienes facturas.</p> : (
              <div className="divide-y divide-slate-800">
                {facturas.map((f) => (
                  <div key={f.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-200 truncate">{f.fiscalNumber || f.number}</p>
                      <p className="text-[11px] text-slate-500">{fmtDate(f.createdAt)} · {statusLabel[f.status] || f.status}{f.saldoUsd > 0.009 ? ` · saldo $ ${fmt(f.saldoUsd)}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-mono text-white">$ {fmt(f.totalUsd)}</span>
                      <a href={`/api/proxy/portal/cuenta/facturas/${f.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-400 text-xs hover:underline">
                        <FileDown size={14} /> PDF
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck** → sin output para `(portal)`.

- [ ] **Step 5: Runtime.** Entrar como `cliente@prueba.com`: cae en `/portal`, ve su pedido de prueba, "Mi cuenta" muestra saldo/facturas y el PDF abre. Escribir a mano `/sales/pos` o `/dashboard` → redirige a `/portal`. Un admin que abra `/portal` → `/dashboard`.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(portal)"
git commit -m "feat: Session 156 - Portal de clientes: layout, Mis pedidos y Mi cuenta"
git push origin main
```

### Task 13: Editor del pedido (buscar y agregar igual que el POS)

**Files:**
- Create: `apps/web/src/app/(portal)/portal/pedido/[id]/page.tsx`

- [ ] **Step 1: Página** (`id = 'nuevo'` para crear):

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Search, Loader2, Minus, Plus, Trash2, Lock, Save, X, AlertTriangle, Tag, Package } from 'lucide-react';
import QtyInput from '@/components/qty-input';
import { useNavGuard } from '@/components/nav-guard';

interface PortalProduct {
  id: string; code: string; name: string; description: string | null;
  thumbUrl: string | null; imageUrl: string | null;
  priceUsd: number; priceBs: number | null; isOnSale: boolean; isService: boolean;
  stock: number; available: number;
}
interface Line {
  productId: string; code: string; name: string; thumbUrl: string | null;
  priceUsd: number; stock: number; available: number; isService: boolean; quantity: number;
}

const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n: number) => (n ?? 0).toLocaleString('es-VE', { maximumFractionDigits: 3 });
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function Thumb({ url }: { url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="w-12 h-12 rounded-lg object-cover bg-slate-800 shrink-0" />
  ) : (
    <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center shrink-0"><Package size={18} className="text-slate-600" /></div>
  );
}

export default function PortalOrderPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const isNew = id === 'nuevo';
  const router = useRouter();
  const { setBlocker, requestNavigate } = useNavGuard();

  const [orderId, setOrderId] = useState<string | null>(isNew ? null : id);
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [locked, setLocked] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [allowNegativeStock, setAllowNegativeStock] = useState(true);

  // Busqueda: MISMO comportamiento que el POS (debounce 300 ms, hasta 500 resultados,
  // ofertas primero, mismo motor del servidor).
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PortalProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);
  const [stockWarn, setStockWarn] = useState<{ name: string; available: number; requested: number; onConfirm: () => void } | null>(null);

  useEffect(() => { document.title = `${isNew ? 'Nuevo pedido' : 'Pedido'} | Trinity ERP`; }, [isNew]);

  useEffect(() => {
    fetch('/api/proxy/portal/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setRate(d.rate ?? null); setAllowNegativeStock(d.allowNegativeStock ?? true); } })
      .catch(() => {});
  }, []);

  const applyOrder = useCallback((o: any) => {
    setOrderId(o.id);
    setNote(o.portalNote || '');
    setLocked(o.state === 'EN_USO');
    setLines(o.items.map((it: any) => ({
      productId: it.productId, code: it.code, name: it.name, thumbUrl: it.thumbUrl,
      priceUsd: it.priceUsd, stock: it.stock, available: it.available, isService: it.isService, quantity: it.quantity,
    })));
    setDirty(false);
  }, []);

  const loadOrder = useCallback(async (oid: string) => {
    const res = await fetch(`/api/proxy/portal/orders/${oid}`);
    // Ya procesado / no existe: volver a la lista.
    if (res.status === 404 || res.status === 409) { router.replace('/portal'); return; }
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'No se pudo cargar el pedido');
    applyOrder(await res.json());
  }, [applyOrder, router]);

  useEffect(() => {
    if (isNew) return;
    loadOrder(id)
      .catch((e) => setMessage({ type: 'error', text: e.message }))
      .finally(() => setLoading(false));
  }, [id, isNew, loadOrder]);

  function handleSearch(q: string) {
    setQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!q.trim()) { setResults([]); setSearching(false); return; }
    searchTimeout.current = setTimeout(async () => {
      const seq = ++searchSeq.current;
      setSearching(true);
      try {
        const res = await fetch(`/api/proxy/portal/products?search=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (seq === searchSeq.current) setResults(data.data || []);
      } catch { /* ignore */ } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 300);
  }

  function doAdd(p: PortalProduct) {
    setLines((prev) => {
      const ex = prev.find((l) => l.productId === p.id);
      if (ex) return prev.map((l) => (l.productId === p.id ? { ...l, quantity: r3(l.quantity + 1) } : l));
      return [{
        productId: p.id, code: p.code, name: p.name, thumbUrl: p.thumbUrl, priceUsd: p.priceUsd,
        stock: p.stock, available: p.available, isService: p.isService, quantity: 1,
      }, ...prev];
    });
    setDirty(true);
    setQuery('');
    setResults([]);
  }

  // Igual que el POS: bloquea sin stock solo si la empresa no permite vender en negativo;
  // si supera el disponible avisa (suave) y deja agregar igual.
  function addProduct(p: PortalProduct) {
    if (locked) return;
    if (!p.priceUsd || p.priceUsd <= 0) { setMessage({ type: 'error', text: `"${p.name}" no tiene precio.` }); return; }
    if (!allowNegativeStock && !p.isService && p.stock <= 0) {
      setMessage({ type: 'error', text: `"${p.name}" no tiene existencia.` });
      return;
    }
    const existing = lines.find((l) => l.productId === p.id);
    const requested = (existing?.quantity || 0) + 1;
    const available = existing ? existing.available : p.available;
    if (!p.isService && requested > available) {
      setStockWarn({ name: p.name, available, requested, onConfirm: () => { setStockWarn(null); doAdd(p); } });
      return;
    }
    doAdd(p);
  }

  function setQty(productId: string, qty: number) {
    if (qty <= 0) return;
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity: r3(qty) } : l)));
    setDirty(true);
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
    setDirty(true);
  }

  const save = useCallback(async (): Promise<boolean> => {
    if (lines.length === 0) { setMessage({ type: 'error', text: 'Agrega al menos un producto.' }); return false; }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(orderId ? `/api/proxy/portal/orders/${orderId}` : '/api/proxy/portal/orders', {
        method: orderId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalNote: note.trim() || undefined,
          items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      const msg = Array.isArray(data.message) ? data.message[0] : data.message;
      if (res.status === 409) {
        // La empresa lo tomo o ya lo proceso: recargar (queda en solo lectura o vuelve a la lista).
        setMessage({ type: 'error', text: msg || 'El pedido no se puede modificar en este momento.' });
        if (orderId) await loadOrder(orderId).catch(() => {});
        return false;
      }
      if (!res.ok) throw new Error(msg || 'No se pudo guardar el pedido');
      applyOrder(data);
      if (!orderId) router.replace(`/portal/pedido/${data.id}`);
      setMessage({ type: 'success', text: 'Pedido guardado' });
      return true;
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }, [lines, note, orderId, applyOrder, loadOrder, router]);

  // Salir sin guardar: mismo guard que el POS.
  useEffect(() => {
    if (dirty && !locked) setBlocker({ onSave: save, what: 'el pedido' });
    else setBlocker(null);
  }, [dirty, locked, save, setBlocker]);
  useEffect(() => () => setBlocker(null), [setBlocker]);

  const totalUsd = lines.reduce((s, l) => s + l.priceUsd * l.quantity, 0);

  if (loading) {
    return <div className="py-24 flex items-center justify-center text-slate-400 gap-2"><Loader2 className="animate-spin" size={18} /> Cargando pedido…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => requestNavigate('/portal')} className="p-2 -ml-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800" aria-label="Volver">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-white truncate">{isNew && !orderId ? 'Nuevo pedido' : note || 'Pedido'}</h1>
        {locked && <span className="ml-auto inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300"><Lock size={11} /> En proceso</span>}
      </div>

      {locked && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm flex items-start gap-2">
          <Lock size={16} className="mt-0.5 shrink-0" />
          La empresa está procesando este pedido. No se puede modificar en este momento.
        </div>
      )}

      {message && (
        <div className={`p-3 rounded-lg text-sm flex items-start justify-between gap-2 ${message.type === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-300' : 'bg-green-500/10 border border-green-500/20 text-green-300'}`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} aria-label="Cerrar"><X size={15} /></button>
        </div>
      )}

      {!locked && (
        <div className="sticky top-14 z-20 -mx-3 sm:mx-0 px-3 sm:px-0 py-2 bg-slate-950/95 backdrop-blur">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Buscar producto por nombre o código…"
              className="input-field !py-3 pl-9 pr-9 w-full"
            />
            {searching ? (
              <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-500" />
            ) : query ? (
              <button onClick={() => handleSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white" aria-label="Limpiar"><X size={16} /></button>
            ) : null}
          </div>

          {query.trim() && (
            <div className="mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-slate-700/60 bg-slate-900 divide-y divide-slate-800">
              {!searching && results.length === 0 && <p className="text-center py-6 text-slate-500 text-sm">Sin resultados</p>}
              {results.map((p) => (
                <button key={p.id} onClick={() => addProduct(p)} className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-slate-800/70">
                  <Thumb url={p.thumbUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-100 leading-tight line-clamp-2">{p.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {p.code}
                      {!p.isService && <> · Stock: {fmtQty(p.stock)} · <span className={p.available <= 0 ? 'text-red-400 font-semibold' : ''}>Disponible: {fmtQty(p.available)}</span></>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {p.isOnSale && <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 mb-0.5"><Tag size={10} /> Oferta</span>}
                    <p className="text-sm font-mono font-bold text-white">$ {fmt(p.priceUsd)}</p>
                    {p.priceBs != null && <p className="text-[11px] font-mono text-slate-500">Bs {fmt(p.priceBs)}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs text-slate-400 mb-1">Nombre o nota del pedido (opcional)</label>
        <input
          type="text"
          value={note}
          maxLength={120}
          disabled={locked}
          onChange={(e) => { setNote(e.target.value); setDirty(true); }}
          placeholder='Ej: "Obra Los Pinos"'
          className="input-field !py-2 w-full disabled:opacity-60"
        />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Productos ({lines.length})</h2>
        </div>
        {lines.length === 0 ? (
          <p className="text-center py-10 text-slate-500 text-sm">Busca productos arriba para agregarlos.</p>
        ) : (
          <div className="divide-y divide-slate-800">
            {lines.map((l) => (
              <div key={l.productId} className="px-3 py-3 flex items-start gap-3">
                <Thumb url={l.thumbUrl} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-100 leading-tight line-clamp-2">{l.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {l.code} · $ {fmt(l.priceUsd)} c/u
                    {!l.isService && l.quantity > l.available && <span className="text-red-400"> · supera el disponible ({fmtQty(l.available)})</span>}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <button disabled={locked || l.quantity <= 1} onClick={() => setQty(l.productId, l.quantity - 1)} className="p-1.5 rounded-lg bg-slate-800 text-slate-300 disabled:opacity-40" aria-label="Menos"><Minus size={14} /></button>
                    <QtyInput value={l.quantity} onCommit={(q) => setQty(l.productId, q)} disabled={locked}
                      className="w-20 text-center input-field !py-1.5 text-sm disabled:opacity-60" />
                    <button disabled={locked} onClick={() => setQty(l.productId, l.quantity + 1)} className="p-1.5 rounded-lg bg-slate-800 text-slate-300 disabled:opacity-40" aria-label="Más"><Plus size={14} /></button>
                    <button disabled={locked} onClick={() => removeLine(l.productId)} className="ml-auto p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-40" aria-label="Quitar"><Trash2 size={15} /></button>
                  </div>
                </div>
                <p className="text-sm font-mono text-white shrink-0">$ {fmt(l.priceUsd * l.quantity)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-500 text-center">Precios referenciales; se facturan al precio y tasa del día del despacho.</p>

      {/* Barra fija inferior: total + guardar */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400">Total estimado</p>
            <p className="text-lg font-bold font-mono text-white leading-tight">$ {fmt(totalUsd)}</p>
            {rate != null && <p className="text-[11px] font-mono text-slate-500">Bs {fmt(totalUsd * rate)}</p>}
          </div>
          <button onClick={save} disabled={locked || saving || !dirty || lines.length === 0}
            className="ml-auto btn-primary flex items-center gap-2 !py-3 !px-5 disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      {stockWarn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setStockWarn(null)}>
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2 text-amber-300"><AlertTriangle size={18} /><h3 className="font-semibold">Supera lo disponible</h3></div>
            <p className="text-sm text-slate-300">
              De <b>{stockWarn.name}</b> hay {fmtQty(stockWarn.available)} disponible(s) y vas a pedir {fmtQty(stockWarn.requested)}.
              Puedes agregarlo igual; la empresa confirmará la existencia al despachar.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setStockWarn(null)} className="px-4 py-2 rounded-lg text-sm bg-slate-700 text-slate-200">Cancelar</button>
              <button onClick={stockWarn.onConfirm} className="btn-primary !py-2 text-sm">Agregar igual</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck** → sin output para `portal/pedido`.

- [ ] **Step 3: Runtime (celular con DevTools en modo móvil).**
  - Buscar con un término genérico ("tubo"): salen los mismos resultados y en el mismo orden que en el POS (comparar lado a lado), con ofertas primero y más de 10 resultados.
  - Buscar "p/ tubo", con y sin tildes, palabras en otro orden → mismos resultados que el POS.
  - Agregar el mismo producto dos veces → un renglón con cantidad 2.
  - Cantidad: borrar todo (no reaparece 0), escribir `1,5` → `1.5`; vacío al salir → revierte.
  - Superar el disponible → aviso "Supera lo disponible", "Agregar igual" funciona.
  - Guardar (nuevo) → URL pasa a `/portal/pedido/<id>`, mensaje "Pedido guardado".
  - Con cambios sin guardar, tocar "volver" → aparece el guard Guardar / Salir sin guardar / Cancelar.
  - Con el pedido abierto en el portal, un cajero lo retoma en el POS → al guardar en el portal sale el aviso de "procesando" y queda en solo lectura.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(portal)/portal/pedido"
git commit -m "feat: Session 156 - Portal de clientes: editor de pedido con busqueda y cantidades iguales al POS"
git push origin main
```

### Task 14: `/config` — las dos opciones

**Files:**
- Modify: `apps/web/src/app/(dashboard)/config/page.tsx`

- [ ] **Step 1: Interface.** Debajo de `requireCustomerAddress: boolean;` (≈ línea 108) agregar:

```ts
  clientPortalEnabled: boolean;
  keepPendingInvoices: boolean;
```

- [ ] **Step 2: Default.** Debajo de `requireCustomerAddress: false,` (≈ línea 149) agregar `clientPortalEnabled: false,` y `keepPendingInvoices: false,`.

- [ ] **Step 3: Carga.** Debajo de `requireCustomerAddress: data.requireCustomerAddress ?? false,` (≈ línea 315) agregar:

```ts
          clientPortalEnabled: data.clientPortalEnabled ?? false,
          keepPendingInvoices: data.keepPendingInvoices ?? false,
```

- [ ] **Step 4: Guardado.** Debajo de `requireCustomerAddress: config.requireCustomerAddress,` (≈ línea 407) agregar:

```ts
          clientPortalEnabled: config.clientPortalEnabled,
          keepPendingInvoices: config.keepPendingInvoices,
```

- [ ] **Step 5: Checkboxes.** Después del `</label>` del checkbox "Direccion del cliente obligatoria" (≈ línea 1172), agregar:

```tsx
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.clientPortalEnabled}
                  onChange={(e) => handleChange('clientPortalEnabled', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40"
                />
                <div>
                  <span className="text-sm text-white">Pedidos de clientes en línea</span>
                  <p className="text-xs text-slate-500">Clientes seleccionados entran con su usuario a montar sus pedidos (quedan como facturas en espera). El acceso se crea desde la ficha del cliente</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.keepPendingInvoices}
                  onChange={(e) => handleChange('keepPendingInvoices', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40"
                />
                <div>
                  <span className="text-sm text-white">Conservar facturas en espera</span>
                  <p className="text-xs text-slate-500">No se borran a medianoche y el POS muestra las de todos los días (para pedidos que se arman durante varios días)</p>
                </div>
              </label>
```

- [ ] **Step 6: Typecheck** → sin output para `config/page`. **Runtime:** marcar ambas, guardar, recargar → siguen marcadas.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/(dashboard)/config/page.tsx"
git commit -m "feat: Session 156 - /config: opciones Pedidos de clientes en linea y Conservar facturas en espera"
git push origin main
```

### Task 15: Ficha del cliente — vendedor asignado + acceso al portal

**Files:**
- Create: `apps/web/src/components/customer-portal-access.tsx`
- Modify: `apps/web/src/app/(dashboard)/sales/customers/[id]/page.tsx`

- [ ] **Step 1: Componente de acceso.** Crear `components/customer-portal-access.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, Copy, Check, UserPlus, Power, RotateCcw } from 'lucide-react';

interface PortalUser { id: string; email: string; name: string; isActive: boolean; lastLoginAt: string | null; mustChangePassword: boolean; }

// Acceso al portal de pedidos (usuario rol CLIENT) de un cliente. Solo se muestra si la
// empresa tiene el portal activo y el usuario es ADMIN/SUPERVISOR (el API responde 403 si no).
export default function CustomerPortalAccess({ customerId, defaultEmail }: { customerId: string; defaultEmail?: string | null }) {
  const [enabled, setEnabled] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [user, setUser] = useState<PortalUser | null>(null);
  const [email, setEmail] = useState(defaultEmail || '');
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const cfg = await fetch('/api/proxy/config').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setEnabled(!!cfg?.clientPortalEnabled);
    if (!cfg?.clientPortalEnabled) return;
    const res = await fetch(`/api/proxy/customers/${customerId}/portal-access`);
    setAllowed(res.ok);
    if (res.ok) setUser((await res.json()).user);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (defaultEmail && !email) setEmail(defaultEmail); }, [defaultEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  async function call(method: 'POST' | 'PATCH', body: object) {
    setBusy(true); setError(''); setTempPassword(null); setCopied(false);
    try {
      const res = await fetch(`/api/proxy/customers/${customerId}/portal-access`, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((Array.isArray(data.message) ? data.message[0] : data.message) || 'Error');
      setUser(data.user);
      if (data.temporaryPassword) setTempPassword(data.temporaryPassword);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  if (!enabled || !allowed) return null;

  return (
    <div className="card p-6 space-y-4 mt-4">
      <div className="flex items-center gap-2">
        <KeyRound size={16} className="text-emerald-400" />
        <h3 className="text-sm font-semibold text-white">Acceso al portal de pedidos</h3>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

      {tempPassword && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm">
          <p className="text-emerald-300">Contraseña temporal (se muestra solo esta vez; el cliente la cambia al entrar):</p>
          <div className="flex items-center gap-2 mt-1.5">
            <code className="px-2 py-1 rounded bg-slate-900 text-white font-mono">{tempPassword}</code>
            <button type="button" onClick={() => { navigator.clipboard?.writeText(tempPassword); setCopied(true); }}
              className="p-1.5 rounded text-slate-300 hover:bg-slate-800" aria-label="Copiar">
              {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
            </button>
          </div>
        </div>
      )}

      {!user ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@cliente.com"
            className="input-field !py-2 text-sm flex-1" />
          <button type="button" disabled={busy || !email.trim()} onClick={() => call('POST', { email: email.trim() })}
            className="btn-primary !py-2 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Crear acceso
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-slate-300">
            <p><span className="text-slate-500">Usuario:</span> {user.email}</p>
            <p><span className="text-slate-500">Estado:</span> {user.isActive ? <span className="text-emerald-400">Activo</span> : <span className="text-red-400">Desactivado</span>}
              {user.mustChangePassword && <span className="text-amber-400"> · debe cambiar la contraseña</span>}</p>
            <p><span className="text-slate-500">Último ingreso:</span> {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('es-VE') : 'Nunca'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => call('PATCH', { isActive: !user.isActive })}
              className="btn-secondary !py-2 text-sm flex items-center gap-2 disabled:opacity-50">
              <Power size={15} /> {user.isActive ? 'Desactivar' : 'Activar'}
            </button>
            <button type="button" disabled={busy} onClick={() => call('PATCH', { resetPassword: true })}
              className="btn-secondary !py-2 text-sm flex items-center gap-2 disabled:opacity-50">
              <RotateCcw size={15} /> Reiniciar contraseña
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Vendedor en el formulario.** En `sales/customers/[id]/page.tsx`:
  - Agregar estado: `const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]);` y un efecto:
    ```tsx
    useEffect(() => {
      fetch('/api/proxy/sellers?isActive=true')
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setSellers(Array.isArray(d) ? d : []))
        .catch(() => {});
    }, []);
    ```
  - En `fetchCustomer`, dentro del `setForm({...})`, agregar `sellerId: data.sellerId || '',`.
  - En `handleSave`, cambiar el body a `JSON.stringify({ ...form, sellerId: form.sellerId || null, creditLimit: Number(form.creditLimit), creditDays: Number(form.creditDays) })`.
  - En el formulario, ANTES del `<label ...>` de "Empresa del grupo", agregar:
    ```tsx
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Vendedor asignado</label>
              <select value={form.sellerId || ''} onChange={e => setForm((f: any) => ({ ...f, sellerId: e.target.value }))} className="input-field !py-2 text-sm">
                <option value="">Sin vendedor asignado</option>
                {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <p className="text-xs text-slate-500 mt-1">Los pedidos que el cliente monte en el portal llevan este vendedor.</p>
            </div>
    ```
- [ ] **Step 3: Tarjeta de acceso.** Importar `import CustomerPortalAccess from '@/components/customer-portal-access';` y, justo después del `</form>` de la pestaña de datos (antes de `</TabsContent>`), agregar:

```tsx
          <CustomerPortalAccess customerId={id as string} defaultEmail={customer.email} />
```

- [ ] **Step 4: Typecheck** → sin output para `customer-portal-access|customers/\[id\]`.

- [ ] **Step 5: Runtime.** Con el portal activo, como ADMIN: en un cliente, elegir vendedor y guardar → persiste; "Crear acceso" muestra la clave temporal; entrar con ese correo/clave → pide cambiar contraseña → cae en `/portal`. "Desactivar" → el login del cliente da "Usuario inactivo". Con el portal apagado, la tarjeta no aparece.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/customer-portal-access.tsx "apps/web/src/app/(dashboard)/sales/customers/[id]/page.tsx"
git commit -m "feat: Session 156 - Ficha del cliente: vendedor asignado y acceso al portal de pedidos"
git push origin main
```

### Task 16: Menú (con contador), matriz de permisos y etiqueta del rol

**Files:**
- Modify: `apps/web/src/components/sidebar.tsx`
- Modify: `apps/web/src/app/(dashboard)/settings/role-permissions/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/settings/users/page.tsx`

- [ ] **Step 1: MenuItem.** En `interface MenuItem`, después de `almacenOpsOnly?: boolean;` agregar:

```ts
  // Solo visible si la empresa activó el portal de clientes (clientPortalEnabled).
  clientPortalOnly?: boolean;
  // Exige SU permiso propio aunque el usuario tenga el de la sección.
  strictPermission?: boolean;
```

- [ ] **Step 2: Item.** En la sección `sales`, después de `{ label: 'POS', ... },` agregar:

```tsx
      { label: 'Pedidos de clientes', href: '/sales/pedidos-clientes', icon: <ClipboardList size={18} />, permission: 'pedidos-clientes', clientPortalOnly: true, strictPermission: true },
```

- [ ] **Step 3: Estado y fetch.** Junto a `const [almacenOpsOn, ...]` agregar:

```ts
  const [clientPortalOn, setClientPortalOn] = useState(false);
  const [clientOrdersUnseen, setClientOrdersUnseen] = useState(0);
```
En el efecto que lee `/api/proxy/config`, agregar `setClientPortalOn(!!d?.clientPortalEnabled);` dentro del `.then((d) => {...})`. Después de ese efecto, agregar:

```ts
  // Contador de pedidos de clientes nuevos/modificados sin ver (cada 60 s, al cambiar de
  // ruta y cuando la pantalla de pedidos marca uno como visto).
  const canClientOrders = clientPortalOn && hasPermission(permissions, 'pedidos-clientes');
  useEffect(() => {
    if (!canClientOrders) { setClientOrdersUnseen(0); return; }
    const load = () => fetch('/api/proxy/client-orders/unseen-count')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setClientOrdersUnseen(d?.count ?? 0))
      .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    window.addEventListener('trinity-client-orders-changed', load);
    return () => { clearInterval(t); window.removeEventListener('trinity-client-orders-changed', load); };
  }, [canClientOrders, pathname]);
```

- [ ] **Step 4: Filtro.** En `visibleItemsFor`, reemplazar la línea del `gate` por:

```ts
    const gate = (items: MenuItem[]) =>
      items.filter((it) =>
        (!it.integrationOnly || integrationOn) && (!it.scanDispatchOnly || scanDispatchOn) && (!it.almacenOpsOnly || almacenOpsOn) &&
        (!it.clientPortalOnly || clientPortalOn) &&
        (!it.strictPermission || (!!it.permission && hasPermission(permissions, it.permission))));
```

- [ ] **Step 5: Badge.** En el render de los items de sección, reemplazar `<span>{item.label}</span>` por:

```tsx
                        <span>{item.label}</span>
                        {item.href === '/sales/pedidos-clientes' && clientOrdersUnseen > 0 && (
                          <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                            {clientOrdersUnseen > 9 ? '9+' : clientOrdersUnseen}
                          </span>
                        )}
```

- [ ] **Step 6: Matriz de permisos.** En `settings/role-permissions/page.tsx`, en `MODULE_GROUPS` → 'Acceso a Modulos', después de `{ key: 'sales', label: 'Ventas y POS' },` agregar:

```ts
      { key: 'pedidos-clientes', label: 'Pedidos de clientes (portal)' },
```
(`CLIENT` NO se agrega a `ROLE_ORDER`: su único permiso es `portal` y no debe editarse.)

- [ ] **Step 7: Etiqueta.** En `settings/users/page.tsx`, en `ROLE_LABELS` agregar `CLIENT: 'Cliente (portal)',` (NO agregarlo a `ROLES`: los usuarios cliente se crean desde la ficha del cliente).

- [ ] **Step 8: Typecheck** → sin output para `sidebar|role-permissions|settings/users`.

- [ ] **Step 9: Runtime.** Como ADMIN con el portal activo: "Pedidos de clientes" aparece en VENTAS con el número de pedidos sin ver. Como WAREHOUSE no aparece. Con el portal apagado no aparece para nadie.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/components/sidebar.tsx "apps/web/src/app/(dashboard)/settings/role-permissions/page.tsx" "apps/web/src/app/(dashboard)/settings/users/page.tsx"
git commit -m "feat: Session 156 - Menu: Pedidos de clientes con contador; permiso en la matriz"
git push origin main
```

### Task 17: Pantalla "Pedidos de clientes" (empresa)

**Files:**
- Create: `apps/web/src/app/(dashboard)/sales/pedidos-clientes/page.tsx`

- [ ] **Step 1: Página.**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingBag, Loader2, Lock, X, ExternalLink, RefreshCw } from 'lucide-react';

interface Row {
  id: string; portalNote: string | null; createdAt: string; clientUpdatedAt: string | null;
  totalUsd: number; itemCount: number; unseen: boolean; state: 'ABIERTO' | 'EN_USO'; lockedByName: string | null;
  customer: { id: string; name: string; code: string | null } | null;
  seller: { id: string; name: string } | null;
}
interface Detail {
  id: string; portalNote: string | null; createdAt: string; clientUpdatedAt: string | null; totalUsd: number;
  customer: { name: string; code: string | null; documentType: string; rif: string | null } | null;
  seller: { name: string } | null;
  items: { productId: string; productCode: string | null; productName: string; quantity: number; totalUsd: number }[];
}

const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDateTime = (s: string | null) => (s ? new Date(s).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

export default function PedidosClientesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]);
  const [mySellerId, setMySellerId] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [sellerFilter, setSellerFilter] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => { document.title = 'Pedidos de clientes | Trinity ERP'; }, []);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        // El vendedor arranca viendo solo los pedidos de SUS clientes (como "Mis facturas" del POS).
        if (u?.seller?.id) { setMySellerId(u.seller.id); setOnlyMine(u.role === 'SELLER'); }
      })
      .finally(() => setReady(true));
    fetch('/api/proxy/sellers?isActive=true')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setSellers(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (onlyMine) qs.set('mine', 'true');
    else if (sellerFilter) qs.set('sellerId', sellerFilter);
    try {
      const res = await fetch(`/api/proxy/client-orders?${qs}`);
      if (res.ok) setRows(await res.json());
    } finally { setLoading(false); }
  }, [onlyMine, sellerFilter]);

  useEffect(() => {
    if (!ready) return;
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [ready, load]);

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/proxy/client-orders/${id}`);
      if (!res.ok) return;
      setDetail(await res.json());
      await fetch(`/api/proxy/client-orders/${id}/seen`, { method: 'PATCH' });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, unseen: false } : r)));
      window.dispatchEvent(new Event('trinity-client-orders-changed'));
    } finally { setDetailLoading(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30"><ShoppingBag className="text-amber-400" size={20} /></div>
        <div>
          <h1 className="text-xl font-bold text-white">Pedidos de clientes</h1>
          <p className="text-sm text-slate-400">Pedidos que los clientes montan desde el portal. Se procesan en el POS.</p>
        </div>
        <button onClick={() => { setLoading(true); load(); }} className="ml-auto btn-secondary !py-2 text-sm flex items-center gap-2"><RefreshCw size={15} /> Actualizar</button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {mySellerId && (
          <div className="flex gap-1 p-1 rounded-lg bg-slate-800/60 border border-slate-700/50">
            {[{ v: true, l: 'Mis clientes' }, { v: false, l: 'Todos' }].map((o) => (
              <button key={String(o.v)} onClick={() => setOnlyMine(o.v)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${onlyMine === o.v ? 'bg-green-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{o.l}</button>
            ))}
          </div>
        )}
        {!onlyMine && (
          <select value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)} className="input-field !py-2 text-sm w-auto">
            <option value="">Todos los vendedores</option>
            {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-green-500" size={24} /></div>
        ) : rows.length === 0 ? (
          <p className="text-center py-12 text-slate-500 text-sm">No hay pedidos de clientes abiertos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700/50 text-left">
                  <th className="px-4 py-2 font-medium">Cliente</th>
                  <th className="px-4 py-2 font-medium">Pedido</th>
                  <th className="px-4 py-2 font-medium">Vendedor</th>
                  <th className="px-4 py-2 font-medium text-right">Renglones</th>
                  <th className="px-4 py-2 font-medium text-right">Total est.</th>
                  <th className="px-4 py-2 font-medium">Modificado</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => openDetail(r.id)}
                    className={`border-b border-slate-700/30 last:border-0 cursor-pointer hover:bg-slate-800/40 ${r.unseen ? 'bg-amber-500/5' : ''}`}>
                    <td className="px-4 py-2.5 text-slate-200">
                      {r.unseen && <span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-2 align-middle" />}
                      {r.customer?.name || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-300">{r.portalNote || <span className="text-slate-500">Sin nombre</span>}</td>
                    <td className="px-4 py-2.5 text-slate-400">{r.seller?.name || 'Sin vendedor'}</td>
                    <td className="px-4 py-2.5 text-right text-slate-300">{r.itemCount}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-white">$ {fmt(r.totalUsd)}</td>
                    <td className="px-4 py-2.5 text-slate-400">{fmtDateTime(r.clientUpdatedAt || r.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      {r.state === 'EN_USO'
                        ? <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300"><Lock size={11} /> {r.lockedByName || 'En uso'}</span>
                        : r.unseen
                          ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300">Nuevo / modificado</span>
                          : <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300">Abierto</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDetail(null)}>
          <div className="card w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {detailLoading || !detail ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-green-500" size={24} /></div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">{detail.customer?.name}</h2>
                    <p className="text-sm text-slate-400">{detail.portalNote || 'Pedido sin nombre'} · Vendedor: {detail.seller?.name || 'Sin vendedor'}</p>
                    <p className="text-xs text-slate-500">Modificado por el cliente: {fmtDateTime(detail.clientUpdatedAt || detail.createdAt)}</p>
                  </div>
                  <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-white" aria-label="Cerrar"><X size={20} /></button>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700/50 text-left">
                      <th className="py-2 font-medium">Código</th>
                      <th className="py-2 font-medium">Producto</th>
                      <th className="py-2 font-medium text-right">Cant.</th>
                      <th className="py-2 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((it) => (
                      <tr key={it.productId} className="border-b border-slate-700/30 last:border-0">
                        <td className="py-2 font-mono text-xs text-slate-400">{it.productCode || '—'}</td>
                        <td className="py-2 text-slate-200">{it.productName}</td>
                        <td className="py-2 text-right text-slate-300">{it.quantity}</td>
                        <td className="py-2 text-right font-mono text-white">$ {fmt(it.totalUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700/50">
                  <span className="text-sm text-slate-400">Total estimado: <b className="font-mono text-white">$ {fmt(detail.totalUsd)}</b></span>
                  <button onClick={() => router.push(`/sales/pos?retake=${detail.id}`)} className="btn-primary !py-2 text-sm flex items-center gap-2">
                    <ExternalLink size={15} /> Abrir en el POS
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">Al abrirlo en el POS queda bloqueado para el cliente y se recalcula con el precio y la tasa de hoy.</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck** → sin output para `pedidos-clientes`.

- [ ] **Step 3: Runtime.** Los pedidos del cliente de prueba salen resaltados; abrir el detalle → deja de estar resaltado y baja el contador del menú. Un vendedor con vendedor vinculado arranca en "Mis clientes".

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(dashboard)/sales/pedidos-clientes"
git commit -m "feat: Session 156 - Pantalla Pedidos de clientes (lista, detalle, visto, abrir en POS)"
git push origin main
```

### Task 18: POS — marcas en "Facturas en espera" y abrir con `?retake=`

**Files:**
- Modify: `apps/web/src/app/(dashboard)/sales/pos/page.tsx`

- [ ] **Step 1: Parámetro `retake`.** Debajo de `const invoiceId = searchParams.get('invoiceId');` (≈ línea 249) agregar:

```ts
  // Desde "Pedidos de clientes" -> "Abrir en el POS": retomar (y BLOQUEAR) esa factura en espera.
  const retakeParam = searchParams.get('retake');
```
y, después de la definición de `fetchPending` (≈ línea 722), agregar:

```ts
  useEffect(() => {
    if (!retakeParam) return;
    retakeInvoice({ id: retakeParam });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retakeParam]);
```
(`retakeInvoice` es una declaración de función dentro del componente: está disponible por hoisting.)

- [ ] **Step 2: Marcas en el cajón.** En el render de cada factura del cajón, justo después del bloque `{inv.onlineOrderNumber && (...)}`, agregar:

```tsx
                  {inv.fromPortal && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 w-fit font-medium">
                        <ShoppingBag size={11} />
                        Cliente{inv.portalNote ? ` · ${inv.portalNote}` : ''}
                      </span>
                      {(!inv.staffSeenAt || (inv.clientUpdatedAt && new Date(inv.clientUpdatedAt) > new Date(inv.staffSeenAt))) && (
                        <span className="text-xs px-2 py-1 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/20 font-medium">Modificado</span>
                      )}
                    </div>
                  )}
```
Agregar `ShoppingBag` al import de `lucide-react` del archivo si no está.

- [ ] **Step 3: Typecheck** → sin output para `sales/pos`.

- [ ] **Step 4: Runtime.** En "Pedidos de clientes" → "Abrir en el POS": el POS carga el pedido con el cliente y el vendedor asignado, y en el portal el cliente lo ve "En proceso". En el cajón de facturas en espera el pedido muestra "Cliente · <nota>" y "Modificado" si el cliente lo cambió después. Cobrarlo → desaparece de "Mis pedidos" y aparece en "Mi cuenta → Mis facturas".

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(dashboard)/sales/pos/page.tsx"
git commit -m "feat: Session 156 - POS: marcas Cliente/Modificado en facturas en espera y abrir con ?retake="
git push origin main
```

---

## FASE 6 — Cierre

### Task 19: Verificación completa, documentación y limpieza

**Files:**
- Modify: `PROGRESS.md`, `PROJECT.md`

- [ ] **Step 1: Typecheck global** — API sin output; web sin errores en archivos tocados.

- [ ] **Step 2: Recorrido de punta a punta (local).** Repetir en orden: crear acceso desde la ficha → primer login (cambio de clave) → 2 pedidos con notas distintas → editar uno → la empresa ve contador y "Nuevo / modificado" → abrir en el POS → el cliente ve "En proceso" y no puede guardar → cobrar → pasa a "Mi cuenta". Probar la lista blanca (Task 7 Step 6) y que un precio/descuento enviado a mano da 400.

- [ ] **Step 3: Regresión de otros roles.** Cajero y vendedor: POS, retomar, cobrar, `/mi-perfil` del empleado, `/config` (admin ve `allowedIps`), login normal. Con `keepPendingInvoices=false` el cron/borrado se comporta igual que antes.

- [ ] **Step 4: Limpiar datos de prueba locales** (usuario `portaltest`, pedidos de prueba) si se usó una BD con datos reales.

- [ ] **Step 5: Docs.** En `PROJECT.md` agregar la sección "Portal de pedidos para clientes (Sesión 156)" (rol CLIENT, lista blanca `ClientPortalGuard` + `@PortalAllowed`, endpoints `/portal/*` y `/client-orders/*`, flags `clientPortalEnabled`/`keepPendingInvoices`, vendedor asignado, `QtyInput` compartido, límite de login por IP+correo, `/config` sin datos sensibles a no-ADMIN). En `PROGRESS.md`, sección Sesión 156: qué se hizo, que está pendiente de deploy SOLO en mayor, y que tras el deploy hay que activar las dos opciones en `/config` de la mayorista y crear los accesos desde la ficha de cada cliente.

- [ ] **Step 6: Commit final**

```bash
git add PROGRESS.md PROJECT.md
git commit -m "docs: Session 156 - Portal de pedidos para clientes: PROGRESS y PROJECT"
git push origin main
```

- [ ] **Step 7: Deploy (solo con aprobación del usuario).** Pre-deploy checklist de CLAUDE.md (`git status` limpio, todo pusheado, migración commiteada) y luego **solo la mayorista**: `ssh root@134.209.164.59 "bash /opt/deploy-trinity-mayor.sh"`. Las otras 6 instancias reciben el código en su próximo deploy con las opciones apagadas.
