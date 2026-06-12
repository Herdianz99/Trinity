# Trinity ERP — Documento de Proyecto

## Visión General

Trinity es un ERP empresarial single-tenant para ferreterías venezolanas. Gestiona el ciclo completo del negocio: compras, inventario, ventas, cuentas por cobrar/pagar, despachos y reportes. Maneja precios en USD con visualización en Bs según tasa de cambio vigente, documentos fiscales venezolanos (IVA, retenciones) y flujos específicos del mercado local (Cashea, Crediagro, crédito a clientes).

**Empresa objetivo:** Ferretería mediana venezolana (~300 facturas/día, 15-20 usuarios simultáneos, 5.000-50.000 productos)

---

## Stack Tecnológico

| Componente | Tecnología | Puerto |
|------------|-----------|--------|
| Frontend ERP | Next.js 14 App Router | 3000 |
| API REST | NestJS | 4000 |
| Base de datos | PostgreSQL 15 (Docker) | 5432 |
| ORM | Prisma | — |
| Caché | Redis 7 (Docker) | 6379 |
| PDF facturas | @react-pdf/renderer | — |
| Búsqueda productos | PostgreSQL tsvector (full-text) | — |
| Escáner código barras | @zxing/browser | — |
| IA facturas compra | Anthropic Claude API (vision) | — |

**Monorepo pnpm con Turborepo:**
```
trinity/
├── apps/
│   └── web/          # Next.js 14 — ERP frontend
├── packages/
│   └── database/     # Prisma schema + migrations
├── docker-compose.yml
├── turbo.json
└── package.json
```

---

## Arquitectura de la Aplicación

### Single-Tenant
Trinity es single-tenant. No existe tenantId en las queries. Una instalación = una empresa. La configuración global se guarda en una tabla `CompanyConfig` (singleton con id = "singleton").

### Roles de Usuario
| Rol | Descripción |
|-----|-------------|
| `ADMIN` | Acceso total, configuración del sistema, puede sobreescribir precios |
| `SUPERVISOR` | Aprueba créditos, transferencias, ajustes de inventario |
| `CASHIER` | Cobra facturas, cierra caja |
| `SELLER` | Crea pre-facturas en piso de ventas (tablet) |
| `WAREHOUSE` | Gestiona inventario, recibe compras, despacha |
| `BUYER` | Gestiona compras y proveedores |
| `ACCOUNTANT` | CxC, CxP, reportes financieros |
| `AUDITOR` | Solo lectura: dashboard e inventario |

### Flujo Principal de Ventas
```
SELLER (tablet) → Pre-factura → CASHIER → Factura → Cobro → WAREHOUSE → Despacho
```

### Fórmula de Precios
```
Precio Detal USD  = Costo USD × (1 + Brecha%) × (1 + GananciaPct%) × (1 + IVA%)
Precio Mayor USD  = Costo USD × (1 + Brecha%) × (1 + GananciaMayorPct%) × (1 + IVA%)
Precio Detal Bs   = Precio Detal USD × Tasa BCV
Precio Mayor Bs   = Precio Mayor USD × Tasa BCV
```
- **Costo USD**: viene de la última orden de compra recibida
- **Brecha%**: porcentaje global en CompanyConfig, activable por producto (`bregaApplies`)
- **GananciaPct%**: porcentaje por producto para precio detal
- **GananciaMayorPct%**: porcentaje por producto para precio mayor
- **IVA**: por producto — Exento (0%), Reducido (8%), General (16%), Especial (31%)
- ADMIN o usuarios con permiso OVERRIDE_PRICE pueden sobreescribir el precio final en POS
- Precios se recalculan automáticamente al cambiar costo (nueva compra) o brecha global

---

## Módulos del Sistema

### FASE 1 — Fundación (Sesiones 1-5) ← ENTREGABLE INICIAL
Catálogo + Inventario + Compras + Ventas básicas.

### FASE 2 — Operaciones Completas (Sesiones 6-12)
Caja, CxC/CxP, Despachos, Documentos fiscales venezolanos.

### FASE 3 — Inteligencia de Negocio (Sesiones 13-18)
Reportes avanzados, análisis de rotación, dashboards.

### FASE 4 — Automatización IA (Sesiones 19-22)
Carga de facturas por foto, análisis de compras con IA.

### FASE 5 — Expansión (Sesiones 23+)
Tienda online, Chatbot WhatsApp, POS offline, CRM.

---

## Detalle por Fase

---

### FASE 1 — Fundación

#### Sesión 1 — Setup, Auth y Configuración Base
**Backend:**
- Scaffold monorepo pnpm + Turborepo
- Docker Compose (PostgreSQL 15 + Redis 7)
- NestJS base: main.ts (CORS, ValidationPipe, Swagger), AppModule
- PrismaModule/Service global
- AuthModule: login, refresh token, JWT strategy, get profile
- UsersModule: CRUD con roles, isActive, lastLoginAt
- CompanyConfigModule: GET y PATCH /config (singleton)

**Frontend:**
- Next.js 14 App Router base
- Layout autenticado con sidebar colapsable
- Página de login
- Middleware de autenticación (cookies httpOnly)
- Página de configuración básica de empresa

