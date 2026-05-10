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
