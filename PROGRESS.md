# Trinity ERP — Progreso

## Sesion 1 — Setup, Auth y Configuracion Base (Completada)
- Scaffold monorepo pnpm + Turborepo
- Docker Compose (PostgreSQL 15 + Redis 7)
- NestJS base con Swagger, ValidationPipe, CORS
- PrismaModule/Service global
- AuthModule: login, refresh, JWT strategy, get profile
- UsersModule: CRUD con roles
- CompanyConfigModule: GET y PATCH /config (singleton)
- Next.js 14 App Router con layout autenticado
- Sidebar colapsable con navegacion
- Pagina de login con cookies httpOnly
- Pagina de configuracion de empresa
- Prisma schema completo Fase 1
- Seed con datos iniciales (3 usuarios, 5 categorias, 3 marcas, 2 proveedores, 10 productos)

## Sesion 2 — Catalogo de Productos (Completada)
### Backend
- **CategoriesModule**: CRUD completo con soporte arbol 2 niveles (padre + subcategorias)
- **BrandsModule**: CRUD simple con conteo de productos
- **SuppliersModule**: CRUD completo con RIF, telefono, email, direccion, contacto, isRetentionAgent
- **ProductsModule**:
  - CRUD completo con todos los campos del schema
  - Trigger PostgreSQL para searchVector (tsvector) al crear/actualizar producto
  - `GET /products` con filtros: categoryId, brandId, supplierId, search (full-text), lowStock, isActive, page, limit
  - `GET /products/search?q=` — busqueda rapida para POS, top 20 con id, code, name, priceDetal, priceMayor, stock total
  - `POST /products/import` — importacion masiva desde JSON
  - Recalculo automatico de priceDetal y priceMayor usando formula de precios

### Frontend
- Seccion CATALOGO en sidebar con items: Productos, Categorias, Marcas, Proveedores
- Pagina `/catalog/products`: tabla con columnas (Codigo, Nombre, Categoria, Marca, Proveedor, Precio USD, Precio Bs, Stock, Estado), filtros, busqueda, paginacion
- Modal crear/editar producto con todos los campos y vista previa de precio en tiempo real
- Pagina `/catalog/categories`: arbol visual con categorias y subcategorias, CRUD inline
- Pagina `/catalog/brands`: tabla simple con CRUD inline
- Pagina `/catalog/suppliers`: tabla con todos los campos, modal crear/editar

### Migraciones
- `20260510000000_add_product_search_vector`: columna tsvector, indice GIN, trigger para busqueda full-text

### Verificaciones
- Busqueda full-text funciona por nombre ("martillo" -> PROD-001) y por codigo ("PROD-003" -> Taladro DeWalt)
- Formula de precios verificada: Martillo costUsd=12, ganancia=35%, IVA=16% -> priceDetal=$18.79
- 15 productos de prueba con diferentes categorias, marcas e IVA types (GENERAL, EXEMPT, REDUCED, SPECIAL)

## Sesion 3 — Inventario y Almacenes (Completada)
### Backend
- **WarehousesModule**: CRUD completo con toggle isDefault (transaccion para unset previo), ADMIN-only para escritura
- **StockModule**:
  - `GET /stock?warehouseId` — stock por almacen con info de producto y almacen
  - `GET /stock/global` — stock agregado por producto con totalStock y minStock
  - `GET /stock/low` — productos bajo stock minimo
  - `POST /stock/adjust` — ajuste manual en transaccion Prisma (SUPERVISOR/ADMIN para salidas)
- **TransfersModule**:
  - `POST /transfers` — crear solicitud con items
  - `GET /transfers` — listar con filtro por status
  - `PATCH /transfers/:id/approve` — aprobar y mover stock en transaccion (ADMIN/SUPERVISOR)
  - `PATCH /transfers/:id/cancel` — cancelar transferencia pendiente
- **InventoryCountsModule**:
  - `POST /inventory-counts` — crear sesion de conteo (carga productos del almacen)
  - `GET /inventory-counts` — listar sesiones con conteo de items
  - `GET /inventory-counts/:id` — detalle con items, cantidades sistema y contadas
  - `PATCH /inventory-counts/:id/items` — registrar cantidades contadas (cambia a IN_PROGRESS)
  - `PATCH /inventory-counts/:id/approve` — aprobar y ajustar stock automaticamente (ADMIN/SUPERVISOR)
