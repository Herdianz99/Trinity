# Portal de pedidos para clientes (mayorista) — Diseño

**Fecha:** 2026-10-10 · **Sesión:** 156 · **Estado:** aprobado por el usuario, pendiente de plan

## Objetivo

Que clientes seleccionados de la empresa mayorista (trebolmayor) entren a Trinity con su propio
usuario y monten sus pedidos (uno o varios a la vez), que quedan como **facturas en espera**
normales. El cliente va agregando productos durante días; la empresa los procesa (cobra/factura)
en el POS el día del despacho. El cliente no cobra, no toca descuentos ni precios y no ve nada
de otros clientes ni datos internos (costos, márgenes, proveedores).

Además, el cliente ve sus facturas (con PDF) y su estado de cuenta (CxC).

Decisiones tomadas con el usuario:
- **Pantalla propia** ("portal"), NO el POS con un rol recortado (el POS tiene >4.000 líneas y
  muchas funciones que habría que esconder una por una).
- Precio y tasa: **los del día del despacho** (el POS ya recalcula al retomar/guardar/cobrar).
- El cliente ve **stock y disponible**.
- Bloqueo al procesar: **igual que hoy** ("en uso, no se puede modificar").
- Cada cliente tiene un **vendedor asignado** (campo nuevo en la ficha).
- Sin tasa BCV del día no se puede guardar (comportamiento actual, aceptado).
- Aviso al personal: **dentro del sistema** (contador + pantalla). Push al teléfono: posible fase futura.
- **Varios pedidos abiertos** por cliente.
- Borrado nocturno: opción en `/config` que **no borra ninguna factura en espera** de la empresa.
- Huecos existentes A (cualquiera borra facturas en espera ajenas) y B (el servidor no valida
  precio editado) **se dejan como están** por ahora.

## Fuera de alcance (v1)

- Notificaciones push / WhatsApp.
- Pagos del cliente desde el portal.
- Que el cliente cree o edite su ficha, elija método de pago o vea otros clientes.
- Cambios a cómo el personal borra facturas en espera o edita precios (huecos A y B).

## 1. Modelo de datos (una migración, todo con `IF NOT EXISTS`)

- `enum UserRole`: nuevo valor `CLIENT` (`ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CLIENT'`).
- `User.customerId String? @unique` → `Customer` (vínculo usuario ↔ ficha de cliente).
- `Customer.sellerId String?` → `Seller` ("Vendedor asignado").
- `Invoice`:
  - `fromPortal Boolean @default(false)` — creado por un cliente en el portal.
  - `portalNote String?` — nota del cliente para identificar el pedido ("Obra Los Pinos").
  - `clientUpdatedAt DateTime?` — última modificación hecha por el cliente.
  - `staffSeenAt DateTime?` — última vez que alguien de la empresa lo vio.
  - índice `(fromPortal, status)`.
- `CompanyConfig`:
  - `clientPortalEnabled Boolean @default(false)` — "Pedidos de clientes en línea".
  - `keepPendingInvoices Boolean @default(false)` — "Conservar facturas en espera (no borrarlas a medianoche)".
- Agregar las columnas también a `deploy/fix-schema.sql` (red de seguridad del deploy).

Un pedido "nuevo/modificado sin ver" = `fromPortal AND status = PENDING AND
(staffSeenAt IS NULL OR clientUpdatedAt > staffSeenAt)`.

## 2. Permisos

- `role-permissions.ts`: `CLIENT: ['portal']`. Módulo nuevo `pedidos-clientes` agregado a
  `VALID_MODULES`, a la matriz de la UI (`settings/role-permissions`) y por defecto a SELLER,
  CASHIER y SUPERVISOR (ADMIN tiene `*`). `CLIENT` se agrega a `ROLE_ORDER`/etiquetas donde
  corresponda (usuarios, matriz).
- `ROUTE_PERMISSION_MAP` (middleware web): `/sales/pedidos-clientes` → `pedidos-clientes`.

## 3. Seguridad en el servidor

**Guardia global `ClientPortalGuard`** (APP_GUARD, corre después de la autenticación JWT):
- Si `user.role !== 'CLIENT'` → no hace nada (resto de roles sin cambios).
- Si es CLIENT: solo deja pasar rutas marcadas con el decorador `@PortalAllowed()` (todo el
  controlador `/portal/*` y, en auth, `me`, `change-password`, `refresh`, `logout`). Cualquier otra
  ruta → 403, aunque no tenga candado propio.
- Si `clientPortalEnabled` es false → 403 en todo (salvo `logout`). Login de un CLIENT con el
  portal apagado → rechazado con mensaje "El portal de clientes no está habilitado".
