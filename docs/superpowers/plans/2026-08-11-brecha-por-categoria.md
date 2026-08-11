# Brecha por categoría — Implementation Plan

> **For agentic workers:** implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`).
> **Verificación:** este repo NO tiene tests unitarios; se verifica con `npx tsc --noEmit` (API y Web) + prueba end-to-end local contra la BD (`total_db` en `trinity-postgres-1`, `allowNegativeStock=true`). Cada tarea termina con typecheck y (donde aplica) una comprobación en local. Commits frecuentes, SIN deploy (Diego despliega).

**Goal:** Permitir que cada categoría RAÍZ tenga su propia brecha; los productos de esa categoría (y sus subcategorías) usan esa brecha en vez de la global. Si la brecha de la raíz es 0, cae a la global (despliegue inofensivo: todas quedan en 0 → nada cambia hasta que Diego suba una).

**Architecture:** Se centraliza la resolución de la brecha en dos helpers puros (`common/pricing.ts`) + un resolver de árbol de categorías (`common/category-brega.ts`) que, caminando `parentId` hasta la raíz, da la brecha aplicable a cualquier `categoryId`. TODOS los ~13 call-sites que hoy duplican la fórmula `costo*(1+brecha/100)*...` se enrutan por esos helpers. Mientras `Category.bregaPct` sea 0 en todas partes, el comportamiento es idéntico al actual (refactor seguro y desplegable solo). Luego, poner brecha>0 a una categoría raíz activa la nueva rama sin tocar más código.

**Regla exacta (fijada por Diego):**
```
brechaEfectiva = bregaApplies ? (rootCategoryBregaPct > 0 ? rootCategoryBregaPct : bregaGlobalPct) : 0
```
- `bregaApplies=false` del producto SIEMPRE manda (nunca lleva brecha).
- Brecha SOLO en categorías raíz; subcategorías heredan de su raíz (coherente con `commissionPct`, que ya es root-only).
- Al cambiar la brecha de una categoría → recálculo AUTOMÁTICO solo de los productos de esa raíz + sus subcategorías, con `manualPrice:false` (los de precio manual no se tocan).

**Tech Stack:** NestJS + Prisma 5 (API), Next.js App Router (Web), PostgreSQL 16/15.

---

## File Structure

**Nuevos:**
- `apps/api/src/common/pricing.ts` — helpers puros: `resolveBregaPct`, `effectiveCost`, `computeSellingPrices`, `round2`.
- `apps/api/src/common/category-brega.ts` — `buildCategoryBregaMap(prisma)`: `Map<categoryId, rootBregaPct>`.
- `packages/database/prisma/migrations/2026081118XXXX_category_brega/migration.sql`

**Modificados (schema + config):**
- `packages/database/prisma/schema.prisma` — `Category.bregaPct Float @default(0)`
- `deploy/fix-schema.sql` — red de seguridad
- `apps/api/src/modules/categories/*` — DTO acepta `bregaPct`; update dispara recálculo

**Modificados (call-sites de la fórmula — se enrutan por los helpers):**
- `apps/api/src/modules/products/products.service.ts` (`calculatePrices`, `applyPriceAdjustment`)
- `apps/api/src/modules/company-config/company-config.service.ts` (`recalculateAllPrices`; nuevo `recalculateCategoryPrices`)
- `apps/api/src/modules/invoices/invoices.service.ts` (costo en factura: create ~L355, update ~L1297)
- `apps/api/src/modules/purchase-orders/purchase-orders.service.ts` (4 puntos: ~L776, L811, L944, L987)
- `apps/api/src/modules/inventory-replacements/inventory-replacements.service.ts` (~L328)
- `apps/api/src/modules/inventory-adjustments/inventory-adjustments.service.ts` (~L336)
- `apps/api/src/modules/inventory-adjustments/inventory-adjustments-pdf.service.ts` (~L47)
- `apps/api/src/modules/stock-movements/stock-movements.service.ts` (~L250)
- `apps/api/src/modules/dashboard/dashboard.service.ts` (~L654)
- `apps/api/src/modules/quotations/quotations.service.ts` (~L367)
- `apps/api/src/modules/integration/partner-transfers.service.ts` (~L126)
- `apps/api/src/modules/import/import.service.ts` (~L522)

**Modificados (frontend):**
- `apps/web/src/app/(dashboard)/catalog/categories/page.tsx` — input "Brecha %" en categorías raíz

> **Nota sobre IVA:** cada call-site usa hoy `IVA_MULTIPLIERS[ivaType]`. Los helpers reciben el multiplicador ya resuelto (no se mueve esa constante) para no cambiar imports masivamente.

---

## Task 1: Schema — columna `Category.bregaPct` (inofensiva, default 0)

**Files:**
- Modify: `packages/database/prisma/schema.prisma:457` (bloque `model Category`)
- Create: `packages/database/prisma/migrations/2026081118XXXX_category_brega/migration.sql`
- Modify: `deploy/fix-schema.sql` (sección de `Category`)

- [ ] **Step 1: Agregar el campo al modelo `Category`** (junto a `commissionPct`)

```prisma
  commissionPct     Float      @default(0)
  bregaPct          Float      @default(0)   // brecha propia (solo categorías RAÍZ; 0 = usar la global)
```

- [ ] **Step 2: Crear la migración** (aditiva e idempotente)

`packages/database/prisma/migrations/2026081118XXXX_category_brega/migration.sql`:
```sql
-- Brecha propia por categoría raíz. Aditiva e idempotente. Default 0 = usar la brecha global.
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "bregaPct" DOUBLE PRECISION NOT NULL DEFAULT 0;
```

- [ ] **Step 3: Red de seguridad en fix-schema.sql** — tras el bloque `CREATE TABLE IF NOT EXISTS "Category"` / sus índices, agregar:

```sql
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "bregaPct" DOUBLE PRECISION NOT NULL DEFAULT 0;
```

- [ ] **Step 4: Regenerar cliente Prisma + aplicar a la BD local**

```bash
cd packages/database && npx prisma generate
docker exec trinity-postgres-1 psql -U trebol -d total_db -c 'ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "bregaPct" DOUBLE PRECISION NOT NULL DEFAULT 0;'
```
Esperado: `ALTER TABLE`; `Generated Prisma Client`.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/2026081118XXXX_category_brega deploy/fix-schema.sql
git commit -m "feat(brecha-cat): columna Category.bregaPct (default 0, inofensiva)"
```

---

## Task 2: Helpers puros de pricing

**Files:**
- Create: `apps/api/src/common/pricing.ts`

- [ ] **Step 1: Crear `pricing.ts`**

```ts
// Helpers PUROS de cálculo de precios/brecha. Sin dependencias de Nest ni Prisma.
// Centralizan la fórmula que antes estaba duplicada en ~13 servicios.

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Brecha efectiva a aplicar a un producto.
 * Regla: si el producto no lleva brecha -> 0; si la categoría raíz tiene brecha>0 -> esa; si no -> la global.
 */
