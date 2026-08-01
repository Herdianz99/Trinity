# Integración total ↔ totalturen — Fase 1: Base + Consulta de existencia (Función A) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la base del puente de integración (módulo `integration`, config opt-in, guard por token, cliente HTTP al socio) y la primera función end-to-end: ver la existencia/precio de un artículo en la empresa socia desde la ficha del producto.

**Architecture:** Módulo NestJS nuevo y aditivo `integration`. Expone endpoints entrantes `integration/*` protegidos por header `X-Integration-Token` (para que el socio los llame) y un endpoint interno protegido por JWT (para que el frontend propio consulte al socio vía `PartnerClient`). Opt-in por variables de entorno: sin ellas el módulo queda dormido. No toca POS, facturación ni el `Transfer` interno.

**Tech Stack:** NestJS 10, Prisma 5, `fetch` nativo (Node 20+), Next.js (App Router) con proxy `/api/proxy/*`, TypeScript. Sin jest en el repo → verificación por `tsc --noEmit` + `curl` con salida esperada.

**Contexto de repo (no asumir):**
- Todos los endpoints de un controller heredan guards de clase; ver `apps/api/src/modules/products/products.controller.ts` (usa `@UseGuards(AuthGuard('jwt'))` a nivel de clase).
- El frontend llama al API por `/api/proxy/<ruta>` (ver `window.open('/api/proxy/products/report/...')`). El proxy adjunta el JWT.
- Verificación de tipos: `cd apps/api && node_modules/.bin/tsc --noEmit -p tsconfig.json` (0 errores). NO usar `nest build` con el dev encendido (borra `dist` y tumba el API).
- El API local corre con `npx turbo dev --filter=@trinity/api --filter=@trinity/web` (no incluir el agente, que ocupa 8765).

---

## File Structure

- `apps/api/src/modules/integration/integration.config.ts` — lee las 5 env vars + `isEnabled()`.
- `apps/api/src/modules/integration/integration-token.guard.ts` — valida `X-Integration-Token`.
- `apps/api/src/modules/integration/partner-client.service.ts` — HTTP saliente al socio (token + timeout + fallo seguro).
- `apps/api/src/modules/integration/integration.service.ts` — lógica: lookup local (para el socio) y lookup remoto (para el frontend).
- `apps/api/src/modules/integration/integration.controller.ts` — endpoints entrantes (guard token) + endpoint interno (JWT).
- `apps/api/src/modules/integration/integration.module.ts` — wiring.
- `apps/api/src/app.module.ts` — registrar `IntegrationModule`.
- `apps/api/.env` (y `.env.example` si existe) — documentar las 5 variables.
- `apps/web/src/app/(dashboard)/catalog/products/[code]/page.tsx` — panel "En {PARTNER}".

---

## Task 1: Config de integración (opt-in por env)

**Files:**
- Create: `apps/api/src/modules/integration/integration.config.ts`

- [ ] **Step 1: Escribir el helper de config**

```typescript
// Lee la configuracion del puente desde variables de entorno. Opt-in:
// si falta PARTNER_API_URL o los tokens, el modulo queda dormido (isEnabled=false).
export interface IntegrationConfig {
  partnerApiUrl: string;
  partnerApiToken: string;
  integrationToken: string;
  partnerName: string;
  selfCode: string;
}

export function getIntegrationConfig(): IntegrationConfig {
  return {
    partnerApiUrl: (process.env.PARTNER_API_URL || '').replace(/\/+$/, ''),
    partnerApiToken: process.env.PARTNER_API_TOKEN || '',
    integrationToken: process.env.INTEGRATION_TOKEN || '',
    partnerName: process.env.PARTNER_NAME || 'Empresa socia',
    selfCode: process.env.SELF_CODE || 'SELF',
  };
}

// Puedo LLAMAR al socio si tengo URL + token de salida.
export function canCallPartner(cfg = getIntegrationConfig()): boolean {
  return !!cfg.partnerApiUrl && !!cfg.partnerApiToken;
}

// ACEPTO llamadas del socio si tengo token de entrada configurado.
export function canReceivePartner(cfg = getIntegrationConfig()): boolean {
  return !!cfg.integrationToken;
}
```

- [ ] **Step 2: Documentar las variables en `apps/api/.env`**

Agregar al final de `apps/api/.env` (valores reales se ponen en el server; en local se dejan vacías para pruebas dirigidas):

```
# ── Integracion socio (opt-in; vacio = dormido). Ver docs/superpowers/specs/2026-08-01-integracion-total-totalturen-design.md
PARTNER_API_URL=
PARTNER_API_TOKEN=
INTEGRATION_TOKEN=
PARTNER_NAME=
SELF_CODE=
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/api && node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/integration/integration.config.ts apps/api/.env.example 2>/dev/null; git add apps/api/src/modules/integration/integration.config.ts
git commit -m "feat: integration config helper (opt-in por env)"
```

