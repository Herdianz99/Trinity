# Nómina — Amonestaciones / Llamados de atención (3 niveles) — Diseño

Fecha: 2026-08-26
Estado: aprobado por el usuario (Diego) para implementación.
Módulo: **Nómina** (`payroll`). Todo vive dentro de Nómina y se gatea con `@RequireModule('payroll')`.

## Propósito

Llevar el control disciplinario del personal mediante "llamados de atención" que escalan en 3
niveles a medida que la misma falta se repite:

1. **Llamado de atención** (1ª vez)
2. **Notificación** (2ª vez)
3. **Amonestación** (3ª vez en adelante)

## Decisión clave — el escalado es POR TIPO DE FALTA, no global

El punto central del brainstorming: un empleado puede tener **varios hilos abiertos a la vez**,
uno por cada tipo de falta, y cada hilo escala de forma **independiente**. Ejemplo real:

- "Puntualidad" → 1ª vez = Llamado. (hilo A)
- "Procedimiento" → si ya lo hizo 3 veces = Amonestación. (hilo B)

Ambos coexisten en el mismo empleado. El nivel de cada registro lo determina **cuántas veces se
ha repetido esa falta específica** en ese empleado, no el total de llamados que tenga.

## Decisiones (del brainstorming con Diego)

- **Escalado automático por conteo, por (empleado + tipo de falta).** Nadie elige el nivel a mano;
  lo calcula el sistema. **Sin override manual** (se decidió dejarlo fuera para mantener coherencia
  con "eliminar solo el último").
- **Topa en Amonestación:** la 3ª y todas las siguientes de la misma falta son Amonestación
  (no se reinicia el ciclo, no dispara acciones automáticas).
- **Tipos de falta = catálogo administrable** desde una pantalla dentro de Nómina. Lo puede
  crear/editar **cualquier usuario con acceso al módulo de Nómina** (no requiere ser admin).
- **Eliminar = solo el último de cada hilo** (el de mayor `sequence`). No hay ediciones ni
  anulaciones en medio. Como el nivel sale del conteo, borrar el último baja el hilo un escalón de
  forma coherente, sin recálculos.
- **Acta en PDF imprimible** de cada llamado (para que el empleado firme) + **adjuntar foto(s) del
  acta firmada** (reusa la infra de Spaces de incidencias/reportes de daño).
- **No afecta el cálculo/pago de nómina.** Es puramente un registro disciplinario.

## Modelo de datos (2 tablas nuevas + 1 de adjuntos)

```
FaultType              id, name(String @unique), isActive(Boolean @default true),
                       actions(DisciplinaryAction[]), createdAt, updatedAt

DisciplinaryAction     id, number(String @unique 'LA-0001'),
                       employeeId(FK Employee), employee,
                       faultTypeId(FK FaultType), faultType,
                       sequence(Int)              // ordinal dentro del hilo (empleado+falta): 1,2,3,4...
                       level(String)              // 'LLAMADO' | 'NOTIFICACION' | 'AMONESTACION'
                       occurredAt(DateTime)       // fecha del suceso (default hoy Caracas)
                       reason(String)             // motivo / descripción
                       attachments(DisciplinaryAttachment[])
                       createdById(FK User), createdBy, createdAt, updatedAt
                       @@index([employeeId, faultTypeId])
                       @@index([occurredAt])

DisciplinaryAttachment id, actionId(FK DisciplinaryAction, onDelete Cascade), action,
                       thumbKey(String), mediumKey(String), createdAt
                       @@index([actionId])
```

Notas:
- `Employee` gana la relación inversa `disciplinaryActions DisciplinaryAction[]`.
- `User` gana la relación inversa nombrada (p.ej. `DisciplinaryActionCreator`).
- `level` se guarda persistido (no calculado en runtime) para que el PDF y los reportes sean
  estables aunque después cambie el historial; el `sequence` deja el conteo explícito y auditable.

## Lógica de escalado (servicio)

**Crear** un llamado para (empleado E, tipo de falta F):
1. En transacción, con bloqueo para el correlativo `LA-XXXX` y para el conteo del hilo
   (patrón `SELECT FOR UPDATE`, igual que facturas/correlativos del repo).
2. `n = count(DisciplinaryAction where employeeId=E and faultTypeId=F)`.
3. `sequence = n + 1`.
4. `level = sequence === 1 ? 'LLAMADO' : sequence === 2 ? 'NOTIFICACION' : 'AMONESTACION'`
   (3 en adelante = Amonestación).
5. Sube adjuntos (si hay) a Spaces **antes** del insert (rollback safety, igual que incidencias).