**Schema Prisma completo Fase 1:**
```prisma
model CompanyConfig {
  id                 String   @id @default("singleton")
  companyName        String   @default("Trinity")
  rif                String?
  address            String?
  phone              String?
  email              String?
  bregaGlobalPct     Float    @default(0)
  defaultWarehouseId String?
  invoicePrefix      String   @default("FAC")
  creditAuthPassword String?
  updatedAt          DateTime @updatedAt
  // exchangeRate NO se guarda aquí — se obtiene de la tabla ExchangeRate del día
}

model ExchangeRate {
  id          String             @id @default(cuid())
  rate        Float
  date        DateTime           @unique  // una tasa por día (solo fecha, sin hora)
  source      ExchangeRateSource @default(MANUAL)
  createdById String?
  createdAt   DateTime           @default(now())
}

enum ExchangeRateSource {
  BCV     // obtenida por scraping de bcv.org.ve
  MANUAL  // ingresada manualmente por el usuario
}

model User {
  id             String    @id @default(cuid())
  name           String
  email          String    @unique
  password       String
  role           UserRole
  isActive       Boolean   @default(true)
  mustChangePassword Boolean @default(true)
  lastLoginAt    DateTime?
  permissions    UserPermission[]
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}

enum UserRole {
  ADMIN SUPERVISOR CASHIER SELLER WAREHOUSE BUYER ACCOUNTANT AUDITOR
}

model UserPermission {
  id            String        @id @default(cuid())
  userId        String
  permissionKey PermissionKey
  user          User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt     DateTime      @default(now())
  @@unique([userId, permissionKey])
}

enum PermissionKey {
  OVERRIDE_PRICE
  RETURN_INVOICE
  CREDIT_NOTE_SALE
  DEBIT_NOTE_SALE
  RETURN_PURCHASE
  CREDIT_NOTE_PURCHASE
  DEBIT_NOTE_PURCHASE
}

model PrintArea {
  id          String     @id @default(cuid())
  name        String     // "Despacho Interno", "Despacho Externo", etc.
  description String?
  isActive    Boolean    @default(true)
  categories  Category[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

model Seller {
  id        String    @id @default(cuid())
  code      String    @unique  // auto-generado: VEN-001, VEN-002...
  name      String
  phone     String?
  isActive  Boolean   @default(true)
  userId    String?   @unique  // vínculo 1:1 con User
  user      User?     @relation(fields: [userId], references: [id])
  invoices  Invoice[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

model Category {
  id                  String     @id @default(cuid())
  name                String
  code                String     @unique  // "HER", "PLO", "ELE" — 3 letras, configurable
  lastProductNumber   Int        @default(0)  // correlativo por categoría, SELECT FOR UPDATE al crear producto
  commissionPct       Float      @default(0)  // % de comisión para vendedores
  printAreaId         String?    // área de impresión asignada
  printArea           PrintArea? @relation(...)
  parentId            String?
  parent              Category?  @relation("SubCategories", fields: [parentId], references: [id])
  children            Category[] @relation("SubCategories")
  products            Product[]
  createdAt           DateTime   @default(now())
  updatedAt           DateTime   @updatedAt
}

model Brand {
  id        String    @id @default(cuid())
  name      String
  products  Product[]
  createdAt DateTime  @default(now())
}

model Supplier {
  id             String          @id @default(cuid())
  name           String
  rif            String?
  phone          String?
  email          String?
  address        String?
  contactName    String?
  isRetentionAgent Boolean      @default(false)
  isActive       Boolean         @default(true)
  products       Product[]
  purchaseOrders PurchaseOrder[]
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
}

model Product {
  id               String    @id @default(cuid())
  code             String    @unique  // auto-generado: {categoryCode}{correlativo5digits} ej: HER00001
  barcode          String?   @unique
  supplierRef      String?   // código del proveedor
  name             String
  description      String?
  categoryId       String?
  category         Category? @relation(...)
  brandId          String?
  brand            Brand?    @relation(...)
  supplierId       String?
  supplier         Supplier? @relation(...)  // proveedor principal
  purchaseUnit     String    @default("UNIT")
  saleUnit         String    @default("UNIT")
  conversionFactor Float     @default(1)  // cuántas saleUnit por purchaseUnit
  costUsd          Float     @default(0)
  bregaApplies     Boolean   @default(true)
  gananciaPct      Float     @default(0)  // para precio detal
  gananciaMayorPct Float     @default(0)  // para precio mayor
  ivaType          IvaType   @default(GENERAL)
  priceDetal       Float     @default(0)  // calculado y guardado
  priceMayor       Float     @default(0)  // calculado y guardado
  minStock         Float     @default(0)
  isActive         Boolean   @default(true)
  // searchVector se maneja via trigger PostgreSQL
  stock            Stock[]
  movements        StockMovement[]
  purchaseItems    PurchaseOrderItem[]
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}

enum IvaType {
  EXEMPT    // 0%
  REDUCED   // 8%
  GENERAL   // 16%
  SPECIAL   // 31%
}

model Warehouse {
  id         String  @id @default(cuid())
  name       String
  location   String?
  isDefault  Boolean @default(false)
  isActive   Boolean @default(true)
  stock      Stock[]
  movements  StockMovement[]
  createdAt  DateTime @default(now())
}

model Stock {
  id          String    @id @default(cuid())
  productId   String
  product     Product   @relation(...)
  warehouseId String
  warehouse   Warehouse @relation(...)
  quantity    Float     @default(0)
  updatedAt   DateTime  @updatedAt
  @@unique([productId, warehouseId])
}

model StockMovement {
  id            String        @id @default(cuid())
  productId     String
  product       Product       @relation(...)
  warehouseId   String
  warehouse     Warehouse     @relation(...)
  type          MovementType
  quantity      Float         // positivo = entrada, negativo = salida
  costUsd       Float?
  reason        String?
  reference     String?       // PO-001, FAC-001, etc.
  createdById   String
  createdAt     DateTime      @default(now())
}

enum MovementType {
  PURCHASE SALE ADJUSTMENT_IN ADJUSTMENT_OUT TRANSFER_IN TRANSFER_OUT COUNT_ADJUST
}

model PurchaseOrder {
  id                    String              @id @default(cuid())
  purchaseNumber        Int                 // correlativo numérico
  number                String              @unique  // FC-XXXXX
  supplierId            String
  supplier              Supplier            @relation(...)
  status                PurchaseStatus      @default(PENDING)
  supplierSerialNumber  String?             // serial proveedor
  supplierInvoiceNumber String?             // N° factura proveedor
  supplierControlNumber String?             // N° control proveedor
  invoiceDate           DateTime?
  receivedDate          DateTime?
  currency              String              @default("USD")
  exchangeRate          Float               @default(1)
  isCredit              Boolean             @default(false)
  creditDays            Int                 @default(0)
  discountGlobalPct     Float               @default(0)
  discountGlobalUsd     Float               @default(0)
  discountGlobalBs      Float               @default(0)
  subtotalUsd           Float               @default(0)
  subtotalBs            Float               @default(0)
  exemptAmountUsd       Float               @default(0)
  exemptAmountBs        Float               @default(0)
  taxableBaseUsd        Float               @default(0)
  taxableBaseBs         Float               @default(0)
  totalIvaUsd           Float               @default(0)
  totalIvaBs            Float               @default(0)
  surchargeUsd          Float               @default(0)
  totalSurchargeUsd     Float               @default(0)
  totalSurchargeBs      Float               @default(0)
  totalUsd              Float               @default(0)
  totalBs               Float               @default(0)
  retentionVoucherNumber String?
  applyIslr             Boolean             @default(false)
  islrRetentionPct      Float               @default(0)
  notes                 String?
  responsibleId         String?
  responsible           User?               @relation("PurchaseBills", ...)
  warehouseId           String?
  warehouse             Warehouse?          @relation("PurchaseBills", ...)
  processedAt           DateTime?
  items                 PurchaseOrderItem[]
  payables              Payable[]
  createdById           String
  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt
}

enum PurchaseStatus {
  PENDING PROCESSED CANCELLED
}

model PurchaseOrderItem {
  id              String        @id @default(cuid())
  purchaseOrderId String
  purchaseOrder   PurchaseOrder @relation(...)
  productId       String
  product         Product       @relation(...)
  quantity        Float
  costUsd         Float
  totalUsd        Float
  discountPct     Float         @default(0)
  discountUsd     Float         @default(0)
  discountBs      Float         @default(0)
  netCostUsd      Float         @default(0)
  netCostBs       Float         @default(0)
  receivedQty     Float         @default(0)
}

model Customer {
  id           String    @id @default(cuid())
  name         String
  documentType String    @default("V")  // V, E, J, G, C, P
  rif          String?
  phone        String?
  email        String?
  address      String?
  creditLimit  Float     @default(0)   // cupo en USD
  creditDays   Int       @default(0)
  isActive     Boolean   @default(true)
  invoices     Invoice[]
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

model Serie {
  id              String            @id @default(cuid())
  name            String            @unique  // "Serie VTA", "Serie NE"
  prefix          String            // "VTA", "NE", "VF"
  isFiscal        Boolean           @default(false)
  isVatExempt     Boolean           @default(false)  // fuerza IVA 0% en todos los documentos
  lastNumber      Int               @default(0)      // correlativo de numeracion
  isActive        Boolean           @default(true)
  cashRegisterId  String?           @unique          // relacion 1:1 con caja
  cashRegister    CashRegister?     @relation(...)
  invoices        Invoice[]
  creditDebitNotes CreditDebitNote[]
  retentionVouchers RetentionVoucher[]
}

model CashRegister {
  id                   String        @id @default(cuid())
  code                 String        @unique  // "01", "02", etc.
  name                 String
  isShared             Boolean       @default(false)  // cajas compartidas visibles para todos
  isActive             Boolean       @default(true)
  comPort              String?       // puerto COM para maquina fiscal
  fiscalMachineSerial  String?       // serial de la maquina fiscal
  serie                Serie?        // serie vinculada (fiscal, correlativo, prefix)
  sessions             CashSession[]
  invoices             Invoice[]
  createdAt            DateTime      @default(now())
  updatedAt            DateTime      @updatedAt
}

model CashSession {
  id                String        @id @default(cuid())
  cashRegisterId    String
  cashRegister      CashRegister  @relation(...)
  openedById        String
  openedBy          User          @relation("SessionOpenedBy", ...)
  closedById        String?
  closedBy          User?         @relation("SessionClosedBy", ...)
  openingBalanceUsd Float         @default(0)
  openingBalanceBs  Float         @default(0)
  closingBalanceUsd Float?
  closingBalanceBs  Float?
  status            SessionStatus @default(OPEN)
  notes             String?
  openedAt          DateTime      @default(now())
  closedAt          DateTime?
}

enum SessionStatus { OPEN CLOSED }

model Invoice {
  id              String        @id @default(cuid())
  // Formato: FAC-01-26-00000001
  // prefijo-codigoCaja-año-correlativo8digitos
  number          String        @unique
  fiscalNumber    String?       // número de impresora fiscal (campo separado)
  controlNumber   String?       // número de control SENIAT
  cashRegisterId  String
  cashRegister    CashRegister  @relation(...)
  customerId      String?
  customer        Customer?     @relation(...)
  status          InvoiceStatus      @default(PENDING)
  paymentType     InvoicePaymentType @default(CASH)
  type            InvoiceType        @default(SALE)
  subtotalUsd     Float         @default(0)
  ivaUsd          Float         @default(0)
  totalUsd        Float         @default(0)
  totalBs         Float         @default(0)
  exchangeRate    Float         @default(0)
  isCredit        Boolean       @default(false)
  creditDays      Int           @default(0)
  dueDate         DateTime?
  paidAt          DateTime?
  notes           String?
  items           InvoiceItem[]
  payments        Payment[]
  createdById     String
  sellerId        String?       // Seller que atendió la venta
  seller          Seller?       @relation(fields: [sellerId], references: [id])
  cashierId       String?       // User que cobró la factura
  cashier         User?         @relation("InvoiceCashier", fields: [cashierId], references: [id])
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
}

enum InvoicePaymentType { CASH CREDIT }
enum InvoiceStatus { PENDING PAID PARTIAL_RETURN RETURNED CANCELLED }
enum InvoiceType   { SALE DEBIT_NOTE CREDIT_NOTE }

model InvoiceItem {
  id                    String  @id @default(cuid())
  invoiceId             String
  invoice               Invoice @relation(...)
  productId             String
  productName           String  // snapshot del nombre
  quantity              Float
  unitPrice             Float   // precio al momento de la venta en USD (con IVA)
  ivaType               IvaType
  ivaAmount             Float
  totalUsd              Float
  unitPriceWithoutIva   Float   @default(0)  // precio base sin IVA
  unitPriceWithoutIvaBs Float   @default(0)
  costUsd               Float   @default(0)  // costo con brega para comisiones
  costBs                Float   @default(0)
}

model PaymentMethod {
  id                 String            @id @default(cuid())
  name               String            @unique
  isDivisa           Boolean           @default(false)
  createsReceivable  Boolean           @default(false)
  isActive           Boolean           @default(true)
  sortOrder          Int               @default(0)
  fiscalCode         String?
  parentId           String?           // self-referencing for groups/variants
  parent             PaymentMethod?    @relation("SubMethods")
  children           PaymentMethod[]   @relation("SubMethods")
  payments           Payment[]
  receivablePayments ReceivablePayment[]
  payablePayments    PayablePayment[]
}

model Payment {
  id          String        @id @default(cuid())
  invoiceId   String
  invoice     Invoice       @relation(...)
  methodId    String
  method      PaymentMethod @relation(...)
  amountUsd   Float
  amountBs    Float
  exchangeRate Float
  reference   String?
  createdAt   DateTime      @default(now())
}
```

