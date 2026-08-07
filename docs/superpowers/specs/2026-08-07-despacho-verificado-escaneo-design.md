# Despacho Verificado por Escaneo — Diseño

Fecha: 2026-08-07
Estado: en revisión (pendiente aprobación del spec)
Alcance: **opt-in por empresa** (por ahora una sola empresa lo usa)

## Problema

Los despachadores se equivocan seguido al entregar mercancía: pasan de más una cantidad,
o agarran un artículo por otro creyendo que es el mismo. Eso genera pérdida de mercancía.
Hoy el despacho es "a ojo": se mira la comanda/factura y se entrega, sin que el sistema
verifique físicamente que lo entregado corresponde a lo facturado.

## Objetivo

Una **pantalla nueva e independiente** de despacho donde el despachador:
1. Trae la factura (tecleando/buscando su número).
2. Ve todos sus artículos.
3. **Escanea (o teclea) el código de cada artículo** que va entregando; por cada lectura
   se descuenta 1 de la línea correspondiente **de la factura/comanda (NO del stock)**.
4. El sistema **bloquea y alerta** cuando:
   - Escanea de más (ej. la factura dice 3 y pasa un 4º).
   - Escanea un artículo que **no está en la factura**.
5. Si no se completan todos los artículos, la comanda **queda abierta (parcial)** para que
   se note que faltó despachar algo.

El fin es evitar el mal despacho a costa de un paso extra (más lento, pero sin pérdida de
mercancía) y, de paso, dejar registro de **quién** despachó cada cosa.

## Restricciones fijadas por el usuario

- **Pantalla aparte.** No se toca `/dispatch` (ni su UI ni su comportamiento). Cada empresa
  le dará un uso distinto a `/dispatch`; esta vista es otra cosa.
- **Opt-in por empresa.** Solo la ve la empresa que se active; el resto sigue igual.

## Decisiones tomadas (brainstorming 2026-08-07)

1. **Se monta sobre el modelo de comandas existente** (`Dispatch` / `DispatchItem` /
   `DispatchDelivery`). NO se crea un modelo nuevo. Alternativa descartada: modelo aislado
   propio → duplicaría el concepto y permitiría despachar la misma factura por dos lados y
   descuadrar.
2. **Pantalla nueva independiente**, `/dispatch` intacto. Comparten el registro de despacho
   por debajo (una sola verdad de "cuánto se ha despachado de cada factura"). Efecto visible
   aceptado: en la empresa opt-in, un despacho hecho por escaneo también aparece en la lista
   de `/dispatch`.
3. **Punto de entrada:** el despachador trae **cualquier factura pagada directo**; si no
   existía comanda de retiro, el sistema **la crea sola** por detrás (reutiliza
   `dispatch.create`).
4. **Fase 1 sin código de barras en el ticket.** Se busca/teclea el N° de factura. El barcode
   impreso en el ticket (que requiere tocar el agente `.exe`) queda para **Fase 2**.
5. **Cantidades altas:** escaneo **1 a 1** por defecto, con **opción de teclear cantidad**
   (ej. +25) con confirmación, para bultos.
6. **Tope por línea = bloqueo duro:** no deja pasar más de lo facturado (modal rojo).

## Diseño

### 1. Modelo de datos (reutilizado, sin tablas nuevas)

Se usa lo que ya existe:
- `Dispatch` (uno por factura, `invoiceId @unique`, estado `PENDIENTE/PARCIAL/COMPLETADO`).
- `DispatchItem` (`quantityInvoiced`, `quantityDelivered` acumulado por línea).
- `DispatchDelivery` (evento de despacho con `deliveredById` + `createdAt` + `lines` JSON).

El "ir descontando de la factura" = subir `quantityDelivered` por línea. "Queda abierta" =
estado `PARCIAL`. "Quién despachó y cuándo" = `DispatchDelivery`.

**Ajuste de correctitud (devoluciones):** la cantidad a despachar de cada línea debe ser
**`quantity − returnedQty`** del `InvoiceItem`, no `quantity` a secas. Hoy `dispatch.create`
usa `quantity`; para esta vista se corrige a lo neto (si la factura tuvo devolución parcial,
no se debe exigir despachar lo devuelto). *(Verificar al implementar si conviene corregirlo
solo en el resolve de esta vista o también en `dispatch.create` general.)*

**Feature flag:** nuevo booleano en `CompanyConfig` (patrón `useCashLedger`), ej.
`useScanDispatch` (default `false`). Se expone en `/config` para que el frontend muestre/oculte
la vista. Migración aditiva `ADD COLUMN IF NOT EXISTS` + red en `deploy/fix-schema.sql`.

### 2. Backend

