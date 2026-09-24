# Portal del empleado — "Mi Perfil" + Notificaciones — Diseño

Fecha: 2026-09-24
Estado: aprobado por el usuario (Diego) para implementación.
Módulos tocados: **auth/users** (ancla + rol), **nuevo módulo `me` (portal)** y **nuevo módulo `notifications`**.
Reusa datos ya existentes de `Customer`, `Employee`, `Receivable`, `Invoice`, `PayrollRunLine`, `DisciplinaryAction`.

## Propósito

Dar a cada empleado una sección personal de **autoservicio** ("Mi Perfil") donde, tras iniciar
sesión con su propio usuario, pueda ver **solo su propia** información:

- Datos personales + límite de crédito (solo lectura).
- CxC detallada por documento (lo que debe como cliente).
- Facturas (qué debe / qué pagó).
- Deducciones de nómina aplicadas a su deuda (para que cuadre con su recibo).
- Recibos de nómina (con descarga del PDF).
- Amonestaciones / llamados de atención.
- Un buzón de **notificaciones** con acuse "enterado / en desacuerdo" + comentario (respaldo laboral).

El grueso son **vistas de solo-lectura** sobre datos que ya existen. Las dos piezas nuevas son
(1) el **ancla `Usuario → Empleado`** y (2) el **módulo de notificaciones**.

## Decisiones (del brainstorming con Diego)

- **Acceso:** login individual por empleado. La mayoría ya tiene su usuario; a mantenimiento (y a
  cada persona de almacén, que hoy comparten `almacen@gmail.com`) se les creará un **usuario propio**.
  El usuario compartido `almacen@gmail.com` **no** tendrá portal personal (seguiría de solo-consulta).
- **Ancla = campo `employeeId` en `User`** (FK nullable y única). `Employee` ya trae el `Customer`,
  así que con ese único vínculo se llega a nómina, amonestaciones, CxC, límite de crédito y datos
  personales. (Se descartó el match por cédula por frágil y `User→Customer` por menos limpio.)
- **Rol nuevo `EMPLOYEE`** para usuarios que solo deben ver su perfil (mantenimiento/almacén):
  aterrizan directo en "Mi Perfil" y no ven ningún otro menú. Los usuarios que ya tienen rol
  (cajero, vendedor, etc.) **conservan su rol** y se les suma la sección "Mi Perfil" **si** están
  vinculados a un empleado.
- **Seguridad:** el portal se sirve por endpoints `/me/*` que resuelven el `employeeId` **desde el
  token** (`@CurrentUser`), nunca desde un parámetro del navegador. Imposible ver el perfil de otro.
- **Datos personales: solo lectura.** Si algo está mal, el empleado avisa a RRHH (no hay edición ni
  flujo de solicitud de cambios en v1).
- **Deudas mostradas:** CxC + facturas **+ deducción de nómina** (`PayrollRunLine.creditDeductionBs`
  por corrida).
- **Notificaciones:** acuse tipo **"enterado / en desacuerdo" + comentario**, como respaldo laboral.
  Las crean **RRHH + ADMIN + SUPERVISOR**. Destino: **individual, varios, por departamento o todos**.
- **Amonestación → notificación automática:** al crear una `DisciplinaryAction`, el sistema genera
  automáticamente una notificación tipo `AMONESTACION` enlazada, que el empleado debe acusar.

## Modelo de datos

### 1. Ancla y rol (cambios a modelos existentes)

```
User        + employeeId  String?  @unique          // FK nullable a Employee (el ancla)
            + employee    Employee? @relation("EmployeeUser", fields:[employeeId], references:[id])

Employee    + user        User?     @relation("EmployeeUser")   // inversa 1:1

UserRole    enum: + EMPLOYEE        // rol restringido "solo mi perfil"
```

Notas:
- `employeeId` es **único** → un empleado ↔ a lo sumo un usuario personal. El usuario compartido de
  almacén queda con `employeeId = null` (sin portal), consistente con la decisión.
- Un `User` sin `employeeId` (usuarios de oficina/sistema) simplemente **no ve** "Mi Perfil".

### 2. Notificaciones (2 tablas nuevas + 2 enums)

```
NotificationType     enum: INFORMATIVA | REUNION | AMONESTACION
NotificationAckState enum: PENDIENTE | RECIBIDO | RECHAZADO      // "recibido"=enterado, "rechazado"=en desacuerdo

Notification         id, title(String), body(String),
                     type(NotificationType @default INFORMATIVA),
                     disciplinaryActionId(String? @unique)       // enlace opcional a la amonestación origen
                     disciplinaryAction(DisciplinaryAction? @relation)
                     createdById(FK User), createdBy,
                     createdAt, updatedAt,
                     recipients(NotificationRecipient[])
                     @@index([type])
                     @@index([createdAt])

NotificationRecipient id, notificationId(FK Notification, onDelete Cascade), notification,
                     employeeId(FK Employee), employee,
                     ackState(NotificationAckState @default PENDIENTE),
                     comment(String?),                            // comentario del empleado al acusar
                     ackAt(DateTime?),                            // cuándo acusó
                     createdAt,
                     @@unique([notificationId, employeeId])       // 1 destinatario por notificación
                     @@index([employeeId, ackState])              // buzón + conteo de pendientes
```

