import { NextRequest, NextResponse } from 'next/server';
import { SERVER_API_URL, forwardClientIp } from '@/lib/server-api';

// SERVER_API_URL sale de API_PROXY_TARGET (runtime, no se congela en build como
// NEXT_PUBLIC_*). Util para correr 2 instancias desde un mismo build (pruebas locales)
// y OBLIGATORIO en prod = localhost para no romper el IP-lock (ver server-api.ts).
const API_URL = SERVER_API_URL;

async function handler(request: NextRequest, { params }: { params: { path: string[] } }) {
  const token = request.cookies.get('accessToken')?.value;
  const path = params.path.join('/');

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const contentType = request.headers.get('content-type');
  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  // IP-lock: este proxy corre server-side, asi que el API veria SIEMPRE la IP del
  // servidor y nunca la del navegador. Reenviamos la IP real del cliente (ver server-api.ts).
  Object.assign(headers, forwardClientIp(request));

  let body: string | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.text();
  }

  try {
    const queryString = request.nextUrl.search;
    const res = await fetch(`${API_URL}/${path}${queryString}`, {
      method: request.method,
      headers,
      body,
    });

    const resContentType = res.headers.get('content-type') || 'application/json';
    const disposition = res.headers.get('content-disposition');

    // Respuestas binarias o DESCARGABLES se reenvían como ArrayBuffer (bytes crudos):
    //  - preserva el Content-Disposition -> el navegador descarga en vez de mostrar
    //  - preserva la codificacion original (ej. XML/TXT SENIAT en windows-1252, que
    //    res.text() decodificaria como UTF-8 y corromperia las tildes/enes).
    // Cubre PDF, XML, TXT, xlsx/office e imagenes, y cualquier endpoint que declare
    // una descarga con Content-Disposition.
    if (
      disposition ||
      resContentType.includes('application/pdf') ||
      resContentType.includes('application/octet-stream') ||
      resContentType.includes('xml') ||
      resContentType.includes('text/plain') ||
      resContentType.includes('spreadsheet') ||
      resContentType.includes('application/vnd') ||
      resContentType.includes('image/')
    ) {
      const buffer = await res.arrayBuffer();
      const responseHeaders: Record<string, string> = { 'Content-Type': resContentType };
      if (disposition) responseHeaders['Content-Disposition'] = disposition;
      return new NextResponse(buffer, { status: res.status, headers: responseHeaders });
    }

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { 'Content-Type': resContentType },
    });
  } catch {
    return NextResponse.json({ message: 'Error connecting to API' }, { status: 502 });
  }
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
