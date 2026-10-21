# Chatbot — Fase 3: bot automático en la tienda online, Instagram y WhatsApp

> Plan acordado con el usuario el **2026-10-19** (Sesión 165). Antecedentes: `docs/CHATBOT-WHATSAPP-FACTIBILIDAD.md`
> (factibilidad) y el bloque del chatbot en `PROGRESS.md`. **Estado: esperando al usuario** (servidor y acceso a Meta,
> que espera conseguir en el transcurso de la semana del 19-10).

## 1. Decisiones tomadas

- **Chatwoot instalado en servidor propio (Community Edition, gratis, sin límite de agentes).** El plan de USD 20 de su
  web es la versión en la nube y su "1 agente" = 1 persona que atiende. No se usa.
- **Servidor aparte de USD 12 (2 GB, Ubuntu 24.04) + 2 GB de swap.** Chatwoot usa ~1,5–1,8 GB. Se agranda a 4 GB en
  minutos si hace falta (redimensionar solo CPU/RAM permite volver al pequeño). **No** se instala en el servidor de la
  grande: tiene RAM (7,8 GB, 2,1 GB en uso; los 5,6 "disponibles" son en su mayoría caché de disco que acelera la BD),
  pero es el servidor del ERP de la grande y la mayorista.
- **Un solo bot para todos los canales:** Trinity se conecta una vez a Chatwoot ("Agent Bot" por webhook) y atiende
  la tienda online, Instagram y WhatsApp con la misma lógica (sinónimos, control de precios, venta cruzada, escaladas).
- **Orden de los canales:**
  1. **Chat de la tienda online:** no necesita a Meta ni cuesta por mensaje → el primero. Bot 24 h.
     ⚠️ La tienda online todavía **no está en producción** (hoy en `trebol-shop.vercel.app`); el chat sale con ella.
  2. **Instagram:** gratis por mensaje → bot 24 h, cuando Meta apruebe la app.
  3. **WhatsApp:** número actual por **coexistencia**; bot **solo fuera del horario del asesor** + interruptor
     "Asesor presente". En horario responde el asesor desde el celular.
- **A futuro las compras se redirigen a la tienda online**, así que el costo por mensaje de WhatsApp no debería ser un
  problema. El botón de contacto de la tienda abre el chat de la web (gratis), no WhatsApp.
- **Cierre de compra (Fase 3b):** al arrancar, el bot escala "me lo llevo" a un asesor con el resumen (como hoy).
  Después se automatiza con factura en espera (ver §6).

## 2. Cómo queda

```
Tienda online (chat web) ─┐
Instagram (mensajes)      ─┼──► Chatwoot (chat.eltrebol.app) ──► webhook ──► Trinity (bot)
WhatsApp (coexistencia)   ─┘           │                                       │
                                       └── asesor (web o app de Chatwoot) ◄── escala con nota interna
```

- `ChatbotConversation.channel` / `externalId` ya existen en el schema para esto.
- Si un asesor toma la conversación en Chatwoot, el bot se calla.

## 3. Costos

| Concepto | Costo |
|---|---|
| Servidor Chatwoot | USD 12/mes (USD 24 si se pasa a 4 GB) |
| IA del bot (Haiku) | Centavos: la prueba de 75 mensajes del 19-10 costó USD 0,07 |
| Chat de la tienda online | Gratis |
| Instagram | Gratis por mensaje (responder dentro de 24 h del último mensaje del cliente; un asesor puede hasta 7 días) |
| WhatsApp | Desde el **1-oct-2026**: **1.000 respuestas gratis al mes por número**, luego ~**USD 0,0113** c/u ("Resto de Latinoamérica", incluye Venezuela; cifra de varias fuentes, no vista en la tabla oficial). Mensajes del cliente: gratis. Escribir primero (marketing): ~USD 0,074 c/u. Cada mensaje entregado cuenta (también una foto) → mandar foto con texto como pie de foto. Con coexistencia, lo enviado **desde la app del celular** no se cobraría (confirmar en la facturación de Meta los primeros días). |