Notas:
- La tabla intermedia `NotificationRecipient` (1 fila por empleado destinatario) es lo que permite
  enviar a varios/depto/todos y que **cada quien acuse por separado**.
- `DisciplinaryAction` gana la inversa `notification Notification?` (relación `@unique` 1:1 opcional).
- El acuse (`ackState`, `comment`, `ackAt`) vive en la fila del destinatario, no en la notificación.

## Backend

### Módulo `me` (portal, solo-lectura) — `apps/api/src/modules/me/`

Todos los endpoints resuelven el empleado con `@CurrentUser('id')` → `user.employeeId`. Si el usuario
no tiene `employeeId`, responden `403`/objeto vacío según convenga (nunca datos de otro).

- `me.controller.ts` / `me.service.ts`:
  - `GET /me/perfil` — datos personales (de `Customer`/`Employee`/`Position`/`Department`) + límite de
    crédito (`Customer.creditLimit`, `creditDays`).
  - `GET /me/cxc` — `Receivable` por `customerId`, detallado por documento (número, fecha, vencimiento,
    monto, pagado, saldo, estado PENDING/PARTIAL/OVERDUE/PAID). Ordenado por vencimiento.
  - `GET /me/facturas` — `Invoice` por `customerId` (número, fecha, total, pagado, saldo, estado).
  - `GET /me/recibos` — `PayrollRunLine` por `employeeId` (período, bruto, deducciones, neto Bs/USD);
    incluye `creditDeductionBs` por corrida (la **deducción de nómina** aplicada a su deuda).
  - `GET /me/recibos/:lineId/pdf` — PDF del recibo (reusa `payroll-pdf.service.ts`), validando que la
    línea pertenezca al empleado del token.
  - `GET /me/amonestaciones` — `DisciplinaryAction` por `employeeId` (nivel, tipo, motivo, fecha, fotos).

Un endpoint agregado opcional `GET /me/resumen` para el dashboard del portal (conteos: pendientes de
acuse, saldo total CxC, nº de facturas por pagar) — de conveniencia, para no hacer N llamadas.

### Módulo `notifications` — `apps/api/src/modules/notifications/`

- **Lado empleado** (cualquier usuario autenticado con `employeeId`), scoping por token:
  - `GET /me/notificaciones` — buzón del empleado (join a `NotificationRecipient` por su `employeeId`),
    con filtro por `ackState` y flag de no-leídas/pendientes.
  - `POST /me/notificaciones/:recipientId/ack` — body `{ ackState: RECIBIDO|RECHAZADO, comment? }`.
    Valida que `recipientId` sea del empleado del token; setea `ackAt`. **Una vez acusada, el acuse
    queda fijo** (si ya no está `PENDIENTE`, responde `400`); así el registro sirve de respaldo
    inmutable.
- **Lado emisor** (`@Roles(ADMIN, RRHH, SUPERVISOR)`):
  - `POST /notifications` — crea la notificación y sus destinatarios. Body:
    `{ title, body, type, target: { mode: 'INDIVIDUAL'|'MULTIPLE'|'DEPARTMENT'|'ALL', employeeIds?, departmentId? } }`.
    El servicio expande el `target` a la lista de `employeeId` (solo empleados activos) y crea las
    filas de `NotificationRecipient` en una transacción.
  - `GET /notifications` — lista para el emisor (con conteos de acuse: cuántos recibidos/rechazados/
    pendientes por notificación), filtros por tipo/fecha.
  - `GET /notifications/:id` — detalle + estado de acuse por destinatario (para auditoría de RRHH).
- DTOs: `create-notification.dto.ts`, `ack-notification.dto.ts`, `query-notifications.dto.ts`.

### Integración amonestación → notificación (automática)

En `disciplinary.service.ts`, dentro de la **misma transacción** que crea la `DisciplinaryAction`,
crear una `Notification` tipo `AMONESTACION` (title/body derivados del nivel + tipo de falta),
enlazada por `disciplinaryActionId`, con **un** `NotificationRecipient` para ese empleado. Al eliminar
el último llamado de un hilo, la notificación enlazada se borra en cascada (`onDelete Cascade` desde
`NotificationRecipient`; la `Notification` se borra explícitamente en la misma tx).

## Frontend (apps/web)

### Sección "Mi Perfil" — `apps/web/src/app/(dashboard)/mi-perfil/`