**Seed datos iniciales:**
- Usuario admin@trinity.com / Admin1234! (ADMIN, mustChangePassword: false)
- Usuario seller@trinity.com / Seller1234! (SELLER, mustChangePassword: false)
- Usuario cashier@trinity.com / Cashier1234! (CASHIER, mustChangePassword: false)
- CompanyConfig con bregaGlobalPct: 0 (sin exchangeRate — viene de tabla ExchangeRate)
- 2 cajas: Caja 1 (código "01"), Caja 2 (código "02")
- Almacén por defecto: "Almacén Principal"
- Métodos de pago: Efectivo USD, Efectivo Bs, Punto de Venta (con variantes Banesco/Mercantil/Provincial), Pago Movil (con variantes Banesco/Mercantil), Zelle, Transferencia, Cashea, Crediagro
- 5 categorías de prueba con subcategorías
- 3 marcas de prueba
- 2 proveedores de prueba
- 10 productos de prueba con precios calculados

#### Sesión 2 — Catálogo de Productos
**Backend:**
- CategoriesModule: CRUD con soporte árbol 2 niveles (parent/children)
- BrandsModule: CRUD simple
- SuppliersModule: CRUD completo con datos fiscales
- ProductsModule:
  - CRUD con todos los campos
  - Trigger PostgreSQL para searchVector al crear/actualizar
  - GET /products con filtros: categoryId, brandId, supplierId, search (full-text), lowStock, isActive
  - GET /products/search?q= — búsqueda rápida para POS (retorna top 20 resultados)
  - POST /products/import — importación masiva desde JSON
  - Recálculo automático de priceDetal y priceMayor al guardar

