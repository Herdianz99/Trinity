# Crédito pre-aprobado y blindado — Diseño

- **Fecha:** 2026-07-05
- **Autor:** Diego + Claude
- **Estado:** Aprobado, pendiente de plan de implementación

## Contexto

Hoy el crédito se decide **al pagar** en el POS (`invoices.service.pay`): el cajero pone los
días (fijo 30 en el estado local, **no** lee `Customer.creditDays`) y autoriza con una **clave
dinámica por venta** (`ALLOW_CREDIT_INVOICE`, Sesión 99, solo validada en el frontend). El
backend valida el **cupo** (`creditLimit`) pero **no** bloquea por facturas vencidas. Además hay
una **inconsistencia**: `Invoice.dueDate` usa `dto.creditDays || 30` mientras `Receivable.dueDate`
cae a `customer.creditDays` — pueden divergir.

El negocio antes improvisaba: llamaban al dueño cada vez que alguien quería crédito. Ahora quieren
un **flujo ordenado y controlado**: administración **analiza al cliente por adelantado** ("previa
cita"), le dicta su cupo y sus días, y eso **queda fijo** hasta un segundo análisis. El objetivo del
dueño: que el sistema **quede blindado para dar créditos sin su aprobación pero cuidando sus
intereses**.

## Objetivo

Convertir el crédito en una **propiedad pre-aprobada del cliente** (no una decisión en caja), con
las barreras que protegen la plata **enforced en el backend**:
- El cupo y los días los dicta administración en el cliente (acción controlada por permiso).
- La caja solo **usa** el crédito: días fijos, sin clave por venta.
- El backend **bloquea** ventas a crédito sobre-cupo o con facturas vencidas; solo se saltan con
  clave dinámica (excepción con trazabilidad).

## No-objetivos (NO se hace ahora)

- **Sistema de puntos/scoring** por buen historial de pago (fase futura; el modelo lo deja abierto).
- Endurecer los overrides a validación de clave **en el backend**: hoy los overrides siguen el
  patrón existente (frontend-gated). Ver "Nota de seguridad".
- Historial versionado de análisis de crédito (por ahora solo `creditReviewedAt` puntual).
- Tocar el cálculo del cupo (sigue restando `amountUsd` completo de CxC PENDING/PARTIAL/OVERDUE).

## Decisiones tomadas

1. **`creditAuthorizedBy` y `creditReviewedAt` viven en `Customer`**, no en `Invoice` — la
   autorización es de la **línea de crédito** (una vez, por administración), no de cada venta.
2. **Días fijos** en el POS (los del cliente, no editables).
3. **Venta a crédito normal fluye sin clave** (dentro del cupo y sin vencidos). Se **elimina** el
   gate por-venta `ALLOW_CREDIT_INVOICE`.
4. **Editar el crédito del cliente** requiere el permiso de usuario **`MANAGE_CUSTOMER_CREDIT`**.
5. **Excepciones con UNA sola clave dinámica** `OVERRIDE_CREDIT_BLOCK` (cubre tanto sobre-cupo
   como facturas vencidas).
6. **`creditReviewedAt` se auto-sella** a `now()` cuando cambian `creditLimit`/`creditDays`.
7. **Validación (form cliente):** si `creditLimit > 0` → `creditDays` (>0) **y** `creditAuthorizedBy`
   son **obligatorios**.
8. Empleados: **mismas reglas** de crédito que todos (el toggle es solo para reportes).

## Modelo de datos

**`Customer`** (`packages/database/prisma/schema.prisma`)
- `isEmployee Boolean @default(false)`
- `creditAuthorizedBy String?` — quién aprobó la línea (obligatorio en el form si hay cupo).
- `creditReviewedAt DateTime?` — fecha del último análisis (auto-sellada).

**`enum PermissionKey`** (permiso de usuario) — nuevo valor:
- `MANAGE_CUSTOMER_CREDIT`

**`enum DynamicKeyPerm`** (claves de caja) — nuevo valor:
- `OVERRIDE_CREDIT_BLOCK` (una sola clave; cubre sobre-cupo y vencidos)

**Migración** (`IF NOT EXISTS` / `ALTER TYPE ... ADD VALUE IF NOT EXISTS`, según regla del proyecto)
+ espejo en `deploy/fix-schema.sql`. `Invoice` **no** cambia (no se agrega `creditAuthorizedBy` ahí).

## Parte 1 — La línea de crédito como propiedad controlada del cliente

**Backend (`customers` module):**
- `CreateCustomerDto` / `UpdateCustomerDto`: agregar `isEmployee?`, `creditAuthorizedBy?`,
  (no exponer `creditReviewedAt` — lo pone el servicio).
- **Validación de negocio** (en `customers.service` create/update, no en el DTO porque es
  condicional): si el payload deja `creditLimit > 0`, exigir `creditDays > 0` y
  `creditAuthorizedBy` no vacío → si no, `BadRequestException`.
- **Auto-sello:** si `creditLimit` o `creditDays` cambian respecto al valor actual, setear
  `creditReviewedAt = new Date()`.
- **Permiso `MANAGE_CUSTOMER_CREDIT`:** si el payload intenta **cambiar** algún campo de crédito
  (`creditLimit`, `creditDays`, `creditAuthorizedBy`) y el usuario **no** tiene el permiso →
  `ForbiddenException`. En `create`, si viene `creditLimit > 0` sin el permiso → también prohibido
  (crear un cliente sin crédito no requiere el permiso).

**Guard de permisos (nuevo, reusable):**
- No existe hoy un guard de permisos granulares (solo `RolesGuard`). Crear
  `apps/api/src/common/guards/permissions.guard.ts` + decorator `@RequirePermission(...key)`
  (espejo de `RolesGuard`/`@Roles`), que lee las `UserPermission` del usuario del JWT.
- Como el chequeo de crédito es **condicional** (solo si tocan campos de crédito), la verificación
  fina se hace **en el servicio** (consultando `UserPermission`); el guard/decorator queda
  disponible para endpoints que sí son permiso-completo (y para la feature de fotos,
  `MANAGE_PRODUCT_IMAGES`).
- El endpoint expone al frontend si el usuario tiene el permiso (vía el perfil `/auth/me` o un
  helper), para mostrar los campos bloqueados.

**Frontend (`sales/customers/new` y `[id]`):**
- Campos nuevos: `Autorizado por` (texto) y `Fecha de análisis` (solo lectura, la muestra si existe).
- Los campos de crédito (`Límite`, `Días`, `Autorizado por`) se muestran **deshabilitados** si el
  usuario no tiene `MANAGE_CUSTOMER_CREDIT` (con nota "Solo administración puede editar el crédito").
- Validación en el form: si `Límite > 0` → `Días` (>0) y `Autorizado por` requeridos (bloquear submit).

## Parte 2 — Días automáticos y fijos + consistencia de `dueDate`

**POS (`sales/pos/page.tsx`):**
- Quitar el `useState(30)` editable; al elegir crédito, mostrar los días del cliente **solo lectura**
  (fetch del cliente ya seleccionado). Ya no se envía `creditDays` en el `pay`.

**Backend (`invoices.service.pay`):**
- Calcular los días como `invoice.customer?.creditDays ?? 0` y usar **el mismo valor** para
  `Invoice.creditDays`, `Invoice.dueDate` y `Receivable.dueDate` (homologar los dos bloques de
  escritura actuales: líneas ~830-846 y ~949-977). `dueDate` con base en `caracasDateKey()`/fecha
  del negocio (hoy usa `new Date()` + días; mantener el cálculo actual pero con la fuente única).

## Parte 3 — Toggle "Es empleado"

- `Customer.isEmployee` + `isEmployee?` en `CreateCustomerDto` (se persiste solo, el service usa
  `data: dto`).
- Frontend: toggle en el form del cliente (mismo patrón visual que `isGroupCompany`).
- **Cuentas por Cobrar:** `QueryReceivablesDto` gana `employeeOnly?: boolean`; `receivables.service
  findAll` agrega `customer: { isEmployee: true }` al `where`; `receivables/page.tsx` agrega el
  checkbox "Solo empleados".

## Parte 4 — Blindaje en el backend (`invoices.service.pay`)

Dentro del `if (dto.isCredit)` (donde hoy está la validación de cupo), con la fuente de verdad en
el backend:

1. **Cupo:** cálculo actual (`availableCredit = creditLimit − Σ CxC PENDING/PARTIAL/OVERDUE`). Si
   `total > availableCredit + 0.01` → **bloquear**, salvo que `dto.overrideCreditBlockAuthorized`
   sea `true`.
2. **Vencidos:** contar CxC del cliente con `status = OVERDUE` **o** (`status IN (PENDING,PARTIAL)`
   y `dueDate < caracasDateKey()`) — cubre el desfase del cron (que marca OVERDUE a las 00:01). Si
   hay ≥1 → **bloquear**, salvo que `dto.overrideCreditBlockAuthorized` sea `true`.
3. Sin sobre-cupo ni vencidos → **pasa sin clave**.

**DTO (`pay-invoice.dto.ts`):** agregar un único `overrideCreditBlockAuthorized?: boolean`
(`@IsOptional @IsBoolean`), igual patrón que `negativeStockAuthorized`. Cubre ambas excepciones.

**Se elimina** la dependencia de `ALLOW_CREDIT_INVOICE` en el flujo de venta a crédito normal (el
enum se deja por compatibilidad, pero el POS ya no pide esa clave para una venta normal).

## Parte 5 — Flujo del POS

Al confirmar una venta a crédito, el POS consulta el **estado de crédito del cliente** (endpoint
existente `receivables/by-customer/:id` → `availableCredit`, `totalOverdue`) y decide:
- **Sin vencidos y dentro del cupo** → procesa directo (sin `DynamicKeyModal`).
- **Con vencidos o sobre el cupo** → aviso claro del motivo ("Cliente con facturas vencidas" y/o
  "Excede el cupo disponible"); para continuar abre **un solo** `DynamicKeyModal` con
  `OVERRIDE_CREDIT_BLOCK`; al autorizar, envía `overrideCreditBlockAuthorized: true`.
- Se quita el `DynamicKeyModal` de `ALLOW_CREDIT_INVOICE` del flujo normal.

## Nota de seguridad (transparencia)

Las **barreras que cuidan la plata (cupo + vencidos) son backend-enforced** → ese es el blindaje
real. El **override** (`overrideCreditBlockAuthorized`) sigue el
patrón existente del proyecto: la clave dinámica se valida **en el POS** y se pasa un flag al `pay`
(igual que `negativeStockAuthorized` hoy). Una llamada directa al API podría pasar el flag en `true`
sin la clave — misma limitación que el modelo actual. Endurecerlo (que el backend valide la clave)
es un no-objetivo de esta fase, anotado para después.

## Migración de datos

- Clientes existentes con `creditLimit > 0` pero sin `creditAuthorizedBy`: la validación
  obligatoria aplica **a nuevas ediciones**; no se fuerza retroactivamente (no romper datos
  existentes). Opcional: un `UPDATE` one-shot para sellar `creditReviewedAt = now()` en los que ya
  tienen cupo (solo en la migración, no en fix-schema).

## Riesgos y consideraciones

- **Cambio de comportamiento (S99):** quitar la clave por-venta puede sorprender al equipo; avisar.
- **`creditLimit = 0` por default:** un cliente sin análisis no puede comprar a crédito (correcto).
- **Guard de permisos nuevo:** validar que no rompa endpoints existentes (solo se aplica donde se
  declare).
- **Concurrencia:** dos cajas simultáneas del mismo cliente podrían pasar ambas el chequeo de cupo
  (sin lock). Pre-existente; fuera de alcance.
- **Permiso `MANAGE_CUSTOMER_CREDIT`:** hay que asignárselo a los usuarios de administración tras
  el deploy (si no, nadie podría editar créditos). Incluir en el checklist de deploy.