- `mi-perfil/page.tsx` — **Dashboard del portal**: tarjetas resumen (saldo CxC, facturas por pagar,
  notificaciones pendientes) + accesos a las sub-secciones. `document.title = 'Mi Perfil | Trinity ERP'`.
- `mi-perfil/datos/page.tsx` — datos personales + límite de crédito (solo lectura).
- `mi-perfil/cxc/page.tsx` — CxC detallada por documento.
- `mi-perfil/facturas/page.tsx` — facturas (qué debe / qué pagó).
- `mi-perfil/recibos/page.tsx` — recibos de nómina + botón "Ver PDF"; muestra la deducción de nómina
  aplicada a su deuda por período.
- `mi-perfil/amonestaciones/page.tsx` — sus amonestaciones (badges por nivel, motivo, fecha, fotos).
- `mi-perfil/notificaciones/page.tsx` — **buzón**: lista con badge de pendientes; abrir una muestra
  título/cuerpo y, si está PENDIENTE, botones **"Enterado"** / **"En desacuerdo"** + campo de
  comentario. Una vez acusada, muestra el estado y el comentario (bloqueado).

### Emisor de notificaciones — dentro del módulo RRHH/Nómina

- `payroll/notificaciones/page.tsx` (o bajo un grupo "RRHH") — **crear notificación**: título, cuerpo,
  tipo, y selector de destino (individual / varios / por departamento / todos). Lista de notificaciones
  enviadas con su **tablero de acuse** (recibidos / rechazados / pendientes) y detalle por empleado
  con su comentario. Gateado a roles ADMIN/RRHH/SUPERVISOR.

### Navegación y ruteo por rol

- Los usuarios con `employeeId` ven el grupo **"Mi Perfil"** en el sidebar.
- El rol `EMPLOYEE` **solo** ve "Mi Perfil": tras login, redirección por defecto a `/mi-perfil`, y el
  sidebar oculta todo lo demás. Se implementa con el mapa rol→módulos existente (`EMPLOYEE` mapea a un
  único "módulo" lógico `mi-perfil`) y guardas de ruta en el layout del dashboard.
- Convenciones del repo: `document.title` `'... | Trinity ERP'` en cada página; fechas locales con
  getFullYear()/getMonth()/getDate(); montos Bs ya calculados (no recalcular en runtime).

## Seguridad (lo más crítico)

- **Todo `/me/*` scoped por token.** El `employeeId`/`customerId` se toma de `@CurrentUser`, jamás de
  un query param o body. No existe `GET /me/cxc/:employeeId`.
- **Acuse validado por dueño:** `POST /me/notificaciones/:recipientId/ack` verifica que el
  `recipientId` pertenezca al empleado del token antes de escribir.
- **Emisor gateado por rol** (ADMIN/RRHH/SUPERVISOR) con el guard de roles existente.
- **Usuario sin empleado:** el portal responde vacío/"no disponible"; el rol `EMPLOYEE` siempre debe
  tener `employeeId` (validación al crear/editar el usuario en la pantalla de usuarios).

## Fuera de alcance (YAGNI, para después)

- **Evaluaciones individuales y "ver su progreso"** — se dejan planteadas (podrían colgar de
  amonestaciones/notificaciones o de un módulo nuevo) pero **no se construyen** en v1.
- **Edición de datos personales / flujo de solicitud de cambios** — v1 es solo lectura.
- **Notificaciones por correo/push** — v1 es in-app. (El `MailService` existe; se podría enganchar
  luego para avisar por email cuando llegue una notificación.)
- **Confirmar asistencia a reuniones** como flujo aparte — se cubre con el mismo acuse genérico
  (enterado / en desacuerdo + comentario).

## Migración Prisma

- Migración **aditiva** con `IF NOT EXISTS` (regla del repo):
  - `ALTER TABLE "User" ADD COLUMN "employeeId"` + índice único.
  - `ALTER TYPE "UserRole" ADD VALUE 'EMPLOYEE'` (idempotente / guardado).
  - `CREATE TABLE "Notification"`, `"NotificationRecipient"` + enums `NotificationType`,
    `NotificationAckState` + índices.
  - Inversa `Notification.disciplinaryActionId` única hacia `DisciplinaryAction`.
- Reflejar en `deploy/fix-schema.sql` como red de seguridad (patrón del repo). Nada destructivo.

## Verificación (antes de deploy)

- E2E local: crear un `User` rol `EMPLOYEE` vinculado a un empleado real; confirmar que solo ve
  "Mi Perfil" y que `/me/*` devuelve **sus** datos (probar que con otro token no puede ver ajenos).
- Crear una amonestación y confirmar que aparece la notificación automática y su acuse.
- Enviar notificación a un departamento y verificar que se crean N destinatarios y que cada acuse es
  independiente.
- Verificar el PDF del recibo desde el portal (mismo que nómina) y que la deducción de nómina cuadra.
