# Tótem de voz "Clover" — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pantalla `/totem` en Trinity (empresa grande) donde Clover escucha al cliente (mantener presionado para hablar), responde con voz y muestra tarjetas de producto, usando el mismo bot del chatbot.

**Architecture:** El backend reutiliza `ChatbotService.reply()`; se agrega el canal `KIOSK`, un bloque de reglas de voz en el system prompt y tarjetas de producto calculadas a partir del `toolLog`. El frontend es una página a pantalla completa fuera del layout del ERP que usa `webkitSpeechRecognition` y `speechSynthesis` de Chrome (gratis).

**Tech Stack:** NestJS + Prisma (API), Next.js 14 App Router + Tailwind (web), Web Speech API, Anthropic SDK (ya integrado).

**Spec:** `docs/superpowers/specs/2026-11-06-totem-clover-design.md`

**Decisión técnica nueva (no estaba en el spec):** el bot NO escribe los precios "hablados". Sigue escribiendo `12.50$ bcv` para que el control de precios (`price-guard.ts`) los siga verificando; la conversión a "12 dólares con 50" se hace solo para la voz, en el navegador (`kiosk-speech.ts`).

**Pruebas:** la API no tiene jest. Las funciones puras se verifican con scripts `*.check.ts` corridos con Node 24 (quita los tipos solo: `node archivo.check.ts`). El resto se verifica con `pnpm build` y prueba manual en Chrome.

---

## Archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `packages/database/prisma/schema.prisma` | Modificar | `KIOSK` en `ChatbotChannel` |
| `packages/database/prisma/migrations/20261106120000_chatbot_kiosk_channel/migration.sql` | Crear | `ALTER TYPE ... ADD VALUE IF NOT EXISTS` |
| `deploy/fix-schema.sql` | Modificar | Red de seguridad con el mismo ALTER |
| `apps/api/src/modules/chatbot/kiosk.ts` | Crear | Reglas de voz + `pickMentionedProducts()` (puro) |
| `apps/api/src/modules/chatbot/kiosk.check.ts` | Crear | Verificación de `pickMentionedProducts()` |
| `apps/api/src/modules/chatbot/chatbot-prompt.ts` | Modificar | Parámetro `channel`; agrega reglas de voz si es KIOSK |
| `apps/api/src/modules/chatbot/dto/chatbot.dto.ts` | Modificar | `CreateChatbotConversationDto` |
| `apps/api/src/modules/chatbot/chatbot.service.ts` | Modificar | Crear con canal, prompt por canal, `productCards`, `callSeller()` |
| `apps/api/src/modules/chatbot/chatbot.controller.ts` | Modificar | Body en POST conversations, POST `:id/call-seller` |
| `apps/web/src/lib/kiosk-speech.ts` | Crear | `textForSpeech()` (precios hablados, limpieza) |
| `apps/web/src/lib/kiosk-speech.check.ts` | Crear | Verificación de `textForSpeech()` |
| `apps/web/src/app/(kiosk)/layout.tsx` | Crear | Layout sin menú, con login y SessionKeeper |
| `apps/web/src/app/(kiosk)/totem/page.tsx` | Crear | Pantalla del tótem |
| `apps/web/src/app/(kiosk)/totem/clover-avatar.tsx` | Crear | Avatar con estados (halo, vaivén, pensando) |
| `apps/web/src/app/(kiosk)/totem/use-voice.ts` | Crear | Hook de reconocimiento y síntesis de voz |
| `apps/web/public/clover/clover.png` | Ya copiado | Imagen de Clover (1088×1456) |

---

### Task 1: Canal KIOSK en la base de datos

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (enum `ChatbotChannel`, ~línea 3180)
- Create: `packages/database/prisma/migrations/20261106120000_chatbot_kiosk_channel/migration.sql`
- Modify: `deploy/fix-schema.sql` (al final)

- [ ] **Step 1: Agregar el valor al enum en el schema**

```prisma
enum ChatbotChannel {
  TEST
  WHATSAPP
  INSTAGRAM
  FACEBOOK
  WEB
  KIOSK
}
```

- [ ] **Step 2: Crear la migración**

