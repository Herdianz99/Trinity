# Fotos de Productos — Fase 1 (MVP) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un producto pueda tener foto(s) almacenadas en DigitalOcean Spaces (optimizadas al subir), verse la miniatura en el POS, mostrarse grande al cliente, y cargarse rápido desde el teléfono escaneando el código de barras.

**Architecture:** Object storage (DO Spaces, S3-compatible) + CDN. El API recibe la foto como **base64 dentro de JSON** (el transporte que ya usa el proyecto, porque el proxy de Next no reenvía multipart), la decodifica, con `sharp` genera miniatura (~150px) y grande (~800px) en WebP, y sube ambas a Spaces. La BD solo guarda rutas/URLs (tabla `ProductImage` + dos URLs denormalizadas en `Product`). Los binarios NUNCA tocan Postgres → respaldos livianos.

**Tech Stack:** NestJS + Prisma (API), Next.js 14 App Router (web), `sharp` (procesamiento), `@aws-sdk/client-s3` (Spaces), `@zxing/browser` (escáner, ya instalado).

## Convención de verificación (no hay tests en el proyecto)

Trinity **no tiene framework de pruebas** (0 tests, ningún jest/vitest). La convención establecida es **typecheck `0 errores` + prueba funcional en la UI** (ver PROGRESS.md). Este plan sigue esa convención: cada tarea cierra con typecheck + pasos funcionales concretos + commit. No se introduce jest.

## Decisiones de implementación (desviaciones menores del spec)

1. **Transporte base64→JSON** en vez de multipart (el proxy `/api/proxy` no soporta multipart binario). El binario igual termina en Spaces, no en la BD.
2. **Gate por rol (ADMIN + WAREHOUSE)** en vez de un permiso granular `MANAGE_PRODUCT_IMAGES` (no existe guard de permisos en el repo; solo `RolesGuard`). El permiso granular se puede añadir después.
3. **Dos URLs denormalizadas** en `Product` (`primaryImageThumbUrl`, `primaryImageMediumUrl`) para POS y "mostrar al cliente" sin JOIN.
4. **Downscale en cliente a ~1600px** (canvas) antes de base64, para subidas livianas desde el teléfono.

## Prerrequisito de infraestructura (lo hace Diego, NO es código)

Antes de la Tarea 2, crear en DigitalOcean (por empresa):
- Un **Space** (ej. `trinity-ferre`, región `nyc3`).
- Activar **CDN** en el Space.
- Generar **Spaces access key + secret** (API → Spaces Keys).
- Anotar: endpoint (ej. `https://nyc3.digitaloceanspaces.com`), bucket, región, CDN base (ej. `https://trinity-ferre.nyc3.cdn.digitaloceanspaces.com`), key, secret.

Para desarrollo local se pueden usar las MISMAS credenciales de un Space de prueba, o el Space real (las fotos de prueba se pueden borrar). El código no cambia entre local y prod, solo las variables de entorno.

---

### Task 1: Modelo de datos — `ProductImage` + denormalización en `Product`

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260705180000_product_images/migration.sql`
- Modify: `deploy/fix-schema.sql`

- [ ] **Step 1: Agregar el modelo y las relaciones al schema**

En `packages/database/prisma/schema.prisma`, dentro del modelo `Product`, agregar estas 3 líneas (junto a las otras relaciones, antes de `createdAt`):

```prisma
  images                ProductImage[]
  primaryImageThumbUrl  String?
  primaryImageMediumUrl String?
```

Y agregar el modelo nuevo (después de `Product`, siguiendo el molde de `LostSale`):

```prisma
model ProductImage {
  id          String   @id @default(cuid())
  productId   String
  product     Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  thumbKey    String
  mediumKey   String
  isPrimary   Boolean  @default(false)
  sortOrder   Int      @default(0)
  bytes       Int?
  width       Int?
  height      Int?
  createdById String
  createdAt   DateTime @default(now())

  @@index([productId])
}
```

- [ ] **Step 2: Crear el archivo de migración (estilo idempotente del proyecto)**

Crear `packages/database/prisma/migrations/20260705180000_product_images/migration.sql`:

```sql
-- Fotos de productos (Fase 1) — tabla ProductImage + denormalizacion en Product

