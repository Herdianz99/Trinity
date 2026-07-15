# Backfill de fotos + descripciones INGCO — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un script de una corrida que llena foto oficial + descripción en español (`Product.description`) para los productos INGCO sin foto de la empresa grande, matcheando por código de modelo contra `ingco.com/ve`.

**Architecture:** 2 fases. **Fase 1 (scrape, local, 0 prod):** lee productos INGCO sin foto de la BD local, hace 1 `fetch` por producto a `/ve/product/x/{modelo}` (con reintentos), parsea título (guarda) + descripción + URL de imagen del `g_initialProps`, descarga la imagen y escribe un artefacto local (imágenes + `manifest.json`). **Fase 2 (aplicar, en el servidor de la grande, tandas nocturnas):** lee el artefacto, procesa cada imagen con el pipeline existente (`processProductImage`), la sube a Spaces y escribe `ProductImage` + campos de `Product` (idempotente, solo faltantes).

**Tech Stack:** Node 24 (`fetch` global, `process.loadEnvFile`), TypeScript vía `tsx`, `cheerio` (ya en `apps/api`), Prisma, `@aws-sdk/client-s3` + `sharp` (ya en `apps/api`), test runner `node:test`.

**Referencias:**
- Spec: `docs/superpowers/specs/2026-07-15-backfill-fotos-descripciones-ingco-design.md`
- Pipeline de imagen existente: `apps/api/src/modules/product-images/image-processing.ts` (`processProductImage(buffer)`), `apps/api/src/modules/product-images/product-images.service.ts` (referencia del flujo de subida), `apps/api/src/modules/product-images/spaces.service.ts` (referencia de env vars y ACL).
- Modelo `ProductImage` y campos `Product.primaryImageThumbUrl/MediumUrl`, `Product.description`: `packages/database/prisma/schema.prisma`.

**Convenciones confirmadas del sitio INGCO:**
- URL: `https://www.ingco.com/ve/product/x/{MODELO}` (slug `x` cosmético; se resuelve por el último segmento = código de modelo).
- Código **tal cual** (`supplierRef` con `trim()`, sin quitar prefijos como `U` o `ING-`).
- Guarda: `<title>` vacío = no-match = se salta.
- Descripción: `<div class="parameter-content">` (español), `<br>` → salto de línea, literal.
- Imagen: `g_initialProps` → `"productPicList":["https://res-de.togroup.com/.../{MODELO}.jpg"]` (escape `/`). Descarga `http 200`, `image/jpeg`.
- SSR intermitente → reintentar hasta que el `<title>` renderice.

---

## Estructura de archivos

- `apps/api/_ingco-lib.ts` — **puro y testeable**: helpers de código/URL y parseo de HTML (título, descripción, imagen). Sin I/O.
- `apps/api/_ingco-lib.test.ts` — tests unitarios (`node:test`) con fixtures HTML inline.
- `apps/api/_scrape-fotos-ingco.ts` — **Fase 1**: lee BD local, scrapea, escribe artefacto en `apps/api/_ingco-out/`.
- `apps/api/_apply-fotos-ingco.ts` — **Fase 2**: lee artefacto, sube a Spaces, escribe en BD (idempotente, `--limit/--offset`).
- Artefacto (no se commitea): `apps/api/_ingco-out/manifest.json` + `apps/api/_ingco-out/img/{productId}.jpg`.

Todos los comandos se corren con **cwd = `apps/api`** (para que `process.loadEnvFile('.env')` cargue `apps/api/.env`, igual que el patrón de prod).

---

### Task 1: Librería pura de parseo (`_ingco-lib.ts`) con tests

**Files:**
- Create: `apps/api/_ingco-lib.ts`
- Test: `apps/api/_ingco-lib.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Create `apps/api/_ingco-lib.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanCode,
  buildProductUrl,
  extractTitle,
  extractDescription,
  extractImageUrl,
  parseIngcoPage,
} from './_ingco-lib';

