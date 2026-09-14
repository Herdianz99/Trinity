# Módulo de Exhibición — Diseño

**Fecha:** 2026-09-14
**Estado:** Aprobado (diseño). Pendiente plan de implementación.

## Objetivo

Un módulo **sencillo e independiente** para que las personas que manejan la
exhibición lleven control de **qué artículos están exhibidos y cuáles no**, y
generen un **reporte por rango de fechas** (hoy / esta semana / este mes /
personalizado) con **toda la actividad** de exhibición (puestas y retiros) y en
qué día ocurrió.

**Principio rector:** aparte de todo lo demás. No mueve inventario/stock/kardex,
no se cruza con ventas. Es un control + bitácora propio.

## No-goals (fuera de alcance)

- NO mueve stock ni kardex; el artículo exhibido sigue disponible para vender.
- NO se cruza con ventas ni con la tienda online (`showInStore` es otra cosa).
- SIN foto de la exhibición en esta versión (se puede agregar luego con la infra
  de fotos existente — `product-images` / Spaces).
- NO crea un rol nuevo; se controla con un permiso asignable a los roles actuales.

## Decisiones tomadas (brainstorming)

1. **Modelo:** estado actual (exhibido/no) **+ bitácora** de cada cambio con
   fecha, hora y usuario.
2. **Cantidad:** solo **presencia** (exhibido sí/no por artículo), sin cantidades.
3. **Ubicación:** campo **texto libre opcional** (aún no hay zonas designadas).
4. **Reporte:** lista **toda la actividad** del rango (puestas + retiros).
5. **Stock:** **totalmente aparte**, no afecta inventario.
6. **Acceso:** **permiso nuevo `exhibicion`** asignable por rol (no rol nuevo).
7. **Extras incluidos:** exportar reporte PDF/Excel · KPIs + tiempo en exhibición ·
   motivo al retirar. (Foto NO.)
8. **Extras por defecto (UX):** buscar + escanear código de barras · filtros
   (categoría/marca/ubicación) · historial por artículo · ver exhibidos vs no
   exhibidos.

## Modelo de datos

### a) Estado actual — campos nuevos en `Product`

