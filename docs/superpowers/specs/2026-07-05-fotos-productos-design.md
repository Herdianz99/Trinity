# Fotos de productos (Spaces + CDN) — Diseño

- **Fecha:** 2026-07-05
- **Autor:** Diego + Claude
- **Estado:** Aprobado, pendiente de plan de implementación

## Contexto

Trinity hoy **no tiene fotos de productos**. El modelo `Product` no tiene ningún campo de
imagen y no existe infraestructura de subida de archivos en el API (ni multer, ni S3, ni
`sharp`). Lo único parecido es `CompanyConfig.stampImage` (sello/firma para PDFs), guardado
como **base64 en una columna `@db.Text`** — justamente el anti-patrón que queremos evitar:
meter binarios en Postgres hincha la BD y los dumps, y no escala.

Los vendedores hoy se guían por el **nombre** y sobre todo por el **código** pegado al
artículo. Quieren ver la **foto** al buscar en el POS para saber qué están vendiendo, y
poder **mostrársela al cliente** cuando no tienen el producto a la mano.

## Objetivo

Agregar fotos a los productos de forma que:
- Carguen **rápido en el POS** con ~10.000 productos (miniaturas livianas vía CDN).
- La optimización sea **automática** (el usuario nunca redimensiona ni comprime).
- Soporte **varias fotos por producto** (aunque se empiece con una).
- No ensucie la BD ni el respaldo (binarios fuera de Postgres).
- Deje el modelo y las URLs **listos para reusar en la web futura**.

## No-objetivos (explícito — NO se hace ahora)

- La **página web / catálogo online**: fuera de alcance. El modelo y el CDN quedan listos
  para reusar, pero no se construye nada de web aquí.
- **Transformación de imágenes al vuelo** (estilo Cloudinary): no se necesita porque
  controlamos la subida y optimizamos en ese momento.
- Migrar `stampImage` fuera de la BD: es otro tema, no se toca.
- Reconocimiento/recorte automático, watermarks, edición: YAGNI.

## Decisión de arquitectura: Spaces + CDN

**DigitalOcean Spaces** (object storage S3-compatible, con **CDN incluido**), un bucket
por empresa. Se evaluaron 3 caminos:

1. **Spaces + CDN (elegido):** ~$5/mes por empresa (250 GB + 1 TB transferencia; sobra por
   años). Costo **plano y predecible**, no toca el droplet, respaldo redundante en DO,
   **portable** (S3-compatible, sin lock-in). Nosotros generamos los tamaños al subir con
   `sharp`.
2. **Cloudinary:** optimización al vuelo potente, pero modelo de **créditos** que puede
   **suspender la cuenta** al sobrepasar (peligroso para una herramienta de negocio) y
   costo impredecible con tráfico web. Descartado.
3. **En el droplet (nginx):** $0 pero el server de la app sirve las fotos (compite con el
   API en pico), engorda disco y respaldo, escala peor. Descartado.

La optimización **es automática** en Spaces: nuestro API la hace **una sola vez al subir**;
el personal solo toma la foto y le da "Subir".

## Modelo de datos

**`ProductImage`** (tabla nueva, relación 1-a-muchos con `Product` desde el día 1)
- `id String @id @default(cuid())`
- `productId String` + relación `product Product @relation(..., onDelete: Cascade)`
- `thumbKey String` — ruta del objeto en el Space (miniatura ~150px)
- `mediumKey String` — ruta del objeto en el Space (grande ~800px)
- `isPrimary Boolean @default(false)` — la que se muestra en la lista del POS
- `sortOrder Int @default(0)`
- `bytes Int?` · `width Int?` · `height Int?` (metadata de la versión grande)
- `createdById String` · `createdAt DateTime @default(now())`
- `@@index([productId])`
- **Invariante (en código):** a lo sumo un `isPrimary = true` por producto; si el producto
  tiene fotos, exactamente uno es primary.

**`Product`** (denormalización para velocidad del POS)
- Nuevo `primaryImageThumbUrl String?` — URL CDN lista para usar de la miniatura principal.
  Se actualiza al subir/borrar/cambiar la foto principal. Permite que la búsqueda del POS
  (top 20) muestre la foto **sin JOIN ni query extra**. Mismo patrón que los montos en Bs.

**Migración** (`IF NOT EXISTS`, según regla del proyecto) + espejo en `deploy/fix-schema.sql`.
Las URLs se construyen a partir de un base de CDN configurable (`SPACES_CDN_BASE`), así que
si el dominio del CDN cambiara, se regeneran con un script; los `*Key` son estables.

## Pipeline de subida + optimización (API)

Dependencias nuevas: **`sharp`** (procesamiento de imágenes) + **`@aws-sdk/client-s3`**
(cliente S3-compatible que funciona con Spaces) + **`multer`** (recepción multipart, ya
viene con `@nestjs/platform-express`).

Módulo nuevo **`ProductImagesModule`** (`apps/api/src/modules/product-images/`):
- `POST /products/:id/images` — subida multipart (memory storage, límite ~15 MB). Pipeline:
  1. Validar mime (`image/jpeg|png|webp|heic`).
  2. `sharp` → **miniatura ~150px** + **grande ~800px**, ambas **WebP calidad 80**.
  3. Subir ambas al Space (`putObject`, ACL public-read) bajo
     `products/{productId}/{cuid}-thumb.webp` y `...-medium.webp`.
  4. Crear fila `ProductImage`. Si es la primera foto → `isPrimary = true` y actualizar
     `Product.primaryImageThumbUrl`.
