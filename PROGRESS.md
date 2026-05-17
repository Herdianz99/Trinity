# Trinity ERP — Progreso

## Sesion 33 — Cliente por defecto, notas en recibos y saldo a favor (Completada)

### Migracion de base de datos
- `20260516250000_add_missing_tables`: Crea tablas faltantes (CreditDebitNote, CreditDebitNoteItem, PrintArea, PrintJob, PriceAdjustmentLog) que existian via db push pero sin migracion
- `20260517200000_add_default_customer_config`: Agrega `isDefault` a Customer y `defaultCustomerId` a CompanyConfig

### Schema
- Customer: nuevo campo `isDefault Boolean @default(false)`
- CompanyConfig: nuevo campo `defaultCustomerId String?`

### Backend (NestJS)
- **InvoicesService.create()**: Auto-asigna `defaultCustomerId` de CompanyConfig cuando no se proporciona cliente
- **InvoicesService.pay()**: Soporte para metodo `pm_saldo_favor` — consume NCV (notas de credito venta) no aplicadas del cliente, marcando `appliedAt`
- **CustomersService.getCreditBalance()**: Nuevo metodo que calcula saldo a favor del cliente basado en NCV POSTED sin aplicar
- **CustomersController**: Nuevo endpoint `GET /customers/:id/credit-balance`
- **UpdateCompanyConfigDto**: Nuevo campo `defaultCustomerId?: string | null`

### Frontend (Next.js)
- **Config page** (`/config`):
  - Nueva seccion "Cliente por defecto" con combobox de busqueda
  - Muestra cliente seleccionado con badge verde
  - Busqueda con debounce y dropdown de resultados
  - Guarda `defaultCustomerId` en CompanyConfig
- **Receipts** (`/receipts/new`):
  - Fix: NCV/NDV ahora aparecen en documentos pendientes al crear recibo
  - Merge de `json.notes` con `json.receivables` en fetchPendingDocs
  - Correccion de logica de signo para notas (NCV=-1, NDV=+1)
  - Inclusion de `creditDebitNoteId` en payload de creacion
- **POS** (`/sales/pos`):
  - Fetch automatico de saldo a favor al seleccionar cliente
  - Badge verde junto al nombre del cliente mostrando saldo disponible
  - Banner en modal de pago con boton "Usar saldo" que agrega pago tipo `pm_saldo_favor`
  - Monto auto-calculado como minimo entre saldo y monto pendiente

### Seed
- Nuevo cliente por defecto: `***CLIENTE FINAL***` (isDefault: true)
- CompanyConfig actualizado con `defaultCustomerId`
- Nuevo metodo de pago: "Saldo a Favor" (id: `pm_saldo_favor`, sortOrder: 99)

## Sesion 32 — Sistema de Claves Dinamicas de Autorizacion (Completada)

### Migracion de base de datos
- Nuevo enum: `DynamicKeyPerm` (13 permisos: DELETE_CREDIT_NOTE_SALE, DELETE_DEBIT_NOTE_SALE, DELETE_CREDIT_NOTE_PURCHASE, DELETE_DEBIT_NOTE_PURCHASE, DELETE_RECEIPT_COLLECTION, DELETE_RECEIPT_PAYMENT, DELETE_EXPENSE, MODIFY_PRODUCT_PRICE, CANCEL_CASH_SESSION, CHANGE_EXCHANGE_RATE, MANUAL_STOCK_ADJUSTMENT, GIVE_DISCOUNT, ALLOW_CREDIT_INVOICE)
- Nuevos modelos: `DynamicKey`, `DynamicKeyPermission`, `DynamicKeyLog`
- DynamicKey: name, keyHash (bcrypt), isActive, relacion con User
- DynamicKeyPermission: dynamicKeyId + permission (DynamicKeyPerm), unique constraint
- DynamicKeyLog: dynamicKeyId, permission, action, entityType, entityId, createdAt
- Relacion: User → dynamicKeys
- Migracion: `add_dynamic_keys_system`

### Backend (NestJS)
- Nuevo modulo: `DynamicKeysModule` con controller, service, DTOs
- DTOs: CreateDynamicKeyDto, UpdateDynamicKeyDto, ValidateKeyDto
- Endpoints (solo ADMIN excepto validate):
  - `GET /dynamic-keys` — lista claves con permisos, logCount, createdBy (sin hash)
  - `GET /dynamic-keys/:id/logs` — historial de uso con filtros from/to, paginacion
  - `POST /dynamic-keys` — crear clave (hashea con bcrypt, crea permisos en transaccion)
  - `PATCH /dynamic-keys/:id` — editar nombre, permisos, clave opcional (transaccion: borra permisos viejos + recrea)
  - `PATCH /dynamic-keys/:id/toggle-active` — activar/desactivar
  - `DELETE /dynamic-keys/:id` — eliminar clave
  - `POST /dynamic-keys/validate` — validar clave (abierto a autenticados): itera claves activas, bcrypt.compare, verifica permiso, crea log, retorna { authorized, keyName } o 401
- Registrado en AppModule

### Frontend (Next.js)
- Componente reutilizable: `DynamicKeyModal` (apps/web/src/components/dynamic-key-modal.tsx)
  - Props: isOpen, onClose, onAuthorized, permission, title, description, entityType, entityId, action
  - Campo password con toggle mostrar/ocultar, autoFocus
  - Llama POST /dynamic-keys/validate, ejecuta onAuthorized() si autorizado
  - Muestra error y limpia campo si falla