**Frontend:**
- Sección CATÁLOGO en sidebar: Productos, Categorías, Marcas, Proveedores
- Página /catalog/products: tabla con filtros, búsqueda, paginación
- Modal crear/editar producto con todos los campos
- Vista de precio calculado en tiempo real mientras se edita ganancia%
- Página /catalog/categories: árbol de categorías con subcategorías
- Página /catalog/brands y /catalog/suppliers

#### Sesión 3 — Inventario y Almacenes
**Backend:**
- WarehousesModule: CRUD
- StockModule:
  - GET /stock?warehouseId&productId — stock por almacén o global
  - GET /stock/low — productos bajo mínimo
  - POST /stock/adjust — ajuste manual (SUPERVISOR aprueba si es salida)
- TransfersModule:
  - POST /transfers — crear solicitud (WAREHOUSE)
  - PATCH /transfers/:id/approve — aprobar (SUPERVISOR)
  - PATCH /transfers/:id/cancel
- InventoryCountModule:
  - POST /inventory-counts — crear sesión de conteo
  - PATCH /inventory-counts/:id/items — ingresar cantidades contadas
  - GET /inventory-counts/:id/differences — ver diferencias
  - PATCH /inventory-counts/:id/approve — aprobar y ajustar stock (SUPERVISOR)
- StockMovementsModule: GET /stock-movements con filtros

**Frontend:**
- Sección INVENTARIO en sidebar: Stock, Ajustes, Transferencias, Conteo, Movimientos
- Vista de stock con columnas por almacén y total global
- Modal de ajuste con motivo y tipo (entrada/salida/corrección)
- Flujo de transferencia con estados visuales
- Página de conteo físico paso a paso
- Reporte valorizado al pie de la página de stock

#### Sesión 4 — Compras (rediseñado en Sesión 40 como Facturas de Compra)
**Backend:**
- PurchaseOrdersModule (ruta `/purchases`):
  - CRUD facturas de compra con numeración FC-XXXXX (correlativo SELECT FOR UPDATE)
  - Estados simplificados: PENDING → PROCESSED → CANCELLED
  - POST /purchases — crear factura con descuentos por línea, descuento global, recargos, totales fiscales precalculados
  - POST /purchases/:id/process — procesar: actualiza inventario, costos, precios, crea CxP si crédito
  - PATCH /purchases/:id/cancel — cancelar (solo PENDING)
  - GET /purchases/reorder-suggestions — productos bajo mínimo con historial
  - Campos fiscales precalculados: subtotal, exemptAmount, taxableBase, totalIva, totalSurcharge (USD + Bs)
  - Retenciones IVA (75% para agentes) e ISLR configurables

**Frontend:**
- Sección COMPRAS en sidebar: Facturas de compra, Sugerencias de reorden, Análisis ABC
- Lista de facturas con badges de estado y acciones
- Formulario nueva factura: grid 3×4 header, items con descuento por línea, footer fiscal, modal precios
- Detalle con 3 tabs: Información, CxP, Notas Cr/Db
- Libro de compras fiscal actualizado con campos precalculados

#### Sesión 45 — Página de Inicio Roles Secundarios
**Backend:**
- GET /dashboard/home — info rápida por rol: tasa BCV, cajas abiertas (CASHIER), low stock (WAREHOUSE/AUDITOR), CxP vencidas (BUYER), CxC/CxP totales (ACCOUNTANT)

**Frontend:**
- Página de inicio (/dashboard/home): saludo, badge de rol, tasa BCV, grid de 4 accesos directos por rol, info rápida por rol
- Redirección completa: ADMIN/SUPERVISOR → gerencial, SELLER → vendedor, resto → home

#### Sesión 44 — Dashboard del Vendedor
**Backend:**
- GET /dashboard/vendedor?from&to — datos exclusivos del vendedor actual (ventas, pendientes, devoluciones, top productos, timeline, CxC)
- Busca Seller vinculado al userId del JWT, retorna 404 si no tiene vendedor asignado

**Frontend:**
- Dashboard vendedor (/dashboard/seller): mobile-first, saludo personalizado, selector periodo, 4 tarjetas KPI, gráfico ventas, CxC, top 5 productos
- Redirección automática: SELLER → /dashboard/seller

#### Sesión 43 — Dashboard Gerencial
**Backend:**
- DashboardModule: Endpoint GET /dashboard/gerencial?from&to con datos agregados
  - Ventas, devoluciones, ventas por vendedor, top 5 productos, resumen de caja, gastos, CxC, CxP
  - Comparación automática vs período anterior (vsLastPeriod)
  - Timeline inteligente: por hora (día único) o por día (rango)
  - CxC/CxP siempre retorna datos actuales independiente del período

**Frontend:**
- Dashboard gerencial (/dashboard): selector de período, 4 KPIs con comparación, CxC/CxP tiempo real
- Gráficos recharts: AreaChart ventas, BarChart top productos, BarChart comparativo ingresos/gastos
- Tabla vendedores con barras de progreso, resumen de caja con desglose por método
- Skeleton loading, estado de error con reintento

#### Sesión 42 — Comprobantes de Retención IVA
**Backend:**
- RetentionVouchersModule: Gestión de comprobantes de retención IVA (modelo RetentionVoucher)
  - GET /retention-vouchers — lista con filtros status, supplierId, from, to, paginación
  - GET /retention-vouchers/:id — detalle con relaciones
  - PATCH /retention-vouchers/:id/issue — emitir comprobante (crea línea en libro de compras)
  - PATCH /retention-vouchers/:id/cancel — anular comprobante (elimina línea del libro)
  - GET /retention-vouchers/:id/pdf — datos para PDF
- PurchaseOrdersService.process(): crea RetentionVoucher PENDING para proveedores agentes de retención
- Libro de compras: líneas de retención (isRetentionLine) solo aparecen cuando el comprobante es ISSUED

**Frontend:**
- Página de retenciones IVA (/purchases/retentions): contadores, filtros, tabla, modales de emisión/detalle
- Detalle de compra: sección de retención con botones Emitir/Anular según estado
- Libro de compras: líneas de retención diferenciadas visualmente (fondo púrpura, sin datos repetidos)
- Sidebar: entrada "Retenciones IVA" bajo COMPRAS

#### Sesión 41 — Libro de Compras con entradas editables y filtro por rango de fechas
**Backend:**
- PurchaseBookModule: CRUD de entradas del libro de compras (modelo PurchaseBookEntry)
  - GET /purchase-book?from&to — lista entradas filtradas por rango de fechas
  - POST /purchase-book — crear entrada manual
  - PATCH /purchase-book/:id — editar entrada (no afecta factura original)
  - DELETE /purchase-book/:id — eliminar entrada (solo ADMIN)
  - GET /purchase-book/pdf?from&to — datos para PDF con resumen fiscal
- PurchaseOrdersService.process(): auto-crea PurchaseBookEntry al procesar factura fiscal
- FiscalService.libroCompras(): lee desde PurchaseBookEntry