export function resolveBregaPct(args: {
  bregaApplies: boolean;
  categoryBregaPct: number; // brecha de la categoría RAÍZ del producto (0 si no tiene / no aplica)
  bregaGlobalPct: number;
}): number {
  if (!args.bregaApplies) return 0;
  return args.categoryBregaPct > 0 ? args.categoryBregaPct : (args.bregaGlobalPct || 0);
}

/** Costo efectivo = costo + brecha (para márgenes y reportes). NO incluye ganancia ni IVA. */
export function effectiveCost(costUsd: number, bregaPct: number): number {
  return costUsd * (1 + bregaPct / 100);
}

/** Precios de venta detal/mayor a partir del costo, brecha, ganancias y el multiplicador de IVA ya resuelto. */
export function computeSellingPrices(args: {
  costUsd: number;
  gananciaPct: number;
  gananciaMayorPct: number;
  ivaMultiplier: number;
  bregaPct: number;
}): { priceDetal: number; priceMayor: number } {
  const base = args.costUsd * (1 + args.bregaPct / 100);
  return {
    priceDetal: round2(base * (1 + args.gananciaPct / 100) * args.ivaMultiplier),
    priceMayor: round2(base * (1 + args.gananciaMayorPct / 100) * args.ivaMultiplier),
  };
}
```

- [ ] **Step 2: Typecheck API**

Run: `cd apps/api && npx tsc --noEmit`
Esperado: sin salida (limpio).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/common/pricing.ts
git commit -m "feat(brecha-cat): helpers puros de pricing (resolveBregaPct/effectiveCost/computeSellingPrices)"
```

