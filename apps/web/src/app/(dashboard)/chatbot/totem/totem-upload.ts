// Subida de archivos del totem por pedazos de 5 MB en base64: el proxy de Next reenvia el cuerpo como texto
// y el API acepta JSON de hasta 15 MB, asi que un video de 200 MB no puede ir de una sola vez.

export interface TotemMedia {
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  status: 'PROCESSING' | 'READY' | 'FAILED';
  error: string | null;
  originalName: string | null;
  url: string | null;
  thumbUrl: string | null;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  createdAt: string;
}

const API = '/api/proxy/totem/admin';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Error al subir');
  return data as T;
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(blob);
  });
}

/** Sube el archivo y devuelve el registro (queda PROCESSING hasta que el servidor lo comprime). */
export async function uploadTotemFile(file: File, onProgress: (pct: number) => void): Promise<TotemMedia> {
  const { uploadId, chunkBytes } = await post<{ uploadId: string; chunkBytes: number }>('uploads', {
    fileName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size,
  });
  let index = 0;
  for (let start = 0; start < file.size; start += chunkBytes, index++) {
    const data = await toBase64(file.slice(start, start + chunkBytes));
    let tries = 0;
    for (;;) {
      try { await post(`uploads/${uploadId}/chunk`, { index, data }); break; } catch (e) {
        if (++tries >= 3) throw e; // conexion inestable: reintenta el mismo pedazo
      }
    }
    onProgress(Math.min(99, Math.round(((start + chunkBytes) / file.size) * 100)));
  }
  const media = await post<TotemMedia>(`uploads/${uploadId}/complete`, {});
  onProgress(100);
  return media;
}

export const fmtBytes = (b: number) =>
  b >= 1024 * 1024 * 1024 ? `${(b / 1024 ** 3).toFixed(2)} GB`
    : b >= 1024 * 1024 ? `${(b / 1024 ** 2).toFixed(1)} MB`
      : `${Math.max(1, Math.round(b / 1024))} KB`;
