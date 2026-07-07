# Tienda Online — Fase 1 (catálogo en vivo) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la vitrina existente (`trebol-shop`, Next.js en Vercel) muestre **precio, disponibilidad y foto en vivo desde Trinity** (empresa grande / inversiones), en vez de datos cargados por Excel — sin tocar el diseño ni el checkout.

**Architecture:** *Overlay.* La tienda **conserva todo su catálogo curado** en su propia BD (productos, categorías, marcas, banners, destacados, slugs, iconos). Trinity expone una **API pública de solo-lectura** que, dado un lote de códigos (SKU), devuelve el **precio (USD y Bs), disponibilidad (booleano) y URL de foto** en vivo. La capa `lib/db.ts` de la tienda **superpone** esos 3 datos sobre cada producto por `sku == code`. Como la UI ya consume `lib/db.ts`, **no cambia ningún componente**. Las fotos que el personal está cargando en Trinity fluyen solas a la tienda.

**Tech Stack:** Trinity = NestJS + Prisma (API pública nueva) + Redis (cache). Tienda = Next.js 14 App Router (Server Components + ISR), `fetch()` server-side. Sin auth en la API pública (solo datos de catálogo, no sensibles) + CORS al dominio de la tienda.

## Convención de verificación (no hay tests unitarios)

Ninguno de los dos repos tiene framework de pruebas. La convención es **typecheck `0 errores` + prueba funcional**. Cada tarea cierra con typecheck + pasos funcionales concretos + commit.

## Decisiones de diseño (fijadas con Diego 2026-07-07)

1. **Alcance Fase 1 = SOLO catálogo en vivo.** El checkout/pedido NO entra aquí (fase aparte). El botón "Agregar al carrito" y el checkout de la tienda siguen funcionando contra su propia BD como hasta ahora; no se tocan.
2. **La tienda conserva su curación.** Trinity NO manda la lista de productos ni las categorías: solo `precio/disponibilidad/foto` por SKU. El admin de la tienda sigue mandando qué productos existen y cómo se agrupan.
3. **Disponibilidad, no stock exacto.** La API pública devuelve `available: boolean` (stock total > 0), NO el número. La tarjeta/detalle de la tienda se ajustan a "Disponible / Agotado" (hoy muestran "N disponibles").
4. **Match por `sku == code`.** Un producto de la tienda se enlaza a Trinity por su `sku` (= `Product.code` de Trinity). Si no hay match (o el producto de Trinity está inactivo), la tienda **cae al valor guardado** en su propia BD (fallback) y no rompe.
5. **Sin `mostrarEnTienda` en esta fase.** Como la tienda decide qué productos existen, no hace falta el flag en Trinity todavía. Se dejará para cuando se mueva la curación a Trinity (fase futura).
6. **Pedidos → futuro en Trinity** (fuera de alcance). Recomendación registrada: cuando se haga el checkout online, el pedido vive en Trinity (modelo `Pedido`, no pre-factura) para poder convertirse a factura con el flujo normal.

## Prerrequisitos (ya cumplidos)

- Trinity (inversiones) en producción con la feature de fotos desplegada (`primaryImageMediumUrl`/`primaryImageThumbUrl` en `Product`). ✓
- Repo de la tienda clonado en `C:\Users\Diego\Desktop\trebol-shop` (Next.js 14, Server Components, ISR `revalidate=300`, imágenes `next/image` con `remotePatterns: ['**']`). ✓
- Dominio del API de Trinity grande: `https://api.inversiones.eltrebol.app`. Dominio de la tienda: `https://trebol-shop.vercel.app` (+ el que Diego configure).

---

# PARTE A — Trinity: API pública de datos en vivo

Archivos nuevos bajo `apps/api/src/modules/public/`. Todo en el repo `C:\Users\Diego\Desktop\Trinity`.

### Task A1: `PublicModule` — servicio y controlador de datos en vivo por código

**Files:**
- Create: `apps/api/src/modules/public/public.service.ts`
- Create: `apps/api/src/modules/public/public.controller.ts`
- Create: `apps/api/src/modules/public/public.module.ts`
- Modify: `apps/api/src/app.module.ts` (registrar `PublicModule`)

- [ ] **Step 1: Servicio**

