# Chatbot: venta cruzada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el bot, al cotizar un producto, ofrezca en la misma respuesta un complemento disponible con precio, según reglas por palabras ("esmeril → disco de corte") que el usuario gestiona, con un análisis semanal de facturas que propone reglas nuevas.

**Architecture:** Reglas en `ChatbotCrossSellRule`. `ChatbotCrossSellService` calcula sugerencias para los 3 primeros resultados de `buscar_productos` (mismo motor tsquery del POS) y el resultado de la herramienta las trae en `ofrecer_tambien`; el prompt le dice al bot cuándo mencionarlas. `ChatbotCrossSellAnalysisService` (cron lunes 3 AM) agrupa productos por primera palabra y propone pares con lift. Pantalla `/chatbot/cross-sell` para reglas y sugerencias.

**Tech Stack:** NestJS 10 + Prisma 5 (Postgres, tsquery), `@nestjs/schedule`, Next.js 14 (App Router, client components, Tailwind), tests de funciones puras con `node:test` + tsx.

Spec: `docs/superpowers/specs/2026-10-12-chatbot-venta-cruzada-design.md`

**Cómo correr los tests puros:** tsx no está en el repo; instalarlo una vez en el scratchpad (`npm i tsx` en una carpeta temporal) y ejecutar
`node <scratchpad>/node_modules/tsx/dist/cli.mjs --test _cross-sell.test.ts` desde `apps/api` (los `_*.ts` están excluidos del build en `apps/api/tsconfig.json`).

**Type-check:** `cd apps/api && npx tsc --noEmit --incremental false -p tsconfig.json` (NO usar `--incremental` a secas: deja un `tsconfig.tsbuildinfo` que rompe `nest start`; si aparece, borrarlo). Web: `cd apps/web && npx tsc --noEmit -p tsconfig.json`.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `packages/database/prisma/schema.prisma` | enum `CrossSellRuleStatus`, modelos `ChatbotCrossSellRule`, `ChatbotCrossSellOffer`, campo `ChatbotConfig.crossSellAnalyzedAt` |
| `packages/database/prisma/migrations/20261012160000_chatbot_cross_sell/migration.sql` | DDL idempotente + seed de 5 reglas en PAUSED |
| `deploy/fix-schema.sql` | copia del DDL (red de seguridad) |
| `apps/api/src/modules/chatbot/cross-sell-utils.ts` | funciones PURAS: normalizar términos, clave, medidas, primera palabra, "¿se ofreció?", conteo de pares, selección de sugerencias |
| `apps/api/_cross-sell.test.ts` | tests de las funciones puras |
| `apps/api/src/modules/chatbot/chatbot-cross-sell.service.ts` | reglas (CRUD + caché), sugerencias para el bot, "probar regla", registro de lo ofrecido |
| `apps/api/src/modules/chatbot/chatbot-cross-sell-analysis.service.ts` | análisis semanal (cron) y manual |
| `apps/api/src/modules/chatbot/dto/cross-sell.dto.ts` | DTOs de reglas |
| `apps/api/src/modules/chatbot/chatbot-tools.service.ts` | `buscar_productos` agrega `ofrecer_tambien` |
| `apps/api/src/modules/chatbot/chatbot.service.ts` | herramienta con descripción actualizada; `reply()` registra lo ofrecido |
| `apps/api/src/modules/chatbot/chatbot-prompt.ts` | sección VENTA CRUZADA |
| `apps/api/src/modules/chatbot/chatbot.controller.ts` / `chatbot.module.ts` | endpoints y providers |
| `apps/web/src/app/(dashboard)/chatbot/cross-sell/page.tsx` | pantalla Reglas / Sugeridas |
| `apps/web/src/components/sidebar.tsx`, `apps/web/src/middleware.ts` | menú y permiso de ruta |

---

### Task 1: Esquema, migración y seed

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (después de `model ChatbotConfig`, ~línea 3112; y dentro de `ChatbotConfig`)
- Create: `packages/database/prisma/migrations/20261012160000_chatbot_cross_sell/migration.sql`
- Modify: `deploy/fix-schema.sql` (al final)

- [ ] **Step 1: Agregar al schema**

Dentro de `model ChatbotConfig`, antes de `updatedAt`:

```prisma
  crossSellAnalyzedAt        DateTime? // ultimo analisis de venta cruzada (sugerencias)
```

Después de `model ChatbotConfig { ... }`:

```prisma
// Venta cruzada del chatbot: "si cotiza <trigger> -> ofrecer <offerTerms>". Por PALABRAS (mismo motor
// tsquery del POS), no producto por producto. SUGGESTED/DISMISSED vienen del analisis semanal de facturas.
enum CrossSellRuleStatus {
  ACTIVE
  PAUSED
  SUGGESTED
  DISMISSED
}

model ChatbotCrossSellRule {
  id             String              @id @default(cuid())
  // Clave normalizada (minusculas, sin acentos, ofertas ordenadas): "esmeril|disco de corte|disco de desbaste"
  key            String              @unique
  trigger        String
  offerTerms     String[]            @default([])
  excludeTerms   String[]            @default([])
  status         CrossSellRuleStatus @default(PAUSED)
  statsBaseCount Int?
  statsPairPct   Float?
  statsLift      Float?
  statsAt        DateTime?
  timesOffered   Int                 @default(0)
  createdById    String?
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  @@index([status])
}

// Que regla se ofrecio en que conversacion: no repetir y contar "veces ofrecida".
model ChatbotCrossSellOffer {
  id             String   @id @default(cuid())
  conversationId String
  ruleId         String
  productId      String
  createdAt      DateTime @default(now())

  @@unique([conversationId, ruleId])
}
```

- [ ] **Step 2: Crear la migración**

`packages/database/prisma/migrations/20261012160000_chatbot_cross_sell/migration.sql`:

```sql
-- Venta cruzada del chatbot (aditivo e idempotente).
DO $$ BEGIN
  CREATE TYPE "CrossSellRuleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'SUGGESTED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ChatbotCrossSellRule" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "offerTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "excludeTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" "CrossSellRuleStatus" NOT NULL DEFAULT 'PAUSED',
  "statsBaseCount" INTEGER,
  "statsPairPct" DOUBLE PRECISION,
  "statsLift" DOUBLE PRECISION,
  "statsAt" TIMESTAMP(3),
  "timesOffered" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatbotCrossSellRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChatbotCrossSellRule_key_key" ON "ChatbotCrossSellRule"("key");
CREATE INDEX IF NOT EXISTS "ChatbotCrossSellRule_status_idx" ON "ChatbotCrossSellRule"("status");

CREATE TABLE IF NOT EXISTS "ChatbotCrossSellOffer" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatbotCrossSellOffer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChatbotCrossSellOffer_conversationId_ruleId_key"
  ON "ChatbotCrossSellOffer"("conversationId", "ruleId");

ALTER TABLE "ChatbotConfig" ADD COLUMN IF NOT EXISTS "crossSellAnalyzedAt" TIMESTAMP(3);

-- Reglas iniciales APAGADAS (el usuario las prueba y activa).
INSERT INTO "ChatbotCrossSellRule" ("id", "key", "trigger", "offerTerms", "excludeTerms", "status", "updatedAt") VALUES
  (gen_random_uuid()::text, 'esmeril|disco de corte|disco de desbaste', 'esmeril', ARRAY['disco de corte', 'disco de desbaste'], ARRAY[]::TEXT[], 'PAUSED', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'taladro|mecha', 'taladro', ARRAY['mecha'], ARRAY[]::TEXT[], 'PAUSED', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'pintura|brocha|rodillo', 'pintura', ARRAY['brocha', 'rodillo'], ARRAY['brocha', 'rodillo', 'thinner'], 'PAUSED', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'cabilla|alambre', 'cabilla', ARRAY['alambre'], ARRAY[]::TEXT[], 'PAUSED', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'poceta|lavamanos', 'poceta', ARRAY['lavamanos'], ARRAY[]::TEXT[], 'PAUSED', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
```

- [ ] **Step 3: Copiar a fix-schema**

