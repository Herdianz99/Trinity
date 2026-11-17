# Tótem Clover: rol TOTEM + publicidad en espera — Plan de implementación

**Objetivo:** que el TV táctil vertical de 32" (Android, Chrome) entre con un usuario propio que solo ve `/totem`,
y que cuando nadie lo usa pase la presentación de Clover y publicidad (imágenes, videos y productos con precio en vivo),
configurable desde Chatbot → Tótem (permiso `chatbot-config`). Solo se usa en la grande.

**Acordado con el usuario (2026-11-16):** con sonido; orden presentación → anuncios → presentación; producto con su foto
del catálogo y opción de cambiarla; precio solo en $ BCV; la sesión no debe cerrarse sola; pantalla 1080×1920 vertical;
videos comprimidos en el servidor (ffmpeg) y original borrado; pestaña de archivos con borrado y limpieza de vencidas.
Descartado: estado encendido/apagado, estadísticas, salida oculta para el personal.

## Decisiones técnicas
- **Rol `TOTEM`** (enum `UserRole`). Mismo patrón que `CLIENT`:
  - Web `middleware.ts`: un TOTEM solo navega `/totem` (y `/change-password`); el resto redirige a `/totem`. Login → `/totem`.
  - API `TotemGuard` global (APP_GUARD, como `ClientPortalGuard`): rol TOTEM → lista blanca `@TotemAllowed()`
    (auth + endpoints del tótem). Todo lo demás 403. Así no puede leer conversaciones de WhatsApp aunque lo intente.
  - Permiso por defecto del rol: `['totem']`.
- **Endpoints propios del tótem** (`/totem/*`, módulo `chatbot` o `totem`): crear conversación (siempre canal KIOSK),
  enviar mensaje y llamar vendedor **solo sobre conversaciones KIOSK creadas por ese usuario**, y `GET /totem/playlist`.
- **Sesión que no se cierra:** refresh token de 90 días para TOTEM (se renueva en cada refresco, o sea deslizante) y la
  cookie con la misma duración. Si al abrir `/totem` el access token ya venció (luz cortada >1 h), el middleware renueva con
  el refresh token en vez de mandar al login.
- **Modelos:** `TotemConfig` (singleton: segundos de espera, video de presentación, mensaje encima), `TotemMedia`
  (archivo en Spaces `totem/…`: tipo, peso, medidas, duración, estado PROCESSING/READY/FAILED), `TotemAd` (IMAGE/VIDEO/
  PRODUCT, media opcional, producto opcional, activo, orden, fecha inicio/fin date-only, segundos en pantalla).
- **Subida:** el proxy de Next reenvía el cuerpo como texto y el API acepta JSON de 15 MB → subida por **pedazos de 5 MB
  en base64** a una carpeta temporal del servidor; al completar se procesa en segundo plano (cola de 1):
  - imagen → sharp, WebP, máximo 1080×1920 + miniatura;
  - video → `nice -n 19 ffmpeg -threads 2`, H.264 CRF 26 máx 1080×1920, AAC 128k, `+faststart` + miniatura; máx 2 min y
    300 MB; se borra el original. Sin ffmpeg instalado → estado FAILED con el motivo.
- **Caché en el TV:** el CDN no permite CORS (no se puede usar Cache API desde la página), así que los archivos se suben
  con `Cache-Control: immutable, 1 año` y Chrome los reutiliza de su caché.
- **Fechas:** `startDate`/`endDate` a medianoche UTC (elegidas por el usuario), comparadas con `caracasDateKey()`.
- **Producto:** se oculta si está inactivo, bloqueado, sin precio o sin existencia libre (stock vendible − apartado).

## Tareas
1. Schema + migración (`IF NOT EXISTS`): enum `TOTEM`, enums y tablas del tótem.
2. API: `TotemAllowed` + `TotemGuard`, refresh 90 d para TOTEM, permisos por defecto, `@TotemAllowed` en auth.
3. API módulo `totem`: playlist, conversaciones KIOSK, admin (config, anuncios, archivos, subida por pedazos, procesado).
4. Web: middleware + login + cookies 90 d + renovación al abrir `/totem`; rol en Usuarios.
5. Web `/totem`: usar `/totem/*`, modo espera (presentación + anuncios, sonido con respaldo sin sonido, fondo desenfocado
   para lo horizontal, mensaje encima, wake lock), escalado a 32" vertical.
6. Web `/chatbot/totem`: ajustes, anuncios (crear/editar/ordenar/pausar/fechas, vista previa vertical), archivos (total,
   vencidas, sin usar, borrar). Menú Chatbot → Tótem con `chatbot-config`.
7. Pruebas en local (tsc API y web, flujo con puppeteer a 1080×1920, subida de imagen y video con ffmpeg local).
8. Docs (PROGRESS/PROJECT), commit, push. En producción: instalar ffmpeg en 134.209.164.59 (confirmar con el usuario)
   y deploy solo de la grande.
