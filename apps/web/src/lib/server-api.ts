import { NextRequest } from 'next/server';
import { headers } from 'next/headers';

// Backend para las llamadas server-side (proxy `[...path]` y rutas `/api/auth/*`).
// En prod DEBE resolver a localhost (via API_PROXY_TARGET) y NO al dominio publico:
// si rebota por internet, el request reentra por el nginx del API y ese salto extra
// mete la IP publica del propio servidor en X-Forwarded-For, rompiendo el IP-lock
// (el API veria la IP del server en vez de la del cliente).
export const SERVER_API_URL =
  process.env.API_PROXY_TARGET || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Estas rutas corren server-side, asi que el API veria SIEMPRE la IP del servidor.
// nginx ya puso la IP real del navegador en X-Real-IP / X-Forwarded-For al entrar a
// Next; la reenviamos como X-Forwarded-For para que el API (trust proxy) la lea.
export function forwardClientIp(request: NextRequest): Record<string, string> {
  const clientIp =
    request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for');
  return clientIp ? { 'X-Forwarded-For': clientIp } : {};
}

// Variante para SERVER COMPONENTS (layout/page async, sin NextRequest): la IP real
// del cliente sale de los headers entrantes que Next expone via next/headers.
// Sin esto, un fetch server-side al API llega con la IP del servidor y el IP-lock
// bloquea a los usuarios restringidos aun estando en el local (menus vacios, etc.).
export function forwardClientIpFromHeaders(): Record<string, string> {
  const h = headers();
  const clientIp = h.get('x-real-ip') || h.get('x-forwarded-for');
  return clientIp ? { 'X-Forwarded-For': clientIp } : {};
}