CREATE TABLE IF NOT EXISTS "ProductImage" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "thumbKey" TEXT NOT NULL,
  "mediumKey" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "bytes" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductImage_productId_idx" ON "ProductImage"("productId");

DO $$ BEGIN
  ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "primaryImageThumbUrl" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "primaryImageMediumUrl" TEXT;
```

- [ ] **Step 3: Espejar en `deploy/fix-schema.sql`**

Agregar al final de `deploy/fix-schema.sql` (red de seguridad idempotente — sin `UPDATE`s):

```sql
-- =============================================================================
-- Fotos de productos (Fase 1)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "ProductImage" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "thumbKey" TEXT NOT NULL,
  "mediumKey" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "bytes" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProductImage_productId_idx" ON "ProductImage"("productId");
DO $$ BEGIN
  ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "primaryImageThumbUrl" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "primaryImageMediumUrl" TEXT;
```

- [ ] **Step 4: Aplicar la migración y regenerar el cliente Prisma (local)**

Desde `packages/database`:

```bash
npx prisma migrate deploy
npx prisma generate
```

Luego aplicar el fix-schema al DB local (ver memoria "Setup local: fix-schema.sql"):

```bash
psql "$DATABASE_URL" -f ../../deploy/fix-schema.sql
```

Expected: `migrate deploy` aplica `20260705180000_product_images`; `generate` regenera `@prisma/client` con el modelo `ProductImage`.

- [ ] **Step 5: Verificar que la columna y la tabla existen**

```bash
psql "$DATABASE_URL" -c "\d \"ProductImage\"" -c "SELECT column_name FROM information_schema.columns WHERE table_name='Product' AND column_name LIKE 'primaryImage%';"
```

Expected: la tabla `ProductImage` con sus columnas + las 2 columnas `primaryImageThumbUrl`/`primaryImageMediumUrl` en `Product`.

- [ ] **Step 6: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260705180000_product_images deploy/fix-schema.sql
git commit -m "feat: modelo ProductImage + denormalizacion de fotos en Product (fotos fase 1)"
```

---

### Task 2: Variables de entorno de Spaces

**Files:**
- Modify: `.env` (raíz — NO se commitea)
- Modify: `.env.example` (raíz — SÍ se commitea)

- [ ] **Step 1: Agregar las variables a `.env` (valores reales del prerrequisito)**

```
SPACES_ENDPOINT="https://nyc3.digitaloceanspaces.com"
SPACES_REGION="nyc3"
SPACES_BUCKET="trinity-ferre"
SPACES_KEY="XXXXXXXXXXXXXXXXXXXX"
SPACES_SECRET="YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY"
SPACES_CDN_BASE="https://trinity-ferre.nyc3.cdn.digitaloceanspaces.com"
```

- [ ] **Step 2: Agregar placeholders a `.env.example`**

```
SPACES_ENDPOINT="https://nyc3.digitaloceanspaces.com"
SPACES_REGION="nyc3"
SPACES_BUCKET=""
SPACES_KEY=""
SPACES_SECRET=""
SPACES_CDN_BASE=""
```

- [ ] **Step 3: Commit (solo el example)**

```bash
git add .env.example
git commit -m "chore: variables de entorno de Spaces en .env.example"
```

---

### Task 3: Instalar dependencias del API

**Files:** `apps/api/package.json` (modificado por pnpm)

- [ ] **Step 1: Instalar `sharp` y el SDK de S3**

```bash
pnpm --filter @trinity/api add sharp @aws-sdk/client-s3
```

- [ ] **Step 2: Verificar que `sharp` carga (binarios nativos)**