- **StockMovementsModule**: `GET /stock-movements` con filtros (productId, warehouseId, type, from, to) y paginacion

### Frontend
- Seccion INVENTARIO en sidebar con 5 items: Stock, Almacenes, Transferencias, Conteo Fisico, Movimientos
- Pagina `/inventory/stock`: vista de stock por almacen con tabs, tabla con producto/cantidad/min/estado, resumen valorizado, modal de ajuste rapido
- Pagina `/inventory/warehouses`: tabla con nombre/ubicacion/por defecto/estado, CRUD con modal, toggle default
- Pagina `/inventory/transfers`: lista con filtros por estado, modal crear con selector origen/destino y productos multiples, acciones aprobar/cancelar
- Pagina `/inventory/count`: sesiones de conteo fisico, modal crear, detalle con tabla de conteo inline, aprobar con ajuste automatico
- Pagina `/inventory/movements`: historial con filtros por fecha (hoy/semana/mes/custom), almacen, tipo, producto; paginacion; badges por tipo

### Schema (Prisma)
- Enums: `TransferStatus` (PENDING, APPROVED, CANCELLED), `CountStatus` (DRAFT, IN_PROGRESS, APPROVED, CANCELLED)
- Modelos: `Transfer`, `TransferItem`, `InventoryCount`, `InventoryCountItem`
- Migracion: `20260509235441_add_transfers_and_inventory_counts`

### Verificaciones
- Login y autenticacion JWT funcionan correctamente
- `GET /warehouses` retorna almacen principal con stockCount
- `GET /stock?warehouseId=default-warehouse` retorna 15 productos con cantidades
- `GET /stock/global` retorna stock agregado por producto
- `POST /stock/adjust` ADJUSTMENT_IN +5 unidades → stock actualizado de 80 a 85
- `GET /stock-movements` muestra el movimiento generado con tipo, cantidad y razon
- Flujo completo verificado: ajustar stock → movimiento creado → stock actualizado

## Sesion 4 — Compras (Completada)
### Backend
- **PurchaseOrdersModule**:
  - `POST /purchase-orders` — crear orden con numeracion automatica PO-0001 correlativa
  - `GET /purchase-orders` — lista con filtros: supplierId, status, from, to, page, limit (usa setUTCHours para rangos de fecha)
  - `GET /purchase-orders/:id` — detalle con items, proveedor y producto info
  - `PATCH /purchase-orders/:id` — editar solo si status es DRAFT (elimina y recrea items)
  - `PATCH /purchase-orders/:id/status` — cambiar a SENT o CANCELLED (valida transiciones)
  - `PATCH /purchase-orders/:id/receive` — recibir orden en transaccion Prisma:
    - Actualiza receivedQty en PurchaseOrderItem
    - Actualiza stock (upsert) en almacen seleccionado
    - Actualiza costUsd del producto con el nuevo costo
    - Recalcula priceDetal y priceMayor usando formula (costo × brecha × ganancia × IVA)
    - Crea StockMovement tipo PURCHASE con referencia al numero de orden
    - Si todos items recibidos completamente → RECEIVED, sino → PARTIAL
  - `GET /purchase-orders/reorder-suggestions` — productos donde stock total <= minStock, ordenados por criticidad

### Frontend
- Seccion COMPRAS en sidebar con 2 items: Ordenes de Compra, Sugerencias de Reorden
- Pagina `/purchases`:
  - Tabla con columnas: Numero, Proveedor, Items, Total USD, Estado, Fecha, Acciones
  - Filtros por proveedor y estado
  - Badge de estado: gris DRAFT, azul SENT, amarillo PARTIAL, verde RECEIVED, rojo CANCELLED
  - Acciones: Ver detalle, Editar (solo DRAFT), Enviar (solo DRAFT), Recibir (SENT/PARTIAL), Cancelar (DRAFT/SENT)
  - Modal crear/editar con busqueda de producto full-text, selector proveedor, items con cantidad y costo
  - Modal recibir: selector almacen, tabla con cantidades a recibir y costos editables, badge "Precio actualizado" si cambia
  - Modal detalle: tabla completa con recibido vs pedido