- Pagina `/settings/dynamic-keys` — Gestion de claves:
  - Tabla: Nombre, Permisos (badges), Estado (Activa/Inactiva), Creada por, Usos, Acciones
  - Acciones: Editar, Activar/Desactivar, Ver logs, Eliminar
  - Modal crear/editar: nombre, clave (password, opcional en edicion), grid checkboxes permisos en espanol
- Pagina `/settings/dynamic-keys/[id]/logs` — Historial de uso:
  - Filtros: rango de fechas
  - Tabla: Fecha, Permiso usado, Accion, Tipo registro, ID registro
  - Paginacion 20 por pagina
- Sidebar: nueva entrada "Claves de autorizacion" (KeyRound) bajo CONFIGURACION
- Integracion del modal en acciones protegidas:
  - `/credit-debit-notes/[id]`: boton "Anular" abre DynamicKeyModal con permiso segun tipo (NCV→DELETE_CREDIT_NOTE_SALE, NDV→DELETE_DEBIT_NOTE_SALE, NCC→DELETE_CREDIT_NOTE_PURCHASE, NDC→DELETE_DEBIT_NOTE_PURCHASE)
  - `/receipts/[id]`: boton "Cancelar" abre DynamicKeyModal con DELETE_RECEIPT_COLLECTION o DELETE_RECEIPT_PAYMENT segun tipo
  - `/expenses`: boton "Eliminar" abre DynamicKeyModal con DELETE_EXPENSE

## Sesion 31 — Separar tipo de pago del estado en facturas (Completada)

### Migracion de base de datos
- Nuevo enum: `InvoicePaymentType` (CASH, CREDIT)
- Nuevo campo: `Invoice.paymentType` con default CASH
- Enum `InvoiceStatus` actualizado: eliminados DRAFT, PARTIAL, CREDIT; renombrado PARTIALLY_RETURNED a PARTIAL_RETURN
- Estados finales: PENDING, PAID, PARTIAL_RETURN, RETURNED, CANCELLED
- Migracion de datos existentes:
  - CREDIT → PAID + paymentType=CREDIT
  - DRAFT → PENDING
  - PARTIALLY_RETURNED → PARTIAL_RETURN
  - PARTIAL → PENDING
- Migracion: `separate_invoice_payment_type_from_status`

### Backend (NestJS)
- `InvoicesService`:
  - `create()`: siempre status=PENDING (eliminado DRAFT)
  - `pay()`: status=PAID + paymentType=CASH/CREDIT (ya no usa status=CREDIT)
  - `cancel()`: valida solo PENDING (eliminado DRAFT)
  - `retake()`, `updateItems()`, `delete()`: valida solo PENDING
  - `findAll()`: nuevo filtro `?paymentType=`
  - `findPending()`: solo filtra PENDING
- `InvoicesController`: nuevo query param `paymentType`
- `CreditDebitNotesService`:
  - NCV MANUAL y NDV: valida `paymentType=CREDIT` en vez de `status=CREDIT`
  - NCV MERCHANDISE: permite PAID y PARTIAL_RETURN
  - Post: actualiza a RETURNED o PARTIAL_RETURN
- `CashRegistersService`: filtros cambiados de `{ in: ['PAID','CREDIT'] }` a `'PAID'`
- `FiscalService`: libro de ventas filtra `status='PAID'`, incluye `tipoPago` en response
- `CustomersService`: filtro de facturas activas actualizado
- `QuotationsService`: conversion a factura siempre status=PENDING

### Frontend (Next.js)
- `/sales/invoices` (lista):
  - Nuevos STATUS_COLORS/LABELS: PENDING=amarillo, PAID=verde, PARTIAL_RETURN=naranja, RETURNED=rojo, CANCELLED=gris
  - Nuevo badge de tipo de pago separado: CASH=azul "Contado", CREDIT=morado "Credito"
  - Ambos badges mostrados juntos en tabla
  - Nuevo filtro dropdown "Tipo de pago" (CASH/CREDIT) separado del filtro de estado
- `/sales/invoices/[id]` (detalle):
  - Badges de estado y tipo de pago separados en header
  - Botones actualizados:
    - "Devolver factura" → status=PAID + paymentType=CASH
    - "Devolver mercancia" → status=PAID + paymentType=CREDIT
    - "Nota de credito" → paymentType=CREDIT
    - "Nota de debito" → paymentType=CREDIT
- `/sales/customers/[id]`: badges actualizados con nuevos estados
- `/fiscal/libro-ventas`: nueva columna "Tipo" (Contado/Credito) en tabla y PDF

## Sesion 30 — Modulo de Programacion de Pagos (Completada)

### Migracion de base de datos
- Nuevos modelos: `PaymentSchedule`, `PaymentScheduleItem`
- Nuevo enum: `PaymentScheduleStatus` (DRAFT, APPROVED, EXECUTED, CANCELLED)
- Campo `budgetCurrency` para seleccion USD/Bs del presupuesto
- Relaciones: User → paymentSchedules, Payable → paymentScheduleItems, CreditDebitNote → paymentScheduleItems
- Migracion: `add_payment_schedule_module`

