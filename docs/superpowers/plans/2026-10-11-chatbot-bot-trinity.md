# Plan — Chatbot Fase 2 (bot dentro de Trinity)

Spec: `docs/superpowers/specs/2026-10-11-chatbot-bot-trinity-design.md`

## Tareas

1. **BD** — modelos `ChatbotConfig`, `ChatbotConversation`, `ChatbotMessage`, `ChatbotSearchLog` + enums; migración
   `20261011150000_chatbot` (aditiva, `IF NOT EXISTS`) + copia en `deploy/fix-schema.sql`; módulo de permiso `chatbot`
   (lista de `role-permissions.service.ts`, página de permisos por rol, middleware web). ADMIN lo tiene por `*`.
2. **Dependencia** — `@anthropic-ai/sdk` en `apps/api`. `ANTHROPIC_API_KEY` opcional en `.env` (sin ella el bot no arranca).
3. **API `modules/chatbot/`**
   - `chatbot-pricing.ts`: precio por modelo y cálculo de costo (entrada, salida, caché lectura/escritura).
   - `chatbot-config.service.ts`: get-or-create de la fila única, update, `apiKeyConfigured`.
   - `chatbot-tools.service.ts`: `buscar_productos` (SQL propio con `productSearchTsQuery`, orden disponibles → no-variante →
     `ts_rank` → oferta; disponible = vendible − apartado; precio divisas/excepciones), `enviar_foto`, `calcular_bolivares`
     (tasa `caracasDateKey`), registro en `ChatbotSearchLog`.
   - `chatbot-prompt.ts`: system prompt (reglas fijas + textos de la config).
   - `chatbot.service.ts`: conversaciones, `reply()` con bucle manual (máx. 6 vueltas), historial append-only desde
     `apiContent`, tope mensual (mes Caracas), escalado por error/refusal/max_tokens, fotos del cliente a Spaces
     (`chatbot/<conv>/<uuid>.jpg`) y enviadas a la IA por URL.
   - `chatbot.controller.ts` (`@RequireModule('chatbot')`) + DTOs; registrar en `app.module.ts`.
4. **Web**
   - Sidebar: sección "Chatbot" (Probar bot, Conversaciones, Búsquedas sin resultado, Configuración).
   - `/chatbot` probar (chat + panel de diagnóstico), `/chatbot/config`, `/chatbot/conversations` (+ detalle), `/chatbot/missed`.
   - `document.title` en cada página.
5. **Verificación** — typecheck API/Web; probar herramientas sin IA (endpoint de diagnóstico o script); con la API key:
   las 17 conversaciones de la prueba de factibilidad sobre `grande_db` local; navegador con puppeteer.
6. **Cierre** — PROGRESS.md / PROJECT.md, commit + push. **No desplegar** (el bot viaja apagado si se despliega otra cosa).
