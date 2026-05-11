# Trinity ERP — Progreso

## Sesion 15 — UX Correctiva: Paginas dedicadas con tabs (Completada)

### Concepto
Conversion de CRUD basado en modales a paginas dedicadas con URLs navegables y componente Tabs (Radix UI). Los modales solo se usan para confirmaciones rapidas. Cada entidad tiene pagina de listado, detalle con tabs, y formulario de creacion.

### Componente Tabs
- `apps/web/src/components/ui/tabs.tsx` — componente shadcn/ui con estilos dark theme
- Basado en `@radix-ui/react-tabs`

### Backend (NestJS)
- `GET /products/by-code/:code` — buscar producto por codigo (para URL `/catalog/products/[code]`)
- `GET /products/:id/purchases` — historial de compras de un producto (PurchaseOrderItems con PO y proveedor)

### Modulo 1: Productos
- `/catalog/products` — listado sin modales, nombres son Links al detalle
- `/catalog/products/new` — formulario de creacion, redirige al detalle al crear
- `/catalog/products/[code]` — detalle con 5 tabs:
  - Info General (formulario editable), Existencias (stock por almacen), Movimientos (paginado con badges por tipo), Historial de compras, Precios (formula paso a paso)

### Modulo 2: Ordenes de Compra
- `/purchases` — listado sin modales, numeros de orden son Links
- `/purchases/new` — formulario con busqueda de productos, proveedor, items
- `/purchases/[id]` — detalle con 3 tabs + modal de recepcion:
  - Info General (resumen + items), Recepciones (movimientos filtrados), CxP (si es credito)
- `/purchases/[id]/edit` — edicion de orden en borrador/enviada

### Modulo 3: Clientes
- `/sales/customers` — listado con busqueda y paginacion, sin modales
- `/sales/customers/new` — formulario de creacion
- `/sales/customers/[id]` — detalle con 3 tabs:
  - Info General (formulario editable), Ventas (facturas paginadas), CxC (resumen de deuda + cobro inline)

### Modulo 4: Proveedores
- `/catalog/suppliers` — listado sin modales
- `/catalog/suppliers/new` — formulario de creacion
- `/catalog/suppliers/[id]` — detalle con 3 tabs:
  - Info General (formulario editable), Compras (ordenes paginadas), CxP (resumen + tabla de pagares)

## Sesion 14 — IGTF y Estandarizacion de Montos en Bs (Completada)

### Migracion de Base de Datos
- Campos IGTF en CompanyConfig: `isIGTFContributor`, `igtfPct`
- Campos IGTF en Invoice: `igtfUsd`, `igtfBs`, `subtotalBs`, `ivaBs`
- Campos Bs en InvoiceItem: `unitPriceBs`, `ivaAmountBs`, `totalBs`
- Campos IGTF en Payment: `igtfUsd`, `igtfBs`
- Migracion: `add_igtf_and_bs_amounts`

### Backend (NestJS)
- DTO de CompanyConfig actualizado con campos IGTF (`isIGTFContributor`, `igtfPct`)
- Servicio de facturas guarda montos en Bs al crear y actualizar (InvoiceItem y Invoice)
- Calculo automatico de IGTF al procesar pago:
  - Solo aplica si `isIGTFContributor = true`
  - Solo en metodos de pago en divisas: `CASH_USD`, `ZELLE`
  - Se calcula una sola vez por factura
  - IGTF se registra por payment y en el total de la factura
- PDF de factura muestra linea de IGTF entre IVA y Total
- Libro de ventas fiscal incluye columna IGTF

### Frontend (Next.js)
- Pagina de configuracion: toggle "Contribuyente IGTF" con porcentaje configurable
- Modal de cobro POS:
  - Calculo en tiempo real del IGTF segun metodos de pago seleccionados
  - Resumen de factura con Subtotal, IVA, IGTF y Total en USD y Bs
  - Total y pendiente se actualizan automaticamente con IGTF
- Detalle de factura: muestra IGTF si aplica
- Libro de ventas: columna IGTF en tabla y exportacion PDF

### Mejora adicional
- Escaner de camara del POS: mensajes de error mejorados (detecta contexto inseguro HTTP, permisos denegados, camara no encontrada)

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

## Sesion 5c — Ajuste masivo de precios (Completada)
### Backend
- **ProductsModule** — 3 nuevos endpoints:
  - `GET /products/price-adjustment` — lista productos con filtros combinables (categoryId, subcategoryId, brandId, supplierId, costMin, costMax), maximo 500 resultados, incluye category/brand/supplier
  - `POST /products/price-adjustment` — aplica ajuste masivo en transaccion Prisma:
    - adjustmentType: REPLACE (reemplaza ganancia) o ADD (suma/resta al existente)
    - Recalcula priceDetal y priceMayor con formula completa (costo × brega × ganancia × IVA)
    - Crea PriceAdjustmentLog con filtros, tipo, valores y productos afectados
    - Solo ADMIN (RolesGuard)
    - Timeout transaccion 60s
  - `GET /products/price-adjustment/history` — historial de ajustes con nombre de usuario enriquecido, ultimos 50 ordenados por fecha DESC
- DTOs: `PriceAdjustmentQueryDto` (con Transform para parseo de query params), `ApplyPriceAdjustmentDto` (con ValidateNested para filtros)

### Frontend
- Pagina `/catalog/price-adjustment` — layout 3 paneles:
  - Panel izquierdo — Filtros: selectores categoria (con subcategoria dinamica), marca, proveedor, rango costo USD, boton "Ver productos afectados"
  - Panel central — Preview: tabla con codigo, nombre, categoria, marca, costo, ganancia%, precios; muestra nuevos valores en tiempo real (flechas con color verde/rojo); contador "X productos seran afectados"
  - Panel derecho — Configuracion: toggle REPLACE/ADD, inputs ganancia detal% y mayor% con preview del primer producto, boton "Aplicar cambio"
  - Modal de confirmacion: resumen de productos afectados, tipo de ajuste, valores, advertencia "no se puede deshacer", botones cancelar/confirmar
  - Banner de exito con link a historial
  - Seccion historial al final: tabla con fecha, filtros (texto legible), tipo (badge color), ganancia%, productos afectados, usuario