- `PATCH /products/:id/images/:imageId` — marcar principal / reordenar (`sortOrder`). Al
  cambiar la principal, actualizar `Product.primaryImageThumbUrl`.
- `DELETE /products/:id/images/:imageId` — borra los objetos del Space (`deleteObject`) y la
  fila. Si era la principal, promueve la siguiente (por `sortOrder`) y actualiza la
  denormalización.
- `POST /products/images/bulk` — **flujo C** (ver abajo).

Servicio de storage aislado (`SpacesService`) que encapsula el cliente S3 y la construcción
de URLs de CDN. Las credenciales viven solo en el server (nunca llegan al cliente).

**Nota HEIC:** las fotos de iPhone pueden venir en HEIC; la captura por navegador suele
entregar JPEG, pero `sharp` cubre HEIC si aparece. El flujo móvil pide JPEG cuando se puede.

## Flujos de subida (frontend) — en orden de prioridad

**B — Sesión de fotos móvil (PRIORIDAD 1).** Página mobile-first (`/catalog/photo-session`)
que **reusa el escáner de código de barras existente** (`@zxing/browser`, ya usado en el POS):
escanear código de barras (o buscar por código/nombre) → resolver producto → mostrar
nombre+código y fotos actuales → cámara (`<input capture>`) → subir → confirmación → siguiente.
Bucle rápido para fotografiar muchos productos seguidos (backlog de 10k + día a día).

**C — Carga masiva por lote (PRIORIDAD 2).** Página (`/catalog/photo-bulk`): arrastrar
varios archivos → el sistema matchea por **nombre de archivo (sin extensión) = código
Trinity O `supplierRef`** → tabla de resultados **matcheados / ambiguos / sin match**.
Como `supplierRef` **no es único**, los casos ambiguos (misma referencia en 2+ productos) se
**reportan y NO se asignan** — nunca adivinar. Solo se suben los matcheados sin ambigüedad.

**A — Desde la pantalla del producto (base).** Sección "Fotos" en el detalle/edición del
producto: galería de miniaturas, agregar, borrar, marcar principal, reordenar.

## Dónde aparecen las fotos

- **POS (lista y grid de búsqueda):** miniatura junto a nombre+código, vía
  `Product.primaryImageThumbUrl` (sin query extra). Placeholder si el producto no tiene foto.
- **POS "mostrar al cliente":** tocar el producto abre la versión **grande** en un
  modal/lightbox.
- **Detalle del producto:** galería con todas las fotos.

## Infraestructura, configuración y respaldos

- Por empresa: un Space + CDN activado. Config por variables de entorno:
  `SPACES_ENDPOINT`, `SPACES_REGION`, `SPACES_BUCKET`, `SPACES_KEY`, `SPACES_SECRET`,
  `SPACES_CDN_BASE`.
- Objetos con **lectura pública** (las fotos de producto no son secretas) → el CDN las sirve
  directo, sin tocar el droplet. Las subidas van firmadas server-side con la llave secreta.
- **Respaldos:** las imágenes viven en Spaces (redundante en DO) y **NO entran al dump de
  Postgres** → el respaldo sigue chico y rápido (objetivo central). Solo las filas
  `ProductImage` (texto) van en el dump. Al restaurar la BD, las URLs siguen válidas porque
  los objetos están en Spaces.
- Deploy: agregar las variables en cada server; `pnpm install` trae `sharp`/`aws-sdk`.
  `sharp` usa binarios nativos que instalan bien en el Ubuntu de los servers (Node 20, PM2).

## Permisos y defaults

- **Permiso nuevo `MANAGE_PRODUCT_IMAGES`** (enum `PermissionKey`), por defecto para
  **ADMIN + WAREHOUSE** (los que manejan catálogo/inventario). Guardado en backend con el
  patrón de permisos existente.
- **Tamaños/calidad:** miniatura 150px, grande 800px, WebP 80%. Ajustables por constante.
- **Formatos aceptados:** JPEG/PNG/WebP/HEIC. Límite de subida ~15 MB.

## Alcance por fases

- **Fase 1 (MVP):** modelo de datos (`ProductImage` + `Product.primaryImageThumbUrl`) +
  `SpacesService` + pipeline de subida (`POST/PATCH/DELETE`) + **flujo B** + miniatura en el
  POS + lightbox "mostrar al cliente". Es el valor central.
- **Fase 2:** **flujo C** (masivo por código/`supplierRef`) + **flujo A** (galería en el
  detalle del producto) + gestión multi-foto completa (reordenar, principal).
- **Web:** fuera de alcance; el modelo y las URLs del CDN quedan listos para reusar.

## Riesgos y consideraciones

- **`sharp` en el server:** verificar que los binarios nativos instalen en el entorno de
  deploy (Ubuntu/PM2). Bajo riesgo (prebuilds oficiales para linux-x64).
- **`supplierRef` no único** (flujo C): resuelto reportando ambiguos sin asignar.
- **Costo:** plano en $5/mes/empresa mientras no se superen 250 GB / 1 TB transferencia —
  muy lejos para fotos internas de producto.
- **Orfandad de objetos:** si se borra un `Product`, el `onDelete: Cascade` limpia las filas
  `ProductImage` pero NO los objetos en Spaces. Considerar una limpieza (borrar objetos al
  borrar producto, o un job de barrido). Se detalla en el plan.