`apps/api/src/modules/public/public.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface PublicProductLive {
  code: string;
  name: string;
  priceUsd: number;
  priceBs: number;
  available: boolean;
  imageUrl: string | null;   // foto grande (medium) para tarjeta y detalle
  thumbUrl: string | null;
}

@Injectable()
export class PublicService {
  constructor(private prisma: PrismaService) {}

  /** Datos en vivo (precio/disponibilidad/foto) de una lista de códigos. Solo productos activos. */
  async productsByCodes(codes: string[]): Promise<PublicProductLive[]> {
    const clean = Array.from(new Set(codes.map((c) => c.trim()).filter(Boolean))).slice(0, 500);
    if (clean.length === 0) return [];

    // Tasa del día (la más reciente). Si no hay, priceBs = 0.
    const rate = await this.prisma.exchangeRate.findFirst({ orderBy: { date: 'desc' } });
    const rateValue = rate?.rate ?? 0;

    const products = await this.prisma.product.findMany({
      where: { code: { in: clean }, isActive: true },
      select: {
        code: true,
        name: true,
        priceDetal: true,
        primaryImageThumbUrl: true,
        primaryImageMediumUrl: true,
        stock: { select: { quantity: true } },
      },
    });

    return products.map((p) => {
      const totalStock = p.stock.reduce((sum, s) => sum + s.quantity, 0);
      return {
        code: p.code,
        name: p.name,
        priceUsd: p.priceDetal,
        priceBs: Math.round(p.priceDetal * rateValue * 100) / 100,
        available: totalStock > 0,
        imageUrl: p.primaryImageMediumUrl ?? null,
        thumbUrl: p.primaryImageThumbUrl ?? null,
      };
    });
  }
}
```

- [ ] **Step 2: Controlador**

`apps/api/src/modules/public/public.controller.ts` (SIN guard — es público de solo-lectura):

```typescript
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PublicService } from './public.service';

@ApiTags('Public')
@Controller('public')
export class PublicController {
  constructor(private service: PublicService) {}

  // GET /public/products?codes=HER00001,PLO00042
  @Get('products')
  async products(@Query('codes') codes?: string) {
    const list = (codes || '').split(',');
    const data = await this.service.productsByCodes(list);
    return { data };
  }
}
```

- [ ] **Step 3: Módulo**

`apps/api/src/modules/public/public.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
```

- [ ] **Step 4: Registrar en `app.module.ts`**

En `apps/api/src/app.module.ts`, importar y agregar `PublicModule` al array `imports` (junto a los demás módulos de dominio):

```typescript
import { PublicModule } from './modules/public/public.module';
// ... en imports: [ ..., PublicModule ]
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @trinity/api exec tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 6: Prueba funcional (local, con Trinity corriendo)**

Levantar el API con el entorno cargado (ver memoria `api-carga-env-cwd`): desde la raíz `set -a; . ./.env; set +a` y `pnpm --filter @trinity/api start`. Tomar 2-3 códigos reales de la BD local:

```bash
# obtener códigos de ejemplo
psql "$DATABASE_URL_SIN_SCHEMA" -tc "SELECT code FROM \"Product\" WHERE \"isActive\"=true LIMIT 3;"
# probar el endpoint
curl -s "http://localhost:4000/public/products?codes=CODE1,CODE2" | head -c 800
```

Expected: JSON `{ "data": [ { code, name, priceUsd, priceBs, available, imageUrl, thumbUrl }, ... ] }`. Los que tengan foto traen `imageUrl` no nulo; `available` refleja stock>0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/public apps/api/src/app.module.ts
git commit -m "feat: API publica /public/products (precio/disponibilidad/foto en vivo por codigo)"
```

---

### Task A2: CORS para el dominio de la tienda en `/public/*`

**Contexto:** la tienda hace `fetch` server-side (desde Vercel), no desde el navegador del cliente — así que técnicamente CORS del navegador no aplica al SSR. Pero si en el futuro se llama desde el cliente, y como buena práctica, se habilita CORS explícito para el dominio de la tienda en las rutas públicas. Revisar primero cómo está el CORS global.

**Files:**
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Revisar el CORS actual**

```bash
grep -nE "enableCors|cors|origin" apps/api/src/main.ts
```