- Sidebar actualizado: "Ajuste de precios" con icono SlidersHorizontal bajo seccion CATALOGO

### Verificaciones
- GET /products/price-adjustment?categoryId=HER retorna 7 productos con todos los campos requeridos
- POST /products/price-adjustment REPLACE gananciaPct=45 → 7 productos actualizados, precios recalculados correctamente
- Verificacion post-ajuste: gananciaPct cambio de 40% a 45%, priceDetal de Martillo cambio de $19.49 a $20.18
- GET /products/price-adjustment/history retorna logs con createdByName "Administrador"
- TypeScript compila sin errores en ambos apps (api y web)
- API levanta correctamente con todos los endpoints mapeados

## Sesion 6d — Estados de factura en español y eliminacion de pendientes (Completada)
### Backend
- **InvoicesService**:
  - `cancel()` restringido a PENDING/DRAFT solamente — PAID/CREDIT retorna 400 "Las facturas pagadas no pueden cancelarse. Emite una nota de credito."
  - TODO comment: facturas PAID se cancelaran via Notas de Credito en futuras sesiones
  - `delete()` nuevo metodo: hard-delete de facturas PENDING/DRAFT (elimina items, payments e invoice en transaccion)
- **InvoicesController**: nuevo endpoint `DELETE /invoices/:id`

### Frontend
- Pagina `/sales/invoices`:
  - STATUS_LABELS en español: DRAFT/PENDING="En Espera", PAID="Procesado", CREDIT="Credito", CANCELLED="Cancelado"
  - STATUS_COLORS: En Espera (amarillo), Procesado (verde), Credito (azul), Cancelado (rojo)
  - Boton eliminar (Trash2) para facturas PENDING/DRAFT
  - Eliminado boton cancelar de facturas PAID/CREDIT
- Pagina `/sales/customers`: estados en español con colores actualizados (CREDIT ahora azul)

## Sesion 7 — Modulo de Cotizaciones (Completada)
### Migracion Prisma
- Enum `QuotationStatus`: DRAFT, SENT, APPROVED, REJECTED, EXPIRED
- Modelo `Quotation`: id, number (unique), customerId?, status, subtotalUsd, ivaUsd, totalUsd, notes, expiresAt, convertedToInvoiceId?, items[], createdById, timestamps
- Modelo `QuotationItem`: id, quotationId, productId, productName, productCode, quantity, unitPriceUsd, ivaType, ivaAmount, totalUsd (onDelete: Cascade)
- CompanyConfig: campo `quotationValidityDays Int @default(30)`
- Customer: relacion `quotations Quotation[]`
- Migracion: `20260510180000_add_quotations_module`

### Backend
- **QuotationsModule** con controller, service, PDF service y cron service
- **QuotationsService**:
  - `findAll()` — paginado con filtros: status, customerId, from, to, search
  - `findOne()` — detalle con items, customer, createdBy
  - `create()` — numeracion automatica COT-XXXX (correlativo global), calcula IVA extraido de priceDetal, fecha expiracion segun quotationValidityDays
  - `update()` — solo DRAFT, actualiza items y totales
  - `changeStatus()` — transiciones validas: DRAFT→SENT, SENT→APPROVED/REJECTED, cualquiera→EXPIRED
  - `convertToInvoice()` — obtiene tasa del dia, crea factura con SELECT FOR UPDATE para numero, copia items, marca quotation con convertedToInvoiceId
  - `expireOldQuotations()` — marca expiradas las que pasaron expiresAt
  - `cancelOldPendingInvoices()` — cancela facturas PENDING de dias anteriores
- **QuotationPdfService**: PDF con pdfkit — header empresa, datos cotizacion/cliente, tabla items con codigos, desglose IVA, totales USD, nota sobre tasa BCV
- **QuotationsCronService**: cron diario a medianoche (@Cron EVERY_DAY_AT_MIDNIGHT) — expira cotizaciones y cancela facturas pendientes
- **QuotationsController**: GET /, GET /:id, POST /, PATCH /:id, PATCH /:id/status, POST /:id/convert, GET /:id/pdf
- AppModule: agregado ScheduleModule.forRoot() y QuotationsModule

### Frontend
- Pagina `/quotations`:
  - Tabla con filtros: status, rango de fechas
  - Badges de estado con colores: Borrador (gris), Enviada (azul), Aprobada (verde), Rechazada (rojo), Expirada (amarillo)
  - Modal detalle con items, totales, acciones por estado
  - Botones contextuales: Marcar Enviada (DRAFT), Aprobar/Rechazar (SENT), Convertir a Factura (APPROVED)
  - Boton imprimir PDF
  - Paginacion
- POS `/sales/pos`:
  - Boton "Guardar cotizacion" (icono FileCheck) visible para todos los roles
  - POST /quotations con items del carrito y cliente seleccionado
  - Dialogo post-guardado: "¿Limpiar carrito para nueva venta?"
- Sidebar: seccion COTIZACIONES con enlace a /quotations
- Config `/config`: campo "Validez de cotizaciones (dias)" en seccion parametros financieros

### Verificaciones
- Cotizacion creada: COT-0001 status=DRAFT total=$10.22
- Cambio de estado: DRAFT → SENT → APPROVED
- Conversion a factura: COT-0001 → FAC-02-26-00000007 status=DRAFT total=$10.22 totalBs=Bs5110.00
- PDF generado: 200 OK, content-type=application/pdf, size=2235 bytes
- TypeScript compila sin errores en ambos apps

## Sesion 6 — POS Improvements (Completada)
### Migracion Prisma
- Enum `PermissionKey` con valor `OVERRIDE_PRICE`
- Modelo `UserPermission`: id, userId, permissionKey, createdAt, @@unique([userId, permissionKey])
- Customer: eliminado enum `CustomerType`, campo `type` reemplazado por `documentType String @default("V")` (V, E, J, G, C, P)
- Migracion: `20260510140000_add_override_price_permission`