- Pagina `/purchases/reorder`:
  - Tabla: Producto, Categoria, Proveedor, Stock actual, Minimo, Diferencia, Costo USD
  - Filas con fondo rojo si stock = 0
  - Boton "Crear orden" por fila que crea orden pre-llenada

### Verificaciones
- Flujo completo verificado: crear PO-0001 → marcar enviada → recibir 10 unidades con costo $15 (antes $5)
- Stock actualizado: 92 → 102 (+10 unidades)
- Costo producto actualizado: $5 → $15
- Precio recalculado: priceDetal $8.12 → $24.36, priceMayor $7.25 → $21.75
- StockMovement tipo PURCHASE creado con referencia PO-0001
- Status transiciono correctamente: DRAFT → SENT → RECEIVED

## Sesion 4b — Tasa de Cambio (Completada)
### Migracion
- Modelo `ExchangeRate` con campos: rate, date (unique, tipo DATE), source (BCV/MANUAL), createdById
- Enum `ExchangeRateSource` (BCV, MANUAL)
- Eliminados campos `exchangeRate` y `exchangeRateUpdatedAt` de CompanyConfig

### Backend
- **ExchangeRateModule**:
  - `GET /exchange-rate/today` — retorna tasa del dia actual (UTC) o null
  - `GET /exchange-rate` — historial de tasas (ultimas 60 entradas), filtrable por from/to
  - `GET /exchange-rate/by-date?date=` — obtener tasa de fecha especifica
  - `GET /exchange-rate/fetch-bcv` — intento de scraping de bcv.org.ve
  - `POST /exchange-rate` — registrar/actualizar tasa del dia (solo ADMIN), con source BCV o MANUAL
  - Usa upsert por date para evitar duplicados

### Frontend
- Banner amarillo prominente en layout cuando no hay tasa para hoy: "No hay tasa BCV registrada para hoy. Sin tasa no se puede facturar." con boton "Registrar tasa"
- Modal de registro rapido con campo de monto y boton "Obtener del BCV"
- Pagina `/config` actualizada: seccion "Tasa de Cambio" con tasa de hoy, formulario de registro, e historial reciente
- Paginas de productos y stock actualizadas para obtener tasa desde `/exchange-rate/today` en vez de CompanyConfig
- Eliminado campo exchangeRate del DTO de CompanyConfig

### Verificaciones
- `GET /exchange-rate/today` retorna null cuando no hay tasa
- `POST /exchange-rate` con rate=36.50 → registra correctamente con fecha UTC del dia
- `GET /exchange-rate/today` retorna la tasa registrada
- `GET /exchange-rate/by-date?date=2026-05-10` retorna la tasa correcta
- `GET /exchange-rate/fetch-bcv` endpoint funciona (retorna null si BCV no disponible)
- Historial muestra todas las tasas registradas ordenadas desc

## Sesion 5 — Ventas y POS (Completada)
### Schema Prisma
- Enums: `CustomerType`, `SessionStatus`, `InvoiceStatus`, `InvoiceType`, `PaymentMethod`, `ReceivableType`, `ReceivableStatus`
- Modelos: `Customer`, `CashRegister`, `CashSession`, `Invoice`, `InvoiceItem`, `Payment`, `Receivable`
- Migracion: `20260510020000_add_receivable`

### Backend
- **CustomersModule**:
  - `GET /customers` — lista con filtros: search, isActive, page, limit
  - `GET /customers/:id` — detalle con ultimas 10 facturas, receivables pendientes, deuda y credito disponible calculados
  - `POST /customers` — crear con name, rif, phone, email, address, type, creditLimit, creditDays
  - `PATCH /customers/:id` — editar cualquier campo
  - `DELETE /customers/:id` — soft delete (solo si no tiene facturas activas)

- **CashRegistersModule**:
  - `GET /cash-registers` — lista de cajas con sesion activa
  - `GET /cash-registers/active-session` — sesion activa del usuario actual
  - `POST /cash-registers/:id/open` — abrir turno con openingBalance, valida que no haya sesion activa
  - `POST /cash-registers/:id/close` — cerrar turno con resumen de ventas del turno desglosado por metodo de pago

