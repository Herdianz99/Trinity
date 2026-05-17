Lee el PROJECT.md y el PROGRESS.md antes de escribir cualquier línea de código.
Vamos a implementar el sistema de Claves Dinámicas de Autorización.
Antes de escribir cualquier código consulta las skills disponibles especialmente frontend-design.
PARTE 1 — Migración de Prisma
prismamodel DynamicKey {
  id          String              @id @default(cuid())
  name        String              // "Autorización María Supervisora"
  keyHash     String              // bcrypt hash de la clave
  isActive    Boolean             @default(true)
  permissions DynamicKeyPermission[]
  logs        DynamicKeyLog[]
  createdById String
  createdBy   User                @relation(...)
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
}

model DynamicKeyPermission {
  id           String          @id @default(cuid())
  dynamicKeyId String
  dynamicKey   DynamicKey      @relation(...)
  permission   DynamicKeyPerm
}

model DynamicKeyLog {
  id           String          @id @default(cuid())
  dynamicKeyId String
  dynamicKey   DynamicKey      @relation(...)
  permission   DynamicKeyPerm  // qué permiso se usó
  action       String          // descripción de la acción realizada
  entityType   String?         // "Invoice", "CreditDebitNote", etc.
  entityId     String?         // ID del registro afectado
  createdAt    DateTime        @default(now())
}

enum DynamicKeyPerm {
  DELETE_CREDIT_NOTE_SALE      // eliminar nota de crédito de venta
  DELETE_DEBIT_NOTE_SALE       // eliminar nota de débito de venta
  DELETE_CREDIT_NOTE_PURCHASE  // eliminar nota de crédito de compra
  DELETE_DEBIT_NOTE_PURCHASE   // eliminar nota de débito de compra
  DELETE_RECEIPT_COLLECTION    // eliminar recibo de cobro
  DELETE_RECEIPT_PAYMENT       // eliminar recibo de pago
  DELETE_EXPENSE               // eliminar gasto
  MODIFY_PRODUCT_PRICE         // modificar precio de producto
  CANCEL_CASH_SESSION          // anular sesión de caja
  CHANGE_EXCHANGE_RATE         // cambiar tasa BCV manualmente
  MANUAL_STOCK_ADJUSTMENT      // hacer ajuste manual de inventario
  GIVE_DISCOUNT                // dar descuento en POS
  ALLOW_CREDIT_INVOICE         // permitir facturar a crédito
}
Corre migración con nombre add_dynamic_keys_system.
PARTE 2 — Backend (NestJS)
Nuevo DynamicKeysModule:
GET /dynamic-keys — lista todas las claves con sus permisos (sin el hash) — solo ADMIN
GET /dynamic-keys/:id/logs — historial de uso de una clave con filtros ?from&to&page&limit
POST /dynamic-keys — crear clave (solo ADMIN):

Body: { name, key, permissions: DynamicKeyPerm[] }
Hashear la clave con bcrypt antes de guardar
Nunca retornar el hash

PATCH /dynamic-keys/:id — editar nombre y permisos (solo ADMIN)
PATCH /dynamic-keys/:id/toggle-active — activar/desactivar (solo ADMIN)
DELETE /dynamic-keys/:id — eliminar clave (solo ADMIN)
POST /dynamic-keys/validate — validar clave y permiso:

Body: { key, permission, entityType?, entityId?, action }
Buscar todas las claves activas
Comparar con bcrypt contra cada una
Si encuentra coincidencia → verificar que tiene el permiso solicitado
Si tiene el permiso → crear DynamicKeyLog con todos los datos
Retornar: { authorized: true/false, keyName?: string }
Si no autorizado → retornar 401

PARTE 3 — Frontend (Next.js)
Componente reutilizable DynamicKeyModal:
Crear en apps/web/src/components/dynamic-key-modal.tsx:
typescriptinterface DynamicKeyModalProps {
  isOpen: boolean
  onClose: () => void
  onAuthorized: () => void  // callback cuando se autoriza
  permission: DynamicKeyPerm
  title?: string            // "Esta acción requiere autorización"
  description?: string      // "Ingresa la clave de supervisor para continuar"
  entityType?: string
  entityId?: string
  action: string            // descripción para el log
}
El modal muestra:

Título y descripción
Campo de clave (tipo password, con toggle mostrar/ocultar)
Botón "Autorizar"
Al hacer clic → llama a POST /dynamic-keys/validate
Si autorizado → cierra el modal y ejecuta onAuthorized()
Si no autorizado → muestra error "Clave incorrecta o sin permisos para esta acción"
El campo se limpia automáticamente si falla

Implementar el modal en estas acciones:
Eliminar nota de crédito de venta (DELETE_CREDIT_NOTE_SALE):

En /credit-debit-notes/[id] botón "Cancelar" para notas NCV → abrir DynamicKeyModal antes de proceder

Eliminar nota de débito de venta (DELETE_DEBIT_NOTE_SALE):

En /credit-debit-notes/[id] botón "Cancelar" para notas NDV

Eliminar nota de crédito de compra (DELETE_CREDIT_NOTE_PURCHASE):

En /credit-debit-notes/[id] botón "Cancelar" para notas NCC

Eliminar nota de débito de compra (DELETE_DEBIT_NOTE_PURCHASE):

En /credit-debit-notes/[id] botón "Cancelar" para notas NDC

Eliminar recibo de cobro (DELETE_RECEIPT_COLLECTION):

En /receipts/[id] botón "Cancelar recibo" para recibos tipo COLLECTION

Eliminar recibo de pago (DELETE_RECEIPT_PAYMENT):

En /receipts/[id] botón "Cancelar recibo" para recibos tipo PAYMENT

Eliminar gasto (DELETE_EXPENSE):

En /expenses botón "Eliminar" por cada gasto

Página /settings/dynamic-keys — Gestión de claves:

Solo ADMIN
Agregar al sidebar bajo CONFIGURACIÓN: "Claves de autorización"
Header: "Claves de autorización" + botón "+ Nueva clave"
Tabla: Nombre, Permisos (badges), Estado, Creada por, Fecha, Acciones
Acciones: Editar, Activar/Desactivar, Ver logs, Eliminar

Modal "Nueva clave / Editar clave":

Campo nombre
Campo clave (password) — solo al crear, al editar es opcional (si se deja vacío no cambia)
Grid de checkboxes con todos los permisos disponibles en español:
Eliminar nota de crédito de venta
Eliminar nota de débito de venta
Eliminar nota de crédito de compra
Eliminar nota de débito de compra
Eliminar recibo de cobro
Eliminar recibo de pago
Eliminar gasto
Modificar precio de producto
Anular sesión de caja
Cambiar tasa BCV
Ajuste manual de inventario
Dar descuento en POS
Permitir facturar a crédito

Botón guardar

Página /settings/dynamic-keys/[id]/logs — Historial de uso:

Tabla: Fecha, Permiso usado, Acción, Tipo de registro, ID registro, Usuario del sistema
Filtros: rango de fechas
Paginación 20 por página

Al terminar:

Crear una clave con permisos de eliminar NC y ND
Intentar eliminar una nota de crédito → verificar que aparece el modal
Ingresar la clave correcta → verificar que procede
Ingresar una clave incorrecta → verificar que muestra error
Verificar que el log registró la acción correctamente
Haz commit con el mensaje feat: dynamic authorization keys system with audit log
Haz push a GitHub
Actualiza el PROGRESS.md y el PROJECT.md