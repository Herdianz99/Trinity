# Instrucciones del proyecto

## Skills disponibles

Antes de programar, consulta las skills disponibles en `.agents/skills/` y aplícalas
proactivamente según el contexto:

- **frontend-design** (.agents/skills/frontend-design/SKILL.md) - Usar al crear o modificar UI/componentes
- **vercel-react-best-practices** (.agents/skills/vercel-react-best-practices/SKILL.md) - Usar siempre al escribir código React/Next.js
- **systematic-debugging** (.agents/skills/systematic-debugging/SKILL.md) - Usar al investigar y resolver bugs
- **brainstorming** (.agents/skills/brainstorming/SKILL.md) - Usar al planificar features o arquitectura
- **writing-plans** (.agents/skills/writing-plans/SKILL.md) - Usar al diseñar planes de implementación
- **executing-plans** (.agents/skills/executing-plans/SKILL.md) - Usar al ejecutar planes existentes

Lee el SKILL.md correspondiente antes de aplicar cada skill. No esperes a que te lo pida,
úsalas por iniciativa propia cuando el contexto lo requiera.

## Gestión de procesos — IMPORTANTE
- NUNCA usar `taskkill //F //IM node.exe` — mata el propio proceso de Claude Code
- Para liberar puertos usar: `npx kill-port 4000 3000`
- Para detener un proceso específico usar: `npx kill-port {puerto}`

## Antes de cada sesión
- Leer PROJECT.md y PROGRESS.md antes de escribir cualquier código
- Consultar skills en /mnt/skills/public/ especialmente frontend-design

## Commits
- Formato: `tipo: Session X - descripción`
- Siempre hacer push a GitHub después del commit
- Siempre actualizar PROGRESS.md y PROJECT.md al terminar

## Titulos de pestaña del navegador
- Toda página nueva debe tener `document.title` con el patrón `'Título | Trinity ERP'`
- Páginas de listado/formulario: título estático (ej: `document.title = 'Clientes | Trinity ERP'`)
- Páginas de detalle con datos dinámicos: título con datos del registro (ej: `document.title = \`${product.code} - ${product.name} | Trinity ERP\``)
- Usar un `useEffect` para setear el título: estático con `[]`, dinámico con `[entity]`

## Fechas y timezone — REGLA CRITICA (UTC vs Caracas)
El servidor corre en **UTC** pero el negocio opera en **Caracas (America/Caracas, UTC-4, sin horario de verano)**.
NUNCA calcular "hoy" ni rangos de fecha con `new Date()` + `setUTCHours(0/23)`: a las 8 PM de Caracas
ya es medianoche UTC, asi que todo lo de la noche cae en el dia siguiente (ventas mezcladas,
"tasa de hoy" que falla de noche). Este bug se arreglo en toda la API en la Sesion 65.

- **PROHIBIDO** `const d = new Date(); d.setUTCHours(0,0,0,0)` para fechas de negocio. Si ves este patron, es un bug.
- **Usar SIEMPRE el helper** `apps/api/src/common/timezone.ts`:
  - `caracasToday()` → 'YYYY-MM-DD' de hoy en Caracas
  - `caracasDayStart(input?)` / `caracasDayEnd(input?)` → limites UTC de un dia-calendario Caracas, para rangos
    sobre campos **TIMESTAMP** (`createdAt`, `paidAt`, `openedAt`, `postedAt`, `documentDate`)
  - `caracasDateKey(input?)` → medianoche UTC de la fecha-Caracas, para lookups de **`ExchangeRate.date`**
    y comparaciones "hoy" contra campos date-only (`dueDate` en vencidos, etc.)
  - `caracasParts(date)` → `{ymd, hour}` en Caracas, para agrupar timelines por hora/dia
- **EXCEPCION — NO tocar** rangos sobre campos **date-only** guardados a medianoche UTC: libros fiscales (`date`
  en sales-book/purchase-book/fiscal), `invoiceDate`, `dueDate` (en rangos), `reportDate`, `voucherDate`.
  Son timezone-independientes (fecha elegida por el usuario) y anclarlos a Caracas ROMPE los reportes contables.
  El unico campo `@db.Date` real del schema es `ExchangeRate.date`.
- Para fechas locales en **frontend** usar getFullYear()/getMonth()/getDate() (que es la hora local del navegador
  = Caracas para el usuario), nunca toISOString().

