Guarda esto en tu session-prompt.md y dáselo a Claude Code:


Lee el PROJECT.md y el PROGRESS.md antes de escribir cualquier línea de código.
Vamos a implementar la Sesión 6 de Trinity ERP: Caja y Arqueo.
Antes de escribir cualquier código consulta las skills disponibles especialmente frontend-design.
CONTEXTO IMPORTANTE — Cómo trabajan con las cajas:

Cualquier usuario puede abrir, usar y cerrar cualquier caja sin restricción de rol por ahora
Las cajas no tienen dueño — son compartidas, varios usuarios pueden usar la misma caja simultáneamente
Al entrar al POS, si el usuario tiene acceso a ese módulo, siempre se le pregunta qué caja va a usar mediante un modal
El usuario puede cambiar de caja en cualquier momento desde el POS sin cerrar turno
Las pre-facturas y cotizaciones creadas por vendedores no necesitan caja hasta que el cajero las cobra
Las 3 cajas del negocio son: "Caja Notas" (código "01"), "Fiscal 1" (código "02"), "Fiscal 2" (código "03")

PARTE 1 — Migración de Prisma
El modelo CashRegister ya existe. Verificar que tiene estos campos y agregar los que falten:
prismamodel CashRegister {
  id                String        @id @default(cuid())
  code              String        @unique  // "01", "02", "03"
  name              String        // "Caja Notas", "Fiscal 1", "Fiscal 2"
  lastInvoiceNumber Int           @default(0)
  isActive          Boolean       @default(true)
  isFiscal          Boolean       @default(false)  // si tiene máquina fiscal
  sessions          CashSession[]
  invoices          Invoice[]
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
}

model CashSession {
  id               String        @id @default(cuid())
  cashRegisterId   String
  cashRegister     CashRegister  @relation(...)
  openedById       String
  openedBy         User          @relation("SessionOpenedBy", ...)
  closedById       String?
  closedBy         User?         @relation("SessionClosedBy", ...)
  openingBalance   Float         @default(0)
  closingBalance   Float?
  status           SessionStatus @default(OPEN)
  notes            String?
  openedAt         DateTime      @default(now())
  closedAt         DateTime?
}

enum SessionStatus { OPEN CLOSED }
Si ya existen estos modelos verificar que tengan todos los campos. Agregar solo lo que falte.
Corre migración con nombre update_cash_register_sessions.
Actualizar seed con las 3 cajas:

{ code: "01", name: "Caja Notas", isFiscal: false }
{ code: "02", name: "Fiscal 1", isFiscal: true }
{ code: "03", name: "Fiscal 2", isFiscal: true }

PARTE 2 — Backend (NestJS)
Actualizar CashRegistersModule:

GET /cash-registers — lista todas las cajas con su sesión activa si tiene una
GET /cash-registers/open — solo cajas que tienen al menos una sesión OPEN
GET /cash-registers/:id — detalle con sesión activa y resumen de ventas del día
POST /cash-registers/:id/open-session — abrir nueva sesión:

Body: { openingBalance, notes? }
Cualquier usuario puede abrir sesión en cualquier caja
Una caja puede tener múltiples sesiones abiertas simultáneamente
Retorna la sesión creada


POST /cash-sessions/:id/close — cerrar sesión específica:

Body: { closingBalance, notes? }
Calcula el resumen de la sesión: ventas por método de pago, total esperado vs físico
Marca la sesión como CLOSED


GET /cash-sessions/:id/summary — resumen detallado de una sesión:

Retorna: { openingBalance, totalSalesByMethod: [{ method, count, totalUsd, totalBs }], totalUsd, totalBs, invoiceCount, closingBalance?, difference? }
Agrupa todos los pagos de facturas PAID vinculadas a esta caja durante el período de la sesión



PARTE 3 — Frontend (Next.js)
Modal de selección de caja en el POS:

Al navegar a /sales/pos, antes de mostrar el POS verificar si hay una caja seleccionada en localStorage (selectedCashRegisterId)
Si no hay caja seleccionada → mostrar modal fullscreen (no se puede cerrar con Escape ni click fuera):

Título: "Selecciona una caja para comenzar"
Lista de cajas ABIERTAS (con sesión activa) — card por caja con: nombre, código, si es fiscal, cuántas sesiones activas tiene, botón "Usar esta caja"
Sección separada "Cajas cerradas" — cajas sin sesión activa con botón "Abrir caja" que abre un mini modal para ingresar el fondo inicial
Al seleccionar caja → guardar en localStorage y mostrar el POS


En el header del POS mostrar: nombre de la caja activa + botón "Cambiar caja" que abre el mismo modal

Nueva sección CAJA en sidebar con items:

Gestión de cajas → /cash
Sesiones → /cash/sessions

Página /cash — Gestión de cajas:

Tabla de cajas: nombre, código, tipo (Fiscal/Notas), sesiones activas, estado
Por cada caja: botón "Abrir sesión" (si no tiene sesión o quiere abrir otra) y botón "Ver sesiones"
Modal abrir sesión: campo monto de apertura en USD y notas opcionales

Página /cash/sessions — Historial de sesiones:

Filtros: caja, estado (OPEN/CLOSED), rango de fechas
Tabla: caja, abierta por, fecha apertura, fecha cierre, monto apertura, monto cierre, diferencia, estado
Badge verde OPEN, gris CLOSED
Botón "Ver arqueo" por sesión → abre modal de detalle

Modal de arqueo (detalle de sesión):

Header: nombre caja, período (desde → hasta o "Abierta actualmente")
Monto de apertura
Tabla de ventas por método de pago: Método, Transacciones, Total USD, Total Bs
Total general USD y Bs
Si sesión cerrada: monto físico ingresado, diferencia (verde si cuadra, rojo si hay diferencia)
Si sesión abierta: campo para ingresar monto físico + botón "Cerrar sesión"
Últimas 10 facturas de la sesión

Al terminar:

Actualizar seed para crear las 3 cajas con sus datos correctos
Verificar flujo completo: entrar al POS → modal de selección → abrir sesión nueva → facturar → ver arqueo → cerrar sesión
Verificar que el número de factura usa el código de la caja seleccionada
Haz commit con el mensaje feat: Session 6 - cash register selection in POS, sessions and arqueo
Haz push a GitHub
Actualiza el PROGRESS.md y el PROJECT.md