`migration.sql`:
```sql
-- Totem de voz Clover en el piso de venta (Sesion 181).
ALTER TYPE "ChatbotChannel" ADD VALUE IF NOT EXISTS 'KIOSK';
```

- [ ] **Step 3: Agregar lo mismo al final de `deploy/fix-schema.sql`**

```sql
-- ===== Totem Clover (20261106120000_chatbot_kiosk_channel) =====
ALTER TYPE "ChatbotChannel" ADD VALUE IF NOT EXISTS 'KIOSK';
```

- [ ] **Step 4: Aplicar en local y regenerar el cliente**

Run: `cd packages/database && npx prisma migrate deploy && npx prisma generate`
Expected: `Applying migration 20261106120000_chatbot_kiosk_channel` y `Generated Prisma Client`.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20261106120000_chatbot_kiosk_channel deploy/fix-schema.sql
git commit -m "feat: Session 181 - canal KIOSK para el totem Clover"
```

---

### Task 2: Reglas de voz y selección de productos mencionados (puro)

**Files:**
- Create: `apps/api/src/modules/chatbot/kiosk.ts`
- Create: `apps/api/src/modules/chatbot/kiosk.check.ts`

- [ ] **Step 1: Escribir la verificación (falla porque `kiosk.ts` no existe)**

`kiosk.check.ts`:
```ts
// Verificacion sin jest: node apps/api/src/modules/chatbot/kiosk.check.ts
import assert from 'node:assert/strict';
import { pickMentionedProducts } from './kiosk.ts';

const search = (productos: any[]) => ({ name: 'buscar_productos', input: {}, result: { productos } });
const p = (codigo: string, nombre: string, precio = '1.00$ bcv') =>
  ({ codigo, nombre, precio_bcv: precio, disponible: true, tiene_foto: true });

// 1. Solo los productos cuyo precio aparece en la respuesta
const log = [search([p('A1', 'Cemento gris 42.5 kg', '9.80$ bcv'), p('A2', 'Cemento blanco 1 kg', '2.10$ bcv')])];
assert.deepEqual(pickMentionedProducts(log, 'El cemento gris 42.5 kg está en 9.80$ bcv. ¿Algo más?').map((x) => x.codigo), ['A1']);

// 2. Sin precios en el texto -> sin tarjetas
assert.deepEqual(pickMentionedProducts(log, 'No lo encontré, ¿buscas otra cosa?'), []);

// 3. Sin repetidos y máximo 4, en el orden en que aparecen en el texto
const many = [search([1, 2, 3, 4, 5].map((i) => p(`C${i}`, `Codo ${i}`, `${i}.00$ bcv`)))];
const text = 'Codo 5 en 5.00$ bcv, codo 1 en 1.00$ bcv, codo 2 en 2.00$ bcv, codo 3 en 3.00$ bcv, codo 4 en 4.00$ bcv, otra vez 1.00$ bcv';
assert.deepEqual(pickMentionedProducts(many, text).map((x) => x.codigo), ['C5', 'C1', 'C2', 'C3']);

// 4. Mismo precio en dos productos: desempata por palabras del nombre
const tie = [search([p('T1', 'Tubo pvc 1/2 aguas blancas', '3.00$ bcv'), p('T2', 'Codo pvc 1/2', '3.00$ bcv')])];
assert.deepEqual(pickMentionedProducts(tie, 'El codo pvc 1/2 está en 3.00$ bcv.').map((x) => x.codigo), ['T2']);

// 5. Ignora otras herramientas y resultados sin productos
assert.deepEqual(pickMentionedProducts([{ name: 'calcular_bolivares', input: {}, result: { bs: 100 } }], '1.00$ bcv'), []);

console.log('kiosk.check OK');
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node apps/api/src/modules/chatbot/kiosk.check.ts`
Expected: FAIL con `Cannot find module ... kiosk.ts`.

- [ ] **Step 3: Implementar `kiosk.ts`**

```ts
// Totem de voz Clover (piso de venta). Logica pura: sin Nest ni Prisma, para poder verificarla con node.

export interface KioskToolCall { name: string; input: unknown; result: unknown }
export interface KioskProduct { codigo: string; nombre: string; precio_bcv: string; disponible: boolean; tiene_foto: boolean }