- **`POST /dispatches/resolve`** (nuevo): recibe `{ invoiceNumber }`. Busca la factura
  (`PAID` o `PARTIAL_RETURN`); si no tiene `Dispatch`, lo crea (reutiliza la lógica de
  `create`). Devuelve la comanda con sus líneas: `dispatchItemId`, `productId`, `productName`,
  `productCode`, `barcode`, `quantityToDispatch` (= `quantity − returnedQty`),
  `quantityDelivered`, `remaining`. Errores claros: factura no existe / no pagada.
- **Cierre del despacho:** se reutiliza **`POST /dispatches/:id/deliver`** (ya valida que no
  se supere `quantityInvoiced` y recalcula el estado `PARCIAL/COMPLETADO`). El frontend manda
  las líneas verificadas al Finalizar. *(Si `quantityInvoiced` no refleja aún el neto de
  devolución, ajustarlo en el resolve/create para que el tope del `deliver` sea el correcto.)*
- **Gate de acceso:** el mismo del módulo de comandas ya existente (no se inventan permisos).
  La visibilidad de la vista la controla el feature flag de empresa.

### 3. Frontend — pantalla nueva

Ruta nueva independiente (nombre tentativo `/despacho/verificar` o `/dispatch/scan`; se
confirma al implementar). Gateada por el flag de empresa.

**Flujo:**
1. Campo de **N° de factura** (buscar/teclear + Enter). Llama a `resolve`.
2. Se cargan las líneas y se arma en el cliente un **índice por `barcode` y por `code`** para
   validar cada lectura **al instante, sin round-trip por escaneo**.
3. Campo de **escaneo/tecleo** siempre enfocado (para lectura en ráfaga). Por cada lectura:
   - Match por barcode exacto **o** código exacto.
   - **No está en la factura** → modal rojo grande + sonido de error:
     *"⛔ NO ESTÁ EN LA FACTURA"* + el nombre del producto que escaneó (para que vea qué agarró).
   - **Línea ya completa / superaría el tope** → modal rojo: *"SON SOLO N, NO N+1"*.
   - **OK** → beep verde, sube el contador `x/total` de esa línea, barra de progreso; al
     completar, la línea se pone **verde** y baja al fondo.
   - **Cantidad manual (bultos):** botón/atajo para escanear el artículo y teclear `+N` con
     confirmación (respeta el tope).
   - **Anti-doble-lectura:** debounce corto para que un gatillo doble no cuente 2.
4. **Finalizar:**
   - Todo completo → confirmar → `deliver` → **COMPLETADO**.
   - Falta algo → modal que **lista lo que falta** ("FALTA: 1× CON00934") y obliga a confirmar
     *"despacho parcial"* → `deliver` con lo verificado → **PARCIAL (abierta)**.

**Persistencia:** la verificación se valida en pantalla y se **guarda de una sola vez al
Finalizar** (un solo `deliver`, sin latencia por escaneo). Si se recarga a media verificación,
se reinicia — es una acción continua y corta, es aceptable.

### 4. Feedback sensorial y UX

- **Sonido:** beep agudo al OK, buzzer distinto al error (el almacenista no mira la pantalla
  fija; el sonido manda). Modales grandes con letras rojas al error.
- **Progreso:** por línea `x/total` + barra; línea verde al completar; contador global de
  avance.
- Campo de escaneo siempre enfocado; tras cada lectura vuelve el foco.

## Casos borde

- **Producto sin barcode** → se teclea el código interno (el índice del cliente incluye `code`).
- **Servicios / mano de obra:** ya se excluyen del despacho (no generan `DispatchItem`).
- **Un producto en 2 líneas de la misma factura** (raro; normalmente se consolidan): sumar a
  la línea con restante > 0. Confirmar comportamiento al implementar.
- **Factura no pagada / inexistente / ya completamente despachada:** mensaje claro, no entra al
  modo escaneo.
- **Devolución total (`RETURNED`) o cancelada:** no despachable.

## Fuera de alcance (Fase 2 / futuro)

- Código de barras impreso en el ticket de la comanda (requiere soporte ESC/POS de barcode en
  el agente `.exe` + redespliegue a las PCs de esa empresa).
- Verificación por zona de despacho (esta vista verifica la factura completa).
- Constancia impresa "despacho verificado por [usuario]" (opcional, evaluar luego).

## Pruebas

- **Backend:** `resolve` (find-or-create; factura pagada vs no; neto de devolución en
  `quantityToDispatch`); `deliver` respeta el tope y calcula `PARCIAL/COMPLETADO`.
- **Manual (local con data de la grande/total):** escanear de más (bloqueo), artículo ajeno
  (alerta con nombre), completar total (COMPLETADO), dejar incompleto (PARCIAL + modal de
  faltantes), teclear cantidad para bulto, producto sin barcode por código, y confirmar que el
  despacho aparece también en `/dispatch` (registro compartido) sin haber tocado esa pantalla.
- Confirmar que con el flag **apagado** nada cambia (la vista no existe para otras empresas).