## Deploy al servidor
- Servidor: `134.209.220.233` (root)
- Ruta del proyecto: `/opt/Trinity`
- SIEMPRE usar este comando para hacer deploy:
  `ssh root@134.209.220.233 "cd /opt/Trinity && git pull origin main && bash deploy.sh"`
- NUNCA usar solo `bash deploy.sh` sin hacer `git pull` primero — el script se actualiza a sí mismo y la versión vieja en memoria no refleja los cambios
- El script `deploy.sh` ejecuta: pnpm install, prisma migrate, prisma generate, build API + Web, restart PM2, health check
- PM2 procesos: `trinity-api` (puerto 4000), `trinity-web` (puerto 3000)
- Prisma en servidor usa v5: `npx prisma@5.22.0`

### Pre-deploy checklist — CRITICO
ANTES de hacer deploy o decirle al usuario que haga deploy, ejecutar SIEMPRE:
1. `git status` — verificar que NO haya archivos modificados (`M`) o sin trackear (`??`) que sean necesarios para el código desplegado
2. Si el frontend usa endpoints nuevos del API, verificar que los archivos del backend (controller, service, DTO, module) estén **commiteados y pusheados**, no solo escritos localmente
3. Si hay cambios de schema Prisma, verificar que la migración correspondiente esté commiteada
4. Si `app.module.ts` importa módulos nuevos, verificar que esos módulos estén commiteados
5. NUNCA asumir que "funciona en local" = "funcionará en producción". El servidor solo tiene lo que está en git

## Base de datos
- Siempre usar transacciones Prisma para operaciones que afecten múltiples tablas
- Usar SELECT FOR UPDATE para correlativos (facturas, códigos de productos)
- Todo campo monetario en USD debe tener su campo equivalente en Bs en el mismo modelo. Los montos en Bs se calculan y guardan al momento de crear/actualizar el registro usando la tasa del día. Nunca calcular Bs en tiempo de ejecución.

## Importación de inventario desde Excel (Wensoft u otra empresa) — CHECKLIST

Cuando el usuario pida analizar/importar un Excel de inventario de una nueva empresa, seguir estos pasos ANTES de importar:

1. **Buscar productos duplicados por nombre**: Agrupar filas por `descripcion` y listar los que aparecen más de una vez
2. **Comparar datos de duplicados**: Para cada grupo de duplicados, mostrar en tabla:
   - Código (Referencia)
   - Stock (Cantidad de inventario)
   - Costo (Coste divisa)
   - % Ganancia
   - Precio de venta calculado
3. **Generar reporte para el cliente**: Presentar la tabla de duplicados al encargado de la empresa para que:
   - Confirme si el stock real es la suma de ambos registros
   - Indique cuál es el costo y precio correcto
   - Decida cuál registro desactivar en Wensoft
4. **Buscar proveedores problemáticos**: Verificar proveedores con nombre vacío, muy corto, solo guiones, o duplicados con nombres ligeramente distintos (ej: con/sin punto final)
5. **Buscar productos desactivados**: Filtrar `Desactivado = "Si"` y confirmar que se deben omitir
6. **Re-exportar Excel corregido**: Una vez el cliente corrija los duplicados en Wensoft, pedir nuevo Excel y volver a importar

Este flujo evita importar datos incorrectos y asegura que stocks, costos y precios sean los reales.

## Cálculo de ganancias y márgenes — REGLAS DE NEGOCIO
- Si la serie de factura **NO es fiscal**, el IVA se cuenta como parte de la ganancia (no descontar IVA del precio para calcular margen). Si la serie **es fiscal**, el IVA NO es ganancia (se debe al SENIAT)
- Si el producto lleva **brecha**, la brecha se suma al costo (reduce el margen real). Ejemplo: si costo es $0.50 y brecha es 10%, costo efectivo = $0.50 + brecha
- Estas reglas aplican en cualquier pantalla donde se calculen márgenes o rentabilidad (análisis de inventario, reportes, etc.)

## Migraciones Prisma — CRITICO
- NUNCA usar `prisma migrate resolve --applied` sin verificar que las columnas existen en la BD
- Toda migración debe usar `IF NOT EXISTS` en ALTER TABLE y CREATE TABLE
- Si una migración falla en deploy, NO marcarla como aplicada — revisar el error real y corregirlo
- Si es necesario resolver manualmente: primero ejecutar el SQL, LUEGO usar resolve --applied
- El script `deploy/fix-schema.sql` se ejecuta automáticamente en cada deploy como red de seguridad