const MAX_CARDS = 4;

// Se agrega al system prompt cuando el canal es KIOSK. Los precios se siguen escribiendo con numero y "$"
// (los verifica price-guard); la pantalla los convierte a palabras solo para la voz.
export const KIOSK_VOICE_RULES = `

MODO TÓTEM DE VOZ (esta conversación es en la tienda, no por WhatsApp)
- Te llamas Clover. Estás en una pantalla en el piso de venta: el cliente te HABLA y tu respuesta se lee en voz alta y se muestra en pantalla.
- Responde en 1 a 3 frases cortas. Nada de listas, viñetas, emojis ni saltos de línea.
- Si hay varias opciones, nombra máximo 3 en una sola frase y pregunta cuál le interesa (la pantalla muestra las fotos).
- Escribe los precios como siempre (número con "$" y "bcv"); no los escribas en letras.
- Lo que te dicen viene de un reconocimiento de voz y puede venir mal escrito: si no tiene sentido, pide que lo repita.
- El cliente YA está en la tienda: no ofrezcas delivery ni pidas teléfono o datos de contacto.
- No sabes dónde está ubicada la mercancía: si preguntan en qué pasillo está algo, di que un vendedor se lo indica.
- Si quiere comprar, apartar o pagar, dile que un vendedor lo atiende y escala con escalar_a_asesor.
- Para "enviar_foto": no hace falta; la pantalla ya muestra la foto de lo que cotizas.`;

const priceRe = /\d+(?:[.,]\d+)?\s*\$/g;
const normPrice = (s: string) => s.replace(/\s+/g, '').replace(',', '.');
const words = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9/.]+/).filter((w) => w.length > 1);