- El `customerId` se resuelve **siempre en el servidor** desde el usuario (consulta a BD, no del
  body ni del token). Usuario inactivo o ficha de cliente inactiva → 403.

**Endpoints nuevos (`PortalModule`, `/portal`)**
- `GET /portal/products?search=` — llama a la **misma** función de búsqueda que usa el POS
  (`products.service` `findAll` con `limit=500`, `onSaleFirst=true`, solo activos y no bloqueados
  para la venta) y mapea a un DTO seguro: `id, code, name, thumbUrl/imageUrl, priceUsd, priceBs,
  isOnSale, stock (suma de almacenes), available (stock − reservado en espera)`. **Nunca**
  devuelve costo, % de ganancia, proveedor, precio mayor ni stock por almacén. El precio es el
  mismo que pondría el POS (misma lógica de oferta/precio).
- `GET /portal/orders` — sus pedidos en espera (`customerId` propio, `status PENDING`), con
  estado derivado: `ABIERTO` o `EN_USO` (lock vigente de otro usuario).
- `GET /portal/orders/:id` — detalle (solo si es suyo).
- `POST /portal/orders` — crea pedido: `{ portalNote?, items: [{productId, quantity}] }`.
- `PATCH /portal/orders/:id` — reemplaza items y nota.
- `DELETE /portal/orders/:id` — borra el pedido entero.
- `GET /portal/cuenta/facturas`, `GET /portal/cuenta/cxc`, `GET /portal/cuenta/facturas/:id/pdf`
  — reutilizan la lógica de `me.service` parametrizada por `customerId` (se extrae una función
  común; `/me` del empleado no cambia).
- `GET /portal/exchange-rate` — tasa del día (solo lectura).

**Reglas al crear/editar un pedido del portal** (en servidor):
- Precio = precio de lista actual del producto; **descuento 0**; cualquier precio/descuento que
  llegue se ignora (el DTO ni siquiera los acepta).
- Solo productos activos y no bloqueados para la venta; cantidad > 0 (decimales permitidos,
  igual que el POS).
- `sellerId` = `Customer.sellerId` (puede ser null); `createdById` = usuario cliente;
  `fromPortal = true`; `clientUpdatedAt = now()`.
- Caja: igual que la pre-factura del vendedor (primera caja activa).
- Montos en Bs con la tasa del día al guardar (regla de CLAUDE.md); sin tasa → error amigable
  "Todavía no está cargada la tasa del día, intenta más tarde".
- Editar/borrar: rechazado (409) si no es suyo, si `status !== PENDING`, o si hay lock vigente de
  otro usuario ("El pedido está siendo procesado por la empresa y no se puede modificar").
- Reutilizar la lógica de cálculo de `invoices.service` (create/updateItems) en vez de duplicarla;
  el portal pasa precio de lista y descuento 0 forzados.

**Huecos existentes que se cierran (afectan a todos, sin cambio visible):**
1. `GET /config`: a no-ADMIN no se le devuelven `creditAuthPassword` ni `allowedIps`.
2. Límite de intentos de login: 10 fallidos por IP cada 15 min (respuesta 429 con mensaje claro).
3. El refresh token incluye `restrictToOnSiteIp` (hoy se pierde al refrescar y el candado IP deja
   de aplicar).

## 4. Web — portal del cliente

- Middleware: si `role === 'CLIENT'` solo permite `/portal*` y `/change-password`; cualquier otra
  ruta redirige a `/portal`. Login redirige a CLIENT a `/portal`.
- Layout propio `app/(portal)/...` sin sidebar del ERP: cabecera con logo/nombre de la empresa,
  nombre del cliente y "Salir". Mobile-first. Títulos de pestaña `'… | Trinity ERP'`.
- **`/portal`** — pestañas "Mis pedidos" y "Mi cuenta".
  - Mis pedidos: lista (nota, fecha, renglones, total estimado, estado ABIERTO/EN USO) +
    "Nuevo pedido". Borrar pedido (con confirmación) si está abierto.
  - Mi cuenta: facturas (número, fecha, total, saldo, estado, PDF) y estado de cuenta CxC
    (documento, vence, monto, saldo, estado) — mismo formato que Mi Perfil.
- **`/portal/pedido/[id]`** (y `/portal/pedido/nuevo`):
  - Buscador **idéntico al POS**: debounce 300 ms, `limit=500`, ofertas primero, misma tolerancia
    (P/, tildes, orden de palabras) porque usa el mismo backend. Resultados con foto, código,
    nombre, precio USD/Bs, stock y disponible.
  - Agregar: si ya está en el pedido suma 1; si no, agrega renglón con cantidad 1. Aviso suave si
    supera el disponible (deja agregar igual, como el POS).
  - Renglones: cantidad con `QtyInput` compartido, botones +/−, eliminar renglón, subtotal.
  - Nota del pedido (opcional), total estimado USD/Bs y aviso: *"Precios referenciales; se
    facturan al precio y tasa del día del despacho."*
  - Botón "Guardar". Guard de salir sin guardar (como el POS). Si el pedido pasa a EN USO, se
    muestra aviso y queda en solo lectura.
  - No existen: descuentos, editar precio, vendedor, método de pago, cliente, crédito.

