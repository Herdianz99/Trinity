Lee el PROJECT.md y el PROGRESS.md antes de escribir cualquier línea de código.
Vamos a implementar la Sesión 7 de Trinity ERP: Cuentas por Cobrar (CxC).
Antes de escribir cualquier código consulta las skills disponibles especialmente frontend-design.
CONTEXTO:
El modelo Receivable ya existe en el schema desde la Sesión 5. Las CxC se generan automáticamente desde:

Facturas a crédito al cliente → type = CUSTOMER_CREDIT
Pagos con Cashea o Crediagro → type = FINANCING_PLATFORM, platformName = "Cashea" o "Crediagro"

PARTE 1 — Verificar y completar el modelo Receivable
Verificar que el modelo Receivable tiene todos estos campos y agregar los que falten:
prismamodel Receivable {
  id            String           @id @default(cuid())
  type          ReceivableType
  customerId    String?
  customer      Customer?        @relation(...)
  platformName  String?
  invoiceId     String
  invoice       Invoice          @relation(...)
  amountUsd     Float
  amountBs      Float
  exchangeRate  Float
  dueDate       DateTime?
  status        ReceivableStatus @default(PENDING)
  paidAmountUsd Float            @default(0)
  paidAt        DateTime?
  notes         String?
  payments      ReceivablePayment[]
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt
}

model ReceivablePayment {
  id            String     @id @default(cuid())
  receivableId  String
  receivable    Receivable @relation(...)
  amountUsd     Float
  amountBs      Float
  exchangeRate  Float
  method        PaymentMethod
  reference     String?
  cashSessionId String?
  notes         String?
  createdById   String
  createdAt     DateTime   @default(now())
}

enum ReceivableType    { CUSTOMER_CREDIT FINANCING_PLATFORM }
enum ReceivableStatus  { PENDING PARTIAL PAID OVERDUE }
Corre migración con nombre update_receivables_module.
Agregar a CompanyConfig:

overdueWarningDays Int @default(3) — días antes del vencimiento para mostrar alerta

PARTE 2 — Backend (NestJS)
Nuevo ReceivablesModule completo:

GET /receivables — lista con filtros:

?type — CUSTOMER_CREDIT o FINANCING_PLATFORM
?status — PENDING, PARTIAL, PAID, OVERDUE
?customerId
?platformName — "Cashea", "Crediagro"
?from&to — por fecha de creación, usar setUTCHours
?overdue=true — solo vencidas (dueDate < hoy y status != PAID)
?page&limit
Retorna junto con cada receivable: saldo pendiente = amountUsd - paidAmountUsd


GET /receivables/summary — resumen global:
json{
  "totalPendingUsd": 0,
  "totalOverdueUsd": 0,
  "byPlatform": [{ "platformName": "Cashea", "totalUsd": 0, "count": 0 }],
  "byStatus": [{ "status": "PENDING", "count": 0, "totalUsd": 0 }]
}

GET /receivables/:id — detalle con historial de pagos y datos del cliente/plataforma
POST /receivables/:id/pay — registrar cobro parcial o total:

Body: { amountUsd, method, reference?, cashSessionId?, notes? }
Calcular amountBs = amountUsd × tasa del día
Crear ReceivablePayment
Actualizar paidAmountUsd += amountUsd
Si paidAmountUsd >= amountUsd → status = PAID, paidAt = now()
Si paidAmountUsd > 0 && < amountUsd → status = PARTIAL
Actualizar el cupo de crédito del cliente si type = CUSTOMER_CREDIT
Todo en transacción Prisma


GET /receivables/customer/:customerId — estado de cuenta del cliente:

Lista de todas sus CxC con saldo pendiente
Total adeudado, total vencido, crédito disponible



Cron job diario a las 00:01:

Marcar como OVERDUE todas las Receivables donde dueDate < hoy y status = PENDING o PARTIAL

PARTE 3 — Frontend (Next.js)
Nueva sección en sidebar: CxC con items:

Cuentas por cobrar → /receivables
Por plataforma → /receivables/platforms

Página /receivables — Cuentas por cobrar:
Header con 4 tarjetas resumen:

Total por cobrar (USD) — azul
Vencidas (USD) — rojo con ícono de alerta
Cashea pendiente — verde
Crediagro pendiente — verde

Filtros: tipo, estado, cliente/plataforma, rango de fechas, toggle "Solo vencidas"
Tabla con columnas: Tipo (badge CRÉDITO/CASHEA/CREDIAGRO), Cliente o Plataforma, Factura vinculada, Monto USD, Cobrado USD, Saldo USD, Vence, Estado, Acciones
Badge de estado:

Amarillo PENDING
Azul PARTIAL
Verde PAID
Rojo OVERDUE

Fila vencida → fondo rojo suave
Fila próxima a vencer (dentro de overdueWarningDays) → fondo amarillo suave
Acciones por fila:

"Registrar cobro" (si no está PAID) → abre modal de cobro
"Ver detalle" → abre modal con historial de pagos

Modal "Registrar cobro":

Muestra: cliente/plataforma, factura, monto total, ya cobrado, saldo pendiente
Campo monto a cobrar (pre-llenado con saldo pendiente, editable para cobros parciales)
Selector método de pago
Campo referencia opcional
Tasa del día (solo lectura)
Monto en Bs calculado automáticamente
Botón "Confirmar cobro"

Modal "Ver detalle":

Info del receivable (cliente, factura, fechas, montos)
Tabla de pagos recibidos: fecha, monto USD, monto Bs, método, referencia
Total cobrado y saldo restante

Página /receivables/platforms — Por plataforma:

Tabs: Cashea | Crediagro
Por cada plataforma: total pendiente, total cobrado, tabla de CxC filtrada
Útil para cuando la plataforma hace el pago mensual — registrar un solo cobro que cubra múltiples facturas

Estado de cuenta en /sales/customers/:id:

Agregar sección "Estado de cuenta" en la vista detalle del cliente
Muestra: crédito total, crédito usado, crédito disponible
Lista de CxC pendientes con botón "Cobrar"

Al terminar:

Verifica el flujo completo: crear factura a crédito → ver CxC generada → registrar cobro parcial → registrar cobro total → verificar que el cupo del cliente se actualiza
Verifica el flujo Cashea: factura con pago Cashea → ver CxC a plataforma → registrar cobro
Haz commit con el mensaje feat: Session 7 - accounts receivable with partial payments and platform tracking
Haz push a GitHub
Actualiza el PROGRESS.md y el PROJECT.md