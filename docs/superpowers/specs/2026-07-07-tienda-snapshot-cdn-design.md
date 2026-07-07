# Tienda Online — Diseño (Snapshot al CDN, Trinity = única fuente de verdad)

**Fecha:** 2026-07-07
**Estado:** Diseño aprobado (Diego eligió "Snapshot al CDN / single source" el 2026-07-07).
**Reemplaza a:** el enfoque *Overlay* de `docs/superpowers/plans/2026-07-07-tienda-fase1-catalogo.md`.
**Empresa objetivo:** grande / inversiones (`inversiones.eltrebol.app`). El mismo diseño sirve para eltrebol si se quiere después.

---

## 1. Problema

El jefe de la grande quiere **tienda online lo antes posible**. Ya existe una vitrina Next.js bien diseñada (`trebol-shop`, hospedable en Vercel) que hoy carga su catálogo por Excel en una BD propia (Supabase) — poco práctico y desconectado del ERP. Queremos:

1. Que la tienda muestre **precio, disponibilidad y foto reales** del inventario de Trinity, siempre al día.
2. Que **no ponga lento el POS** (la caja registradora es sagrada: ~300 facturas/día, 15-20 usuarios).
3. **Una sola fuente de verdad** (principio de Trinity single-tenant): el catálogo lo manda Trinity, no una segunda BD que haya que sincronizar a mano.
4. Reutilizar la infraestructura que **ya se paga**: DigitalOcean Spaces + CDN (~$5/mes), hoy usado para fotos de producto.

## 2. Decisión de arquitectura: Snapshot al CDN

Trinity **exporta el catálogo como archivos JSON estáticos a Spaces**, y la vitrina los lee del **mismo CDN** que ya sirve las fotos. Navegar la tienda **no toca la BD del POS**. Trinity solo recibe la **escritura del pedido**.

```
LECTURA (navegar) — cero carga al POS
  Trinity ──export JSON──▶ Spaces/CDN ──▶ Vitrina (Vercel, ISR) ──▶ Comprador

ESCRITURA (pedir) — bajo volumen, sí toca Trinity
  Comprador ──▶ Vercel ──▶ POST /public/orders ──▶ OnlineOrder ──▶ pantalla "verificar Pago Móvil"
```

### Por qué este enfoque (vs Overlay/live-API descartado)
- **Aislamiento total del POS al navegar:** el path de lectura y el POS no comparten nada en tiempo de request (ni query, ni event-loop del droplet). Es el máximo blindaje posible.
- **Una sola fuente de verdad:** Trinity manda qué productos existen, su precio, stock, categoría, marca y foto. Se **elimina la BD y el panel admin de la tienda** (redundantes con Trinity).
- **Reutiliza el CDN pagado:** catálogo **y** fotos salen del mismo Spaces. $0 extra de infra.
- **Trade-off aceptado (frescura):** el catálogo es tan fresco como el intervalo de export (objetivo: ≤10 min, o disparo manual). Para una tienda es más que suficiente; el stock exacto se valida al **confirmar el pedido** contra la BD viva.

## 3. Contratos de datos (archivos en Spaces)

Prefijo en el bucket: `store/`. Dos archivos, `Cache-Control: max-age=60, s-maxage=60` (no `immutable`, porque cambian).

### `store/catalog.json`
Lista completa de productos publicados. Un solo archivo (2 PUTs por export → barato). El SSR de Vercel lo baja una vez por ISR y renderiza; el JSON grande **nunca llega al navegador** del comprador.

```jsonc
{
  "generatedAt": "2026-07-07T18:00:00.000Z",
  "rate": 40.25,                       // tasa BCV usada para priceBs
  "products": [
    {
      "slug": "taladro-bosch-gsb-13-re-her00001",
      "code": "HER00001",              // = Product.code (identificador estable)
      "name": "Taladro Bosch GSB 13 RE",
      "description": "Taladro percutor 650W...",
      "priceUsd": 89.90,
      "priceBs": 3618.48,              // priceUsd * rate, redondeado a 2
      "stockStatus": "disponible",     // "disponible" | "pocas" | "agotado"
      "image": "https://trinity-inversiones.nyc3.cdn.digitaloceanspaces.com/.../medium.webp",
      "thumb": "https://trinity-inversiones.nyc3.cdn.digitaloceanspaces.com/.../thumb.webp",
      "categorySlug": "herramientas-electricas",
      "brandSlug": "bosch",
      "featured": true
    }
  ]
}
```