- [ ] **Step 2: Asegurar que el origin de la tienda esté permitido**

En `apps/api/src/main.ts`, en la config de `app.enableCors({...})`, agregar el dominio de la tienda a la lista de orígenes permitidos (si usa una lista) — p. ej. `https://trebol-shop.vercel.app` y el dominio propio futuro. Si el CORS ya permite cualquier origen o se maneja por lista de env, agregar ahí. **NO** romper los orígenes existentes (el ERP web). Ejemplo de forma segura (unir, no reemplazar):

```typescript
const allowedOrigins = [
  // ...orígenes existentes del ERP...
  'https://trebol-shop.vercel.app',
];
app.enableCors({ origin: allowedOrigins, credentials: true });
```

Si el proyecto ya toma orígenes de una env var (`CORS_ORIGIN`), preferir agregar el dominio ahí (en el `.env` de cada server) en vez de hardcodear. Documentar la decisión en el commit.

- [ ] **Step 3: Typecheck + boot**

```bash
pnpm --filter @trinity/api exec tsc --noEmit
```

Expected: 0 errores. Arrancar el API y confirmar que sigue booteando.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/main.ts
git commit -m "chore: permitir CORS del dominio de la tienda en el API"
```

---

### Task A3: Cache Redis del endpoint público (hardening)

**Contexto:** la tienda ya cachea 5 min (ISR `revalidate=300`), así que el volumen a Trinity es bajo. Aun así se agrega un cache corto en Redis para amortiguar picos y proteger el POS. Trinity ya tiene `RedisModule`/`RedisService`.

**Files:**
- Modify: `apps/api/src/modules/public/public.service.ts`
- Modify: `apps/api/src/modules/public/public.module.ts` (inyectar Redis si hace falta)

- [ ] **Step 1: Ver la interfaz de Redis del proyecto**

```bash
grep -rnE "class RedisService|get\(|set\(|setex|expire" apps/api/src/redis/redis.service.ts
```

Anotar los métodos disponibles (get/set con TTL).

- [ ] **Step 2: Cachear por hash de códigos con TTL 60s**

En `public.service.ts`, envolver `productsByCodes`: construir la key `public:products:<códigos ordenados unidos por coma>`, intentar `redis.get(key)` (parsear JSON), si hay hit devolverlo; si no, calcular y `redis.set(key, JSON.stringify(result), 60)` (TTL 60s). Usar la firma real de `RedisService` encontrada en el Step 1. Inyectar `RedisService` en el constructor del servicio (importar de `../../redis/redis.service`) y agregar `RedisModule` a los `imports` de `PublicModule` si `RedisService` no es global (verificar con `grep -n "@Global" apps/api/src/redis/redis.module.ts`).

- [ ] **Step 3: Typecheck + prueba**

```bash
pnpm --filter @trinity/api exec tsc --noEmit
```

Expected: 0 errores. Repetir el `curl` del Task A1 Step 6 dos veces; la 2da debe responder igual (y más rápido). Cambiar un precio en la BD y confirmar que dentro de 60s se refresca.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/public
git commit -m "perf: cache Redis 60s en /public/products"
```

---

# PARTE B — Tienda: reconexión (overlay de datos en vivo)

Todo en el repo `C:\Users\Diego\Desktop\trebol-shop`. **Regla de oro:** no cambiar las **firmas** de las funciones de `lib/db.ts` — así ningún componente/página se toca.

### Task B1: Cliente de Trinity + variable de entorno

**Files:**
- Create: `C:\Users\Diego\Desktop\trebol-shop\lib\trinity.ts`
- Modify: `.env.example` (crear si no existe) — documentar `TRINITY_API_URL`

- [ ] **Step 1: Cliente `lib/trinity.ts`**