### Backend (NestJS)
- Nuevo modulo: `PaymentSchedulesModule` con controller, service, PDF service
- Endpoints:
  - `GET /payment-schedules` — lista con filtros (status, from, to, search, page, limit)
  - `GET /payment-schedules/:id` — detalle con items agrupados por proveedor
  - `POST /payment-schedules` — crear programacion (numeracion PSC-0001, tasa del dia, presupuesto USD/Bs)
  - `POST /payment-schedules/:id/items` — agregar CxP o NDC a la programacion
  - `DELETE /payment-schedules/:id/items/:itemId` — eliminar item (solo DRAFT/APPROVED)
  - `PATCH /payment-schedules/:id/items/:itemId` — editar monto planificado
  - `PATCH /payment-schedules/:id/status` — cambiar estado (DRAFT→APPROVED→EXECUTED, solo ADMIN/SUPERVISOR)
  - `GET /payment-schedules/:id/pdf` — generar PDF A4 agrupado por proveedor
  - `GET /payment-schedules/pending-payables` — documentos disponibles (CxP PENDING/PARTIAL + NDC POSTED sin aplicar)
- Validaciones: monto no excede saldo, documento no duplicado, transiciones de estado validas
- Recalculo automatico de totales USD/Bs al agregar/editar/eliminar items
- Presupuesto en USD o Bs con conversion automatica usando tasa del dia

### Frontend (Next.js)
- Nueva entrada en sidebar bajo CxP: "Programacion de pagos" → /payment-schedules
- Pagina `/payment-schedules` — Lista:
  - Tabla: Numero, Titulo, Total USD, Total Bs, Presupuesto, Estado (badge coloreado), Creado por, Fecha, Items
  - Filtros: estado, busqueda por numero/titulo
  - Paginacion, click en fila navega al detalle
- Pagina `/payment-schedules/new` — Crear:
  - Campo titulo, presupuesto con toggle USD/Bs y conversion automatica, notas
  - Muestra tasa del dia y equivalente en la otra moneda
- Pagina `/payment-schedules/[id]` — Detalle:
  - Header: numero, titulo, estado badge, botones segun estado (Aprobar, Ejecutar, Cancelar, PDF)
  - Panel informativo: fecha, tasa, creador, cantidad de documentos
  - Panel resumen: presupuesto (moneda elegida + equivalente), total a pagar, diferencia con alerta roja si excedido
  - Documentos agrupados por proveedor con subtotales
  - Cada item muestra tipo (CxP/NDC), referencia, vencimiento, saldo, monto a pagar USD/Bs
  - Edicion inline del monto a pagar por item
  - Filas vencidas con fondo rojo, items pagados con fondo verde
  - Panel colapsable "Agregar documentos" con filtros (proveedor, fecha vencimiento, busqueda)
  - Documentos disponibles con campo monto editable pre-llenado con saldo pendiente

### PDF (PDFKit)
- Formato A4 con header empresa, titulo "PROGRAMACION DE PAGOS", numero, fecha, tasa
- Seccion presupuesto vs total con diferencia
- Items agrupados por proveedor con tabla: referencia, tipo, vencimiento, saldo, monto USD, monto Bs
- Subtotal por proveedor, gran total USD y Bs al final
- Footer con creador y datos empresa

### Permisos
- Modulo `payment-schedules` agregado a VALID_MODULES
- Defaults: ADMIN (*), SUPERVISOR, BUYER, ACCOUNTANT tienen acceso
- Middleware de ruta: /payment-schedules → permission 'payment-schedules'
- Pagina role-permissions: nuevo item en "Acceso a Modulos"

## Sesion 29 — Modulo de Control de Gastos (Completada)

### Migracion de base de datos
- Nuevos modelos: `ExpenseCategory`, `Expense`
- Nuevo valor en `PermissionKey`: `MANAGE_EXPENSES`
- Relacion `expenses Expense[]` en User
- Migracion: `add_expenses_module`
- 10 categorias predefinidas seeded via migracion (isDefault=true)

### Backend (NestJS)
- Nuevo modulo: `ExpensesModule` con controller y service
- Endpoints de categorias:
  - `GET /expense-categories` — todas las categorias
  - `GET /expense-categories/active` — solo activas
  - `POST /expense-categories` — crear (solo ADMIN)
  - `PATCH /expense-categories/:id` — editar (solo ADMIN)
  - `PATCH /expense-categories/:id/toggle-active` — activar/desactivar (solo ADMIN)
- Endpoints de gastos:
  - `GET /expenses` — lista con filtros (categoryId, from, to, search, page, limit), ordenado por date DESC
  - `GET /expenses/summary?from&to` — resumen con totalUsd, totalBs, byCategory, byMonth
  - `GET /expenses/:id` — detalle
  - `POST /expenses` — crear (requiere MANAGE_EXPENSES). Calcula Bs o USD automaticamente con tasa del dia
  - `PATCH /expenses/:id` — editar (creador o ADMIN)
  - `DELETE /expenses/:id` — eliminar (solo ADMIN)
- `VALID_MODULES` actualizado con 'expenses' y 'MANAGE_EXPENSES'
- Defaults: ADMIN (*), SUPERVISOR: expenses + MANAGE_EXPENSES

### Frontend (Next.js)
- Nueva seccion en sidebar: GASTOS (icono Wallet) con items Gastos y Categorias
- Pagina `/expenses`:
  - 3 tarjetas resumen (Total USD rojo, Total Bs rojo, Cantidad gris)
  - Filtros: categoria, rango de fechas (default mes actual), busqueda por descripcion/referencia
  - Tabla: Fecha, Categoria (badge), Descripcion, Referencia, USD, Bs, Registrado por, Acciones
  - Boton "+ Registrar gasto" (solo con permiso MANAGE_EXPENSES)
  - Modal crear/editar con conversion automatica USD<>Bs usando tasa del dia
  - Grafico de barras horizontal por categoria (recharts) mostrando total USD del periodo