**Frontend:**
- Libro de compras rediseñado: date pickers desde/hasta, botones rápidos (este mes, quincena 1/2, mes anterior)
- Tabla editable con badges AUTO/MANUAL, modal edición/creación, fila de totales
- PDF con tabla + segunda página de resumen fiscal del período

#### Sesión 49 — Libro de Ventas editable, ticket de devolución y correcciones fiscales
**Backend:**
- SalesBookModule: CRUD de entradas del libro de ventas (modelo SalesBookEntry)
  - GET /sales-book?from&to — lista entradas filtradas por rango de fechas
  - POST /sales-book — crear entrada manual
  - PATCH /sales-book/:id — editar entrada (no afecta factura original)
  - DELETE /sales-book/:id — eliminar entrada (solo ADMIN)
  - GET /sales-book/pdf?from&to — datos para PDF con resumen fiscal
- InvoicesService.pay(): auto-crea SalesBookEntry al pagar factura fiscal
- print-receipt.ts: buildReturnReceiptText() + printReturnReceipt() para devoluciones no fiscales

**Frontend:**
- Libro de ventas rediseñado: date pickers desde/hasta, botones rápidos (este mes, quincena 1/2, mes anterior)
- Tabla editable con badges AUTO/MANUAL, modal edición/creación, fila de totales, IGTF
- PDF con tabla + segunda página de resumen fiscal del período
- credit-debit-notes/[id]: ticket térmico para devoluciones no fiscales via Trinity Agent
- Botón "Imprimir Ticket" para reimpresión manual de devoluciones no fiscales

#### Sesión 50 — Retenciones de IVA en ventas (retenciones sufridas de clientes)
**Backend:**
- CustomerIvaRetentionsModule: retenciones de IVA que clientes contribuyentes especiales aplican a facturas de venta (modelo CustomerIvaRetention, correlativo RVC-XXXX)
  - POST /customer-iva-retentions — crear contra factura (valida serie fiscal, IVA > 0, tolerancia ±1 Bs vs % teórico, suma ≤ IVA de la factura); acepta comprobante inline para reintegros
  - GET /customer-iva-retentions?status&search&from&to — listado con filtros
  - GET /customer-iva-retentions/pending-count — contador para alertas
  - PATCH /:id/voucher — registra comprobante de 14 dígitos y crea la línea del libro de ventas (isRetentionLine, comprobante en notes)
  - PATCH /:id/cancel — anulación (solo ADMIN, solo no aplicadas; borra la línea del libro)
- Customer.isSpecialTaxpayer: marca clientes que retienen IVA
- InvoicesService.pay(): auto-crea la retención al facturar a crédito a cliente especial (serie fiscal, IVA > 0, % de CompanyConfig.ivaRetentionPct)
- ReceiptsService: retenciones de clientes como documento cruzable en recibos de cobro (sign -1, itemType SALES_IVA_RETENTION); al postear se marca appliedAt; recibo de cobro con total negativo + sesión de caja genera CashMovement EXPENSE (reintegro)
- SalesBookService: las líneas de retención no suman a los totales del libro (no son débito fiscal)

**Frontend:**
- POS: toggle "Contribuyente especial" junto al cliente (persistente, oculto para el cliente default)
- Recibos de cobro: retenciones cruzables (moradas, signo −), aviso de reintegro cuando el total es negativo
- Página /sales/customer-retentions: tabs por estado, alerta de comprobantes pendientes con días transcurridos (rojo > 7), registro de comprobante con tolerancia, creación manual para reintegros, anulación

**Flujos:** (1) crédito: retención auto-creada se cruza con la CxC en el recibo y se cobra el neto; (2) reintegro: cliente pagó completo, trae comprobante, se crea la retención y un recibo negativo saca el dinero de caja; (3) alerta para exigir comprobantes no entregados

#### Sesión 5 — Ventas y POS
**Backend:**
- CustomersModule: CRUD con crédito
- InvoicesModule:
  - POST /invoices — crear pre-factura (SELLER) o factura directa (CASHIER/ADMIN)
  - PATCH /invoices/:id/approve — CASHIER toma pre-factura y cobra
  - POST /invoices/:id/pay — registrar pago (usa methodId en vez de enum):
    - Si paymentMethod.createsReceivable → crea CxC a la plataforma
    - Si isCredit → requiere creditAuthPassword, crea CxC al cliente
    - Descuenta stock automáticamente
    - Crea StockMovements tipo SALE
  - GET /invoices/pending — pre-facturas esperando cobro
  - PDF generation endpoint

**Frontend:**
- Sección VENTAS: Pre-facturas, Facturas, POS
- POS page: búsqueda rápida de productos (full-text + barcode scanner)
- Lista de pre-facturas pendientes para el cajero
- Modal de cobro con múltiples métodos de pago
- Modal de crédito con campo de clave de autorización
- Generación e impresión de PDF

#### Sesión 5b — Importación masiva de productos y corrección de códigos
**Backend:**
- Migración: agregar modelo PrintArea, agregar campos code, lastProductNumber, printAreaId a Category
- CRUD de PrintArea: GET/POST/PATCH/DELETE /print-areas
- Actualizar ProductsModule para generar código con formato categoryCode+correlativo5digits usando SELECT FOR UPDATE
- Migrar productos existentes: reasignar códigos PROD-001 al nuevo formato según su categoría
- POST /products/import — importación masiva desde JSON con campos completos:
  code (opcional, si no viene se auto-genera), barcode, supplierRef, name, description,
  category (busca por nombre o crea), subcategory, brand, supplier, purchaseUnit, saleUnit,
  conversionFactor, costUsd, gananciaPct, gananciaMayorPct, ivaType, minStock, bregaApplies
- Endpoint POST /products/import/validate — valida sin insertar, retorna preview de creados/saltados/errores

**Frontend:**
- Página /settings/print-areas — CRUD de áreas de impresión con nombre y descripción
- En modal de categorías: agregar campos código (3 letras, validación única) y selector de área de impresión
- Página /import — importación masiva con zona drag&drop, textarea para pegar JSON, botón Validar y botón Importar
- Reporte de resultado: creados, saltados (ya existían), errores con detalle

#### Sesión 5c — Ajuste masivo de precios ✅
**Backend:**
- GET /products/price-adjustment?categoryId&subcategoryId&brandId&supplierId&costMin&costMax — lista productos con filtros combinables, retorna id, code, name, costUsd, gananciaPct, gananciaMayorPct, priceDetal, priceMayor
- POST /products/price-adjustment — aplicar cambio masivo:
  - Body: filters (mismos que GET) + adjustmentType (REPLACE o ADD_SUBTRACT) + gananciaPct? + gananciaMayorPct?
  - REPLACE: reemplaza el porcentaje con el valor nuevo
  - ADD_SUBTRACT: suma o resta al porcentaje existente (puede ser negativo)
  - Recalcula priceDetal y priceMayor de todos los productos afectados
  - Crea registro en PriceAdjustmentLog para auditoría
  - Todo en transacción Prisma