```bash
node -e "require('sharp'); console.log('sharp OK')"
```

Expected: `sharp OK` (si falla, revisar binarios nativos para la plataforma).

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore: agregar sharp y @aws-sdk/client-s3 al API"
```

---

### Task 4: `SpacesService` — wrapper de object storage

**Files:**
- Create: `apps/api/src/modules/product-images/spaces.service.ts`

- [ ] **Step 1: Escribir el servicio**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class SpacesService {
  private readonly logger = new Logger(SpacesService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly cdnBase: string;

  constructor(private config: ConfigService) {
    this.bucket = this.config.get<string>('SPACES_BUCKET') || '';
    this.cdnBase = (this.config.get<string>('SPACES_CDN_BASE') || '').replace(/\/$/, '');
    this.client = new S3Client({
      endpoint: this.config.get<string>('SPACES_ENDPOINT'),
      region: this.config.get<string>('SPACES_REGION') || 'us-east-1',
      credentials: {
        accessKeyId: this.config.get<string>('SPACES_KEY') || '',
        secretAccessKey: this.config.get<string>('SPACES_SECRET') || '',
      },
    });
  }

  /** Sube un objeto con lectura pública y devuelve su URL de CDN. */
  async uploadPublic(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ACL: 'public-read',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return this.cdnUrl(key);
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (e) {
      // No es fatal: si el objeto ya no existe, seguimos.
      this.logger.warn(`No se pudo borrar el objeto ${key}: ${(e as Error).message}`);
    }
  }

  cdnUrl(key: string): string {
    return `${this.cdnBase}/${key}`;
  }
}
```

- [ ] **Step 2: Verificar typecheck (se hará junto al módulo en Task 6)**

Nota: este archivo se compila junto al módulo. No hay verificación aislada hasta Task 6.

---

### Task 5: Helper de procesamiento de imágenes (`sharp`)

**Files:**
- Create: `apps/api/src/modules/product-images/image-processing.ts`

- [ ] **Step 1: Escribir el helper**

```typescript
import sharp from 'sharp';

export interface ProcessedImage {
  thumb: Buffer;
  medium: Buffer;
  width: number;
  height: number;
  bytes: number; // tamaño de la version medium
}

const THUMB_SIZE = 150;
const MEDIUM_SIZE = 800;
const WEBP_QUALITY = 80;

/** Recibe el buffer crudo de una imagen y devuelve miniatura + grande en WebP. */
export async function processProductImage(input: Buffer): Promise<ProcessedImage> {
  const base = sharp(input, { failOn: 'none' }).rotate(); // rotate() respeta EXIF orientation
  const meta = await base.metadata();

  const thumb = await base
    .clone()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  const medium = await base
    .clone()
    .resize(MEDIUM_SIZE, MEDIUM_SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  return {
    thumb,
    medium,
    width: meta.width || 0,
    height: meta.height || 0,
    bytes: medium.length,
  };
}

/** Decodifica un data URI ("data:image/jpeg;base64,....") a Buffer. Lanza si es inválido. */
export function dataUriToBuffer(dataUri: string): Buffer {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUri);
  if (!match) throw new Error('Formato de imagen inválido (se esperaba data URI base64)');
  return Buffer.from(match[2], 'base64');
}
```

Nota: si `import sharp from 'sharp'` da error de typing, usar `import * as sharp from 'sharp'` según la config de TS del proyecto (probar en Task 6 typecheck).

---

### Task 6: `ProductImagesModule` — service, controller, DTO + registro

**Files:**
- Create: `apps/api/src/modules/product-images/product-images.service.ts`
- Create: `apps/api/src/modules/product-images/product-images.controller.ts`
- Create: `apps/api/src/modules/product-images/product-images.module.ts`
- Create: `apps/api/src/modules/product-images/dto/upload-product-image.dto.ts`
- Modify: `apps/api/src/app.module.ts` (registrar el módulo en `imports`)