// Fixtures basados en el HTML real de ingco.com/ve
const HTML_OK = `
<title data-react-helmet="true"> Accesorios Cincel SDS Plus DBC0112501 - INGCO Venezuela</title>
<div class="parameter-content">14X250mm, puntiagudo  <br>Embalado por percha de plástico</div>
<script>window.g_initialProps = {"data":{"productExtNo":"DBC0112501","productPicList":["https:\\u002F\\u002Fres-de.togroup.com\\u002Fstc\\u002Fhome_product\\u002Fingco\\u002Fuserfiles\\u002F1\\u002Fimages\\u002Fphoto\\u002F20260101\\u002FDBC0112501.jpg"]}}</script>
`;

// Página de un modelo inexistente: título vacío, sin datos de producto
const HTML_EMPTY = `
<title data-react-helmet="true"></title>
<div id="app"></div>
`;

test('cleanCode recorta espacios y no altera prefijos', () => {
  assert.equal(cleanCode('  UPLM6001 '), 'UPLM6001');
  assert.equal(cleanCode('ING-UFC13018'), 'ING-UFC13018');
});

test('buildProductUrl arma la URL con slug cosmético', () => {
  assert.equal(buildProductUrl('DBC0112501'), 'https://www.ingco.com/ve/product/x/DBC0112501');
  assert.equal(buildProductUrl(' HTC04601 '), 'https://www.ingco.com/ve/product/x/HTC04601');
});

test('extractTitle devuelve el nombre sin sufijo, o null si vacío', () => {
  assert.equal(extractTitle(HTML_OK), 'Accesorios Cincel SDS Plus DBC0112501');
  assert.equal(extractTitle(HTML_EMPTY), null);
});

test('extractDescription convierte <br> en saltos y limpia', () => {
  assert.equal(extractDescription(HTML_OK), '14X250mm, puntiagudo\nEmbalado por percha de plástico');
  assert.equal(extractDescription(HTML_EMPTY), null);
});

test('extractImageUrl desescapa \\u002F y devuelve la URL del CDN', () => {
  assert.equal(
    extractImageUrl(HTML_OK),
    'https://res-de.togroup.com/stc/home_product/ingco/userfiles/1/images/photo/20260101/DBC0112501.jpg',
  );
  assert.equal(extractImageUrl(HTML_EMPTY), null);
});