---

## Task 3: Resolver de brecha por categoría (árbol → raíz)

**Files:**
- Create: `apps/api/src/common/category-brega.ts`

- [ ] **Step 1: Crear `category-brega.ts`**

```ts
import { PrismaService } from '../prisma/prisma.service';

/**
 * Construye un mapa categoryId -> brecha de su categoría RAÍZ.
 * Camina parentId hasta la raíz (memoizado). Las categorías son pocas (decenas): 1 sola query.
 * Uso: en cada call-site, categoryBregaPct = map.get(product.categoryId) ?? 0.
 */
export async function buildCategoryBregaMap(prisma: PrismaService): Promise<Map<string, number>> {
  const cats = await prisma.category.findMany({
    select: { id: true, parentId: true, bregaPct: true },
  });
  const byId = new Map(cats.map((c) => [c.id, c]));
  const cache = new Map<string, number>();

  function rootBrega(id: string | null): number {
    if (!id) return 0;
    const hit = cache.get(id);
    if (hit !== undefined) return hit;
    const c = byId.get(id);
    if (!c) return 0;
    // guard anti-ciclo: marca provisional en 0 mientras resuelve el padre
    cache.set(id, 0);
    const val = c.parentId ? rootBrega(c.parentId) : (c.bregaPct || 0);
    cache.set(id, val);
    return val;
  }

  const map = new Map<string, number>();
  for (const c of cats) map.set(c.id, rootBrega(c.id));
  return map;
}
```

- [ ] **Step 2: Typecheck API** — `cd apps/api && npx tsc --noEmit` → limpio.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/common/category-brega.ts
git commit -m "feat(brecha-cat): resolver de brecha por categoria (mapa categoryId->rootBregaPct)"
```

---

## Task 4: products.service — `calculatePrices` y `applyPriceAdjustment`

**Files:**
- Modify: `apps/api/src/modules/products/products.service.ts` (`calculatePrices` ~L100-118; sus 2 llamadas create ~L166 / update ~L534; `applyPriceAdjustment` ~L730-760)

- [ ] **Step 1: Imports** (arriba del archivo)

```ts
import { resolveBregaPct, computeSellingPrices } from '../../common/pricing';
import { buildCategoryBregaMap } from '../../common/category-brega';
```

- [ ] **Step 2: `calculatePrices` recibe la brecha de la categoría** — cambiar firma y cuerpo:

```ts
  private async calculatePrices(
    costUsd: number,
    gananciaPct: number,
    gananciaMayorPct: number,
    ivaType: IvaType,
    bregaApplies: boolean,
    categoryBregaPct: number, // brecha de la categoría RAÍZ del producto (0 si no tiene)
  ) {
    const config = await this.prisma.companyConfig.findUnique({ where: { id: 'singleton' } });
    const bregaPct = resolveBregaPct({
      bregaApplies,
      categoryBregaPct,
      bregaGlobalPct: config?.bregaGlobalPct || 0,
    });
    const { priceDetal, priceMayor } = computeSellingPrices({
      costUsd, gananciaPct, gananciaMayorPct,
      ivaMultiplier: IVA_MULTIPLIERS[ivaType], bregaPct,
    });
    return { priceDetal, priceMayor };
  }
```

- [ ] **Step 3: Llamada en `create`** — resolver la brecha de la categoría del DTO antes de llamar:

En el bloque `else` (~L165) que llama a `calculatePrices`, justo antes:
```ts
      const catMap = await buildCategoryBregaMap(this.prisma);
      const categoryBregaPct = dto.categoryId ? (catMap.get(dto.categoryId) ?? 0) : 0;
      const prices = await this.calculatePrices(
        dto.costUsd || 0,
        gananciaPct,
        gananciaMayorPct,
        dto.ivaType || IvaType.GENERAL,
        dto.bregaApplies !== false,
        categoryBregaPct,
      );