Agregar al final de `deploy/fix-schema.sql` una línea de encabezado `-- ===== Chatbot: venta cruzada (20261012160000_chatbot_cross_sell) =====` seguida del contenido completo del Step 2 (es idempotente).

- [ ] **Step 4: Aplicar en local y verificar que Prisma no ve diferencias**

```bash
docker exec -i trinity-postgres-1 psql -U trebol -d grande_db -v ON_ERROR_STOP=1 < packages/database/prisma/migrations/20261012160000_chatbot_cross_sell/migration.sql
cd packages/database
DATABASE_URL="$(grep -E '^DATABASE_URL=' ../../apps/api/.env | head -1 | cut -d= -f2- | tr -d '"')" npx prisma migrate resolve --applied 20261012160000_chatbot_cross_sell
DATABASE_URL="$(grep -E '^DATABASE_URL=' ../../apps/api/.env | head -1 | cut -d= -f2- | tr -d '"')" npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
npx prisma generate
```

Expected: el `migrate diff` imprime solo `-- This is an empty migration.` (si muestra diferencias en `ChatbotCrossSell*`, corregir el SQL para que coincida y repetir). `SELECT count(*) FROM "ChatbotCrossSellRule"` = 5.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20261012160000_chatbot_cross_sell deploy/fix-schema.sql
git commit -m "feat: Session 159 - Venta cruzada: esquema, migracion y reglas iniciales"
```

---

### Task 2: Funciones puras de términos y medidas (TDD)

**Files:**
- Create: `apps/api/src/modules/chatbot/cross-sell-utils.ts`
- Create: `apps/api/_cross-sell.test.ts`

- [ ] **Step 1: Escribir los tests**

`apps/api/_cross-sell.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTerm, ruleKey, extractMeasures, sharesMeasure, firstSignificantWord, wasOffered,
} from './src/modules/chatbot/cross-sell-utils';

test('normalizeTerm: minusculas, sin acentos, espacios simples', () => {
  assert.equal(normalizeTerm('  Disco  de CORTE '), 'disco de corte');
  assert.equal(normalizeTerm('Pintura Esmálte'), 'pintura esmalte');
});

test('ruleKey: trigger + ofertas ordenadas y sin repetir', () => {
  assert.equal(ruleKey('Esmeril', ['Disco de desbaste', 'disco de corte']), 'esmeril|disco de corte|disco de desbaste');
  assert.equal(ruleKey('taladro', ['mecha', 'Mecha']), 'taladro|mecha');
});

test('extractMeasures: fracciones mixtas, simples y milimetros', () => {
  assert.deepEqual([...extractMeasures('ESMERIL ANGULAR 4-1/2" DEWALT')].sort(), ['4-1/2']);
  assert.deepEqual([...extractMeasures('DISCO DE CORTE 4 1/2 X 1/16 NORTON')].sort(), ['1/16', '4-1/2']);
  assert.deepEqual([...extractMeasures('BARRA CON RESALTE 10MM')], ['10mm']);
  assert.deepEqual([...extractMeasures('MARTILLO UÑA')], []);
});

test('sharesMeasure', () => {
  assert.equal(sharesMeasure(extractMeasures('ESMERIL 4-1/2'), extractMeasures('DISCO 4 1/2 CORTE')), true);
  assert.equal(sharesMeasure(extractMeasures('ESMERIL 7"'), extractMeasures('DISCO 4-1/2')), false);
  assert.equal(sharesMeasure(new Set(), extractMeasures('DISCO 4-1/2')), false);
});

test('firstSignificantWord: salta medidas, numeros y palabras vacias', () => {
  assert.equal(firstSignificantWord('ESMERIL ANGULAR 4-1/2 DEWALT'), 'esmeril');
  assert.equal(firstSignificantWord('1/2 TUBO PVC'), 'tubo');
  assert.equal(firstSignificantWord('DE CEMENTO GRIS'), 'cemento');
  assert.equal(firstSignificantWord('X 10 2'), null);
});