- Pagina `/expenses/categories`:
  - Solo visible para ADMIN
  - Tabla: Nombre, Descripcion, Predefinida (badge), Estado, Acciones
  - Toggle activar/desactivar, Editar
  - Modal crear/editar categoria
- Pagina `/settings/role-permissions`: nuevo grupo "Administracion" con MANAGE_EXPENSES
- Modulo 'expenses' agregado al grupo "Acceso a Modulos"

### Dependencias
- `recharts` agregado a apps/web

## Sesion 28b — Notas de Credito/Debito como Documentos Independientes (Completada)

### Cambio de arquitectura
- Las notas de credito/debito ya NO modifican CxC/CxP automaticamente al confirmarse
- Son documentos independientes que se aplican a traves del recibo de cobro/pago
- Al confirmar (post): solo hacen movimientos de inventario (RETURN_IN/RETURN_OUT) y cambian status a POSTED

### Schema
- Nuevos valores en `ReceiptItemType`: CREDIT_NOTE, DEBIT_NOTE
- Campo `creditDebitNoteId` en ReceiptItem (relacion con CreditDebitNote)
- Campo `appliedAt DateTime?` en CreditDebitNote (marca cuando fue aplicada en un recibo)
- Migracion: `fix_credit_debit_notes_receipt_integration`

### Backend
- `CreditDebitNotesService.post()`: eliminada toda logica de CxC/CxP (Receivable/Payable)
- `ReceiptsService.getPendingDocuments()`:
  - Para clientes: retorna notas NCV (sign -1) y NDV (sign +1) como documentos seleccionables
  - Para proveedores: retorna notas NCC (sign -1) y NDC (sign +1) como documentos seleccionables
  - Solo notas con status POSTED y appliedAt null
- `ReceiptsService.create()`: acepta items con creditDebitNoteId
- `ReceiptsService.post()`: marca notas como aplicadas (appliedAt = now)
- `CreateReceiptDto`: campo creditDebitNoteId en ReceiptItemDto

## Sesion 28 — Permisos Granulares para Notas y Devoluciones + Logo + Ticket POS (Completada)

### Permisos granulares para notas de credito/debito
- Nuevos valores en `PermissionKey` enum: RETURN_INVOICE, CREDIT_NOTE_SALE, DEBIT_NOTE_SALE, RETURN_PURCHASE, CREDIT_NOTE_PURCHASE, DEBIT_NOTE_PURCHASE
- Migracion: `add_credit_debit_note_permissions`
- Permisos por defecto en `role-permissions.ts`: ADMIN/SUPERVISOR todos, CASHIER/SELLER solo RETURN_INVOICE, BUYER: RETURN_PURCHASE + notas compra, WAREHOUSE: RETURN_PURCHASE, ACCOUNTANT: todos
- VALID_MODULES actualizado en `role-permissions.service.ts`
- Pagina `/settings/role-permissions`: nuevo grupo visual "Notas y Devoluciones"

### Factura de venta — botones corregidos
- Eliminado boton "Anular" (las facturas no se anulan)
- Status PAID: solo muestra "Devolver factura" (permiso RETURN_INVOICE) → navega a `/credit-debit-notes/new?type=NCV&origin=MERCHANDISE&invoiceId=x`
- Status CREDIT: muestra "Devolver mercancia" (RETURN_INVOICE), "Nota de credito" (CREDIT_NOTE_SALE, origin=MANUAL), "Nota de debito" (DEBIT_NOTE_SALE, origin=MANUAL)
- Permisos verificados via fetch `/api/auth/me`

### Orden de compra — botones corregidos
- Status RECEIVED: "Devolver mercancia" (RETURN_PURCHASE), "Nota de credito" (CREDIT_NOTE_PURCHASE, origin=MANUAL), "Nota de debito" (DEBIT_NOTE_PURCHASE, origin=MANUAL)

### Pagina crear nota — query param origin
- Lee `origin` de la URL: si MERCHANDISE solo muestra tab devolucion, si MANUAL solo muestra tab ajuste manual
- Sin origin: muestra ambos tabs (acceso directo desde menu)
- NDV/NDC siempre forzados a MANUAL

### Validacion backend
- `CreditDebitNotesService.create()`: NCV con origin=MANUAL solo aplica a facturas CREDIT
- NDV solo aplica a facturas CREDIT
- NCV con origin=MERCHANDISE aplica a PAID y CREDIT

### Logo de empresa en reportes PDF
- Campo `logo String? @db.Text` en CompanyConfig (base64)
- UI de upload en `/config` con preview, limite 500KB
- 4 PDF services (factura, cotizacion, recibo, notas) muestran solo logo sin texto cuando existe

### Ticket POS 80mm
- Precios incluyen IVA, no se muestra desglose IVA/IGTF al cliente
- IGTF solo se aplica cuando `cashRegister.isFiscal === true`

### Body parser
- Aumentado limite a 2MB en main.ts via NestExpressApplication.useBodyParser()

## Sesion 27 — Notas de Crédito y Débito (Completada)