```

- [ ] **Step 4: Llamada en `update`** (~L534) — la categoría puede venir en el DTO o ser la existente:

```ts
      const catMap = await buildCategoryBregaMap(this.prisma);
      const categoryId = dto.categoryId ?? existing.categoryId;
      const categoryBregaPct = categoryId ? (catMap.get(categoryId) ?? 0) : 0;
      const prices = await this.calculatePrices(
        costUsd, gananciaPct, gananciaMayorPct, ivaType, bregaApplies, categoryBregaPct,
      );
```
(Asegurarse de que el `select`/objeto `existing` incluya `categoryId`. Si no lo trae, agregarlo al `findUnique`/select correspondiente.)

- [ ] **Step 5: `applyPriceAdjustment`** (~L730-760) — leer el código actual; sustituir la fórmula inline por el mapa + `computeSellingPrices`:

Patrón a aplicar (adaptar a las variables reales del método):
```ts
    const catMap = await buildCategoryBregaMap(this.prisma);
    // ...por cada producto p (que debe traer categoryId, costUsd, gananciaPct, gananciaMayorPct, ivaType, bregaApplies):
    const bregaPct = resolveBregaPct({
      bregaApplies: p.bregaApplies,
      categoryBregaPct: p.categoryId ? (catMap.get(p.categoryId) ?? 0) : 0,
      bregaGlobalPct: config?.bregaGlobalPct || 0,
    });
    const { priceDetal, priceMayor } = computeSellingPrices({
      costUsd: nuevoCosto, gananciaPct: p.gananciaPct, gananciaMayorPct: p.gananciaMayorPct,
      ivaMultiplier: IVA_MULTIPLIERS[p.ivaType], bregaPct,
    });
```
(Agregar `categoryId: true` al `select` de productos de ese método si falta.)

- [ ] **Step 6: Typecheck API** — `cd apps/api && npx tsc --noEmit` → limpio.

- [ ] **Step 7: Verificación en local (comportamiento IDÉNTICO, brecha aún 0 en todas las categorías)**

Crear/editar un producto por el endpoint y confirmar que `priceDetal`/`priceMayor` no cambian respecto al comportamiento previo (con la brecha global vigente). Si local tiene `bregaGlobalPct=0`, poner una global temporal y ver que aplica igual que antes.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/products/products.service.ts
git commit -m "feat(brecha-cat): products.service enruta por helpers (calculatePrices + applyPriceAdjustment)"
```

---

## Task 5: company-config — `recalculateAllPrices` + nuevo `recalculateCategoryPrices`

**Files:**
- Modify: `apps/api/src/modules/company-config/company-config.service.ts:48-72` y método `update`

- [ ] **Step 1: Imports**

```ts
import { resolveBregaPct, computeSellingPrices } from '../../common/pricing';
import { buildCategoryBregaMap } from '../../common/category-brega';
```

- [ ] **Step 2: `recalculateAllPrices` usa los helpers** — reemplazar cuerpo (L48-72):

```ts
  private async recalculateAllPrices(bregaGlobalPct: number) {
    const catMap = await buildCategoryBregaMap(this.prisma);
    const products = await this.prisma.product.findMany({
      where: { isActive: true, manualPrice: false },
      select: {
        id: true, costUsd: true, gananciaPct: true, gananciaMayorPct: true,
        ivaType: true, bregaApplies: true, categoryId: true,
      },
    });
    for (const p of products) {
      const bregaPct = resolveBregaPct({
        bregaApplies: p.bregaApplies,
        categoryBregaPct: p.categoryId ? (catMap.get(p.categoryId) ?? 0) : 0,
        bregaGlobalPct,
      });
      const { priceDetal, priceMayor } = computeSellingPrices({
        costUsd: p.costUsd, gananciaPct: p.gananciaPct, gananciaMayorPct: p.gananciaMayorPct,
        ivaMultiplier: IVA_MULTIPLIERS[p.ivaType], bregaPct,
      });
      await this.prisma.product.update({ where: { id: p.id }, data: { priceDetal, priceMayor } });
    }
  }
```

