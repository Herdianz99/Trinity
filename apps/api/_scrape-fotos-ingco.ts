// Fase 1 — SOLO LOCAL. Lee productos INGCO sin foto de la BD local, scrapea ingco.com/ve,
// baja foto + descripción y escribe un artefacto revisable. NO escribe en ninguna BD/Spaces.
// Correr con cwd = apps/api:  tsx _scrape-fotos-ingco.ts
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
