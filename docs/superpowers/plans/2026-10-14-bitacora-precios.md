# Bitácora de costos y precios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar quién, cuándo, desde dónde y cuánto cambió el costo/precio de cada producto, y mostrarlo en la ficha y en un reporte general.

**Architecture:** Trigger `BEFORE INSERT OR UPDATE` en `"Product"` que escribe `ProductPriceLog` cuando cambia un campo vigilado. La atribución viaja en 4 columnas "sello" del producto (`auditToken/auditUserId/auditSource/auditRef`) que la API llena con `priceAudit()`; si el token no cambió, el cambio se registra como `DIRECT_DB`. Spec: `docs/superpowers/specs/2026-10-14-bitacora-precios-design.md`.

**Tech Stack:** PostgreSQL (plpgsql), Prisma 5, NestJS, Next.js 14, xlsx.

---

## File map
- Create `packages/database/prisma/migrations/20261014180000_product_price_log/migration.sql` — tabla, columnas sello, función+trigger, permiso.
- Modify `packages/database/prisma/schema.prisma` — modelo `ProductPriceLog`, 4 columnas en `Product`, relaciones.
- Create `apps/api/src/common/price-audit.ts` — `priceAudit(userId, source, ref)` + tipo `PriceAuditSource`.
- Create `apps/api/src/modules/price-log/{price-log.module,price-log.controller,price-log.service}.ts` — consultas + Excel.
- Modify (sellar): `products.service/controller`, `company-config.service/controller`, `categories.service/controller`, `purchase-orders.service/controller`, `integration.service`, `partner-transfers.service`, `inventory-replacements.service`, `import.service`, `app.module.ts`.
- Modify permisos: `role-permissions.service.ts` (lista válida), `auth/role-permissions.ts` (SUPERVISOR fallback), web `settings/role-permissions/page.tsx`, `sidebar.tsx`, `middleware.ts`.
- Create web `apps/web/src/app/(dashboard)/inventory/price-log/page.tsx`; Modify `catalog/products/[code]/page.tsx` (pestaña).
- Test: `apps/api/_price-log.test.sql` (script SQL de verificación contra BD local).

### Task 1: Migración + schema
- [ ] Escribir `migration.sql`:
```sql
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "auditToken" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "auditUserId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "auditSource" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "auditRef" TEXT;
CREATE TABLE IF NOT EXISTS "ProductPriceLog" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "productId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
  "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "source" TEXT NOT NULL, "reference" TEXT, "batchId" TEXT,
  "oldCostUsd" DOUBLE PRECISION, "newCostUsd" DOUBLE PRECISION,
  "oldPriceDetal" DOUBLE PRECISION, "newPriceDetal" DOUBLE PRECISION,
  "oldPriceMayor" DOUBLE PRECISION, "newPriceMayor" DOUBLE PRECISION,
  "oldGananciaPct" DOUBLE PRECISION, "newGananciaPct" DOUBLE PRECISION,
  "oldGananciaMayorPct" DOUBLE PRECISION, "newGananciaMayorPct" DOUBLE PRECISION,
  "oldManualPrice" BOOLEAN, "newManualPrice" BOOLEAN,
  "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "newCostBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "newPriceDetalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "newPriceMayorBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "ProductPriceLog_productId_createdAt_idx" ON "ProductPriceLog"("productId","createdAt");
CREATE INDEX IF NOT EXISTS "ProductPriceLog_createdAt_idx" ON "ProductPriceLog"("createdAt");
CREATE INDEX IF NOT EXISTS "ProductPriceLog_batchId_idx" ON "ProductPriceLog"("batchId");
-- función trigger (ver Task 1 código completo en el archivo)
```
- [ ] Función `product_price_log_fn()`: en UPDATE compara `round(x::numeric,4)` de los 5 numéricos y `manualPrice`; si nada cambió → `RETURN NEW`. Atribución: `stamped := TG_OP='INSERT' OR NEW."auditToken" IS DISTINCT FROM OLD."auditToken"`; si `stamped` usa `NEW.audit*` (source por defecto `CREATE` en INSERT), si no `DIRECT_DB`/sin usuario. `batchId := CASE WHEN stamped THEN NEW."auditToken" END`. Tasa: `SELECT rate FROM "ExchangeRate" WHERE date <= (now() AT TIME ZONE 'America/Caracas')::date ORDER BY date DESC LIMIT 1`. Bs = round(usd*tasa,2). `userId` solo si existe en `"User"` (evita FK rota). Trigger `BEFORE INSERT OR UPDATE ON "Product" FOR EACH ROW`.
- [ ] Permiso: `UPDATE "RolePermission" SET modules = array_append(modules,'bitacora-precios') WHERE role='SUPERVISOR' AND NOT ('bitacora-precios' = ANY(modules));`
- [ ] schema.prisma: modelo `ProductPriceLog` (campos de arriba, relaciones `product`, `user` "ProductPriceLogUser"), en `Product` los 4 campos + `priceLogs ProductPriceLog[]`, en `User` `priceLogs ProductPriceLog[] @relation("ProductPriceLogUser")`.
- [ ] `npx prisma migrate deploy` + `prisma generate` en local; correr `_price-log.test.sql` (Task 2).

