# Módulo de Almacén — Auditoría 5S + Reporte de Daños de Inventario — Diseño

Fecha: 2026-08-22
Estado: aprobado por el usuario (Diego) para implementación.
Origen: `Especificacion_App_Despacho_Almacen.pdf` (app de control operativo de almacén de
materiales de construcción/acero). De las 3 funciones del PDF (calidad/merma, 5S, despachos/OTIF)
se implementan **solo 2** en esta primera entrega: **Auditoría 5S** y **Reporte de Daños**
(la validación de despachos/OTIF se difiere; ya existe el módulo `dispatch` + `useScanDispatch`).

## Propósito

Dos mini-módulos **aislados** (como Incidencias/Divisas), activables **solo en aceros/acerosmayor**
mediante un flag por empresa, para el patio de almacén:

1. **Auditoría 5S** — checklist rápido (<2 min) de cierre de turno. El líder de zona califica
   con estrellas (1–5) limpieza, orden y seguridad de apilamiento; se calcula un **Índice 5S %**
   con semáforo (verde/amarillo/rojo). Solo informativo/histórico. No toca inventario.

2. **Reporte de Daños de Inventario** — la gente de despacho registra, tipo POS (lista de varios
   artículos distintos), qué mercancía se dañó (cantidad + nota del porqué + **foto de evidencia**),
   en qué zona. **NO mueve inventario**: es un reporte con estatus `PENDIENTE`. El **auditor** lo
   revisa y lo resuelve de una de dos formas, que sí mueven el kardex:
   - **Generar reemplazo** → crea un `InventoryReplacement` DRAFT enlazado (swap: el artículo
     dañado sale, otro entra), pone el reporte **`EN_PROCESO`** (NO procesado) y navega al editor
     de reemplazos existente. Pasa a `PROCESADO` **solo cuando el reemplazo se procesa de verdad**
     (enganche en `inventory-replacements.service`). Si el auditor abandona el borrador puede
     **Deshacer reemplazo** para volver a `PENDIENTE`; si el reemplazo se cancela/elimina, el
     reporte también regresa a `PENDIENTE`.
   - **Procesar como merma** → hace un `ADJUSTMENT_OUT` (baja pura, sin reposición) y marca `PROCESADO`.
   Estados: `PENDIENTE → EN_PROCESO → PROCESADO` (o `ANULADO`). `PROCESADO` es terminal.

   **Este es el módulo separado de `incidents` (seguridad) a propósito**: seguridad es privado y
   vive en su propio permiso; daños de inventario es operativo y va con el permiso `almacen`.

## Decisiones (del brainstorming con Diego)

- **Separado de seguridad (`incidents`):** módulos y permisos distintos. No se mezclan.
- **El reporte de daños NO mueve stock por sí mismo.** El kardex se mueve solo cuando el auditor
  hace el reemplazo o la merma → evita doble descuento (bug histórico de kardex del repo).
- **Dos botones al procesar** (decisión explícita de Diego): "Generar reemplazo" (caso común) y
  "Procesar como merma" (pérdida total). El de despacho no decide; decide el auditor.
- **Foto de evidencia opcional**, **por ítem** (cada artículo dañado puede llevar su(s) foto(s)),
  reutilizando la infra de Spaces de `incidents`. (Se decidió NO hacerla obligatoria.)
- **Zona:** campo tipo combobox — selector con las zonas del PDF (`Cantiléver - Perfiles`,
  `Tubos - PVC`, `Mantas`, `Cemento`, `Tanques`) **y** permite escribir una zona distinta
  (guardado como texto libre). Aplica igual a 5S y a Daños.
- **Cantidad + nota por ítem** (la nota cubre el "causa raíz / porqué" del PDF sin dropdown rígido).
- **Aislamiento/opt-in:** permiso propio `almacen` (gateado con `@RequireModule('almacen')`) +
  flag `CompanyConfig.useAlmacenOps` (default `false`, se enciende en /config solo en
  aceros/acerosmayor, igual patrón que `useScanDispatch`). El sidebar muestra el grupo solo si el
  flag está encendido y el rol tiene `almacen` (o `*`).

## Modelo de datos (4 tablas nuevas + 1 columna)

```
Audit5S            id, number(unique 'AUD-0001'), date(date-only midnight UTC), zone(String),
                   scoreCleanliness(Int 1-5), scoreOrder(Int 1-5), scoreSafety(Int 1-5),
                   observations(String?), createdById(FK User), createdAt, updatedAt
                   @@index([date])

DamageReport       id, number(unique 'DMG-0001'), date(date-only midnight UTC), zone(String),
                   warehouseId(FK Warehouse),         // dónde está el stock (default = config.defaultWarehouseId)
                   notes(String?),
                   status(String 'PENDIENTE'|'PROCESADO'|'ANULADO' def 'PENDIENTE'),
                   resolution(String? 'REEMPLAZO'|'MERMA'),  // cómo lo resolvió el auditor
                   replacementId(FK InventoryReplacement?, unique),  // enlace cuando resolution=REEMPLAZO
                   createdById(FK User), processedById(FK User?), processedAt(DateTime?),
                   createdAt, updatedAt
                   @@index([status]) @@index([date])

DamageReportItem   id, reportId(FK cascade), productId(FK Product), productName(snapshot),
                   productCode(snapshot?), quantity(Float), note(String?),
                   photos: DamageReportPhoto[]
                   @@index([reportId])

DamageReportPhoto  id, itemId(FK DamageReportItem cascade), thumbKey, mediumKey, createdAt
                   @@index([itemId])

CompanyConfig.useAlmacenOps  Boolean @default(false)   // opt-in por empresa
```

