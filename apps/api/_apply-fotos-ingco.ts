// Fase 2 — APLICA el artefacto: sube fotos a Spaces + escribe ProductImage/Product.
// Idempotente (salta productos que ya tienen foto). Descripción solo si está vacía.
// Correr con cwd = apps/api. Local (prueba) usa .env local; en prod se corre EN EL SERVIDOR.
// Batching:  tsx _apply-fotos-ingco.ts --limit 50 --offset 0
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
