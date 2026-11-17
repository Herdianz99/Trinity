import { NextRequest, NextResponse } from 'next/server';
import { SERVER_API_URL, forwardClientIp } from '@/lib/server-api';
import { refreshCookieMaxAge } from '@/lib/auth-cookies';

type Tokens = { accessToken: string; refreshToken: string };

async function refreshTokens(request: NextRequest): Promise<Tokens | null> {
  const refreshToken = request.cookies.get('refreshToken')?.value;
  if (!refreshToken) return null;
  const res = await fetch(`${SERVER_API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...forwardClientIp(request) },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;
  return res.json();
}

function setTokenCookies(response: NextResponse, data: Tokens) {
  const isSecure = process.env.COOKIE_SECURE !== 'false';
  response.cookies.set('accessToken', data.accessToken, {
    httpOnly: true, secure: isSecure, sameSite: 'lax', path: '/', maxAge: 60 * 60,
  });
  response.cookies.set('refreshToken', data.refreshToken, {
    httpOnly: true, secure: isSecure, sameSite: 'lax', path: '/', maxAge: refreshCookieMaxAge(data.refreshToken),
  });
}

export async function POST(request: NextRequest) {
  try {
    if (!request.cookies.get('refreshToken')?.value) {
      return NextResponse.json({ message: 'No refresh token' }, { status: 401 });
    }
    const data = await refreshTokens(request);
    if (!data) {
      const response = NextResponse.json({ message: 'Session expired' }, { status: 401 });
      response.cookies.delete('accessToken');
      response.cookies.delete('refreshToken');
      return response;
    }
    const response = NextResponse.json({ success: true });
    setTokenCookies(response, data);
    return response;
  } catch {
    return NextResponse.json({ message: 'Error del servidor' }, { status: 500 });
  }
}

// El totem al abrir /totem con el token de acceso vencido (TV apagado mas de 1 h, se fue la luz): el
// middleware lo manda aqui para renovar con el refresh token y volver, en vez de pedir usuario y clave.
export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get('next') === '/totem' ? '/totem' : '/dashboard';
  try {
    const data = await refreshTokens(request);
    if (data) {
      const response = NextResponse.redirect(new URL(next, request.url));
      setTokenCookies(response, data);
      return response;
    }
  } catch { /* cae al login */ }
  return NextResponse.redirect(new URL('/login', request.url));
}