```typescript
import { cache } from 'react'

export type TrinityLive = {
  code: string
  name: string
  priceUsd: number
  priceBs: number
  available: boolean
  imageUrl: string | null
  thumbUrl: string | null
}

const BASE = process.env.TRINITY_API_URL // ej: https://api.inversiones.eltrebol.app

/**
 * Trae datos en vivo (precio/disponibilidad/foto) de Trinity para una lista de SKUs.
 * Devuelve un Map keyed por code. Si TRINITY_API_URL no está o falla, devuelve Map vacío
 * (la tienda cae al fallback de su propia BD).
 */
export const getTrinityLive = cache(async function getTrinityLive(
  codes: string[]
): Promise<Map<string, TrinityLive>> {
  const result = new Map<string, TrinityLive>()
  const clean = Array.from(new Set(codes.map((c) => c.trim()).filter(Boolean)))
  if (!BASE || clean.length === 0) return result
  try {
    const res = await fetch(`${BASE}/public/products?codes=${encodeURIComponent(clean.join(','))}`, {
      // ISR: la página ya revalida a 300s; alineamos el cache del fetch
      next: { revalidate: 300 },
    })
    if (!res.ok) return result
    const json = (await res.json()) as { data: TrinityLive[] }
    for (const p of json.data || []) result.set(p.code, p)
  } catch {
    // silencioso: fallback a la BD propia
  }
  return result
})
```

- [ ] **Step 2: Documentar la env var**

Crear/editar `.env.example` en la raíz de la tienda agregando:

```
# API pública de Trinity (empresa grande) para precio/stock/foto en vivo
TRINITY_API_URL="https://api.inversiones.eltrebol.app"
```

- [ ] **Step 3: Typecheck**

```bash
cd C:\Users\Diego\Desktop\trebol-shop && npx tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add lib/trinity.ts .env.example
git commit -m "feat: cliente de la API publica de Trinity (datos en vivo por SKU)"
```

---

### Task B2: Overlay de los datos en vivo en `lib/db.ts`

**Contexto:** cada función que devuelve productos debe superponer `price/available/image` desde Trinity, matcheando `product.sku == live.code`. Si no hay dato en vivo, se conserva el valor de la BD propia (fallback). Se centraliza en un helper para no repetir.

**Files:**
- Modify: `C:\Users\Diego\Desktop\trebol-shop\lib\db.ts`

- [ ] **Step 1: Agregar el helper de overlay al inicio de `lib/db.ts`**

Importar el cliente y agregar una función que enriquece una lista de productos ya mapeados:

```typescript
import { getTrinityLive } from './trinity'
// ...imports existentes (cache, prisma, tipos)...

/** Superpone precio/disponibilidad/foto en vivo desde Trinity sobre productos ya mapeados. */
async function overlayLive(products: Product[]): Promise<Product[]> {
  if (products.length === 0) return products
  const live = await getTrinityLive(products.map((p) => p.sku))
  return products.map((p) => {
    const l = live.get(p.sku)
    if (!l) return p // fallback: se queda con lo de la BD propia
    return {
      ...p,
      price: l.priceUsd,
      image: l.imageUrl ?? p.image, // si Trinity no tiene foto, conserva la de la tienda
      // "disponible/agotado": stock 1 = disponible, 0 = agotado (no exponemos el número real)
      stock: l.available ? 1 : 0,
      available: l.available,
    }
  })
}
```

- [ ] **Step 2: Aplicar `overlayLive` en cada función de lectura de productos**

Envolver el `return` de cada una:

- `getAllProducts`: `return overlayLive(prods.map(mapProduct))`
- `getFeaturedProducts`: `return overlayLive(prods.map(mapProduct))`
- `getRelatedProducts`: `return overlayLive(prods.map(mapProduct))`
- `searchProducts`: `return overlayLive(prods.map(mapProduct))`
- `getProductBySlug`: `const mapped = mapProduct(p); const [one] = await overlayLive([mapped]); return one`
- `getCategoryBySlug`: `... products: await overlayLive(cat.products.map(mapProduct)) ...` (dentro del objeto retornado)
- `getBrandBySlug`: `... products: await overlayLive(brand.products.map(mapProduct)) ...`

(No tocar `getAllCategories`/`getAllBrands`/`getActiveBanners`: esos son curación de la tienda y no llevan overlay. Nota: el `productCount` de categorías/marcas sigue siendo el de la BD propia — aceptable en Fase 1.)

- [ ] **Step 3: Typecheck**

```bash
cd C:\Users\Diego\Desktop\trebol-shop && npx tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add lib/db.ts
git commit -m "feat: overlay de precio/disponibilidad/foto en vivo desde Trinity"
```

