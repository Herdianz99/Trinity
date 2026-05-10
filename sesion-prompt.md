Guarda esto en tu session-prompt.md y dáselo a Claude Code:


Lee el PROJECT.md y el PROGRESS.md antes de escribir cualquier línea de código.
Vamos a implementar la Sesión 5 de Trinity ERP: Ventas y POS.
Antes de escribir cualquier código consulta las skills disponibles en /mnt/skills/public/ especialmente frontend-design.
PARTE 1 — Backend (NestJS)
ExchangeRateModule — verificar que ya existe y agregar:

Al crear cualquier factura de venta → obtener tasa del día con GET /exchange-rate/today. Si no existe tasa del día → retornar 400 con mensaje "No hay tasa BCV registrada para hoy. Registra la tasa antes de facturar"

CustomersModule:

GET /customers — lista con filtros ?search&isActive&page&limit
GET /customers/:id — detalle con historial de últimas 10 facturas
POST /customers — crear cliente con: name, rif, phone, email, address, type (NATURAL/JURIDICA), creditLimit (USD), creditDays
PATCH /customers/:id — editar
DELETE /customers/:id — soft delete, solo si no tiene facturas activas

CashRegisterModule:

GET /cash-registers — lista de cajas
GET /cash-registers/active-session — sesión activa del usuario actual
POST /cash-registers/:id/open — abrir turno: body { openingBalance, notes? }, verifica que no haya sesión activa para esta caja
POST /cash-registers/:id/close — cerrar turno: body { closingBalance, notes? }, resumen de ventas del turno

InvoicesModule completo:

GET /invoices — lista con filtros ?status&customerId&cashRegisterId&from&to&page&limit usando setUTCHours
GET /invoices/pending — pre-facturas con status PENDING esperando cobro (para el cajero)
GET /invoices/:id — detalle completo con items, pagos y cliente
POST /invoices — crear pre-factura (SELLER) o factura directa (CASHIER/ADMIN):

Obtener tasa del día de ExchangeRate — si no existe retornar error
Guardar exchangeRate en la factura (inmutable desde este momento)
Calcular subtotalUsd, ivaUsd desglosado por tipo, totalUsd, totalBs
Generar número de factura: {prefix}-{cashRegisterCode}-{year2digits}-{correlativo8digits}
El correlativo se incrementa con SELECT FOR UPDATE en transacción Prisma
Si el SELLER crea → status PENDING, no descuenta stock aún
Si CASHIER/ADMIN crea directamente → status DRAFT listo para cobrar


PATCH /invoices/:id/pay — registrar cobro completo:

Body: { payments: [{ method, amountUsd, amountBs, reference? }], isCredit?, creditAuthPassword? }
Validar que suma de pagos >= totalUsd (tolerancia 0.01)
Si isCredit = true → verificar creditAuthPassword contra hash en CompanyConfig, verificar que cliente tiene cupo suficiente
Por cada método Cashea o Crediagro → crear registro en tabla Receivable (CxC) vinculado a la plataforma
Si isCredit = true → crear registro en Receivable vinculado al cliente
Descontar stock por cada item usando warehouseId del almacén por defecto
Crear StockMovements tipo SALE
Marcar factura como PAID o CREDIT
Todo en transacción Prisma


PATCH /invoices/:id/cancel — cancelar factura, solo ADMIN o SUPERVISOR, solo si status PENDING o DRAFT
GET /invoices/:id/pdf — generar PDF de la factura

Agregar modelo Receivable al schema (CxC básico para Sesión 7, pero necesitamos la tabla ahora):
prismamodel Receivable {
  id            String           @id @default(cuid())
  type          ReceivableType
  customerId    String?
  customer      Customer?        @relation(...)
  platformName  String?          // "Cashea", "Crediagro", etc.
  invoiceId     String
  invoice       Invoice          @relation(...)
  amountUsd     Float
  amountBs      Float
  exchangeRate  Float
  dueDate       DateTime?
  status        ReceivableStatus @default(PENDING)
  paidAt        DateTime?
  notes         String?
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt
}

enum ReceivableType { CUSTOMER_CREDIT FINANCING_PLATFORM }
enum ReceivableStatus { PENDING PARTIAL PAID OVERDUE }
PARTE 2 — Frontend (Next.js)
Sección VENTAS en sidebar: POS, Pre-facturas, Facturas, Clientes
Página /sales/pos — POS principal:

Layout dos paneles: izquierdo catálogo, derecho carrito (igual concepto que RestaurantOS pero adaptado)
Panel izquierdo:

Búsqueda full-text de productos (llama a GET /products/search?q=)
Botón de escáner de código de barras (@zxing/browser — usa cámara del dispositivo)
Resultados muestran: código, nombre, precio detal USD, precio detal Bs, stock disponible
Click en producto → agrega al carrito


Panel derecho — carrito:

Selector de cliente (buscar o crear rápido)
Lista de items: nombre, cantidad (editable), precio unitario USD, total USD
Solo ADMIN puede modificar el precio unitario
Subtotal, desglose de IVA por tipo, Total USD, Total Bs (calculado con tasa del día)
Botón "Guardar pre-factura" — guarda como PENDING para el cajero
Botón "Cobrar $XX" — abre modal de cobro (solo CASHIER/ADMIN)



Modal de cobro:

Muestra total USD y total Bs
Tasa del día (solo lectura)
Métodos de pago: Efectivo USD, Efectivo Bs, Punto de Venta, Pago Móvil, Zelle, Transferencia, Cashea, Crediagro
Puede mezclar múltiples métodos
Métodos en Bs: campo Bs principal, USD calculado automáticamente
Métodos en USD: campo USD principal, Bs calculado automáticamente
Pendiente por cobrar en tiempo real
Toggle "Factura a crédito" → campo de clave de autorización + días de crédito
Botón "Confirmar cobro"

Página /sales/pending — Pre-facturas pendientes:

Lista de pre-facturas esperando cobro
Cada card: número, cliente, vendedor, items resumidos, total, hace cuánto
Botón "Cobrar" → abre el POS con la pre-factura cargada

Página /sales/invoices — Historial de facturas:

Tabla con filtros: estado, cliente, caja, rango de fechas
Acciones: Ver detalle, Imprimir PDF, Cancelar (solo ADMIN/SUPERVISOR)

Página /sales/customers — Clientes:

Tabla con búsqueda, tipo, crédito disponible
Modal crear/editar con todos los campos
Vista detalle con historial de facturas y estado de cuenta básico

PARTE 3 — PDF de factura
Usando @react-pdf/renderer, crear template de factura que incluya:

Header: logo (si existe), nombre empresa, RIF, dirección, teléfono
Número de factura, número de control, fecha, tasa del día
Datos del cliente: nombre, RIF
Tabla de items: código, descripción, cantidad, precio unit USD, % IVA, total USD
Subtotal, desglose IVA por tipo (Exento, Reducido, General, Especial), Total USD, Total Bs
Métodos de pago utilizados
Footer con datos de la empresa

Al terminar:

Verifica el flujo completo SELLER → CASHIER: crear pre-factura como seller → cobrarla como cajero → verificar que stock bajó → verificar que se generó el PDF
Verifica flujo de crédito: factura a crédito → verificar que se creó el Receivable
Verifica flujo Cashea: pago con Cashea → verificar Receivable a la plataforma
Haz commit con el mensaje feat: Session 5 - sales POS, invoices, customers and PDF generation
Haz push a GitHub
Actualiza el PROGRESS.md y el PROJECT.md