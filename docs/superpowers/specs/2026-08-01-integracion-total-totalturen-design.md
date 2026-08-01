# Diseño: Integración total ↔ totalturen

**Fecha:** 2026-08-01
**Estado:** Diseño aprobado (pendiente revisión de spec)
**Alcance:** puente 1-a-1 entre las instancias `total` y `totalturen` (mismo dueño, mismo catálogo por `code`, co-locadas en el droplet `161.35.52.221`).

## 1. Contexto y decisiones previas

- `total` y `totalturen` son **dos instancias Trinity separadas** (DBs `total_db` / `totalturen_db`, APIs en puertos 4000 / 4001 del mismo droplet). Comparten catálogo por `code` (totalturen se clonó de total).
- Costos y precios son **independientes por empresa** (compran distinto), aunque hoy coinciden por el clon inicial.
- Se descartó multisucursal (`branchId`) por RIF distinto + costo/precio independientes. El camino es **integración aditiva por API**, sin tocar POS ni facturación.
- La del lunes 2026-08-04 es **otro cliente aparte**: NO participa. El puente es estrictamente 1-a-1.

## 2. Arquitectura base

Módulo nuevo **`integration`** en `apps/api/src/modules/integration`. Aditivo: no modifica POS, facturación ni el `Transfer` interno (entre almacenes de una misma instancia).

### 2.1 Configuración (por instancia, en `apps/api/.env`)

| Variable | Descripción | Ejemplo en `total` | Ejemplo en `totalturen` |
|---|---|---|---|
| `PARTNER_API_URL` | Base URL del socio | `http://localhost:4001` | `http://localhost:4000` |
| `PARTNER_API_TOKEN` | Token que YO uso para llamar al socio | *(token de turen)* | *(token de total)* |
| `INTEGRATION_TOKEN` | Token que YO acepto del socio | *(token de total)* | *(token de turen)* |
| `PARTNER_NAME` | Etiqueta para la UI | `TOTAL TUREN` | `TOTAL` |
| `SELF_CODE` | Prefijo corto propio para correlativos | `TOT` | `TUR` |

Transporte por **localhost** (co-locadas): rápido, sin salir a internet ni certificados. `PARTNER_API_URL` admite URL completa, así que si algún día se separan de servidor basta cambiar la config (sin tocar código).

### 2.2 Seguridad y opt-in

- Endpoints entrantes bajo `integration/*`, protegidos por **`IntegrationTokenGuard`** que valida el header `X-Integration-Token` contra `INTEGRATION_TOKEN`. Separado del JWT de usuarios.
- Las acciones de usuario (ver stock, traer precios, crear/recibir traslado) van por el JWT normal + rol; internamente el API llama al socio con `PARTNER_API_TOKEN`.
- **Opt-in total:** si faltan `PARTNER_API_URL` / tokens, el módulo queda **dormido** (los botones no aparecen, los hooks no disparan). Desplegable a eltrebol/inversiones/otras sin efecto alguno.

### 2.3 Cliente HTTP del socio (`PartnerClient`)

Servicio que encapsula las llamadas salientes:
- timeout corto (5 s), header `X-Integration-Token`.
- **Nunca lanza hacia el flujo de usuario**: si el socio no responde, devuelve un resultado "no disponible" y se registra en log. Ninguna acción local (crear producto, facturar) se rompe por el socio.

## 3. Modelo de datos

Única tabla nueva (migración con `IF NOT EXISTS`). Cada instancia guarda **su propia** fila para cada traslado lógico, enlazada por `number`.