### Migracion de base de datos
- Nuevos enums: `NoteType` (NCV, NDV, NCC, NDC), `NoteOrigin` (MERCHANDISE, MANUAL), `NoteStatus` (DRAFT, POSTED, CANCELLED)
- Agregado `RETURN_IN`, `RETURN_OUT` a `MovementType`
- Nuevo modelo `CreditDebitNote`: numero, tipo, origen, status, factura/OC vinculada, subtotales/IVA/total en USD y Bs, tasa, monto manual o porcentaje
- Nuevo modelo `CreditDebitNoteItem`: producto, cantidad, precios unitarios, IVA, totales
- Relaciones: `creditDebitNotes` en Invoice, PurchaseOrder y CashRegister

### Backend (NestJS)
- Nuevo modulo `CreditDebitNotesModule` con endpoints:
  - `GET /credit-debit-notes` — lista con filtros: type, status, invoiceId, purchaseOrderId, search, from, to, page, limit
  - `GET /credit-debit-notes/:id` — detalle con items y documento vinculado
  - `POST /credit-debit-notes` — crear nota en DRAFT:
    - MERCHANDISE: valida items originales, calcula precios sin IVA, IVA, totales
    - MANUAL: monto fijo o porcentaje del documento padre, IVA proporcional
    - Genera correlativo: NCV-0001, NDV-0001, NCC-0001, NDC-0001
  - `POST /credit-debit-notes/:id/post` — confirmar nota (transaccion):
    - NCV: RETURN_IN inventario + reduce CxC
    - NDV: crea nueva CxC al cliente
    - NCC: RETURN_OUT inventario + reduce CxP
    - NDC: crea nueva CxP al proveedor
  - `PATCH /credit-debit-notes/:id/cancel` — anular nota DRAFT
  - `GET /credit-debit-notes/:id/pdf` — PDF con PDFKit
- DTOs: CreateNoteDto (type, origin, items, manualAmountUsd, manualPct), QueryNotesDto

### Frontend (Next.js)
- Sidebar: "Notas Cr/Db" en seccion VENTAS con icono FileX2
- `/credit-debit-notes` — lista con filtros tipo, estado, fecha, busqueda por numero, paginacion
- `/credit-debit-notes/new?type=NCV&invoiceId=xxx` — crear nota:
  - Muestra datos del documento origen (factura/OC)
  - Tab "Devolucion de mercancia": tabla items con cantidad editable, totales en tiempo real
  - Tab "Ajuste manual": monto fijo o porcentaje con calculo automatico
  - Resumen con subtotal, IVA, total USD/Bs
  - Botones: "Guardar borrador" y "Crear y confirmar"
- `/credit-debit-notes/[id]` — detalle:
  - Tab "Informacion General": tipo, origen, documento vinculado, items o detalle manual, totales
  - Tab "Efectos contables": muestra efectos en inventario y CxC/CxP segun tipo
  - Botones: Confirmar (DRAFT), Anular (DRAFT), Imprimir PDF (POSTED)
- Factura detalle (`/sales/invoices/[id]`): botones "Nota de credito"/"Nota de debito" + tab "Notas Cr/Db"
- OC detalle (`/purchases/[id]`): botones "Nota de credito"/"Nota de debito" + tab "Notas Cr/Db"

### Pendientes para futuras sesiones
- Validacion IGTF: si NCV y factura tiene IGTF, total debe == factura.totalUsd (solo reversal completo)
- Fiscal: enviar a impresora fiscal al confirmar
- Acumular notas: validar que suma de notas previas + nueva no exceda total del documento

## Sesion 26 — Recibos de Cobro y Pago con Diferencial Cambiario (Completada)

### Migracion de base de datos
- Nuevos enums: `ReceiptType` (COLLECTION, PAYMENT), `ReceiptStatus` (DRAFT, POSTED, CANCELLED), `ReceiptItemType` (RECEIVABLE, PAYABLE, DIFFERENTIAL)
- Nuevo modelo `Receipt`: numero, tipo, cliente/proveedor, totales USD/Bs historico/Bs hoy, tasa del dia, diferencial cambiario, items, pagos
- Nuevo modelo `ReceiptItem`: tipo documento (CxC/CxP/Diferencial), montos USD y Bs, signo (+1/-1)
- Nuevo modelo `ReceiptPayment`: metodo de pago, montos USD/Bs, referencia
- Relaciones agregadas: `receiptItems` en Receivable y Payable, `receipts` en Customer y Supplier, `receiptPayments` en PaymentMethod
- Migracion: `20260516000000_add_receipts_module`

### Backend (NestJS)
- Nuevo modulo `ReceiptsModule` con endpoints:
  - `GET /receipts` — lista con filtros: type, status, customerId, supplierId, from, to, page, limit
  - `GET /receipts/pending-documents?type&entityId` — documentos pendientes (CxC o CxP) de un cliente/proveedor
  - `GET /receipts/:id` — detalle completo con items, pagos, cliente/proveedor
  - `POST /receipts` — crear recibo en borrador:
    - Obtiene tasa del dia (error si no existe)
    - Por cada item: calcula amountBsHistoric (proporcional al original) y amountBsToday (USD x tasa hoy)
    - Calcula totales y diferencial cambiario (totalBsToday - totalBsHistoric)
    - Si diferencial != 0 → crea item adicional tipo DIFFERENTIAL
    - Genera numero correlativo: RCB-XXXX (cobro) o RPG-XXXX (pago)
  - `POST /receipts/:id/post` — confirmar y procesar recibo:
    - Valida que suma de pagos >= saldo neto
    - Por cada item RECEIVABLE → crea ReceivablePayment y actualiza estado
    - Por cada item PAYABLE → crea PayablePayment y actualiza estado
    - Items DIFFERENTIAL no generan movimiento en CxC/CxP
    - Registra pagos del recibo, cambia status a POSTED
    - Todo en transaccion Prisma
  - `PATCH /receipts/:id/cancel` — cancelar recibo DRAFT unicamente