### `store/meta.json`
Taxonomía + tasa. Alimenta menús, home y páginas de categoría/marca.

```jsonc
{
  "generatedAt": "2026-07-07T18:00:00.000Z",
  "rate": 40.25,
  "categories": [ { "slug": "herramientas-electricas", "name": "Herramientas Eléctricas", "productCount": 128 } ],
  "brands":     [ { "slug": "bosch", "name": "Bosch", "productCount": 64 } ]
}
```

### Reglas del snapshot
- **Publicación:** solo `Product.isActive === true && Product.showInStore === true`.
- **`stockStatus` (3 niveles, secuencia — requisito de Diego):** suma del stock en todos los almacenes → `agotado` si `total <= 0`; `pocas` si `total <= LOW_STOCK_THRESHOLD` (5, configurable); si no `disponible`. **Nunca se expone el número exacto.**
- **`priceUsd` = `Product.priceDetal`** (precio detal con IVA, ya calculado y guardado). `priceBs = round(priceDetal * rate, 2)`. `rate` = `ExchangeRate` más reciente; si no hay, `rate = 0` y `priceBs = 0` (la UI puede ocultar Bs).
- **`slug`** se genera determinísticamente: `slugify(name) + '-' + code.toLowerCase()`. Incluye el `code` (único) → estable aunque cambie el nombre. Categorías/marcas: `slugify(name)` con dedupe (sufijo `-2`, `-3`… si colisiona).
- **Fotos:** `image`/`thumb` = `primaryImageMediumUrl`/`primaryImageThumbUrl` (URLs del CDN de Spaces ya denormalizadas en `Product`). Pueden ser `null` (la tarjeta cae al logo de marca / placeholder, lógica que ya existe).
- **Curación de marketing (NO catálogo):** iconos de categoría, logos/país de marca, **banners** y hero **no viven en Trinity**. Son *chrome* de presentación → se mantienen como un **archivo de config estático en el repo de la tienda** (`lib/store-config.ts`), mapeado por slug. No es una "segunda fuente de verdad del catálogo": es solo estética editable por git. (Si a futuro se quiere admin de banners, se evalúa aparte.)

## 4. Cambios en Trinity (schema)

Mínimos, para no ensuciar el ERP:
- `Product.showInStore Boolean @default(false)` — controla qué sale a la tienda.
- `Product.storeFeatured Boolean @default(false)` — destacado en el home de la tienda.
- (El `slug` **no** se guarda: se genera en el export. `icon`/`logo`/`country`/`description` de marca/categoría no se agregan: son marketing → `store-config.ts`.)

Migración `IF NOT EXISTS` + espejo en `deploy/fix-schema.sql` (regla del proyecto). UI para marcar `showInStore`/`storeFeatured`: casilla en el form de producto y/o acción masiva en `/catalog/price-adjustment` (fase de catálogo; ver plan).

## 5. Pedidos online (subsistema 2)

**Requisito crítico:** el pedido online **NO** puede ser una pre-factura `PENDING` — el cron nocturno (`quotations-cron`) las **borra** de madrugada. Debe ser un modelo propio con estado propio.

