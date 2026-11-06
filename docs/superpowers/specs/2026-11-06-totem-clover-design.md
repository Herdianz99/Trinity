# Tótem de voz "Clover" — piloto en el piso de venta (empresa grande)

Fecha: 2026-11-06 · Estado: diseño aprobado por el usuario

## Objetivo

Una pantalla en el piso de venta con un avatar (Clover) que **escucha y habla** con el cliente,
usando el mismo cerebro del chatbot de WhatsApp (`apps/api/src/modules/chatbot/`).
Piloto barato en **un solo punto de la tienda durante 1–2 semanas** para medir si los clientes
lo usan y cuántas veces los entiende bien.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Equipo | Tablet existente con Chrome en pantalla completa (las laptops quedan de respaldo). Micrófono USB de conferencia solo si el ruido lo exige |
| Avatar | Imagen generada con IA (Canva, media `MAHaKo0Nzmk`): muchacho estilo animación, casco blanco con "CLOVER", chaleco amarillo reflectivo, trébol verde, fondo azul oscuro |
| Animación | Imagen fija + halo que pulsa al escuchar + vaivén suave al hablar + indicador "pensando". Sin boca animada |
| Nombre | **Clover** ("¡Hola! Soy Clover, ¿qué estás buscando?") |
| Ubicaciones | **Fuera del piloto**. Solo 68 de 6.563 artículos con existencia tienen `exhibitionLocation`. Si preguntan dónde está algo → que pregunte a un vendedor |
| Voz a texto | `webkitSpeechRecognition` de Chrome, `lang='es-VE'` (gratis) |
| Texto a voz | `speechSynthesis` del navegador, voz en español (gratis). Voz natural = etapa 2 |
| Escucha | **Botón "Mantén presionado para hablar"** (no escucha continua, por el ruido) |
| Empresa | Solo la grande (`trinity_db`) |

## Experiencia en pantalla

- Clover grande arriba, con estado visual: en espera / escuchando / pensando / hablando.
- Debajo, el texto de lo que entendió (para que el cliente vea si lo entendió bien) y la respuesta escrita.
- Tarjetas de producto (foto, nombre, precio) cuando el bot cotiza. Sin foto → tarjeta con ícono genérico.
- Botón grande "Mantén presionado para hablar".
- Botón "Llamar a un vendedor": escala la conversación y muestra "Un vendedor viene en camino".
- Sin uso por ~60 s → se reinicia la conversación y vuelve al saludo (el siguiente cliente no ve lo del anterior).

## Cambios en el backend

1. **Canal nuevo `KIOSK`** en el enum `ChatbotChannel` (migración con `ALTER TYPE ... ADD VALUE IF NOT EXISTS`),
   para separar estadísticas del tótem de las de WhatsApp/prueba.
2. **Crear conversación de tótem**: `POST /chatbot/conversations` acepta `channel: 'KIOSK'`
   (hoy siempre crea `TEST`).
3. **Modo voz en el prompt** (`chatbot-prompt.ts`) cuando el canal es `KIOSK`:
   presentarse como Clover; respuestas de 1–3 frases; sin listas ni viñetas ni emojis;
   precios escritos como siempre (`12.50$ bcv`, así los sigue verificando `price-guard`) y convertidos a
   "12 dólares con 50" solo para la voz, en el navegador; no dar ubicaciones; el cliente está en la tienda (no ofrecer delivery
   ni pedir datos de contacto).
4. **Tarjetas de producto**: la respuesta del mensaje incluye los productos que el bot mencionó
   (id, nombre, precio, foto) para pintarlos en pantalla — sacados de los resultados de búsqueda de esa vuelta.
5. **Llamar a un vendedor**: endpoint que escala la conversación de tótem (`status` ≠ BOT, motivo "cliente en tótem pide vendedor").
   Aviso al vendedor en el piloto: se ve en la lista de conversaciones escaladas del módulo Chatbot.
6. Los controles existentes siguen aplicando: `price-guard`, `list-guard`, tope mensual, bot apagado.

## Frontend

- Página `/kiosco` (o `/chatbot/totem`) en `apps/web`, a pantalla completa, sin menú lateral,
  `document.title = 'Clover | Trinity ERP'`.
- Login con un **usuario dedicado al tótem** con solo el permiso `chatbot` (no `chatbot-config`).
- Avatar servido como archivo estático en `apps/web/public/` (PNG en buena resolución, descargado de Canva).
- Si el navegador no tiene reconocimiento de voz (no es Chrome), mostrar aviso claro.
- Si se cae el internet o la API falla: Clover dice/muestra "Ahora no puedo responder, pregúntale a un vendedor".

## Fuera de alcance (piloto)

Ubicaciones/pasillos, voz natural de pago, avatar con boca animada, escucha continua, cerrar ventas
o crear facturas en espera, otras empresas.

## Métricas del piloto

- Conversaciones `KIOSK` por día y mensajes por conversación.
- % de veces que el cliente tuvo que repetir (texto entendido vs. lo buscado) — revisión diaria de transcripciones.
- Búsquedas sin resultado (cargar sinónimos, como con WhatsApp).
- Escalamientos a vendedor y costo (esperado < USD 2/mes).

## Riesgos

- Ruido del piso → botón presionar-para-hablar; micrófono USB si hace falta.
- Nombres de ferretería mal transcritos ("tres octavos", "teipe") → sinónimos + mostrar lo entendido.
- Latencia 3–6 s → animación de "pensando".
- 2.210 artículos con existencia sin foto → tarjetas sin imagen en esos casos.

## Tiempo y costo

~3–4 días de trabajo + 1–2 semanas de piloto. Costo inicial USD 0 (tablet existente);
micrófono USD 60–130 solo si hace falta. IA < USD 2/mes, dentro de los créditos actuales.