### Backend
- **AuthModule**:
  - `GET /auth/me` ahora retorna `permissions: string[]` del usuario
  - Fix: `@CurrentUser('id')` en vez de `@CurrentUser('sub')` (JWT strategy retorna `{id, email, role}`)
- **UsersModule**:
  - `PATCH /users/:id/permissions` — asignar permisos granulares (ADMIN-only)
  - `findAll()` y `findOne()` incluyen permissions en response
- **CustomersModule**:
  - DTO actualizado: `documentType` con `@IsIn(['V', 'E', 'J', 'G', 'C', 'P'])` reemplaza `type`
- **InvoicesModule**:
  - `GET /invoices/pending?today=true` — filtra por fecha UTC del dia actual
  - Response incluye `customer.documentType`, primeros 3 items, y `totalItems` count

### Frontend
- Pagina `/sales/pos` — mejoras completas:
  - **Modal cliente inline**: crear/editar cliente directamente desde POS con selector documentType (V/E/J/G/C/P)
  - **Override de precio**: boton ⋯ en items del carrito, edicion inline con badge "Precio modificado", solo visible si `canOverridePrice` (ADMIN o permiso OVERRIDE_PRICE)
  - **Dos botones de guardado**: "En espera" (guarda sin limpiar carrito, status DRAFT) y "Pre-factura" (guarda y limpia, status depende de rol)
  - **Drawer de facturas pendientes**: panel derecho con polling 30s, muestra facturas PENDING de hoy, acciones Retomar (carga en POS) y Cancelar (con confirmacion)
  - **Badge contador**: boton "En espera" en header muestra count de pendientes
  - Fetch de permisos del usuario via `/auth/me` al cargar
- Pagina `/sales/customers` — actualizada:
  - Selector documentType (V/E/J/G/C/P) reemplaza selector tipo NATURAL/JURIDICA
  - Display en tabla con formato "{documentType}-{rif}"

### Verificaciones
- Login retorna permissions correctamente
- `PATCH /users/:id/permissions` asigna OVERRIDE_PRICE
- `GET /auth/me` retorna profile con permissions array
- Customers CRUD con documentType funciona (crear J, actualizar a V)
- `GET /invoices/pending?today=true` filtra correctamente
- Invoices se crean con customer asociado y numero correlativo
- TypeScript compila sin errores

## Sesion 6b — POS Buttons Simplification & Invoice Lock System (Completada)
### Migracion Prisma
- Invoice: campos `lockedById String?` y `lockedAt DateTime?`
- Migracion: `20260510160000_add_invoice_lock`

### Backend
- **InvoicesModule**:
  - `PATCH /invoices/:id/retake` — bloquea factura para el usuario actual. Si ya esta bloqueada por otro (y no expirada), retorna 409 Conflict con nombre del usuario que la tiene
  - `PATCH /invoices/:id/update-items` — actualiza items de factura existente (recalcula totales), libera bloqueo
  - `findPending()` ahora incluye facturas DRAFT y PENDING, muestra `lockedById`, `lockedAt`, `lockedByName`
  - Auto-expiracion de bloqueos > 10 minutos (verificado al consultar, no con cron)
  - `pay()` y `cancel()` liberan bloqueo automaticamente

### Frontend
- Pagina `/sales/pos` — botones simplificados:
  - **SELLER**: un solo boton "Guardar pre-factura" (guarda + limpia carrito)
  - **CASHIER/ADMIN**: "En espera" (guarda + limpia) + "Cobrar" (pago directo)
  - Eliminado boton duplicado "Pre-factura" de la vista CASHIER/ADMIN
  - Al guardar factura retomada: llama `PATCH /update-items` en vez de crear nueva (actualiza + libera bloqueo)
  - Al retomar: llama `PATCH /retake` para bloquear antes de cargar
- Drawer de pendientes — sistema de bloqueo visual:
  - Factura bloqueada por otro: opacidad reducida, badge rojo "Editando: {nombre}", botones deshabilitados
  - Factura bloqueada por mi: badge azul "Editando por ti", permitido retomar
  - Error 409 mostrado como mensaje si alguien mas la tomo primero

### Verificaciones
- Retake bloquea correctamente (lockedById se setea)
- Update-items actualiza totales y libera bloqueo
- Mismo usuario puede retomar su propio bloqueo
- Cancel libera bloqueo
- findPending incluye DRAFT y PENDING con info de bloqueo
- Auto-expiracion: bloqueos > 10min se ignoran en la respuesta
- TypeScript compila sin errores en ambos apps

## Sesion 6c — Fix IVA Double Calculation & Default Profit Margins (Completada)
### Migracion Prisma
- CompanyConfig: campos `defaultGananciaPct Float @default(0)` y `defaultGananciaMayorPct Float @default(0)`
- Migracion: `20260510170000_add_default_ganancia_to_config`

### Backend
- **InvoicesService** — fix calculo IVA:
  - Bug: `priceDetal` ya incluye IVA (formula: costo × brecha × ganancia × IVA), pero al facturar se aplicaba IVA otra vez sobre ese precio
  - Fix: extraer precio base con `baseUnitPrice = priceWithIva / (1 + ivaRate)` antes de calcular IVA
  - Aplicado en `create()` y `updateItems()`
  - IVA rates mapeados: EXEMPT=0, REDUCED=0.08, GENERAL=0.16, SPECIAL=0.31
- **ProductsService** — defaults de ganancia:
  - `create()` ahora consulta CompanyConfig para obtener defaults
  - Si `gananciaPct` o `gananciaMayorPct` no se proveen en el DTO, usa los valores de config
  - Almacena los valores resueltos en el producto creado
- **CompanyConfigDto** — nuevos campos opcionales: `defaultGananciaPct`, `defaultGananciaMayorPct`

### Frontend
- Pagina `/sales/pos` — fix calculo IVA frontend:
  - Misma logica: extrae base price antes de calcular desglose IVA en tiempo real
  - Subtotal + IVA = total correcto sin doble aplicacion