Estimado WhatsApp con el bot todo el día (≈4 respuestas por conversación): 10 conv/día ≈ USD 2/mes · 30 ≈ 29 · 50 ≈ 57 · 100 ≈ 124.
Con el bot solo fuera de horario, lo normal es quedarse dentro de las 1.000 gratis.

## 4. Lo que tiene que hacer el usuario (bloqueantes)

- [ ] **Servidor DigitalOcean USD 12** (2 GB, Ubuntu 24.04, misma región) → pasar IP y dar acceso SSH root.
- [ ] **DNS:** registro A `chat.eltrebol.app` → IP del servidor (decir quién administra `eltrebol.app` si no sabe dónde).
- [ ] **Meta Business** (business.facebook.com) de la empresa + **verificación del negocio** (RIF, recibo de servicio,
      web o correo con el dominio). Suele tardar 2–5 días hábiles: **empezar apenas tenga acceso a la cuenta.**
- [ ] **App de Meta para desarrolladores** (tipo Business) con los productos **WhatsApp** e **Instagram**; necesita
      ícono, categoría y **URL de política de privacidad** (la hago en la tienda: `/privacidad`). Lo guío paso a paso.
- [ ] **Instagram de la tienda en modo profesional** y dado de alta en "Roles de la app".
- [ ] **WhatsApp:** número actual por coexistencia (debe estar activo en WhatsApp Business y con uso reciente) y
      **tener lista una línea de respaldo** por si Meta no permite coexistencia en Venezuela.
- [ ] **Método de pago (tarjeta internacional) en la cuenta de WhatsApp** (sin él, Meta deja de entregar al pasar las 1.000).
- [ ] **Asesores:** nombre y correo de quienes atienden lo que escala (usuarios de Chatwoot; app móvil para avisos).
- [ ] **Horario en que hay asesor** (para el horario del bot en WhatsApp).
- [ ] **Textos de Configuración del bot en la grande:** **delivery** (zonas, costo, días) y **formas de pago**.
      Hoy están vacíos → toda pregunta de delivery escala (visto en la prueba del 19-10).
- [ ] **Chat de la web:** ¿pedir nombre + teléfono antes de chatear? (recomendado: si el cliente cierra la página, el
      asesor no tiene cómo contactarlo).
- [ ] **Momento para el deploy de la grande** (reinicia la API unos segundos).
- [ ] Opcional: correo SMTP para avisos de Chatwoot (recuperar contraseña).

## 5. Lo que hago yo (en orden)

1. **Deploy de la grande** con lo pendiente (obligatorio antes de que el bot hable solo con clientes):
   `03de2a01` (fix Configuración `crossSellAnalyzedAt`), `84374ba6` (tienda: stock libre, más vendidos, complementos),
   `e5c3f51f` + `2aab0cac` (control de precios, foto, avisar cuando lo ofrecido no es lo pedido).
2. **Conexión Chatwoot ↔ Trinity** (se puede programar y probar en local sin esperar al servidor ni a Meta):
   webhook del Agent Bot → `ChatbotService.reply`; responder texto + fotos (foto con pie de foto); en la web, enlace al
   producto de la tienda; al escalar: asignar a un asesor + nota interna con el resumen; si el asesor toma la
   conversación, el bot no responde; fotos del cliente (adjuntos); límite de **1.000 caracteres en Instagram**;
   horario del bot por canal + interruptor "Asesor presente".
   **Obligatorio: mensajes seguidos del cliente (pendiente, detectado 2026-10-21).** Hoy cada mensaje dispara su propia
   llamada a la IA y no hay bloqueo por conversación. En WhatsApp el cliente escribe en ráfagas ("Buenos días" /
   "Saludos" / "tienen carretillas??" en el mismo minuto): saldrían 2-3 respuestas, quizá desordenadas, y dos llamadas
   en paralelo leen el mismo historial sin verse entre sí (una saluda mientras la otra cotiza). Solución:
   (a) **espera de silencio** de ~8-10 s por conversación antes de responder; si llegan más mensajes se reinicia la
   espera y se juntan todos (texto + fotos) en un solo turno del cliente → una sola llamada a la IA;
   (b) **una respuesta a la vez por conversación** (cola/bloqueo, p. ej. Redis o `SELECT … FOR UPDATE` sobre
   `ChatbotConversation`): lo que llegue mientras el bot responde entra en la vuelta siguiente;
   (c) probarlo con ráfagas reales (3 mensajes en 2 s, mensaje durante la respuesta, foto + texto separados).