Agregar modelo al schema:
```prisma
model PriceAdjustmentLog {
  id                String   @id @default(cuid())
  filters           Json     // los filtros aplicados
  adjustmentType    String   // REPLACE o ADD_SUBTRACT
  gananciaPct       Float?
  gananciaMayorPct  Float?
  productsAffected  Int
  createdById       String
  createdAt         DateTime @default(now())
}
```

**Frontend:**
- Página /catalog/price-adjustment — herramienta de ajuste masivo:
  - Panel de filtros: categoría, subcategoría, marca, proveedor, rango de costo
  - Botón "Ver productos afectados" → tabla preview con productos que serán modificados
  - Panel de ajuste: toggle REPLACE o SUMAR/RESTAR, campos ganancia detal% y mayor%
  - Preview en tiempo real del nuevo precio calculado en la tabla
  - Botón "Aplicar cambio" con modal de confirmación: "Se modificarán X productos. ¿Confirmar?"
  - Historial de ajustes masivos anteriores

#### Sesión 6d — Estados de factura en español y eliminación de pendientes
**Backend:**
- Cancel solo PENDING/DRAFT; PAID retorna 400 con mensaje de nota de crédito
- DELETE /invoices/:id para hard-delete de PENDING/DRAFT
- TODO: facturas PAID se cancelarán via Notas de Crédito

**Frontend:**
- Labels en español: En Espera, Procesado, Crédito, Cancelado
- Colores: amarillo, verde, azul, rojo
- Botón eliminar para pendientes, sin botón cancelar para pagadas

#### Sesión 7 — Cotizaciones ✅
**Backend:**
- QuotationsModule: CRUD completo con numeración COT-XXXX
- Conversión cotización → factura (obtiene tasa del día, crea factura con items)
- QuotationPdfService: PDF con pdfkit (header, items, IVA, totales)
- QuotationsCronService: cron diario — expira cotizaciones vencidas, cancela facturas PENDING de días anteriores
- ScheduleModule (@nestjs/schedule) para cron jobs

**Schema:**
```prisma
enum QuotationStatus {
  DRAFT SENT APPROVED REJECTED EXPIRED
}

model Quotation {
  id                  String          @id @default(cuid())
  number              String          @unique  // COT-0001
  customerId          String?
  customer            Customer?       @relation(...)
  status              QuotationStatus @default(DRAFT)
  subtotalUsd         Float           @default(0)
  ivaUsd              Float           @default(0)
  totalUsd            Float           @default(0)
  notes               String?
  expiresAt           DateTime
  convertedToInvoiceId String?
  items               QuotationItem[]
  createdById         String
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
}

model QuotationItem {
  id            String    @id @default(cuid())
  quotationId   String
  quotation     Quotation @relation(..., onDelete: Cascade)
  productId     String
  productName   String
  productCode   String
  quantity      Float
  unitPriceUsd  Float
  ivaType       IvaType
  ivaAmount     Float     @default(0)
  totalUsd      Float
}
```

**Frontend:**
- Página /quotations: tabla con filtros, modal detalle, acciones por estado, conversión a factura, PDF
- POS: botón "Guardar cotización" (FileCheck) para todos los roles
- Config: campo quotationValidityDays (días de validez)
- Sidebar: sección COTIZACIONES

---

### FASE 2 — Operaciones Completas

#### Sesión 6 — Caja y Arqueo ✅
#### Sesión 7 — CxC (Cuentas por Cobrar) ✅
#### Sesión 8 — CxP (Cuentas por Pagar) ✅
#### Sesión 9 — Documentos Fiscales Venezolanos ✅
#### Sesión 10 — Despachos
#### Sesión 11 — Dashboard Directivos ✅ (Sesión 43)
#### Sesión 12 — Gestión de Usuarios y Menú Colapsable ✅
#### Sesión 12b — Permisos por Rol Configurables desde UI con Redis Cache ✅

*(Detalle completo se define antes de cada sesión)*

---

### FASE 3 — Inteligencia de Negocio

#### Sesión 13 — Despliegue en DigitalOcean ✅
#### Sesión 14 — IGTF y Estandarización de Montos en Bs ✅
#### Sesión 15 — UX Correctiva: Paginas dedicadas con Tabs ✅
#### Sesión 16 — Lazy Loading Tabs + Montos Bs estandarizados ✅
#### Sesión 26 — Recibos de Cobro/Pago con Diferencial Cambiario ✅
#### Sesión 35 — Manejo de vuelto en pagos USD ✅

---

### FASE 4 — Automatización IA

#### Sesión 19 — Carga de Facturas por Foto/PDF con Claude Vision
#### Sesiones 20-22 — Por definir

---

### FASE 5 — Expansión
- Tienda online
- Chatbot WhatsApp
- CRM

#### Sesión 46 — POS Mobile-first y vistas responsive ✅
- POS mobile con dos vistas (busqueda/carrito) en mismo URL, deteccion <768px
- Bottom navigation mobile con links por rol (SELLER/CASHIER/ADMIN/SUPERVISOR)
- Listas de facturas, cotizaciones y clientes con cards en mobile
- Modales full-screen en mobile, centrados en desktop
- Layout responsive con padding adaptativo

### FASE 6 — Integraciones de Hardware y POS Avanzado
- **POS Electron + Máquina Fiscal:** Migrar el POS a Electron para acceso nativo a puertos COM. El agente Electron se comunica con la máquina fiscal por puerto COM, recibe el número fiscal y lo guarda en Invoice.fiscalNumber. También habilita modo offline con sincronización posterior
- **Agente local COM (fase previa a Electron):** Pequeño programa instalado en cada PC de caja que actúa como puente WebSocket entre el navegador y el puerto COM de la máquina fiscal
- Las devoluciones siempre deben procesarse en la misma caja/máquina fiscal que emitió la factura original

---

## Decisiones Técnicas Importantes

**Precios:** Siempre en USD en la DB. Se muestran en USD y Bs. A partir de Sesion 14 se guardan montos en Bs en Invoice, InvoiceItem y Payment para precision historica (tasa del dia de la factura).

**Tasa de cambio BCV:**
- Se guarda en tabla `ExchangeRate` — una entrada por día con su fecha
- `CompanyConfig` NO tiene campo `exchangeRate` — siempre se consulta la tabla
- Al abrir el sistema, si no existe tasa para hoy → banner prominente bloqueante: "No hay tasa BCV registrada para hoy. Ingresa la tasa antes de facturar"
- Solo ADMIN puede registrar o editar tasas
- Fuente: scraping de bcv.org.ve o ingreso manual

**Reglas de uso de tasa en documentos:**
- **Facturas de venta:** tasa del día actual al momento de crear. No se puede cambiar fecha ni tasa. Se guarda en el campo `exchangeRate` de la factura y es inmutable
- **Órdenes de compra:** el usuario puede cambiar la fecha (para registrar facturas de días anteriores). Al cambiar la fecha el sistema busca automáticamente la tasa de ese día en `ExchangeRate`. Si no existe tasa para esa fecha → aviso: "No hay tasa registrada para el día seleccionado. Ingresa la tasa primero"
- **Reportes históricos:** cada documento usa su propia tasa guardada, nunca recalculan con tasa actual
- **Vista en tiempo real (precios, stock valorizado):** usa la tasa del día actual

