Lee el PROJECT.md y el PROGRESS.md antes de escribir cualquier línea de código.
Vamos a rediseñar completamente el módulo de cajas siguiendo un nuevo flujo de trabajo.
Antes de escribir cualquier código consulta las skills disponibles especialmente frontend-design.
PARTE 1 — Migración de Prisma
Actualizar modelo CashRegister:
prismamodel CashRegister {
  id                String        @id @default(cuid())
  code              String        @unique
  name              String
  isFiscal          Boolean       @default(false)
  isShared          Boolean       @default(false)
  isActive          Boolean       @default(true)
  lastInvoiceNumber Int           @default(0)
  sessions          CashSession[]
  invoices          Invoice[]
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
}
Actualizar modelo CashSession:
prismamodel CashSession {
  id                  String       @id @default(cuid())
  cashRegisterId      String
  cashRegister        CashRegister @relation(...)
  openedById          String
  openedBy            User         @relation("SessionOpenedBy", ...)
  closedById          String?
  closedBy            User?        @relation("SessionClosedBy", ...)
  openingBalanceUsd   Float        @default(0)
  openingBalanceBs    Float        @default(0)
  closingBalanceUsd   Float?
  closingBalanceBs    Float?
  status              SessionStatus @default(OPEN)
  notes               String?
  openedAt            DateTime     @default(now())
  closedAt            DateTime?
}
Corre migración con nombre redesign_cash_register_module.

PARTE 2 — Backend (NestJS)
Actualizar CashRegistersModule:

GET /cash-registers — lista todas las cajas con su sesión activa si tiene
GET /cash-registers/available — cajas disponibles para el usuario actual:

Cajas con sesión activa abiertas por el usuario actual
Cajas con sesión activa marcadas como isShared = true


GET /cash-registers/:id — detalle de la caja con sesión activa actual
POST /cash-registers — crear caja (solo ADMIN)
PATCH /cash-registers/:id — editar caja (solo ADMIN)
POST /cash-registers/:id/open — abrir sesión:

Body: { openingBalanceUsd, openingBalanceBs, notes? }
Cualquier usuario puede abrir cualquier caja
Una caja solo puede tener UNA sesión OPEN a la vez
Retorna la sesión creada


POST /cash-sessions/:id/close — cerrar sesión:

Body: { closingBalanceUsd, closingBalanceBs, notes? }
Guarda closedById = currentUser.id
Calcula resumen: totales por método de pago durante la sesión


GET /cash-sessions/:id/summary — resumen detallado:

openingBalanceUsd, openingBalanceBs
paymentsByMethod: [{ methodName, count, totalUsd, totalBs }]
totalUsd, totalBs
invoiceCount
closingBalanceUsd?, closingBalanceBs?
differenceUsd?, differenceBs?


GET /cash-registers/:id/sessions — historial de sesiones cerradas de esa caja, ordenadas por closedAt DESC
GET /cash-sessions/:sessionId/payments — lista de pagos de una sesión con filtro ?methodId, paginación 20 por página, ordenados por createdAt DESC


PARTE 3 — Frontend (Next.js)
Página /cash — Lista de cajas:

Header: "Cajas registradoras"
Tabla: Nombre, Código, Tipo (badge Fiscal/Normal), Compartida (badge Sí/No), Estado (badge verde Abierta / gris Cerrada), Abierta por, Hora apertura
Click en fila → navega a /cash/[id]
Filas de cajas cerradas → botón "Abrir caja" que abre modal de apertura
Filas de cajas abiertas → botón "Ver" que navega al detalle

Modal "Abrir caja":

Nombre de la caja (solo lectura)
Campo "Fondo inicial USD"
Campo "Fondo inicial Bs"
Notas opcionales
Botón "Abrir caja"

Página /cash/[id] — Detalle de caja:
Header: nombre de la caja + badge estado + badge Fiscal/Normal + badge Compartida/Exclusiva
Tab "Sesión actual" (visible solo si hay sesión OPEN):

Layout dos columnas:

Columna izquierda: (30% del ancho)

Título "Fondos de apertura"
Fondo USD: valor (solo lectura, bloqueado)
Fondo Bs: valor (solo lectura, bloqueado)
Separador
Título "Totales del día"
Total cobrado USD
Total cobrado Bs
Total facturas


Columna derecha: (70% del ancho)

Filtro por método de pago (dropdown con métodos activos)
Tabla de pagos: Hora, Factura, Cliente, Método, Monto USD, Monto Bs
Paginación 20 por página




Botones al pie (alineados a la derecha):

"Reporte X" (solo si isFiscal = true, color azul)
"Reporte Z" (solo si isFiscal = true, color naranja)
"Cerrar caja" (color rojo) → abre modal de cierre



Modal "Cerrar caja":

Resumen de la sesión: totales por método de pago
Campo "Efectivo USD contado físicamente"
Campo "Efectivo Bs contado físicamente"
Diferencia calculada automáticamente (verde si cuadra, rojo si hay diferencia)
Notas opcionales
Botón "Confirmar cierre"

Tab "Historial de cierres":

Tabla: Fecha apertura, Fecha cierre, Abierta por, Cerrada por, Fondo USD, Fondo Bs, Total cobrado USD, Total cobrado Bs, Diferencia
Click en fila → abre modal con detalle completo del cierre (misma info que la sesión actual pero de solo lectura)
Si la caja está cerrada (sin sesión activa) → este tab es el que se muestra por defecto

POS — Selector de caja:

Al entrar al POS verificar si el usuario tiene una caja seleccionada en localStorage
Si no tiene → llamar a GET /cash-registers/available y mostrar modal:

Título: "Selecciona una caja para comenzar"
Lista de cajas disponibles (las que abrió el usuario + las compartidas abiertas)
Si no hay cajas disponibles → mensaje "No hay cajas abiertas disponibles. Abre una caja primero." con botón "Ir a cajas" que navega a /cash
Al seleccionar → guardar en localStorage y cerrar modal


Si tiene caja seleccionada → mostrar en el header del POS: nombre de la caja + botón "Cambiar"
Al cambiar de caja → limpiar localStorage y mostrar el modal de selección nuevamente
Vendedores (rol SELLER): no mostrar selector de caja, no mostrar botón "Cobrar", solo "Guardar pre-factura"
Roles con acceso a cobro (CASHIER, ADMIN, SUPERVISOR): si no tienen caja seleccionada → botón "Cobrar" aparece deshabilitado con tooltip "Selecciona una caja para cobrar"

Sidebar:

Renombrar sección a "CAJA"
Items: "Cajas" → /cash, "Sesiones" → /cash/sessions (historial global de todas las sesiones)

Página /cash/sessions — Historial global:

Filtros: caja, usuario, estado, rango de fechas
Tabla: Caja, Abierta por, Fecha apertura, Cerrada por, Fecha cierre, Total USD, Total Bs, Estado


Al terminar:

Verificar flujo completo: ir a /cash → abrir caja → entrar al POS → seleccionar caja → facturar → ver pagos en tiempo real en detalle de caja → cerrar caja con arqueo
Verificar que SELLER no ve selector de caja y no puede cobrar
Verificar que cajas compartidas aparecen para todos los usuarios en el POS
Verificar que cajas exclusivas solo aparecen para quien las abrió
Haz commit con el mensaje feat: redesign cash register module with shared/exclusive sessions and detailed view
Haz push a GitHub
Actualiza el PROGRESS.md y el PROJECT.md