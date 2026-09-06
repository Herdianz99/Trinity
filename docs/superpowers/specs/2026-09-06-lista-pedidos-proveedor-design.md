# Lista de Pedidos a Proveedor — Diseño

**Fecha:** 2026-09-06
**Estado:** Aprobado el diseño, pendiente plan de implementación

## Problema

El personal de **compras** arma sus pedidos a proveedores en un Excel (les resulta más
libre y sencillo). El problema es de **visibilidad**: **ventas** no se entera de si un
artículo que un cliente necesita ya fue pedido, si el proveedor no lo tenía, o en qué
estado va. Hoy esa información vive solo en el Excel de compras.

## Objetivo

Una **lista compartida de pedidos a proveedor** que:

1. Se pueda **cargar desde el Excel** que compras ya usa (para no cambiarles el flujo).
2. Permita **registrar artículos manualmente** en la lista (sin pasar por Excel).
3. Sea **consultable por los vendedores** (solo lectura) con un **buscador**.
4. Marque un artículo como **recibido automáticamente** cuando se procesa una factura de
   compra que lo contiene, guardando **fecha de pedido** y **fecha de recibido**.

## No-objetivos (YAGNI)

- No reemplaza el módulo de factura de compra (`purchase-orders`, FC-xxxxx). Esto **no**
  mueve inventario, ni costos, ni CxP.
- No maneja estado "parcial": si el proveedor despacha menos de lo pedido, se marca
  **recibido** y se guarda la **cantidad que llegó**. Sin lógica de faltante/backorder.
- No agrupa por "pedido/lote" ni por proveedor: es una **lista plana** de artículos.

## Decisiones tomadas (Q&A con el usuario)

- **Organización:** lista plana de artículos (cada fila es un artículo pedido).
- **Al recibir:** se guarda cantidad recibida; sin estado "parcial" (los proveedores
  despachan lo que tienen).
- **Enlace a producto:** el "CODIGO" del Excel es la **ref. proveedor**. El cruce compara
  **primero `supplierRef`** y luego el **código interno** (`code`), por si a futuro
  empiezan a usar el código del sistema.
- **Vista/filtros:** tabs `Todos` · `Pedidos` (en tránsito) · `Recibidos`. En "Todos", los
  recibidos llevan badge verde **"Recibido"** para diferenciarlos de los que están **en
  tránsito**.
- **Observación:** el Excel no la trae, pero la BD sí tiene campo `observation` **editable**
  desde la lista.
- **Multi-pendiente (FIFO):** si el mismo artículo está pendiente en varias filas y llega
  una compra, se marca recibido **solo el pendiente más antiguo** de ese código.

## Arquitectura

Módulo **nuevo e independiente**, separado del módulo contable `purchase-orders`.

- **API (NestJS):** módulo `purchase-requests` (`apps/api/src/modules/purchase-requests/`).
- **Web (Next.js):** ruta bajo `(dashboard)/purchases/pedidos` con menú propio "Pedidos".
- **Permisos:** nueva clave de módulo `pedidos`.
  - **Ver:** `SELLER`, `CASHIER` (solo lectura), además de `BUYER`, `SUPERVISOR`,
    `ADMIN`, `ACCOUNTANT`.
  - **Editar** (crear, cargar Excel, marcar recibido, editar observación, borrar):
    solo `BUYER`, `SUPERVISOR`, `ADMIN`. Se aplica con guard de rol en el controller.

### Modelo de datos

Una sola tabla `SupplierOrderItem` (Prisma). Migración aditiva con `IF NOT EXISTS`.

```prisma
enum SupplierOrderStatus {
  PENDING   // "en tránsito" / pedido
  RECEIVED
}

model SupplierOrderItem {
  id                      String              @id @default(cuid())
  supplierRef             String              // "CODIGO" del Excel = ref. proveedor
  productId               String?             // enlace al producto si se encontró
  productCode             String?             // snapshot del código interno si matcheó
  description             String              // "DESCRIPCION" del Excel o manual
  quantityOrdered         Float               // "CANTIDAD"
  unitCost                Float?              // "COSTO" (USD), opcional
  supplierName            String?             // proveedor (texto libre; el Excel no lo trae)
  observation             String?             // editable desde la lista
  status                  SupplierOrderStatus @default(PENDING)
  orderedAt               DateTime            // fecha del pedido (día de carga o manual)
  receivedAt              DateTime?           // se llena al recibir
  quantityReceived        Float?              // cantidad que llegó
  receivedPurchaseOrderId String?             // FC que lo surtió (si fue automático)
  product                 Product?            @relation(fields: [productId], references: [id])
  createdById             String?
  createdAt               DateTime            @default(now())
  updatedAt               DateTime            @updatedAt

  @@index([status])
  @@index([supplierRef])
  @@index([orderedAt])
}
```

