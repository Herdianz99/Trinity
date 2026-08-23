# Módulo de Almacén (5S + Reporte de Daños) — Plan de Implementación

> **Ejecución:** inline en esta sesión con checkpoints (TaskList #1–#10). El repo no tiene
> suite de tests para estos módulos (ni `incidents` ni `divisas` la tienen); la verificación es
> `tsc --noEmit` (API+Web) + prueba e2e manual en local (grande), como el resto del proyecto.

**Goal:** Dos mini-módulos aislados (Auditoría 5S + Reporte de Daños de Inventario) para el patio
de almacén, activables solo en aceros/acerosmayor, sin tocar ventas/fiscal; el reporte de daños se
resuelve vía reemplazo (existente) o merma (ADJUSTMENT_OUT).

**Architecture:** Patrón de módulo aislado del repo (`incidents`/`divisas`): NestJS
service+controller+dtos+module con `@RequireModule('almacen')`, Prisma con migración idempotente,
frontend Next bajo `(dashboard)`, gateado por permiso + flag `useAlmacenOps`. Reutiliza
`SpacesService`/`image-processing` (fotos), `InventoryReplacement` (reemplazo) y `StockMovement`
(merma). Spec: `docs/superpowers/specs/2026-08-22-modulo-almacen-5s-danos-design.md`.

**Tech Stack:** NestJS, Prisma (PostgreSQL), Next.js (App Router), DigitalOcean Spaces.

---

## Fase 1 — Prisma: modelos + migración + fix-schema (checkpoint #2)

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (4 modelos + flag CompanyConfig)
- Create: `packages/database/prisma/migrations/20260822120000_almacen_module/migration.sql`
- Modify: `deploy/fix-schema.sql` (columnas/tablas como red de seguridad)

- [ ] Añadir `useAlmacenOps Boolean @default(false)` a `CompanyConfig`.
- [ ] Añadir modelos `Audit5S`, `DamageReport`, `DamageReportItem`, `DamageReportPhoto`
      (ver spec para campos). Relaciones inversas en `Product`, `Warehouse`, `User`,
      `InventoryReplacement` (backref `damageReport DamageReport?`).
- [ ] Migración idempotente: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
      `ADD COLUMN IF NOT EXISTS`, FKs vía `DO $$ ... EXCEPTION WHEN duplicate_object`.
      Al final: `array_append` de `almacen` a WAREHOUSE y AUDITOR.
- [ ] Replicar tablas/columna en `deploy/fix-schema.sql`.
- [ ] `npx prisma generate` (o pnpm equivalente) y `tsc --noEmit` en API sin errores de tipos.

## Fase 2 — Backend Auditoría 5S (checkpoint #3)

**Files (create):** `apps/api/src/modules/audit-5s/{audit-5s.module.ts,audit-5s.service.ts,audit-5s.controller.ts,dto/create-audit-5s.dto.ts,dto/query-audit-5s.dto.ts}`
**Modify:** `apps/api/src/app.module.ts` (registrar `Audit5SModule`)

- [ ] `create()`: valida puntajes 1–5, número `AUD-XXXX` con SELECT FOR UPDATE (patrón
      `generateNumber` de replacements), fecha default `caracasDateKey()` (date-only).
- [ ] `findAll(query)`: filtro from/to (sobre `date`, con `caracasDayStart/End` NO — es date-only,
      usar rango date-only como replacements) + zone; agrega `index5s` calculado.
- [ ] Controller con `@UseGuards(AuthGuard('jwt'), ModuleGuard)` + `@RequireModule('almacen')`.
- [ ] Registrar módulo. `tsc --noEmit` limpio.

## Fase 3 — Backend Reporte de Daños (checkpoint #4)

**Files (create):** `apps/api/src/modules/damage-reports/{damage-reports.module.ts,damage-reports.service.ts,damage-reports.controller.ts,dto/create-damage-report.dto.ts,dto/query-damage-reports.dto.ts}`
**Modify:** `apps/api/src/app.module.ts`

- [ ] `create(dto,userId)`: valida ≥1 ítem y ≥1 foto total; sube fotos a Spaces por ítem
      (patrón `incidents.create`, prefijo `damage-reports/`); `warehouseId` = dto o
      `config.defaultWarehouseId`; número `DMG-XXXX`; snapshot de nombre/código de producto.
      Compensa fotos huérfanas si falla.
- [ ] `findAll(query)` / `findOne(id)`: incluye ítems + fotos como URLs CDN (helper `withPhotoUrls`).
- [ ] `generateReplacement(id,userId)`: `assertPendiente`; crea `InventoryReplacement` DRAFT
      (warehouse=report.warehouseId, notes="Origen: daños {number}"); update reporte
      `status=PROCESADO, resolution=REEMPLAZO, replacementId, processedBy/At`; devuelve replacement.
- [ ] `processMerma(id,userId)`: `assertPendiente`; valida stock suficiente por producto agregado;
      en tx: por ítem `stock.decrement` + `StockMovement ADJUSTMENT_OUT` (sourceType 'DAMAGE_REPORT');
      update reporte `status=PROCESADO, resolution=MERMA, processedBy/At`.
- [ ] `cancel(id)`: `assertPendiente` → `ANULADO`.
- [ ] Módulo importa `ProductImagesModule` (SpacesService). Registrar. `tsc --noEmit` limpio.

## Fase 4 — Permisos + opt-in (checkpoint #5)

**Files:**
- Modify: `apps/api/src/modules/auth/role-permissions.ts` (WAREHOUSE, AUDITOR += `almacen`)
- Modify: `apps/api/src/modules/company-config/dto/update-company-config.dto.ts` (`useAlmacenOps`)
- Modify: company-config service/controller si filtra campos permitidos
- Modify: `apps/web/src/app/(dashboard)/settings/role-permissions/page.tsx` (etiqueta `almacen`)

- [ ] `array_append` ya en la migración (Fase 1); aquí el seed en código para instancias nuevas.
- [ ] Flag editable en /config (backend acepta `useAlmacenOps`).

## Fase 5 — Frontend Auditoría 5S (checkpoint #6)

**Files (create):** `apps/web/src/app/(dashboard)/audit-5s/page.tsx`
- [ ] Componente cliente: 3 sets de estrellas (1–5), combobox de zona (datalist con 5 zonas +
      texto libre), textarea observación, botón "Enviar checklist". Al enviar, muestra índice % con
      color. Debajo, tabla del día. `document.title = 'Auditoría 5S | Trinity ERP'`.

## Fase 6 — Frontend Reporte de Daños (checkpoint #7)

**Files (create):**
- `apps/web/src/app/(dashboard)/inventory/damage-reports/page.tsx` (lista)
- `apps/web/src/app/(dashboard)/inventory/damage-reports/new/page.tsx` (form POS-like)
- `apps/web/src/app/(dashboard)/inventory/damage-reports/[id]/page.tsx` (detalle + acciones)

- [ ] Lista con badges de estatus + botón "Nuevo reporte". `document.title`.
- [ ] Nuevo: zona combobox, `ProductSearch` para agregar filas (producto+cantidad+nota+foto por
      fila con `<input type=file capture>` → dataURI). Validar ≥1 foto. POST.
- [ ] Detalle: datos + ítems con miniaturas + `ImageZoomLightbox`. Si PENDIENTE y puede procesar:
      botones "Generar reemplazo" (POST → redirige a `/inventory/replacements/[id]`) y
      "Procesar como merma" (confirm → POST). Si PROCESADO: mostrar resolución y enlace REP-XXXX.
      `document.title` con el número.

## Fase 7 — Sidebar + navegación gateada (checkpoint #8)

**Files:** `apps/web/src/components/sidebar.tsx` (y `mobile-bottom-nav.tsx` si aplica)
- [ ] Grupo "Almacén": ítems "Auditoría 5S" (`/audit-5s`) y "Reporte de Daños"
      (`/inventory/damage-reports`), visibles solo si `hasModule('almacen')` **y** `useAlmacenOps`.

## Fase 8 — Verificación (checkpoint #9)

- [ ] `tsc --noEmit` API y Web (con `pnpm dev` apagado para no corromper `.next`/`dist`).
- [ ] e2e local (grande, con `useAlmacenOps=true`): crear 5S y ver índice; crear reporte de daños
      con 2 artículos + fotos; "Generar reemplazo" → completar swap → verificar enlace + PROCESADO;
      otro reporte → "Procesar como merma" → verificar `ADJUSTMENT_OUT` en kardex y stock decrementado.

## Fase 9 — Docs (checkpoint #10)

- [ ] PROGRESS.md (entrada de sesión, "pendiente de deploy CON migración, solo aceros/acerosmayor").
- [ ] PROJECT.md si cambia el mapa de módulos. Memoria si hay algo no derivable del código.

---

## Self-review (cobertura del spec)

- 5S: Fase 2 (API) + Fase 5 (UI) + índice % → cubierto.
- Daños POS-like + foto por ítem: Fase 3 (API) + Fase 6 (UI) → cubierto.
- Dos botones (reemplazo/merma) + estatus PENDIENTE→PROCESADO: Fase 3 + Fase 6 → cubierto.
- Zona combobox con zonas del PDF: Fase 5 + Fase 6 → cubierto.
- Separado de seguridad + permiso `almacen` + opt-in flag: Fase 1 (flag+seed) + Fase 4 → cubierto.
- Idempotencia migración + fix-schema: Fase 1 → cubierto.
- Fuera de alcance (OTIF, PDF diario, alertas): documentado en spec, no se implementa.