- Pagina `/config` — seccion "Precios por defecto":
  - Inputs para ganancia detal y mayor por defecto (%)
  - Descripcion: "Se aplicara automaticamente a los productos nuevos que no tengan ganancia configurada"
  - Se guarda con el resto de la configuracion
- Pagina `/catalog/products` — pre-llenado:
  - Al abrir modal de crear producto, se pre-llenan gananciaPct y gananciaMayorPct con los defaults de config
  - El usuario puede sobreescribirlos manualmente

### Verificaciones
- Test con producto existente: priceDetal=$1.22 → subtotal=$1.05, IVA=$0.17, total=$1.22 (correcto, sin doble IVA)
- Test ejemplo del prompt: costo $25.99, brecha 50%, ganancia 30%, IVA 16% → priceDetal=$58.79, subtotal=$50.68, IVA=$8.11, total=$58.79
- Config defaults: defaultGananciaPct=35, defaultGananciaMayorPct=25 se guardan y cargan correctamente
- TypeScript compila sin errores en ambos apps

## Sesion 8 — Caja y Arqueo (Completada)
### Migracion Prisma
- CashRegister: eliminados campos `currentUserId` y `openedAt`, agregado `isFiscal Boolean @default(false)`
- CashSession: renombrado `userId` a `openedById`, agregado `closedById String?`, relaciones `openedBy` y `closedBy` con User
- User: agregadas relaciones `sessionsOpened` y `sessionsClosed`
- Migracion: `20260510190000_update_cash_register_sessions`

### Backend
- **CashRegistersService** — reescrito completo:
  - `findAll()` — lista cajas activas con sesiones OPEN y openedBy
  - `findOpen()` — solo cajas con al menos una sesion activa
  - `findOne(id)` — detalle con sesiones activas + resumen de ventas del dia
  - `openSession()` — abre nueva sesion, multiples sesiones por caja permitidas
  - `closeSession()` — cierra sesion por sessionId, calcula resumen y diferencia
  - `getSessionSummary()` — resumen detallado: ventas por metodo de pago, totales, balance esperado, diferencia
  - `findAllSessions()` — lista todas las sesiones con filtros (cashRegisterId, status)
  - Helper `getSessionSalesData()` — agrupa pagos de facturas PAID/CREDIT del periodo de la sesion
- **CashRegistersController** — endpoints:
  - `GET /cash-registers` — todas las cajas
  - `GET /cash-registers/open` — cajas con sesion activa
  - `GET /cash-registers/:id` — detalle con todaySummary
  - `POST /cash-registers/:id/open-session` — abrir sesion
  - `GET /cash-sessions` — historial de sesiones (filtrable por caja y estado)
  - `GET /cash-sessions/:id/summary` — arqueo detallado
  - `POST /cash-sessions/:id/close` — cerrar sesion con closingBalance
- Fix: `InvoicesService` y `QuotationsService` — cambiado `userId` a `openedById` en queries de CashSession

### Seed
- 3 cajas: Caja Notas (01, isFiscal:false), Fiscal 1 (02, isFiscal:true), Fiscal 2 (03, isFiscal:true)

### Frontend
- **POS `/sales/pos`** — modal de seleccion de caja:
  - Al entrar al POS verifica localStorage `selectedCashRegisterId`
  - Si no hay caja → modal fullscreen no-dismissable con lista de cajas
  - Cajas con sesion activa: card con nombre, codigo, fiscal badge, sesiones activas, boton "Usar esta caja"
  - Cajas cerradas: boton "Abrir caja" con input de fondo inicial
  - Header del POS muestra caja seleccionada + boton "Cambiar caja"
  - cashRegisterId incluido en creacion de facturas y cobros
- **Pagina `/cash`** — gestion de cajas:
  - Tabla de cajas con nombre, codigo, tipo fiscal, sesiones activas
  - Boton "Abrir sesion" con modal (monto apertura + notas)
  - Indicador visual de estado (verde si activa, gris si cerrada)
- **Pagina `/cash/sessions`** — historial de sesiones:
  - Filtros por caja y estado (OPEN/CLOSED)
  - Tabla: caja, abierta por, fechas, montos, estado (badge verde/gris)
  - Boton "Ver arqueo" → modal detallado
  - Modal de arqueo: datos sesion, tabla ventas por metodo de pago, totales USD/Bs, balance esperado vs fisico, diferencia
  - Si sesion abierta: campo monto fisico + boton "Cerrar sesion"
- **Sidebar**: seccion CAJA con 2 items (Gestion de cajas, Sesiones)

### Verificaciones
- GET /cash-registers retorna 3 cajas con datos correctos (Caja Notas, Fiscal 1, Fiscal 2)
- POST /cash-registers/:id/open-session crea sesion con openingBalance=$50
- GET /cash-registers/open retorna solo cajas con sesiones activas
- GET /cash-sessions/:id/summary retorna resumen correcto (openingBalance, expectedBalance, difference)
- POST /cash-sessions/:id/close cierra sesion con closingBalance, calcula diferencia=$0 (cuadra)
- GET /cash-sessions retorna historial con cashRegister, openedBy, closedBy
- TypeScript compila sin errores en ambos apps (API y Web)

## Sesion 7 — Cuentas por Cobrar (Completada)
### Migracion Prisma
- Receivable: agregado campo `paidAmountUsd Float @default(0)`
- Modelo `ReceivablePayment`: id, receivableId, amountUsd, amountBs, exchangeRate, method, reference, cashSessionId, notes, createdById, createdAt
- CompanyConfig: agregado `overdueWarningDays Int @default(3)`
- Migracion: `20260510200000_update_receivables_module`

### Backend
- **ReceivablesModule** completo con controller, service, cron:
  - `GET /receivables` — lista con filtros: type, status, customerId, platformName, from, to, overdue, page, limit. Retorna balanceUsd calculado
  - `GET /receivables/summary` — resumen global: totalPendingUsd, totalOverdueUsd, byPlatform (Cashea/Crediagro), byStatus
  - `GET /receivables/:id` — detalle con historial de pagos completo
  - `POST /receivables/:id/pay` — registrar cobro parcial o total en transaccion:
    - Calcula amountBs con tasa del dia
    - Crea ReceivablePayment
    - Actualiza paidAmountUsd
    - Si completado → status PAID + paidAt
    - Si parcial → status PARTIAL
    - Valida que monto no exceda saldo
  - `GET /receivables/customer/:customerId` — estado de cuenta: deuda total, vencida, credito disponible, lista de CxC