3. **Instalar Chatwoot** (Docker, imagen `-ce`, HTTPS, swap, respaldos) y crear los usuarios de los asesores.
4. **Chat en la tienda online** (script del widget en `trebol-shop`; el push publica en Vercel) + página `/privacidad`.
5. **Pruebas de punta a punta** como cliente (texto, fotos, escalada, el asesor la recibe) antes de publicar.
6. **Instagram:** configurar en Chatwoot y grabar la demostración para la **revisión de la app** de Meta.
7. **WhatsApp:** primero con el **número de prueba de Meta**; luego el real. Verificar que Chatwoot recibe los mensajes
   enviados desde el celular (coexistencia) para que bot y asesor no respondan a la vez.
8. Al pasar a canales reales: revisar el tope mensual del bot (hoy USD 20) y el límite de gasto en la consola de Anthropic.

## 6. Fase 3b — cierre de compra automático (después de arrancar)

1. El bot confirma el pedido ("1 esmeril 750W + 10 discos DEWALT: total X $ BCV, ¿lo confirmo?").
2. Pide nombre, cédula/RIF, teléfono y retiro o delivery.
3. Trinity crea una **factura en espera** marcada "Chatbot" (cliente buscado/creado por cédula, como
   `createFromOnlineOrder`); aparta la mercancía (las facturas en espera ya se descuentan del stock libre).
4. El bot da el número de pedido y las formas de pago, y pide la foto del comprobante.
5. **Un asesor verifica el pago** (el bot nunca confirma un pago).
6. El cajero retoma la factura en el POS y cobra (se recalcula a la tasa del día si pasa de un día a otro).

**Decisiones pendientes del usuario:** a qué vendedor van las ventas del bot (comisiones: Marketing VEN-006, un
vendedor "Chatbot" o el asesor que cierra); cuántas horas se aparta la mercancía sin pago; si el bot puede pedir el
comprobante o lo hace siempre una persona.

## 7. Riesgos y cosas a confirmar

- **Coexistencia en Venezuela:** Meta no publica la lista de países; se sabe al intentarlo. Plan B: línea nueva.
- **Chatwoot + coexistencia en servidor propio:** solo con "Quick setup with Meta" (Embedded Signup); hay reportes de
  fallas recientes (GitHub chatwoot discussion #13899). El "manual setup" no admite números activos en la app.
- **Eco de los mensajes del celular** en Chatwoot (para que el bot sepa que el asesor contestó): verificar.
- **Revisión de la app de Instagram** por Meta: toma días; en general pide la verificación del negocio.
- **Política de Meta (desde 15-ene-2026):** prohíbe chatbots de propósito general en WhatsApp; un bot de atención al
  cliente de la propia tienda **sí está permitido**.
- Los precios de Meta cambian por trimestre: revisar antes de presupuestar.

## 8. Referencias

- Chatwoot servidor propio: https://developers.chatwoot.com/self-hosted · Docker: https://developers.chatwoot.com/self-hosted/deployment/docker
- WhatsApp Embedded Signup (coexistencia): https://developers.chatwoot.com/self-hosted/configuration/features/integrations/whatsapp-embedded-signup
- WhatsApp manual: https://www.chatwoot.com/hc/user-guide/articles/1756799850-how-to-setup-a-whats_app-channel-manual-flow
- Instagram Business Login: https://developers.chatwoot.com/self-hosted/configuration/features/integrations/instagram-via-instagram-business-login
- Revisión de la app de Instagram: https://developers.chatwoot.com/self-hosted/instagram-app-review
- Precios oficiales de WhatsApp: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
