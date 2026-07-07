// sharp 0.35 tipa la funcion como default export, pero bajo CommonJS `require('sharp')`
// devuelve la funcion directamente (module.exports = sharp, sin `.default`). Usamos require
// para el runtime y el tipo del default export para el typecheck.
const sharp = require('sharp') as typeof import('sharp').default;

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
