Lee el PROJECT.md y el PROGRESS.md antes de escribir cualquier línea de código.
Vamos a migrar los métodos de pago de enum a tabla dinámica con soporte de grupos y subgrupos.
⚠️ IMPORTANTE: No tocar el archivo apps/web/src/lib/fiscal-printer.ts — solo actualizar la parte donde se obtiene el fiscalCode del método de pago para pasárselo a la impresora. El código de impresión fiscal funciona correctamente y no debe modificarse.
Antes de escribir cualquier código consulta las skills disponibles especialmente frontend-design.
PARTE 1 — Migración de Prisma
Eliminar el enum PaymentMethod y reemplazarlo por un modelo:
prismamodel PaymentMethod {
  id                String          @id @default(cuid())
  name              String          @unique
  isDivisa          Boolean         @default(false)
  createsReceivable Boolean         @default(false)
  isActive          Boolean         @default(true)
  sortOrder         Int             @default(0)
  fiscalCode        String?
  parentId          String?
  parent            PaymentMethod?  @relation("SubMethods", fields: [parentId], references: [id])
  children          PaymentMethod[] @relation("SubMethods")
  payments          Payment[]
  receivablePayments ReceivablePayment[]
  payablePayments   PayablePayment[]
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
}
En Payment, ReceivablePayment y PayablePayment cambiar:

method PaymentMethod (enum) → methodId String + method PaymentMethod @relation(...)

Corre migración con nombre migrate_payment_method_enum_to_table.
Seed — crear los métodos de pago iniciales:
Padres sin hijos (se usan directamente):
- Efectivo USD     | isDivisa=true  | createsReceivable=false | sortOrder=1
- Efectivo Bs      | isDivisa=false | createsReceivable=false | sortOrder=2
- Zelle            | isDivisa=true  | createsReceivable=false | sortOrder=6
- Transferencia    | isDivisa=false | createsReceivable=false | sortOrder=7
- Cashea           | isDivisa=true  | createsReceivable=true  | sortOrder=8
- Crediagro        | isDivisa=true  | createsReceivable=true  | sortOrder=9

Padres con hijos (agrupadores):
- Punto de Venta   | isDivisa=false | sortOrder=3
    └── Punto de Venta Banesco    | fiscalCode="PDB" | sortOrder=1
    └── Punto de Venta Mercantil  | fiscalCode="PDM" | sortOrder=2
    └── Punto de Venta Provincial | fiscalCode="PDP" | sortOrder=3
- Pago Móvil       | isDivisa=false | sortOrder=4
    └── Pago Móvil Banesco        | fiscalCode="PMB" | sortOrder=1
    └── Pago Móvil Mercantil      | fiscalCode="PMM" | sortOrder=2
PARTE 2 — Backend (NestJS)
Nuevo PaymentMethodsModule:

GET /payment-methods — lista métodos padres con sus hijos anidados
GET /payment-methods/flat — lista todos los métodos activos sin anidar (para selects)
POST /payment-methods — crear método (solo ADMIN):

Si tiene parentId es un hijo
Si no tiene parentId es un padre/grupo


PATCH /payment-methods/:id — editar
PATCH /payment-methods/:id/toggle-active — activar/desactivar
DELETE /payment-methods/:id — solo si no tiene pagos registrados ni hijos activos

Actualizar InvoicesService:

La lógica del IGTF ya no es if method in ['CASH_USD', 'ZELLE'] sino:
if paymentMethod.isDivisa && companyConfig.isIGTFContributor
La lógica de CxC ya no es if method in ['CASHEA', 'CREDIAGRO'] sino:
if paymentMethod.createsReceivable
Al crear un pago usar methodId en lugar del enum
Al obtener el fiscalCode para la impresora fiscal → paymentMethod.fiscalCode

Actualizar ReceivablesService y PayablesService de la misma forma.
PARTE 3 — Frontend (Next.js)
POS — Modal de cobro:
Rediseñar los botones de métodos de pago:

Cargar métodos desde GET /payment-methods al abrir el modal
Mostrar solo los métodos padres activos ordenados por sortOrder
Si un padre tiene hijos → al hacer clic se despliega un submenú con los hijos
Si un padre no tiene hijos → se selecciona directamente
Al seleccionar un método hijo o padre sin hijos:

Si isDivisa = true → campo principal en USD, Bs calculado automáticamente
Si isDivisa = false → campo principal en Bs, USD calculado automáticamente
Si isDivisa = true y isIGTFContributor = true y es el primer pago en divisa → calcular IGTF



Página /settings/payment-methods — Gestión de métodos de pago:

Accesible solo para ADMIN bajo CONFIGURACIÓN en el sidebar
Lista de métodos padres con sus hijos anidados (mismo estilo que categorías)
Por cada método padre: nombre, tipo (Divisa/Bs), hijos count, estado, acciones
Por cada hijo: nombre, fiscalCode, estado, acciones
Botón "+ Nuevo método" → modal con campos: nombre, isDivisa, createsReceivable, sortOrder, fiscalCode, parentId (opcional)
Botón "+ Agregar variante" por cada padre → crea hijo con parentId pre-llenado
Drag & drop para reordenar (actualiza sortOrder)

Reemplazar todos los diccionarios hardcodeados de labels de métodos de pago en todos los archivos por datos que vengan de la API.
⚠️ Sobre fiscal-printer.ts:
Solo actualizar la línea donde se obtiene el fiscalCode — debe leerlo de payment.method.fiscalCode en lugar del diccionario hardcodeado. No modificar nada más de ese archivo.
Al terminar:

Verificar que el POS muestra los grupos correctamente y el submenú funciona
Verificar que IGTF se calcula correctamente con los nuevos flags
Verificar que Cashea/Crediagro siguen generando CxC
Verificar que fiscal-printer.ts sigue funcionando (no romper la integración fiscal)
Haz commit con el mensaje feat: migrate payment methods from enum to dynamic table with groups
Haz push a GitHub
Actualiza el PROGRESS.md y el PROJECT.md