# Sinónimos de búsqueda de productos — diseño (Fase 1 del chatbot)

**Fecha:** 2026-10-11 · **Contexto:** `docs/CHATBOT-WHATSAPP-FACTIBILIDAD.md` (sección 7) · **Aplica a:** las 7 instancias (código); carga inicial de reglas solo en la grande.

## Objetivo

Que "cabilla 3/8" encuentre `BARRA CON RESALTE S-60 10MM X 12MTS` en **todas** las búsquedas de producto
(POS, artículos, compras, ajustes, conteos, exhibición, portal y, más adelante, el bot), sin tocar esas búsquedas,
y que nada de lo que hoy se encuentra deje de encontrarse.

## Enfoque elegido: palabras clave en el índice (opción A)

Cada regla agrega palabras al índice de búsqueda (`Product.searchVector`) de los productos que la cumplen.
Las búsquedas siguen usando `productSearchTsQuery` + `searchVector @@ to_tsquery(...)`, sin cambios.
Descartado: traducir la consulta al buscar (opción B) — obliga a reescribir 7 búsquedas y complica el SQL.

## Modelo de datos

**`SearchSynonym`** (tabla nueva):

| Campo | Tipo | Nota |
|---|---|---|
| `id` | String cuid | |
| `terms` | String[] | Lo que escribe el cliente: `["cabilla", "cabilla estriada"]` |
| `matchTerms` | String | Palabras que debe tener el **nombre** del producto (todas, palabra completa, sin prefijo): `"barra resalte"` |
| `categoryIds` | String[] | Categorías donde aplica; vacío = todas. Sin FK (un id de categoría borrada simplemente no matchea) |
| `isActive` | Boolean, default false | Las reglas de la carga inicial entran inactivas ("pendientes") |
| `notes` | String? | |
| `createdById` | String? → User | |
| `createdAt` / `updatedAt` | DateTime | |

**`Product.searchKeywords`** (String, default `''`): texto legible con las palabras de las reglas activas que le tocan
(`"cabilla, cabilla estriada, 3/8, tres octavos"`). Se indexa, se muestra en la ficha y se exporta a la tienda.

## Mecanismo en la BD

- Función SQL `product_search_normalize(text)`: `unaccent(lower(x))`; cada fracción `N/M` se conserva como `N M NfM`
  (ej. `3/8` → `3 8 3f8`); luego todo lo que no sea `[a-z0-9 ]` → espacio. Se usa para nombre/códigos/keywords.
- Función SQL `product_synonym_keywords(name, categoryId)`: concatena (`, `) los `terms` de las reglas **activas** cuyo
  `matchTerms` normalizado esté contenido en el nombre normalizado (tsquery con `&`, sin `:*`) y cuya `categoryIds`
  esté vacía o contenga la categoría.
- Trigger existente `update_product_search_vector`:
  - En INSERT, o en UPDATE si cambió `name` o `categoryId`: recalcula `NEW.searchKeywords`.
  - Siempre: `searchVector = to_tsvector('spanish', normalize(name || codes || searchKeywords))`.
  - Un UPDATE de precio/stock no recalcula keywords (el costo extra es nulo).
- Al crear/editar/activar/desactivar/borrar una regla: dentro de la misma transacción,
  `UPDATE "Product" SET "searchKeywords" = product_synonym_keywords(name, "categoryId") WHERE "searchKeywords" IS DISTINCT FROM …`
  (solo escribe los que cambian; no toca `updatedAt`).

## Fracciones en la consulta

`productSearchTsQuery` convierte `N/M` en el token `NfM` (ej. "llave 1/2" → `llave:* & 1f2:*`). Como el índice guarda
`1`, `2` **y** `1f2`, quien escribe "1 2" sigue encontrando lo mismo; quien escribe "1/2" ya no ve "2 X 1" ni "12".
Es el único cambio de resultados en las búsquedas existentes (deliberado).

## API (`search-synonyms`, permiso `catalog` = ADMIN/SUPERVISOR/BUYER por defecto)

- `GET /search-synonyms?status=pending|active|all&search=` — lista, con conteo de productos afectados por regla.
- `POST /search-synonyms/preview` `{terms, matchTerms, categoryIds}` — productos que cumpliría la regla (código, nombre, categoría; máx. 200 + total).
- `POST /search-synonyms` · `PATCH /search-synonyms/:id` · `DELETE /search-synonyms/:id`
- `POST /search-synonyms/activate` `{ids, isActive}` — activar/desactivar en lote.
- Validación: `terms` ≥ 1 no vacío; `matchTerms` con al menos una palabra; una regla que matchea 0 productos se puede guardar (aviso en UI).

## Pantalla: Catálogo → Sinónimos de búsqueda (`/catalog/synonyms`)

- Pestañas: Pendientes · Activas · Todas; buscador; checkbox por fila + "Activar seleccionadas".
- Fila: palabras del cliente → palabras del producto · categorías · nº de productos · estado (toggle).
- Modal crear/editar: palabras del cliente (chips), palabras del producto, categorías (multi), notas, y **vista previa en vivo**
  de los productos afectados.
- Ficha de producto: línea "También se encuentra como: …" si tiene `searchKeywords`.
- `document.title = 'Sinónimos de búsqueda | Trinity ERP'`.

## Tienda online

El snapshot exportado (`store-export`) agrega `keywords` (= `searchKeywords`) a cada producto. El buscador de la tienda
(otro repo) lo usará cuando se trabaje allá.

## Carga inicial

Archivo `deploy/synonyms/initial-synonyms.json` (reglas con nombres de categoría) + script que las inserta **inactivas**
en una BD, mapeando nombres de categoría a ids y saltando las categorías que no existan. Se arma analizando el catálogo
de producción de la grande (solo lectura) y la jerga ferretera (sección 7 del doc de factibilidad).

## Migración

Aditiva e idempotente (`IF NOT EXISTS`, `CREATE OR REPLACE`), también en `deploy/fix-schema.sql`. Incluye el re-backfill de
`searchVector` con la nueva normalización (≈10k filas, segundos).

## Pruebas

- Copia local de la BD de la grande: ~100 búsquedas típicas (nombres de productos reales, códigos, marcas, fracciones,
  palabras sueltas) **antes y después** con reglas activadas; verificar que ningún resultado de antes desaparezca
  (salvo el cambio deliberado de fracciones, que se lista aparte).
- Casos: "cabilla 3/8", "cabilla media", "planta electrica", "cable 8", "trozadora", "hierro negro", "1/2", "tubo 1 2".
- Navegador: crear regla, vista previa, activar, buscar en POS, ver keywords en la ficha.

## Fuera de alcance (fases siguientes)

Registro de "búsquedas sin resultado" y sugerencias de sinónimos por IA (Fase 2, desde las búsquedas del bot).