**Búsqueda:** PostgreSQL tsvector con trigger automático. Búsqueda por nombre, código, barcode, referencia proveedor.

**Plataformas de financiamiento (Cashea/Crediagro):** Son métodos de pago con `createsReceivable: true` en la tabla PaymentMethod. Al cobrar con ellos se crea CxC automáticamente. Para agregar nuevas plataformas basta crear un nuevo método con ese flag activado desde /settings/payment-methods.

**Crédito a clientes:** Requiere `creditAuthPassword` (bcrypt). Al aprobar → crea CxC, descuenta cupo.

**Transferencias:** WAREHOUSE crea → SUPERVISOR aprueba → stock se mueve en transacción Prisma.

**Conteo físico:** Sesión de conteo con diferencias. SUPERVISOR aprueba → ajuste automático con StockMovement tipo COUNT_ADJUST.

**Fechas:** Siempre `setUTCHours` para rangos de fecha en queries.

**Numeración de documentos por Serie:** Formato `VTA-26-00000001`:
- `VTA` = prefijo de la Serie (configurable por serie: VTA, NE, VF, etc.)
- `26` = año de emisión (2 dígitos, solo informativo)
- `00000001` = correlativo de 8 dígitos en `Serie.lastNumber`, nunca reinicia, continuo de por vida de la serie
- El incremento usa `SELECT FOR UPDATE` en transacción Prisma para evitar duplicados en concurrencia
- Cada serie tiene su secuencia independiente
- Las notas de crédito/débito de venta heredan la serie de la factura padre
- Campo `fiscalNumber` separado en Invoice para el número de impresora fiscal

**Serie:** Centraliza la configuración de documentos fiscales:
- `isFiscal`: determina si los documentos se imprimen por la máquina fiscal y van al libro de ventas
- `isVatExempt`: si es true, fuerza IVA 0% en todos los items del documento independientemente de la configuración del producto
- `lastNumber`: correlativo compartido por todos los documentos de esa serie
- Relación 1:1 con CashRegister — una caja solo puede tener una serie
- Series actuales: Serie NE (no fiscal, Caja Notas), Serie VTA (fiscal, Fiscal 1), Serie VF (fiscal, Fiscal 2)

**PDF:** @react-pdf/renderer para facturas A4 y formato 80mm.

**Reglas de cajas (CashRegister):**
- Cualquier usuario puede abrir sesion en cualquier caja activa que no tenga sesion abierta
- Una caja solo puede tener UNA sesion OPEN a la vez
- Cajas con `isShared: true` aparecen disponibles para todos los usuarios en el POS
- Una caja debe tener una Serie vinculada para poder crear facturas
- La configuracion fiscal (isFiscal) se obtiene de la Serie, no de la caja directamente
- Cajas con `isShared: false` (exclusivas) solo aparecen para quien abrio la sesion
- En el POS: GET /cash-registers/available retorna cajas donde el usuario tiene sesion + cajas compartidas abiertas
- SELLER no ve selector de caja ni boton cobrar en POS, solo puede guardar pre-facturas
- El arqueo de cierre compara conteo fisico (USD/Bs) vs esperado (fondo apertura + ventas)
- Las devoluciones deben hacerse en la misma caja que emitio la factura original (preparacion para maquina fiscal)

**Códigos de productos por categoría:**
- Formato:  — ejemplo HER00001, HER00002, PLO00001
- El código de categoría son 3 letras configurables por el usuario al crear la categoría
- El correlativo es independiente por categoría — cada una empieza en 00001
- Se incrementa con  en transacción Prisma para evitar duplicados
- Al migrar los códigos PROD-001 existentes → reasignar según categoría del producto en Sesión 5b

**Áreas de impresión (PrintArea):**
- Modelo  configurable — el cliente puede crear las que necesite (actualmente 2: Despacho Interno y Despacho Externo)
- Cada categoría tiene asignada UNA sola área de impresión
- Al cobrar una factura → el sistema agrupa los items por área de impresión de su categoría → imprime automáticamente una orden por área
- Formato de la orden (ticket 80mm): código del producto, código del proveedor (supplierRef), descripción, cantidad
- Si una categoría no tiene área asignada → no imprime nada para esos items
- La impresión es automática al procesar el pago de la factura

**Códigos de productos por categoría:**
- Formato: categoryCode + correlativo de 5 dígitos — ejemplo HER00001, HER00002, PLO00001
- El código de categoría son 3 letras configurables por el usuario al crear la categoría
- El correlativo es independiente por categoría — cada una empieza en 00001
- Se incrementa con SELECT FOR UPDATE en transacción Prisma para evitar duplicados
- Al migrar los códigos PROD-001 existentes: reasignar según categoría del producto en Sesión 5b

**Áreas de impresión (PrintArea):**
- Modelo PrintArea configurable — el cliente puede crear las que necesite (actualmente 2: Despacho Interno y Despacho Externo)
- Cada categoría tiene asignada UNA sola área de impresión
- Al cobrar una factura: el sistema agrupa los items por área de impresión de su categoría e imprime automáticamente una orden por área
- Formato de la orden (ticket 80mm): código del producto, código del proveedor (supplierRef), descripción, cantidad
- Si una categoría no tiene área asignada: no imprime nada para esos items
- La impresión es automática al procesar el pago de la factura

**Máquinas fiscales — Integración directa por Web Serial:**
- Comunicación directa desde el navegador (Chrome/Edge) con la impresora fiscal via Web Serial API
- Protocolo: The Factory HKA, RS232 9600/8/even/1, flujo STX+DATA+ETX+LRC
- Al conectar: detecta modelo automáticamente (SV) e identifica familia A o B
- Antes de cada operación: polling con ENQ para verificar estado y detectar errores (sin papel, memoria llena, etc.)
- Después de imprimir factura o NC: lee S1 para obtener número fiscal, serial y RIF directamente del puerto
- Validación LRC en todas las tramas recibidas con reintento automático
- Modelos soportados: HKA80 (Z7C), HKA112 (Z7A), SRP-270/280/350/812, HSP7000, TALLY1125/1140, DT-230, P3100DL, PP9/PP9-PLUS
- Familia A: soporta facturas, notas de crédito y notas de débito
- Familia B: soporta facturas y notas de crédito (NO notas de débito)
- Trinity Agent (puerto 8765) ahora solo se usa para tickets térmicos 80mm, no para lectura fiscal
- Campo fiscalNumber en Invoice almacena el número devuelto por la máquina fiscal

---