- **ReceivablesCronService**: cron diario a las 00:01 — marca como OVERDUE receivables con dueDate < hoy y status PENDING/PARTIAL
- CompanyConfig DTO: agregado campo `overdueWarningDays`

### Frontend
- **Sidebar**: nueva seccion CXC con 2 items (Cuentas por cobrar, Por plataforma)
- **Pagina `/receivables`** — Cuentas por cobrar:
  - 4 tarjetas resumen: Total por cobrar (azul), Vencidas (rojo), Cashea pendiente (verde), Crediagro pendiente (verde)
  - Filtros: tipo, estado, desde, hasta, toggle solo vencidas
  - Tabla con columnas: Tipo (badge), Cliente/Plataforma, Factura, Monto USD, Cobrado USD, Saldo USD, Vence, Estado, Acciones
  - Badges de estado: Pendiente (amarillo), Parcial (azul), Pagado (verde), Vencido (rojo)
  - Filas vencidas con fondo rojo, proximas a vencer con fondo amarillo (segun overdueWarningDays)
  - Modal "Registrar cobro": info CxC, monto editable, metodo pago, referencia, tasa del dia, monto Bs
  - Modal "Ver detalle": info completa + tabla historial de pagos (fecha, USD, Bs, metodo, ref)
  - Paginacion
- **Pagina `/receivables/platforms`** — Por plataforma:
  - Tabs: Cashea | Crediagro
  - Tarjetas resumen por plataforma (pendiente, cobros completados)
  - Tabla filtrada por plataforma con acciones cobrar/detalle
  - Modales de cobro y detalle
- **Pagina `/sales/customers`** — Estado de cuenta agregado:
  - Seccion "Estado de Cuenta" en modal detalle del cliente
  - 3 tarjetas: Deuda Total, Vencido, Credito Disponible
  - Lista de CxC pendientes con boton "Cobrar" inline (expansion con input monto, metodo, boton confirmar)
- **Pagina `/config`** — nuevo campo:
  - "Alerta de vencimiento CxC (dias antes)" con descripcion

### Verificaciones
- Flujo credito completo: crear factura credito → CxC generada (PENDING, $13.95) → cobro parcial ($6.97, PARTIAL) → cobro total ($6.98, PAID, balance=$0) → credito disponible restaurado ($500)
- Flujo Cashea completo: factura pagada con Cashea → CxC a plataforma generada ($4.65) → cobro registrado → status PAID
- GET /receivables/summary retorna totalPendingUsd y byPlatform correctos
- GET /receivables/customer/:id retorna estado de cuenta con deuda y credito
- Detalle con historial de 2 pagos (TRANSFERENCIA ref=REF-001, PAGO_MOVIL ref=REF-002)
- TypeScript compila sin errores en ambos apps (API y Web)

## Sesion 8 — Cuentas por Pagar con Retencion IVA (Completada)
### Migracion Prisma
- Enum `PayableStatus`: PENDING, PARTIAL, PAID, OVERDUE
- Modelo `Payable`: id, supplierId, purchaseOrderId, amountUsd, amountBs, exchangeRate, retentionUsd, retentionBs, netPayableUsd, dueDate, status, paidAmountUsd, paidAt, notes, payments[], timestamps
- Modelo `PayablePayment`: id, payableId, amountUsd, amountBs, exchangeRate, method, reference, notes, createdById, createdAt
- PurchaseOrder: agregados `isCredit Boolean @default(false)`, `creditDays Int @default(0)`, relacion `payables Payable[]`
- CompanyConfig: agregado `ivaRetentionPct Float @default(75)`
- Supplier: agregada relacion `payables Payable[]`
- Migracion: `20260510210000_add_payables_module`

### Backend
- **PayablesModule** completo con controller, service, cron:
  - `GET /payables` — lista con filtros: supplierId, status, from, to, overdue, page, limit. Retorna balanceUsd calculado (netPayableUsd - paidAmountUsd)
  - `GET /payables/summary` — resumen global: totalPendingUsd, totalOverdueUsd, totalRetentionUsd, supplierCount, bySupplier
  - `GET /payables/:id` — detalle con historial de pagos, proveedor y orden vinculada
  - `POST /payables/:id/pay` — registrar pago parcial o total en transaccion:
    - Calcula amountBs con tasa del dia
    - Crea PayablePayment
    - Actualiza paidAmountUsd
    - Si completado → status PAID + paidAt
    - Si parcial → status PARTIAL
  - `GET /payables/supplier/:supplierId` — estado de cuenta: totalDebt, totalOverdue, totalRetention, lista de CxP
- **PayablesCronService**: cron diario a las 00:02 — marca como OVERDUE payables con dueDate < hoy y status PENDING/PARTIAL
- **PurchaseOrdersService** actualizado:
  - CreatePurchaseOrderDto: agregados `isCredit` y `creditDays`
  - `create()` guarda isCredit y creditDays
  - `receive()` al recibir orden completa con isCredit=true:
    - Obtiene tasa del dia
    - Calcula IVA total de los items recibidos
    - Si supplier.isRetentionAgent → calcula retencion IVA (ivaRetentionPct% del IVA total)
    - Crea Payable con amountUsd, retentionUsd, netPayableUsd, dueDate (receivedAt + creditDays)
- CompanyConfig DTO: agregado campo `ivaRetentionPct`