Notas de fecha/timezone (regla del proyecto): `orderedAt` en carga de Excel = **hoy en
Caracas** (`caracasDayStart()`/ hora actual). No usar `setUTCHours`.

### Cruce automático "recibido"

Hook al final de `PurchaseOrdersService.processBill` (cuando la FC pasa a `PROCESSED`),
dentro de la misma transacción. Por cada ítem de la factura de compra:

1. Buscar `SupplierOrderItem` con `status = PENDING` que coincidan, en orden de prioridad:
   1. `pending.productId == billItem.productId` (más fuerte)
   2. `pending.supplierRef == product.supplierRef`
   3. `pending.supplierRef == product.code`
2. De los que coincidan, tomar **solo el más antiguo** por `orderedAt` (FIFO).
3. Actualizarlo: `status = RECEIVED`, `receivedAt = processedAt`,
   `quantityReceived = billItem.quantity`, `receivedPurchaseOrderId = order.id`.

Si ninguna fila pendiente coincide, no pasa nada (la compra sigue normal). El hook nunca
debe hacer fallar el procesamiento de la factura (envolver en try/catch defensivo o
dentro de la misma tx pero sin lógica que pueda lanzar por datos faltantes).

También existe **"Marcar recibido" manual** (endpoint aparte) para artículos que llegan
fuera del sistema: setea `status=RECEIVED`, `receivedAt = ahora`, `quantityReceived`
opcional ingresada por el usuario.

### Carga de Excel

Endpoint `POST /purchase-requests/upload` (multipart), usa la lib `xlsx` ya presente.

- Detectar la fila de encabezado buscando la celda "CODIGO"; ignorar la fila de empresa,
  encabezados, filas vacías y la fila de "TOTAL".
- Columnas esperadas: `CODIGO`, `CANTIDAD`, `COSTO`, `DESCRIPCION` (la de `TOTAL` se
  ignora; `observation` no viene en el Excel).
- **Preview antes de confirmar:** el endpoint de preview devuelve, sin escribir nada:
  total de filas válidas, cuántas enlazan a un producto (por `supplierRef`, luego `code`)
  y cuántas quedaron sin enlazar. El usuario confirma y recién ahí se insertan con
  `orderedAt = hoy`, `status = PENDING`.

### API — endpoints

- `GET  /purchase-requests` — lista con `?status=PENDING|RECEIVED|ALL`, `?search=` (ref +
  descripción, server-side, debounce en el front), paginación.
- `POST /purchase-requests` — crear artículo manual. (rol edición)
- `POST /purchase-requests/upload/preview` — parsea Excel y devuelve resumen. (rol edición)
- `POST /purchase-requests/upload/confirm` — inserta las filas parseadas. (rol edición)
- `PATCH /purchase-requests/:id` — editar (observación, cantidad, etc.). (rol edición)
- `POST /purchase-requests/:id/receive` — marcar recibido manual. (rol edición)
- `DELETE /purchase-requests/:id` — borrar. (rol edición)

### Frontend

Página `(dashboard)/purchases/pedidos/page.tsx`:

- `document.title = 'Pedidos | Trinity ERP'` (useEffect `[]`).
- **Tabs:** `Todos` · `Pedidos` · `Recibidos`.
- **Buscador** server-side con debounce (ref/código + descripción).
- **Tabla:** Ref · Descripción · Cant. pedida · Costo · Proveedor · Observación · Fecha
  pedido · Estado (badge: "En tránsito" / verde "Recibido") · Fecha recibido · Cant.
  recibida.
- **Acciones (solo compras):** botón "Cargar Excel" (con modal de preview), "Agregar
  artículo" (form manual), "Marcar recibido" por fila, editar observación inline, borrar.
- **Ventas:** ve la tabla, tabs y buscador en solo lectura (sin botones de edición).
- Seguir skills `frontend-design` y `vercel-react-best-practices`.

## Manejo de errores

- Excel con formato inesperado (sin fila "CODIGO", columnas faltantes): el preview
  responde error claro sin insertar nada.
- Filas con `CODIGO` o `DESCRIPCION` vacíos: se omiten en el parseo y se cuentan como
  "descartadas" en el preview.
- El hook de cruce en `processBill` no debe romper el procesamiento de la factura.

## Pruebas

- Parseo del Excel real (`Formato Pedido.xlsx`): 5 artículos, ignora empresa/encabezado/
  vacías/TOTAL.
- Enlace por `supplierRef` y fallback a `code`.
- Cruce FIFO: 2 pendientes del mismo código → una compra marca solo el más antiguo.
- Marcado manual.
- Permisos: un `SELLER` puede `GET` pero recibe 403 en endpoints de edición.
```