### Frontend (Next.js)
- Sidebar: "Recibos de cobro" bajo CxC, "Recibos de pago" bajo CxP
- `/receipts/collection` — lista recibos de cobro con filtros, paginacion
- `/receipts/payment` — lista recibos de pago con filtros, paginacion
- `/receipts/new?type=COLLECTION|PAYMENT` — crear recibo:
  - Seccion 1: selector de cliente/proveedor con busqueda
  - Seccion 2: dos listas lado a lado (pendientes ← → seleccionados)
    - CxC con fondo verde, CxP con fondo rojo
    - Monto editable para abonos parciales
    - Columna "Bs a tasa hoy" en seleccionados
  - Seccion 3: resumen con totales USD, Bs historico, tasa, Bs hoy, diferencial cambiario
    - Indicador "SE COBRA" (verde) o "SE PAGA" (rojo)
    - Botones "Guardar borrador" y "Procesar recibo"
  - Modal de cobro/pago: multiples metodos, monto pre-llenado, referencia
- `/receipts/[id]` — detalle con tabs:
  - Tab "Informacion General": datos recibo, tabla documentos (con fila diferencial en amarillo), totales
  - Tab "Pagos registrados": tabla metodos de pago usados
  - Botones: Procesar (DRAFT), Cancelar (DRAFT)

## Sesion 25 — Rediseno modulo de cajas con sesiones compartidas/exclusivas (Completada)

### Migracion de base de datos
- Agregado campo `isShared` a CashRegister (Boolean, default false)
- Split de balances en CashSession: `openingBalance` → `openingBalanceUsd` + `openingBalanceBs`, `closingBalance` → `closingBalanceUsd` + `closingBalanceBs`
- Migracion SQL preserva datos existentes (copia openingBalance a openingBalanceUsd, etc.)

### Backend (NestJS)
- Rediseño completo de CashRegistersModule:
  - `GET /cash-registers` — lista todas las cajas con sesion activa
  - `GET /cash-registers/available` — cajas disponibles para el usuario (propias + compartidas abiertas)
  - `GET /cash-registers/:id` — detalle de caja con sesion activa
  - `POST /cash-registers` — crear caja (ADMIN)
  - `PATCH /cash-registers/:id` — editar caja con isShared (ADMIN)
  - `PATCH /cash-registers/:id/toggle-active` — activar/desactivar
  - `POST /cash-registers/:id/open` — abrir sesion con balanceUsd y balanceBs
  - `POST /cash-sessions/:id/close` — cerrar sesion con conteo fisico USD y Bs
  - `GET /cash-sessions/:id/summary` — resumen detallado con diferencias USD/Bs
  - `GET /cash-registers/:id/sessions` — historial de sesiones de una caja
  - `GET /cash-sessions` — historial global con filtros (caja, usuario, estado, rango fechas)
  - `GET /cash-sessions/:id/payments` — pagos de una sesion con paginacion 20/pagina y filtro por metodo
- Una caja solo puede tener UNA sesion OPEN a la vez
- DTOs actualizados: OpenSessionDto (balanceUsd, balanceBs), CloseSessionDto (balanceUsd, balanceBs), CreateCashRegisterDto (isShared)

### Frontend (Next.js)
- `/cash` — Lista de cajas en tabla: nombre, codigo, tipo (Fiscal/Normal), compartida (Si/No), estado (Abierta/Cerrada), abierta por, hora apertura. Click navega a detalle. Boton abrir caja con modal USD/Bs.
- `/cash/[id]` — Detalle de caja con tabs:
  - Tab "Sesion actual": layout 2 columnas (30% resumen fondos/totales/metodos + 70% tabla pagos paginada con filtro por metodo). Botones Reporte X/Z (solo fiscal), Cerrar caja.
  - Tab "Historial de cierres": tabla de sesiones pasadas, click abre modal con detalle completo.
  - Modal cerrar caja: resumen ventas, campos conteo fisico USD/Bs, diferencia automatica (verde/rojo), notas.
- `/cash/sessions` — Historial global con filtros: caja, estado, rango de fechas.
- POS: selector de caja usa endpoint `/available` (solo cajas propias + compartidas). SELLERs no ven selector ni boton cobrar. Si no hay cajas disponibles muestra boton "Ir a cajas".
- Sidebar: seccion CAJA con items "Cajas" y "Sesiones".

## Sesion 24 — Migracion metodos de pago de enum a tabla dinamica (Completada)

### Migracion de base de datos
- Eliminado enum `PaymentMethod` de Prisma, reemplazado por modelo `PaymentMethod` (tabla)
- Modelo soporta jerarquia padre/hijo (grupos y variantes): ej. "Punto de Venta" > "PDV Banesco", "PDV Mercantil"
- Campos: `name`, `isDivisa`, `createsReceivable`, `isActive`, `sortOrder`, `fiscalCode`, `parentId`
- Migracion SQL: convierte columnas enum a FK `methodId` en Payment, ReceivablePayment, PayablePayment preservando datos existentes
- Eliminado modelo `FiscalPaymentMethod` (reemplazado por campo `fiscalCode` en PaymentMethod)
- Seed actualizado con metodos por defecto y variantes iniciales (PDV Banesco/Mercantil/Provincial, PM Banesco/Mercantil)

