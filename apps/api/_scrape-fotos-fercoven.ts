// Fase 1 FERCOVEN (API web/search). SOLO LOCAL, 0 prod. Baja hasta 10 fotos/producto + descripción + barcode.
// Match por modelo == supplierRef (exacto). cwd = apps/api:  tsx _scrape-fotos-fercoven.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
(process as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.('.env');
const prisma = new PrismaClient();

const API = 'https://api.fercoven.com/api/web/search';
const IMGBASE = 'https://fercoven.nbg1.your-objectstorage.com/public';
const OUT = path.join(process.cwd(), '_fercoven-out');
const IMG_DIR = path.join(OUT, 'img');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const MAX_IMG = 10;
const THROTTLE_MS = 800;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** true si ref es EAN-13 o UPC-A válido (checksum). */
function validBarcode(ref: string): boolean {
  if (/^\d{13}$/.test(ref)) {
    const d = ref.split('').map(Number);
    let s = 0; for (let i = 0; i < 12; i++) s += d[i] * (i % 2 ? 3 : 1);
    return (10 - (s % 10)) % 10 === d[12];
  }
  if (/^\d{12}$/.test(ref)) {
    const d = ref.split('').map(Number);
    let s = 0; for (let i = 0; i < 11; i++) s += d[i] * (i % 2 ? 1 : 3);
    return (10 - (s % 10)) % 10 === d[11];
  }
  return false;
}
function cleanDesc(md: string): string {
  return md.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\s*Generado con IA\s*/gi, ' ')
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
}
async function search(q: string): Promise<any[]> {
  try {
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': 'https://www.fercoven.com', 'User-Agent': UA }, body: JSON.stringify({ query: q }) });
    if (!res.ok) return [];
    const j: any = await res.json();
    return Array.isArray(j?.results) ? j.results : [];
  } catch { return []; }
}
async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    if (!(res.headers.get('content-type') || '').startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 1000 ? buf : null;
  } catch { return null; }
}

interface Row {
  productId: string; code: string; supplierRef: string; bdName: string;
  description: string | null; barcode: string | null; barcodeValid: boolean;
  imageFiles: string[]; status: 'matched' | 'match-no-image' | 'no-match' | 'error';
}

async function main() {
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const products = await prisma.product.findMany({
    where: { isActive: true, isService: false, supplier: { name: 'FERCOVEN, C.A.' }, supplierRef: { not: null }, images: { none: {} } },
    select: { id: true, code: true, supplierRef: true, name: true },
    orderBy: { code: 'asc' },
  });
  console.log(`Productos FERCOVEN sin foto a procesar: ${products.length}`);
  const manifest: Row[] = [];
  let matched = 0, noImage = 0, noMatch = 0, totalImgs = 0;

  for (let idx = 0; idx < products.length; idx++) {
    const p = products[idx];
    const ref = (p.supplierRef as string).trim();
    const results = await search(ref);
    const hit = results.find((r) => (r.modelo || '').trim().toUpperCase() === ref.toUpperCase());
    if (!hit) {
      manifest.push({ productId: p.id, code: p.code, supplierRef: ref, bdName: p.name, description: null, barcode: null, barcodeValid: false, imageFiles: [], status: 'no-match' });
      noMatch++;
    } else {
      const urls: string[] = (hit.imagen || []).map((i: any) => i?.url).filter(Boolean).slice(0, MAX_IMG);
      const imageFiles: string[] = [];
      for (let i = 0; i < urls.length; i++) {
        const buf = await download(IMGBASE + encodeURI(urls[i]));
        if (buf) { const f = `${p.id}-${i}.jpg`; fs.writeFileSync(path.join(IMG_DIR, f), buf); imageFiles.push(f); }
      }
      const bc = (hit.ref || '').trim();
      manifest.push({
        productId: p.id, code: p.code, supplierRef: ref, bdName: p.name,
        description: hit.descripcion ? cleanDesc(hit.descripcion) : null,
        barcode: bc || null, barcodeValid: validBarcode(bc),
        imageFiles, status: imageFiles.length ? 'matched' : 'match-no-image',
      });
      if (imageFiles.length) { matched++; totalImgs += imageFiles.length; } else noImage++;
    }
    if ((idx + 1) % 25 === 0) console.log(`  ${idx + 1}/${products.length} ...`);
    await sleep(THROTTLE_MS);
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nListo. matched=${matched} (${totalImgs} fotos)  match-sin-imagen=${noImage}  no-match=${noMatch}`);
  console.log(`Artefacto: ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
