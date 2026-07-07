# Tienda Online (Snapshot al CDN) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la vitrina `trebol-shop` (Next.js/Vercel) muestre el catálogo real de Trinity (precio, disponibilidad en 3 niveles, foto) leyendo un **snapshot JSON servido desde el CDN de Spaces**, con **cero carga sobre el POS al navegar**, y que los pedidos online se guarden en Trinity como un modelo propio (`OnlineOrder`) verificable a mano.

**Architecture:** Trinity = única fuente de verdad. Un job en Trinity exporta `store/catalog.json` + `store/meta.json` a Spaces (mismo bucket/CDN de las fotos). La vitrina lee esos JSON con ISR y filtra en memoria; se elimina su BD y su admin. El checkout hace `POST /public/orders` a Trinity. Diseño completo: `docs/superpowers/specs/2026-07-07-tienda-snapshot-cdn-design.md`.

**Tech Stack:** Trinity = NestJS + Prisma + `@aws-sdk/client-s3` (SpacesService ya existe) + `@nestjs/schedule` (cron) + `@nestjs/throttler`/`helmet`/`compression` (hardening público). Vitrina = Next.js 14 App Router (Server Components + ISR), `fetch()` server-side, Zustand (carrito, intacto).

## Convención de verificación (no hay tests unitarios)

Ninguno de los dos repos tiene framework de pruebas. La convención del proyecto es **typecheck `0 errores` + prueba funcional**. Cada tarea cierra con typecheck + pasos funcionales concretos + commit.
- Trinity API: `pnpm --filter @trinity/api exec tsc --noEmit`
- Vitrina: `cd C:\Users\Diego\Desktop\trebol-shop && npx tsc --noEmit`

## Prerrequisitos

- Trinity (inversiones) en producción con la feature de fotos desplegada (`primaryImageThumbUrl`/`primaryImageMediumUrl` en `Product`, `SpacesService` funcionando). ✓ (2026-07-07)
- Variables `SPACES_*` cargadas en `apps/api/.env` de cada server (bucket `trinity-inversiones` / `trinity-eltrebol`, CDN base). ✓ (memoria `spaces-fotos-infra`, `api-carga-env-cwd`)
- Repo de la tienda en `C:\Users\Diego\Desktop\trebol-shop`.
- Dominios: API Trinity grande `https://api.inversiones.eltrebol.app`; tienda en Vercel (URL que configure Diego).

## Decisiones fijadas (2026-07-07) — ver spec §9

1. Snapshot al CDN (single source). 2. Stock 3 niveles `Disponible/Pocas unidades/Agotado` (umbral 5), sin número. 3. Catálogo de Trinity; marketing (iconos/logos/banners) en `store-config.ts`. 4. Se elimina BD+admin de la tienda. 5. Pedido = `OnlineOrder` propio + verificación manual. 6. Solo productos con `showInStore`.

---

# PARTE A — Trinity: flags de tienda + export a Spaces

> **Entregable de la Parte A:** Trinity genera y sube el snapshot del catálogo al CDN. Testeable de forma independiente con `curl` a la URL del CDN.

### Task A1: Flags `showInStore` / `storeFeatured` en `Product`

**Files:**
- Modify: `packages/database/prisma/schema.prisma:475-517` (modelo `Product`)
- Create: `packages/database/prisma/migrations/20260707180000_product_store_flags/migration.sql`
- Modify: `deploy/fix-schema.sql` (espejo idempotente)

- [ ] **Step 1: Agregar los campos al modelo `Product`**

En `schema.prisma`, dentro de `model Product`, junto a `isActive`:

```prisma
  isActive         Boolean                  @default(true)
  showInStore      Boolean                  @default(false)
  storeFeatured    Boolean                  @default(false)
```

- [ ] **Step 2: Migración idempotente**

`packages/database/prisma/migrations/20260707180000_product_store_flags/migration.sql`:

```sql
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "showInStore" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "storeFeatured" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Product_showInStore_idx" ON "Product" ("showInStore");
```

- [ ] **Step 3: Espejo en `deploy/fix-schema.sql`**

Agregar al final de `deploy/fix-schema.sql` las mismas 3 líneas del Step 2 (son `IF NOT EXISTS`, seguras de re-ejecutar).

- [ ] **Step 4: Generar Prisma client + aplicar en local**

```bash
pnpm --filter @trinity/database exec prisma migrate dev --name product_store_flags
pnpm --filter @trinity/database exec prisma generate
```

Expected: migración aplicada, client regenerado, 0 errores.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @trinity/api exec tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260707180000_product_store_flags deploy/fix-schema.sql
git commit -m "feat: flags showInStore/storeFeatured en Product (tienda online)"
```

---

### Task A2: `SpacesService.uploadJson` (objetos JSON con cache corto)

**Contexto:** `uploadPublic` existente pone `Cache-Control: immutable, max-age=1año` — correcto para fotos (nunca cambian), **incorrecto** para el snapshot (cambia). Se agrega un método para JSON con TTL corto.

**Files:**
- Modify: `apps/api/src/modules/product-images/spaces.service.ts`
- Modify: `apps/api/src/modules/product-images/product-images.module.ts` (exportar `SpacesService`)

- [ ] **Step 1: Método `uploadJson`**

En `spaces.service.ts`, agregar dentro de la clase (después de `uploadPublic`):

```typescript
  /** Sube un JSON público con cache corto (para snapshots que cambian). Devuelve su URL de CDN. */
  async uploadJson(key: string, data: unknown, maxAgeSeconds = 60): Promise<string> {
    const body = Buffer.from(JSON.stringify(data), 'utf-8');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/json; charset=utf-8',
        ACL: 'public-read',
        CacheControl: `public, max-age=${maxAgeSeconds}, s-maxage=${maxAgeSeconds}`,
      }),
    );
    return this.cdnUrl(key);
  }
```

- [ ] **Step 2: Exportar `SpacesService` del módulo**

En `apps/api/src/modules/product-images/product-images.module.ts`, agregar `SpacesService` al array `exports` (si no está). Verificar primero:

```bash
grep -n "exports" apps/api/src/modules/product-images/product-images.module.ts
```

Dejar por ejemplo: `exports: [SpacesService]` (agregándolo a los exports existentes si los hay).

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @trinity/api exec tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/product-images/spaces.service.ts apps/api/src/modules/product-images/product-images.module.ts
git commit -m "feat: SpacesService.uploadJson (snapshots JSON con cache corto)"
```

---

### Task A3: `StoreExportService` — construir y subir el snapshot

**Files:**
- Create: `apps/api/src/modules/store-export/store-export.service.ts`

- [ ] **Step 1: Servicio de export**