test('wasOffered: el texto menciona la mayoria de las palabras del producto', () => {
  const name = 'DISCO DE CORTE 4-1/2" X 1/16 NORTON';
  assert.equal(wasOffered(name, 'Para usarlo también tenemos Disco de corte 4½" Norton a 1,20$ bcv.'), true);
  assert.equal(wasOffered(name, 'El esmeril está en 85$ bcv. ¿Buscas algo más?'), false);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run (desde `apps/api`): `node <scratchpad>/node_modules/tsx/dist/cli.mjs --test _cross-sell.test.ts`
Expected: FAIL (no existe `cross-sell-utils`).

- [ ] **Step 3: Implementar**

`apps/api/src/modules/chatbot/cross-sell-utils.ts`:

```ts
// Funciones PURAS de la venta cruzada del chatbot (sin Nest ni Prisma): se testean en _cross-sell.test.ts.

const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'para', 'p', 'con', 'sin', 'x', 'y', 'en', 'a', 'al', 'por', 'tipo', 'und', 'unid',
]);

// Minusculas, sin acentos, espacios simples. Asi se guardan y comparan triggers y ofertas.
export function normalizeTerm(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Clave unica de una regla: trigger + ofertas ordenadas y sin repetir.
export function ruleKey(trigger: string, offerTerms: string[]): string {
  const offers = [...new Set(offerTerms.map(normalizeTerm).filter(Boolean))].sort();
  return [normalizeTerm(trigger), ...offers].join('|');
}

// Medidas del nombre: "4-1/2" / "4 1/2" -> "4-1/2"; "3/8" -> "3/8"; "10MM" -> "10mm". "½" se trata como 1/2.
export function extractMeasures(name: string): Set<string> {
  const s = normalizeTerm(name).replace(/½/g, ' 1/2').replace(/¼/g, ' 1/4').replace(/¾/g, ' 3/4');
  const out = new Set<string>();
  const re = /(\d+)\s*[- ]\s*(\d+)\s*\/\s*(\d+)|(\d+)\s*\/\s*(\d+)|(\d+(?:[.,]\d+)?)\s*(mm|cm)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m[1]) out.add(`${m[1]}-${m[2]}/${m[3]}`);
    else if (m[4]) out.add(`${m[4]}/${m[5]}`);
    else out.add(`${m[6].replace(',', '.')}${m[7]}`);
  }
  return out;
}

export function sharesMeasure(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

// Palabras "con significado" de un nombre: >= 3 letras, sin digitos ni palabras vacias.
function significantWords(name: string): string[] {
  return normalizeTerm(name).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !/\d/.test(w) && !STOPWORDS.has(w));
}

// Tipo de producto para agrupar en el analisis: primera palabra significativa ("ESMERIL ANGULAR..." -> "esmeril").
export function firstSignificantWord(name: string): string | null {
  return significantWords(name)[0] ?? null;
}

// Heuristica: el bot "ofrecio" el producto si su respuesta menciona >= 60% de las palabras significativas
// del nombre (el bot suele acortar nombres y quitar codigos).
export function wasOffered(productName: string, text: string): boolean {
  const words = significantWords(productName);
  if (!words.length) return false;
  const t = normalizeTerm(text);
  const hits = words.filter((w) => t.includes(w)).length;
  return hits / words.length >= 0.6;
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node <scratchpad>/node_modules/tsx/dist/cli.mjs --test _cross-sell.test.ts`
Expected: `ℹ pass 6`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/chatbot/cross-sell-utils.ts apps/api/_cross-sell.test.ts
git commit -m "feat: Session 159 - Venta cruzada: utilidades puras (terminos, medidas) con tests"
```

---

### Task 3: Conteo de pares y selección de sugerencias (TDD)

**Files:**
- Modify: `apps/api/src/modules/chatbot/cross-sell-utils.ts` (al final)
- Modify: `apps/api/_cross-sell.test.ts` (al final)

- [ ] **Step 1: Agregar tests**

Al final de `apps/api/_cross-sell.test.ts` (y agregar `countPairs, selectSuggestions` al import):

```ts
test('countPairs: cuenta facturas por grupo y por par (sin orden)', () => {
  const c = countPairs([
    new Set(['esmeril', 'disco']),
    new Set(['esmeril', 'disco', 'cemento']),
    new Set(['cemento']),
    new Set(['esmeril']),
  ]);
  assert.equal(c.total, 4);
  assert.equal(c.single.get('esmeril'), 3);
  assert.equal(c.single.get('cemento'), 2);
  assert.equal(c.pair.get('disco|esmeril'), 2);
  assert.equal(c.pair.get('cemento|esmeril'), 1);
});

test('selectSuggestions: aplica base, % y lift; max por trigger; ordena por lift', () => {
  // 100 facturas: 40 con esmeril, 20 de ellas con disco; disco aparece en 25 en total.
  // cemento aparece en 80 (en 30 de las de esmeril): % alto pero lift < 2 -> no se sugiere.
  const sets: Set<string>[] = [];
  for (let i = 0; i < 100; i++) {
    const s = new Set<string>();
    if (i < 40) s.add('esmeril');
    if (i < 20 || i >= 95) s.add('disco'); // disco en 25 facturas -> lift = 50% / 25% = 2.0
    if (i >= 10 && i < 90) s.add('cemento');
    sets.push(s);
  }
  const out = selectSuggestions(countPairs(sets), { minBase: 20, minPct: 15, minLift: 2, maxPerTrigger: 3 });
  const esm = out.filter((s) => s.trigger === 'esmeril');
  assert.deepEqual(esm.map((s) => s.offer), ['disco']);
  assert.equal(esm[0].base, 40);
  assert.equal(esm[0].pct, 50);
  assert.equal(esm[0].lift, 2);
  // cemento: 30 de 40 facturas con esmeril (75%) pero esta en 80 de 100 -> lift 0.94 -> no se sugiere
  assert.ok(!esm.some((s) => s.offer === 'cemento'));
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node <scratchpad>/node_modules/tsx/dist/cli.mjs --test _cross-sell.test.ts`
Expected: FAIL (`countPairs` no existe).

- [ ] **Step 3: Implementar (al final de cross-sell-utils.ts)**

```ts
export interface PairCounts {
  total: number;                 // facturas
  single: Map<string, number>;   // grupo -> nº de facturas con ese grupo
  pair: Map<string, number>;     // "a|b" (a < b) -> nº de facturas con ambos
}

// Cada factura = conjunto de grupos (primera palabra de sus productos).
export function countPairs(invoices: Set<string>[]): PairCounts {
  const single = new Map<string, number>();
  const pair = new Map<string, number>();
  for (const set of invoices) {
    const g = [...set].sort();
    for (let i = 0; i < g.length; i++) {
      single.set(g[i], (single.get(g[i]) || 0) + 1);
      for (let j = i + 1; j < g.length; j++) {
        const k = `${g[i]}|${g[j]}`;
        pair.set(k, (pair.get(k) || 0) + 1);
      }
    }
  }
  return { total: invoices.length, single, pair };
}

export interface CrossSellSuggestion { trigger: string; offer: string; base: number; pct: number; lift: number }

// A -> B se sugiere si: facturas con A >= minBase, % de esas que llevan B >= minPct y
// lift = %(B|A) / %(B) >= minLift (evita lo que va en casi todas las facturas, como el cemento).
export function selectSuggestions(
  c: PairCounts,
  opts: { minBase: number; minPct: number; minLift: number; maxPerTrigger: number },
): CrossSellSuggestion[] {
  const byTrigger = new Map<string, CrossSellSuggestion[]>();
  const consider = (a: string, b: string, both: number) => {
    const base = c.single.get(a) || 0;
    const bCount = c.single.get(b) || 0;
    if (base < opts.minBase || !bCount || !c.total) return;
    const pct = (both / base) * 100;
    const lift = (both / base) / (bCount / c.total);
    if (pct < opts.minPct || lift < opts.minLift) return;
    const list = byTrigger.get(a) ?? [];
    list.push({ trigger: a, offer: b, base, pct: Math.round(pct * 10) / 10, lift: Math.round(lift * 10) / 10 });
    byTrigger.set(a, list);
  };
  for (const [k, both] of c.pair) {
    const [a, b] = k.split('|');
    consider(a, b, both);
    consider(b, a, both);
  }
  const out: CrossSellSuggestion[] = [];
  for (const list of byTrigger.values()) {
    out.push(...list.sort((x, y) => y.lift - x.lift).slice(0, opts.maxPerTrigger));
  }
  return out;
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node <scratchpad>/node_modules/tsx/dist/cli.mjs --test _cross-sell.test.ts`
Expected: `ℹ pass 8`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/chatbot/cross-sell-utils.ts apps/api/_cross-sell.test.ts
git commit -m "feat: Session 159 - Venta cruzada: conteo de pares y seleccion de sugerencias con tests"
```

---

### Task 4: Servicio de venta cruzada

**Files:**
- Create: `apps/api/src/modules/chatbot/dto/cross-sell.dto.ts`
- Create: `apps/api/src/modules/chatbot/chatbot-cross-sell.service.ts`
- Modify: `apps/api/src/modules/chatbot/chatbot-tools.service.ts:11-12` (mover `VARIANT_RE` a utils)

- [ ] **Step 1: DTOs**

`apps/api/src/modules/chatbot/dto/cross-sell.dto.ts`:

```ts
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CrossSellRuleDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(60) trigger: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2)
  @IsString({ each: true }) @MinLength(2, { each: true }) @MaxLength(60, { each: true }) offerTerms: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(10)
  @IsString({ each: true }) @MaxLength(60, { each: true }) excludeTerms?: string[];
  @ApiPropertyOptional({ enum: ['ACTIVE', 'PAUSED'] }) @IsOptional() @IsIn(['ACTIVE', 'PAUSED']) status?: 'ACTIVE' | 'PAUSED';
}

export class UpdateCrossSellRuleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(60) trigger?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2)
  @IsString({ each: true }) @MinLength(2, { each: true }) @MaxLength(60, { each: true }) offerTerms?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(10)
  @IsString({ each: true }) @MaxLength(60, { each: true }) excludeTerms?: string[];
  // DISMISSED = descartar una sugerencia (el analisis no la vuelve a proponer).
  @ApiPropertyOptional({ enum: ['ACTIVE', 'PAUSED', 'DISMISSED'] }) @IsOptional() @IsIn(['ACTIVE', 'PAUSED', 'DISMISSED'])
  status?: 'ACTIVE' | 'PAUSED' | 'DISMISSED';
}

export class TestCrossSellRuleDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(60) trigger: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2)
  @IsString({ each: true }) @MinLength(2, { each: true }) @MaxLength(60, { each: true }) offerTerms: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(10)
  @IsString({ each: true }) @MaxLength(60, { each: true }) excludeTerms?: string[];
}
```

- [ ] **Step 2: Mover VARIANT_RE a cross-sell-utils**

Mover la constante `VARIANT_RE` (con su comentario sobre (B)/(D)) de `chatbot-tools.service.ts` al final de `cross-sell-utils.ts` como `export const VARIANT_RE = ...`, y en `chatbot-tools.service.ts` reemplazarla por `import { VARIANT_RE } from './cross-sell-utils';`. Así ambos servicios la importan de utils sin ciclo de imports.

- [ ] **Step 3: Servicio**

`apps/api/src/modules/chatbot/chatbot-cross-sell.service.ts`:

```ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CrossSellRuleStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { productSearchTsQuery } from '../../common/product-search';
import { VARIANT_RE, extractMeasures, normalizeTerm, ruleKey, sharesMeasure, wasOffered } from './cross-sell-utils';
import { CrossSellRuleDto, TestCrossSellRuleDto, UpdateCrossSellRuleDto } from './dto/cross-sell.dto';

const SOURCE_PRODUCTS = 3;   // solo los primeros resultados de buscar_productos llevan sugerencias
const MAX_PER_PRODUCT = 2;   // maximo de complementos por producto cotizado
const RULES_TTL_MS = 60_000;

type ActiveRule = { id: string; trigger: string; offerTerms: string[]; excludeTerms: string[] };
type CandRow = { id: string; code: string; name: string; priceDetal: number; categoryId: string | null; stock: number; sold: number };

export interface CrossSellPick { productId: string; code: string; name: string; priceDetal: number; categoryId: string | null }
export interface CrossSellCandidate extends CrossSellPick { ruleId: string }

@Injectable()
export class ChatbotCrossSellService {
  private cache: { at: number; rules: ActiveRule[] } | null = null;

  constructor(
    private prisma: PrismaService,
    private invoices: InvoicesService,
  ) {}

  invalidate() { this.cache = null; }

  private async activeRules(): Promise<ActiveRule[]> {
    if (this.cache && Date.now() - this.cache.at < RULES_TTL_MS) return this.cache.rules;
    const rules = await this.prisma.chatbotCrossSellRule.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, trigger: true, offerTerms: true, excludeTerms: true },
      orderBy: { createdAt: 'asc' },
    });
    this.cache = { at: Date.now(), rules };
    return rules;
  }

  // tsquery OR de varios terminos: "(a:* & b:*) | (c:*)". '' si no hay ninguno.
  private orTsQuery(terms: string[]): string {
    return terms.map(productSearchTsQuery).filter(Boolean).map((q) => `(${q})`).join(' | ');
  }

  // productId -> ids de reglas cuyo trigger coincide con el producto (y ningun termino excluido).
  private async matchRules(productIds: string[], rules: ActiveRule[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    const usable = rules
      .map((r) => ({ id: r.id, tsq: productSearchTsQuery(r.trigger), ex: this.orTsQuery(r.excludeTerms) }))
      .filter((r) => r.tsq);
    if (!productIds.length || !usable.length) return out;
    const rows = await this.prisma.$queryRaw<{ productId: string; ruleId: string }[]>`
      SELECT p.id AS "productId", x.rid AS "ruleId"
      FROM unnest(${usable.map((r) => r.id)}::text[], ${usable.map((r) => r.tsq)}::text[], ${usable.map((r) => r.ex)}::text[])
        AS x(rid, tsq, ex)
      JOIN "Product" p ON p.id = ANY(${productIds}::text[])
       AND p."searchVector" @@ to_tsquery('spanish', x.tsq)
       AND (CASE WHEN x.ex = '' THEN true ELSE NOT (p."searchVector" @@ to_tsquery('spanish', x.ex)) END)`;
    const order = new Map(usable.map((r, i) => [r.id, i]));
    for (const r of rows) out.set(r.productId, [...(out.get(r.productId) ?? []), r.ruleId]);
    for (const [k, v] of out) out.set(k, v.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)));
    return out;
  }

  // Mejor producto disponible para un termino a ofrecer: misma medida que el cotizado -> mas vendido.
  // Nunca el mismo producto, ni uno que tambien dispararia la regla (evita "rodillo -> rodillo").
  private async pickCandidate(
    term: string, trigger: string, excludeIds: string[], measures: Set<string>, reserved: Record<string, number>,
  ): Promise<CrossSellPick | null> {
    const tsq = productSearchTsQuery(term);
    const trigTsq = productSearchTsQuery(trigger);
    if (!tsq || !trigTsq) return null;
    const rows = await this.prisma.$queryRaw<CandRow[]>`
      SELECT p.id, p.code, p.name, p."priceDetal", p."categoryId",
        COALESCE((SELECT SUM(s.quantity) FROM "Stock" s JOIN "Warehouse" w ON w.id = s."warehouseId"
                  WHERE s."productId" = p.id AND w."countsForSale" = true), 0)::float AS stock,
        COALESCE((SELECT COUNT(DISTINCT ii."invoiceId") FROM "InvoiceItem" ii JOIN "Invoice" i ON i.id = ii."invoiceId"
                  WHERE ii."productId" = p.id AND i.status IN ('PAID', 'PARTIAL_RETURN')
                    AND i."createdAt" >= now() - interval '90 days'), 0)::float AS sold
      FROM "Product" p
      WHERE p."isActive" AND p."priceDetal" > 0 AND NOT p."saleBlocked" AND NOT p."isService"
        AND p."searchVector" @@ to_tsquery('spanish', ${tsq})
        AND NOT (p."searchVector" @@ to_tsquery('spanish', ${trigTsq}))
        AND NOT (p.id = ANY(${excludeIds}::text[]))
      ORDER BY sold DESC
      LIMIT 60`;
    const ok = rows
      .filter((r) => Number(r.stock) - (reserved[r.id] || 0) > 0 && !VARIANT_RE.test(r.name))
      .map((r) => ({ r, same: sharesMeasure(measures, extractMeasures(r.name)) }))
      .sort((a, b) => Number(b.same) - Number(a.same) || Number(b.r.sold) - Number(a.r.sold));
    const best = ok[0]?.r;
    return best ? { productId: best.id, code: best.code, name: best.name, priceDetal: Number(best.priceDetal), categoryId: best.categoryId } : null;
  }

  // Sugerencias para los primeros productos de buscar_productos. conversationId null = prueba sin conversacion.
  async suggestFor(conversationId: string | null, products: { id: string; name: string }[]): Promise<Map<string, CrossSellCandidate[]>> {
    const result = new Map<string, CrossSellCandidate[]>();
    const rules = await this.activeRules();
    const src = products.slice(0, SOURCE_PRODUCTS);
    if (!rules.length || !src.length) return result;
    const matches = await this.matchRules(src.map((p) => p.id), rules);
    if (!matches.size) return result;
    const offered = new Set(
      conversationId
        ? (await this.prisma.chatbotCrossSellOffer.findMany({ where: { conversationId }, select: { ruleId: true } })).map((o) => o.ruleId)
        : [],
    );
    const reserved = await this.invoices.getReservedStock();
    const byId = new Map(rules.map((r) => [r.id, r]));
    for (const p of src) {
      const list: CrossSellCandidate[] = [];
      const measures = extractMeasures(p.name);
      for (const ruleId of matches.get(p.id) ?? []) {
        if (offered.has(ruleId) || list.length >= MAX_PER_PRODUCT) continue;
        const rule = byId.get(ruleId)!;
        for (const term of rule.offerTerms) {
          if (list.length >= MAX_PER_PRODUCT) break;
          const pick = await this.pickCandidate(term, rule.trigger, [p.id, ...list.map((c) => c.productId)], measures, reserved);
          if (pick) list.push({ ruleId, ...pick });
        }
      }
      if (list.length) result.set(p.id, list);
    }
    return result;
  }

  // "Probar regla": cuantos productos la disparan y ejemplos reales (los mas vendidos) con lo que ofreceria.
  async testRule(dto: TestCrossSellRuleDto) {
    const tsq = productSearchTsQuery(dto.trigger);
    if (!tsq) throw new BadRequestException('Escribe al menos una palabra en "Si cotiza"');
    const ex = this.orTsQuery(dto.excludeTerms ?? []);
    const where = Prisma.sql`p."isActive" AND p."priceDetal" > 0
      AND p."searchVector" @@ to_tsquery('spanish', ${tsq})
      AND (CASE WHEN ${ex} = '' THEN true ELSE NOT (p."searchVector" @@ to_tsquery('spanish', ${ex})) END)`;
    const [{ n }] = await this.prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM "Product" p WHERE ${where}`;
    const sample = await this.prisma.$queryRaw<{ id: string; code: string; name: string; priceDetal: number }[]>`
      SELECT p.id, p.code, p.name, p."priceDetal" FROM "Product" p WHERE ${where}
      ORDER BY (SELECT COUNT(*) FROM "InvoiceItem" ii WHERE ii."productId" = p.id) DESC, p.name
      LIMIT 8`;
    const reserved = await this.invoices.getReservedStock();
    const examples: { product: { code: string; name: string; priceDetal: number }; offers: CrossSellPick[] }[] = [];
    for (const s of sample) {
      const offers: CrossSellPick[] = [];
      for (const term of dto.offerTerms.slice(0, MAX_PER_PRODUCT)) {
        const pick = await this.pickCandidate(term, dto.trigger, [s.id, ...offers.map((o) => o.productId)], extractMeasures(s.name), reserved);
        if (pick) offers.push(pick);
      }
      examples.push({ product: { code: s.code, name: s.name, priceDetal: Number(s.priceDetal) }, offers });
    }
    return { matchCount: n, examples };
  }

  // ---------- CRUD ----------

  async list(status?: CrossSellRuleStatus) {
    const [rules, cfg] = await Promise.all([
      this.prisma.chatbotCrossSellRule.findMany({
        where: status ? { status } : { status: { in: ['ACTIVE', 'PAUSED', 'SUGGESTED'] } },
        orderBy: [{ status: 'asc' }, { trigger: 'asc' }],
      }),
      this.prisma.chatbotConfig.findUnique({ where: { id: 'default' }, select: { crossSellAnalyzedAt: true } }),
    ]);
    return { rules, analyzedAt: cfg?.crossSellAnalyzedAt ?? null };
  }

  private clean(terms: string[] | undefined) {
    return [...new Set((terms ?? []).map(normalizeTerm).filter(Boolean))];
  }

  private async assertFreeKey(key: string, exceptId?: string) {
    const dup = await this.prisma.chatbotCrossSellRule.findUnique({ where: { key }, select: { id: true, status: true } });
    if (dup && dup.id !== exceptId) {
      throw new ConflictException(dup.status === 'DISMISSED'
        ? 'Esa regla fue descartada antes; búscala en Sugeridas o cambia las palabras.'
        : 'Ya existe una regla igual.');
    }
  }

  async create(dto: CrossSellRuleDto, userId: string) {
    const trigger = normalizeTerm(dto.trigger);
    const offerTerms = this.clean(dto.offerTerms);
    if (!trigger || !offerTerms.length) throw new BadRequestException('Indica qué cotiza y qué ofrecer');
    const key = ruleKey(trigger, offerTerms);
    await this.assertFreeKey(key);
    const rule = await this.prisma.chatbotCrossSellRule.create({
      data: { key, trigger, offerTerms, excludeTerms: this.clean(dto.excludeTerms), status: dto.status ?? 'PAUSED', createdById: userId },
    });
    this.invalidate();
    return rule;
  }

  async update(id: string, dto: UpdateCrossSellRuleDto) {
    const rule = await this.prisma.chatbotCrossSellRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Regla no encontrada');
    const trigger = dto.trigger !== undefined ? normalizeTerm(dto.trigger) : rule.trigger;
    const offerTerms = dto.offerTerms !== undefined ? this.clean(dto.offerTerms) : rule.offerTerms;
    if (!trigger || !offerTerms.length) throw new BadRequestException('Indica qué cotiza y qué ofrecer');
    const key = ruleKey(trigger, offerTerms);
    if (key !== rule.key) await this.assertFreeKey(key, id);
    const updated = await this.prisma.chatbotCrossSellRule.update({
      where: { id },
      data: {
        key, trigger, offerTerms,
        ...(dto.excludeTerms !== undefined ? { excludeTerms: this.clean(dto.excludeTerms) } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
    this.invalidate();
    return updated;
  }

  async remove(id: string) {
    await this.prisma.$transaction([
      this.prisma.chatbotCrossSellOffer.deleteMany({ where: { ruleId: id } }),
      this.prisma.chatbotCrossSellRule.delete({ where: { id } }),
    ]);
    this.invalidate();
    return { ok: true };
  }

  // Tras cada respuesta del bot: lo que el texto final realmente menciono cuenta como "ofrecido"
  // (no se repite en la conversacion y suma a "Veces ofrecida").
  async recordOffered(conversationId: string, toolLog: { name: string; result: unknown }[], finalText: string) {
    const seen = new Set<string>();
    for (const t of toolLog) {
      if (t.name !== 'buscar_productos') continue;
      const productos = ((t.result as any)?.productos ?? []) as { ofrecer_tambien?: { codigo: string; nombre: string; regla_id: string }[] }[];
      for (const p of productos) {
        for (const o of p.ofrecer_tambien ?? []) {
          if (seen.has(o.regla_id) || !wasOffered(o.nombre, finalText)) continue;
          seen.add(o.regla_id);
          const prod = await this.prisma.product.findFirst({ where: { code: o.codigo }, select: { id: true } });
          if (!prod) continue;
          try {
            await this.prisma.$transaction([
              this.prisma.chatbotCrossSellOffer.create({ data: { conversationId, ruleId: o.regla_id, productId: prod.id } }),
              this.prisma.chatbotCrossSellRule.update({ where: { id: o.regla_id }, data: { timesOffered: { increment: 1 } } }),
            ]);
          } catch (e) {
            // P2002 = ya se registro en esta conversacion; P2025 = la regla se borro entre medio.
            if (!(e instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2025'].includes(e.code))) throw e;
          }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Type-check**

Run: `cd apps/api && npx tsc --noEmit --incremental false -p tsconfig.json`
Expected: sin errores (el servicio aún no está registrado en el módulo; compila igual).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/chatbot/chatbot-cross-sell.service.ts apps/api/src/modules/chatbot/dto/cross-sell.dto.ts apps/api/src/modules/chatbot/chatbot-tools.service.ts
git commit -m "feat: Session 159 - Venta cruzada: servicio de reglas y sugerencias"
```

---

### Task 5: Conectar con el bot (búsqueda, registro y prompt)

**Files:**
- Modify: `apps/api/src/modules/chatbot/chatbot-tools.service.ts` (interfaz `BotProduct`, constructor, final de `searchProducts`)
- Modify: `apps/api/src/modules/chatbot/chatbot.service.ts` (constructor, `reply()` antes de `saveBotMessage(conversationId, finalText, ...)`)
- Modify: `apps/api/src/modules/chatbot/chatbot-prompt.ts` (después de la línea de FOTOS)
- Modify: `apps/api/src/modules/chatbot/chatbot.module.ts`

- [ ] **Step 1: `BotProduct` y constructor de tools**

En `chatbot-tools.service.ts`, dentro de `interface BotProduct` agregar:

```ts
  // Venta cruzada: complementos para ofrecer si el bot cotiza ESTE producto (solo los 3 primeros resultados).
  ofrecer_tambien?: { codigo: string; nombre: string; precio_bcv: string; precio_divisas: string; regla_id: string }[];
```

Constructor:

```ts
  constructor(
    private prisma: PrismaService,
    private invoices: InvoicesService,
    private crossSell: ChatbotCrossSellService,
  ) {}
```

con `import { ChatbotCrossSellService } from './chatbot-cross-sell.service';`.

- [ ] **Step 2: Sugerencias en `searchProducts`**

Justo antes de `const productos: BotProduct[] = ranked.map(...)`:

```ts
    const suggestions = await this.crossSell.suggestFor(
      conversationId,
      ranked.map(({ r }) => ({ id: r.id as string, name: r.name as string })),
    );
```

Y dentro del objeto que arma cada producto, al final (después de `...(qty ? { alcanza: enough } : {})`):

```ts
      ...(suggestions.get(r.id)?.length
        ? {
            ofrecer_tambien: suggestions.get(r.id)!.map((s) => ({
              codigo: s.code,
              nombre: s.name,
              precio_bcv: `${usd(s.priceDetal)} bcv`,
              precio_divisas: this.divisaPrice(cfg, { id: s.productId, categoryId: s.categoryId, priceDetal: s.priceDetal }),
              regla_id: s.ruleId,
            })),
          }
        : {}),
```

- [ ] **Step 3: Registrar lo ofrecido en `reply()`**

En `chatbot.service.ts`, inyectar `private crossSell: ChatbotCrossSellService` en el constructor (import desde `./chatbot-cross-sell.service`). Justo antes del `return this.saveBotMessage(conversationId, finalText, { escalated: out.escalated, ... })` final:

```ts
    // Venta cruzada: marcar como ofrecido lo que la respuesta realmente menciono (nunca rompe la respuesta).
    await this.crossSell.recordOffered(conversationId, toolLog, finalText).catch((e) =>
      this.logger.error(`Venta cruzada: no se pudo registrar lo ofrecido: ${(e as Error).message}`));
```

(`this.logger` ya existe en `ChatbotService`; si no, crear `private readonly logger = new Logger(ChatbotService.name)`.)

Actualizar la descripción de la herramienta `buscar_productos` en `TOOLS` agregando al final del texto: `' Los primeros resultados pueden traer "ofrecer_tambien" (complementos para ofrecer).'`

- [ ] **Step 4: Prompt**

En `chatbot-prompt.ts`, después de la viñeta `- FOTOS: ...`:

```ts
- VENTA CRUZADA: si en tu respuesta cotizas UN solo producto y ese producto trae "ofrecer_tambien", menciona esos complementos en la MISMA respuesta con su precio_bcv, en una frase corta ("Para usarlo también tenemos Disco de corte 4½" Norton a 1.20$ bcv.") y cierra preguntando si lo agrega. Si listas varios productos, no ofrezcas todavía (hazlo cuando el cliente elija uno). No repitas un complemento que ya ofreciste en esta conversación. Nunca ofrezcas complementos que no vengan en "ofrecer_tambien".
```

- [ ] **Step 5: Módulo**

`chatbot.module.ts`: agregar `ChatbotCrossSellService` a `providers` (import desde `./chatbot-cross-sell.service`).

- [ ] **Step 6: Type-check y tests puros**

Run: `cd apps/api && npx tsc --noEmit --incremental false -p tsconfig.json` → sin errores.
Run: `node <scratchpad>/node_modules/tsx/dist/cli.mjs --test _cross-sell.test.ts` → `pass 8`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/chatbot
git commit -m "feat: Session 159 - Venta cruzada: el bot recibe y ofrece complementos"
```

---

### Task 6: Análisis semanal

**Files:**
- Create: `apps/api/src/modules/chatbot/chatbot-cross-sell-analysis.service.ts`
- Modify: `apps/api/src/modules/chatbot/chatbot.module.ts`

- [ ] **Step 1: Servicio**

```ts
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDayStart } from '../../common/timezone';
import { ChatbotCrossSellService } from './chatbot-cross-sell.service';
import { countPairs, firstSignificantWord, normalizeTerm, ruleKey, selectSuggestions } from './cross-sell-utils';

const WINDOW_DAYS = 90;
const THRESHOLDS = { minBase: 20, minPct: 15, minLift: 2, maxPerTrigger: 3 };

// Analisis de "que se compra junto": SOLO propone (status SUGGESTED); el bot usa solo reglas ACTIVE.
@Injectable()
export class ChatbotCrossSellAnalysisService {
  private readonly logger = new Logger(ChatbotCrossSellAnalysisService.name);
  private running = false;

  constructor(
    private prisma: PrismaService,
    private crossSell: ChatbotCrossSellService,
  ) {}

  @Cron('0 0 3 * * 1', { timeZone: 'America/Caracas' }) // lunes 3:00 AM Caracas
  async weekly() {
    try {
      const r = await this.analyze();
      this.logger.log(`Venta cruzada: ${r.suggestions} sugerencias de ${r.invoices} facturas`);
    } catch (e) {
      this.logger.error(`Venta cruzada: analisis fallo: ${(e as Error).message}`);
    }
  }

  async analyze() {
    if (this.running) throw new ConflictException('El análisis ya se está ejecutando');
    this.running = true;
    try {
      const from = caracasDayStart(new Date(Date.now() - WINDOW_DAYS * 86_400_000));
      const lines = await this.prisma.$queryRaw<{ invoiceId: string; productId: string }[]>`
        SELECT DISTINCT ii."invoiceId", ii."productId"
        FROM "InvoiceItem" ii
        JOIN "Invoice" i ON i.id = ii."invoiceId"
        LEFT JOIN "Customer" c ON c.id = i."customerId"
        WHERE i.status IN ('PAID', 'PARTIAL_RETURN') AND i."paidAt" >= ${from}
          AND COALESCE(c."isGroupCompany", false) = false`;
      const productIds = [...new Set(lines.map((l) => l.productId))];
      const names = await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } });
      const group = new Map(names.map((p) => [p.id, firstSignificantWord(p.name)]));

      const perInvoice = new Map<string, Set<string>>();
      for (const l of lines) {
        const g = group.get(l.productId);
        if (!g) continue;
        const set = perInvoice.get(l.invoiceId) ?? new Set<string>();
        set.add(g);
        perInvoice.set(l.invoiceId, set);
      }
      const suggestions = selectSuggestions(countPairs([...perInvoice.values()]), THRESHOLDS);

      const now = new Date();
      const existing = await this.prisma.chatbotCrossSellRule.findMany({
        select: { id: true, trigger: true, offerTerms: true, status: true },
      });
      const keepSuggested: string[] = [];
      for (const s of suggestions) {
        const stats = { statsBaseCount: s.base, statsPairPct: s.pct, statsLift: s.lift, statsAt: now };
        const match = existing.find(
          (r) => normalizeTerm(r.trigger) === s.trigger && r.offerTerms.map(normalizeTerm).includes(s.offer),
        );
        if (match) {
          await this.prisma.chatbotCrossSellRule.update({ where: { id: match.id }, data: stats });
          if (match.status === 'SUGGESTED') keepSuggested.push(match.id);
          continue;
        }
        const created = await this.prisma.chatbotCrossSellRule.create({
          data: { key: ruleKey(s.trigger, [s.offer]), trigger: s.trigger, offerTerms: [s.offer], status: 'SUGGESTED', ...stats },
        });
        keepSuggested.push(created.id);
      }
      await this.prisma.chatbotCrossSellRule.deleteMany({ where: { status: 'SUGGESTED', id: { notIn: keepSuggested } } });
      await this.prisma.chatbotConfig.upsert({
        where: { id: 'default' },
        create: { id: 'default', crossSellAnalyzedAt: now },
        update: { crossSellAnalyzedAt: now },
      });
      this.crossSell.invalidate();
      return { invoices: perInvoice.size, suggestions: suggestions.length, analyzedAt: now };
    } finally {
      this.running = false;
    }
  }
}
```

- [ ] **Step 2: Registrar en el módulo**

`chatbot.module.ts`: agregar `ChatbotCrossSellAnalysisService` a `providers`.

- [ ] **Step 3: Type-check**

Run: `cd apps/api && npx tsc --noEmit --incremental false -p tsconfig.json` → sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/chatbot
git commit -m "feat: Session 159 - Venta cruzada: analisis semanal de facturas (sugerencias)"
```

---

### Task 7: Endpoints

**Files:**
- Modify: `apps/api/src/modules/chatbot/chatbot.controller.ts`

- [ ] **Step 1: Inyectar y agregar rutas**

Imports: `Delete` de `@nestjs/common`; `CrossSellRuleStatus` de `@prisma/client`; `ChatbotCrossSellService`, `ChatbotCrossSellAnalysisService`; DTOs de `./dto/cross-sell.dto`.

Constructor:

```ts
  constructor(
    private service: ChatbotService,
    private crossSell: ChatbotCrossSellService,
    private crossSellAnalysis: ChatbotCrossSellAnalysisService,
  ) {}
```

Rutas (al final de la clase), todas con `@RequireModule('chatbot-config')`:

```ts
  // ---------- Venta cruzada (permiso de configuracion) ----------

  @Get('cross-sell/rules')
  @RequireModule('chatbot-config')
  crossSellRules(@Query('status') status?: CrossSellRuleStatus) {
    return this.crossSell.list(status);
  }

  @Post('cross-sell/rules/test')
  @RequireModule('chatbot-config')
  crossSellTest(@Body() dto: TestCrossSellRuleDto) {
    return this.crossSell.testRule(dto);
  }

  @Post('cross-sell/rules')
  @RequireModule('chatbot-config')
  crossSellCreate(@Body() dto: CrossSellRuleDto, @CurrentUser('id') userId: string) {
    return this.crossSell.create(dto, userId);
  }

  @Patch('cross-sell/rules/:id')
  @RequireModule('chatbot-config')
  crossSellUpdate(@Param('id') id: string, @Body() dto: UpdateCrossSellRuleDto) {
    return this.crossSell.update(id, dto);
  }

  @Delete('cross-sell/rules/:id')
  @RequireModule('chatbot-config')
  crossSellDelete(@Param('id') id: string) {
    return this.crossSell.remove(id);
  }

  @Post('cross-sell/analyze')
  @RequireModule('chatbot-config')
  crossSellAnalyze() {
    return this.crossSellAnalysis.analyze();
  }
```

Validar `status` del query: si viene y no es uno de `ACTIVE|PAUSED|SUGGESTED|DISMISSED`, ignorarlo (pasar `undefined`) — usar `const s = ['ACTIVE','PAUSED','SUGGESTED','DISMISSED'].includes(status as string) ? status : undefined;`.

- [ ] **Step 2: Type-check**

Run: `cd apps/api && npx tsc --noEmit --incremental false -p tsconfig.json` → sin errores.

- [ ] **Step 3: Probar con la API local**

Levantar solo la API (`cd apps/api && rm -rf dist tsconfig.tsbuildinfo && npx nest start`) y, con un JWT ADMIN firmado con `JWT_SECRET` de `apps/api/.env` (ver script de pruebas de sesiones anteriores en el scratchpad: `feat-test.js`):
1. `GET /chatbot/cross-sell/rules` → 5 reglas PAUSED, `analyzedAt: null`.
2. `POST /chatbot/cross-sell/rules/test` `{trigger:'esmeril', offerTerms:['disco de corte','disco de desbaste']}` → `matchCount > 0` y ejemplos con discos (de la misma medida cuando exista).
3. `POST /chatbot/cross-sell/rules/test` `{trigger:'pintura', offerTerms:['brocha','rodillo'], excludeTerms:['brocha','rodillo','thinner']}` → ningún ejemplo es una brocha/rodillo.
4. `PATCH` la regla esmeril a `ACTIVE`; `GET /chatbot/tools/search?q=esmeril` → los primeros resultados traen `ofrecer_tambien`.
5. `POST /chatbot/cross-sell/analyze` → `{ invoices > 0, suggestions >= 0 }`; `GET ?status=SUGGESTED` lista pares; revisar que `cemento` no salga como oferta de todo.
6. `POST` regla duplicada → 409.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/chatbot/chatbot.controller.ts
git commit -m "feat: Session 159 - Venta cruzada: endpoints de reglas, prueba y analisis"
```

---

### Task 8: Pantalla `/chatbot/cross-sell`

**Files:**
- Create: `apps/web/src/app/(dashboard)/chatbot/cross-sell/page.tsx`
- Modify: `apps/web/src/components/sidebar.tsx` (menú CHATBOT, ~línea 154)
- Modify: `apps/web/src/middleware.ts:11` (permiso de ruta)

- [ ] **Step 1: Permiso de ruta y menú**

`middleware.ts`, antes de `['/chatbot', ['chatbot']]`:

```ts
  ['/chatbot/cross-sell', ['chatbot-config']],
```

`sidebar.tsx`: importar `Shuffle` de `lucide-react` y agregar antes de "Configuracion":

```tsx
      { label: 'Venta cruzada', href: '/chatbot/cross-sell', icon: <Shuffle size={18} />, permission: 'chatbot-config', strictPermission: true },
```

- [ ] **Step 2: Página**

`apps/web/src/app/(dashboard)/chatbot/cross-sell/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Shuffle, Plus, Loader2, Pencil, Trash2, X, FlaskConical, RefreshCw, Check } from 'lucide-react';

type Status = 'ACTIVE' | 'PAUSED' | 'SUGGESTED' | 'DISMISSED';
interface Rule {
  id: string; trigger: string; offerTerms: string[]; excludeTerms: string[]; status: Status;
  statsBaseCount: number | null; statsPairPct: number | null; statsLift: number | null; timesOffered: number;
}
interface Pick { code: string; name: string; priceDetal: number }
interface TestResult { matchCount: number; examples: { product: Pick; offers: Pick[] }[] }
interface FormState { id: string | null; trigger: string; offer1: string; offer2: string; exclude: string; fromSuggestion: boolean }

const EMPTY_FORM: FormState = { id: null, trigger: '', offer1: '', offer2: '', exclude: '', fromSuggestion: false };
const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`/api/proxy/chatbot/cross-sell${path}`, {
    ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((Array.isArray(data.message) ? data.message[0] : data.message) || 'Error');
  return data;
}

export default function CrossSellPage() {
  const [tab, setTab] = useState<'rules' | 'suggested'>('rules');
  const [rules, setRules] = useState<Rule[]>([]);
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => { document.title = 'Venta cruzada | Trinity ERP'; }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/rules');
      setRules(data.rules); setAnalyzedAt(data.analyzedAt);
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const own = rules.filter((r) => r.status === 'ACTIVE' || r.status === 'PAUSED');
  const suggested = rules.filter((r) => r.status === 'SUGGESTED').sort((a, b) => (b.statsLift ?? 0) - (a.statsLift ?? 0));

  function openForm(r?: Rule, fromSuggestion = false) {
    setTest(null);
    setForm(r
      ? { id: r.id, trigger: r.trigger, offer1: r.offerTerms[0] || '', offer2: r.offerTerms[1] || '', exclude: r.excludeTerms.join(', '), fromSuggestion }
      : EMPTY_FORM);
  }

  function formBody(f: FormState) {
    return { trigger: f.trigger.trim(), offerTerms: [f.offer1, f.offer2].map((x) => x.trim()).filter(Boolean), excludeTerms: splitList(f.exclude) };
  }

  async function runTest() {
    if (!form) return;
    setTesting(true); setTest(null);
    try { setTest(await api('/rules/test', { method: 'POST', body: JSON.stringify(formBody(form)) })); }
    catch (e: any) { setMessage({ type: 'error', text: e.message }); } finally { setTesting(false); }
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      const body = formBody(form);
      if (form.id) await api(`/rules/${form.id}`, { method: 'PATCH', body: JSON.stringify(form.fromSuggestion ? { ...body, status: 'ACTIVE' } : body) });
      else await api('/rules', { method: 'POST', body: JSON.stringify(body) });
      setForm(null);
      setMessage({ type: 'success', text: form.fromSuggestion ? 'Sugerencia activada' : 'Regla guardada (actívala con el interruptor)' });
      await load();
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); } finally { setBusy(false); }
  }

  async function setStatus(r: Rule, status: Status) {
    setBusy(true);
    try { await api(`/rules/${r.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load(); }
    catch (e: any) { setMessage({ type: 'error', text: e.message }); } finally { setBusy(false); }
  }

  async function remove(r: Rule) {
    if (!confirm(`¿Borrar la regla "${r.trigger} → ${r.offerTerms.join(', ')}"?`)) return;
    setBusy(true);
    try { await api(`/rules/${r.id}`, { method: 'DELETE' }); await load(); }
    catch (e: any) { setMessage({ type: 'error', text: e.message }); } finally { setBusy(false); }
  }

  async function analyze() {
    setBusy(true);
    try {
      const r = await api('/analyze', { method: 'POST' });
      setMessage({ type: 'success', text: `Análisis listo: ${r.suggestions} sugerencias a partir de ${r.invoices} facturas` });
      setTab('suggested'); await load();
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); } finally { setBusy(false); }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20"><Shuffle className="text-indigo-400" size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-white">Venta cruzada</h1>
            <p className="text-slate-400 text-sm">Cuando el bot cotiza un producto, ofrece un complemento disponible con su precio.</p>
          </div>
        </div>
        <button onClick={() => openForm()} className="btn-primary flex items-center gap-2"><Plus size={16} /> Nueva regla</button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm flex items-start justify-between gap-2 ${message.type === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-300' : 'bg-green-500/10 border border-green-500/20 text-green-300'}`}>
          <span>{message.text}</span><button onClick={() => setMessage(null)} aria-label="Cerrar"><X size={16} /></button>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {([['rules', `Reglas (${own.length})`], ['suggested', `Sugeridas (${suggested.length})`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === k ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>{label}</button>
        ))}
        {tab === 'suggested' && (
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-slate-500">{analyzedAt ? `Último análisis: ${new Date(analyzedAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}` : 'Sin análisis todavía'}</span>
            <button onClick={analyze} disabled={busy} className="btn-secondary !py-2 text-sm flex items-center gap-1.5 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Recalcular ahora
            </button>
          </div>
        )}
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-green-500" size={28} /></div>
        ) : tab === 'rules' ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 text-slate-400 text-left">
                <th className="px-4 py-3 font-medium">Si cotiza…</th>
                <th className="px-4 py-3 font-medium">Ofrecer…</th>
                <th className="px-4 py-3 font-medium">No aplicar si dice…</th>
                <th className="px-4 py-3 font-medium text-center">Activa</th>
                <th className="px-4 py-3 font-medium text-center">Veces ofrecida</th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {own.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-500">No hay reglas. Crea una o revisa las sugeridas.</td></tr>
              ) : own.map((r) => (
                <tr key={r.id} className="border-b border-slate-700/30">
                  <td className="px-4 py-3 text-white font-medium">{r.trigger}</td>
                  <td className="px-4 py-3 text-slate-200">{r.offerTerms.join(' · ')}</td>
                  <td className="px-4 py-3 text-slate-400">{r.excludeTerms.join(', ') || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <button disabled={busy} onClick={() => setStatus(r, r.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')}
                      className={`w-11 h-6 rounded-full relative transition-colors ${r.status === 'ACTIVE' ? 'bg-green-600' : 'bg-slate-600'}`}
                      aria-label={r.status === 'ACTIVE' ? 'Pausar' : 'Activar'}>
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${r.status === 'ACTIVE' ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-300">{r.timesOffered || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openForm(r)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700" aria-label="Editar"><Pencil size={15} /></button>
                      <button onClick={() => remove(r)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10" aria-label="Borrar"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 text-slate-400 text-left">
                <th className="px-4 py-3 font-medium">Si cotiza…</th>
                <th className="px-4 py-3 font-medium">Ofrecer…</th>
                <th className="px-4 py-3 font-medium">Datos</th>
                <th className="px-4 py-3 w-48"></th>
              </tr>
            </thead>
            <tbody>
              {suggested.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-12 text-slate-500">No hay sugerencias. Usa "Recalcular ahora".</td></tr>
              ) : suggested.map((r) => (
                <tr key={r.id} className="border-b border-slate-700/30">
                  <td className="px-4 py-3 text-white font-medium">{r.trigger}</td>
                  <td className="px-4 py-3 text-slate-200">{r.offerTerms.join(' · ')}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {r.statsPairPct}% de {r.statsBaseCount} facturas con {r.trigger} · {r.statsLift}× más de lo normal
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openForm(r, true)} className="btn-primary !py-1.5 text-xs flex items-center gap-1"><Check size={13} /> Activar</button>
                      <button disabled={busy} onClick={() => setStatus(r, 'DISMISSED')} className="px-3 py-1.5 rounded-lg text-xs bg-slate-700 text-slate-300 hover:bg-slate-600">Descartar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setForm(null)}>
          <div className="card w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">{form.fromSuggestion ? 'Activar sugerencia' : form.id ? 'Editar regla' : 'Nueva regla'}</h2>
              <button onClick={() => setForm(null)} className="text-slate-400 hover:text-white" aria-label="Cerrar"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Si cotiza… (palabra del producto)</label>
                <input value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })} className="input-field !py-2 text-sm" placeholder="esmeril" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Ofrecer…</label>
                  <input value={form.offer1} onChange={(e) => setForm({ ...form, offer1: e.target.value })} className="input-field !py-2 text-sm" placeholder="disco de corte" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">y también (opcional)</label>
                  <input value={form.offer2} onChange={(e) => setForm({ ...form, offer2: e.target.value })} className="input-field !py-2 text-sm" placeholder="disco de desbaste" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">No aplicar si el producto dice… (opcional, separado por comas)</label>
                <input value={form.exclude} onChange={(e) => setForm({ ...form, exclude: e.target.value })} className="input-field !py-2 text-sm" placeholder="brocha, rodillo" />
              </div>
            </div>

            <div className="mt-4">
              <button onClick={runTest} disabled={testing || !form.trigger.trim() || !form.offer1.trim()} className="btn-secondary !py-2 text-sm flex items-center gap-1.5 disabled:opacity-50">
                {testing ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />} Probar regla
              </button>
              {test && (
                <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-900/50 p-3 text-xs space-y-1.5">
                  <p className="text-slate-300">Se activa con <b className="text-white">{test.matchCount}</b> productos. Ejemplos (los más vendidos):</p>
                  {test.examples.map((ex) => (
                    <p key={ex.product.code} className="text-slate-400">
                      <span className="text-slate-200">{ex.product.name}</span> →{' '}
                      {ex.offers.length
                        ? ex.offers.map((o) => `${o.name} (${fmt(o.priceDetal)}$)`).join(' · ')
                        : <span className="text-amber-400">sin complemento disponible</span>}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setForm(null)} className="px-4 py-2 rounded-lg text-sm bg-slate-700/50 text-slate-300 hover:bg-slate-700">Cancelar</button>
              <button onClick={save} disabled={busy || !form.trigger.trim() || !form.offer1.trim()} className="btn-primary !py-2 text-sm disabled:opacity-50">
                {form.fromSuggestion ? 'Activar' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check web**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json` → sin errores.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(dashboard)/chatbot/cross-sell/page.tsx" apps/web/src/components/sidebar.tsx apps/web/src/middleware.ts
git commit -m "feat: Session 159 - Venta cruzada: pantalla de reglas y sugerencias"
```

---

### Task 9: Verificación completa en local

- [ ] **Step 1: Levantar** (memoria `local-dev-startup`): Docker arriba, `npx kill-port 4000 3000 8765`, borrar `apps/api/tsconfig.tsbuildinfo` y `apps/api/dist`, API con `npx nest start` y web con `npx next dev -p 3000`.
- [ ] **Step 2: Pantalla** (puppeteer + cookie JWT ADMIN, como en `ui-test.js` del scratchpad): abrir `/chatbot/cross-sell`, ver las 5 reglas, abrir "esmeril", "Probar regla" muestra ejemplos, activar con el interruptor; pestaña Sugeridas → "Recalcular ahora" lista sugerencias; sin errores de consola. Screenshot y revisarlo.
- [ ] **Step 3: Bot con IA real** (`bot-test.js` del scratchpad), con esmeril, taladro y pintura ACTIVE, 3 veces cada caso:
  - "precio del esmeril dewalt" → cotiza y ofrece disco con precio en la misma respuesta.
  - "qué taladros tienen" → lista varios, NO ofrece; luego "el primero" → ofrece mecha.
  - "precio del esmeril" dos veces en la misma conversación → la segunda no repite el disco.
  - "precio de la pintura caucho" → ofrece brocha/rodillo; "precio del rodillo" → no ofrece rodillo.
  - Producto sin regla ("cemento gris") → no ofrece nada.
  - Verificar en BD: `ChatbotCrossSellOffer` creado y `timesOffered` incrementado solo cuando la respuesta lo mencionó.
- [ ] **Step 4: Apagar** servidores (kill-port 3000 4000) y borrar `tsconfig.tsbuildinfo`/`dist`. Devolver las reglas a PAUSED si se activaron para la prueba (`UPDATE "ChatbotCrossSellRule" SET status='PAUSED' WHERE status='ACTIVE'`) y borrar las ofertas de prueba (`DELETE FROM "ChatbotCrossSellOffer"`).

---

### Task 10: Documentación y cierre

- [ ] **Step 1:** PROGRESS.md: en "📍 DÓNDE QUEDAMOS" del chatbot, fila 2c → "✅ programada (Sesión 159), NO desplegada"; agregar sección `## 🗓️ Sesión 159 (2026-10-12) — Chatbot: venta cruzada` con decisiones, archivos y resultados de la verificación. PROJECT.md: entrada en "Detalle por Fase" con modelos, servicios, endpoints y pantalla.
- [ ] **Step 2:** Actualizar memoria `chatbot-whatsapp.md` (venta cruzada programada; pendiente deploy y Chatwoot).
- [ ] **Step 3:** Commit y push.

```bash
git add PROGRESS.md PROJECT.md
git commit -m "docs: Session 159 - PROGRESS/PROJECT: venta cruzada del chatbot"
git push origin main
```