- [ ] **Step 1: DTO**

`dto/upload-product-image.dto.ts`:

```typescript
import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UploadProductImageDto {
  @ApiProperty({ description: 'Imagen como data URI base64 (data:image/...;base64,....)' })
  @IsString()
  @Matches(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, { message: 'La imagen debe ser un data URI base64' })
  image: string;
}
```

- [ ] **Step 2: Service**

`product-images.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SpacesService } from './spaces.service';
import { processProductImage, dataUriToBuffer } from './image-processing';

@Injectable()
export class ProductImagesService {
  constructor(
    private prisma: PrismaService,
    private spaces: SpacesService,
  ) {}

  async list(productId: string) {
    return this.prisma.productImage.findMany({
      where: { productId },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async upload(productId: string, dataUri: string, userId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const raw = dataUriToBuffer(dataUri);
    const processed = await processProductImage(raw);

    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    const baseKey = `products/${productId}/${stamp}-${rand}`;
    const thumbKey = `${baseKey}-thumb.webp`;
    const mediumKey = `${baseKey}-medium.webp`;

    const [thumbUrl, mediumUrl] = await Promise.all([
      this.spaces.uploadPublic(thumbKey, processed.thumb, 'image/webp'),
      this.spaces.uploadPublic(mediumKey, processed.medium, 'image/webp'),
    ]);

    const existingCount = await this.prisma.productImage.count({ where: { productId } });
    const isPrimary = existingCount === 0;

    const image = await this.prisma.productImage.create({
      data: {
        productId,
        thumbKey,
        mediumKey,
        isPrimary,
        sortOrder: existingCount,
        bytes: processed.bytes,
        width: processed.width,
        height: processed.height,
        createdById: userId,
      },
    });

    if (isPrimary) {
      await this.prisma.product.update({
        where: { id: productId },
        data: { primaryImageThumbUrl: thumbUrl, primaryImageMediumUrl: mediumUrl },
      });
    }

    return { ...image, thumbUrl, mediumUrl };
  }

  async remove(productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image) throw new NotFoundException('Imagen no encontrada');

    await Promise.all([this.spaces.delete(image.thumbKey), this.spaces.delete(image.mediumKey)]);
    await this.prisma.productImage.delete({ where: { id: imageId } });

    if (image.isPrimary) {
      const next = await this.prisma.productImage.findFirst({
        where: { productId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      if (next) {
        await this.prisma.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
        await this.prisma.product.update({
          where: { id: productId },
          data: {
            primaryImageThumbUrl: this.spaces.cdnUrl(next.thumbKey),
            primaryImageMediumUrl: this.spaces.cdnUrl(next.mediumKey),
          },
        });
      } else {
        await this.prisma.product.update({
          where: { id: productId },
          data: { primaryImageThumbUrl: null, primaryImageMediumUrl: null },
        });
      }
    }

    return { message: 'Imagen eliminada' };
  }
}
```

- [ ] **Step 3: Controller (gate por rol ADMIN + WAREHOUSE en escritura)**

`product-images.controller.ts`:

```typescript
import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProductImagesService } from './product-images.service';
import { UploadProductImageDto } from './dto/upload-product-image.dto';

@ApiTags('ProductImages')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('products/:productId/images')
export class ProductImagesController {
  constructor(private service: ProductImagesService) {}

  @Get()
  list(@Param('productId') productId: string) {
    return this.service.list(productId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE)
  upload(
    @Param('productId') productId: string,
    @Body() dto: UploadProductImageDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.upload(productId, dto.image, userId);
  }

  @Delete(':imageId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE)
  remove(@Param('productId') productId: string, @Param('imageId') imageId: string) {
    return this.service.remove(productId, imageId);
  }
}
```

- [ ] **Step 4: Module**