Enums como String (convención del repo, igual que `Incident.severity` / `TreasuryMovement.status`).
Fechas date-only ancladas a medianoche UTC (patrón de `InventoryReplacement.date`); `createdAt`
son TIMESTAMP. No hay campos monetarios propios (los costos viven en el reemplazo/kardex).

## Índice 5S (calculado, no almacenado)

```
Índice 5S (%) = (scoreCleanliness + scoreOrder + scoreSafety) / 15 * 100
Semáforo: >90 verde · 75–89 amarillo · <75 rojo
```

## API

### `/audit-5s` (guard `@RequireModule('almacen')`)
- `GET /audit-5s?from=&to=&zone=` → lista (índice % incluido).
- `POST /audit-5s` → crea (número AUD-XXXX con SELECT FOR UPDATE, fecha default hoy Caracas).
- `GET /audit-5s/summary?from=&to=` → promedio de índice por zona (para KPI, opcional v1).

### `/damage-reports` (guard `@RequireModule('almacen')`)
- `GET /damage-reports?status=&from=&to=` → lista (con conteo de ítems, fotos como URLs CDN).
- `GET /damage-reports/:id` → detalle con ítems + fotos.
- `POST /damage-reports` → crea con ítems (POS-like) + fotos (dataURI → Spaces, patrón `incidents`);
  `warehouseId` default = `config.defaultWarehouseId`; estatus `PENDIENTE`. Exige ≥1 foto total.
- `POST /damage-reports/:id/replacement` → (auditor) crea `InventoryReplacement` DRAFT
  (warehouse = report.warehouseId, notes = "Origen: daños DMG-XXXX"), enlaza `replacementId`,
  marca reporte `PROCESADO` + `resolution='REEMPLAZO'`, devuelve `{ replacementId }`. **No**
  pre-crea líneas (el modelo exige `inProductId`, desconocido aún); el auditor arma el swap en el
  editor de reemplazos, que ya tiene buscador de productos. El detalle del reporte muestra los
  ítems dañados como referencia.
- `POST /damage-reports/:id/merma` → (auditor) en 1 transacción: por cada ítem hace
  `stock.decrement` + `StockMovement ADJUSTMENT_OUT` (reason "Merma - reporte DMG-XXXX",
  sourceType 'DAMAGE_REPORT', sourceId report.id), marca reporte `PROCESADO`+`resolution='MERMA'`.
  Valida stock suficiente (mismo criterio que replacements). **Sí toca kardex.**
- `POST /damage-reports/:id/cancel` → marca `ANULADO` (solo si `PENDIENTE`).

Reglas de estatus: solo se puede procesar/anular un reporte `PENDIENTE`. `PROCESADO` es terminal.

## Frontend (bajo `(dashboard)`)

- **5S** (`/audit-5s`): pantalla móvil de estrellas — 3 preguntas (limpieza/orden/seguridad),
  selector de zona (combobox con las 5 zonas + escribir otra), observación, botón enviar; muestra
  el índice % con color al enviar. Debajo, listado del día/rango con su índice. `document.title`.
- **Daños** (`/inventory/damage-reports`): listado con estatus (badges PENDIENTE/PROCESADO/ANULADO),
  botón "Nuevo reporte".
  - **Nuevo** (`/inventory/damage-reports/new`): selector de zona, buscador de productos **tipo POS**
    (agrega varias filas: producto + cantidad + nota + botón cámara por fila), validación ≥1 foto.
  - **Detalle** (`/inventory/damage-reports/[id]`): datos + ítems con miniaturas (lightbox reusando
    `ImageZoomLightbox`); si `PENDIENTE` y el usuario puede procesar → botones **"Generar reemplazo"**
    (redirige a `/inventory/replacements/[id]`) y **"Procesar como merma"** (confirmación). Si
    `PROCESADO` con reemplazo, enlace al `REP-XXXX`.
- Ítems de sidebar bajo grupo "Almacén" gateados por `almacen` + `useAlmacenOps`.
- Toggle "Módulo de Almacén (5S + reporte de daños)" en `/config`.
- Todas las páginas con `document.title = '… | Trinity ERP'`.

## Permisos / roles

- Nueva clave de permiso: **`almacen`**.
- Defaults (`role-permissions.ts` + `array_append` en migración para filas existentes):
  - `WAREHOUSE` += `almacen` (crea 5S y reportes de daño).
  - `AUDITOR` += `almacen` (revisa y procesa; ya tiene `inventory` para el reemplazo).
  - `ADMIN` ya es `['*']`.
- La pantalla de "Permisos por rol" debe listar `almacen`.

## Fuera de alcance (v1)

- Validación de despachos / KPI OTIF (hora programada vs real). Se difiere: ya existe `dispatch` +
  `useScanDispatch`; se evaluará como fase 2.
- Reclasificación automática a un SKU/almacén de "segunda" con precio con descuento (el auditor lo
  resuelve manualmente vía el reemplazo por ahora).
- Reporte PDF diario consolidado + correo a gerencia (motor PDF + Brevo existen; se difiere).
- Alertas automáticas por umbral ($100 / 500 kg).
- Causa raíz como dropdown rígido (se usa nota libre por ítem).

## Riesgos / notas

- Aditivo y aislado: no toca ventas/fiscal. La única parte que mueve kardex es "merma" y "reemplazo"
  (este último reutiliza el flujo probado de `InventoryReplacement`).
- Migración idempotente (`IF NOT EXISTS`, `DO $$ ... duplicate_object`), replicada en
  `deploy/fix-schema.sql` (red de seguridad del deploy).
- El flag `useAlmacenOps` mantiene el módulo invisible en las 4 empresas que no lo usan.
- `DamageReport.warehouseId` es obligatorio para poder mover stock; se autodefine desde
  `config.defaultWarehouseId` para no complicarle el formulario al de despacho.
