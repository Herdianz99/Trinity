# IP-lock por usuario ("acceso solo en sitio") — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir marcar usuarios como "solo en sitio" para que únicamente puedan entrar/operar desde la(s) IP(s) del local, **inerte por defecto** (desplegar sin configurar no afecta a nadie).

**Architecture:** 2 campos nuevos (`User.restrictToOnSiteIp`, `CompanyConfig.allowedIps`). `trust proxy` para leer la IP real (`X-Forwarded-For` de nginx). Un `IpAccessService` con caché centraliza la regla fail-safe (bloquea solo si flag + whitelist + IP fuera; ADMIN exento). Se aplica en el **login** y en **cada request** vía `jwt.strategy` (`passReqToCallback`).

**Tech Stack:** Prisma (PostgreSQL), NestJS (passport-jwt), Next.js 14, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-01-ip-lock-onsite-design.md`

**Verificación:** el repo no tiene jest (0 `.spec.ts`). Método: `tsc --noEmit` + prueba de humo por `curl` (inerte por defecto, bloqueo cuando se configura, ADMIN exento) + prueba UI en local (API :4000 / Web :3000, BD `grande_db`).

---

### Task 1: Prisma — campos `restrictToOnSiteIp` y `allowedIps` + migración

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (model User ~332; model CompanyConfig ~264)
- Create: `packages/database/prisma/migrations/20260901220000_ip_lock_onsite/migration.sql`

- [ ] **Step 1: Agregar el flag al modelo User**

En `packages/database/prisma/schema.prisma`, en el model `User`, después de `mustChangePassword  Boolean             @default(true)` (línea ~338), agregar:

```prisma
  restrictToOnSiteIp  Boolean             @default(false)
```

- [ ] **Step 2: Agregar la whitelist al CompanyConfig**

En el model `CompanyConfig`, después de `bregaGlobalPct          Float    @default(0)` (línea ~264), agregar:

```prisma
  allowedIps              String   @default("")
```

- [ ] **Step 3: Crear la migración (aditiva, idempotente)**

Crear `packages/database/prisma/migrations/20260901220000_ip_lock_onsite/migration.sql`:

```sql
-- IP-lock por usuario (acceso solo en sitio). Aditivo, defaults inofensivos.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "restrictToOnSiteIp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "allowedIps" TEXT NOT NULL DEFAULT '';
```

- [ ] **Step 4: Aplicar y regenerar**

Run:
```bash
cd packages/database && npx prisma migrate deploy && npx prisma generate
```
Expected: `1 migration ... applied` (o "No pending") y `Generated Prisma Client`. Si `prisma generate` da EPERM (Windows, DLL en uso), detener el API primero (`npx kill-port 4000` + matar procesos `nest`), luego repetir `generate`.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260901220000_ip_lock_onsite/
git commit -m "feat(auth): campos restrictToOnSiteIp + allowedIps para IP-lock (migracion aditiva)"
```

---

### Task 2: Backend — `trust proxy` para leer la IP real

**Files:**
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Activar trust proxy configurable**

En `apps/api/src/main.ts`, después de `const app = await NestFactory.create<NestExpressApplication>(AppModule);` (línea ~11), agregar:

```typescript
  // Detras de nginx (1 salto). Necesario para que req.ip sea la IP REAL del cliente
  // (via X-Forwarded-For). Configurable por si hay otra capa (ej. Cloudflare = 2).
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: sin salida (0 errores).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/main.ts
git commit -m "feat(auth): trust proxy configurable (IP real del cliente tras nginx)"
```

---

### Task 3: Backend — `IpAccessService` (regla fail-safe + caché + CIDR)

**Files:**
- Create: `apps/api/src/common/ip-access.service.ts`

- [ ] **Step 1: Crear el servicio**

Crear `apps/api/src/common/ip-access.service.ts` con:

```typescript
import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CACHE_TTL_MS = 30_000;

// Normaliza IPv4-mapped-IPv6 (::ffff:a.b.c.d -> a.b.c.d) y recorta espacios.
export function normalizeIp(ip: string | undefined | null): string {
  if (!ip) return '';
  const s = ip.trim();
  return s.startsWith('::ffff:') ? s.slice(7) : s;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n << 8) | o;
  }
  return n >>> 0;
}

// ¿La IP coincide con la entrada (IP exacta o CIDR IPv4)? IPv6 solo match exacto.
export function matchEntry(ip: string, entry: string): boolean {
  const target = normalizeIp(ip);
  const e = entry.trim();
  if (!e) return false;
  if (e.includes('/')) {
    const [base, bitsStr] = e.split('/');
    const bits = Number(bitsStr);
    const ipInt = ipv4ToInt(target);
    const baseInt = ipv4ToInt(base.trim());
    if (ipInt === null || baseInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    if (bits === 0) return true;
    const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
    return (ipInt & mask) === (baseInt & mask);
  }
  return target === normalizeIp(e);
}

@Injectable()
export class IpAccessService {
  private cache: { entries: string[]; at: number } | null = null;

  constructor(private prisma: PrismaService) {}

  private async getEntries(): Promise<string[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < CACHE_TTL_MS) return this.cache.entries;
    const config = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
      select: { allowedIps: true },
    });
    const entries = (config?.allowedIps || '')
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    this.cache = { entries, at: now };
    return entries;
  }

  async hasWhitelist(): Promise<boolean> {
    return (await this.getEntries()).length > 0;
  }

  async isAllowed(ip: string): Promise<boolean> {
    const entries = await this.getEntries();
    return entries.some((e) => matchEntry(ip, e));
  }

  /**
   * Regla fail-safe: bloquea SOLO si el usuario está restringido, NO es ADMIN,
   * hay whitelist configurada y la IP no está permitida. Cualquier otro caso: NO bloquea.
   */
  async shouldBlock(ip: string, opts: { restrict: boolean; role: UserRole }): Promise<boolean> {
    if (!opts.restrict) return false;
    if (opts.role === UserRole.ADMIN) return false;
    if (!(await this.hasWhitelist())) return false;
    return !(await this.isAllowed(ip));
  }
}
```

- [ ] **Step 2: Typecheck** (se validará al usarlo en Task 5/6; por ahora no está provisto).

No commit aún (se commitea junto con el wiring en Task 5).

---

### Task 4: Backend — DTOs (`restrictToOnSiteIp`, `allowedIps`)

**Files:**
- Modify: `apps/api/src/modules/users/dto/create-user.dto.ts`
- Modify: `apps/api/src/modules/company-config/dto/update-company-config.dto.ts`

- [ ] **Step 1: Agregar `restrictToOnSiteIp` a CreateUserDto**

En `apps/api/src/modules/users/dto/create-user.dto.ts`, antes del cierre `}` de la clase (después del bloque `isActive?`), agregar:

```typescript
  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  restrictToOnSiteIp?: boolean;
```

(`IsOptional`, `IsBoolean`, `ApiProperty` ya están importados.) `UpdateUserDto` lo hereda vía `PartialType`.

- [ ] **Step 2: Agregar `allowedIps` a UpdateCompanyConfigDto**

En `apps/api/src/modules/company-config/dto/update-company-config.dto.ts`, después del bloque de `companyName?` (línea ~8), agregar:

```typescript
  @IsOptional()
  @IsString()
  allowedIps?: string;
```

(`IsOptional`, `IsString` ya están importados.)

- [ ] **Step 3: Typecheck**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/users/dto/create-user.dto.ts apps/api/src/modules/company-config/dto/update-company-config.dto.ts
git commit -m "feat(auth): DTOs para restrictToOnSiteIp y allowedIps"
```

---

### Task 5: Backend — enforce en login + `GET /auth/my-ip`

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/src/modules/auth/auth.controller.ts`
- Modify: `apps/api/src/modules/auth/auth.module.ts`

- [ ] **Step 1: Proveer `IpAccessService` en AuthModule**

En `apps/api/src/modules/auth/auth.module.ts`, importar y agregar a `providers`:

```typescript
import { IpAccessService } from '../../common/ip-access.service';
```
y cambiar `providers: [AuthService, JwtStrategy]` por:
```typescript
  providers: [AuthService, JwtStrategy, IpAccessService],
```

- [ ] **Step 2: Inyectar `IpAccessService` y recibir la IP en `login()`**

En `apps/api/src/modules/auth/auth.service.ts`:

a) Importar arriba:
```typescript
import { IpAccessService } from '../../common/ip-access.service';
```
b) Agregar al constructor (después de `rolePermissionsService`):
```typescript
    private ipAccess: IpAccessService,
```
c) Cambiar la firma `async login(email: string, password: string)` por:
```typescript
  async login(email: string, password: string, ip?: string) {
```
d) Tras la validación de contraseña (después del bloque `if (!isPasswordValid)`), y ANTES del `await this.prisma.user.update({... lastLoginAt ...})`, agregar el chequeo de IP:
```typescript
    if (await this.ipAccess.shouldBlock(ip || '', { restrict: user.restrictToOnSiteIp, role: user.role })) {
      throw new ForbiddenException({
        code: 'OFFSITE_BLOCKED',
        message: 'Acceso permitido solo desde el local.',
      });
    }
```
e) Agregar `restrictToOnSiteIp` al `payload`:
```typescript
    const payload = {
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions,
      mustChangePassword: user.mustChangePassword,
      restrictToOnSiteIp: user.restrictToOnSiteIp,
    };
```

(`ForbiddenException` ya está importado.)

- [ ] **Step 3: Pasar la IP desde el controller + endpoint `my-ip`**

En `apps/api/src/modules/auth/auth.controller.ts`:

a) Ampliar el import de `@nestjs/common` para incluir `Ip` y `Req`:
```typescript
import { Controller, Post, Body, Get, Patch, UseGuards, Ip } from '@nestjs/common';
```
b) Cambiar el handler de login:
```typescript
  @Post('login')
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.authService.login(dto.email, dto.password, ip);
  }
```
c) Agregar el endpoint para ver la IP actual (autenticado), después de `getProfile`:
```typescript
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Get('my-ip')
  myIp(@Ip() ip: string) {
    return { ip };
  }
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/ip-access.service.ts apps/api/src/modules/auth/auth.service.ts apps/api/src/modules/auth/auth.controller.ts apps/api/src/modules/auth/auth.module.ts
git commit -m "feat(auth): IpAccessService + bloqueo en login + GET /auth/my-ip"
```

---

### Task 6: Backend — enforce en cada request (jwt.strategy)

**Files:**
- Modify: `apps/api/src/modules/auth/jwt.strategy.ts`

- [ ] **Step 1: Chequear IP por request con `passReqToCallback`**

