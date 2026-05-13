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
  ADMIN SUPERVISOR CASHIER SELLER WAREHOUSE BUYER ACCOUNTANT
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
  id          String              @id @default(cuid())
  number      String              @unique  // PO-0001
  supplierId  String
  supplier    Supplier            @relation(...)
  status      PurchaseStatus      @default(DRAFT)
  totalUsd    Float               @default(0)
  notes       String?
  receivedAt  DateTime?
  items       PurchaseOrderItem[]
  createdById String
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
}

enum PurchaseStatus {
  DRAFT SENT PARTIAL RECEIVED CANCELLED
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

model CashRegister {
  id              String    @id @default(cuid())
  code            String    @unique  // "01", "02", etc. — 2 dígitos
  name            String            // "Caja 1", "Caja Principal", etc.
  lastInvoiceNumber Int     @default(0)  // contador de 8 dígitos, nunca reinicia
  isActive        Boolean   @default(true)
  currentUserId   String?           // cajero activo en este turno
  openedAt        DateTime?
  invoices        Invoice[]
  sessions        CashSession[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model CashSession {
  id              String        @id @default(cuid())
  cashRegisterId  String
  cashRegister    CashRegister  @relation(...)
  userId          String
  openingBalance  Float         @default(0)
  closingBalance  Float?
  status          SessionStatus @default(OPEN)
  notes           String?
  openedAt        DateTime      @default(now())
  closedAt        DateTime?
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
  status          InvoiceStatus @default(DRAFT)
  type            InvoiceType   @default(SALE)
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

enum InvoiceStatus { DRAFT PENDING PAID PARTIAL CREDIT CANCELLED }
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

model Payment {
  id          String        @id @default(cuid())
  invoiceId   String
  invoice     Invoice       @relation(...)
  method      PaymentMethod
  amountUsd   Float
  amountBs    Float
  exchangeRate Float
  reference   String?
  createdAt   DateTime      @default(now())
}

enum PaymentMethod {
  CASH_USD CASH_BS PUNTO_DE_VENTA PAGO_MOVIL ZELLE
  TRANSFERENCIA CASHEA CREDIAGRO
}
```

**Seed datos iniciales:**
- Usuario admin@trinity.com / Admin1234! (ADMIN, mustChangePassword: false)
- Usuario seller@trinity.com / Seller1234! (SELLER, mustChangePassword: false)
- Usuario cashier@trinity.com / Cashier1234! (CASHIER, mustChangePassword: false)
- CompanyConfig con bregaGlobalPct: 0 (sin exchangeRate — viene de tabla ExchangeRate)
- 2 cajas: Caja 1 (código "01"), Caja 2 (código "02")
- Almacén por defecto: "Almacén Principal"
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

#### Sesión 4 — Compras
**Backend:**
- PurchaseOrdersModule:
  - CRUD órdenes de compra con numeración PO-0001
  - PATCH /purchase-orders/:id/receive — recibir orden:
    1. Actualiza stock en almacén seleccionado
    2. Actualiza costUsd del producto
    3. Recalcula priceDetal y priceMayor automáticamente
    4. Crea StockMovements tipo PURCHASE
  - GET /purchase-orders/reorder-suggestions — productos bajo mínimo con historial

**Frontend:**
- Sección COMPRAS en sidebar: Órdenes de compra, Sugerencias de reorden
- Tabla de órdenes con estados y filtros
- Modal crear orden: selector proveedor, items con búsqueda de producto
- Vista de recepción: confirmar cantidades recibidas por item
- Página de sugerencias de reorden

#### Sesión 5 — Ventas y POS
**Backend:**
- CustomersModule: CRUD con crédito
- InvoicesModule:
  - POST /invoices — crear pre-factura (SELLER) o factura directa (CASHIER/ADMIN)
  - PATCH /invoices/:id/approve — CASHIER toma pre-factura y cobra
  - POST /invoices/:id/pay — registrar pago:
    - Si Cashea/Crediagro → crea CxC a la plataforma
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
#### Sesión 11 — Dashboard Directivos
#### Sesión 12 — Gestión de Usuarios y Menú Colapsable ✅
#### Sesión 12b — Permisos por Rol Configurables desde UI con Redis Cache ✅

*(Detalle completo se define antes de cada sesión)*

---

### FASE 3 — Inteligencia de Negocio

#### Sesión 13 — Despliegue en DigitalOcean ✅
#### Sesión 14 — IGTF y Estandarización de Montos en Bs ✅
#### Sesión 15 — UX Correctiva: Paginas dedicadas con Tabs ✅
#### Sesiones 16-18 — Por definir

---

### FASE 4 — Automatización IA

#### Sesión 19 — Carga de Facturas por Foto/PDF con Claude Vision
#### Sesiones 20-22 — Por definir

---

### FASE 5 — Expansión
- Tienda online
- Chatbot WhatsApp
- CRM

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

**Cashea/Crediagro:** Son `PaymentMethod` especiales. Al cobrar con ellos se crea CxC a la plataforma. La estructura permite agregar nuevas plataformas sin cambiar código.

**Crédito a clientes:** Requiere `creditAuthPassword` (bcrypt). Al aprobar → crea CxC, descuenta cupo.

**Transferencias:** WAREHOUSE crea → SUPERVISOR aprueba → stock se mueve en transacción Prisma.

**Conteo físico:** Sesión de conteo con diferencias. SUPERVISOR aprueba → ajuste automático con StockMovement tipo COUNT_ADJUST.

**Fechas:** Siempre `setUTCHours` para rangos de fecha en queries.

**Numeración de facturas por caja:** Formato `FAC-01-26-00000001`:
- `FAC` = prefijo configurable en CompanyConfig
- `01` = código de 2 dígitos de la caja (`CashRegister.code`)
- `26` = año de emisión (2 dígitos, solo informativo)
- `00000001` = correlativo de 8 dígitos en `CashRegister.lastInvoiceNumber`, nunca reinicia, continuo de por vida de la caja
- El incremento usa `SELECT FOR UPDATE` en transacción Prisma para evitar duplicados en concurrencia
- Cada caja tiene su secuencia independiente
- Campo `fiscalNumber` separado en Invoice para el número de impresora fiscal

**PDF:** @react-pdf/renderer para facturas A4 y formato 80mm.

**Reglas de cajas (CashRegister):**
- Un cajero puede abrir turno en cualquier caja que esté disponible (sin turno activo)
- Dos cajeros pueden trabajar en la misma caja simultáneamente (cajas compartidas)
- Una caja puede tener múltiples sesiones activas al mismo tiempo
- Un cajero en el POS y en el historial solo ve las facturas de la caja donde tiene turno activo
- ADMIN y SUPERVISOR pueden ver facturas de todas las cajas
- Las devoluciones deben hacerse en la misma caja que emitió la factura original (preparación para máquina fiscal)
- En el futuro cada cajero tendrá su caja individual exclusiva — el modelo ya lo soporta

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

**Máquinas fiscales y puertos COM:**
- El navegador web no puede acceder a puertos COM directamente
- Solución fase 1: agente local instalado en la PC de caja, actúa como puente WebSocket entre el navegador y el puerto COM
- Solución fase 2 (FASE 6): migrar POS a Electron para acceso nativo a COM y modo offline
- Campo fiscalNumber en Invoice reservado para el número que devuelva la máquina fiscal

---

## Formato de Commits
`tipo: Session X - descripción`

---

## Credenciales Iniciales
- Admin: admin@trinity.com / Admin1234!
- Vendedor: seller@trinity.com / Seller1234!
- Cajero: cashier@trinity.com / Cashier1234!