**Claves Dinamicas de Autorizacion (DynamicKeysModule):**
- Modelos: DynamicKey (keyHash bcrypt, isActive), DynamicKeyPermission (enum DynamicKeyPerm), DynamicKeyLog (audit trail)
- 14 permisos configurables: eliminar NC/ND venta/compra, eliminar recibo cobro/pago, eliminar gasto, modificar precio, anular sesion caja, cambiar tasa, ajuste inventario, dar descuento, facturar a credito, movimiento manual caja
- CRUD de claves solo ADMIN, validacion abierta a autenticados
- Validacion: itera claves activas, bcrypt.compare, verifica permiso, crea log con entityType/entityId/action
- Componente reutilizable DynamicKeyModal: campo password, llama POST /dynamic-keys/validate, ejecuta callback si autorizado
- Integrado en: anular notas credito/debito, cancelar recibos cobro/pago, eliminar gastos, movimientos manuales de caja
- Frontend: /settings/dynamic-keys (gestion), /settings/dynamic-keys/[id]/logs (historial)
- Sidebar: bajo CONFIGURACION

---

**Movimientos Manuales de Caja (CashMovementsModule):**
- Modelo: CashMovement (tipo INCOME/EXPENSE, montos duales USD/Bs, isManual, relacion opcional a Expense)
- Requiere clave dinamica con permiso MANUAL_CASH_MOVEMENT para crear movimientos manuales
- Valida sesion abierta y tasa de cambio del dia
- Se integra al resumen de sesion: ingresos/egresos manuales + egresos por gastos = balance neto
- Frontend: boton "Movimiento manual" en sesion de caja, modal con tipo/monto/razon/clave
- Badges en lista de movimientos: MANUAL (amarillo), GASTO (naranja)

---

**Control de Gastos (ExpensesModule):**
- Modelos: ExpenseCategory (10 predefinidas), Expense (con campos opcionales cashSessionId, methodId)
- CRUD de categorías (solo ADMIN)
- CRUD de gastos con conversión automática USD↔Bs usando tasa del día
- Gastos pueden vincularse a sesion de caja abierta: crea CashMovement de tipo EXPENSE automaticamente
- Resumen por período: totalUsd, totalBs, byCategory (name, totalUsd, count), byMonth
- Permiso granular: MANAGE_EXPENSES (ADMIN y SUPERVISOR por defecto)
- Frontend: /expenses (lista + grafico recharts + modal con tabs Info/Pago desde caja), /expenses/categories (admin)
- Sidebar: sección GASTOS entre CxP y FISCAL

---

**Programación de Pagos (PaymentSchedulesModule):**
- Modelos: PaymentSchedule (PSC-0001), PaymentScheduleItem
- Estados: DRAFT → APPROVED → EXECUTED | CANCELLED
- Presupuesto opcional en USD o Bs con conversión automática
- Items: CxP (PENDING/PARTIAL) y NDC (POSTED sin aplicar)
- Agrupación por proveedor con subtotales
- Validación: monto planificado ≤ saldo pendiente, presupuesto excedido
- PDF A4 con agrupación por proveedor, presupuesto vs total, gran total
- Solo ADMIN/SUPERVISOR pueden aprobar y ejecutar
- Frontend: /payment-schedules (lista), /payment-schedules/new (crear), /payment-schedules/[id] (detalle con panel agregar)
- Sidebar: bajo CxP

---

**Manejo de Vuelto en Pagos USD:**
- Cuando el cliente paga con USD (métodos isDivisa=true) y el monto excede el total de la factura, el sistema calcula el vuelto en Bs automáticamente
- changeUsd = totalPaidDivisaUsd - totalFactura, changeBs = changeUsd × exchangeRate
- El cajero debe seleccionar un método de vuelto (solo métodos isDivisa=false: Efectivo Bs, Pago Móvil, etc.)
- Se guarda en Invoice: totalPaidUsd (total real recibido en USD) y changeBs (vuelto dado en Bs)
- Se guarda en Payment: changeAmountBs y changeMethodId en el primer pago en divisas
- El vuelto aparece en el arqueo de caja como egreso con descripción del número de factura
- No se crea un registro separado de movimiento de caja — se trackea directamente en Payment y se agrega al summary

---

#### Sesión 47 — Módulo completo de reportes de ventas con PDF

**ReportsModule (Backend):**
- 9 endpoints GET de reportes: sales-by-period, sales-by-seller, sales-by-customer, sales-by-product, comparison, profit-margin, top-customers, peak-hours, sales-by-cash-register
- 5 endpoints de PDF export (landscape A4, tablas formateadas, header con empresa)
- Agrupación temporal (hora/día/semana/mes), filtros por vendedor/cliente/categoría
- Comparativo entre 2 períodos con variación % y totales
- Cálculo de margen de ganancia por producto (ventas - costo)
- Horas pico con distribución 24h y top 3 horas destacadas
- Ventas por caja con desglose de métodos de pago

**Frontend (9 páginas):**
- /reports/sales-period — AreaChart + tabla + KPIs + PDF
- /reports/sales-seller — BarChart + dropdown vendedor + PDF
- /reports/sales-customer — Tabla ordenable + CxC + PDF
- /reports/sales-product — BarChart horizontal + margen coloreado + PDF
- /reports/comparison — 2 períodos + BarChart comparativo + variación %
- /reports/profit-margin — BarChart margen + celdas color-coded + PDF
- /reports/top-customers — Tabla rankeada + selector límite
- /reports/peak-hours — BarChart 24h + horas pico verdes
- /reports/sales-cash — BarChart por caja + badges métodos de pago
- Sidebar: 9 nuevos items bajo sección REPORTES
- Gráficos recharts con tema oscuro

---

## Formato de Commits
`tipo: Session X - descripción`

---

## Credenciales Iniciales
- Admin: admin@trinity.com / Admin1234!
- Vendedor: seller@trinity.com / Seller1234!
- Cajero: cashier@trinity.com / Cashier1234!

---

## Backlog — Sesiones Futuras

### PDFs / Reportes Fiscales Pendientes
Los siguientes documentos fiscales necesitan PDF de reporte. Requieren aprobación del contador antes de implementar. Usar como referencia los documentos de Wensoft que el usuario proporcionará.

- [ ] **Nota de Crédito (Compras)** — PDF fiscal para notas de crédito de proveedores
- [ ] **Nota de Débito (Compras)** — PDF fiscal para notas de débito de proveedores
- [ ] **Nota de Crédito (Ventas)** — PDF fiscal para notas de crédito a clientes
- [ ] **Nota de Débito (Ventas)** — PDF fiscal para notas de débito a clientes
- [ ] **Retención ISLR** — Comprobante de retención de impuesto sobre la renta

### Libros Fiscales
- [ ] **Libro de Compras** — Reporte fiscal obligatorio con todas las compras del período
- [ ] **Libro de Ventas** — Reporte fiscal obligatorio con todas las ventas del período
  - Debe incluir **formato detallado** (desglose por factura)
  - Debe incluir **Reportes Z** (resumen de ventas por caja/día)