Reemplazar TODO el contenido de `apps/api/src/modules/auth/jwt.strategy.ts` por:

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { IpAccessService } from '../../common/ip-access.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly ipAccess: IpAccessService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET', 'default-secret'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any) {
    // IP-lock: si el usuario está restringido, verificar su IP en cada request.
    if (payload?.restrictToOnSiteIp) {
      const blocked = await this.ipAccess.shouldBlock(req.ip || '', {
        restrict: true,
        role: payload.role,
      });
      if (blocked) {
        throw new UnauthorizedException({
          code: 'OFFSITE_BLOCKED',
          message: 'Acceso permitido solo desde el local.',
        });
      }
    }
    return {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      permissions: payload.permissions,
      mustChangePassword: payload.mustChangePassword,
    };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/auth/jwt.strategy.ts
git commit -m "feat(auth): enforce IP-lock por request en jwt.strategy (whitelist live)"
```

---

### Task 7: Backend smoke test (curl) — inerte, bloqueo, ADMIN exento

Con API `:4000` corriendo (reiniciar limpio: `npx kill-port 4000`, `rm -rf apps/api/dist apps/api/tsconfig.tsbuildinfo`, `cd apps/api && npm run dev`). Firmar tokens no sirve aquí porque el flag/whitelist salen de la BD; usar login real con un usuario de prueba.

- [ ] **Step 1: Inerte por defecto (nadie configurado)**

Login con un usuario NO-admin cualquiera (ajustar email/clave):
```bash
curl -s -o /dev/null -w "login sin config => %{http_code}\n" http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"USER@dominio","password":"CLAVE"}'
```
Expected: **200/201** (entra normal — inerte).

- [ ] **Step 2: Configurar whitelist con una IP que NO sea la del request + marcar el usuario**

Por BD (local), marcar el usuario y poner una whitelist que no incluya `::1`/`127.0.0.1`:
```bash
docker exec trinity-postgres-1 psql -U trebol -d grande_db -c "UPDATE \"CompanyConfig\" SET \"allowedIps\"='190.1.2.3' WHERE id='singleton'; UPDATE \"User\" SET \"restrictToOnSiteIp\"=true WHERE email='USER@dominio';"
```
Esperar ~30s (TTL de caché) o reiniciar el API para refrescar.

- [ ] **Step 3: El usuario restringido queda bloqueado**

```bash
curl -s -w "\nlogin bloqueado => %{http_code}\n" http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"USER@dominio","password":"CLAVE"}'
```
Expected: **403** con `{"code":"OFFSITE_BLOCKED",...}` (la IP local no está en la whitelist).

- [ ] **Step 4: ADMIN NO se bloquea aunque esté marcado**

```bash
docker exec trinity-postgres-1 psql -U trebol -d grande_db -c "UPDATE \"User\" SET \"restrictToOnSiteIp\"=true WHERE role='ADMIN';"
curl -s -o /dev/null -w "login admin => %{http_code}\n" http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"ADMIN@dominio","password":"CLAVE_ADMIN"}'
```
Expected: **200/201** (ADMIN exento).

- [ ] **Step 5: Revertir los datos de prueba**

```bash
docker exec trinity-postgres-1 psql -U trebol -d grande_db -c "UPDATE \"CompanyConfig\" SET \"allowedIps\"='' WHERE id='singleton'; UPDATE \"User\" SET \"restrictToOnSiteIp\"=false;"
```
Expected: todo vuelve a inerte. (Sin commit; es verificación.)

---

### Task 8: Frontend — `/config`: whitelist de IPs + "tu IP actual"

**Files:**
- Modify: `apps/web/src/app/(dashboard)/config/page.tsx`

- [ ] **Step 1: Cargar la IP actual y renderizar la sección**

En `apps/web/src/app/(dashboard)/config/page.tsx`, dentro del componente:

a) Estado + carga de la IP (junto a los otros `useState`/`useEffect`):
```tsx
  const [myIp, setMyIp] = useState<string>('');
  useEffect(() => {
    fetch('/api/proxy/auth/my-ip')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.ip) setMyIp(d.ip); })
      .catch(() => {});
  }, []);
```

b) Renderizar una tarjeta con el campo `allowedIps`. Colocarla en el formulario del config, junto a los demás campos (usar el mismo estado `form`/`setForm` que ya maneja la página; el nombre del campo es `allowedIps`). Insertar:
```tsx
      <div className="card p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Acceso solo en sitio (IP-lock)</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            IPs o rangos (CIDR) del local, separados por coma o salto de línea. Los usuarios marcados
            como "Solo en sitio" únicamente podrán entrar desde estas IPs. Vacío = desactivado (nadie se bloquea).
          </p>
        </div>
        {myIp && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Tu IP pública actual:</span>
            <span className="font-mono text-emerald-300">{myIp}</span>
            <button
              type="button"
              onClick={() =>
                setForm((f: any) => ({
                  ...f,
                  allowedIps: f.allowedIps ? `${f.allowedIps}\n${myIp}` : myIp,
                }))
              }
              className="text-sky-400 hover:text-sky-300 underline"
            >
              Agregar
            </button>
          </div>
        )}
        <textarea
          value={form.allowedIps || ''}
          onChange={(e) => setForm((f: any) => ({ ...f, allowedIps: e.target.value }))}
          rows={3}
          placeholder="190.10.20.30, 190.10.20.0/24"
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm font-mono"
        />
        <p className="text-[11px] text-amber-300/80">
          Ojo: requiere que el local tenga IP fija. Solo aplica en WiFi del local (no datos móviles).
        </p>
      </div>