---

### Task B3: Mostrar "Disponible / Agotado" en vez del número exacto

**Contexto (decisión #3):** como el overlay setea `stock` a 1 (disponible) o 0 (agotado), los textos "N disponibles" / "Solo N disponibles" quedarían mostrando "1 disponible", confuso. Se ajustan a etiquetas de disponibilidad.

**Files:**
- Modify: `C:\Users\Diego\Desktop\trebol-shop\components\products\ProductCard.tsx`
- Modify: `C:\Users\Diego\Desktop\trebol-shop\app\(shop)\productos\[slug]\ProductDetailClient.tsx`

- [ ] **Step 1: ProductCard — reemplazar el bloque de stock**

Ubicar el bloque que muestra `{product.stock > 10 ? 'En stock' : \`${product.stock} disponibles\`}` y los badges "Pocas unidades"/"Sin stock". Reemplazar por lógica binaria basada en `available`:

```jsx
{product.available
  ? <p className="text-[10px] text-brand-600">Disponible</p>
  : <p className="text-[10px] text-red-500">Agotado</p>}
```

Y en los badges, dejar solo: si `!product.available` → badge rojo "Agotado"; quitar "Pocas unidades" y el que muestra número. Mantener el badge "Destacado" (`product.featured`) tal cual. El botón sigue con `disabled={!product.available}`.

- [ ] **Step 2: ProductDetailClient — reemplazar `stockStatus`**

Ubicar el `const stockStatus = ...` (usa `product.stock === 0 / <= 5`). Reemplazar por:

```jsx
const stockStatus = product.available
  ? { label: 'Disponible', color: 'text-brand-600', icon: CheckCircle }
  : { label: 'Agotado', color: 'text-red-600', icon: XCircle }
```

(Quitar la rama de "Solo N disponibles" que expone el número. `AlertTriangle` puede quedar importado sin usar; si el linter se queja, quitar el import.)

- [ ] **Step 3: Typecheck**

```bash
cd C:\Users\Diego\Desktop\trebol-shop && npx tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add "components/products/ProductCard.tsx" "app/(shop)/productos/[slug]/ProductDetailClient.tsx"
git commit -m "feat: mostrar Disponible/Agotado (no el numero de stock) con datos en vivo"
```

---

### Task B4: Imágenes de Spaces vía `next/image`

**Contexto:** las fotos de Trinity son URLs del CDN de Spaces (`https://trinity-inversiones.nyc3.cdn.digitaloceanspaces.com/...`). `next.config.mjs` ya permite cualquier host (`remotePatterns: ['**']`), así que renderizan. PERO `lib/utils.ts` tiene `cloudinaryUrl()` que **re-envuelve** URLs no-Cloudinary a través de Cloudinary (`/image/fetch/...`) si está seteado `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`. Eso metería las fotos de Spaces por Cloudinary innecesariamente. Se ajusta para que las URLs de Spaces se sirvan directo del CDN.

**Files:**
- Modify: `C:\Users\Diego\Desktop\trebol-shop\lib\utils.ts`

- [ ] **Step 1: Ver `cloudinaryUrl()`**

```bash
grep -n "cloudinaryUrl" -A 15 lib/utils.ts
```

- [ ] **Step 2: Bypass para URLs ya en un CDN (Spaces / http(s) absolutas)**

En `cloudinaryUrl(src)`, agregar al inicio: si `src` ya es una URL absoluta de un CDN de Spaces (contiene `digitaloceanspaces.com`) o no hay `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, **devolver `src` tal cual** (sin envolver). Mantener el resto igual para compatibilidad con imágenes viejas de la tienda.

```typescript
export function cloudinaryUrl(src?: string | null): string {
  if (!src) return ''
  if (src.includes('digitaloceanspaces.com')) return src // foto de Trinity: directo del CDN
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  if (!cloud) return src
  if (src.includes('res.cloudinary.com')) return src
  return `https://res.cloudinary.com/${cloud}/image/fetch/f_auto,q_auto/${src}`
}
```

- [ ] **Step 3: Typecheck**

```bash
cd C:\Users\Diego\Desktop\trebol-shop && npx tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add lib/utils.ts
git commit -m "fix: servir fotos de Spaces directo del CDN (sin envolver en Cloudinary)"
```

---

# PARTE C — Verificación end-to-end + despliegue

### Task C1: Prueba funcional integrada (local/preview)

**Contexto:** la tienda necesita su propia BD (Supabase) para correr; eso lo tiene Diego. La API de Trinity puede apuntar a local (`http://localhost:4000`) o a producción (`https://api.inversiones.eltrebol.app`). Requiere que **el `sku` de algún producto de la tienda coincida con un `code` de Trinity** que tenga foto cargada.

- [ ] **Step 1: Alinear al menos 1 SKU de prueba**

En la BD de la tienda, elegir un producto y poner su `sku` igual a un `code` real de Trinity que **ya tenga foto** (de la carga del personal). Anotar ese code.

- [ ] **Step 2: Correr la tienda apuntando a Trinity**

En el `.env.local` de la tienda: `TRINITY_API_URL=https://api.inversiones.eltrebol.app` (o local). `npm run dev`. Abrir el producto de prueba en la tienda.

Expected: el producto muestra la **foto de Trinity**, el **precio actual** de Trinity y **"Disponible/Agotado"** según su stock real. Cambiar el precio o el stock en Trinity → tras ≤5 min (ISR) la tienda lo refleja.

- [ ] **Step 3: Confirmar el fallback**

Abrir un producto de la tienda cuyo `sku` NO exista en Trinity → debe seguir mostrando los datos de la BD propia (sin romperse).

### Task C2: Despliegue

- [ ] **Trinity (lo despliega Diego, con su autorización explícita — ver memoria `deploy-lo-hace-el-usuario`):** push a `main`, luego en el server de inversiones `git pull && bash deploy.sh`. Verificar `GET https://api.inversiones.eltrebol.app/public/products?codes=<code_real>` responde. (Solo código, sin migraciones ni deps nuevas.)
- [ ] **Tienda (Vercel):** agregar la env var `TRINITY_API_URL=https://api.inversiones.eltrebol.app` en el proyecto de Vercel y hacer push a la rama que Vercel despliega. Verificar en la URL pública que un producto con SKU alineado muestra foto/precio/disponibilidad en vivo.
- [ ] **CORS:** confirmar en `.env` de inversiones (o `main.ts`) que el dominio de la tienda quedó permitido.

---

## Fuera de alcance (fases futuras)

- **Checkout/pedido online** → modelo `Pedido` en Trinity (no pre-factura) + pantalla de verificación de Pago Móvil + conversión a factura.
- **Curación en Trinity:** flag `mostrarEnTienda`, `featured`, slugs, y que la tienda tome también la lista de productos y categorías de Trinity (jubilar el admin de catálogo de la tienda).
- **Precio en Bs en la tienda:** el API ya devuelve `priceBs`; falta que la UI lo muestre si se desea.
- **Rate-limit** de la API pública (hoy solo CORS + cache).
- **Búsqueda server-side** (`searchProducts` existe pero la tienda filtra en cliente; migrar si el catálogo crece).

## Self-review (hecho)

- **Cobertura de decisiones:** catálogo-only ✓ (no se toca checkout); tienda conserva curación ✓ (overlay, no reemplazo); disponible/agotado ✓ (B3); match por sku==code + fallback ✓ (B2 helper); sin mostrarEnTienda ✓; pedidos fuera ✓.
- **Sin placeholders:** todo el código está completo; los únicos "verificar" son firmas reales a confirmar (RedisService en A3, enableCors en A2) con el `grep` indicado antes de escribir.
- **Consistencia de tipos:** `TrinityLive`/`PublicProductLive` comparten los campos `code/priceUsd/priceBs/available/imageUrl/thumbUrl`; `overlayLive` usa `p.sku` (de la tienda) contra `l.code` (de Trinity); el tipo `Product` de la tienda (`price/stock/image/available`) es lo que se superpone. `getTrinityLive` devuelve `Map<string, TrinityLive>` y `overlayLive` lo consume igual.
- **Firmas intactas:** ninguna función de `lib/db.ts` cambia su firma → cero cambios en páginas/componentes salvo B3 (ajuste de textos de stock, opcional pero recomendado).