- [ ] **Step 3: Nuevo `recalculateCategoryPrices`** (recalcula una raíz + sus subcategorías). Añadir al servicio:

```ts
  /** Recalcula precios de los productos de una categoría RAÍZ y todas sus subcategorías (manualPrice:false). */
  async recalculateCategoryPrices(rootCategoryId: string) {
    const config = await this.prisma.companyConfig.findUnique({ where: { id: 'singleton' } });
    const catMap = await buildCategoryBregaMap(this.prisma);
    // Ids de la raíz + descendientes: todas las categorías cuyo root es rootCategoryId.
    const allCats = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
    const byId = new Map(allCats.map((c) => [c.id, c]));
    const rootOf = (id: string | null): string | null => {
      let cur = id;
      const seen = new Set<string>();
      while (cur && byId.get(cur)?.parentId && !seen.has(cur)) { seen.add(cur); cur = byId.get(cur)!.parentId!; }
      return cur;
    };
    const targetIds = allCats.filter((c) => rootOf(c.id) === rootCategoryId).map((c) => c.id);

    const products = await this.prisma.product.findMany({
      where: { isActive: true, manualPrice: false, categoryId: { in: targetIds } },
      select: {
        id: true, costUsd: true, gananciaPct: true, gananciaMayorPct: true,
        ivaType: true, bregaApplies: true, categoryId: true,
      },
    });
    for (const p of products) {
      const bregaPct = resolveBregaPct({
        bregaApplies: p.bregaApplies,
        categoryBregaPct: p.categoryId ? (catMap.get(p.categoryId) ?? 0) : 0,
        bregaGlobalPct: config?.bregaGlobalPct || 0,
      });
      const { priceDetal, priceMayor } = computeSellingPrices({
        costUsd: p.costUsd, gananciaPct: p.gananciaPct, gananciaMayorPct: p.gananciaMayorPct,
        ivaMultiplier: IVA_MULTIPLIERS[p.ivaType], bregaPct,
      });
      await this.prisma.product.update({ where: { id: p.id }, data: { priceDetal, priceMayor } });
    }
    return { updated: products.length };
  }
```

- [ ] **Step 4: Exportar el servicio** para que el módulo de categorías lo use — en `company-config.module.ts` asegurar `exports: [CompanyConfigService]` (agregar si falta).

- [ ] **Step 5: Typecheck API** → limpio.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/company-config/
git commit -m "feat(brecha-cat): recalculateAllPrices por helpers + recalculateCategoryPrices"
```

---

## Task 6: invoices.service — costo con brecha (create + update)

**Files:**
- Modify: `apps/api/src/modules/invoices/invoices.service.ts` (~L241-243 y L355-357 create; ~L1239-1241 y L1297-1298 update)

- [ ] **Step 1: Import** `import { resolveBregaPct, effectiveCost } from '../../common/pricing';` y `import { buildCategoryBregaMap } from '../../common/category-brega';`

- [ ] **Step 2: En `create`** — tras leer `config` (~L243), construir el mapa una vez:

```ts
    const bregaGlobalPct = config?.bregaGlobalPct || 0;
    const catBregaMap = await buildCategoryBregaMap(this.prisma);
```
Asegurar que el `product` de cada ítem traiga `categoryId` en su select.

- [ ] **Step 3: Sustituir el cálculo del costo** (~L355-357):

```ts
      // costUsd guardado en la factura = costo efectivo (con brecha si aplica). Clave para el margen.
      const bregaPct = resolveBregaPct({
        bregaApplies: product.bregaApplies,
        categoryBregaPct: product.categoryId ? (catBregaMap.get(product.categoryId) ?? 0) : 0,
        bregaGlobalPct,
      });
      const costUsd = effectiveCost(product.costUsd, bregaPct);
```

- [ ] **Step 4: Repetir en `update`** (~L1239-1298) con el mismo patrón (mapa + `resolveBregaPct` + `effectiveCost`).

- [ ] **Step 5: Typecheck API** → limpio.

- [ ] **Step 6: Verificación local** — facturar un producto y confirmar que el `costUsd` guardado en `InvoiceItem` es igual que antes (brecha 0 → costo crudo, o costo+global si hay global). El margen del dashboard debe cuadrar.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/invoices/invoices.service.ts
git commit -m "feat(brecha-cat): invoices usa costo efectivo por helpers (create+update)"
```

