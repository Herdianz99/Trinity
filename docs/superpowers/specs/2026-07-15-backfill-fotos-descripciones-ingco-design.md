# Backfill de fotos + descripciones desde catálogo INGCO — Diseño

- **Fecha:** 2026-07-15
- **Autor:** Diego + Claude
- **Estado:** Aprobado, pendiente de plan de implementación
- **Empresa piloto:** la **grande** (`134.209.164.59`, ~9.161 productos activos; restore local en `trinity-postgres-1`)

## Contexto

La infraestructura de fotos ya existe (Sesión del 2026-07-05): modelo `ProductImage`
(thumb/medium en Spaces), `Product.primaryImageThumbUrl/MediumUrl`, `SpacesService`,
`processProductImage()` (genera webp thumb+medium) y `ProductImagesService.upload()`.
El problema: de los **9.161 productos activos no-servicio, prácticamente 0 tienen foto**
(1 solo). Cargarlas a mano es inviable.

Los productos están dominados por **marcas de herramientas con catálogo oficial online**
(INGCO 458, WADFOW 481, VERT 474, JADEVER 540, ZAXON 472…). En esas marcas el
`supplierRef` **es el código de modelo del fabricante**, buscable en su web oficial.

## Objetivo

Un script de **una corrida** (backfill) que, para los productos **INGCO** sin foto:
- Encuentre el producto en el catálogo oficial de INGCO Venezuela por su código de modelo.
- Descargue la **foto oficial** y la enlace al producto reutilizando el pipeline existente.
- Extraiga la **descripción/características en español** y la guarde en `Product.description`.
- Sin equivocarse nunca de producto (enlace automático directo, pero con guarda dura).
- Sin poner en riesgo la BD de producción.

## No-objetivos (explícito — NO se hace ahora)

- **Feature permanente en el ERP** (botón/endpoint/job): fuera de alcance. Esto es un script
  tipo `_import-*.ts`, sin UI ni endpoints. La lógica se escribe reutilizable por si a futuro
  se envuelve, pero no se construye nada de eso ahora.
- **Otras marcas** (WADFOW/VERT/JADEVER/ZAXON…): fuera de este piloto. Son marcas hermanas
  de TOTAL GROUP (mismo sitio/estructura), así que el piloto INGCO se replicará casi igual,
  pero se valida INGCO primero.
- **Matcheo por nombre difuso o por código de barras:** descartado. Barcode no existe en la
  data (1 producto). El match es por **código de modelo exacto**.
- **Traducción:** innecesaria; el sitio `/ve/` ya trae el texto en español.
- **Limpieza/reescritura de la descripción:** se guarda **literal** como viene de INGCO
  (decisión del usuario: opción "a"). Solo se normalizan saltos de línea (`<br>` → salto).

## Hallazgos de viabilidad (investigados y confirmados)

1. **Sitio oficial INGCO Venezuela en español:** `https://www.ingco.com/ve/product/{slug}/{MODELO}`.
   El **slug de categoría es cosmético** — el sitio resuelve por el último segmento (código de
   modelo). Basta usar un slug fijo cualquiera: `.../product/x/{MODELO}`.
2. **El código se pasa TAL CUAL** (`supplierRef` sin alterar). Los prefijos son parte del
   código real de INGCO: la `U` (`UPLM6001`) y el `ING-` (`ING-UMMA13018`) **se necesitan** y
   calzan tal cual en el sitio VE. **No se quitan prefijos.** Única higiene: `trim()` de
   espacios sobrantes. Si el código tal cual no matchea, se salta (no se inventa).
3. **Guarda de acierto 100% confiable:** si el modelo existe, el `<title>` de la página trae
   el nombre real del producto; si no existe, el `<title>` viene **vacío**. → Regla:
   **`<title>` vacío = no-match = se salta** (nunca foto ni descripción equivocada).
4. **Descripción:** está server-rendered en el HTML de `/ve/`, en el campo `parameter`
   (visible en el `<div class="parameter-content">`). Es la versión **completa en español**.
   La versión corta que se ve en inglés proviene de `/ve-en/` y **no se usa**.
5. **Foto:** está en el **mismo HTML SSR** de `/ve/`, dentro de `g_initialProps` en el campo
   `productPicList` (array de URLs del CDN `res-de.togroup.com`). El archivo se nombra con el
   **código de modelo** (ej. `.../photo/{timestamp}/CIDLI206681.jpg`). Confirmado: descarga
   `http 200`, `image/jpeg`. → **No hace falta API ni navegador headless**: título +
   descripción + imagen salen del **mismo request**.
6. **SSR intermitente:** con muchos hits seguidos, el sitio empieza a devolver respuestas
   vacías. → El script necesita **reintentos + throttling** (pausa entre productos).

**Resultado del piloto de 10 productos INGCO al azar:** 7 aciertos; los 3 fallos fueron
correctos y seguros (código no listado en VE / código interno no-INGCO) → sin foto, sin error.