- **InvoicesModule**:
  - `GET /invoices` — lista con filtros: status, customerId, cashRegisterId, from, to, page, limit (usa setUTCHours)
  - `GET /invoices/pending` — pre-facturas con status PENDING
  - `GET /invoices/:id` — detalle completo con items, pagos, cliente y receivables
  - `POST /invoices` — crear factura:
    - Obtiene tasa del dia de ExchangeRate (error 400 si no existe)
    - Calcula subtotalUsd, IVA desglosado por tipo, totalUsd, totalBs
    - Genera numero con SELECT FOR UPDATE: FAC-{code}-{year}-{correlativo8}
    - SELLER crea → status PENDING; CASHIER/ADMIN → status DRAFT
  - `PATCH /invoices/:id/pay` — cobro completo en transaccion:
    - Valida suma de pagos >= totalUsd (tolerancia 0.01)
    - Si isCredit → valida creditAuthPassword contra hash bcrypt, verifica cupo
    - Cashea/Crediagro → crea Receivable tipo FINANCING_PLATFORM
    - isCredit → crea Receivable tipo CUSTOMER_CREDIT con dueDate
    - Descuenta stock por cada item del almacen por defecto
    - Crea StockMovements tipo SALE
    - Status final: PAID o CREDIT
  - `PATCH /invoices/:id/cancel` — solo ADMIN/SUPERVISOR, solo PENDING/DRAFT
  - `GET /invoices/:id/pdf` — genera PDF con pdfkit

- **InvoicePdfService**: genera PDF A4 con:
  - Header: nombre empresa, RIF, direccion, telefono
  - Numero de factura, numero de control, fecha, tasa del dia
  - Datos del cliente
  - Tabla de items: producto, cantidad, precio unitario, tipo IVA, total
  - Desglose IVA por tipo, subtotal, total USD, total Bs
  - Metodos de pago utilizados
  - Footer con datos empresa

### Frontend
- Seccion VENTAS en sidebar con 4 items: POS, Pre-facturas, Facturas, Clientes

- Pagina `/sales/pos` — POS principal:
  - Layout dos paneles: izquierdo catalogo/busqueda, derecho carrito
  - Busqueda full-text de productos con debounce 300ms
  - Boton escaner codigo de barras con BarcodeDetector API
  - Resultados: codigo, nombre, precio USD/Bs, stock
  - Click agrega al carrito con cantidades editables
  - Selector de cliente con busqueda
  - Solo ADMIN puede modificar precio unitario
  - Desglose IVA por tipo en tiempo real
  - Boton "Guardar pre-factura" (SELLER) o "Cobrar" (CASHIER/ADMIN)
  - Carga pre-factura existente via query param ?invoiceId=

- Modal de cobro:
  - Total USD y Bs con tasa del dia
  - 8 metodos de pago: Efectivo USD/Bs, Punto de Venta, Pago Movil, Zelle, Transferencia, Cashea, Crediagro
  - Mezcla multiples metodos
  - Conversion automatica USD<->Bs segun metodo
  - Pendiente por cobrar en tiempo real
  - Toggle "Factura a credito" con clave de autorizacion y dias de credito

- Pagina `/sales/pending` — Pre-facturas pendientes:
  - Cards con numero, cliente, items resumidos, total, tiempo transcurrido
  - Boton "Cobrar" redirige al POS con la pre-factura cargada
  - Auto-refresh cada 30 segundos

- Pagina `/sales/invoices` — Historial de facturas:
  - Tabla con filtros: estado, rango de fechas
  - Acciones: ver detalle, imprimir PDF, cancelar
  - Modal detalle con items, totales y pagos

- Pagina `/sales/customers` — Clientes:
  - Tabla con busqueda, tipo, credito
  - Modal crear/editar con todos los campos
  - Vista detalle: datos, limite credito, deuda pendiente, credito disponible, ultimas facturas