### Frontend
- **Sidebar**: nueva seccion CXP con item "Cuentas por pagar" (icono Receipt)
- **Pagina `/payables`** — Cuentas por pagar:
  - 4 tarjetas resumen: Total por pagar (rojo), Vencidas (rojo oscuro), Retenciones IVA (naranja), Proveedores con deuda (azul)
  - Filtros: proveedor, estado, rango de fechas, toggle solo vencidas
  - Tabla: Proveedor, Orden, Monto USD, Retencion, Neto USD, Pagado, Saldo, Vence, Estado, Acciones
  - Filas vencidas con fondo rojo, proximas a vencer con fondo amarillo
  - Modal "Registrar pago": info CxP con retencion desglosada, monto editable, metodo, referencia, tasa del dia
  - Modal "Ver detalle": info completa, seccion Retencion IVA (si aplica), tabla historial de pagos
  - Paginacion
- **Pagina `/purchases`** — actualizada:
  - Toggle "Compra a credito" en modal crear/editar
  - Campo "Dias de credito" cuando isCredit=true
  - Badge "Se generara CxP al recibir" + "Aplicara retencion IVA" si proveedor es agente de retencion
- **Pagina `/catalog/suppliers`** — Estado de cuenta agregado:
  - Boton "Estado de cuenta" (icono Receipt) en acciones
  - Modal con 3 tarjetas: Total adeudado, Vencido, Retenciones
  - Lista de CxP pendientes con orden, neto, saldo, vencimiento, estado
- **Pagina `/config`** — nuevo campo:
  - "Retencion IVA (%)" con default 75 y descripcion de ley venezolana

### Verificaciones
- Flujo completo: crear PO credito con proveedor agente de retencion → enviar → recibir → CxP generada con retencion calculada (amountUsd=$100, retentionUsd=$6, netPayableUsd=$94) → pago parcial $30 (PARTIAL) → pago total $64 (PAID, balance=$0)
- GET /payables/summary: totalPendingUsd, totalRetentionUsd, supplierCount correctos
- GET /payables/supplier/:id: estado de cuenta con deuda $0 despues de pago completo
- ivaRetentionPct=75 en config (configurable)
- TypeScript compila sin errores en ambos apps (API y Web)

## Sesion 9 — Documentos Fiscales Venezolanos (Completada)
### Migracion Prisma
- PurchaseOrder: agregados `supplierControlNumber String?`, `islrRetentionPct Float?`, `islrRetentionUsd Float?`, `islrRetentionBs Float?`
- CompanyConfig: agregado `islrRetentionPct Float @default(0)`
- Invoice: campo `controlNumber` ya existia del schema original
- Migracion: `20260510220000_add_fiscal_documents_fields`

### Backend
- **FiscalModule** nuevo con controller y service:
  - `GET /fiscal/libro-ventas?from&to` — Libro de Ventas formato SENIAT:
    - Filtra facturas PAID y CREDIT en el periodo con setUTCHours
    - Por cada factura: fecha, numero, control, RIF/nombre cliente, bases imponibles (exenta, reducida, general, especial), IVA desglosado (8%, 16%, 31%), total
    - Totales del periodo
  - `GET /fiscal/libro-compras?from&to` — Libro de Compras formato SENIAT:
    - Filtra PurchaseOrders RECEIVED en el periodo
    - Por cada orden: fecha, numero proveedor, control proveedor, RIF/nombre proveedor, bases imponibles, IVA desglosado, retencion IVA, retencion ISLR, total
    - Totales del periodo
  - `GET /fiscal/resumen?from&to` — Resumen fiscal:
    - Ventas: totalFacturas, baseImponibleTotal, ivaTotal, totalVentas
    - Compras: totalOrdenes, baseImponibleTotal, ivaTotal, retencionesIva, retencionesIslr, totalCompras
    - Balance IVA: debito fiscal, credito fiscal, IVA por pagar/recuperar
- **InvoicesModule** actualizado:
  - `PATCH /invoices/:id/control-number` — actualizar numero de control (solo ADMIN)
- **PurchaseOrdersModule** actualizado:
  - CreatePurchaseOrderDto: agregados `supplierControlNumber`, `applyIslr`, `islrRetentionPct`
  - `create()` calcula ISLR si aplica
  - `update()` recalcula ISLR y permite editar supplierControlNumber
  - `receive()` calcula ISLR final sobre monto recibido, descuenta del netPayableUsd en el Payable
- **CompanyConfigDto**: agregado campo `islrRetentionPct`

### Frontend
- **Sidebar**: nueva seccion FISCAL con 3 items: Libro de Ventas, Libro de Compras, Resumen Fiscal
- **Pagina `/fiscal/libro-ventas`**:
  - Selector periodo (mes/ano), boton Generar y Exportar PDF
  - Tabla SENIAT: N, Fecha, Factura, Control, RIF, Cliente, Base Exenta/Reducida/General/Especial, IVA 8%/16%/31%, Total
  - Fila totales en negrita, formato numerico venezolano
  - Exportar PDF A4 horizontal formato SENIAT
- **Pagina `/fiscal/libro-compras`**:
  - Mismo formato con columnas adicionales: Ret. IVA (naranja), Ret. ISLR (purpura)
  - Exportar PDF horizontal
- **Pagina `/fiscal/resumen`**:
  - 2 cards: Ventas (verde) y Compras (azul)
  - Tabla balance IVA: debito vs credito = IVA por pagar/recuperar
  - Seccion retenciones del periodo
- **Pagina `/purchases`** — modal crear/editar:
  - Campo "N Control del proveedor"
  - Toggle "Aplica retencion ISLR" con porcentaje pre-llenado desde config
  - Calculo ISLR en tiempo real
- **Pagina `/config`**: campo "Retencion ISLR por defecto (%)"

### Verificaciones
- 5 facturas de venta con diferentes IVA types (EXEMPT, REDUCED, GENERAL, mixtas)
- Numeros de control asignados: 00-001234, 00-001235, 00-001236
- Libro de ventas: 12 facturas con desglose correcto por tipo IVA
- 2 ordenes de compra: PO-0004 con IVA+ISLR (retIVA=$16.20, retISLR=$2.70), PO-0005 sin retenciones
- Libro de compras: 5 ordenes, retenciones IVA=$22.20, ISLR=$2.70
- Resumen fiscal: IVA debito=$61.64, credito=$96.78, saldo a recuperar=-$35.14
- TypeScript compila sin errores en ambos apps (API y Web)