`product-images.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ProductImagesController } from './product-images.controller';
import { ProductImagesService } from './product-images.service';
import { SpacesService } from './spaces.service';

@Module({
  controllers: [ProductImagesController],
  providers: [ProductImagesService, SpacesService],
  exports: [ProductImagesService],
})
export class ProductImagesModule {}
```

- [ ] **Step 5: Registrar en `app.module.ts`**

En `apps/api/src/app.module.ts`, importar y agregar `ProductImagesModule` al array `imports` (junto a los demás módulos de dominio):

```typescript
import { ProductImagesModule } from './modules/product-images/product-images.module';
// ... en imports: [ ... , ProductImagesModule ]
```

- [ ] **Step 6: Verificar typecheck del API**

```bash
pnpm --filter @trinity/api exec tsc --noEmit
```

Expected: 0 errores. (Si `sharp` da error de import, cambiar a `import * as sharp from 'sharp'` en `image-processing.ts` y reintentar.)

- [ ] **Step 7: Verificar que el API bootea y las rutas existen**

```bash
pnpm --filter @trinity/api start
```

Expected: arranca sin error; en el log de rutas aparecen `GET/POST /products/:productId/images` y `DELETE /products/:productId/images/:imageId`. Detener con Ctrl+C.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/product-images apps/api/src/app.module.ts
git commit -m "feat: endpoints de fotos de producto (upload/list/delete) con Spaces + sharp"
```

---

### Task 7: Exponer las miniaturas en la búsqueda del POS

**Contexto:** El POS usa `GET /products?search=...&limit=500` → `findAll()`, que hace `findMany` sin `select`, así que **ya devuelve** los campos escalares nuevos (`primaryImageThumbUrl`, `primaryImageMediumUrl`) automáticamente. No requiere cambios. Solo se ajusta el método `search()` (endpoint `/products/search`) por consistencia.

**Files:**
- Modify: `apps/api/src/modules/products/products.service.ts` (método `search`, ~líneas 210-243)

- [ ] **Step 1: Agregar la miniatura al SELECT y al map de `search()`**

En el `$queryRaw` de `search()`, agregar `p."primaryImageThumbUrl"` al SELECT:

```typescript
    SELECT p.id, p.code, p.name, p."priceDetal", p."priceMayor", p."isService",
      p."primaryImageThumbUrl",
      COALESCE((SELECT SUM(s.quantity) FROM "Stock" s WHERE s."productId" = p.id), 0) as "totalStock"
```

Y en el `.map`, agregar el campo:

```typescript
  return results.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    priceDetal: Number(r.priceDetal),
    priceMayor: Number(r.priceMayor),
    totalStock: Number(r.totalStock),
    isService: r.isService,
    primaryImageThumbUrl: r.primaryImageThumbUrl ?? null,
  }));
```

- [ ] **Step 2: Verificar typecheck**

```bash
pnpm --filter @trinity/api exec tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/products/products.service.ts
git commit -m "feat: exponer primaryImageThumbUrl en /products/search"
```

---

### Task 8: Mostrar la miniatura en el POS + lightbox "mostrar al cliente"

**Files:**
- Modify: `apps/web/src/app/(dashboard)/sales/pos/page.tsx` (DOS bloques de render de resultados: ~línea 1700 desktop y ~línea 2853 móvil; + estado nuevo para el lightbox)

- [ ] **Step 1: Agregar estado para el lightbox (junto a los demás `useState`, ~línea 201)**

```typescript
const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
```

- [ ] **Step 2: Insertar la miniatura en AMBOS bloques de resultados**

En cada `<button>` de resultado, ANTES del `<div className="flex-1 min-w-0">`, insertar:

```jsx
{product.primaryImageThumbUrl ? (
  <img
    src={product.primaryImageThumbUrl}
    alt=""
    onClick={(e) => { e.stopPropagation(); setLightboxUrl(product.primaryImageMediumUrl || product.primaryImageThumbUrl); }}
    className="w-10 h-10 rounded object-cover border border-slate-700 flex-shrink-0 mr-3 cursor-zoom-in"
  />
) : (
  <div className="w-10 h-10 rounded bg-slate-800 border border-slate-700 flex-shrink-0 mr-3 flex items-center justify-center">
    <ImageIcon size={16} className="text-slate-600" />
  </div>
)}
```

Asegurar que `ImageIcon` esté importado de lucide-react (arriba del archivo): `import { ..., Image as ImageIcon } from 'lucide-react';`

- [ ] **Step 3: Agregar el modal lightbox (una vez, cerca del cierre del JSX raíz del componente)**

```jsx
{lightboxUrl && (
  <div
    onClick={() => setLightboxUrl(null)}
    className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
  >
    <img src={lightboxUrl} alt="" className="max-w-full max-h-full rounded-lg object-contain" />
  </div>
)}
```

- [ ] **Step 4: Verificar typecheck del web**

```bash
pnpm --filter @trinity/web exec tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 5: Prueba funcional (requiere una foto ya subida — se puede diferir a Task 10)**