---

## Task 2: Guard por `X-Integration-Token`

**Files:**
- Create: `apps/api/src/modules/integration/integration-token.guard.ts`

- [ ] **Step 1: Escribir el guard**

```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { getIntegrationConfig, canReceivePartner } from './integration.config';

// Protege los endpoints ENTRANTES de integracion. Valida el header
// X-Integration-Token contra INTEGRATION_TOKEN. Separado del JWT de usuarios.
@Injectable()
export class IntegrationTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const cfg = getIntegrationConfig();
    if (!canReceivePartner(cfg)) {
      throw new UnauthorizedException('Integracion no habilitada');
    }
    const req = context.switchToHttp().getRequest();
    const token = req.headers['x-integration-token'];
    if (!token || token !== cfg.integrationToken) {
      throw new UnauthorizedException('Token de integracion invalido');
    }
    return true;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: 0 errores (aún no se usa; se importa en Task 5).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/integration/integration-token.guard.ts
git commit -m "feat: IntegrationTokenGuard (valida X-Integration-Token)"
```

---

## Task 3: `PartnerClient` (HTTP saliente, fallo seguro)

**Files:**
- Create: `apps/api/src/modules/integration/partner-client.service.ts`

- [ ] **Step 1: Escribir el servicio**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { getIntegrationConfig, canCallPartner } from './integration.config';

export interface PartnerCallResult<T> {
  ok: boolean;
  status?: number;
  data?: T;
  error?: string;
}

// Encapsula las llamadas SALIENTES al socio. NUNCA lanza hacia el flujo de
// usuario: si el socio no responde devuelve { ok:false } y se registra en log.
@Injectable()
export class PartnerClient {
  private readonly logger = new Logger(PartnerClient.name);

  isConfigured(): boolean {
    return canCallPartner();
  }

  async get<T>(path: string, timeoutMs = 5000): Promise<PartnerCallResult<T>> {
    return this.request<T>('GET', path, undefined, timeoutMs);
  }

