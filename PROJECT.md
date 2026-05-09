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
- Solo ADMIN puede sobreescribir el precio final calculado
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
  id                    String   @id @default("singleton")
  companyName           String   @default("Trinity")
  rif                   String?
  address               String?
  phone                 String?
  email                 String?
  exchangeRate          Float    @default(0)
  exchangeRateUpdatedAt DateTime?
  bregaGlobalPct        Float    @default(0)
  defaultWarehouseId    String?
  invoicePrefix         String   @default("0001-")
  creditAuthPassword    String?
  updatedAt             DateTime @updatedAt
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
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}

enum UserRole {
  ADMIN SUPERVISOR CASHIER SELLER WAREHOUSE BUYER ACCOUNTANT
}

model Category {
  id          String     @id @default(cuid())
  name        String
  parentId    String?
  parent      Category?  @relation("SubCategories", fields: [parentId], references: [id])
  children    Category[] @relation("SubCategories")
  products    Product[]
  createdAt   DateTime   @default(now())
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
  code             String    @unique  // auto-generado
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
  rif          String?
  phone        String?
  email        String?
  address      String?
  type         CustomerType @default(NATURAL)
  creditLimit  Float     @default(0)   // cupo en USD
  creditDays   Int       @default(0)
  isActive     Boolean   @default(true)
  invoices     Invoice[]
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

enum CustomerType { NATURAL JURIDICA }

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
  sellerId        String?       // vendedor que creó la pre-factura
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
}

enum InvoiceStatus { DRAFT PENDING PAID PARTIAL CREDIT CANCELLED }
enum InvoiceType   { SALE DEBIT_NOTE CREDIT_NOTE }

model InvoiceItem {
  id          String  @id @default(cuid())
  invoiceId   String
  invoice     Invoice @relation(...)
  productId   String
  productName String  // snapshot del nombre
  quantity    Float
  unitPrice   Float   // precio al momento de la venta en USD
  ivaType     IvaType
  ivaAmount   Float
  totalUsd    Float
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
- CompanyConfig con exchangeRate: 0 y bregaGlobalPct: 0
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

---

### FASE 2 — Operaciones Completas

#### Sesión 6 — Caja y Arqueo
#### Sesión 7 — CxC (Cuentas por Cobrar)
#### Sesión 8 — CxP (Cuentas por Pagar)
#### Sesión 9 — Documentos Fiscales Venezolanos
#### Sesión 10 — Despachos
#### Sesión 11 — Dashboard Directivos
#### Sesión 12 — Dashboard Vendedores

*(Detalle completo se define antes de cada sesión)*

---

### FASE 3 — Inteligencia de Negocio

#### Sesión 13 — Análisis de Rotación ABC
#### Sesión 14 — Reportes Avanzados y Exportación
#### Sesiones 15-18 — Por definir

---

### FASE 4 — Automatización IA

#### Sesión 19 — Carga de Facturas por Foto/PDF con Claude Vision
#### Sesiones 20-22 — Por definir

---

### FASE 5 — Expansión
- Tienda online
- Chatbot WhatsApp
- POS offline (PWA)
- CRM

---

## Decisiones Técnicas Importantes

**Precios:** Siempre en USD en la DB. Se muestran en USD y Bs. Nunca se guarda Bs en la DB.

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

---

## Formato de Commits
`tipo: Session X - descripción`

---

## Credenciales Iniciales
- Admin: admin@trinity.com / Admin1234!
- Vendedor: seller@trinity.com / Seller1234!
- Cajero: cashier@trinity.com / Cashier1234!