// Productos que el bot COTIZÓ en esta respuesta: los de buscar_productos cuyo precio aparece en el texto,
// en el orden en que se mencionan. Si dos comparten precio, gana el que mas palabras de su nombre trae el texto.
export function pickMentionedProducts(toolLog: KioskToolCall[], text: string): KioskProduct[] {
  const products: KioskProduct[] = toolLog
    .filter((t) => t.name === 'buscar_productos')
    .flatMap((t) => ((t.result as { productos?: KioskProduct[] })?.productos ?? []));
  if (!products.length) return [];
  const textWords = new Set(words(text));
  const score = (p: KioskProduct) => words(p.nombre).filter((w) => textWords.has(w)).length;

  const picked: KioskProduct[] = [];
  for (const m of text.matchAll(priceRe)) {
    const price = normPrice(m[0]);
    const candidates = products.filter((p) => normPrice(p.precio_bcv.split(' ')[0]) === price && !picked.some((x) => x.codigo === p.codigo));
    if (!candidates.length) continue;
    picked.push(candidates.sort((a, b) => score(b) - score(a))[0]);
    if (picked.length >= MAX_CARDS) break;
  }
  return picked;
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node apps/api/src/modules/chatbot/kiosk.check.ts`
Expected: `kiosk.check OK`

Nota: el `import ... from './kiosk.ts'` del check solo sirve para node; si `tsc` del build se queja del `.ts` en el import, excluir `**/*.check.ts` en `apps/api/tsconfig.build.json` (`"exclude": [..., "**/*.check.ts"]`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/chatbot/kiosk.ts apps/api/src/modules/chatbot/kiosk.check.ts apps/api/tsconfig.build.json
git commit -m "feat: Session 181 - reglas de voz y tarjetas de producto del totem"
```

---

### Task 3: Prompt por canal

**Files:**
- Modify: `apps/api/src/modules/chatbot/chatbot-prompt.ts`

- [ ] **Step 1: Agregar el parámetro y el bloque de voz**

```ts
import { ChatbotChannel, ChatbotConfig } from '@prisma/client';
import { KIOSK_VOICE_RULES } from './kiosk';

export function buildChatbotSystemPrompt(cfg: ChatbotConfig, companyName: string, channel: ChatbotChannel = 'TEST'): string {
```

y al final, en vez de cerrar el template con `` `; `` después de `INFORMACIÓN DE LA TIENDA ...`, envolver:

```ts
  const base = `Eres ${cfg.botName}, ... (texto actual sin cambios) ...
INFORMACIÓN DE LA TIENDA
${info.length ? info.join('\n') : '- (Sin información cargada: cualquier pregunta de dirección, horario o delivery va al asesor.)'}`;
  return channel === 'KIOSK' ? base + KIOSK_VOICE_RULES : base;
}
```

(Solo se cambian la primera línea de la función, `return \`` → `const base = \``, y se agrega el `return` final. El texto del prompt no se toca: WhatsApp sigue igual.)

- [ ] **Step 2: Compilar**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/chatbot/chatbot-prompt.ts
git commit -m "feat: Session 181 - prompt de voz para el canal KIOSK"
```

---

### Task 4: Servicio y controlador

**Files:**
- Modify: `apps/api/src/modules/chatbot/dto/chatbot.dto.ts`
- Modify: `apps/api/src/modules/chatbot/chatbot.service.ts` (`createTestConversation` ~137, `reply` ~329/~356, `saveBotMessage` ~515)
- Modify: `apps/api/src/modules/chatbot/chatbot.controller.ts` (~65)

- [ ] **Step 1: DTO**

Agregar en `chatbot.dto.ts`:
```ts
export class CreateChatbotConversationDto {
  @ApiPropertyOptional({ enum: ['TEST', 'KIOSK'] }) @IsOptional() @IsIn(['TEST', 'KIOSK']) channel?: 'TEST' | 'KIOSK';
}
```

- [ ] **Step 2: Crear conversación con canal**

Reemplazar `createTestConversation` en el servicio:
```ts
  async createConversation(userId: string, channel: 'TEST' | 'KIOSK' = 'TEST') {
    return this.prisma.chatbotConversation.create({
      data: { channel, contactName: channel === 'KIOSK' ? 'Tótem' : 'Prueba', createdById: userId },
    });
  }
```

- [ ] **Step 3: Prompt según el canal de la conversación**

En `reply()`, cambiar la construcción del system prompt:
```ts
      { type: 'text', text: buildChatbotSystemPrompt(cfg, company?.companyName ?? '', conv.channel), cache_control: { type: 'ephemeral' } },
```

- [ ] **Step 4: Tarjetas de producto en la respuesta (solo KIOSK)**

Importar arriba: `import { pickMentionedProducts, KioskToolCall } from './kiosk';`

Agregar al servicio:
```ts
  // Tarjetas del totem: productos cotizados en la respuesta, con foto (si tiene).
  private async kioskCards(toolLog: ToolCallLog[], text: string) {
    const picked = pickMentionedProducts(toolLog as KioskToolCall[], text);
    return Promise.all(picked.map(async (p) => ({
      code: p.codigo,
      name: p.nombre,
      price: p.precio_bcv,
      available: p.disponible,
      imageUrl: p.tiene_foto ? (await this.tools.productImage(p.codigo))?.url ?? null : null,
    })));
  }
```

En `reply()`, en el `return this.saveBotMessage(conversationId, finalText, {...})` final (el de éxito), guardar el resultado y agregar las tarjetas:
```ts
    const saved = await this.saveBotMessage(conversationId, finalText, {
      escalated: out.escalated, toolLog, usage, images: out.images, apiTurns: newTurns,
    });
    if (conv.channel !== 'KIOSK') return saved;
    const productCards = await this.kioskCards(toolLog, finalText).catch((e) => {
      this.logger.error(`Totem: no se pudieron armar las tarjetas: ${(e as Error).message}`);
      return [];
    });
    return { ...saved, productCards };
```

- [ ] **Step 5: Llamar a un vendedor**

Agregar al servicio:
```ts
  // Boton "Llamar a un vendedor" del totem: escala sin pasar por la IA.
  async callSeller(conversationId: string) {
    const conv = await this.prisma.chatbotConversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Conversación no encontrada');
    if (conv.status === 'BOT') {
      await this.escalate(conversationId, 'totem: cliente pide vendedor', 'Cliente en el tótem del piso de venta pidió que lo atienda un vendedor.');
    }
    return { ok: true };
  }
```

- [ ] **Step 6: Controlador**

```ts
  @Post('conversations')
  create(@CurrentUser('id') userId: string, @Body() dto: CreateChatbotConversationDto) {
    return this.service.createConversation(userId, dto.channel ?? 'TEST');
  }

  @Post('conversations/:id/call-seller')
  callSeller(@Param('id') id: string) {
    return this.service.callSeller(id);
  }
```
(agregar `CreateChatbotConversationDto` al import del DTO). Buscar otros usos: `grep -rn "createTestConversation" apps/api/src` debe quedar vacío.

- [ ] **Step 7: Compilar**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 8: Probar con la API local (IA real)**

Con la API local arriba y el bot encendido en la BD local, crear conversación KIOSK y mandar "cuánto cuesta el cemento gris" (método del `bot-test.js`: JWT firmado con `JWT_SECRET`, sin prefijo `/api`):
```bash
curl -s -X POST localhost:4000/chatbot/conversations -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"channel":"KIOSK"}'
curl -s -X POST localhost:4000/chatbot/conversations/<id>/messages -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"text":"cuanto cuesta el cemento gris"}'
```
Expected: respuesta de 1–3 frases sin listas; `productCards` con el cemento (código, nombre, precio, foto). Repetir 3 veces (Haiku varía). Probar también: "dónde están los codos" (debe mandar a un vendedor, sin pasillo) y "me lo llevo" (escala).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/chatbot
git commit -m "feat: Session 181 - conversaciones de totem con tarjetas y llamar vendedor"
```

