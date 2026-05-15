import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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

    // Binary responses (PDF, images, etc.) must be forwarded as ArrayBuffer
    if (resContentType.includes('application/pdf') || resContentType.includes('application/octet-stream')) {
      const buffer = await res.arrayBuffer();
      const responseHeaders: Record<string, string> = { 'Content-Type': resContentType };
      const disposition = res.headers.get('content-disposition');
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
