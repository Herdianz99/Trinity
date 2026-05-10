Guarda esto en tu session-prompt.md y dáselo a Claude Code:


Lee el PROJECT.md y el PROGRESS.md antes de escribir cualquier línea de código.
Vamos a implementar la Sesión 3 de Trinity ERP: Inventario y Almacenes.
Antes de escribir cualquier código consulta las skills disponibles en /mnt/skills/public/ especialmente frontend-design.
Implementar exactamente lo descrito en la Sesión 3 del PROJECT.md:
Backend (NestJS):
WarehousesModule:

CRUD completo de almacenes
Solo puede haber un almacén con isDefault = true — al marcar uno como default desmarcar el anterior

StockModule:

GET /stock con filtros ?warehouseId&productId&lowStock — retorna stock con info del producto y almacén
GET /stock/global — stock total por producto sumando todos los almacenes
GET /stock/low — productos donde stock total <= minStock
GET /stock/valuation — inventario valorado: stock × costUsd × exchangeRate
POST /stock/adjust — ajuste manual de stock:

Type ADJUSTMENT_IN o ADJUSTMENT_OUT requiere motivo obligatorio
ADJUSTMENT_OUT requiere aprobación de SUPERVISOR o ADMIN
Crea StockMovement automáticamente
Todo en transacción Prisma



TransfersModule:

POST /transfers — crear solicitud de transferencia (WAREHOUSE o ADMIN):

Body: { fromWarehouseId, toWarehouseId, items: [{ productId, quantity }], notes }
Verifica que hay stock suficiente en origen
Estado inicial: PENDING


GET /transfers — lista con filtros ?status&warehouseId
PATCH /transfers/:id/approve — solo SUPERVISOR o ADMIN:

Mueve el stock: descuenta de origen, suma en destino
Crea StockMovements TRANSFER_OUT y TRANSFER_IN
Todo en transacción Prisma


PATCH /transfers/:id/cancel — solo si está PENDING

Agregar modelo Transfer al schema:
prismamodel Transfer {
  id               String         @id @default(cuid())
  fromWarehouseId  String
  fromWarehouse    Warehouse      @relation("TransferFrom", ...)
  toWarehouseId    String
  toWarehouse      Warehouse      @relation("TransferTo", ...)
  status           TransferStatus @default(PENDING)
  notes            String?
  items            TransferItem[]
  createdById      String
  approvedById     String?
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt
}

model TransferItem {
  id         String   @id @default(cuid())
  transferId String
  transfer   Transfer @relation(...)
  productId  String
  product    Product  @relation(...)
  quantity   Float
}

enum TransferStatus { PENDING APPROVED CANCELLED }
InventoryCountModule:

POST /inventory-counts — crear sesión de conteo por almacén
GET /inventory-counts — lista de sesiones
GET /inventory-counts/:id — detalle con todos los items y diferencias calculadas
PATCH /inventory-counts/:id/items — ingresar cantidades contadas
PATCH /inventory-counts/:id/approve — solo SUPERVISOR o ADMIN:

Por cada item con diferencia → crea StockMovement tipo COUNT_ADJUST
Actualiza stock al valor contado
Todo en transacción Prisma



Agregar modelo InventoryCount al schema:
prismamodel InventoryCount {
  id          String             @id @default(cuid())
  warehouseId String
  warehouse   Warehouse          @relation(...)
  status      CountStatus        @default(DRAFT)
  notes       String?
  items       InventoryCountItem[]
  createdById String
  approvedById String?
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt
}

model InventoryCountItem {
  id               String         @id @default(cuid())
  inventoryCountId String
  inventoryCount   InventoryCount @relation(...)
  productId        String
  product          Product        @relation(...)
  systemQuantity   Float          // cantidad según sistema al crear el conteo
  countedQuantity  Float?         // cantidad física ingresada
  difference       Float?         // countedQuantity - systemQuantity
}

enum CountStatus { DRAFT IN_PROGRESS APPROVED CANCELLED }
StockMovementsModule:

GET /stock-movements con filtros ?productId&warehouseId&type&from&to&page&limit — usar setUTCHours para rangos de fecha

Frontend (Next.js):
Sección INVENTARIO en sidebar: Stock, Almacenes, Ajustes, Transferencias, Conteo Físico, Movimientos
Página /inventory/stock:

Selector de almacén (tabs o dropdown) + opción "Todos los almacenes"
Tabla: Código, Producto, Categoría, Stock en almacén seleccionado, Stock global, Stock mínimo, Costo USD, Valor USD, Estado (Normal/Bajo/Sin stock)
Filas con stock bajo → fondo amarillo, stock 0 → fondo rojo
Banner superior si hay productos bajo mínimo: "⚠️ X productos con stock bajo"
Botón "Ajustar stock" por fila
Botón "Ver movimientos" por fila → navega a /inventory/movements?productId=XXX
Reporte valorizado al final: tabla resumen + total valor USD + total valor Bs

Página /inventory/warehouses:

Tabla de almacenes con nombre, ubicación, stock total (conteo de productos), estado
Modal crear/editar almacén
Toggle isDefault con confirmación

Modal "Ajustar stock":

Muestra stock actual en el almacén
Selector almacén
Tipo: Entrada / Salida
Cantidad y motivo (obligatorio)
Si es Salida → badge amarillo "Requiere aprobación de Supervisor"
Preview: stock resultante

Página /inventory/transfers:

Tabla de transferencias con estados, almacenes origen/destino, fecha
Badge de estado: amarillo PENDING, verde APPROVED, rojo CANCELLED
Modal crear transferencia: selector origen, destino, lista de productos con cantidades
Botón aprobar/cancelar según rol

Página /inventory/count:

Lista de sesiones de conteo con estado y almacén
Botón "+ Nueva sesión de conteo"
Vista detalle de sesión: tabla con producto, stock sistema, campo para ingresar conteo físico, diferencia calculada en tiempo real (verde si igual, rojo si hay diferencia)
Botón "Aprobar conteo" solo visible para SUPERVISOR/ADMIN

Página /inventory/movements:

Tabla de movimientos con filtros: producto, almacén, tipo, rango de fechas (usar fecha local no UTC)
Selector de rango: Hoy / Esta semana / Este mes / Personalizado
Badge por tipo: verde PURCHASE, rojo SALE, amarillo ADJUSTMENT, azul TRANSFER

Al terminar:

Verifica el flujo completo: ajustar stock → ver movimiento generado → ver stock actualizado
Haz commit con el mensaje feat: Session 3 - inventory, warehouses, transfers and physical count
Haz push a GitHub
Actualiza el PROGRESS.md y el PROJECT.md