```
(Ajustar al patrón real del `page.tsx`: si el form se envía con un `PATCH /company-config`, `allowedIps` ya viaja en `form`. Verificar que el submit incluya todo el `form`.)

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(dashboard)/config/page.tsx"
git commit -m "feat(auth): UI de IPs permitidas en /config + mostrar IP actual"
```

---

### Task 9: Frontend — `/settings/users`: toggle "Solo en sitio"

**Files:**
- Modify: `apps/web/src/app/(dashboard)/settings/users/page.tsx`

- [ ] **Step 1: Toggle por usuario (ADMIN exento)**

En `apps/web/src/app/(dashboard)/settings/users/page.tsx`:

a) Incluir `restrictToOnSiteIp` en la interfaz/estado del usuario y en el form de edición (donde se editan `name`/`role`/`isActive`).
b) En el formulario de edición del usuario, agregar el control (deshabilitado si el rol es ADMIN):
```tsx
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={!!form.restrictToOnSiteIp}
            disabled={form.role === 'ADMIN'}
            onChange={(e) => setForm((f: any) => ({ ...f, restrictToOnSiteIp: e.target.checked }))}
          />
          Solo en sitio (bloquear fuera de las IPs del local)
          {form.role === 'ADMIN' && (
            <span className="text-[11px] text-slate-500">— los ADMIN no se restringen</span>
          )}
        </label>
```
c) Asegurar que el submit (`PATCH /api/proxy/users/:id`) incluya `restrictToOnSiteIp` en el body.

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(dashboard)/settings/users/page.tsx"
git commit -m "feat(auth): toggle 'Solo en sitio' por usuario en /settings/users (ADMIN exento)"
```

---

### Task 10: Verificación e2e (UI) + PROGRESS + push

- [ ] **Step 1: Prueba en el navegador**

1. `/config` → ver "Tu IP pública actual"; dejar `allowedIps` vacío → todos entran (inerte).
2. Poner una IP falsa en `allowedIps`, marcar a un usuario NO-admin como "Solo en sitio" en `/settings/users`.
3. Cerrar sesión y entrar con ese usuario → **bloqueado** (mensaje "solo desde el local").
4. Agregar la IP actual (botón "Agregar") y guardar → el usuario ya entra.
5. Un ADMIN marcado sigue entrando.

Expected: coincide con lo descrito.

- [ ] **Step 2: PROGRESS.md**

Agregar una sección de sesión documentando: campos `restrictToOnSiteIp`/`allowedIps`, `trust proxy`, `IpAccessService`, enforce login + por-request, UI en `/config` y `/settings/users`, **inerte por defecto**, ADMIN exento, migración `20260901220000_ip_lock_onsite`. Marcar **SIN DESPLEGAR** y recordar el caveat de **IP fija**.

- [ ] **Step 3: Commit y push**

```bash
git add PROGRESS.md
git commit -m "docs: IP-lock por usuario (acceso solo en sitio), sin desplegar"
git push origin main
```

- [ ] **Step 4: Nota de deploy y activación (no ejecutar)**

Deploy normal (aplica migración; inerte). Activación operacional DESPUÉS y con cuidado: confirmar IP fija del local → cargar la IP en `/config` → marcar usuarios de a uno. Rescate si alguien se encierra: por BD `UPDATE "User" SET "restrictToOnSiteIp"=false WHERE ...` o corregir `allowedIps`.

---

## Notas de cierre

- **Fail-safe:** bloquea solo si (flag + whitelist no vacía + IP fuera) y nunca a ADMIN. Config incompleta = no bloquea.
- **trust proxy = 1** (nginx). Si algún server queda tras Cloudflare, subir `TRUST_PROXY_HOPS` en su `.env`.
- **Límite conocido:** marcar el flag a un usuario ya logueado aplica en su próximo login (el flag viaja en el token). La whitelist sí es live (caché 30s).
- **Fuera de alcance:** candado 2 (bloquear exportación masiva) = plan aparte.
