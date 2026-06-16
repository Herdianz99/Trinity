# Control de Comandas — Diseño

Fecha: 2026-06-16
Estado: aprobado para planificación

## Problema

Hoy, al cobrar una factura, se generan uno o varios `PrintJob` (uno por zona/área de
impresión). La PC de despacho de cada zona consulta `print-jobs/pending` cada 5s, hace
`claim` atómico de la comanda y la imprime vía agente (`window.print()` como fallback).

El `claim` marca la comanda como `PRINTED` **antes** de imprimirla físicamente. Esto
evita duplicados cuando varias pestañas/PCs comparten zona, pero tiene un efecto colateral
grave: si la impresión falla después de reservar (papel agotado, impresora apagada, red
caída, agente caído), la comanda **ya quedó `PRINTED`** y el fallo es **invisible**. No hay
forma de saber qué no salió ni de reimprimirlo.

## Objetivo

Una pantalla **Control de Comandas** (página completa en el menú, gateada por permiso)
para:
- Ver comandas pendientes y, sobre todo, **detectar las que fallaron**.
- **Buscar una factura** y **reimprimirla** (vuelve a encolar como si recién se facturara).

No se toca el POS. El cajero no usa esta pantalla; la usa un encargado/admin con permiso.

## Decisiones tomadas

1. **Acceso:** página completa en el menú, nueva sección con permiso de sección `commands`.
   No es un widget en el POS.
2. **Reimpresión = reencolar a la zona (no imprimir donde se hace clic).** Se clona la
   comanda como un registro nuevo `PENDING`; la PC de esa zona la imprime en su siguiente
   poll, en su propia impresora. Se marca como "REIMPRESIÓN" en el ticket para que quien la
   tome sepa que ya se había impreso antes.
3. **La reimpresión opera a nivel de factura.** Si la factura tiene artículos de 2 zonas,
   reimprimir abanica a **ambas** zonas (un clon por zona). Reimprimir una sola zona queda
   fuera de alcance (YAGNI).
4. **Detección automática de fallos + reimpresión manual.** El agente confirma éxito/error;
   con eso se marca `PRINTED` o `FAILED`. El camino `window.print()` no da garantía, así que
   esas quedan como enviadas sin confirmación.

## Diseño

### 1. Modelo de datos (`PrintJob`)

`PrintStatus` se amplía de `PENDING / PRINTED` a:

- `PENDING` — en cola, ninguna PC la tomó aún.
- `PRINTING` — reservada por una PC (estado tras `claim`).
- `PRINTED` — el agente confirmó la impresión.
- `FAILED` — el agente reportó error, o no confirmó.

(Se conserva `PRINTED` también para el camino `window.print()`, sin garantía de éxito real.)

Campos nuevos en `PrintJob`:

- `updatedAt DateTime @updatedAt` — cuándo cambió de estado.
- `isReprint Boolean @default(false)` — marca las reimpresiones; dispara el sello
  "REIMPRESIÓN" en el ticket.
- `reprintOfId String?` — apunta a la comanda original (enlace de historial).
- `failureReason String?` — texto del error reportado por el agente.

Migración con `IF NOT EXISTS` en todo `ALTER TABLE` (regla del proyecto). El enum
`PrintStatus` se extiende con `ADD VALUE IF NOT EXISTS`.

### 2. Backend (`print-jobs`)

- **`claim(id)`** pasa la comanda de `PENDING` a `PRINTING` (sigue siendo `updateMany`
  atómico filtrando por `status: PENDING`, preserva la protección anti-duplicados actual).
- **`markPrinted(id)`** → `PRINTED` (ya existe; se conecta al resultado real del agente).
- **`markFailed(id, reason)`** (nuevo) → `FAILED` + `failureReason`.
- **`GET /print-jobs`** (nuevo) — listado con filtros: rango de fecha (`from`/`to`, usando
  `setUTCHours` para los rangos, regla del proyecto), `printAreaId`, `status`, número de
  factura. Incluye `invoice` (number) y `printArea` (name). Orden por `createdAt desc`.
- **`POST /print-jobs/reprint/:invoiceId`** (nuevo) — busca las comandas de esa factura
  (las más recientes por zona), y por **cada zona** crea un `PrintJob` nuevo clonando el
  `items` JSON, con `isReprint=true`, `reprintOfId` = id de la original y `status=PENDING`.
  Devuelve cuántas zonas se reencolaron (para avisar en la UI).

`findPending` se mantiene pero filtra por `status: PENDING` (las `PRINTING` ya no se
reofrecen). El monitor sigue protegido por su `processedIds` en memoria; como la
reimpresión crea un id nuevo, el monitor la detecta sin problema.

### 3. Frontend — monitor (`print-monitor.tsx`)

- Tras `handlePrint`, conectar el resultado: si el agente devolvió `printed === true` →
  `markPrinted`; si reportó error → `markFailed` con el motivo. El camino `window.print()`
  llama a `markPrinted` (sin garantía real, documentado).
- El ticket (`buildTicketText` y el fallback HTML) añade una línea destacada
  **"REIMPRESIÓN"** cuando `job.isReprint`.
- El endpoint `pending` ahora trae también `isReprint` para construir el ticket.

### 4. Página `/commands` (Control de Comandas)

- Página completa, nueva sección **"COMANDAS"** en el menú, permiso de sección `commands`.
- `document.title = 'Control de Comandas | Trinity ERP'` (regla del proyecto).
- **Vista por defecto:** comandas de **hoy**, con `FAILED` y `PENDING` ancladas arriba,
  resaltadas (rojo / ámbar).
- **Filtros:** rango de fecha (por defecto hoy), zona, estado, y **buscador por número de
  factura**.
- **Cada fila:** factura, zona, estado (badge), hora, nº de items, indicador de reimpresión.
- **Botón "Reimprimir"** a nivel de factura; si abanica a varias zonas, avisa antes.
- **Auto-refresco** cada ~10s para ver fallidas en vivo.
- Fechas locales en frontend con `getFullYear()/getMonth()/getDate()`, nunca `toISOString()`
  (regla del proyecto).

### 5. Permisos

- Nuevo permiso de sección `commands`. Añadido a la definición del menú en `sidebar.tsx` y
  configurable en **Permisos por rol** (`/settings/role-permissions`). ADMIN siempre tiene
  acceso. Solo los usuarios con `commands` ven la sección y entran a la página.

## Fuera de alcance (YAGNI)

- Reimprimir una sola zona de una factura multi-zona (solo a nivel de factura).
- Borrado/purga de historial de comandas (se acumulan; se filtran por fecha).
- Garantía de éxito en el camino `window.print()` (el navegador no informa).
- Reintentos automáticos de las fallidas (la reimpresión es manual por decisión del usuario).

## Notas de implementación (reglas del proyecto)

- Transacción Prisma para la reimpresión multi-zona.
- Migración con `IF NOT EXISTS`; el enum con `ADD VALUE IF NOT EXISTS`.
- Verificar `deploy/fix-schema.sql` como red de seguridad para las columnas nuevas.
- Pre-deploy: confirmar que controller, service, DTO, módulo, migración y `sidebar.tsx`
  estén commiteados antes de desplegar.
