// Fase 2 FERCOVEN — sube la galería (varias fotos/producto) a Spaces + ProductImage + Product.
// Idempotente. Descripción solo si vacía. Barcode solo con --barcode (y si está libre y es válido).
// cwd = apps/api. Local usa .env; prod vía APPLY_DATABASE_URL (túnel). Batching --limit/--offset. --dir _fercoven-out
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { processProductImage } from './src/modules/product-images/image-processing';

(process as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.('.env');
const APPLY_DB = process.env.APPLY_DATABASE_URL;
const prisma = APPLY_DB ? new PrismaClient({ datasources: { db: { url: APPLY_DB } } }) : new PrismaClient();

const THROTTLE_MS = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function arg(name: string, def: number): number { const i = process.argv.indexOf(`--${name}`); return i !== -1 && process.argv[i + 1] ? parseInt(process.argv[i + 1], 10) : def; }
function argStr(name: string, def: string): string { const i = process.argv.indexOf(`--${name}`); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def; }
const FILL_BARCODE = process.argv.includes('--barcode');
const OUT = path.join(process.cwd(), argStr('dir', '_fercoven-out'));
const IMG_DIR = path.join(OUT, 'img');

const BUCKET = process.env.SPACES_BUCKET as string;
const CDN = (process.env.SPACES_CDN_BASE || '').replace(/\/$/, '');
const s3 = new S3Client({ endpoint: process.env.SPACES_ENDPOINT, region: process.env.SPACES_REGION || 'us-east-1', credentials: { accessKeyId: process.env.SPACES_KEY || '', secretAccessKey: process.env.SPACES_SECRET || '' } });
async function putPublic(key: string, body: Buffer): Promise<string> {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: 'image/webp', ACL: 'public-read', CacheControl: 'public, max-age=31536000, immutable' }));
  return `${CDN}/${key}`;
}

interface Row { productId: string; code: string; supplierRef: string; description: string | null; barcode: string | null; barcodeValid: boolean; imageFiles: string[]; status: string; }

async function main() {
  const limit = arg('limit', 1000000);
  const offset = arg('offset', 0);
  const all: Row[] = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf-8'));
  const matched = all.filter((m) => m.status === 'matched' && m.imageFiles.length > 0);
  const batch = matched.slice(offset, offset + limit);
  console.log(`matched=${matched.length}  batch=[${offset}..${offset + batch.length})  bucket=${BUCKET}  fillBarcode=${FILL_BARCODE}`);

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true } });
  if (!admin) throw new Error('No hay ADMIN activo para createdById');

  let applied = 0, skipped = 0, failed = 0, imgs = 0, bc = 0;
  for (const m of batch) {
    try {
      if (await prisma.productImage.count({ where: { productId: m.productId } }) > 0) { skipped++; continue; }

      // procesar + subir todas las fotos (fuera de la tx)
      const built: { thumbKey: string; mediumKey: string; thumbUrl: string; mediumUrl: string; bytes: number; width: number; height: number; isPrimary: boolean; sortOrder: number }[] = [];
      for (let i = 0; i < m.imageFiles.length; i++) {
        const raw = fs.readFileSync(path.join(IMG_DIR, m.imageFiles[i]));
        const pr = await processProductImage(raw);
        const base = `products/${m.productId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${i}`;
        const thumbKey = `${base}-thumb.webp`, mediumKey = `${base}-medium.webp`;
        const [thumbUrl, mediumUrl] = await Promise.all([putPublic(thumbKey, pr.thumb), putPublic(mediumKey, pr.medium)]);
        built.push({ thumbKey, mediumKey, thumbUrl, mediumUrl, bytes: pr.bytes, width: pr.width, height: pr.height, isPrimary: i === 0, sortOrder: i });
      }
      if (!built.length) { failed++; continue; }

      const prod = await prisma.product.findUnique({ where: { id: m.productId }, select: { description: true, barcode: true } });
      const setDesc = m.description && (!prod?.description || !prod.description.trim()) ? m.description : undefined;
      let setBarcode: string | undefined;
      if (FILL_BARCODE && m.barcodeValid && m.barcode && !prod?.barcode) {
        const taken = await prisma.product.findFirst({ where: { barcode: m.barcode, id: { not: m.productId } }, select: { id: true } });
        if (!taken) setBarcode = m.barcode;
      }

      await prisma.$transaction([
        ...built.map((b) => prisma.productImage.create({ data: { productId: m.productId, thumbKey: b.thumbKey, mediumKey: b.mediumKey, isPrimary: b.isPrimary, sortOrder: b.sortOrder, bytes: b.bytes, width: b.width, height: b.height, createdById: admin.id } })),
        prisma.product.update({ where: { id: m.productId }, data: { primaryImageThumbUrl: built[0].thumbUrl, primaryImageMediumUrl: built[0].mediumUrl, ...(setDesc ? { description: setDesc } : {}), ...(setBarcode ? { barcode: setBarcode } : {}) } }),
      ]);
      applied++; imgs += built.length; if (setBarcode) bc++;
      if (applied % 20 === 0) console.log(`  aplicados ${applied} (${imgs} fotos) ...`);
      await sleep(THROTTLE_MS);
    } catch (e) { failed++; console.error(`  FALLO ${m.code} (${m.productId}):`, (e as Error).message); }
  }
  console.log(`\nListo. aplicados=${applied}  fotos=${imgs}  barcodes=${bc}  ya-tenian=${skipped}  fallos=${failed}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