`apps/api/src/modules/store-export/store-export.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SpacesService } from '../product-images/spaces.service';

const LOW_STOCK_THRESHOLD = 5; // "pocas unidades" si stock total <= este valor

export type StockStatus = 'disponible' | 'pocas' | 'agotado';

export interface StoreProduct {
  slug: string;
  code: string;
  name: string;
  description: string;
  priceUsd: number;
  priceBs: number;
  stockStatus: StockStatus;
  image: string | null;
  thumb: string | null;
  categorySlug: string | null;
  brandSlug: string | null;
  featured: boolean;
}

/** Convierte texto a slug: minúsculas, sin acentos, no-alfanumérico → guion. */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

@Injectable()
export class StoreExportService {
  private readonly logger = new Logger(StoreExportService.name);

  constructor(
    private prisma: PrismaService,
    private spaces: SpacesService,
  ) {}

  /** Construye y sube store/catalog.json + store/meta.json. Devuelve un resumen. */
  async exportCatalog(): Promise<{ products: number; categories: number; brands: number; generatedAt: string }> {
    const generatedAt = new Date().toISOString();

    // Tasa BCV más reciente (para priceBs). Si no hay, 0.
    const rateRow = await this.prisma.exchangeRate.findFirst({ orderBy: { date: 'desc' } });
    const rate = rateRow?.rate ?? 0;

    const products = await this.prisma.product.findMany({
      where: { isActive: true, showInStore: true },
      select: {
        code: true,
        name: true,
        description: true,
        priceDetal: true,
        storeFeatured: true,
        primaryImageThumbUrl: true,
        primaryImageMediumUrl: true,
        category: { select: { name: true } },
        brand: { select: { name: true } },
        stock: { select: { quantity: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Slugs de categoría/marca con dedupe determinista.
    const catSlugs = new Map<string, string>(); // name -> slug
    const brandSlugs = new Map<string, string>();
    const used = new Set<string>();
    const uniqueSlug = (base: string): string => {
      let s = base || 'x';
      let n = 2;
      while (used.has(s)) s = `${base}-${n++}`;
      used.add(s);
      return s;
    };
    const catCount = new Map<string, number>();
    const brandCount = new Map<string, number>();

    const storeProducts: StoreProduct[] = products.map((p) => {
      const total = p.stock.reduce((sum, s) => sum + s.quantity, 0);
      const stockStatus: StockStatus =
        total <= 0 ? 'agotado' : total <= LOW_STOCK_THRESHOLD ? 'pocas' : 'disponible';

      let categorySlug: string | null = null;
      if (p.category?.name) {
        if (!catSlugs.has(p.category.name)) catSlugs.set(p.category.name, uniqueSlug(slugify(p.category.name)));
        categorySlug = catSlugs.get(p.category.name)!;
        catCount.set(categorySlug, (catCount.get(categorySlug) || 0) + 1);
      }
      let brandSlug: string | null = null;
      if (p.brand?.name) {
        if (!brandSlugs.has(p.brand.name)) brandSlugs.set(p.brand.name, uniqueSlug(slugify(p.brand.name)));
        brandSlug = brandSlugs.get(p.brand.name)!;
        brandCount.set(brandSlug, (brandCount.get(brandSlug) || 0) + 1);
      }

      return {
        slug: `${slugify(p.name)}-${p.code.toLowerCase()}`,
        code: p.code,
        name: p.name,
        description: p.description ?? '',
        priceUsd: p.priceDetal,
        priceBs: Math.round(p.priceDetal * rate * 100) / 100,
        stockStatus,
        image: p.primaryImageMediumUrl ?? null,
        thumb: p.primaryImageThumbUrl ?? null,
        categorySlug,
        brandSlug,
        featured: p.storeFeatured,
      };
    });

    const categories = Array.from(catSlugs.entries()).map(([name, slug]) => ({
      slug,
      name,
      productCount: catCount.get(slug) || 0,
    }));
    const brands = Array.from(brandSlugs.entries()).map(([name, slug]) => ({
      slug,
      name,
      productCount: brandCount.get(slug) || 0,
    }));

    await this.spaces.uploadJson('store/catalog.json', { generatedAt, rate, products: storeProducts }, 60);
    await this.spaces.uploadJson('store/meta.json', { generatedAt, rate, categories, brands }, 60);

    const summary = { products: storeProducts.length, categories: categories.length, brands: brands.length, generatedAt };
    this.logger.log(`Snapshot tienda subido: ${JSON.stringify(summary)}`);
    return summary;
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @trinity/api exec tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/store-export/store-export.service.ts
git commit -m "feat: StoreExportService (arma catalog.json/meta.json para la tienda)"
```

---

### Task A4: Controlador (trigger manual) + cron + módulo + registro

**Files:**
- Create: `apps/api/src/modules/store-export/store-export.controller.ts`
- Create: `apps/api/src/modules/store-export/store-export.cron.ts`
- Create: `apps/api/src/modules/store-export/store-export.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Controlador (solo ADMIN puede forzar el export)**

`apps/api/src/modules/store-export/store-export.controller.ts`:

```typescript
import { Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StoreExportService } from './store-export.service';

@ApiTags('Store Export')
@ApiBearerAuth()
@Controller('store-export')
export class StoreExportController {
  constructor(private service: StoreExportService) {}

  // POST /store-export/run — regenera el snapshot ya mismo
  @Post('run')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  async run() {
    return this.service.exportCatalog();
  }
}
```

> Verificar la ruta real del decorador `@Roles` y `RolesGuard`:
> `grep -rn "export.*Roles\|class RolesGuard" apps/api/src/modules/auth`. Ajustar los imports a la ubicación real (en Trinity están bajo `modules/auth/decorators` y `modules/auth/guards`; confirmar).

- [ ] **Step 2: Cron cada 10 min (hora Caracas)**

`apps/api/src/modules/store-export/store-export.cron.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StoreExportService } from './store-export.service';

@Injectable()
export class StoreExportCron {
  private readonly logger = new Logger(StoreExportCron.name);

  constructor(private service: StoreExportService) {}

  // Cada 10 minutos. timeZone Caracas por consistencia con los demás crons del proyecto.
  @Cron(CronExpression.EVERY_10_MINUTES, { timeZone: 'America/Caracas' })
  async handle() {
    try {
      await this.service.exportCatalog();
    } catch (e) {
      this.logger.error(`Fallo el export de tienda: ${(e as Error).message}`);
    }
  }
}
```

- [ ] **Step 3: Módulo**

`apps/api/src/modules/store-export/store-export.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ProductImagesModule } from '../product-images/product-images.module';
import { StoreExportService } from './store-export.service';
import { StoreExportController } from './store-export.controller';
import { StoreExportCron } from './store-export.cron';

@Module({
  imports: [ProductImagesModule], // provee SpacesService (exportado en Task A2)
  controllers: [StoreExportController],
  providers: [StoreExportService, StoreExportCron],
  exports: [StoreExportService],
})
export class StoreExportModule {}
```

- [ ] **Step 4: Registrar en `app.module.ts`**

En `apps/api/src/app.module.ts` importar y agregar `StoreExportModule` al array `imports`:

```typescript
import { StoreExportModule } from './modules/store-export/store-export.module';
// ... en imports: [ ..., StoreExportModule ]
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @trinity/api exec tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 6: Prueba funcional (local, Trinity corriendo)**

Levantar el API con el entorno cargado (memoria `api-carga-env-cwd`: desde la raíz `set -a; . ./.env; set +a` y `pnpm --filter @trinity/api start`). Marcar 2-3 productos como `showInStore` en la BD local:

```bash
psql "$DATABASE_URL" -c "UPDATE \"Product\" SET \"showInStore\"=true, \"storeFeatured\"=true WHERE code IN ('CODE1','CODE2','CODE3');"
# forzar export (con token ADMIN):
curl -s -X POST http://localhost:4000/store-export/run -H "Authorization: Bearer $ADMIN_JWT" | head -c 300
# leer el snapshot del CDN (URL = SPACES_CDN_BASE/store/catalog.json)
curl -s "$SPACES_CDN_BASE/store/catalog.json" | head -c 800
```

Expected: `run` devuelve `{ products, categories, brands, generatedAt }`; `catalog.json` en el CDN trae los productos con `slug/priceUsd/priceBs/stockStatus/image`. Cambiar un stock a 3 y re-exportar → ese producto pasa a `stockStatus: "pocas"`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/store-export apps/api/src/app.module.ts
git commit -m "feat: export de tienda a Spaces (trigger manual /store-export/run + cron 10min)"
```

---

### Task A5: UI para marcar `showInStore` / `storeFeatured`

**Contexto:** el personal necesita elegir qué productos salen a la tienda. Se agregan 2 toggles al formulario de producto y se aceptan en el DTO/backend.

**Files:**
- Modify: `apps/api/src/modules/products/dto/*.ts` (Create/Update DTO — agregar campos opcionales)
- Modify: `apps/web/.../catalog/products` (form de producto — agregar 2 checkboxes)

- [ ] **Step 1: DTO acepta los flags**

Localizar el DTO de creación/edición de producto:

```bash
grep -rln "class .*ProductDto" apps/api/src/modules/products/dto
```

En el/los DTO agregar (con validación class-validator):

```typescript
  @IsOptional()
  @IsBoolean()
  showInStore?: boolean;

  @IsOptional()
  @IsBoolean()
  storeFeatured?: boolean;
```

Confirmar que el service pasa `dto` completo a `prisma.product.create/update` (si usa `data: dto` los campos fluyen solos; si mapea campo por campo, agregarlos).

- [ ] **Step 2: Checkboxes en el form de producto**

Localizar el modal/página de edición de producto:

```bash
grep -rln "gananciaPct\|priceDetal" apps/web/app | grep -i product | head
```

Agregar en el form dos checkboxes atados al estado del producto (junto a `isActive`):

```tsx
<label className="flex items-center gap-2">
  <input type="checkbox" checked={form.showInStore ?? false}
    onChange={(e) => setForm({ ...form, showInStore: e.target.checked })} />
  Mostrar en tienda online
</label>
<label className="flex items-center gap-2">
  <input type="checkbox" checked={form.storeFeatured ?? false}
    onChange={(e) => setForm({ ...form, storeFeatured: e.target.checked })} />
  Destacado en tienda
</label>
```

Incluir `showInStore`/`storeFeatured` en el payload que se envía a `POST/PATCH /products`.

- [ ] **Step 3: Typecheck (API + Web)**

```bash
pnpm --filter @trinity/api exec tsc --noEmit
pnpm --filter @trinity/web exec tsc --noEmit
```

Expected: 0 errores en ambos.

- [ ] **Step 4: Prueba funcional**

Editar un producto en `/catalog/products`, marcar "Mostrar en tienda online" y guardar. En la BD confirmar `showInStore=true`. Forzar `/store-export/run` y verificar que aparece en `catalog.json`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/products apps/web
git commit -m "feat: toggles showInStore/storeFeatured en el form de producto"
```

---

# PARTE B — Vitrina: leer el snapshot del CDN

> Todo en `C:\Users\Diego\Desktop\trebol-shop`. **Regla de oro:** no cambiar las **firmas** de `lib/db.ts`.
> **Entregable de la Parte B:** la tienda renderiza el catálogo real de Trinity desde el CDN, con stock en 3 niveles.

### Task B1: Config de marketing (`lib/store-config.ts`)

**Contexto:** iconos de categoría, logos/país de marca, banners y hero son *chrome* y no viven en Trinity. Se migran de la BD de la tienda a un archivo estático keyed por slug.

**Files:**
- Create: `lib/store-config.ts`

- [ ] **Step 1: Exportar la curación previa desde la BD actual de la tienda (una sola vez)**

Antes de borrar la BD (Task B5), volcar iconos/descripciones/logos actuales para no perderlos:

```bash
# en el repo de la tienda, con la BD aún conectada:
npx tsx -e "import{prisma}from'./lib/prisma';(async()=>{console.log(JSON.stringify({cats:await prisma.category.findMany(),brands:await prisma.brand.findMany(),banners:await prisma.banner.findMany({where:{active:true}})},null,2))})()" > /tmp/curacion.json
```

- [ ] **Step 2: Crear `lib/store-config.ts` con esos datos**

Usar `/tmp/curacion.json` para llenar los mapas (keyed por el slug que genera Trinity = `slugify(name)`):

```typescript
// Curación de presentación de la tienda (NO catálogo — eso viene de Trinity).
export type CategoryChrome = { icon: string; description?: string }
export type BrandChrome = { logo?: string; country?: string; color?: string; description?: string }
export type Banner = {
  id: string; title: string; subtitle?: string; tag?: string
  imageUrl: string; linkUrl?: string; linkLabel?: string; order: number
}

// key = slug de la categoría (slugify del nombre en Trinity)
export const CATEGORY_CHROME: Record<string, CategoryChrome> = {
  'herramientas-electricas': { icon: 'Drill', description: 'Taladros, esmeriles y más' },
  // ...volcar desde /tmp/curacion.json...
}

export const BRAND_CHROME: Record<string, BrandChrome> = {
  'bosch': { country: 'Alemania', logo: 'https://.../bosch.png' },
  // ...
}

export const BANNERS: Banner[] = [
  // ...volcar los banners activos...
]

export function categoryChrome(slug: string): CategoryChrome {
  return CATEGORY_CHROME[slug] ?? { icon: 'Package' }
}
export function brandChrome(slug: string): BrandChrome {
  return BRAND_CHROME[slug] ?? {}
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/store-config.ts
git commit -m "feat: store-config (iconos/logos/banners de presentacion, ex-BD)"
```

---

### Task B2: Cliente del snapshot + reescritura de `lib/db.ts`

**Files:**
- Create: `lib/snapshot.ts`
- Modify: `lib/db.ts` (reescritura completa; mismas firmas)
- Modify: `lib/data.ts` (agregar `stockStatus` al tipo `Product`)

- [ ] **Step 1: Tipo `Product` gana `stockStatus`**

En `lib/data.ts`, en `export type Product`, agregar el campo (y dejar `stock`/`available` por compatibilidad de la UI existente):

```typescript
  stockStatus: 'disponible' | 'pocas' | 'agotado'
```

- [ ] **Step 2: Cliente del snapshot `lib/snapshot.ts`**

```typescript
import { cache } from 'react'

const CDN = process.env.NEXT_PUBLIC_STORE_CDN // ej: https://trinity-inversiones.nyc3.cdn.digitaloceanspaces.com

export type SnapshotProduct = {
  slug: string; code: string; name: string; description: string
  priceUsd: number; priceBs: number
  stockStatus: 'disponible' | 'pocas' | 'agotado'
  image: string | null; thumb: string | null
  categorySlug: string | null; brandSlug: string | null; featured: boolean
}
export type Catalog = { generatedAt: string; rate: number; products: SnapshotProduct[] }
export type Meta = {
  generatedAt: string; rate: number
  categories: { slug: string; name: string; productCount: number }[]
  brands: { slug: string; name: string; productCount: number }[]
}

const EMPTY_CATALOG: Catalog = { generatedAt: '', rate: 0, products: [] }
const EMPTY_META: Meta = { generatedAt: '', rate: 0, categories: [], brands: [] }

// ISR: revalida cada 5 min. `cache()` dedupe dentro del mismo render.
export const getCatalog = cache(async function getCatalog(): Promise<Catalog> {
  if (!CDN) return EMPTY_CATALOG
  try {
    const res = await fetch(`${CDN}/store/catalog.json`, { next: { revalidate: 300 } })
    if (!res.ok) return EMPTY_CATALOG
    return (await res.json()) as Catalog
  } catch { return EMPTY_CATALOG }
})

export const getMeta = cache(async function getMeta(): Promise<Meta> {
  if (!CDN) return EMPTY_META
  try {
    const res = await fetch(`${CDN}/store/meta.json`, { next: { revalidate: 300 } })
    if (!res.ok) return EMPTY_META
    return (await res.json()) as Meta
  } catch { return EMPTY_META }
})
```

- [ ] **Step 3: Reescribir `lib/db.ts` (mismas firmas, ahora sobre el snapshot)**

Reemplazar TODO el contenido de `lib/db.ts` por:

```typescript
import { cache } from 'react'
import type { Category, Brand, Product } from './data'
import { getCatalog, getMeta, type SnapshotProduct } from './snapshot'
import { categoryChrome, brandChrome, BANNERS } from './store-config'

function mapProduct(p: SnapshotProduct): Product {
  const available = p.stockStatus !== 'agotado'
  return {
    id: p.code,           // el code es el identificador estable (ex-cuid)
    name: p.name,
    slug: p.slug,
    sku: p.code,
    price: p.priceUsd,
    stock: p.stockStatus === 'agotado' ? 0 : 1, // compat; la UI usa stockStatus
    stockStatus: p.stockStatus,
    description: p.description,
    image: p.image,
    featured: p.featured,
    available,
    categoryId: p.categorySlug ?? '',
    brandId: p.brandSlug ?? '',
    category: p.categorySlug ? { id: p.categorySlug, name: '', slug: p.categorySlug, icon: categoryChrome(p.categorySlug).icon } : null,
    brand: p.brandSlug ? { id: p.brandSlug, name: '', slug: p.brandSlug, logo: brandChrome(p.brandSlug).logo ?? null } : null,
  }
}

// ─── CATEGORÍAS ───
export const getAllCategories = cache(async function getAllCategories(): Promise<Category[]> {
  const meta = await getMeta()
  return meta.categories.map((c) => ({
    id: c.slug, name: c.name, slug: c.slug,
    icon: categoryChrome(c.slug).icon,
    description: categoryChrome(c.slug).description ?? '',
    productCount: c.productCount,
  }))
})

export const getCategoryBySlug = cache(async function getCategoryBySlug(slug: string) {
  const [meta, catalog] = await Promise.all([getMeta(), getCatalog()])
  const c = meta.categories.find((x) => x.slug === slug)
  if (!c) return null
  const products = catalog.products.filter((p) => p.categorySlug === slug).map(mapProduct)
  return {
    id: c.slug, name: c.name, slug: c.slug,
    icon: categoryChrome(c.slug).icon,
    description: categoryChrome(c.slug).description ?? '',
    productCount: c.productCount, products,
  }
})

// ─── MARCAS ───
export const getAllBrands = cache(async function getAllBrands(): Promise<Brand[]> {
  const meta = await getMeta()
  return meta.brands.map((b) => {
    const ch = brandChrome(b.slug)
    return { id: b.slug, name: b.name, slug: b.slug, description: ch.description ?? '',
      logo: ch.logo ?? null, color: ch.color ?? null, country: ch.country ?? '', productCount: b.productCount }
  })
})

export const getBrandBySlug = cache(async function getBrandBySlug(slug: string) {
  const [meta, catalog] = await Promise.all([getMeta(), getCatalog()])
  const b = meta.brands.find((x) => x.slug === slug)
  if (!b) return null
  const ch = brandChrome(b.slug)
  const products = catalog.products.filter((p) => p.brandSlug === slug).map(mapProduct)
  return { id: b.slug, name: b.name, slug: b.slug, description: ch.description ?? '',
    logo: ch.logo ?? null, color: ch.color ?? null, country: ch.country ?? '', productCount: b.productCount, products }
})

// ─── PRODUCTOS ───
export async function getAllProducts(): Promise<Product[]> {
  const c = await getCatalog()
  return c.products.map(mapProduct)
}
export async function getFeaturedProducts(): Promise<Product[]> {
  const c = await getCatalog()
  return c.products.filter((p) => p.featured).map(mapProduct)
}
export const getProductBySlug = cache(async function getProductBySlug(slug: string): Promise<Product | null> {
  const c = await getCatalog()
  const p = c.products.find((x) => x.slug === slug)
  return p ? mapProduct(p) : null
})
export async function getRelatedProducts(categorySlug: string, excludeSlug: string, limit = 4): Promise<Product[]> {
  const c = await getCatalog()
  return c.products.filter((p) => p.categorySlug === categorySlug && p.slug !== excludeSlug).slice(0, limit).map(mapProduct)
}
export async function searchProducts(query: string): Promise<Product[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const c = await getCatalog()
  return c.products
    .filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    .slice(0, 40).map(mapProduct)
}

// ─── BANNERS (config estático) ───
export async function getActiveBanners() {
  return [...BANNERS].sort((a, b) => a.order - b.order)
}
```

> Nota: `getRelatedProducts`/`getProductBySlug` cambian el **tipo de argumento** de `categoryId`/`excludeId` (cuid) a slug, pero mantienen **nombre y aridad**. Verificar los call-sites en `app/(shop)/productos/[slug]/page.tsx`: hoy pasan `product.categoryId` y `product.id` — con el nuevo `mapProduct`, `categoryId` = `categorySlug` y `id` = `code`, así que la llamada sigue funcionando pasando `product.categoryId, product.slug`. Ajustar ese call-site a `getRelatedProducts(product.categoryId, product.slug)`.

- [ ] **Step 4: `createOrder` sale de `lib/db.ts`**

`createOrder` se elimina de `lib/db.ts` (el pedido ahora va a Trinity — Task C3). Su call-site (`app/api/orders/route.ts`) se reescribe en la Parte C.

- [ ] **Step 5: Env var**

Crear/editar `.env.example`:

```
# CDN de Spaces donde Trinity publica el snapshot del catálogo
NEXT_PUBLIC_STORE_CDN="https://trinity-inversiones.nyc3.cdn.digitaloceanspaces.com"
# API de Trinity para enviar pedidos
TRINITY_API_URL="https://api.inversiones.eltrebol.app"
```

- [ ] **Step 6: Typecheck**

```bash
cd C:\Users\Diego\Desktop\trebol-shop && npx tsc --noEmit
```

Expected: 0 errores (salvo los call-sites de `getRelatedProducts` y `app/api/orders` que se ajustan aquí y en C3).

- [ ] **Step 7: Commit**

```bash
git add lib/snapshot.ts lib/db.ts lib/data.ts .env.example "app/(shop)/productos/[slug]/page.tsx"
git commit -m "feat: leer catalogo desde snapshot CDN de Trinity (reescribe lib/db)"
```

---

### Task B3: Stock en 3 niveles en la UI

**Files:**
- Modify: `components/products/ProductCard.tsx`
- Modify: `app/(shop)/productos/[slug]/ProductDetailClient.tsx`

- [ ] **Step 1: ProductCard — badges y texto desde `stockStatus`**

Reemplazar el bloque de badges de stock (hoy usa `product.stock <= 5`, etc.) por lógica sobre `stockStatus`:

```tsx
{product.featured && <span className="badge badge-green text-[10px]">Destacado</span>}
{product.stockStatus === 'pocas' && <span className="badge badge-orange text-[10px]">Pocas unidades</span>}
{product.stockStatus === 'agotado' && <span className="badge badge-red text-[10px]">Agotado</span>}
```

Y el texto bajo el precio (hoy `${product.stock} disponibles`) por:

```tsx
{product.stockStatus === 'disponible' && <p className="text-[10px] text-brand-600">Disponible</p>}
{product.stockStatus === 'pocas' && <p className="text-[10px] text-orange-500">Pocas unidades</p>}
{product.stockStatus === 'agotado' && <p className="text-[10px] text-red-500">Agotado</p>}
```

El botón "Agregar" mantiene `disabled={product.stockStatus === 'agotado'}`.

- [ ] **Step 2: ProductDetailClient — `stockStatus` de 3 ramas**

Localizar el `const stockStatus = ...` (usa `product.stock`) y reemplazar por 3 ramas basadas en `product.stockStatus`:

```tsx
const stockUi =
  product.stockStatus === 'agotado'
    ? { label: 'Agotado', color: 'text-red-600', icon: XCircle }
    : product.stockStatus === 'pocas'
    ? { label: 'Pocas unidades', color: 'text-orange-600', icon: AlertTriangle }
    : { label: 'Disponible', color: 'text-brand-600', icon: CheckCircle }
```

Usar `stockUi.label/color/icon` donde antes se usaba el objeto viejo. Mantener el botón deshabilitado si `agotado`.

- [ ] **Step 3: Typecheck**

```bash
cd C:\Users\Diego\Desktop\trebol-shop && npx tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add "components/products/ProductCard.tsx" "app/(shop)/productos/[slug]/ProductDetailClient.tsx"
git commit -m "feat: stock en 3 niveles (Disponible/Pocas unidades/Agotado) sin numero exacto"
```

---

### Task B4: Fotos de Spaces directo (bypass Cloudinary)

**Files:**
- Modify: `lib/utils.ts`

- [ ] **Step 1: `cloudinaryUrl` deja pasar URLs de Spaces**

En `lib/utils.ts`, al inicio de `cloudinaryUrl(src)`:

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

Confirmar que `next.config.mjs` permite el host de Spaces (hoy `remotePatterns` con `'**'` — ok).

- [ ] **Step 2: Typecheck + commit**

```bash
cd C:\Users\Diego\Desktop\trebol-shop && npx tsc --noEmit
git add lib/utils.ts
git commit -m "fix: servir fotos de Spaces directo del CDN"
```

---

### Task B5: Eliminar BD y admin de la tienda

**Contexto:** con Trinity como fuente de verdad, la BD propia y el panel `/admin` son redundantes. Se eliminan (tras haber volcado la curación en B1).

**Files:**
- Delete: `prisma/`, `app/admin/`, `app/api/auth/`, `lib/admin-actions.ts`, `lib/admin-db.ts`, `lib/auth.ts`, `lib/prisma.ts`, `middleware.ts`, `types/next-auth.d.ts`
- Modify: `package.json` (quitar deps), `components/layout/Footer.tsx` (si importa de `lib/db` algo removido)

- [ ] **Step 1: Confirmar que nada de `app/(shop)` importa lo que se borra**

```bash
grep -rn "lib/prisma\|lib/admin\|lib/auth\|next-auth\|@prisma/client" app/\(shop\) components lib/db.ts lib/snapshot.ts lib/utils.ts
```

Expected: sin resultados (la parte pública ya no depende de Prisma/auth). Si `components/layout/Footer.tsx` importa `getAllCategories` de `lib/db`, sigue válido (ahora viene del snapshot) — no se toca.

- [ ] **Step 2: Borrar**

```bash
cd C:\Users\Diego\Desktop\trebol-shop
rm -rf prisma app/admin app/api/auth lib/admin-actions.ts lib/admin-db.ts lib/auth.ts lib/prisma.ts middleware.ts types/next-auth.d.ts
```

- [ ] **Step 3: Quitar deps y scripts de BD del `package.json`**

Quitar de `dependencies`: `@prisma/client`, `prisma`, `pg`, `bcryptjs`, `next-auth`, `recharts`. De `devDependencies`: `@types/bcryptjs`, `tsx` (si ya no se usa). Quitar los scripts `db:*` y el `prisma generate` del `build` (dejar `"build": "next build"`).

```bash
npm install   # regenera lock sin las deps borradas
```

- [ ] **Step 4: Typecheck (debe seguir en 0)**

```bash
npx tsc --noEmit
```

Expected: 0 errores. Si algún archivo residual referencia lo borrado, eliminarlo o ajustarlo.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: eliminar BD y admin de la tienda (Trinity es la fuente de verdad)"
```

---

# PARTE C — Pedidos online

> **Entregable de la Parte C:** el comprador hace un pedido → se guarda en Trinity como `OnlineOrder` (no pre-factura) → el encargado lo ve y verifica el Pago Móvil.

### Task C1: Modelo `OnlineOrder` + migración

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260707190000_online_orders/migration.sql`
- Modify: `deploy/fix-schema.sql`

- [ ] **Step 1: Modelos en el schema**

Agregar al final de `schema.prisma`:

```prisma
enum OnlineOrderStatus {
  POR_VERIFICAR
  CONFIRMADO
  FACTURADO
  CANCELADO
}

model OnlineOrder {
  id             String            @id @default(cuid())
  number         String            @unique              // WEB-0001
  customerName   String
  phone          String
  cedula         String?
  deliveryMethod String            @default("PICKUP")   // PICKUP | DELIVERY
  address        String?
  paymentRef     String?                                // referencia de Pago Móvil que dice el cliente
  notes          String?
  totalUsd       Float             @default(0)
  totalBs        Float             @default(0)
  exchangeRate   Float             @default(0)
  status         OnlineOrderStatus @default(POR_VERIFICAR)
  verifiedById   String?
  verifiedAt     DateTime?
  invoiceId      String?                                // se llena cuando se factura (Fase 2)
  items          OnlineOrderItem[]
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
}

model OnlineOrderItem {
  id        String      @id @default(cuid())
  orderId   String
  order     OnlineOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  code      String                                      // Product.code
  name      String                                      // snapshot del nombre
  quantity  Float
  priceUsd  Float                                       // precio recalculado por Trinity
  priceBs   Float
}
```

- [ ] **Step 2: Migración idempotente**

`packages/database/prisma/migrations/20260707190000_online_orders/migration.sql`:

```sql
DO $$ BEGIN
  CREATE TYPE "OnlineOrderStatus" AS ENUM ('POR_VERIFICAR','CONFIRMADO','FACTURADO','CANCELADO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "OnlineOrder" (
  "id" TEXT PRIMARY KEY,
  "number" TEXT NOT NULL UNIQUE,
  "customerName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "cedula" TEXT,
  "deliveryMethod" TEXT NOT NULL DEFAULT 'PICKUP',
  "address" TEXT,
  "paymentRef" TEXT,
  "notes" TEXT,
  "totalUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" "OnlineOrderStatus" NOT NULL DEFAULT 'POR_VERIFICAR',
  "verifiedById" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "invoiceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "OnlineOrderItem" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL REFERENCES "OnlineOrder"("id") ON DELETE CASCADE,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "priceUsd" DOUBLE PRECISION NOT NULL,
  "priceBs" DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS "OnlineOrderItem_orderId_idx" ON "OnlineOrderItem" ("orderId");
```

- [ ] **Step 3: Espejo en `deploy/fix-schema.sql`** — pegar el mismo SQL del Step 2 al final (todo es `IF NOT EXISTS` / `EXCEPTION`).

- [ ] **Step 4: Migrar + generar + typecheck**

```bash
pnpm --filter @trinity/database exec prisma migrate dev --name online_orders
pnpm --filter @trinity/database exec prisma generate
pnpm --filter @trinity/api exec tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma deploy/fix-schema.sql
git commit -m "feat: modelo OnlineOrder (pedidos de la tienda, no pre-factura)"
```

---

### Task C2: `PublicModule` — `POST /public/orders` (+ hardening)

**Files:**
- Create: `apps/api/src/modules/public/public.service.ts`
- Create: `apps/api/src/modules/public/public.controller.ts`
- Create: `apps/api/src/modules/public/dto/create-order.dto.ts`
- Create: `apps/api/src/modules/public/public.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts` (helmet + compression + CORS tienda)
- Modify: `apps/api/package.json` (deps `@nestjs/throttler`, `helmet`, `compression`)

- [ ] **Step 1: Instalar deps de hardening**

```bash
pnpm --filter @trinity/api add @nestjs/throttler helmet compression
pnpm --filter @trinity/api add -D @types/compression
```

- [ ] **Step 2: DTO del pedido**

`apps/api/src/modules/public/dto/create-order.dto.ts`:

```typescript
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested, IsNumber, Min, ArrayNotEmpty } from 'class-validator';

export class OrderItemDto {
  @IsString() @IsNotEmpty()
  code: string;

  @IsNumber() @Min(0.001)
  quantity: number;
}

export class CreateOrderDto {
  @IsString() @IsNotEmpty()
  customerName: string;

  @IsString() @IsNotEmpty()
  phone: string; // obligatorio (regla del POS)

  @IsOptional() @IsString()
  cedula?: string;

  @IsIn(['PICKUP', 'DELIVERY'])
  deliveryMethod: string;

  @IsOptional() @IsString()
  address?: string;

  @IsOptional() @IsString()
  paymentRef?: string;

  @IsOptional() @IsString()
  notes?: string;

  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
```

- [ ] **Step 3: Servicio (recalcula precios desde Trinity, correlativo WEB-0001)**

`apps/api/src/modules/public/public.service.ts`:

```typescript
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class PublicService {
  constructor(private prisma: PrismaService) {}

  async createOrder(dto: CreateOrderDto) {
    const codes = Array.from(new Set(dto.items.map((i) => i.code.trim()).filter(Boolean)));
    if (codes.length === 0) throw new BadRequestException('El pedido no tiene productos');

    const rateRow = await this.prisma.exchangeRate.findFirst({ orderBy: { date: 'desc' } });
    const rate = rateRow?.rate ?? 0;

    const products = await this.prisma.product.findMany({
      where: { code: { in: codes }, isActive: true, showInStore: true },
      select: { code: true, name: true, priceDetal: true },
    });
    const byCode = new Map(products.map((p) => [p.code, p]));

    // Construir items con precios RECALCULADOS por Trinity (nunca confiar en el cliente).
    const items = dto.items.map((i) => {
      const p = byCode.get(i.code.trim());
      if (!p) throw new BadRequestException(`Producto no disponible: ${i.code}`);
      const priceUsd = p.priceDetal;
      return {
        code: p.code,
        name: p.name,
        quantity: i.quantity,
        priceUsd,
        priceBs: Math.round(priceUsd * rate * 100) / 100,
      };
    });

    const totalUsd = Math.round(items.reduce((s, i) => s + i.priceUsd * i.quantity, 0) * 100) / 100;
    const totalBs = Math.round(totalUsd * rate * 100) / 100;

    return this.prisma.$transaction(async (tx) => {
      // Correlativo WEB-0001 con SELECT FOR UPDATE (regla de correlativos del proyecto).
      const res = await tx.$queryRaw<{ max: number | null }[]>`
        SELECT MAX(CAST(SPLIT_PART("number", '-', 2) AS INTEGER)) as max FROM (
          SELECT "number" FROM "OnlineOrder" WHERE "number" IS NOT NULL FOR UPDATE
        ) sub
      `;
      const next = (res[0]?.max || 0) + 1;
      const number = `WEB-${next.toString().padStart(4, '0')}`;

      const order = await tx.onlineOrder.create({
        data: {
          number,
          customerName: dto.customerName.trim(),
          phone: dto.phone.trim(),
          cedula: dto.cedula?.trim() || null,
          deliveryMethod: dto.deliveryMethod,
          address: dto.address?.trim() || null,
          paymentRef: dto.paymentRef?.trim() || null,
          notes: dto.notes?.trim() || null,
          totalUsd, totalBs, exchangeRate: rate,
          items: { create: items },
        },
      });
      return { number: order.number, totalUsd, totalBs };
    });
  }
}
```

- [ ] **Step 4: Controlador público (sin auth, con rate-limit)**

`apps/api/src/modules/public/public.controller.ts`:

```typescript
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { PublicService } from './public.service';
import { CreateOrderDto } from './dto/create-order.dto';

@ApiTags('Public')
@Controller('public')
@UseGuards(ThrottlerGuard)
export class PublicController {
  constructor(private service: PublicService) {}

  // POST /public/orders — máx 10 pedidos/min por IP
  @Post('orders')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async createOrder(@Body() dto: CreateOrderDto) {
    return this.service.createOrder(dto);
  }
}
```

- [ ] **Step 5: Módulo + registro**

`apps/api/src/modules/public/public.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }])],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
```

En `app.module.ts`, importar y agregar `PublicModule` a `imports`.

- [ ] **Step 6: helmet + compression + CORS de la tienda en `main.ts`**

En `apps/api/src/main.ts`, tras crear `app`:

```typescript
import helmet from 'helmet';
import * as compression from 'compression';
// ...
app.use(helmet());
app.use(compression());
```

Y ampliar el CORS para incluir el dominio de la tienda sin romper el del ERP. Reemplazar el `enableCors` actual por una lista basada en env:

```typescript
const allowed = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',').map((s) => s.trim()).filter(Boolean);
app.enableCors({ origin: allowed, credentials: true });
```

Y en el `.env` de cada server agregar el dominio de la tienda a `CORS_ORIGIN` (separado por coma). Documentarlo en el commit.

- [ ] **Step 7: Typecheck + prueba funcional**

```bash
pnpm --filter @trinity/api exec tsc --noEmit
```

Expected: 0 errores. Con el API corriendo y un `code` real marcado `showInStore`:

```bash
curl -s -X POST http://localhost:4000/public/orders -H "Content-Type: application/json" \
  -d '{"customerName":"Juan","phone":"04141234567","deliveryMethod":"PICKUP","items":[{"code":"CODE1","quantity":2}]}'
```

Expected: `{ "number": "WEB-0001", "totalUsd": ..., "totalBs": ... }`. Verificar en BD que el `OnlineOrder` quedó `POR_VERIFICAR` con el precio recalculado (no el que mande el cliente). Enviar 11 requests en <1 min → el #11 responde 429 (rate-limit).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/public apps/api/src/app.module.ts apps/api/src/main.ts apps/api/package.json
git commit -m "feat: POST /public/orders (OnlineOrder) + throttler/helmet/compression + CORS tienda"
```

---

### Task C3: La tienda envía el pedido a Trinity

**Files:**
- Modify: `C:\Users\Diego\Desktop\trebol-shop\app\api\orders\route.ts`
- Modify: `C:\Users\Diego\Desktop\trebol-shop\app\(shop)\checkout\CheckoutClient.tsx` (si arma el payload con precio; quitar precio del payload)

- [ ] **Step 1: Reescribir el route handler para hacer proxy a Trinity**

`app/api/orders/route.ts`:

```typescript
import { NextResponse } from 'next/server'

const TRINITY = process.env.TRINITY_API_URL

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, phone, cedula, comments, tipo, items } = body

    if (!name?.trim() || !phone?.trim()) {
      return NextResponse.json({ error: 'Nombre y teléfono son requeridos' }, { status: 400 })
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'El pedido no tiene productos' }, { status: 400 })
    }
    if (!TRINITY) {
      return NextResponse.json({ error: 'Tienda no configurada (TRINITY_API_URL)' }, { status: 500 })
    }

    // Solo code + quantity — el precio y el total los pone Trinity.
    const payload = {
      customerName: name.trim(),
      phone: phone.trim(),
      cedula: cedula?.trim() || undefined,
      deliveryMethod: tipo === 'DELIVERY' ? 'DELIVERY' : 'PICKUP',
      notes: comments?.trim() || undefined,
      items: items.map((i: { sku?: string; code?: string; quantity: number }) => ({
        code: i.code ?? i.sku,          // en la tienda el SKU es el code de Trinity
        quantity: Number(i.quantity),
      })),
    }

    const res = await fetch(`${TRINITY}/public/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: data?.message || 'No se pudo registrar el pedido' }, { status: res.status })
    }
    return NextResponse.json({ orderNumber: data.number, totalUsd: data.totalUsd })
  } catch (error) {
    console.error('Error al crear pedido:', error)
    return NextResponse.json({ error: 'Error interno al enviar el pedido' }, { status: 500 })
  }
}
```

- [ ] **Step 2: El checkout manda `code` + `quantity` (no precio)**

En `CheckoutClient.tsx`, donde arma `items` del pedido, enviar `{ code: item.product.sku, quantity: item.quantity }` (el `sku` de la tienda = `code` de Trinity). Mostrar el `orderNumber` devuelto en la confirmación (ej. "Tu pedido WEB-0001 fue recibido, verificaremos tu Pago Móvil").

- [ ] **Step 3: Typecheck + prueba**

```bash
cd C:\Users\Diego\Desktop\trebol-shop && npx tsc --noEmit
```

Expected: 0 errores. Con `TRINITY_API_URL` apuntando a un Trinity local y un producto real, hacer un pedido desde el checkout → aparece `OnlineOrder` en Trinity.

- [ ] **Step 4: Commit**

```bash
git add "app/api/orders/route.ts" "app/(shop)/checkout/CheckoutClient.tsx"
git commit -m "feat: el checkout envia el pedido a Trinity /public/orders"
```

---

### Task C4: Pantalla en Trinity para verificar pedidos (`/store/orders`)

**Contexto:** el encargado ve los pedidos, verifica el Pago Móvil a mano y confirma. Sigue el patrón de listas/detalle existentes en Trinity (módulo de sección `store`).

**Files:**
- Create: `apps/api/src/modules/online-orders/online-orders.service.ts`
- Create: `apps/api/src/modules/online-orders/online-orders.controller.ts`
- Create: `apps/api/src/modules/online-orders/online-orders.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/web/app/store/orders/page.tsx` (+ detalle `[id]/page.tsx`)
- Modify: sidebar + `ROUTE_PERMISSION_MAP` (middleware) + `VALID_MODULES` (backend) para el módulo `store`

- [ ] **Step 1: Service (listar / detalle / confirmar / cancelar)**

`apps/api/src/modules/online-orders/online-orders.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OnlineOrdersService {
  constructor(private prisma: PrismaService) {}

  async findAll(status?: string) {
    return this.prisma.onlineOrder.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.onlineOrder.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return order;
  }

  async confirm(id: string, userId: string) {
    const order = await this.findOne(id);
    if (order.status !== 'POR_VERIFICAR') throw new BadRequestException('El pedido no está por verificar');
    return this.prisma.onlineOrder.update({
      where: { id },
      data: { status: 'CONFIRMADO', verifiedById: userId, verifiedAt: new Date() },
    });
  }

  async cancel(id: string) {
    const order = await this.findOne(id);
    if (order.status === 'FACTURADO') throw new BadRequestException('No se puede cancelar un pedido facturado');
    return this.prisma.onlineOrder.update({ where: { id }, data: { status: 'CANCELADO' } });
  }
}
```

- [ ] **Step 2: Controller (protegido por módulo `store`)**

`apps/api/src/modules/online-orders/online-orders.controller.ts`:

```typescript
import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ModuleGuard } from '../auth/guards/module.guard';
import { RequireModule } from '../auth/decorators/require-module.decorator';
import { OnlineOrdersService } from './online-orders.service';

@ApiTags('Online Orders')
@ApiBearerAuth()
@Controller('online-orders')
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('store')
export class OnlineOrdersController {
  constructor(private service: OnlineOrdersService) {}

  @Get()
  findAll(@Query('status') status?: string) { return this.service.findAll(status); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id/confirm')
  confirm(@Param('id') id: string, @Req() req: any) { return this.service.confirm(id, req.user.userId); }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) { return this.service.cancel(id); }
}
```

> Verificar los nombres/rutas reales de `ModuleGuard` y `@RequireModule` (usados en `products.controller.ts:80` y en el módulo `commands`):
> `grep -rn "RequireModule\|class ModuleGuard\|req.user" apps/api/src/modules/auth apps/api/src/modules/products/products.controller.ts`. Ajustar imports y el campo del user en el JWT (`req.user.userId` vs `req.user.id`).

- [ ] **Step 3: Módulo + registro** — crear `online-orders.module.ts` (controller + service), importar en `app.module.ts`.

- [ ] **Step 4: Registrar el módulo `store` en permisos**

- Backend: agregar `'store'` a `VALID_MODULES` (buscar: `grep -rn "VALID_MODULES" apps/api/src`).
- Middleware web: agregar la ruta `/store` → módulo `store` en `ROUTE_PERMISSION_MAP` (buscar en `apps/web/middleware.ts` o donde esté el mapa).
- Sidebar: agregar sección "TIENDA" → "Pedidos online" (`/store/orders`) gateada por módulo `store` (patrón idéntico al item `commands` de la Sesión 58).
- `/settings/role-permissions`: el módulo `store` aparece automáticamente si se lista desde `VALID_MODULES`; asignarlo a ADMIN/SUPERVISOR.

- [ ] **Step 5: Página de lista + detalle**

`apps/web/app/store/orders/page.tsx`: tabla de pedidos (número, fecha, cliente, teléfono, total USD/Bs, estado con badge), filtro por estado, tabs "Por verificar / Confirmados / Todos". Seguir el patrón de una lista existente (ej. `apps/web/app/commands/page.tsx` de la Sesión 58: fetch al API, badges de estado, auto-refresh). `document.title = 'Pedidos online | Trinity ERP'` (regla del proyecto). El detalle `[id]/page.tsx` muestra datos de contacto + items + la **referencia de Pago Móvil** que dio el cliente + botones "Confirmar pago" (`PATCH /online-orders/:id/confirm`) y "Cancelar" (`PATCH /online-orders/:id/cancel`). Título dinámico `${order.number} | Trinity ERP`.

- [ ] **Step 6: Typecheck (API + Web)**

```bash
pnpm --filter @trinity/api exec tsc --noEmit
pnpm --filter @trinity/web exec tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 7: Prueba funcional**

Crear un pedido (Task C2/C3), abrir `/store/orders` como ADMIN → aparece en "Por verificar". Abrir el detalle, "Confirmar pago" → pasa a CONFIRMADO con `verifiedAt`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/online-orders apps/api/src/app.module.ts apps/web/app/store apps/web/middleware.ts
git commit -m "feat: pantalla /store/orders para verificar pedidos online (modulo store)"
```

---

# PARTE D — Despliegue y verificación end-to-end

### Task D1: Despliegue (lo hace Diego, con autorización explícita — memoria `deploy-lo-hace-el-usuario`)

- [ ] **Trinity (inversiones):** push a `main` → en el server `ssh root@... "cd /opt/Trinity && git pull origin main && bash deploy.sh"`. `deploy.sh` corre las migraciones `20260707180000_product_store_flags` y `20260707190000_online_orders` + `fix-schema.sql`. Verificar:
  - `POST /store-export/run` (con JWT ADMIN) responde y `GET $SPACES_CDN_BASE/store/catalog.json` trae productos.
  - El cron de export queda activo (revisar logs PM2).
  - `POST /public/orders` con un `code` real crea el `OnlineOrder`.
- [ ] **Vitrina (Vercel):** setear `NEXT_PUBLIC_STORE_CDN` y `TRINITY_API_URL` en el proyecto; push a la rama que Vercel despliega. Verificar que el home/listado muestran los productos `showInStore` con foto/precio/`stockStatus`.
- [ ] **CORS:** confirmar que el dominio de la tienda quedó en `CORS_ORIGIN` del `.env` de inversiones.
- [ ] **Config post-deploy:** en Trinity marcar `showInStore` a un lote de productos (con foto) y `storeFeatured` a los del home; forzar `/store-export/run`.

### Task D2: Prueba integrada

- [ ] **Catálogo:** abrir la tienda pública → productos con foto de Trinity, precio actual y `Disponible/Pocas unidades/Agotado`. Cambiar un precio/stock en Trinity → tras el próximo export (≤10 min) + ISR (≤5 min) la tienda lo refleja.
- [ ] **Pedido:** hacer un pedido real desde la tienda → aparece en `/store/orders` como "Por verificar" con la referencia de Pago Móvil; confirmarlo.
- [ ] **Aislamiento del POS:** confirmar (logs/monitor) que navegar la tienda NO genera queries al API de Trinity (solo el CDN); únicamente el pedido pega a Trinity.

---

## Fuera de alcance (Fase 2+)

Ver spec §8: conversión automática `OnlineOrder → Invoice`, verificación automática de Pago Móvil, cuentas de cliente, admin de banners en Trinity, export event-driven, búsqueda con relevancia server-side.

---

## Self-review (hecho)

- **Cobertura del spec:** §2 arquitectura snapshot → Parte A (export) + B (lectura); §3 contratos JSON → A3 (`catalog.json`/`meta.json`); §3 stock 3 niveles → A3 (`stockStatus`) + B3 (UI); §4 schema flags → A1; §5 pedidos `OnlineOrder` → C1/C2 + pantalla C4; §6 refactor vitrina → B1-B5; §7 hardening (throttler/helmet/compression/CORS) → C2; §7 ISR → B2 (`revalidate:300`). Todo cubierto.
- **Sin placeholders:** el código de los servicios/DTO/migraciones está completo. Los únicos "verificar con grep" son rutas de decoradores/guards ya existentes en el repo (`@Roles`/`RolesGuard` en A4, `ModuleGuard`/`@RequireModule`/`req.user` en C4, `VALID_MODULES`/`ROUTE_PERMISSION_MAP` en C4) y los call-sites de la UI (form de producto A5, `CheckoutClient` C3) — se resuelven con el `grep` indicado antes de escribir, no son código inventado.
- **Consistencia de tipos:** `StoreProduct` (A3) ≡ `SnapshotProduct` (B2) — mismos campos (`slug/code/name/description/priceUsd/priceBs/stockStatus/image/thumb/categorySlug/brandSlug/featured`). `stockStatus` es el mismo union en Trinity (A3), snapshot (B2), tipo `Product` (B2 Step1) y UI (B3). `mapProduct` (B2) produce el `Product` que ya consumen `ProductCard`/páginas. `CreateOrderDto` (C2) ≡ payload del proxy de la tienda (C3): `customerName/phone/cedula/deliveryMethod/address/paymentRef/notes/items[{code,quantity}]`. Correlativo `WEB-000N` con el mismo patrón `SELECT FOR UPDATE` de `InventoryAdjustment`.
- **Firmas intactas en la vitrina:** las funciones de `lib/db.ts` conservan nombre/aridad → los componentes no cambian salvo B3 (textos de stock) y el call-site de `getRelatedProducts` (mismo nombre, args = slug/slug).