---

## Task 7: purchase-orders.service — 4 puntos de recálculo de precio

**Files:**
- Modify: `apps/api/src/modules/purchase-orders/purchase-orders.service.ts` (~L776-780, L811-814, L944-950, L987-991)

- [ ] **Step 1: Imports** (`resolveBregaPct, computeSellingPrices` + `buildCategoryBregaMap`).

- [ ] **Step 2: En cada uno de los 4 bloques**, construir el mapa una vez por método (donde ya se lee `config`/`bregaGlobalPct`) y reemplazar `const bregaPct = product.bregaApplies ? bregaGlobalPct : 0;` por:

```ts
        const bregaPct = resolveBregaPct({
          bregaApplies: product.bregaApplies,
          categoryBregaPct: product.categoryId ? (catBregaMap.get(product.categoryId) ?? 0) : 0,
          bregaGlobalPct,
        });
```
y las 2 líneas `priceDetal/priceMayor = round2(cost * (1+bregaPct/100) * ...)` por `computeSellingPrices({ costUsd: cost, gananciaPct, gananciaMayorPct, ivaMultiplier: IVA_MULTIPLIERS[...], bregaPct })`.

Añadir `categoryId: true` al `select` de productos (~L253 y los demás selects usados por esos métodos).

- [ ] **Step 3: Typecheck API** → limpio.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/purchase-orders/purchase-orders.service.ts
git commit -m "feat(brecha-cat): purchase-orders enruta los 4 recalculos por helpers"
```

---

## Task 8: Costo efectivo en servicios de solo-costo (dashboard, stock-movements, quotations)

**Files:**
- Modify: `dashboard.service.ts` (~L631-654), `stock-movements.service.ts` (~L222-251), `quotations.service.ts` (~L337-367)

- [ ] **Step 1:** En cada uno, importar `resolveBregaPct, effectiveCost` + `buildCategoryBregaMap`, construir el mapa donde se lee `bregaGlobalPct`, agregar `categoryId: true` al select del producto, y reemplazar la fórmula inline `bregaApplies ? cost*(1+bregaGlobalPct/100) : cost` por:

```ts
    const bregaPct = resolveBregaPct({
      bregaApplies: p.bregaApplies,
      categoryBregaPct: p.categoryId ? (catBregaMap.get(p.categoryId) ?? 0) : 0,
      bregaGlobalPct,
    });
    const costo = effectiveCost(p.costUsd, bregaPct);
```

- [ ] **Step 2: Typecheck API** → limpio.

- [ ] **Step 3: Commit** — `git commit -m "feat(brecha-cat): dashboard/stock-movements/quotations usan costo efectivo por helpers"`

---

## Task 9: Ajustes de inventario y reposiciones

**Files:**
- Modify: `inventory-adjustments.service.ts` (~L324-336), `inventory-adjustments-pdf.service.ts` (~L35-48), `inventory-replacements.service.ts` (~L247-334)

- [ ] **Step 1:** Mismo patrón. OJO: estos respetan `costMode`/`useBrega` (modo 'COST' NO suma brecha). Mantener ese guard:

```ts
    const bregaPct = useBrega
      ? resolveBregaPct({
          bregaApplies: it.product.bregaApplies,
          categoryBregaPct: it.product.categoryId ? (catBregaMap.get(it.product.categoryId) ?? 0) : 0,
          bregaGlobalPct,
        })
      : 0;
    const costo = effectiveCost(it.product.costUsd, bregaPct);