Con el web corriendo, buscar en el POS un producto con foto → debe verse la miniatura; hacer click en la miniatura → abre la imagen grande; click fuera → cierra. Productos sin foto muestran el placeholder.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/(dashboard)/sales/pos/page.tsx
git commit -m "feat: miniatura de producto en el POS + lightbox para mostrar al cliente"
```

---

### Task 9: Pantalla de sesión de fotos móvil (flujo B)

**Files:**
- Create: `apps/web/src/app/(dashboard)/catalog/photo-session/page.tsx`
- Modify: `apps/web/src/components/sidebar.tsx` (agregar entrada bajo CATÁLOGO)

- [ ] **Step 1: Crear la página**

`catalog/photo-session/page.tsx` (mobile-first: buscar/escanear producto → cámara → downscale a 1600px → subir):

```tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Search, Loader2, Check, X, Image as ImageIcon } from 'lucide-react';

interface FoundProduct {
  id: string;
  code: string;
  name: string;
  barcode?: string | null;
  primaryImageThumbUrl?: string | null;
}

// Reduce la imagen a maxSize px (lado mayor) y devuelve un data URI JPEG.
function downscaleToDataUri(file: File, maxSize = 1600, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No canvas context'));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

export default function PhotoSessionPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoundProduct[]>([]);
  const [selected, setSelected] = useState<FoundProduct | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { document.title = 'Sesión de fotos | Trinity ERP'; }, []);

  const doSearch = useCallback((q: string) => {
    setQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!q.trim()) { setResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/proxy/products?search=${encodeURIComponent(q)}&limit=30`);
        const data = await res.json();
        setResults(data.data || []);
      } catch { /* ignore */ }
    }, 300);
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selected) return;
    setUploading(true);
    setMsg(null);
    try {
      const dataUri = await downscaleToDataUri(file);
      const res = await fetch(`/api/proxy/products/${selected.id}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUri }),
      });
      if (res.ok) {
        const img = await res.json();
        setMsg({ type: 'ok', text: `Foto guardada para ${selected.code}` });
        setSelected({ ...selected, primaryImageThumbUrl: selected.primaryImageThumbUrl || img.thumbUrl });
      } else {
        const err = await res.json().catch(() => ({}));
        setMsg({ type: 'err', text: err.message || 'Error al subir la foto' });
      }
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <Camera className="text-purple-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Sesión de fotos</h1>
          <p className="text-slate-400 text-sm">Busca o escanea un producto y tómale la foto</p>
        </div>
      </div>

      {msg && (
        <div className={`mb-3 px-4 py-2 rounded-lg text-sm ${msg.type === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {msg.text}
        </div>
      )}

      {!selected ? (
        <>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              autoFocus
              value={query}
              onChange={(e) => doSearch(e.target.value)}
              placeholder="Código, nombre o código de barras..."
              className="input-field pl-10 w-full"
            />
          </div>
          <div className="card divide-y divide-slate-700/40">
            {results.map((p) => (
              <button key={p.id} onClick={() => { setSelected(p); setResults([]); setQuery(''); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-700/40">
                {p.primaryImageThumbUrl
                  ? <img src={p.primaryImageThumbUrl} alt="" className="w-10 h-10 rounded object-cover border border-slate-700" />
                  : <div className="w-10 h-10 rounded bg-slate-800 border border-slate-700 flex items-center justify-center"><ImageIcon size={16} className="text-slate-600" /></div>}
                <div className="min-w-0">
                  <div className="text-xs font-mono text-slate-500">{p.code}</div>
                  <div className="text-sm text-white truncate">{p.name}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="card p-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs font-mono text-slate-500">{selected.code}</div>
              <div className="text-lg text-white font-medium">{selected.name}</div>
            </div>
            <button onClick={() => { setSelected(null); setMsg(null); }} className="text-slate-400 hover:text-white"><X size={20} /></button>
          </div>

          {selected.primaryImageThumbUrl && (
            <div className="mb-4 flex items-center gap-2 text-sm text-green-400">
              <Check size={16} /> Ya tiene foto principal
              <img src={selected.primaryImageThumbUrl} alt="" className="w-12 h-12 rounded object-cover ml-auto border border-slate-700" />
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3">
            {uploading ? <><Loader2 size={20} className="animate-spin" /> Subiendo...</> : <><Camera size={20} /> Tomar / elegir foto</>}
          </button>

          <button onClick={() => { setSelected(null); setMsg(null); }} className="btn-secondary w-full mt-2">
            Siguiente producto
          </button>
        </div>
      )}
    </div>
  );
}
```

Nota de reuso del escáner: el `<input type="file" accept="image/*" capture="environment">` abre la cámara nativa del teléfono directamente (más simple y robusto que ZXing para *tomar* la foto). El escáner ZXing del POS se reutiliza en una iteración posterior si se quiere resolver el producto **escaneando** el código de barras; para el MVP, la búsqueda por código/nombre cubre el flujo. (Ver `startZxingScanner` en `pos/page.tsx` líneas 1504-1530 como referencia si se agrega.)

- [ ] **Step 2: Agregar la entrada al sidebar**

Leer `apps/web/src/components/sidebar.tsx`, ubicar la sección CATÁLOGO (donde están Productos/Categorías/Marcas/Proveedores) y agregar una entrada nueva espejando el patrón existente:
- Label: `Sesión de fotos`
- Ruta: `/catalog/photo-session`
- Icono: `Camera` (de lucide-react)

- [ ] **Step 3: Verificar typecheck del web**

```bash
pnpm --filter @trinity/web exec tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/(dashboard)/catalog/photo-session apps/web/src/components/sidebar.tsx
git commit -m "feat: pantalla de sesion de fotos movil (flujo B)"
```

---

### Task 10: Prueba funcional end-to-end + checklist de deploy

- [ ] **Step 1: Levantar API + web en local**

```bash
pnpm dev
```

(o `pnpm --filter @trinity/api start` y `pnpm --filter @trinity/web dev` en paralelo)

- [ ] **Step 2: Flujo completo de subida (flujo B)**

1. Login como ADMIN o WAREHOUSE.
2. Ir a Catálogo → Sesión de fotos.
3. Buscar un producto por código → seleccionarlo.
4. "Tomar / elegir foto" → elegir una imagen.
5. Esperar "Foto guardada para {código}".

Verificar en Spaces (panel de DO) que existen los objetos `products/{id}/...-thumb.webp` y `...-medium.webp`. Verificar en BD:

```bash
psql "$DATABASE_URL" -c "SELECT id, \"isPrimary\", \"thumbKey\" FROM \"ProductImage\" ORDER BY \"createdAt\" DESC LIMIT 3;"
psql "$DATABASE_URL" -c "SELECT code, \"primaryImageThumbUrl\" FROM \"Product\" WHERE \"primaryImageThumbUrl\" IS NOT NULL LIMIT 3;"
```

Expected: filas en `ProductImage`, la primera `isPrimary=true`, y el `Product` con `primaryImageThumbUrl` seteado.

- [ ] **Step 3: Ver la foto en el POS**

Ir a POS → buscar el producto → ver la miniatura → click en la miniatura → se abre la imagen grande (lightbox) → click fuera → cierra. Un producto sin foto muestra el placeholder.

- [ ] **Step 4: Borrado (opcional, vía API)**

```bash
# con un token válido, borrar y confirmar que promueve/limpia primary
curl -X DELETE "http://localhost:4000/products/{productId}/images/{imageId}" -H "Authorization: Bearer {TOKEN}"
psql "$DATABASE_URL" -c "SELECT code, \"primaryImageThumbUrl\" FROM \"Product\" WHERE id='{productId}';"
```

Expected: si era la única foto, `primaryImageThumbUrl` queda NULL; si había otra, queda la siguiente.

- [ ] **Step 5: Pre-deploy checklist (regla CLAUDE.md)**

Antes de decirle a Diego que despliegue, verificar:
- [ ] Migración `20260705180000_product_images` commiteada.
- [ ] `deploy/fix-schema.sql` actualizado y commiteado.
- [ ] Módulo `ProductImagesModule` registrado en `app.module.ts` y commiteado.
- [ ] `apps/api/package.json` + `pnpm-lock.yaml` con `sharp`/`@aws-sdk/client-s3` commiteados.
- [ ] Variables `SPACES_*` cargadas EN CADA SERVER (`.env` de prod) — se configuran a mano en el server, NO van en git.
- [ ] `sharp` compila en el server (Ubuntu). Si falla, `pnpm rebuild sharp` en el server.
- [ ] Space + CDN creados por empresa (una por server).

- [ ] **Step 6: Commit final (si hubo ajustes) y aviso a Diego para deploy manual**

El deploy lo hace Diego (ver memoria "Deploy lo hace el usuario"):
```
ssh root@<server> "cd /opt/Trinity && git pull origin main && bash deploy.sh"
```
Recordar cargar las `SPACES_*` en el `.env` del server ANTES del deploy.

---

## Fuera de alcance (Fase 2 — plan aparte)

- **Flujo C** (carga masiva por `code` o `supplierRef`, con reporte de ambiguos/sin-match).
- **Flujo A** (galería en el detalle del producto: reordenar, marcar principal, borrar desde la UI).
- Reutilizar el escáner **ZXing** en la sesión de fotos para resolver el producto escaneando el código de barras.
- Múltiples fotos por producto en la UI (el backend ya lo soporta).
- Limpieza de objetos huérfanos en Spaces al borrar un `Product` (hoy el `onDelete: Cascade` borra las filas `ProductImage` pero no los objetos).
- Página web / catálogo público.

## Self-review (hecho)

- **Cobertura del spec:** modelo `ProductImage` ✓ (T1); denormalización ✓ (T1); pipeline sharp+Spaces ✓ (T4-T6); optimización automática ✓ (T5); permiso→rol ✓ (T6, desviación documentada); flujo B ✓ (T9); miniatura POS ✓ (T8); lightbox ✓ (T8); infra/env/respaldos ✓ (T2, prerrequisito); faseo ✓. Flujos A y C explícitamente diferidos a Fase 2.
- **Placeholders:** ninguno; todo el código está completo. Los valores `SPACES_*` de ejemplo son ilustrativos (se reemplazan con los reales del prerrequisito).
- **Consistencia de tipos:** `thumbKey`/`mediumKey` usados igual en schema, migración, service y borrado; `primaryImageThumbUrl`/`primaryImageMediumUrl` consistentes en schema, service, `search()`, POS y sesión de fotos; `processProductImage`/`dataUriToBuffer` definidos en T5 y usados en T6.