Migración **aditiva e idempotente** (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`):

- `isExhibited Boolean @default(false)` — ¿está en vitrina ahora?
- `exhibitedSince DateTime?` — timestamp de la puesta actual (para "tiempo en
  exhibición" en días = ahora − exhibitedSince).
- `exhibitionLocation String?` — ubicación en texto libre (opcional).

Se ponen en `Product` (en vez de una tabla 1:1) para **reusar el buscador y
filtros de productos existentes** y responder "qué está / qué no está exhibido"
sin joins. Sigue siendo independiente del stock.

### b) Bitácora — tabla nueva `ExhibitionEntry` (append-only)

Nunca se edita ni borra desde la app; es el registro histórico.

```prisma
model ExhibitionEntry {
  id           String            @id @default(cuid())
  productId    String
  product      Product           @relation(fields: [productId], references: [id])
  action       ExhibitionAction  // PLACED | REMOVED
  location     String?           // ubicación al momento (copia del texto libre)
  reason       ExhibitionReason? // solo en REMOVED: SOLD | DAMAGED | ROTATION | OTHER
  note         String?           // nota libre opcional
  createdAt    DateTime          @default(now())
  createdById  String
  createdBy    User              @relation(fields: [createdById], references: [id])

  @@index([createdAt])
  @@index([productId])
  @@index([action])
}

enum ExhibitionAction { PLACED  REMOVED }
enum ExhibitionReason { SOLD  DAMAGED  ROTATION  OTHER }
```

Relaciones inversas nuevas: `Product.exhibitionEntries ExhibitionEntry[]` y
`User.exhibitionEntries ExhibitionEntry[]`.

## Backend — módulo `apps/api/src/modules/exhibition`

Sigue el patrón de `damage-reports` (controller / service / module / dto +
`*-pdf.service.ts`). Controller protegido con `@UseGuards(AuthGuard('jwt'),
ModuleGuard)` + `@RequireModule('exhibicion')`.

Endpoints:

- `GET /exhibition/products` — productos con su estado de exhibición + filtros:
  `search` (nombre/código/barcode), `categoryId`, `brandId`, `location`,
  `exhibited` (`true`/`false` para ver exhibidos o no-exhibidos), paginado.
  Reusa la lógica de búsqueda de productos existente.
- `POST /exhibition/place` — `{ productId, location? }` → en una transacción:
  set `isExhibited=true`, `exhibitedSince=now`, `exhibitionLocation=location`, y
  crea `ExhibitionEntry` `PLACED`. Idempotente: si ya está exhibido, error 400.
- `POST /exhibition/remove` — `{ productId, reason?, note? }` → set
  `isExhibited=false`, limpia `exhibitedSince`/`exhibitionLocation`, y crea
  `ExhibitionEntry` `REMOVED` con el motivo. Error 400 si no estaba exhibido.
- `GET /exhibition/activity` — bitácora por rango `from`/`to` (= el reporte),
  con filtros opcionales (action, categoría, marca). Devuelve entries con
  producto (código/nombre), acción, fecha/hora, usuario, ubicación, motivo.
- `GET /exhibition/summary` — KPIs del rango (ver abajo).
- `GET /exhibition/products/:id/history` — bitácora completa de un artículo.
- `GET /exhibition/activity/pdf` y `GET /exhibition/activity/xlsx` — exportar el
  reporte del rango (sin paginación), como en `payables`/`expenses`.

**Timezone:** todos los rangos sobre `createdAt` (timestamp) usan
`caracasDayStart()` / `caracasDayEnd()` del helper `common/timezone.ts`
(regla del proyecto). "Hoy" = `caracasDayStart()`..`caracasDayEnd()`.

### KPIs de `/exhibition/summary`

- **Exhibidos actualmente**: `count(Product where isExhibited=true)`.
- **Puestas en el período**: `count(ExhibitionEntry action=PLACED)` en el rango.
- **Retiros en el período**: `count(ExhibitionEntry action=REMOVED)` en el rango.
- **Top artículos más exhibidos**: por conteo de `PLACED` en el rango.
- **Tiempo promedio en exhibición**: promedio de días de los actualmente
  exhibidos (`now − exhibitedSince`).

## Frontend — `apps/web/src/app/(dashboard)/exhibition`

Página con dos pestañas (patrón similar a otras del dashboard):

### Pestaña "Exhibición" (control)

- Buscador de artículos + **escaneo de código de barras** (reusar el componente/
  hook de escaneo del POS).
- Filtros: categoría, marca, ubicación (texto), y toggle **exhibidos /
  no exhibidos**.
- Cada artículo muestra su estado; botón/switch para **poner** (pide ubicación
  opcional) o **retirar** (pide **motivo**: vendido / dañado / rotación / otro).
- En los exhibidos se muestra **cuántos días llevan** en vitrina y su ubicación.

### Pestaña "Reporte"

- Selector de rango: **hoy / esta semana / este mes / personalizado** (mismo
  patrón que el dashboard).
- **Tarjetas KPI** (los 5 de arriba).
- **Tabla de toda la actividad** del rango: artículo (código + nombre), acción
  (Puesto/Retirado), día y hora, usuario, ubicación, motivo.
- Botones **Exportar PDF** y **Exportar Excel**.

### Historial por artículo

Modal que muestra toda la bitácora de un artículo (todas sus puestas/retiros con
fecha, usuario, ubicación y motivo).

**Título de pestaña:** `document.title` = `'Exhibición | Trinity ERP'` (estático);
en el modal de historial, `\`${code} - ${name} | Trinity ERP\``.

## Permisos y menú

- Agregar `'exhibicion'` a `VALID_MODULES` en
  `role-permissions/role-permissions.service.ts`.
- Agregar el checkbox **"Exhibición"** en la pantalla de Permisos por rol
  (`settings/role-permissions/page.tsx`, en `MODULE_GROUPS`).
- Agregar el permiso a los defaults de `auth/role-permissions.ts` para
  **ADMIN** (ya tiene `*`), **SUPERVISOR** y **WAREHOUSE** (ajustable después
  por empresa desde la UI).
- Nueva sección **"EXHIBICIÓN"** en `components/sidebar.tsx`, gateada por
  `permission: 'exhibicion'`.

## Consideraciones

- **Migración:** aditiva e idempotente (`IF NOT EXISTS` en columnas y `CREATE
  TABLE IF NOT EXISTS` / enums con guardas). Inofensiva al desplegar; el módulo
  no aparece hasta que el permiso se asigne a un rol.
- **Sin dinero:** no hay campos monetarios, no aplica la regla USD/Bs.
- **Rendimiento:** índices en `ExhibitionEntry(createdAt, productId, action)`
  para el reporte y el historial.

## Criterios de aceptación

1. Puedo marcar un artículo como exhibido (con ubicación opcional) y aparece en
   "exhibidos"; se registra una entry `PLACED` con mi usuario y la fecha.
2. Puedo retirarlo eligiendo un motivo; pasa a "no exhibidos" y se registra una
   entry `REMOVED`.
3. La lista permite ver exhibidos y no-exhibidos, con filtros y escaneo de
   código de barras.
4. El reporte por rango (hoy/semana/mes/personalizado) lista toda la actividad
   (puestas + retiros) con día, usuario, ubicación y motivo, con KPIs, y se
   exporta a PDF y Excel.
5. Puedo ver el historial completo de un artículo.
6. El módulo solo es visible/accesible para roles con el permiso `exhibicion`.
7. Nada de lo anterior toca stock, kardex ni ventas.
