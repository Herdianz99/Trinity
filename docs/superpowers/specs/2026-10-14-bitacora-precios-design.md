# Bitácora de costos y precios — diseño

Fecha: 2026-10-14 · Sesión 162 · Aprobado por el usuario.

## Objetivo
Saber **quién, cuándo, desde dónde y cuánto** cambió el costo o el precio de cada artículo. Hoy no existe
historial por producto (solo `PriceAdjustmentLog`, que guarda el ajuste masivo sin antes/después).

## Alcance (decisiones del usuario)
- Registrar **todos** los cambios, manuales y automáticos, cada uno con su origen.
- Consultarlos en **la ficha del producto** (pestaña nueva) **y** en un **reporte general** con filtros y Excel.
- Permiso nuevo `bitacora-precios`, por defecto solo ADMIN (comodín `*`) y SUPERVISOR.
- No hay historial previo que recuperar. No sirve para deshacer. Se instala en las 7 empresas.

## Campos vigilados
`costUsd`, `priceDetal`, `priceMayor`, `gananciaPct`, `gananciaMayorPct`, `manualPrice`.
Cambios menores a 0,0001 (ruido de float) no cuentan.

## Mecanismo: trigger + "sello" en la fila
Un trigger `AFTER INSERT OR UPDATE` sobre `"Product"` (AFTER para que en INSERT la FK productId ya exista) escribe una fila en `ProductPriceLog` cuando cambia
algún campo vigilado. Captura TODO camino, incluso SQL directo.

La atribución (usuario/origen/documento) viaja **en la misma fila** del producto, en 4 columnas nuevas:
`auditToken`, `auditUserId`, `auditSource`, `auditRef`. El código de la app las llena en cada `update`
con el helper `priceAudit(userId, source, ref)` que genera un `auditToken` nuevo (cuid aleatorio).

El trigger decide:
- Si `NEW.auditToken` es distinto de `OLD.auditToken` → el cambio vino de la app con sello: usa
  `auditUserId/auditSource/auditRef` de NEW.
- Si el token no cambió → nadie selló este UPDATE (SQL directo o un camino olvidado): origen
  `DIRECT_DB`, sin usuario. Nunca se hereda la atribución del cambio anterior.
- En INSERT: origen `NEW.auditSource` o `CREATE` si viene vacío.

Se eligió esto sobre `set_config()` por transacción porque varios caminos (recalcular todos los precios
por brecha global, edición en ficha) actualizan fuera de transacción y el pool de conexiones haría que una
variable de sesión se filtre a otras peticiones.

## Modelo `ProductPriceLog`
| campo | tipo | nota |
|---|---|---|
| id | text PK | `gen_random_uuid()` |
| productId | text FK → Product (cascade) | índice (productId, createdAt) |
| userId | text? | FK → User (set null) |
| source | text | ver orígenes |
| reference | text? | ej. número de FC, nombre de categoría |
| batchId | text? | = auditToken cuando un mismo sello cubre muchos productos (eventos masivos) |
| oldCostUsd / newCostUsd | float? | |
| oldPriceDetal / newPriceDetal | float? | |
| oldPriceMayor / newPriceMayor | float? | |
| oldGananciaPct / newGananciaPct | float? | |
| oldGananciaMayorPct / newGananciaMayorPct | float? | |
| oldManualPrice / newManualPrice | bool? | |
| exchangeRate | float | tasa vigente (última `ExchangeRate` con date ≤ hoy Caracas) |
| newCostBs, newPriceDetalBs, newPriceMayorBs | float | USD × tasa, calculados al guardar (regla USD↔Bs) |
| createdAt | timestamp | índice |

Orígenes (`source`): `MANUAL_EDIT` (ficha), `PRICE_ADJUSTMENT` (ajuste masivo), `PURCHASE` (procesar /
editar costo en compra, ref = número FC), `GLOBAL_BREGA` (config: brecha global), `CATEGORY_BREGA`
(brecha de categoría, ref = categoría), `IMPORT`, `PARTNER_TRANSFER`, `INTEGRATION`,
`INVENTORY_REPLACEMENT`, `CREATE`, `DIRECT_DB`.

## Caminos a sellar (API)
- `products.service`: `create`, `update` (requiere pasar `userId` desde el controller), `applyPriceAdjustment`
  (mismo token para todos = un lote), `importProducts`.
- `company-config.service`: `recalculateAllPrices`, `recalculateCategoryPrices` (lote, recibe userId).
- `categories.service`: pasa userId/categoría a `recalculateCategoryPrices`.
- `purchase-orders.service`: los 3 `product.update` (procesar FC y cambio de costo), ref = número.
- `integration.service`, `partner-transfers.service`, `inventory-replacements.service`, `import.service`.
Lo que no se selle queda como `DIRECT_DB` (visible, no se pierde).

## API
`GET /price-log/product/:productId?page&limit`, `GET /price-log/users` y `GET /price-log` (filtros: from, to [anclados a Caracas con
`caracasDayStart/End` sobre `createdAt`], userId, productId, categoryId, source, onlyManual, page, limit) y
`GET /price-log/export` (Excel). Todos con `@RequireModule('bitacora-precios')`. La respuesta agrupa por
`batchId` en el reporte (un evento masivo = una fila expandible con N productos).

## Web
- Ficha del producto: pestaña **"Historial de precios"** (carga perezosa como las demás), visible solo con
  el permiso.
- Página `/inventory/price-log` "Bitácora de precios": filtros, tabla (fecha, usuario, origen+documento,
  producto, antes → después por campo, % variación del detal), lotes plegados, exportar Excel.
  `document.title = 'Bitácora de precios | Trinity ERP'`. Entrada en sidebar (Inventario), middleware y
  pantalla de permisos por rol.

## Migración
`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS` ×4, función + trigger
(`CREATE OR REPLACE` / `DROP TRIGGER IF EXISTS`), y alta del módulo `bitacora-precios` en `RolePermission`
de SUPERVISOR (ADMIN tiene `*`). No reescribe productos existentes.

## Pruebas
- SQL en BD local: update sellado → fila con usuario; update sin sello → `DIRECT_DB`; update que no toca
  campos vigilados → sin fila; ajuste masivo → N filas con mismo `batchId`.
- Probar en local por el usuario antes de desplegar.

## Nota de implementacion
Un mismo producto no debe sellarse dos veces con el mismo token dentro de un lote (el segundo update se veria
como DIRECT_DB). Por eso procesar una compra usa un sello nuevo por update (la referencia FC los agrupa), y solo
los recalculos/ajustes donde cada producto se toca una vez comparten token.