### Backend (NestJS)
- Nuevo modulo `PaymentMethodsModule` con CRUD completo:
  - `GET /payment-methods` — lista padres con hijos anidados
  - `GET /payment-methods/flat` — lista plana de metodos seleccionables (hojas activas)
  - `POST /payment-methods` — crear (ADMIN)
  - `PATCH /payment-methods/:id` — editar (ADMIN)
  - `PATCH /payment-methods/:id/toggle-active` — activar/desactivar (ADMIN)
  - `DELETE /payment-methods/:id` — eliminar si no tiene pagos ni hijos activos (ADMIN)
- `InvoicesService.pay()`: IGTF ahora usa `paymentMethod.isDivisa` en vez de lista hardcodeada; CxC usa `paymentMethod.createsReceivable`; pagos usan `methodId`
- `ReceivablesService` y `PayablesService`: pagos usan `methodId`, incluyen relacion `method` en queries
- `CashRegistersService`: resumen de sesion agrupa por `method.name` (dinamico)
- `InvoicePdfService`: labels de metodos vienen de relacion `payment.method.name`
- Eliminado modulo `FiscalPaymentMethodsModule` (redundante)

### Frontend (Next.js)
- POS — modal de cobro rediseñado:
  - Metodos de pago cargados desde API (`GET /payment-methods`)
  - Padres sin hijos: boton directo
  - Padres con hijos: desplegable con submenu de variantes
  - `isDivisa` determina campo principal (USD vs Bs) y calculo IGTF
  - Envio de pagos usa `methodId` en vez de enum
- Eliminados TODOS los diccionarios hardcodeados `PAYMENT_LABELS`/`METHOD_LABELS` de:
  - `sales/pos/page.tsx`, `sales/invoices/[id]/page.tsx`
  - `receivables/page.tsx`, `receivables/[id]/page.tsx`, `receivables/platforms/page.tsx`
  - `payables/page.tsx`, `payables/[id]/page.tsx`
  - `cash/sessions/page.tsx`
  - `lib/print-receipt.ts`, `lib/fiscal-printer.ts`
- Dropdowns de metodo de pago en CxC y CxP ahora cargan desde API (`/payment-methods/flat`)
- Nueva pagina `/settings/payment-methods` (solo ADMIN):
  - Lista metodos padres con hijos anidados (estilo arbol)
  - Badges: Divisa/Bolivares, Genera CxC, Codigo Fiscal
  - Acciones: crear, editar, activar/desactivar, eliminar, agregar variante
  - Modal de creacion/edicion con todos los campos
- `fiscal-printer.ts`: obtiene `fiscalCode` de `payment.method.fiscalCode` (relacion) — codigo de impresion NO modificado
- `print-receipt.ts`: obtiene nombre de `payment.method.name` y moneda de `payment.method.isDivisa`
- Sidebar: agregado enlace "Metodos de pago" en seccion CONFIGURACION

## Sesion 19 — Auto-impresion ticket 80mm al cobrar (Completada)

### Auto-impresion de ticket al cobrar en POS
- Backend: `invoices.pay()` ahora incluye seller, cashier y cashRegister en la respuesta
- Nuevo archivo `apps/web/src/lib/print-receipt.ts`: genera ticket HTML 80mm e imprime via iframe aislado (evita conflicto CSS con print-monitor de comandas)
- Ticket incluye: encabezado empresa (nombre, RIF, direccion, telefono), numero factura, fecha/hora, caja, vendedor, cajero, cliente, items detallados, subtotal, IVA desglosado, IGTF, totales USD/Bs, tasa de cambio, metodos de pago, badge credito si aplica
- POS: companyConfig ampliado para guardar datos de empresa (companyName, rif, address, phone)
- Solo imprime en cajas NO fiscales (`isFiscal === false`)
- Import dinamico de print-receipt para no afectar el bundle

### Pendiente para sesion futura
- **QZ Tray (impresion silenciosa)**: instalar QZ Tray en cada PC para imprimir directo a impresora termica sin dialogo del navegador. Configuracion por PC (localStorage) para seleccionar impresora. Aplica tanto para tickets de venta como para comandas de despacho.

## Sesion 18 — Rol Auditor, Scraping BCV y Consulta SENIAT (Completada)

### Rol AUDITOR
- Nuevo valor `AUDITOR` en enum `UserRole` de Prisma
- Migracion: `20260513000000_add_auditor_role`
- Permisos por defecto: `dashboard`, `inventory`
- ROLE_LABELS en espanol en toda la interfaz:
  - Tabla de usuarios, selectores de rol, pagina de permisos por rol, sidebar
  - ADMIN=Administrador, SUPERVISOR=Supervisor, CASHIER=Cajero, SELLER=Vendedor, WAREHOUSE=Almacenista, BUYER=Comprador, ACCOUNTANT=Contador, AUDITOR=Auditor
- Color del badge AUDITOR: cyan

### Scraping BCV
- Endpoint `GET /exchange-rate/fetch-bcv` mejorado con `cheerio` para parseo robusto de la pagina del BCV
- Selector: `#dolar strong` para obtener la tasa del dolar
- User-Agent configurado para evitar bloqueo
- Respuesta mejorada: incluye rate, source, date; o error descriptivo si falla
- Frontend: boton "Obtener del BCV" en pagina de config y en banner de tasa faltante
- Flujo: fetch → muestra tasa obtenida en campo editable → usuario confirma con "Confirmar y guardar"
- Si falla el scraping: mensaje de error con opcion de ingresar manualmente
- Source se guarda correctamente como 'BCV' cuando viene del scraping