  async post<T>(path: string, body: unknown, timeoutMs = 8000): Promise<PartnerCallResult<T>> {
    return this.request<T>('POST', path, body, timeoutMs);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<PartnerCallResult<T>> {
    const cfg = getIntegrationConfig();
    if (!canCallPartner(cfg)) return { ok: false, error: 'partner-not-configured' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${cfg.partnerApiUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          'X-Integration-Token': cfg.partnerApiToken,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        this.logger.warn(`Socio ${method} ${path} -> HTTP ${res.status}`);
        return { ok: false, status: res.status, error: `http-${res.status}` };
      }
      const data = (await res.json()) as T;
      return { ok: true, status: res.status, data };
    } catch (e) {
      this.logger.warn(`Socio ${method} ${path} fallo: ${(e as Error).message}`);
      return { ok: false, error: (e as Error).message };
    } finally {
      clearTimeout(timer);
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/integration/partner-client.service.ts
git commit -m "feat: PartnerClient (HTTP saliente al socio con fallo seguro)"
```

---

## Task 4: `IntegrationService` (lookup local y remoto)

**Files:**
- Create: `apps/api/src/modules/integration/integration.service.ts`

- [ ] **Step 1: Escribir el servicio**

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PartnerClient } from './partner-client.service';
import { getIntegrationConfig } from './integration.config';

export interface ProductLookup {
  code: string;
  exists: boolean;
  isActive?: boolean;
  name?: string;
  stock?: number;
  priceDetal?: number;
  priceMayor?: number;
}

@Injectable()
export class IntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partner: PartnerClient,
  ) {}

  // Responde al SOCIO: datos de un code en MI base.
  async lookupLocal(code: string): Promise<ProductLookup> {
    const p = await this.prisma.product.findUnique({
      where: { code },
      select: {
        code: true, name: true, isActive: true,
        priceDetal: true, priceMayor: true,
        stock: { select: { quantity: true } },
      },
    });
    if (!p) return { code, exists: false };
    return {
      code: p.code,
      exists: true,
      isActive: p.isActive,
      name: p.name,
      stock: Math.round(p.stock.reduce((s, x) => s + x.quantity, 0) * 1000) / 1000,
      priceDetal: p.priceDetal,
      priceMayor: p.priceMayor,
    };
  }

  // Para MI frontend: consulta el mismo code en la empresa SOCIA.
  async lookupPartner(code: string): Promise<{ available: boolean; partnerName: string; product?: ProductLookup }> {
    const cfg = getIntegrationConfig();
    const r = await this.partner.get<ProductLookup>(`/integration/products/lookup?code=${encodeURIComponent(code)}`);
    if (!r.ok || !r.data) return { available: false, partnerName: cfg.partnerName };
    return { available: true, partnerName: cfg.partnerName, product: r.data };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/integration/integration.service.ts
git commit -m "feat: IntegrationService (lookup local y del socio)"
```

---

## Task 5: Controller + módulo + registro en app

**Files:**
- Create: `apps/api/src/modules/integration/integration.controller.ts`
- Create: `apps/api/src/modules/integration/integration.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Escribir el controller**

```typescript
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { IntegrationTokenGuard } from './integration-token.guard';
import { IntegrationService } from './integration.service';
import { getIntegrationConfig } from './integration.config';

@ApiTags('Integration')
@Controller('integration')
export class IntegrationController {
  constructor(private readonly service: IntegrationService) {}

  // ── ENTRANTES (los llama el SOCIO, protegidos por X-Integration-Token) ──

  @Get('ping')
  @UseGuards(IntegrationTokenGuard)
  ping() {
    return { ok: true, name: getIntegrationConfig().partnerName };
  }

  @Get('products/lookup')
  @UseGuards(IntegrationTokenGuard)
  lookup(@Query('code') code: string) {
    return this.service.lookupLocal(code);
  }

  // ── INTERNO (lo llama MI frontend, protegido por JWT de usuario) ──

  @Get('partner/product/:code')
  @UseGuards(AuthGuard('jwt'))
  partnerProduct(@Param('code') code: string) {
    return this.service.lookupPartner(code);
  }
}
```

- [ ] **Step 2: Escribir el módulo**

```typescript
import { Module } from '@nestjs/common';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';
import { PartnerClient } from './partner-client.service';

@Module({
  controllers: [IntegrationController],
  providers: [IntegrationService, PartnerClient],
  exports: [PartnerClient, IntegrationService],
})
export class IntegrationModule {}
```

- [ ] **Step 3: Registrar en `app.module.ts`**

Agregar el import junto a los demás (después de la línea `import { ReceiptsModule } ...`) y añadir `IntegrationModule` al array `imports` del `@Module`:

```typescript
import { IntegrationModule } from './modules/integration/integration.module';
```

Y en la lista `imports: [ ... ]` del decorador `@Module`, agregar `IntegrationModule,`.

- [ ] **Step 4: Typecheck**

Run: `cd apps/api && node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: 0 errores.

- [ ] **Step 5: Verificar rutas mapeadas (con el dev corriendo)**

Con `npx turbo dev --filter=@trinity/api --filter=@trinity/web` activo, revisar el log:
Expected: aparecen `Mapped {/integration/ping, GET}`, `Mapped {/integration/products/lookup, GET}`, `Mapped {/integration/partner/product/:code, GET}`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/integration/integration.controller.ts apps/api/src/modules/integration/integration.module.ts apps/api/src/app.module.ts
git commit -m "feat: integration module + endpoints ping/lookup/partner-product"
```

---

## Task 6: Verificación end-to-end del puente (loopback local)

Sin dos instancias en local, se prueba apuntando la instancia a **sí misma** (loopback): así `PARTNER_API_URL` = la propia API y el token de salida = el de entrada.

**Files:** ninguno (solo prueba). Se editan env temporalmente.

- [ ] **Step 1: Configurar loopback en `apps/api/.env`**

```
PARTNER_API_URL=http://localhost:4000
PARTNER_API_TOKEN=prueba-token-123
INTEGRATION_TOKEN=prueba-token-123
PARTNER_NAME=SOCIO PRUEBA
SELF_CODE=LOC
```

Reiniciar el dev del API (`npx kill-port 4000 3000 8765` y volver a levantar) para que tome el env.

- [ ] **Step 2: Probar el endpoint ENTRANTE (como si fuera el socio)**

Run:
```bash
curl -s -H "X-Integration-Token: prueba-token-123" \
  "http://localhost:4000/integration/products/lookup?code=UTGT11316"
```
Expected: JSON `{ "code":"UTGT11316","exists":true,... }` (o `exists:false` si ese code no está en la BD local). Sin token → HTTP 401.

- [ ] **Step 3: Probar el endpoint INTERNO (como el frontend, con JWT)**

Generar un JWT admin como en la sesión del reporte (firmar con `JWT_SECRET` local) y:
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/integration/partner/product/UTGT11316"
```
Expected: `{ "available":true, "partnerName":"SOCIO PRUEBA", "product":{...} }` (loopback consulta a sí mismo).

- [ ] **Step 4: Revertir el env de loopback**

Volver a dejar las 5 variables vacías en `apps/api/.env` (para no dejar el loopback activo). No se commitea `.env` (gitignored).

---

## Task 7: Panel "En {PARTNER}" en la ficha de producto

**Files:**
- Modify: `apps/web/src/app/(dashboard)/catalog/products/[code]/page.tsx`

- [ ] **Step 1: Leer el archivo y ubicar el layout de la ficha**

Run: `sed -n '1,60p' "apps/web/src/app/(dashboard)/catalog/products/[code]/page.tsx"` para ver imports, estado y dónde renderiza los datos del producto. Identificar el `code` disponible en el componente.

- [ ] **Step 2: Agregar estado y fetch del socio**

Dentro del componente, agregar (ajustando el nombre de la variable del código si difiere):

```typescript
const [partner, setPartner] = useState<{
  available: boolean;
  partnerName: string;
  product?: { exists: boolean; isActive?: boolean; name?: string; stock?: number; priceDetal?: number; priceMayor?: number };
} | null>(null);

useEffect(() => {
  if (!code) return;
  let cancel = false;
  fetch(`/api/proxy/integration/partner/product/${encodeURIComponent(code)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (!cancel) setPartner(d); })
    .catch(() => { if (!cancel) setPartner(null); });
  return () => { cancel = true; };
}, [code]);
```

- [ ] **Step 3: Renderizar el panel**

Colocar cerca del bloque de existencia/precio del producto:

```tsx
{partner && (
  <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 mt-4">
    <h3 className="text-sm font-semibold text-slate-300 mb-2">
      En {partner.partnerName}
    </h3>
    {!partner.available ? (
      <p className="text-sm text-slate-500">No disponible (empresa socia sin conexión).</p>
    ) : !partner.product?.exists ? (
      <p className="text-sm text-slate-500">Este artículo no existe en {partner.partnerName}.</p>
    ) : (
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-xs text-slate-500">Existencia</div>
          <div className="text-slate-200 font-semibold">{partner.product.stock ?? 0}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Precio detal</div>
          <div className="text-slate-200 font-semibold">${(partner.product.priceDetal ?? 0).toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Precio mayor</div>
          <div className="text-slate-200 font-semibold">${(partner.product.priceMayor ?? 0).toFixed(2)}</div>
        </div>
      </div>
    )}
  </div>
)}
```

Nota: el botón "Solicitar traslado" se agrega en la Fase de traslados (Función B); aquí solo se muestra la existencia.

- [ ] **Step 4: Typecheck del web**

Run: `cd apps/web && node_modules/.bin/tsc --noEmit -p tsconfig.json` (o `../../node_modules/.bin/tsc` si no está local).
Expected: 0 errores.

- [ ] **Step 5: Verificación visual (con loopback activo temporalmente)**

Activar el loopback de Task 6, abrir `http://localhost:3000` → Catálogo → un producto → confirmar que aparece el panel "En SOCIO PRUEBA" con existencia/precio. Luego revertir el env.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(dashboard)/catalog/products/[code]/page.tsx"
git commit -m "feat: panel de existencia en la empresa socia en la ficha de producto"
```

---

## Cierre de Fase 1

- [ ] **Push:** `git push origin main`
- [ ] **Deploy (cuando Diego lo indique):** setear las 5 env vars en `apps/api/.env` de cada instancia del server co-locado (valores reales, tokens distintos por dirección) y `bash /opt/deploy-trinity.sh total` + `... totalturen`.
- [ ] **Verificar en prod:** desde la ficha de un `code` compartido (ej. `UTGT11316`) en totalturen, ver la existencia real en total y viceversa.

**Siguiente:** Fase 2 (Función C — copiar precios), luego Fase 3 (Función D — sync de altas + reconciliación), luego Fase 4 (Función B — traslados bidireccionales + tabla `PartnerTransfer`). Cada una con su propio plan.

---

## Self-review (cobertura del spec, Fase 1)

- **Base (módulo, config, guard, PartnerClient):** Tasks 1-5 ✓
- **Opt-in dormido sin config:** `canCallPartner`/`canReceivePartner` + guard lanza si no hay token (Task 1, 2) ✓
- **Función A (consulta de existencia en vivo + UI en ficha + fallo seguro):** Tasks 4, 6, 7 ✓
- **Fuera de alcance de esta fase (correcto):** traslados, precios, sync de altas → fases siguientes.
- **Placeholders:** ninguno; todo el código está completo.
- **Consistencia de tipos:** `ProductLookup` se define en Task 4 y se reusa en controller (Task 5) y frontend (Task 7). `PartnerCallResult<T>` definido en Task 3 y usado en Task 4.