```prisma
model PartnerTransfer {
  id            String   @id @default(cuid())
  number        String   @unique      // p.ej. TOT-PTR-0001 (prefijo SELF_CODE del que inicia)
  kind          String                // 'SEND' | 'REQUEST'
  direction     String                // 'OUTGOING' | 'INCOMING' (respecto a esta instancia)
  status        String                // ver máquina de estados abajo
  partnerName   String
  notes         String?
  items         Json                  // [{ code, name, quantity, unitCost }]
  toWarehouseId String?               // almacén destino elegido al recibir
  createdById   String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

`items` se guarda como snapshot JSON (código + nombre + cantidad + costo que viaja) para no depender de que el otro lado tenga el producto en el mismo `id`. El cruce en el lado receptor es por `code`.

## 4. Funciones

### A) Consulta de existencia en la otra empresa (en vivo)

- **UI:** en la ficha de producto (`/catalog/products/[code]`), panel "En {PARTNER_NAME}" que muestra: existencia total, precio detal/mayor, y estado activo del socio para ese `code`. Botón "Solicitar traslado" que abre el flujo B (request).
- **Endpoint entrante (expuesto al socio):** `GET /integration/products/lookup?code=XXX`
  → `{ code, exists, isActive, name, stock, priceDetal, priceMayor }` (o `{ exists:false }`).
- **Endpoint interno (para el frontend):** `GET /integration/partner/product/:code` → el API llama al socio con `PartnerClient` y reenvía el resultado. Si el socio no responde → `{ available:false }` y la UI muestra "no disponible".
- **Fuera de alcance v1:** mostrarlo dentro del POS (posible fase 2).

### B) Traslados entre empresas (bidireccional)

Correlativo: lo genera **quien inicia**, con prefijo `SELF_CODE` → `number` único entre las dos. Idempotente: reprocesar el mismo `number` no duplica stock.

**B.1 Enviar (push) — A tiene el stock y lo manda a B:**
1. A: usuario crea "traslado a {PARTNER}", elige almacén origen e items → **descuenta stock en A** (`StockMovement TRANSFER_OUT`) → `PartnerTransfer{kind:SEND, direction:OUTGOING, status:SENT}`.
2. A → `POST /integration/transfers/incoming` en B con `{ number, items:[{code,name,quantity,unitCost}], notes }`.
3. B: crea `PartnerTransfer{direction:INCOMING, status:PENDING_RECEIPT}` (idempotente por `number`).
4. B: usuario abre "Traslados por recibir", elige almacén destino, confirma → **suma stock en B** (`TRANSFER_IN`) al `unitCost` que viajó → `status:RECEIVED`.
5. B → `POST /integration/transfers/{number}/ack` en A → A pasa a `status:RECEIVED`.

**B.2 Solicitar (request) — B necesita stock que A tiene:**
1. B: usuario crea solicitud (desde el panel de existencia o pantalla de traslados) → `PartnerTransfer{kind:REQUEST, direction:OUTGOING, status:REQUESTED}`.
2. B → `POST /integration/transfers/requests` en A con `{ number, items:[{code,quantity}], notes }`.
3. A: crea `PartnerTransfer{kind:REQUEST, direction:INCOMING, status:REQUESTED}`; aparece en "Solicitudes de {PARTNER}".
4. A: usuario **aprueba** → se convierte en un envío (flujo B.1 desde el paso 1, reusando el mismo `number`) o **rechaza** → `status:REJECTED` (notifica a B).

**Estados:** `REQUESTED → APPROVED → SENT → PENDING_RECEIPT → RECEIVED`, con ramas `REJECTED` y `CANCELLED`.

**Endpoints entrantes:** `POST /integration/transfers/incoming`, `POST /integration/transfers/requests`, `POST /integration/transfers/:number/ack`, `POST /integration/transfers/:number/reject`.

### C) Copiar precios de venta (en vivo, bidireccional)

- **UI:** botón "Traer precios de {PARTNER}" en `/catalog/price-adjustment` (o pantalla propia), con los mismos filtros. Muestra **preview** (precio propio vs socio, y códigos sin match) antes de aplicar.
- Aplica el precio del socio como **precio manual** (`manualPrice=true`) para que el costo propio no lo recalcule.
- **Endpoint entrante:** `GET /integration/products/prices` (opcionalmente filtrable) → `[{ code, priceDetal, priceMayor }]`.
- Bidireccional: cualquiera jala de la otra.

### D) Sync de artículos nuevos (push automático)

- **Disparador:** al crear un producto (en `ProductsService.create`) cuyo `code` no está en el socio, se encola un **push asíncrono** (patrón fire-and-forget, como `storeExport.scheduleExport`). **No bloquea ni falla** el alta local.
- A → `POST /integration/products/upsert` en B con identidad + **costo y precio** (`code, name, description, barcode, supplierRef, unidad, ivaType, costUsd, gananciaPct, gananciaMayorPct, priceDetal, priceMayor, manualPrice, bregaApplies, brand{code,name}, category{code,name}`).
- B: **crea solo si el `code` no existe** (no sobreescribe productos existentes, para no pisar ediciones independientes). Mapea marca/categoría por `code`/nombre; las crea si faltan.
- **Red de seguridad (reconciliación):** un chequeo (cron cada N min y/o botón manual) que le pide al socio su lista de `code`s (`GET /integration/products/catalog`) y crea los que falten localmente. Cubre pushes que hayan fallado por el socio caído.

## 5. Manejo de errores

- Toda llamada saliente pasa por `PartnerClient` con timeout y captura: el socio caído nunca rompe una acción de usuario ni el alta de productos.
- Traslados **idempotentes** por `number`: reintentos/duplicados no mueven stock dos veces.
- Los movimientos de stock (out/in) van en **transacción Prisma**; el correlativo con bloqueo para evitar colisión.
- Toda operación de integración registra log para auditar.

## 6. Despliegue y riesgo

- Cambios **aditivos**; única migración: `PartnerTransfer` (`IF NOT EXISTS`).
- Deploy en el server co-locado con `bash /opt/deploy-trinity.sh total` y `... totalturen`; setear las 5 variables de entorno en cada `.env`.
- Sin config → módulo dormido → cero impacto en eltrebol/inversiones/empresa del lunes aunque reciban el código.

## 7. Fuera de alcance (v1)

- Consulta de existencia dentro del POS (posible fase 2).
- Más de 2 socios / topología en estrella (hoy 1-a-1).
- Sincronizar ediciones de artículos existentes (solo se sincroniza el **alta** de nuevos).
- Unificar reportes/contabilidad entre empresas (siguen separados por RIF).

## 8. Orden de implementación sugerido

1. Base: módulo `integration`, config, `IntegrationTokenGuard`, `PartnerClient`, `GET /integration/ping`.
2. Función A (consulta de existencia) — la más simple, valida el puente end-to-end.
3. Función C (copiar precios).
4. Función D (sync de altas + reconciliación).
5. Función B (traslados bidireccionales + tabla `PartnerTransfer`).