## Sesion 12 — Gestion de Usuarios y Menu Colapsable (Completada)
### Backend
- **Role Permissions** (`apps/api/src/modules/auth/role-permissions.ts`):
  - Mapa fijo ROLE_PERMISSIONS por rol: ADMIN=['*'], SUPERVISOR=[dashboard,sales,quotations,catalog,inventory,purchases,cash,receivables,payables,fiscal], CASHIER=[dashboard,sales,quotations,cash,receivables], SELLER=[dashboard,sales,quotations], WAREHOUSE=[dashboard,inventory,purchases], BUYER=[dashboard,catalog,purchases,payables], ACCOUNTANT=[dashboard,receivables,payables,fiscal]
  - Permisos incluidos en JWT payload al hacer login y refresh
- **AuthModule** actualizado:
  - JWT payload expandido: sub, name, email, role, permissions, mustChangePassword
  - Login: retorna 403 "Usuario inactivo" si isActive=false (antes retornaba 401 generico)
  - Login: actualiza lastLoginAt
  - Login: retorna permissions y mustChangePassword en response body
  - `PATCH /auth/change-password` — nuevo endpoint:
    - Si mustChangePassword=true: no requiere contrasena actual
    - Si mustChangePassword=false: requiere y verifica contrasena actual
    - Validacion: minimo 8 caracteres, al menos una mayuscula y un numero
    - Al cambiar: mustChangePassword=false
  - jwt.strategy.ts: ahora pasa permissions y mustChangePassword al request.user
  - refreshToken: recalcula permissions y mustChangePassword frescos desde DB
- **UsersModule** actualizado:
  - `POST /users` — contrasena opcional, genera temporal si no se especifica (10 chars alfanumericos)
  - `POST /users` — siempre mustChangePassword=true, retorna temporaryPassword en texto plano
  - `GET /users` — ahora incluye lastLoginAt, ordenado por createdAt DESC
  - `PATCH /users/:id` — solo actualiza name, email, role, isActive (no contrasena)
  - `PATCH /users/:id/reset-password` — genera nueva contrasena temporal, mustChangePassword=true
  - `PATCH /users/:id/toggle-active` — alterna isActive
  - `DELETE /users/:id` — verifica que no sea el ultimo ADMIN activo antes de eliminar
  - Validacion de email unico en create y update