---

### Task 5: Texto para la voz (puro)

**Files:**
- Create: `apps/web/src/lib/kiosk-speech.ts`
- Create: `apps/web/src/lib/kiosk-speech.check.ts`

- [ ] **Step 1: Escribir la verificación**

```ts
// node apps/web/src/lib/kiosk-speech.check.ts
import assert from 'node:assert/strict';
import { textForSpeech } from './kiosk-speech.ts';

assert.equal(textForSpeech('Está en 12.50$ bcv.'), 'Está en 12 dólares con 50 a tasa BCV.');
assert.equal(textForSpeech('Cuesta 1.00$ bcv'), 'Cuesta 1 dólar a tasa BCV');
assert.equal(textForSpeech('Cuesta 9.05$'), 'Cuesta 9 dólares con 5');
assert.equal(textForSpeech('Tubo de 1/2" y 3/4"'), 'Tubo de 1/2 pulgada y 3/4 pulgada');
assert.equal(textForSpeech('Hola 👋 *amigo*'), 'Hola amigo');
console.log('kiosk-speech.check OK');
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node apps/web/src/lib/kiosk-speech.check.ts`
Expected: FAIL (`Cannot find module`).

- [ ] **Step 3: Implementar**

```ts
// Totem Clover: convierte la respuesta escrita del bot en algo natural para leer en voz alta.
// El bot escribe "12.50$ bcv" (asi lo verifica el control de precios); aqui se vuelve "12 dólares con 50 a tasa BCV".

function dollars(raw: string): string {
  const [int, dec = '0'] = raw.replace(',', '.').split('.');
  const cents = Number(dec.padEnd(2, '0').slice(0, 2));
  const n = Number(int);
  const unit = n === 1 ? 'dólar' : 'dólares';
  return cents ? `${n} ${unit} con ${cents}` : `${n} ${unit}`;
}

export function textForSpeech(text: string): string {
  return text
    .replace(/(\d+(?:[.,]\d+)?)\s*\$\s*bcv/gi, (_, n) => `${dollars(n)} a tasa BCV`)
    .replace(/(\d+(?:[.,]\d+)?)\s*\$/g, (_, n) => dollars(n))
    .replace(/(\d+(?:\/\d+)?)"/g, '$1 pulgada')
    .replace(/[*_#~`]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node apps/web/src/lib/kiosk-speech.check.ts`
Expected: `kiosk-speech.check OK`. Si el build de Next se queja del check, agregar `"**/*.check.ts"` al `exclude` de `apps/web/tsconfig.json`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/kiosk-speech.ts apps/web/src/lib/kiosk-speech.check.ts apps/web/tsconfig.json
git commit -m "feat: Session 181 - precios hablados para la voz del totem"
```