### Task 2: Verificación SQL (test)
`apps/api/_price-log.test.sql` dentro de `BEGIN … ROLLBACK`: (1) update de `priceDetal` con token nuevo y auditUserId → 1 fila source/usuario correctos; (2) update de precio sin tocar token → fila `DIRECT_DB` sin usuario; (3) update de `name` → 0 filas; (4) update de `priceDetal` a mismo valor +1e-9 → 0 filas; (5) updateMany con mismo token a 3 productos → 3 filas mismo batchId. Correr: `docker exec … psql -f` (BD local). Esperado: todos los `\echo OK`.

### Task 3: Helper `priceAudit`
```ts
// apps/api/src/common/price-audit.ts
import { randomUUID } from 'crypto';
export type PriceAuditSource = 'MANUAL_EDIT' | 'PRICE_ADJUSTMENT' | 'PURCHASE' | 'GLOBAL_BREGA' | 'CATEGORY_BREGA'
  | 'IMPORT' | 'PARTNER_TRANSFER' | 'INTEGRATION' | 'INVENTORY_REPLACEMENT' | 'CREATE';
/** Sello de atribucion para la bitacora de precios: se mezcla en el `data` de product.create/update. */
export function priceAudit(userId: string | null | undefined, source: PriceAuditSource, ref?: string | null, token?: string) {
  return { auditToken: token ?? randomUUID(), auditUserId: userId ?? null, auditSource: source, auditRef: ref ?? null };
}
```
Para lotes: `const t = randomUUID()` una vez y pasar `token: t` en cada fila.

### Task 4: Sellar caminos
- products: `create(dto, userId?)` → `...priceAudit(userId,'CREATE')`; `update(id,dto,userId)` → `MANUAL_EDIT`; controller pasa `@CurrentUser('id')`; `importProducts(products,userId)` → `IMPORT`; `applyPriceAdjustment` → `PRICE_ADJUSTMENT`, ref = `log.id`? (el log se crea antes: usar token de lote).
- company-config: `update(dto,userId)` → `recalculateAllPrices(pct,userId)` `GLOBAL_BREGA` lote; `recalculateCategoryPrices(rootId,userId,catName)` `CATEGORY_BREGA` lote; controllers pasan usuario.
- purchase-orders: `process` (2 updates) `PURCHASE` ref `order.number`; `updatePrices(id,items,userId)` `PURCHASE` ref `order.number`; controller pasa usuario.
- integration `applyPartnerPrices` → `INTEGRATION` lote; integration create (l.280) → `CREATE`; partner-transfers `receive` → `PARTNER_TRANSFER` ref `rec.number`; inventory-replacements `process` → `INVENTORY_REPLACEMENT` ref número; import.service `executeImport` → `IMPORT` lote.
- `npx tsc --noEmit` en apps/api sin errores nuevos.

### Task 5: API price-log
`GET /price-log` (`from,to,userId,productId,categoryId,source,onlyManual,page,limit`), `GET /price-log/export` (xlsx), `GET /products/:id/price-log` (en price-log.controller como `GET /price-log/product/:id`). `@UseGuards(AuthGuard('jwt'), ModuleGuard) @RequireModule('bitacora-precios')`. Fechas con `caracasDayStart/caracasDayEnd`. onlyManual = source in (MANUAL_EDIT, PRICE_ADJUSTMENT, PURCHASE price edits?) → MANUAL_EDIT, PRICE_ADJUSTMENT. Incluye producto (code,name), usuario (name). Agrupación por lote en el frontend (batchId + count por lote vía `groupBy`).

### Task 6: Web
- Página `/inventory/price-log`: filtros (fechas, usuario, origen, buscar producto, solo manuales), tabla con antes→después y % variación detal, lotes plegados, botón Excel; `document.title`.
- Pestaña "Historial de precios" en ficha (lazy, solo si tiene permiso).
- Sidebar (Inventario), middleware `['/inventory/price-log',['bitacora-precios']]`, permisos por rol.
- `npx tsc --noEmit` en apps/web.

### Task 7: Docs + commit
PROGRESS.md / PROJECT.md, commit `feat: Session 162 - Bitacora de costos y precios`, push. Prueba local por el usuario antes de desplegar.