### Frontend
- **Middleware** (`middleware.ts`) — completamente reescrito:
  - Decodifica JWT payload sin libreria externa (atob)
  - Si mustChangePassword=true y ruta no es /change-password → redirige a /change-password
  - Mapa de permisos por ruta: /sales→sales, /quotations→quotations, /catalog→catalog, /inventory→inventory, /purchases→purchases, /cash→cash, /receivables→receivables, /payables→payables, /fiscal→fiscal, /settings|/config|/users|/import→settings
  - Si usuario no tiene permiso para la ruta → redirige a /403
  - Rutas sin restriccion: /dashboard, /change-password, /403, /api/*
- **Sidebar colapsable** (`components/sidebar.tsx`) — rediseñado completamente:
  - Estructura de acordeon: secciones colapsables individualmente
  - Dashboard siempre visible como item principal
  - 10 secciones: VENTAS, COTIZACIONES, CATALOGO, INVENTARIO, COMPRAS, CAJA, CxC, CxP, FISCAL, CONFIGURACION
  - CONFIGURACION solo visible para ADMIN (Empresa, Usuarios, Areas de impresion, Importacion masiva)
  - Estado de secciones guardado en localStorage (trinity-sidebar-sections)
  - Estado de colapso guardado en localStorage (trinity-sidebar-collapsed)
  - Animacion suave de expand/collapse con max-height transition
  - Click en seccion colapsada expande sidebar y abre la seccion
  - Indicador visual: seccion con item activo se resalta en verde
  - ChevronDown con rotacion animada para indicar estado abierto/cerrado
  - Filtrado por permisos del rol (solo muestra secciones con permiso)
- **Pagina `/settings/users`** — gestion de usuarios:
  - Solo accesible para ADMIN
  - Header con titulo + boton "Nuevo usuario"
  - Barra de busqueda por nombre, email o rol
  - Tabla: Nombre, Email, Rol (badge con color por rol), Ultimo acceso, Estado, Acciones
  - Colores de badge: ADMIN=rojo, SUPERVISOR=naranja, CASHIER=azul, SELLER=verde, WAREHOUSE=amarillo, BUYER=morado, ACCOUNTANT=gris
  - Acciones: Editar, Resetear contrasena, Activar/Desactivar, Eliminar
  - Modal "Nuevo usuario": nombre, email, rol, contrasena temporal (opcional)
  - Modal "Editar usuario": nombre, email, rol, estado activo/inactivo
  - Modal "Resetear contrasena": confirmacion → muestra nueva contrasena
  - Modal "Contrasena generada": contrasena en mono font con boton copiar
  - Modal "Eliminar usuario": confirmacion con advertencia
- **Pagina `/change-password`** — cambio de contrasena:
  - Fuera del layout del dashboard (accesible sin sidebar)
  - Si mustChangePassword=true: no muestra campo de contrasena actual, mensaje amarillo
  - Si mustChangePassword=false: muestra campo de contrasena actual
  - Validacion en tiempo real: minimo 8 chars (check verde), mayuscula (check verde), numero (check verde)
  - Campo confirmar contrasena con validacion de match
  - Toggles de visibilidad (ojo) en cada campo
  - Al guardar exitosamente → redirige a login para obtener token fresco
- **Pagina `/403`** — acceso denegado:
  - Icono ShieldX rojo
  - Mensaje "No tienes permiso para acceder a esta seccion"
  - Boton "Volver al inicio" → /dashboard
- **Login** (`login/page.tsx`) — actualizado:
  - Si mustChangePassword=true → redirige a /change-password
  - Si mustChangePassword=false → redirige a /dashboard
- **Login API route** actualizada: retorna mustChangePassword en response
- **Dashboard layout** actualizado: pasa permissions al Sidebar

### Verificaciones
- Login ADMIN: permissions=['*'], mustChangePassword=false — acceso total
- Login SELLER: permissions=['dashboard','sales','quotations'], mustChangePassword=true — redirige a /change-password
- Inactive user login: retorna 403 "Usuario inactivo"
- Change password con mustChangePassword=true: funciona sin contrasena actual
- Post change: mustChangePassword=false en siguiente login
- SELLER intenta /inventory: redirigido a /403
- SELLER intenta /settings/users: redirigido a /403
- SELLER accede /dashboard: 200 OK
- SELLER accede /sales/pos: 200 OK
- GET /users: lista 9 usuarios con lastLoginAt
- Reset password: genera nueva contrasena temporal
- Toggle active: alterna isActive correctamente
- Usuarios creados: Maria (SUPERVISOR), Pedro (CASHIER), Ana (SELLER), Carlos (WAREHOUSE), Luis (BUYER), Rosa (ACCOUNTANT)
- TypeScript compila sin errores en ambos apps (API y Web)

## Sesion 12b — Permisos por Rol Configurables desde UI con Redis Cache (Completada)

### Base de datos
- **Modelo RolePermission**: tabla con role (unique) y modules (String[])
- Migracion `20260510230000_add_role_permissions_table`
- Seed actualizado: inserta permisos por defecto para los 7 roles via upsert

### Backend
- **RedisModule** (global): servicio wrapper sobre ioredis con get/set/del y TTL opcional
- **RolePermissionsModule**:
  - `GET /role-permissions` — lista todos los permisos por rol (requiere ADMIN)
  - `PATCH /role-permissions/:role` — actualiza modulos de un rol (requiere ADMIN, bloquea edicion de ADMIN)
  - Servicio con cache Redis (prefix `role-permissions:`, TTL 5 min)
  - `getModulesForRole(role)` — lee de Redis cache, fallback a DB
  - Al actualizar: invalida cache del rol modificado
  - Validacion de modulos contra whitelist (VALID_MODULES)
- **AuthService** actualizado:
  - Login, refreshToken y getProfile ahora leen permisos desde DB (via RolePermissionsService con cache)
  - Permisos se incluyen en JWT payload y response del login
  - Eliminada dependencia de mapa estatico ROLE_PERMISSIONS

### Frontend
- **Pagina `/settings/role-permissions`** — editor de permisos:
  - Card por cada rol con badge de color
  - Grid de checkboxes con los 12 modulos disponibles
  - ADMIN: todos marcados + deshabilitados + badge "Acceso total"
  - Boton "Guardar cambios" por rol, solo habilitado si hay cambios pendientes
  - Toast de confirmacion al guardar
- **Sidebar**: agregado link "Permisos por rol" en seccion CONFIGURACION (con icono Shield)
- Reorganizacion de sidebar: Cotizaciones movido a submenu VENTAS, Proveedores movido a submenu COMPRAS
- **Middleware**: ROUTE_PERMISSION_MAP cambiado a array de tuplas para soportar overrides especificos (/catalog/suppliers→purchases, /quotations→sales)

### Verificaciones
- GET /role-permissions: retorna 7 roles con sus modulos
- PATCH /role-permissions/CASHIER: actualiza modulos, cache Redis invalidado
- PATCH /role-permissions/ADMIN: retorna 400 "No se pueden modificar los permisos de ADMIN"
- Login refleja permisos de DB (no estaticos)
- TypeScript compila sin errores en web app

## Sesion 13 — Deployment en DigitalOcean (Completada)

### Servidor
- **Droplet**: Ubuntu 24.04, 1 vCPU, 2GB RAM, NYC1
- **IP**: 134.209.220.233
- **Acceso**: `ssh root@134.209.220.233` (llave SSH ed25519)

### Infraestructura instalada
- Docker + Docker Compose (PostgreSQL 15 + Redis 7 en contenedores)
- Node.js 20.x (via nodesource)
- pnpm (gestor de paquetes)
- PM2 (process manager con auto-restart al reboot)
- Nginx (reverse proxy puerto 80 → Next.js:3000)

### Servicios corriendo
| Servicio | Puerto | PM2 Name | Descripcion |
|----------|--------|----------|-------------|
| PostgreSQL | 5432 | Docker | Base de datos |
| Redis | 6379 | Docker | Cache de permisos |
| NestJS API | 4000 | trinity-api | Backend REST |
| Next.js Web | 3000 | trinity-web | Frontend SSR |
| Nginx | 80 | systemd | Reverse proxy |

### Archivos de configuracion en servidor
- `/opt/Trinity/packages/database/.env` — DATABASE_URL
- `/opt/Trinity/apps/api/.env` — DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET, API_PORT
- `/opt/Trinity/apps/web/.env` — NEXT_PUBLIC_API_URL=http://localhost:4000, COOKIE_SECURE=false
- `/etc/nginx/sites-available/trinity` — config Nginx

### Fix aplicado
- Cookies `secure` flag controlado por env `COOKIE_SECURE=false` (necesario porque no hay HTTPS aun)
- Archivos modificados: `apps/web/src/app/api/auth/login/route.ts`, `apps/web/src/app/api/auth/refresh/route.ts`

### Migracion adicional creada en servidor
- `20260511010038_add_category_last_product_number` — campo `lastProductNumber` + unique constraint en `code` para Category

### Pendiente para futuro
- Comprar dominio y apuntar DNS a 134.209.220.233
- Configurar HTTPS con certbot (y cambiar COOKIE_SECURE=true)
- Configurar firewall (ufw): solo puertos 22, 80, 443

### Comandos utiles para mantenimiento
```bash
# Conectar al servidor
ssh root@134.209.220.233

# Ver estado de servicios
pm2 status
pm2 logs trinity-api --lines 20
pm2 logs trinity-web --lines 20

# Actualizar codigo (despues de push a GitHub)
cd /opt/Trinity && git pull && cd apps/api && npm run build && pm2 restart trinity-api && cd ../web && npm run build && pm2 restart trinity-web

# Reiniciar todo
pm2 restart all

# Ver contenedores Docker (DB + Redis)
docker ps
```