---

### Task 6: Pantalla del tótem

Antes de escribir la UI, leer `.agents/skills/frontend-design/SKILL.md` y `.agents/skills/vercel-react-best-practices/SKILL.md`.

**Files:**
- Create: `apps/web/src/app/(kiosk)/layout.tsx`
- Create: `apps/web/src/app/(kiosk)/totem/use-voice.ts`
- Create: `apps/web/src/app/(kiosk)/totem/clover-avatar.tsx`
- Create: `apps/web/src/app/(kiosk)/totem/page.tsx`

- [ ] **Step 1: Layout sin menú**

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import SessionKeeper from '@/components/session-keeper';

// Totem del piso de venta: pantalla completa, sin el menu del ERP. La sesion se mantiene viva todo el dia.
export default function KioskLayout({ children }: { children: React.ReactNode }) {
  if (!cookies().get('accessToken')?.value) redirect('/login');
  return (
    <div className="min-h-screen bg-[#0b1d3a] text-white select-none overflow-hidden">
      {children}
      <SessionKeeper />
    </div>
  );
}
```

- [ ] **Step 2: Hook de voz**

`use-voice.ts`:
```ts
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { textForSpeech } from '@/lib/kiosk-speech';

// Reconocimiento (solo Chrome) + sintesis de voz del navegador. Gratis, sin servicios externos.
export function useVoice() {
  const recRef = useRef<any>(null);
  const finalRef = useRef('');
  const [supported, setSupported] = useState(true);
  const [interim, setInterim] = useState('');

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    const rec = new SR();
    rec.lang = 'es-VE';
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      finalRef.current = text;
      setInterim(text);
    };
    recRef.current = rec;
    window.speechSynthesis?.getVoices(); // precarga la lista de voces
  }, []);

  const startListening = useCallback(() => {
    window.speechSynthesis?.cancel(); // si Clover esta hablando, se calla
    finalRef.current = '';
    setInterim('');
    try { recRef.current?.start(); } catch { /* ya estaba escuchando */ }
  }, []);

  // Devuelve lo entendido cuando el reconocedor termina de procesar el audio.
  const stopListening = useCallback(() => new Promise<string>((resolve) => {
    const rec = recRef.current;
    if (!rec) return resolve('');
    rec.onend = () => resolve(finalRef.current.trim());
    rec.stop();
  }), []);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    const synth = window.speechSynthesis;
    if (!synth) return onEnd?.();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(textForSpeech(text));
    u.lang = 'es-ES';
    const voices = synth.getVoices();
    u.voice = voices.find((v) => v.lang === 'es-US') ?? voices.find((v) => v.lang.startsWith('es')) ?? null;
    u.rate = 1.05;
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    synth.speak(u);
  }, []);

  return { supported, interim, startListening, stopListening, speak };
}
```

- [ ] **Step 3: Avatar con estados**

`clover-avatar.tsx`:
```tsx
'use client';
import Image from 'next/image';

export type CloverState = 'idle' | 'listening' | 'thinking' | 'speaking';

// Imagen fija de Clover + halo que pulsa al escuchar, vaiven suave al hablar y puntos al pensar.
export default function CloverAvatar({ state }: { state: CloverState }) {
  return (
    <div className="relative mx-auto w-[min(70vw,420px)] aspect-[1088/1456]">
      <div
        className={`absolute inset-[8%] rounded-full blur-3xl transition-all duration-500 ${
          state === 'listening' ? 'bg-emerald-400/60 animate-pulse scale-110' :
          state === 'speaking' ? 'bg-sky-400/40' : 'bg-sky-500/20'}`}
      />
      <Image
        src="/clover/clover.png"
        alt="Clover"
        fill
        priority
        sizes="420px"
        className={`relative rounded-3xl object-cover shadow-2xl ${state === 'speaking' ? 'animate-[clover-sway_1.2s_ease-in-out_infinite]' : ''}`}
      />
      {state === 'thinking' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 rounded-full bg-black/50 px-4 py-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-3 w-3 rounded-full bg-white animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      )}
      <style>{`@keyframes clover-sway { 0%,100% { transform: rotate(-1deg) translateY(0) } 50% { transform: rotate(1deg) translateY(-6px) } }`}</style>
    </div>
  );
}
```

- [ ] **Step 4: Página**

`page.tsx`:
```tsx
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, UserRound, ImageOff } from 'lucide-react';
import CloverAvatar, { CloverState } from './clover-avatar';
import { useVoice } from './use-voice';