**`QtyInput` compartido**: se mueve del POS a `components/qty-input.tsx` y lo usan POS y portal.
Mejora: acepta **punto y coma** como decimal (la coma se convierte a punto); sigue permitiendo
borrar todo mientras se edita y revierte si queda vacío/0 al salir. Verificar el POS tras el
cambio (escritorio, tablet, móvil).

## 5. Lado de la empresa

- **API `ClientOrdersModule`** (`/client-orders`, `@RequireModule('pedidos-clientes')`):
  `GET /client-orders` (filtros `sellerId`, `onlyUnseen`), `GET /client-orders/:id`,
  `PATCH /client-orders/:id/seen` (marca `staffSeenAt = now()`), `GET /client-orders/unseen-count`
  (si el usuario es SELLER con vendedor vinculado, cuenta solo los de su vendedor).
  `PATCH /invoices/:id/retake` también marca `staffSeenAt` cuando `fromPortal`.

- **Ficha del cliente** (`customer-form-modal` / detalle): campo "Vendedor asignado"; sección
  "Acceso al portal" visible solo si `clientPortalEnabled`: crear usuario (correo + contraseña
  temporal, `mustChangePassword = true`, rol CLIENT, `customerId`), activar/desactivar,
  reiniciar contraseña. Endpoints ADMIN/SUPERVISOR en `customers` o `users`.
- **POS — panel "Facturas en espera"**: etiqueta "Cliente" en pedidos `fromPortal`, marca
  "Modificado" si `clientUpdatedAt > staffSeenAt`, muestra `portalNote`. Retomar un pedido
  marca `staffSeenAt`. Si `keepPendingInvoices`, el panel carga todas las fechas (sin `today=true`).
- **`/sales/pedidos-clientes`** (sección Ventas, módulo `pedidos-clientes`): lista de pedidos del
  portal (cliente, nota, vendedor, renglones, total estimado, última modificación), resaltando
  nuevos/modificados; filtro por vendedor (SELLER arranca en "mis clientes", puede ver todos);
  detalle de solo lectura que marca visto + botón "Abrir en el POS" (`/sales/pos?invoiceId=`).
- **Contador en el sidebar**: badge en "Pedidos de clientes" con los nuevos/modificados sin ver;
  `GET /client-orders/unseen-count` cada 60 s; solo si `clientPortalEnabled` y el usuario tiene
  el módulo.
- **`/config`**: dos checkboxes (patrón `requireCustomerAddress`): "Pedidos de clientes en línea"
  y "Conservar facturas en espera (no borrarlas a medianoche)".
- **Cron nocturno** (`quotations-cron` → `deleteOldPendingInvoices`): si `keepPendingInvoices`,
  no borra nada.

## 6. Errores y bordes

- Cliente guarda mientras la empresa lo tiene tomado → 409, la pantalla recarga el pedido en
  solo lectura con el aviso.
- Pedido cobrado/borrado por la empresa mientras el cliente lo tenía abierto → al guardar, 404/409
  → "Este pedido ya fue procesado"; vuelve a la lista.
- Producto desactivado/bloqueado después de agregarlo → al guardar se rechaza ese renglón con
  mensaje indicando cuál.
- Portal apagado con clientes con sesión abierta → siguiente petición 403 → pantalla "Portal no
  disponible".
- Sin vendedor asignado → el pedido queda sin vendedor (visible para quienes ven "todos").

## 7. Verificación (sin código de pruebas, por decisión del usuario)

- Typecheck API y web.
- Local contra BD de prueba: crear cliente con acceso; como CLIENT, probar que `/products`,
  `/customers`, `/invoices`, `/config`, `/receivables` dan 403; que la respuesta de
  `/portal/products` no trae costo; crear 2 pedidos, editar, borrar; enviar precio/descuento a mano
  y verificar que se ignoran; retomar en POS y verificar "en uso" en el portal; cobrar y verificar
  que desaparece de "Mis pedidos" y aparece en "Mi cuenta".
- `QtyInput`: borrar el 0, escribir `2.5` y `2,5` (teclado español), en POS y portal.
- Cron con `keepPendingInvoices` on/off.
- Deploy solo en la mayorista; las demás empresas quedan con las opciones apagadas (sin cambio
  de comportamiento salvo los 3 huecos cerrados y el `QtyInput` que acepta coma).
