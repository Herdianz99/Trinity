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

## Fechas y timezone
- Siempre usar setUTCHours para rangos de fecha en queries de backend
- Para fechas locales en frontend usar getFullYear()/getMonth()/getDate() nunca toISOString()

## Base de datos
- Siempre usar transacciones Prisma para operaciones que afecten múltiples tablas
- Usar SELECT FOR UPDATE para correlativos (facturas, códigos de productos)
- Todo campo monetario en USD debe tener su campo equivalente en Bs en el mismo modelo. Los montos en Bs se calculan y guardan al momento de crear/actualizar el registro usando la tasa del día. Nunca calcular Bs en tiempo de ejecución.