**Eliminar** un llamado:
- Solo se permite si es el de **mayor `sequence`** en su hilo (empleado+falta). Si no, `400`
  ("solo se puede eliminar el último llamado de cada falta"). Al borrarlo se eliminan sus adjuntos
  de Spaces. No hay recálculo (era el último → el hilo simplemente baja un escalón).

## Backend (apps/api/src/modules)

Reusar el módulo existente `payroll` o crear submódulo dedicado. Propuesta: **nuevo módulo
`disciplinary`** (limpio y aislado), registrado en `app.module.ts`, gateado con
`@RequireModule('payroll')`.

- `fault-types.controller.ts` / `fault-types.service.ts` — CRUD del catálogo
  (POST, GET, GET :id, PATCH :id). Sin borrado si tiene acciones (integridad referencial) o
  `isActive=false` para desactivar.
- `disciplinary.controller.ts` / `disciplinary.service.ts`:
  - `POST /` crear (con adjuntos base64), `GET /` lista paginada con filtros
    (employeeId, faultTypeId, level, rango de fecha), `GET /by-employee/:employeeId` (agrupado por
    tipo de falta para la vista stepper), `GET /:id`, `DELETE /:id` (solo el último), `GET /:id/pdf`.
  - `disciplinary-pdf.service.ts` — genera el acta (reusa patrón `payroll-pdf.service.ts`).
- DTOs: `create-disciplinary-action.dto.ts` (employeeId, faultTypeId, occurredAt?, reason,
  photos?[] base64), `query-disciplinary.dto.ts`, `create-fault-type.dto.ts`,
  `update-fault-type.dto.ts`.
- Correlativo `LA-XXXX`: sigue el patrón de correlativos existente (mismo mecanismo que
  `INC-XXXX` / `NOM-XXXX`).

## Frontend (apps/web/src/app/(dashboard)/payroll)

Nuevas páginas bajo `payroll/`:

- `payroll/disciplinary/page.tsx` — **Lista de amonestaciones**: tabla con empleado, tipo de falta,
  nivel (badge de color: Llamado=amarillo, Notificación=naranja, Amonestación=rojo), fecha, motivo,
  botón "Acta PDF". Filtros por empleado / tipo / nivel / rango de fecha. Paginación estándar.
- `payroll/disciplinary/employee/[id]/page.tsx` — **Vista por empleado (stepper)**: cada tipo de
  falta como un hilo con el semáforo de 3 pasos (①Llamado ②Notificación ③Amonestación) marcando
  dónde va, y debajo la lista de eventos de ese hilo con su fecha/motivo. Botón "Registrar" (con el
  empleado preseleccionado) y botón para eliminar el último de un hilo.
- `payroll/fault-types/page.tsx` — **Catálogo de tipos de falta**: CRUD simple (nombre, activo),
  accesible por cualquiera con módulo Nómina.
- **Modal/form de registro**: buscador de empleado + select de tipo de falta (con opción de crear
  el tipo al vuelo) + fecha del suceso + motivo. Al elegir empleado y tipo, muestra en vivo
  "este será el 2º de Puntualidad → Notificación". Al guardar, ofrece imprimir el acta.
- Fotos comprimidas en el navegador y enviadas base64 (mismo patrón que incidencias).
- `document.title` con el patrón `'... | Trinity ERP'` en cada página nueva.
- Timezone: fechas locales con getFullYear()/getMonth()/getDate(); `occurredAt` se envía con
  offset Caracas `-04:00` (mismo patrón que incidencias).

## Acta PDF

Contenido: datos de la empresa (CompanyConfig), empleado (nombre, cédula, cargo/departamento vía
`Employee`→`Customer`/`Position`/`Department`), tipo de falta, **nivel**, motivo, fecha del suceso,
número `LA-XXXX`, y espacios de firma (empleado + supervisor/RRHH). Reusa el patrón de
`payroll-pdf.service.ts`.

## Navegación y permisos

- Ítem "Amonestaciones" en el grupo de **Nómina** del sidebar, visible con permiso `payroll` (o `*`).
- Todos los endpoints con `@RequireModule('payroll')`. Cualquier usuario con acceso a Nómina puede
  crear tipos de falta, registrar llamados y eliminar el último. No requiere ADMIN.

## Fuera de alcance (YAGNI, por ahora)

- No afecta el cálculo/pago de nómina (no descuenta).
- No hay reinicio de ciclo ni acciones automáticas tras la amonestación (solo queda topado).
- Sin override manual de nivel (el nivel siempre lo decide el conteo).
- Sin edición/anulación en medio de un hilo (solo eliminar el último).

## Migración Prisma

- Migración aditiva con `IF NOT EXISTS` (regla del repo). Crea `FaultType`,
  `DisciplinaryAction`, `DisciplinaryAttachment` + índices. Nada destructivo.
- Reflejar en `deploy/fix-schema.sql` como red de seguridad (patrón del repo).