```
En `inventory-replacements` (que recalcula precio de venta) usar `computeSellingPrices`. Agregar `categoryId: true` a los selects.

> **Nota PDF:** la etiqueta `Costo + Brecha (${bregaGlobalPct}%)` en el pdf muestra la global; con brecha por categoría el % puede variar por producto. Dejar la etiqueta como "Costo + Brecha" (sin el número global) para no mentir. Confirmar wording con Diego al ejecutar.

- [ ] **Step 2: Typecheck API** → limpio.

- [ ] **Step 3: Commit** — `git commit -m "feat(brecha-cat): inventory-adjustments (+pdf) y replacements por helpers"`

---

## Task 10: Integration (partner-transfers) e Import

**Files:**
- Modify: `integration/partner-transfers.service.ts` (~L113-127), `import/import.service.ts` (~L360-549)

- [ ] **Step 1: partner-transfers** — respeta `costBasis === 'COST_BREGA'`. Mantener guard; resolver por helpers + mapa; `select` con `categoryId`.

- [ ] **Step 2: import.service** — el bulk import calcula precios (~L522-531). Construir el mapa una vez antes del loop de productos; por producto usar `resolveBregaPct` (con `categoryBregaPct` de la categoría que se le asigna en el import) + `computeSellingPrices`. **OJO:** el import puede crear categorías nuevas; construir/actualizar el mapa DESPUÉS de crear las categorías, o resolver la brecha por el `categoryId` final del producto.

- [ ] **Step 3: Typecheck API** → limpio.

- [ ] **Step 4: Commit** — `git commit -m "feat(brecha-cat): partner-transfers e import por helpers"`

---

## Task 11: Endpoint de categorías — aceptar `bregaPct` (solo raíz) + disparar recálculo

**Files:**
- Modify: `apps/api/src/modules/categories/dto/*.ts` (DTOs create/update), `categories.service.ts`, `categories.controller.ts`, `categories.module.ts`

- [ ] **Step 1: DTO** — agregar en create y update:

```ts
  @IsOptional()
  @IsNumber()
  @Min(0)
  bregaPct?: number;
```

- [ ] **Step 2: service.update** — al setear `bregaPct`, validar que sea RAÍZ y disparar recálculo:

```ts
  // inyectar CompanyConfigService en el constructor (import CompanyConfigModule en categories.module)
  async update(id: string, dto: UpdateCategoryDto) {
    const cat = await this.prisma.category.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Categoría no encontrada');

    const data: any = { ...dto };
    // La brecha solo aplica a categorías RAÍZ (coherente con commissionPct).
    if (dto.bregaPct !== undefined && cat.parentId) {
      throw new BadRequestException('La brecha solo se define en categorías raíz; las subcategorías la heredan.');
    }
    const bregaChanged = dto.bregaPct !== undefined && dto.bregaPct !== cat.bregaPct;

    const updated = await this.prisma.category.update({ where: { id }, data });
    if (bregaChanged) {
      await this.companyConfig.recalculateCategoryPrices(id); // recalcula raíz + subcategorías
    }
    return updated;
  }
```

- [ ] **Step 3: create** — permitir `bregaPct` solo si es raíz (`parentId` null); si viene en una subcategoría, ignorarlo o 400 (coherente con Step 2).

- [ ] **Step 4: GET categorías** — asegurar que el `select`/respuesta incluya `bregaPct` (el árbol que consume el frontend).

- [ ] **Step 5: module** — `imports: [CompanyConfigModule]` en `categories.module.ts` (y `exports: [CompanyConfigService]` en company-config.module — hecho en Task 5).

- [ ] **Step 6: Typecheck API** → limpio.

- [ ] **Step 7: Verificación local end-to-end** (token forjado). Poner `bregaPct=10` a una categoría raíz con productos:
  - Confirmar recálculo: los productos de esa raíz (y subcategorías) con `manualPrice:false` suben; los de OTRAS categorías NO cambian.
  - Confirmar 400 al intentar poner brecha a una subcategoría.
  - Poner `bregaPct=0` de nuevo → vuelven a la global.

```bash
# ejemplo de verificación por psql tras el PATCH:
docker exec trinity-postgres-1 psql -U trebol -d total_db -c 'SELECT id,name,"bregaPct" FROM "Category" WHERE "parentId" IS NULL;'
```

- [ ] **Step 8: Commit** — `git commit -m "feat(brecha-cat): endpoint categorias acepta bregaPct (solo raiz) + recalculo auto"`

---

## Task 12: Frontend — input "Brecha %" en categorías raíz

**Files:**
- Modify: `apps/web/src/app/(dashboard)/catalog/categories/page.tsx`

- [ ] **Step 1: Tipo** — agregar `bregaPct: number;` a la interface `Category` (junto a `commissionPct`).

- [ ] **Step 2: Estado de edición** — junto a `editCommissionPct`, agregar `editBregaPct` (y `newBregaPct` para el alta de raíz). Precargar en el botón editar: `setEditBregaPct(String(cat.bregaPct || 0))`.

- [ ] **Step 3: Input en el formulario de raíz** — SOLO cuando `isRoot` (igual que la comisión). Añadir un input numérico "Brecha %" al lado del de comisión, incluyendo `body.bregaPct = parseFloat(editBregaPct) || 0` en el submit de update (y en el add de raíz).

- [ ] **Step 4: Badge** — junto a `{isRoot && cat.commissionPct > 0 && (...)}` agregar:

```tsx
{isRoot && cat.bregaPct > 0 && (
  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
    {cat.bregaPct}% brecha
  </span>
)}
```

- [ ] **Step 5: Aviso de recálculo** — tras guardar una brecha, mostrar un toast/mensaje "Precios de la categoría recalculados" (el backend ya lo hizo).

- [ ] **Step 6: Typecheck Web** — `cd apps/web && npx tsc --noEmit` → limpio.

- [ ] **Step 7: Verificación visual (local, dev ya levantado)** — en `/catalog/categories`, editar una raíz, poner brecha 10%, guardar; ver el badge y que los precios de sus productos cambian en `/catalog/products`.

- [ ] **Step 8: Commit** — `git commit -m "feat(brecha-cat): UI de brecha por categoria raiz en /catalog/categories"`

---

## Task 13: Verificación integral + PROGRESS

- [ ] **Step 1: Typecheck API + Web** ambos limpios.

- [ ] **Step 2: Escenarios en local (total_db):**
  1. Sin tocar nada (todas las categorías bregaPct=0): precios y márgenes IDÉNTICOS a antes → despliegue inofensivo confirmado.
  2. Brecha raíz 10% a "HERRAMIENTAS": sus productos (y subcategorías) suben; el resto no.
  3. Producto con `bregaApplies=false` en esa categoría: NO lleva brecha (0), aunque la categoría tenga 10%.
  4. Facturar un producto de esa categoría: `InvoiceItem.costUsd` = costo+10% (margen coherente en dashboard).
  5. Bajar la brecha a 0: vuelven a la global.

- [ ] **Step 3: Actualizar `PROGRESS.md`** con la sesión (marcada como pendiente de deploy, resumen de los 13 call-sites centralizados + la regla).

- [ ] **Step 4: Commit** — `git commit -m "docs: PROGRESS - brecha por categoria (pendiente de deploy)"`

---

## Self-Review (checklist del plan)

- **Cobertura de la regla:** `resolveBregaPct` implementa exactamente `bregaApplies ? (cat>0 ? cat : global) : 0` (Task 2). ✅
- **Root-only:** validado en el endpoint (Task 11, 400 en subcategoría) y en UI (input solo en `isRoot`, Task 12). Subcategorías heredan vía `buildCategoryBregaMap` que sube a la raíz (Task 3). ✅
- **Auto-recálculo scoped:** `recalculateCategoryPrices(rootId)` recalcula raíz+subcategorías, `manualPrice:false` (Task 5), disparado en update (Task 11). ✅
- **Consistencia precio vs costo-margen:** los 13 call-sites (Tasks 4–10) usan el MISMO `resolveBregaPct` → el precio y el costo guardado en factura resuelven igual. ✅
- **Despliegue inofensivo:** Task 1 default 0; Tasks 4–10 con brecha 0 dan el mismo resultado que hoy (Task 13 escenario 1). ✅
- **Consistencia de nombres:** `resolveBregaPct`, `effectiveCost`, `computeSellingPrices`, `buildCategoryBregaMap`, `recalculateCategoryPrices` usados idénticos en todas las tareas. ✅
- **Riesgos abiertos a confirmar al ejecutar:** (a) wording de la etiqueta del PDF de ajustes (Task 9); (b) que cada `select` de producto agregue `categoryId` (recordatorio en cada task); (c) el import crea categorías → resolver brecha tras crearlas (Task 10).