## Estrategia de extracción de la foto

**Puro HTTP, del mismo request de la página.** Se hace `fetch` a `.../ve/product/x/{MODELO}`
(con reintentos por el SSR intermitente) y del HTML se parsea `g_initialProps` (JSON) para
leer `productPicList[0]` → la URL de la imagen en el CDN. Se descarga esa URL (`fetch`) para
obtener los bytes. Sin API que reversar, sin navegador headless, sin dependencias nuevas.

La imagen descargada (bytes) pasa **sin cambios** por el pipeline existente:
`processProductImage(buffer)` → thumb+medium webp → `SpacesService.uploadPublic()` →
registro `ProductImage` (primaria si es la primera) → `Product.primaryImageThumbUrl/MediumUrl`.

## Arquitectura de ejecución — 2 fases (seguridad de producción)

**Regla dura: el desarrollo y el scraping pesado NO tocan producción.** Se trabaja contra la
**BD local** (restore de la grande; `productId` idénticos a prod, así los resultados calzan).

### Fase 1 — Scrape (local, CERO contacto con prod)
- Lee de la **BD local** los productos INGCO sin foto (`brand = INGCO`, sin `ProductImage`,
  `supplierRef` no vacío, `isActive`, no `isService`).
- Por cada uno: construye la URL, valida `<title>`, y si matchea baja **foto + descripción**
  (con reintentos + throttling).
- **No escribe en ninguna BD ni Spaces.** Produce un **artefacto local revisable**:
  un directorio con las imágenes descargadas + un `JSON` por producto
  (`{ productId, code, supplierRef, title, imagePath, description, status }`).
- `status` cubre: `matched`, `no-match` (title vacío), `error` (tras reintentos).
- Emite un **resumen** al final: N matcheados / N sin-match / N error, para revisar calidad.

### Fase 2 — Aplicar (en el servidor de la grande, en tandas nocturnas)
- Como la **BD de prod es accesible solo por SSH**, esta fase corre **en el servidor**
  (nunca se expone la BD a internet). El artefacto de la Fase 1 se transfiere al servidor.
- Por cada producto matcheado (**idempotente, solo si sigue sin foto**):
  - Sube thumb+medium a **Spaces** (externo → cero carga de BD).
  - `INSERT` en `ProductImage` (primaria) + `UPDATE Product` (thumb/medium URLs, y
    `description` **solo si está vacía** — no pisa descripciones existentes).
  - Todo en una transacción **por producto** (pequeña, sin locks largos, sin barridos).
- **Throttled** y ejecutable **en tandas** (ej. `--limit N --offset M`) en horario de baja.
- Carga real: ~cientos de escrituras de una fila, goteadas → despreciable para Postgres.

## Datos que se escriben (solo en Fase 2, solo prod)

- `ProductImage`: filas nuevas (thumbKey, mediumKey, isPrimary, bytes, width, height…).
- `Product`: `primaryImageThumbUrl`, `primaryImageMediumUrl`, y `description`
  (**solo si estaba vacía**).
- **Nada más.** No toca stock, precios, costos, ni ninguna otra tabla.

## Seguridad y reversibilidad

- **Idempotente:** re-correr no duplica (salta productos que ya tienen foto).
- **Solo-faltantes:** nunca pisa fotos ni descripciones existentes.
- **Guarda de match:** `<title>` vacío → se salta. Sin match difuso → sin foto errada.
- **Reversible:** si una foto quedó mal, se borra con el flujo existente
  (`ProductImagesService.remove`, que limpia Spaces + reasigna primaria).
- **Throttling + reintentos:** amable con el sitio de INGCO y robusto ante su SSR intermitente.

## Criterios de éxito

- Fase 1 corre en local y produce el artefacto con un % de aciertos razonable sobre los 458
  INGCO (esperado alto en códigos INGCO-format; los no-listados/no-INGCO se saltan limpio).
- Cero fotos/descripciones equivocadas en una revisión por muestreo del artefacto.
- Fase 2 aplica en prod (grande) sin impacto perceptible para los usuarios trabajando.
- Los productos con foto se ven correctamente en el POS (thumb) usando el pipeline existente.

## Extracción — resumen técnico (confirmado, sin items abiertos)

De **un solo `fetch`** a `https://www.ingco.com/ve/product/x/{MODELO}` (reintentos hasta que
el SSR renderice) se obtienen las 3 cosas del `g_initialProps` / HTML:
- `<title>` → **guarda** (vacío = no-match = se salta).
- `parameter` (`<div class="parameter-content">`) → **descripción** en español (literal).
- `productPicList[0]` → **URL de la imagen** en el CDN; se descarga aparte para los bytes.

Sin dependencias nuevas: `fetch` global (Node 24), `cheerio` (ya en `apps/api`) para el HTML,
y el pipeline de imágenes existente.
