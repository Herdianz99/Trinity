Lee el PROJECT.md y el PROGRESS.md que están en la raíz del proyecto antes de escribir cualquier línea de código.
Vamos a implementar la Sesión 1 de Trinity ERP: Setup, Auth y Configuración Base.
Antes de escribir cualquier código consulta las skills disponibles en /mnt/skills/public/ especialmente frontend-design.
Lo que debe quedar funcionando al terminar:

pnpm dev levanta todo: Next.js en puerto 3000, NestJS en puerto 4000, PostgreSQL en 5432, Redis en 6379
Login con JWT funciona y retorna access token + refresh token en cookies httpOnly
Ruta protegida retorna 401 sin token
Sidebar del ERP visible tras login con navegación básica
Página de configuración de empresa guarda y lee datos de CompanyConfig

Estructura del monorepo a crear:
trinity/
├── apps/
│   └── web/          # Next.js 14 App Router — puerto 3000
├── packages/
│   └── database/     # Prisma schema + migrations
├── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── PROJECT.md
└── PROGRESS.md
Implementar exactamente lo descrito en la Sesión 1 del PROJECT.md, incluyendo:

Schema Prisma completo de Fase 1 con todos los modelos descritos
Migración aplicada y seed con datos iniciales
NestJS con AuthModule, UsersModule, CompanyConfigModule
Next.js con login, layout con sidebar, middleware de autenticación con cookies httpOnly, página de configuración

Al terminar:

Verifica que pnpm dev corre sin errores
Haz commit con el mensaje feat: Session 1 - monorepo setup, auth and base configuration
Haz push a GitHub
Actualiza el PROGRESS.md marcando la Sesión 1 como completada y documentando lo que quedó listo
Actualiza el PROJECT.md si hubo alguna decisión técnica que cambió durante la implementación