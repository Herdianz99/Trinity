Mándale esto a Claude Code:


Lee el PROJECT.md y el PROGRESS.md antes de escribir cualquier línea de código.
Vamos a hacer los permisos por rol editables desde la interfaz de administración.
PARTE 1 — Migración de Prisma
Nuevo modelo para guardar permisos configurables por rol:
prismamodel RolePermission {
  id         String   @id @default(cuid())
  role       UserRole @unique
  modules    String[] // array de módulos permitidos
  updatedAt  DateTime @updatedAt
}
Corre migración con nombre add_role_permissions_table.
En el seed, crear los registros iniciales con los permisos actuales de cada rol:

ADMIN: ['*']
SUPERVISOR: ['dashboard', 'sales', 'quotations', 'catalog', 'inventory', 'purchases', 'cash', 'receivables', 'payables', 'fiscal']
CASHIER: ['dashboard', 'sales', 'quotations', 'cash', 'receivables']
SELLER: ['dashboard', 'sales', 'quotations']
WAREHOUSE: ['dashboard', 'inventory', 'purchases']
BUYER: ['dashboard', 'catalog', 'purchases', 'payables']
ACCOUNTANT: ['dashboard', 'receivables', 'payables', 'fiscal']

PARTE 2 — Backend (NestJS)
Nuevo endpoint en UsersModule o nuevo RolePermissionsModule:

GET /role-permissions — retorna todos los roles con sus módulos actuales
PATCH /role-permissions/:role — actualizar módulos de un rol (solo ADMIN):

Body: { modules: string[] }
Validar que los módulos sean valores válidos del listado permitido
No permitir editar permisos del rol ADMIN — siempre tiene acceso total



Actualizar AuthService.login():

En lugar de leer permisos del archivo estático role-permissions.ts, leer de la tabla RolePermission en DB
Cachear en Redis con key role-permissions:{role} TTL 5 minutos para no consultar DB en cada login
Cuando se actualiza un rol → invalidar el cache de ese rol en Redis

PARTE 3 — Frontend (Next.js)
Nueva página /settings/role-permissions accesible desde CONFIGURACIÓN en el sidebar (solo ADMIN):

Título: "Permisos por rol"
Lista de los 6 roles editables (todos excepto ADMIN):

SUPERVISOR, CASHIER, SELLER, WAREHOUSE, BUYER, ACCOUNTANT


Por cada rol: nombre del rol con su badge de color + grid de checkboxes con todos los módulos disponibles

Los módulos disponibles con nombres amigables:
dashboard    → "Dashboard"
sales        → "Ventas y POS"
quotations   → "Cotizaciones"
catalog      → "Catálogo"
inventory    → "Inventario"
purchases    → "Compras"
cash         → "Caja"
receivables  → "Cuentas por Cobrar"
payables     → "Cuentas por Pagar"
fiscal       → "Documentos Fiscales"
users        → "Gestión de Usuarios"
settings     → "Configuración"

Cada rol muestra sus checkboxes con los módulos actualmente asignados marcados
Botón "Guardar cambios" por cada rol
Al guardar → toast de confirmación "Permisos actualizados. Los cambios aplican en el próximo login"
ADMIN aparece en la lista pero con todos los checkboxes marcados y deshabilitados con badge "Acceso total"

Agregar "Permisos por rol" al sidebar bajo CONFIGURACIÓN.
Al terminar:

Verifica que puedes cambiar los permisos de CASHIER desde la interfaz
Verifica que al hacer login con ese usuario el sidebar refleja los nuevos permisos
Haz commit con el mensaje feat: role permissions configurable from UI with Redis cache
Haz push a GitHub
Actualiza el PROGRESS.md y el PROJECT.md