interface Card { code: string; name: string; price: string; available: boolean; imageUrl: string | null }

const GREETING = '¡Hola! Soy Clover. Mantén presionado el botón y dime qué estás buscando.';
const ERROR_TEXT = 'Ahora no puedo responder. Pregúntale a un vendedor, por favor.';
const IDLE_RESET_MS = 60_000;

export default function TotemPage() {
  const { supported, interim, startListening, stopListening, speak } = useVoice();
  const [state, setState] = useState<CloverState>('idle');
  const [heard, setHeard] = useState('');
  const [answer, setAnswer] = useState(GREETING);
  const [cards, setCards] = useState<Card[]>([]);
  const [sellerCalled, setSellerCalled] = useState(false);
  const convId = useRef<string | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { document.title = 'Clover | Trinity ERP'; }, []);

  // Sin uso por un minuto: el siguiente cliente empieza de cero.
  const reset = useCallback(() => {
    convId.current = null;
    setHeard(''); setAnswer(GREETING); setCards([]); setSellerCalled(false); setState('idle');
  }, []);
  const touch = useCallback(() => {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(reset, IDLE_RESET_MS);
  }, [reset]);

  const ensureConversation = async () => {
    if (convId.current) return convId.current;
    const res = await fetch('/api/proxy/chatbot/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: 'KIOSK' }),
    });
    if (!res.ok) throw new Error('no se pudo crear la conversación');
    convId.current = (await res.json()).id;
    return convId.current!;
  };

  const onPressStart = () => {
    if (state === 'thinking') return;
    touch();
    setState('listening');
    startListening();
  };

  const onPressEnd = async () => {
    if (state !== 'listening') return;
    const text = await stopListening();
    if (!text) { setState('idle'); return; }
    setHeard(text);
    setState('thinking');
    try {
      const id = await ensureConversation();
      const res = await fetch(`/api/proxy/chatbot/conversations/${id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setAnswer(data.message.text);
      setCards(data.productCards ?? []);
      if (data.status !== 'BOT') setSellerCalled(true);
      setState('speaking');
      speak(data.message.text, () => setState('idle'));
    } catch {
      setAnswer(ERROR_TEXT);
      setCards([]);
      setState('speaking');
      speak(ERROR_TEXT, () => setState('idle'));
    }
    touch();
  };

  const callSeller = async () => {
    touch();
    try {
      const id = await ensureConversation();
      await fetch(`/api/proxy/chatbot/conversations/${id}/call-seller`, { method: 'POST' });
    } catch { /* igual se muestra el aviso */ }
    setSellerCalled(true);
    const msg = 'Listo, ya le aviso a un vendedor. Viene en camino.';
    setAnswer(msg);
    setState('speaking');
    speak(msg, () => setState('idle'));
  };

  if (!supported) {
    return <div className="flex min-h-screen items-center justify-center p-8 text-center text-2xl">Esta pantalla necesita Google Chrome para escuchar. Ábrela en Chrome.</div>;
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 px-4 py-6">
      <CloverAvatar state={state} />

      <div className="w-full max-w-3xl space-y-3 text-center">
        {(state === 'listening' ? interim : heard) && (
          <p className="text-lg text-sky-200/80">“{state === 'listening' ? interim : heard}”</p>
        )}
        <p className="text-2xl font-medium leading-snug">{answer}</p>
        {sellerCalled && <p className="text-lg font-semibold text-emerald-300">Un vendedor viene en camino.</p>}
      </div>

      {cards.length > 0 && (
        <div className="grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map((c) => (
            <div key={c.code} className="overflow-hidden rounded-2xl bg-white text-slate-900 shadow-lg">
              <div className="flex aspect-square items-center justify-center bg-slate-100">
                {c.imageUrl
                  ? <img src={c.imageUrl} alt={c.name} className="h-full w-full object-contain" />
                  : <ImageOff className="h-10 w-10 text-slate-400" />}
              </div>
              <div className="p-2">
                <p className="line-clamp-2 text-sm font-medium">{c.name}</p>
                <p className="text-lg font-bold text-emerald-700">{c.available ? c.price : 'Agotado'}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto flex w-full max-w-3xl flex-col items-center gap-4 pb-4">
        <button
          onPointerDown={onPressStart}
          onPointerUp={onPressEnd}
          onPointerLeave={onPressEnd}
          onContextMenu={(e) => e.preventDefault()}
          disabled={state === 'thinking'}
          className={`flex h-28 w-full items-center justify-center gap-4 rounded-full text-2xl font-bold shadow-xl transition touch-none ${
            state === 'listening' ? 'scale-95 bg-emerald-500' : 'bg-emerald-600 active:scale-95'} disabled:opacity-50`}
        >
          <Mic className="h-10 w-10" />
          {state === 'listening' ? 'Te escucho… suelta al terminar' : 'Mantén presionado para hablar'}
        </button>
        <button onClick={callSeller} className="flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 text-lg">
          <UserRound className="h-6 w-6" /> Llamar a un vendedor
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Verificar que `/totem` no lo bloquea el middleware**

Run: `grep -n "matcher" -A6 apps/web/src/middleware.ts`
Expected: `/totem` cae en el matcher (requiere login como cualquier pantalla) y no hay regla que lo redirija para roles distintos de CLIENT. Si el middleware valida permisos por ruta, agregar `/totem` asociado al módulo `chatbot`.

- [ ] **Step 6: Build**

Run: `pnpm --filter web build`
Expected: compila; aparece la ruta `/totem`.

- [ ] **Step 7: Probar en Chrome local**

Abrir `http://localhost:3000/totem` en Chrome (permitir micrófono). Probar:
1. Saludo y botón visibles; Clover sin estado.
2. Mantener presionado → halo verde y texto en vivo; soltar → puntos de "pensando" → Clover habla con vaivén y aparecen tarjetas.
3. "cuánto cuesta el cemento gris" → precio dicho como "dólares con…", tarjeta con foto.
4. "Llamar a un vendedor" → aviso; la conversación aparece escalada en Chatbot → Conversaciones.
5. Esperar 60 s sin tocar → vuelve al saludo y sin tarjetas.
6. Probar en la tablet (Chrome Android) desde la red local.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/src/app/(kiosk)" apps/web/public/clover/clover.png
git commit -m "feat: Session 181 - pantalla del totem Clover"
```

---

### Task 7: Documentación, deploy y puesta en marcha

- [ ] **Step 1: Actualizar `PROGRESS.md` y `PROJECT.md`** (Sesión 181: tótem Clover, canal KIOSK, ruta `/totem`, cómo se prueba).

- [ ] **Step 2: Commit y push**

```bash
git add PROGRESS.md PROJECT.md
git commit -m "docs: Session 181 - totem de voz Clover"
git push origin main
```

- [ ] **Step 3: Pre-deploy checklist** (`git status` limpio de lo necesario, migración commiteada). **Pedir confirmación al usuario antes de desplegar.**

- [ ] **Step 4: Deploy solo a la grande**

`ssh root@134.209.164.59 "cd /opt/Trinity && git pull origin main && bash deploy.sh"`

- [ ] **Step 5: Usuario del tótem** (con el usuario): crear un usuario "Tótem Clover" con un rol que tenga el módulo `chatbot` y NO `chatbot-config`. En la tablet: Chrome → iniciar sesión → `https://<dominio de la grande>/totem` → "Agregar a pantalla de inicio" → fijar pantalla (Android: Ajustes → Seguridad → Fijar app).

- [ ] **Step 6: Piloto**: revisión diaria de conversaciones `channel='KIOSK'` (rango UTC 04:00→04:00, `SET default_transaction_read_only=on`): qué no entendió, búsquedas sin resultado (cargar sinónimos), escalamientos y costo.
