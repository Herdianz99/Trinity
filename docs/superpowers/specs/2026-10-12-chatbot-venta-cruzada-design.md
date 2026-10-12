# Chatbot: venta cruzada — Diseño

Fecha: 2026-10-12 · Estado: aprobado en conversación, pendiente de revisión del documento
Relacionado: `2026-10-11-chatbot-bot-trinity-design.md` (bot base), `2026-10-11-sinonimos-busqueda-design.md` (buscador)

## Objetivo

Que el bot, al cotizar un producto, ofrezca en la misma respuesta un complemento disponible con su precio
(esmeril → disco, taladro → mecha, pintura → brocha/rodillo). Las reglas las define el usuario por
**palabras**, no producto por producto. Un análisis semanal de las facturas **propone** reglas nuevas; el
usuario decide cuáles activar.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Cómo ofrece | **Revisado por el usuario tras probar:** por TIPO, sin producto ni precio: "Para aplicarlo también tenemos brochas y rodillos. ¿Quieres ver opciones?" (con medida si aplica: "discos de corte para 4-1/2""). Si dice que sí, el bot busca y lista. (La versión inicial ofrecía un producto específico con precio y elegía mal entre muchos tamaños/marcas.) |
| Reglas | Por palabras: "si cotiza X → ofrecer Y (y Z)". Una regla cubre todos los productos presentes y futuros. |
| Análisis de facturas | Solo propone; el bot usa únicamente reglas activadas por el usuario. |
| Cemento "¿qué estás construyendo?" | Fuera de esta versión. Se maneja con una regla normal o ninguna. |
| Mecanismo | Las sugerencias las calcula Trinity dentro de `buscar_productos` (no una herramienta nueva, no reglas en el prompt). |

## 1. Comportamiento del bot

- Ofrece cuando cotiza **un solo producto** (misma condición que la foto automática). Si lista varios, no
  ofrece; lo hace cuando el cliente elige uno.
- **Una vez por regla en cada conversación**: si ya ofreció discos, no lo repite.
- **Un producto por cada término a ofrecer**, máximo 2 sugerencias por respuesta.
- Solo productos **disponibles** (vendible − apartado > 0), no bloqueados para la venta, no variantes
  (ROTO/SEGUNDA), con precio > 0. Si no hay ninguno, no ofrece nada.
- **Misma medida si se puede**: si el producto cotizado tiene una medida en el nombre (4-1/2, 1/2", 10MM…),
  se prefiere el complemento con la misma medida; si no hay, el más vendido.
- Precio: `precio_bcv` igual que el resto del bot (divisas solo si el cliente las pide o ya se estaban dando).
- Si el cliente acepta: el flujo actual (cotizar, escalar al asesor para cerrar, regla de cantidad insuficiente).

## 2. Datos

```prisma
enum CrossSellRuleStatus {
  ACTIVE      // la usa el bot
  PAUSED      // regla del usuario, apagada
  SUGGESTED   // propuesta por el análisis, pendiente de revisar
  DISMISSED   // propuesta descartada: el análisis no la vuelve a proponer
}

model ChatbotCrossSellRule {
  id           String              @id @default(cuid())
  trigger      String              // palabra/frase del producto cotizado, ej. "esmeril"
  offerTerms   String[]            // 1 o 2 términos a ofrecer, ej. ["disco de corte", "disco de desbaste"]
  excludeTerms String[] @default([]) // no aplicar si el producto cotizado contiene alguno
  status       CrossSellRuleStatus @default(PAUSED)
  // Datos del análisis (solo reglas sugeridas/activadas desde una sugerencia)
  statsBaseCount Int?               // facturas con el trigger en la ventana
  statsPairPct   Float?             // % de esas facturas que también llevaron el término ofrecido
  statsLift      Float?             // veces más de lo esperado por casualidad
  statsAt        DateTime?
  timesOffered Int      @default(0)  // veces que el bot la ofreció (ver §3.4)
  createdById  String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  // Clave normalizada (minúsculas, sin acentos, términos ordenados): "esmeril|disco de corte|disco de desbaste"
  key          String   @unique
  @@index([status])
}

model ChatbotCrossSellOffer {     // qué regla se ofreció en qué conversación (dedupe + estadística)
  id             String   @id @default(cuid())
  conversationId String
  ruleId         String
  productId      String   // producto ofrecido
  createdAt      DateTime @default(now())

  @@unique([conversationId, ruleId])
}
```

Migración aditiva con `IF NOT EXISTS` y copia en `deploy/fix-schema.sql`.

## 3. Servidor (`apps/api/src/modules/chatbot/`)

### 3.1 Servicio nuevo `ChatbotCrossSellService`

- `suggestFor(conversationId, products)`: recibe los productos **disponibles** (no agotados ni bloqueados) del
  resultado de `buscar_productos` (antes eran los 3 primeros: fallaba cuando venían agotados). Los complementos se
  memorizan por regla/término/medida dentro de la llamada. Para cada uno:
  1. Reglas `ACTIVE` (cacheadas 60 s) cuyo `trigger` coincide con el producto: `searchVector @@
     to_tsquery(productSearchTsQuery(trigger))` (mismo motor y sinónimos del POS), y ningún `excludeTerms`
     coincide.
  2. Se saltan las reglas ya ofrecidas en esta conversación (`ChatbotCrossSellOffer`).
  3. Por cada `offerTerm` (máx. 2 en total por producto) busca candidatos con el mismo motor, filtra
     disponibles/no bloqueados/no variantes/precio > 0, y ordena: misma medida que el producto cotizado →
     más vendido (nº facturas 90 días) → relevancia.
  4. El candidato no puede ser el mismo producto ni coincidir él mismo con el trigger (evita "rodillo →
     rodillo").
- Devuelve por producto: `ofrecer_tambien: [{ codigo, nombre, precio_bcv, precio_divisas, regla_id }]`.

### 3.2 Cambio en `buscar_productos`

`ChatbotToolsService.searchProducts` agrega `ofrecer_tambien` a los productos disponibles (solo si hay
sugerencia). El resto del resultado no cambia. El cálculo de medida reutiliza la normalización de
fracciones de `common/product-search.ts`.

### 3.3 Prompt (`chatbot-prompt.ts`)

Nueva sección VENTA CRUZADA:
- Si cotizas UN solo producto y trae `ofrecer_tambien`, menciona esas sugerencias en la misma respuesta con
  su `precio_bcv` ("Para usarlo también tenemos …"), y cierra con la pregunta de si lo agrega.
- Si listas varios productos, no ofrezcas todavía.
- No repitas un complemento que ya ofreciste en esta conversación.
- Nunca inventes complementos: solo los de `ofrecer_tambien`.

### 3.4 Registro de lo ofrecido

Al terminar `reply()`, para cada sugerencia entregada en ese turno se considera **ofrecida** si el texto
final menciona el producto (≥ 50 % de las palabras significativas de su nombre, normalizadas). Si se
ofreció: se crea `ChatbotCrossSellOffer` y se incrementa `timesOffered`. Esto alimenta el "una vez por
conversación" del servidor (§3.1 paso 2) y la columna "Veces ofrecida". Es una heurística: si falla, lo
peor es que el bot vuelva a recibir la sugerencia y el prompt le dice que no la repita.

### 3.5 Endpoints (permiso `chatbot-config`)

- `GET /chatbot/cross-sell/rules?status=` · `POST` · `PATCH /:id` · `DELETE /:id`
- `POST /chatbot/cross-sell/rules/test` — body `{trigger, offerTerms, excludeTerms}` → nº de productos que
  dispararían la regla + hasta 8 ejemplos `producto → sugerencia (precio)`. No guarda nada.
- Activar una sugerencia = `PATCH /rules/:id` con `status: ACTIVE` (y la edición que haga el usuario); descartar = `PATCH` con `status: DISMISSED`.
- `GET /rules` devuelve también `analyzedAt` (fecha del último análisis, `ChatbotConfig.crossSellAnalyzedAt`).
- `POST /chatbot/cross-sell/analyze` — "Recalcular ahora".

## 4. Análisis semanal

`ChatbotCrossSellAnalysisService`, `@Cron('0 0 3 * * 1', { timeZone: 'America/Caracas' })` (lunes 3 AM) y
endpoint manual.

1. Facturas `PAID`/`PARTIAL_RETURN` de los últimos 90 días (`paidAt`, rango con `caracasDayStart`), sin
   empresas del grupo.
2. Cada renglón se agrupa por la **primera palabra significativa** del nombre del producto (normalizada,
   sin acentos, saltando números/medidas y palabras vacías). Se trabaja con conjuntos por factura.
3. Para cada par (A → B), A ≠ B: `base` = facturas con A; `pct` = facturas con A y B / base;
   `lift` = pct / (facturas con B / total facturas).
4. Se propone si `base ≥ 20`, `pct ≥ 15 %` y `lift ≥ 2`. Máx. 3 propuestas por A (las de mayor lift).
5. Cada propuesta es de un solo término (`A → B`). Se crea/actualiza como `SUGGESTED` (con stats) salvo
   que ya exista una regla en cualquier estado con el mismo trigger normalizado y que **incluya** B entre
   sus términos a ofrecer (no se pisan reglas del usuario ni se reviven descartadas; sí se refrescan las
   stats de la existente). Las `SUGGESTED` que ya no cumplen se borran.

Se cargan solo los pares distintos (factura, producto) de la ventana y los nombres de esos productos; el conteo de pares se hace en memoria con funciones puras testeables (`countPairs` / `selectSuggestions`). Umbrales como constantes en el servicio. Al terminar se guarda `ChatbotConfig.crossSellAnalyzedAt`.

## 5. Pantalla `/chatbot/cross-sell` ("Venta cruzada")

Menú CHATBOT, permiso `chatbot-config` (strict, como Configuración). Título `Venta cruzada | Trinity ERP`.

- **Pestaña Reglas** (ACTIVE + PAUSED): tabla Si cotiza… · Ofrecer… · No aplicar si dice… · Activa
  (switch) · Veces ofrecida · editar/borrar. Botón "Nueva regla".
- **Formulario** (modal): trigger, 1–2 términos a ofrecer, términos a excluir (opcional) y botón
  **Probar regla** que muestra el resultado de `/rules/test` antes de guardar.
- **Pestaña Sugeridas**: Si cotiza… · Ofrecer… · "27 % de 140 facturas · 4× más de lo normal" ·
  **Activar** (abre el formulario precargado) · **Descartar**. Botón "Recalcular ahora" y fecha del último
  análisis.

## 6. Carga inicial

Seed en la migración con `ON CONFLICT (key) DO NOTHING` (viaja a todas las instancias, inerte por estar
`PAUSED`; el usuario las prueba y activa): esmeril → disco de corte,
disco de desbaste; taladro → mecha; pintura → brocha, rodillo (excluir: brocha, rodillo, thinner);
cabilla → alambre; poceta → lavamanos.

## 7. Pruebas

- Unitarias: extracción de medida, primera palabra significativa, heurística de "ofrecido", cálculo de
  lift sobre un set pequeño.
- Local con `grande_db`: "Probar regla" con las 6 reglas iniciales; conversaciones reales con IA (esmeril,
  taladro, pintura, lista de varios taladros + elegir uno, repetir el mismo producto, producto sin
  complemento disponible) 3 veces cada una; análisis manual y revisión de que cemento/tubo no salgan en
  todo.
- Typecheck API/Web y navegador sin errores en la pantalla nueva.

## Fuera de alcance

- Regla tipo pregunta ("¿qué estás construyendo?") para el cemento.
- Crear el pedido (factura en espera) al cerrar la venta y alertas al asesor (va con Chatwoot, fase 3).
- Venta cruzada en el POS o en la tienda en línea.