- **Modelo nuevo `OnlineOrder`** (+ `OnlineOrderItem`), correlativo `WEB-0001`. Estados: `POR_VERIFICAR → CONFIRMADO → FACTURADO → CANCELADO`.
- **Endpoint `POST /public/orders`** (sin auth, con rate-limit): recibe contacto (nombre, **teléfono** obligatorio, cédula) + método de entrega (retiro/delivery) + referencia de Pago Móvil + items (`code`, `qty`). El backend **re-valida** que cada `code` exista/esté activo y **recalcula el precio y el total desde Trinity** (nunca confía en el precio que manda el cliente) y verifica stock. Crea `OnlineOrder` en `POR_VERIFICAR`. Devuelve `{ number }`.
- **Pantalla en Trinity `/store/orders`** (permiso de sección `store`): lista de pedidos, detalle, botón "Confirmar pago" (verificación manual del Pago Móvil) → pasa a `CONFIRMADO`. Desde ahí sigue el flujo normal (facturación/despacho) — la conversión `OnlineOrder → Invoice` puede ser manual en Fase 1 (el cajero factura con los datos a la vista) y automatizarse en Fase 2.
- **Vitrina:** su `app/api/orders/route.ts` deja de escribir en su BD y hace `POST` a `/public/orders` de Trinity.

## 6. Vitrina (refactor)

Regla de oro: **no cambiar las firmas** de `lib/db.ts` → la UI (componentes/páginas) no se toca salvo los textos de stock.

- **Se reescribe `lib/db.ts`** para leer `catalog.json`/`meta.json` del CDN (con `fetch` + `next: { revalidate: 300 }`) y filtrar en memoria. Mismas funciones (`getAllProducts`, `getFeaturedProducts`, `getCategoryBySlug`, `getBrandBySlug`, `getProductBySlug`, `getRelatedProducts`, `searchProducts`, `getActiveBanners`).
- **Stock 3 niveles en UI:** `ProductCard` y `ProductDetailClient` muestran `Disponible / Pocas unidades / Agotado` desde `stockStatus`, sin número.
- **Fotos:** `cloudinaryUrl()` deja pasar directo las URLs de `digitaloceanspaces.com`.
- **Se elimina:** `prisma/`, `app/admin/*`, `lib/admin-*.ts`, `lib/auth.ts`, `lib/prisma.ts`, `middleware.ts`, y deps `prisma`/`pg`/`bcryptjs`/`next-auth`/`recharts`. Banners/curación → `lib/store-config.ts`.

## 7. Rendimiento y protección del POS

- **ISR en Vercel (capa 1):** cada página revalida a 300s → el CDN sirve casi todo desde el edge global. El comprador ve todo rapidísimo; Vercel baja el snapshot ~1 vez cada 5 min.
- **CDN de Spaces (capa 2):** el snapshot se sirve del CDN, no del droplet. Navegar = 0 requests a Trinity.
- **Rate-limit + hardening en `/public/*`:** `@nestjs/throttler` (60 req/min/IP) + `helmet` + `compression`, acotado a la superficie pública (para el endpoint de pedidos y cualquier lectura pública futura).
- **CORS:** la vitrina llama a Trinity **server-to-server** desde Vercel (SSR) → CORS del navegador no aplica. Aun así se permite el dominio de la tienda en `/public/*` como buena práctica.

## 8. Fuera de alcance (Fase 2+)

- Conversión automática `OnlineOrder → Invoice`.
- Verificación automática de Pago Móvil por API bancaria; pagos online.
- Cuentas de cliente / historial en la tienda; delivery con tracking.
- Admin de banners/curación dentro de Trinity (hoy `store-config.ts`).
- Export **event-driven** (hoy: cron + trigger manual). Si hace falta más frescura, disparar el export al procesar compras / cambios de precio.
- Búsqueda con relevancia server-side dedicada (hoy: filtro sobre el snapshot cacheado).

## 9. Decisiones fijadas (2026-07-07)

1. Arquitectura **Snapshot al CDN**, Trinity = única fuente de verdad. ✅
2. Stock en **3 niveles** `Disponible / Pocas unidades / Agotado` (umbral 5, configurable), sin número exacto. ✅
3. Catálogo (productos/precio/stock/categorías/marcas/fotos) lo manda **Trinity**; marketing (iconos/logos/banners/hero) vive en `store-config.ts` de la tienda. ✅
4. Se **elimina** la BD y el admin de la tienda. ✅
5. Pedido online = **modelo `OnlineOrder` propio** (nunca pre-factura); verificación manual de Pago Móvil en Trinity. ✅
6. Solo salen productos con `showInStore` (y foto recomendada, no obligatoria). ✅
