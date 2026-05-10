Lee el PROJECT.md y el PROGRESS.md antes de escribir cualquier línea de código.
Vamos a implementar la Sesión 12 de Trinity ERP: Gestión de Usuarios y menú colapsable.
Antes de escribir cualquier código consulta las skills disponibles especialmente frontend-design.
PARTE 1 — Migración de Prisma
Verificar que el modelo User tiene estos campos y agregar los que falten:
prismamodel User {
  id                 String    @id @default(cuid())
  name               String
  email              String    @unique
  password           String
  role               UserRole
  isActive           Boolean   @default(true)
  mustChangePassword Boolean   @default(true)
  lastLoginAt        DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
}

enum UserRole {
  ADMIN SUPERVISOR CASHIER SELLER WAREHOUSE BUYER ACCOUNTANT
}
Si faltan campos correr migración con nombre update_user_management.
PARTE 2 — Permisos por rol
Los permisos son fijos por rol — no personalizables por usuario. Implementar un mapa de permisos en el backend:
typescript// apps/api/src/auth/role-permissions.ts
export const ROLE_PERMISSIONS = {
  ADMIN: ['*'], // acceso total
  SUPERVISOR: ['dashboard', 'sales', 'quotations', 'catalog', 'inventory', 'purchases', 'cash', 'receivables', 'payables', 'fiscal'],
  CASHIER: ['dashboard', 'sales', 'quotations', 'cash', 'receivables'],
  SELLER: ['dashboard', 'sales', 'quotations'],
  WAREHOUSE: ['dashboard', 'inventory', 'purchases'],
  BUYER: ['dashboard', 'catalog', 'purchases', 'payables'],
  ACCOUNTANT: ['dashboard', 'receivables', 'payables', 'fiscal'],
}
Incluir los permisos del rol en el JWT payload al hacer login para que el frontend los use sin consultar el backend en cada navegación.
PARTE 3 — Backend (NestJS)
Actualizar UsersModule:

GET /users — lista todos los usuarios con: id, name, email, role, isActive, lastLoginAt, createdAt
GET /users/:id — detalle del usuario
POST /users — crear usuario (solo ADMIN):

Generar contraseña temporal si no se especifica
mustChangePassword = true siempre al crear
Validar que el email no exista


PATCH /users/:id — editar usuario (solo ADMIN):

Puede cambiar: name, email, role, isActive
No puede cambiar contraseña desde aquí


PATCH /users/:id/reset-password — resetear contraseña (solo ADMIN):

Genera nueva contraseña temporal
mustChangePassword = true
Retorna la contraseña en texto plano para que el admin la comunique al usuario


PATCH /users/:id/toggle-active — activar/desactivar usuario (solo ADMIN)
DELETE /users/:id — solo si no es el último ADMIN del sistema

Actualizar AuthModule:

En login(): verificar isActive — si false retornar 403 "Usuario inactivo"
En login(): actualizar lastLoginAt
En login(): incluir en JWT: { sub, name, email, role, permissions: ROLE_PERMISSIONS[role], mustChangePassword }
Nuevo endpoint PATCH /auth/change-password:

Si mustChangePassword = true: no requiere contraseña actual
Si mustChangePassword = false: requiere contraseña actual para verificar
Al cambiar: mustChangePassword = false



PARTE 4 — Frontend (Next.js)
Middleware de autenticación:

Leer JWT de la cookie al navegar
Si mustChangePassword = true y ruta actual no es /change-password → redirigir a /change-password
Verificar permisos del rol contra la ruta actual — si no tiene permiso → redirigir a /403

Página /change-password:

Formulario: nueva contraseña + confirmar contraseña
Si mustChangePassword = true: no mostrar campo de contraseña actual
Si mustChangePassword = false: mostrar campo de contraseña actual
Validación: mínimo 8 caracteres, al menos una mayúscula y un número
Al guardar exitosamente → redirigir al dashboard

Página /403:

Mensaje: "No tienes permiso para acceder a esta sección"
Botón "Volver al inicio"

Sidebar colapsable:
Rediseñar completamente el sidebar con menú colapsable tipo acordeón:

El sidebar tiene un ancho fijo cuando está expandido y se puede colapsar a solo íconos
Las secciones son colapsables individualmente — click en el nombre de la sección expande/colapsa sus items
Estado de cada sección guardado en localStorage (qué secciones están abiertas)
Animación suave de expand/collapse
Estructura del menú según permisos del rol:

🏠 Dashboard (siempre visible)

💰 VENTAS (expandible)
  → POS
  → Pre-facturas
  → Facturas
  → Clientes

📋 COTIZACIONES (expandible)
  → Cotizaciones

📦 CATÁLOGO (expandible)
  → Productos
  → Categorías
  → Marcas
  → Proveedores
  → Ajuste de precios

🏭 INVENTARIO (expandible)
  → Stock
  → Almacenes
  → Transferencias
  → Conteo físico
  → Movimientos

🛒 COMPRAS (expandible)
  → Órdenes de compra
  → Sugerencias de reorden

🏦 CAJA (expandible)
  → Gestión de cajas
  → Sesiones

📈 CxC (expandible)
  → Cuentas por cobrar
  → Por plataforma

📉 CxP (expandible)
  → Cuentas por pagar

🧾 FISCAL (expandible)
  → Libro de ventas
  → Libro de compras
  → Resumen fiscal

⚙️ CONFIGURACIÓN (expandible, solo ADMIN)
  → Empresa
  → Usuarios
  → Áreas de impresión
  → Importación masiva
Solo mostrar las secciones y items que el rol del usuario tiene permitido según ROLE_PERMISSIONS.
Página /settings/users — Gestión de usuarios:

Accesible solo para ADMIN
Header: "Usuarios" + botón "+ Nuevo usuario"
Tabla: Nombre, Email, Rol (badge con color por rol), Último acceso, Estado (Activo/Inactivo), Acciones
Colores de badge por rol: ADMIN=rojo, SUPERVISOR=naranja, CASHIER=azul, SELLER=verde, WAREHOUSE=amarillo, BUYER=morado, ACCOUNTANT=gris
Acciones: Editar, Resetear contraseña, Activar/Desactivar

Modal "Nuevo usuario":

Campos: Nombre completo, Email, Rol (selector), Contraseña temporal (opcional — si se deja vacío se genera automáticamente)
Al crear → mostrar modal con la contraseña generada para que el admin la copie con botón "Copiar contraseña"

Modal "Editar usuario":

Campos editables: Nombre, Email, Rol, Estado (activo/inactivo)
No incluye contraseña

Modal "Resetear contraseña":

Confirmación: "¿Resetear la contraseña de {nombre}?"
Al confirmar → mostrar nueva contraseña temporal con botón "Copiar"

Al terminar:

Crear un usuario de cada rol y verificar que al entrar solo ve las secciones del sidebar que le corresponden
Verificar flujo de primer login: entrar con usuario nuevo → redirige a /change-password → cambia contraseña → accede al dashboard
Verificar que ADMIN puede crear, editar, desactivar y resetear contraseña de usuarios
Haz commit con el mensaje feat: Session 12 - user management, role permissions and collapsible sidebar
Haz push a GitHub
Actualiza el PROGRESS.md y el PROJECT.md