test('parseIngcoPage devuelve null si el título está vacío (no-match)', () => {
  assert.equal(parseIngcoPage(HTML_EMPTY), null);
  const p = parseIngcoPage(HTML_OK);
  assert.ok(p);
  assert.equal(p!.title, 'Accesorios Cincel SDS Plus DBC0112501');
  assert.equal(p!.description, '14X250mm, puntiagudo\nEmbalado por percha de plástico');
  assert.match(p!.imageUrl!, /DBC0112501\.jpg$/);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd apps/api && npx tsx --test _ingco-lib.test.ts`
Expected: FAIL — "Cannot find module './_ingco-lib'".

- [ ] **Step 3: Implementar la librería**

Create `apps/api/_ingco-lib.ts`:

```ts
import * as cheerio from 'cheerio';

export const INGCO_BASE = 'https://www.ingco.com/ve/product/x/';

/** Código tal cual: solo recorta espacios. NO quita prefijos (U, ING-) que son parte del código real. */
export function cleanCode(ref: string): string {
  return ref.trim();
}

export function buildProductUrl(model: string): string {
  return INGCO_BASE + encodeURIComponent(cleanCode(model));
}

/** <title> sin el sufijo " - INGCO Venezuela". null si viene vacío (modelo inexistente). */
export function extractTitle(html: string): string | null {
  const $ = cheerio.load(html);
  const raw = $('title').first().text().replace(/\s*-\s*INGCO Venezuela\s*$/i, '').trim();
  return raw.length ? raw : null;
}

/** Texto del div .parameter-content, con <br> -> salto de línea. null si no existe. */
export function extractDescription(html: string): string | null {
  const $ = cheerio.load(html);
  const inner = $('.parameter-content').first().html();
  if (!inner) return null;
  const withBreaks = inner.replace(/<br\s*\/?>/gi, '\n');
  const text = cheerio.load(`<div>${withBreaks}</div>`)('div').text();
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.length ? lines.join('\n') : null;
}

/** Primera URL de productPicList en g_initialProps, desescapando / y \/ . null si no hay. */
export function extractImageUrl(html: string): string | null {
  const i = html.indexOf('"productPicList"');
  if (i === -1) return null;
  const slice = html.slice(i, i + 4000); // el array es corto; acotamos por seguridad
  const m = slice.match(/https?:[^"]+?\.(?:jpg|jpeg|png|webp)/i);
  if (!m) return null;
  return m[0]
    .replace(/\\u002[fF]/g, '/')
    .replace(/\\\//g, '/')
    .replace(/\\/g, '');
}

export interface IngcoProduct {
  title: string;
  description: string | null;
  imageUrl: string | null;
}

/** Combina las tres extracciones. Guarda dura: título vacío => null (no-match). */
export function parseIngcoPage(html: string): IngcoProduct | null {
  const title = extractTitle(html);
  if (!title) return null;
  return {
    title,
    description: extractDescription(html),
    imageUrl: extractImageUrl(html),
  };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd apps/api && npx tsx --test _ingco-lib.test.ts`
Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/_ingco-lib.ts apps/api/_ingco-lib.test.ts
git commit -m "feat: lib de parseo INGCO (titulo/descripcion/imagen) + tests"
```

---

### Task 2: Fase 1 — script de scrape (`_scrape-fotos-ingco.ts`)

**Files:**
- Create: `apps/api/_scrape-fotos-ingco.ts`

- [ ] **Step 1: Escribir el script**

Create `apps/api/_scrape-fotos-ingco.ts`:

```ts
// Fase 1 — SOLO LOCAL. Lee productos INGCO sin foto de la BD local, scrapea ingco.com/ve,
// baja foto + descripción y escribe un artefacto revisable. NO escribe en ninguna BD/Spaces.
// Correr con cwd = apps/api:  npx tsx _scrape-fotos-ingco.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { buildProductUrl, cleanCode, parseIngcoPage, extractTitle } from './_ingco-lib';

// Node >=20.12 tiene process.loadEnvFile; el tipo puede faltar en @types/node viejo.
(process as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.('.env'); // apps/api/.env (DATABASE_URL local)
const prisma = new PrismaClient();

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const OUT = path.join(process.cwd(), '_ingco-out');
const IMG_DIR = path.join(OUT, 'img');
const THROTTLE_MS = 1500; // pausa entre productos (amable con el sitio)
const FETCH_TRIES = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reintenta hasta que el SSR renderice (título no vacío = página completa). null si nunca. */
async function fetchRendered(url: string): Promise<string | null> {
  for (let i = 0; i < FETCH_TRIES; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      const html = await res.text();
      if (extractTitle(html)) return html;
    } catch {
      /* red intermitente: reintenta */
    }
    await sleep(1500);
  }
  return null;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 1000 ? buf : null; // descarta placeholders/errores
  } catch {
    return null;
  }
}

interface ManifestRow {
  productId: string;
  code: string;
  supplierRef: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  imageFile: string | null;
  status: 'matched' | 'match-no-image' | 'no-match' | 'error';
}

async function main() {
  fs.mkdirSync(IMG_DIR, { recursive: true });

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      isService: false,
      brand: { name: 'INGCO' },
      supplierRef: { not: null },
      images: { none: {} }, // sin ninguna ProductImage
    },
    select: { id: true, code: true, supplierRef: true, name: true },
    orderBy: { code: 'asc' },
  });

  console.log(`Productos INGCO sin foto a procesar: ${products.length}`);
  const manifest: ManifestRow[] = [];
  let matched = 0, noImage = 0, noMatch = 0, errors = 0;

  for (let idx = 0; idx < products.length; idx++) {
    const p = products[idx];
    const model = cleanCode(p.supplierRef as string);
    const url = buildProductUrl(model);
    const html = await fetchRendered(url);

    if (!html) {
      manifest.push({ productId: p.id, code: p.code, supplierRef: model, title: null, description: null, imageUrl: null, imageFile: null, status: 'error' });
      errors++;
    } else {
      const parsed = parseIngcoPage(html);
      if (!parsed) {
        manifest.push({ productId: p.id, code: p.code, supplierRef: model, title: null, description: null, imageUrl: null, imageFile: null, status: 'no-match' });
        noMatch++;
      } else {
        let imageFile: string | null = null;
        if (parsed.imageUrl) {
          const buf = await downloadImage(parsed.imageUrl);
          if (buf) {
            imageFile = `${p.id}.jpg`;
            fs.writeFileSync(path.join(IMG_DIR, imageFile), buf);
          }
        }
        manifest.push({
          productId: p.id, code: p.code, supplierRef: model,
          title: parsed.title, description: parsed.description,
          imageUrl: parsed.imageUrl, imageFile,
          status: imageFile ? 'matched' : 'match-no-image',
        });
        if (imageFile) matched++; else noImage++;
      }
    }

    if ((idx + 1) % 25 === 0) console.log(`  ${idx + 1}/${products.length} ...`);
    await sleep(THROTTLE_MS);
  }

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nListo. matched=${matched}  match-sin-imagen=${noImage}  no-match=${noMatch}  error=${errors}`);
  console.log(`Artefacto: ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Typecheck del script**

Run: `cd apps/api && npx tsc --noEmit --skipLibCheck --esModuleInterop --module esnext --moduleResolution bundler --target es2022 --types node _scrape-fotos-ingco.ts _ingco-lib.ts`
Expected: sin errores. (Nota: `nest build` NO — ver CLAUDE.md, tumba el dev del API.)

- [ ] **Step 3: Prueba acotada contra INGCO real (5 productos)**

Para no hacer la corrida completa aún, verifica con un `LIMIT` temporal. Corre este one-liner de verificación (lee 5 productos y muestra qué extraería, sin escribir artefacto):

Run:
```bash
cd apps/api && npx tsx -e "
import { PrismaClient } from '@prisma/client';
import { buildProductUrl, cleanCode, parseIngcoPage, extractTitle } from './_ingco-lib';
process.loadEnvFile('.env');
const prisma = new PrismaClient();
const UA='Mozilla/5.0';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function fr(u){for(let i=0;i<5;i++){try{const h=await (await fetch(u,{headers:{'User-Agent':UA}})).text(); if(extractTitle(h))return h;}catch{} await sleep(1500);} return null;}
(async()=>{
  const ps=await prisma.product.findMany({where:{isActive:true,isService:false,brand:{name:'INGCO'},supplierRef:{not:null},images:{none:{}}},select:{code:true,supplierRef:true},take:5});
  for(const p of ps){const h=await fr(buildProductUrl(p.supplierRef)); const r=h?parseIngcoPage(h):null;
    console.log('---',p.code,cleanCode(p.supplierRef)); console.log('  title:',r?.title??'(no-match)'); console.log('  img:',r?.imageUrl??'-'); console.log('  desc:',(r?.description??'-').split('\n')[0]); await sleep(1500);}
  await prisma.\$disconnect();
})();
"
```
Expected: para varios de los 5, un `title`, una `img` (URL `.jpg` de `res-de.togroup.com`) y la primera línea de `desc` en español. Algún `(no-match)` es normal y correcto.

- [ ] **Step 4: Commit**

```bash
git add apps/api/_scrape-fotos-ingco.ts
git commit -m "feat: Fase 1 scrape de fotos+descripcion INGCO (solo local, artefacto revisable)"
```

---

### Task 3: Fase 2 — script de aplicación (`_apply-fotos-ingco.ts`)

**Files:**
- Create: `apps/api/_apply-fotos-ingco.ts`

- [ ] **Step 1: Escribir el script**

Create `apps/api/_apply-fotos-ingco.ts`:

```ts
// Fase 2 — APLICA el artefacto: sube fotos a Spaces + escribe ProductImage/Product.
// Idempotente (salta productos que ya tienen foto). Descripción solo si está vacía.
// Correr con cwd = apps/api. Local (prueba) usa .env local; en prod se corre EN EL SERVIDOR.
// Batching:  npx tsx _apply-fotos-ingco.ts --limit 50 --offset 0
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { processProductImage } from './src/modules/product-images/image-processing';

// Node >=20.12 tiene process.loadEnvFile; el tipo puede faltar en @types/node viejo.
(process as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.('.env');
const prisma = new PrismaClient();

const OUT = path.join(process.cwd(), '_ingco-out');
const IMG_DIR = path.join(OUT, 'img');
const THROTTLE_MS = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? parseInt(process.argv[i + 1], 10) : def;
}

const BUCKET = process.env.SPACES_BUCKET as string;
const CDN = (process.env.SPACES_CDN_BASE || '').replace(/\/$/, '');
const s3 = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT,
  region: process.env.SPACES_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.SPACES_KEY || '',
    secretAccessKey: process.env.SPACES_SECRET || '',
  },
});

async function putPublic(key: string, body: Buffer): Promise<string> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: body, ContentType: 'image/webp',
    ACL: 'public-read', CacheControl: 'public, max-age=31536000, immutable',
  }));
  return `${CDN}/${key}`;
}