### Consulta SENIAT
- Backend: `POST /customers/seniat-parse` parsea HTML de respuesta del SENIAT
  - Extrae: documentType, documentNumber, name, commercialName, fiscalName
  - Usa regex + cheerio como fallback para multiples patrones del SENIAT
- Frontend: boton "SENIAT" junto al campo RIF en:
  - `/sales/customers/new` (crear cliente)
  - `/sales/customers/[id]` (editar cliente)
- Flujo: window.open() al SENIAT → usuario completa formulario y captcha → app hace polling de localStorage cada 500ms → parsea y pre-llena campos

## Sesion 17 — Vendedores, Comisiones, CRUD Cajas, Campos Factura (Completada)

### Migracion Prisma
- Nuevo modelo `Seller` (code, name, phone, isActive, userId unico vinculado a User)
- `commissionPct Float @default(0)` en Category para calculo de comisiones
- Invoice: `sellerId` ahora apunta a Seller (no a User), nuevo `cashierId` apunta a User
- InvoiceItem: +unitPriceWithoutIva, +unitPriceWithoutIvaBs, +costUsd, +costBs
- Migracion: `20260512210000_add_sellers_commissions_and_invoice_fields`

### Backend (NestJS)
- **SellersModule** completo: CRUD, toggle-active, assign-user, generateCode (VEN-001, VEN-002...)
- **Reporte de comisiones**: `GET /sellers/:id/commission-report?from&to` calcula comision por categoria usando unitPriceWithoutIva × cantidad × commissionPct/100 sobre facturas PAID
- **InvoicesService**: auto-asigna seller desde user.seller al crear, guarda cashierId al cobrar, calcula nuevos campos InvoiceItem (unitPriceWithoutIva, costUsd con brega)
- **QuotationsService**: convertToInvoice actualizado con misma logica de seller y campos nuevos
- **CashRegistersService**: CRUD admin completo (findAllAdmin, createRegister, updateRegister, toggleActiveRegister)
- **CategoriesService**: DTO actualizado para incluir commissionPct
- **UsersService**: findOne incluye seller vinculado

### Frontend
- `/settings/sellers` — CRUD vendedores con modal crear/editar/vincular usuario
- `/settings/cash-registers` — CRUD cajas con toggle fiscal y activar/desactivar
- `/reports/commissions` — Reporte de comisiones por vendedor con desglose por categoria
- **POS**: selector de vendedor (dropdown para ADMIN/SUPERVISOR, solo lectura para SELLER/CASHIER)
- **Categorias**: campo commissionPct en formularios inline de crear/editar, badge visual
- **Sidebar**: seccion REPORTES (ADMIN/SUPERVISOR), items Vendedores y Cajas en CONFIGURACION

### Datos de prueba
- Vendedor VEN-001 (Carlos Mendez) vinculado a seller@trinity.com
- Vendedor VEN-002 (Ana Rodriguez) sin vincular

## Sesion 16 — Lazy Loading Tabs + Montos Bs estandarizados (Completada)

### Lazy Loading en Tabs
- Todas las paginas de detalle ahora cargan datos de cada tab solo cuando el usuario hace clic (lazy loading)
- Paginas corregidas: Producto, Cliente, Proveedor, Orden de Compra
- Implementado via `onValueChange` de Radix Tabs + useEffect condicional por tab activa

### Paginacion estandarizada (20 por pagina)
- Movimientos de producto: 10 → 20 por pagina
- Historial compras producto: sin paginacion → 20 por pagina (backend + frontend)
- Facturas de cliente: 10 client-side → 20 server-side via `/invoices?customerId=`
- CxC de cliente: sin paginacion → 20 por pagina (client-side)
- Compras de proveedor: 10 → 20 por pagina
- CxP de proveedor: sin paginacion → 20 por pagina (client-side)

### Ordenamiento
- Todas las listas en tabs ya estaban ordenadas por `createdAt DESC` — verificado sin cambios

### Montos Bs estandarizados en todos los modelos monetarios
- Migracion `add_bs_amounts_to_all_models` agrega campos Bs faltantes
- Modelos actualizados:
  - `PurchaseOrder`: +totalBs, +exchangeRate
  - `PurchaseOrderItem`: +costBs, +totalBs
  - `Payable`: +netPayableBs, +paidAmountBs
  - `Receivable`: +paidAmountBs
  - `Quotation`: +subtotalBs, +ivaBs, +totalBs, +exchangeRate
  - `QuotationItem`: +unitPriceBs, +ivaAmountBs, +totalBs
  - `PayablePayment` y `ReceivablePayment`: ya tenian amountBs — sin cambios
- Servicios actualizados para calcular y guardar Bs al crear/actualizar:
  - `purchase-orders.service.ts` (create, update, receive)
  - `payables.service.ts` (pay → paidAmountBs)
  - `receivables.service.ts` (pay → paidAmountBs)
  - `quotations.service.ts` (create, update)

### Regla agregada a CLAUDE.md
- "Todo campo monetario en USD debe tener su campo equivalente en Bs. Los montos en Bs se calculan y guardan al momento de crear/actualizar usando la tasa del dia. Nunca calcular Bs en tiempo de ejecucion."

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