## Sesion 5b — Importacion masiva, codigos de categoria y areas de impresion (Completada)
### Migracion Prisma
- Modelo `PrintArea`: id, name, description, isActive, categories[], printJobs[]
- Modelo `PrintJob`: id, invoiceId, printAreaId, status (PENDING/PRINTED/FAILED), items (Json)
- Modelo `PriceAdjustmentLog`: id, filters (Json), adjustmentType, gananciaPct, gananciaMayorPct, productsAffected, createdById
- Enum `PrintStatus`: PENDING, PRINTED, FAILED
- Category actualizada: `code String? @unique`, `lastProductNumber Int @default(0)`, `printAreaId String?`, `printArea PrintArea?`
- Invoice actualizada: `printJobs PrintJob[]`

### Migracion de datos
- Asignacion de codigos 3 letras a categorias raiz: HER (Herramientas), PIN (Pinturas), ELE (Electricidad), PLO (Plomeria), FER (Ferreteria General)
- Reasignacion de codigos de productos de PROD-XXX a nuevo formato: HER00001, PIN00001, ELE00001, etc.
- Actualizacion de lastProductNumber por categoria
- Limpieza de categorias duplicadas del seed multiple
- Regeneracion de searchVector para todos los productos

### Backend
- **PrintAreasModule**: CRUD completo (GET/POST/PATCH/DELETE /print-areas) con conteo de categorias, validacion de borrado
- **ImportModule**:
  - `POST /import/validate` — validacion sin insertar, retorna preview de creados/saltados/errores
  - `POST /import` — importacion real en transaccion con timeout 60s
  - Orden de importacion: categorias -> marcas -> proveedores -> productos
  - Soporta creacion de categorias con subcategorias, marcas y proveedores si no existen
  - DTO con ImportCategoryDto, ImportBrandDto, ImportSupplierDto, ImportProductDto
- **PrintJobsModule**:
  - `GET /print-jobs/pending?printAreaId=` — trabajos pendientes por area
  - `PATCH /print-jobs/:id/printed` — marcar como impreso
- **CategoriesService** actualizado:
  - Validacion de codigo: 3 letras, uppercase, unico
  - Soporte printAreaId en create/update
  - Subcategorias no requieren codigo
- **ProductsService** actualizado:
  - `generateCodeFromCategory()` con UPDATE...RETURNING atomico para incremento seguro del correlativo
  - Si no se proporciona code, se genera automaticamente desde la categoria
  - Si se proporciona code, se valida unicidad
  - Include de printArea en relacion category en todas las queries
- **InvoicesService.pay()** actualizado:
  - Al cobrar, agrupa items por area de impresion de su categoria
  - Crea PrintJob por cada area con items JSON: [{code, supplierRef, name, quantity}]

### Frontend
- Pagina `/catalog/categories` actualizada:
  - Campo codigo (3 letras, uppercase) para categorias raiz
  - Selector de area de impresion
  - Display formato "HER — Herramientas" con badge area de impresion
- Pagina `/settings/print-areas` (nueva):
  - CRUD de areas de impresion con tabla, modal crear/editar, toggle activo, eliminar
- Pagina `/import` (nueva):
  - Zona drag&drop para archivos JSON
  - Textarea para pegar JSON manualmente
  - Boton Validar (preview) y boton Importar
  - Reporte de resultados: creados, saltados, errores
- Componente `PrintMonitor` (nuevo):
  - Polling /print-jobs/pending cada 5 segundos
  - Usa localStorage 'printAreaId' para filtrar por area
  - Abre window.print() con formato ticket 80mm (codigo, ref proveedor, nombre, cantidad)
  - Marca automaticamente como PRINTED despues de imprimir
- Pagina `/catalog/products` actualizada:
  - Columna "Area de impresion" (readonly, desde category.printArea.name)
  - Placeholder de codigo: "Auto (segun categoria)"
- Sidebar: 2 nuevos items — "Areas de Impresion" y "Importacion Masiva"
- Layout: PrintMonitor agregado como componente global
- Pagina `/config` actualizada: seccion "Area de Impresion de esta PC" con dropdown guardado en localStorage

### Verificaciones
- Codigo de producto HER00007 generado correctamente al crear producto en categoria "Herramientas"
- Importacion JSON valida y ejecuta correctamente (validate retorna preview, import crea productos)
- Endpoint /print-jobs/pending funcional
- Print areas CRUD funcional
- API compila sin errores