interface ManifestRow {
  productId: string; code: string; supplierRef: string;
  description: string | null; imageFile: string | null; status: string;
}

async function main() {
  const limit = arg('limit', 1000000);
  const offset = arg('offset', 0);

  const all: ManifestRow[] = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf-8'));
  const matched = all.filter((m) => m.status === 'matched' && m.imageFile);
  const batch = matched.slice(offset, offset + limit);
  console.log(`matched=${matched.length}  batch=[${offset}..${offset + batch.length})  bucket=${BUCKET}`);

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true } });
  if (!admin) throw new Error('No hay usuario ADMIN activo para createdById');

  let applied = 0, skipped = 0, failed = 0;
  for (const m of batch) {
    try {
      const already = await prisma.productImage.count({ where: { productId: m.productId } });
      if (already > 0) { skipped++; continue; } // idempotente: ya tiene foto

      const raw = fs.readFileSync(path.join(IMG_DIR, m.imageFile as string));
      const processed = await processProductImage(raw);

      const base = `products/${m.productId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const thumbKey = `${base}-thumb.webp`;
      const mediumKey = `${base}-medium.webp`;
      const [thumbUrl, mediumUrl] = await Promise.all([
        putPublic(thumbKey, processed.thumb),
        putPublic(mediumKey, processed.medium),
      ]);

      const prod = await prisma.product.findUnique({ where: { id: m.productId }, select: { description: true } });
      const setDesc = m.description && (!prod?.description || !prod.description.trim()) ? m.description : undefined;

      await prisma.$transaction([
        prisma.productImage.create({
          data: {
            productId: m.productId, thumbKey, mediumKey, isPrimary: true, sortOrder: 0,
            bytes: processed.bytes, width: processed.width, height: processed.height, createdById: admin.id,
          },
        }),
        prisma.product.update({
          where: { id: m.productId },
          data: {
            primaryImageThumbUrl: thumbUrl,
            primaryImageMediumUrl: mediumUrl,
            ...(setDesc ? { description: setDesc } : {}),
          },
        }),
      ]);
      applied++;
      if (applied % 25 === 0) console.log(`  aplicados ${applied} ...`);
      await sleep(THROTTLE_MS);
    } catch (e) {
      failed++;
      console.error(`  FALLO ${m.code} (${m.productId}):`, (e as Error).message);
    }
  }

  console.log(`\nListo. aplicados=${applied}  ya-tenian=${skipped}  fallos=${failed}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Typecheck del script**

Run: `cd apps/api && npx tsc --noEmit --skipLibCheck --esModuleInterop --module esnext --moduleResolution bundler --target es2022 --types node _apply-fotos-ingco.ts _ingco-lib.ts`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/api/_apply-fotos-ingco.ts
git commit -m "feat: Fase 2 apply de fotos INGCO a Spaces+BD (idempotente, batching, desc solo si vacia)"
```

---

### Task 4: Corrida piloto (operacional) — validar en local, aplicar a prod por tandas

> Esta tarea NO es código; son los pasos de ejecución. Cada uno requiere revisión humana (Diego).
> **NUNCA** correr la Fase 1 pesada ni pruebas contra prod. Fase 1 = local. Fase 2 = servidor grande.

- [ ] **Step 1: Fase 1 completa contra la BD local**

Run: `cd apps/api && npx tsx _scrape-fotos-ingco.ts`
Expected: imprime el total de INGCO sin foto (~458) y al final `matched=… no-match=… error=…`. Genera `apps/api/_ingco-out/manifest.json` + `apps/api/_ingco-out/img/*.jpg`.

- [ ] **Step 2: Revisión del artefacto (muestreo por Diego)**

Abre `apps/api/_ingco-out/manifest.json` y varias imágenes de `_ingco-out/img/`. Confirma por muestreo que la foto y la descripción corresponden al producto (código/nombre). Ajustar si algo se ve mal antes de aplicar. **Gate: aprobación de Diego.**

- [ ] **Step 3: Verificación en LOCAL de la Fase 2 (opcional, seguro)**

Antes de tocar prod, se puede probar el apply contra la **BD local** con un lote chico:
Run: `cd apps/api && npx tsx _apply-fotos-ingco.ts --limit 5 --offset 0`
Expected: `aplicados=5` (o menos), 0 fallos. Verifica en local que esos productos ahora tienen `ProductImage` y `primaryImageThumbUrl`. (Ojo: esto sube 5 imágenes al bucket configurado en el `.env` local; si es el bucket de la grande, quedan ahí, lo cual es inofensivo y hasta útil.)

- [ ] **Step 4: Llevar el artefacto y el código al servidor de la grande**

El apply corre **en el servidor** (la BD de prod es solo por SSH). Diego autoriza el deploy.
Run (referencia — Diego ejecuta):
```bash
# subir código (git) y artefacto (rsync/scp del _ingco-out)
ssh root@134.209.164.59 "cd /opt/Trinity && git pull origin main"
scp -r apps/api/_ingco-out root@134.209.164.59:/opt/Trinity/apps/api/_ingco-out
```
Expected: el servidor tiene el `_ingco-out` y los scripts.

- [ ] **Step 5: Fase 2 en prod, primera tanda chica (validación)**

En el servidor, con cwd = `/opt/Trinity/apps/api` (que tiene el `.env` de prod con Spaces + DATABASE_URL de la grande):
Run: `cd /opt/Trinity/apps/api && npx tsx _apply-fotos-ingco.ts --limit 10 --offset 0`
Expected: `aplicados=10 fallos=0`. Verificar en el POS de la grande que esos 10 productos muestran su foto. **Gate: aprobación de Diego.**

- [ ] **Step 6: Fase 2 en prod, resto por tandas nocturnas**

En horario de baja, correr el resto en tandas (idempotente; re-correr no duplica):
Run: `cd /opt/Trinity/apps/api && npx tsx _apply-fotos-ingco.ts --limit 100 --offset 10`
… incrementando `--offset` hasta cubrir todos los `matched`. Verificar el resumen de cada tanda.
Expected: al final, todos los INGCO matcheados con foto + descripción; 0 impacto perceptible para usuarios.

- [ ] **Step 7: Limpieza**

Los scripts `_*.ts` y `_ingco-out/` son artefactos locales/scratch (no se despliegan como feature). Quedan en el repo/servidor como herramienta reusable para las siguientes marcas (WADFOW/VERT/JADEVER), que solo cambian el filtro de marca y (si aplica) la lógica de match. No se borra nada de prod.

---

## Notas de seguridad (recordatorio)

- **Fase 1 nunca toca prod** (lee BD local, escribe artefacto local).
- **Fase 2 es idempotente y solo-faltantes**: `count(ProductImage)>0` → salta; `description` solo si estaba vacía.
- Escrituras diminutas (1 insert + 1 update por producto, transacción por producto, sin locks largos ni barridos) → carga despreciable.
- Reversible con el flujo existente (`ProductImagesService.remove`).
- Throttling en ambas fases; reintentos ante el SSR intermitente de INGCO.
