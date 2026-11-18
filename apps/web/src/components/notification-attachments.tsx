'use client';
import { useState } from 'react';
import { FileText, Trash2 } from 'lucide-react';
import { ImageZoomLightbox } from '@/components/image-zoom-lightbox';

export interface NotificationAttachment {
  id: string;
  thumbUrl: string;
  fullUrl: string;
  mimeType: string;
  fileName: string | null;
  bytes: number;
}

export const isPdfAttachment = (a: { mimeType?: string; fullUrl: string }) =>
  a.mimeType === 'application/pdf' || a.fullUrl.toLowerCase().endsWith('.pdf');

// ---- Preparación de archivos en el navegador (antes de subir) ----

export const MAX_PDF_BYTES = 10 * 1024 * 1024; // el PDF viaja sin comprimir (límite del API: 15 MB en base64)
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // la imagen se re-comprime antes de subir

/** Valida tipo/tamaño. Devuelve el mensaje de error, o null si el archivo es aceptable. */
export function validateAttachmentFile(file: File): string | null {
  const isPdf = file.type === 'application/pdf';
  const isImage = file.type.startsWith('image/');
  if (!isPdf && !isImage) return `"${file.name}" no es una imagen ni un PDF`;
  if (isPdf && file.size > MAX_PDF_BYTES) return `El PDF "${file.name}" supera 10 MB`;
  if (isImage && file.size > MAX_IMAGE_BYTES) return `La imagen "${file.name}" supera 25 MB`;
  return null;
}

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

// Redimensiona a maxDim y exporta JPEG (respeta EXIF). El servidor luego la pasa a WebP.
async function compressImage(file: File, maxDim = 2000, quality = 0.85): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  let { width, height } = bitmap;
  if (width > maxDim || height > maxDim) {
    const scale = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', quality);
}

/** Sube un archivo como adjunto de la notificación. Lanza Error con mensaje legible si falla. */
export async function uploadNotificationAttachment(notificationId: string, file: File) {
  const isPdf = file.type === 'application/pdf';
  const data = isPdf ? await fileToDataUri(file) : await compressImage(file);
  const res = await fetch(`/api/proxy/notifications/${notificationId}/attachments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: data, fileName: file.name }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || `No se pudo subir "${file.name}"`);
  }
  return (await res.json()) as NotificationAttachment;
}

// ---- Vista de adjuntos: miniaturas para fotos (zoom al tocar) y tarjeta para PDF ----
export function NotificationAttachmentsView({
  items,
  onDelete,
}: {
  items: NotificationAttachment[];
  onDelete?: (id: string) => void;
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  if (!items.length) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {items.map((a) => {
          const pdf = isPdfAttachment(a);
          return (
            <div key={a.id} className="group relative">
              {pdf ? (
                <a
                  href={a.fullUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-900/60 px-2 text-center hover:bg-slate-800/60 transition-colors"
                  title={a.fileName ? `Abrir ${a.fileName}` : 'Abrir PDF'}
                >
                  <FileText size={28} className="text-red-400" />
                  <span className="w-full truncate text-[10px] text-slate-400">{a.fileName || 'PDF'}</span>
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => setLightbox(a.fullUrl)}
                  className="block h-24 w-24 overflow-hidden rounded-lg border border-slate-700"
                  title="Ver en grande"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.thumbUrl} alt={a.fileName || 'Adjunto'} className="h-full w-full object-cover" loading="lazy" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(a.id)}
                  className="absolute top-1 right-1 rounded-md bg-black/70 p-1 text-red-300 hover:bg-red-600 hover:text-white sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  title="Eliminar archivo"
                  aria-label="Eliminar archivo"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {lightbox && <ImageZoomLightbox url={lightbox} alt="Adjunto de la notificación" onClose={() => setLightbox(null)} />}
    </>
  );
}
