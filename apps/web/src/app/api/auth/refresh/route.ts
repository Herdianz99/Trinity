import { NextRequest, NextResponse } from 'next/server';
import { SERVER_API_URL, forwardClientIp } from '@/lib/server-api';

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get('refreshToken')?.value;

    if (!refreshToken) {
      return NextResponse.json({ message: 'No refresh token' }, { status: 401 });
    }

    const res = await fetch(`${SERVER_API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...forwardClientIp(request) },
      body: JSON.stringify({ refreshToken }),
    });

    const data = await res.json();

    if (!res.ok) {
      const response = NextResponse.json({ message: 'Session expired' }, { status: 401 });
      response.cookies.delete('accessToken');
      response.cookies.delete('refreshToken');
      return response;
    }

    const response = NextResponse.json({ success: true });

    const isSecure = process.env.COOKIE_SECURE !== 'false';

    response.cookies.set('accessToken', data.accessToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60,
    });

    response.cookies.set('refreshToken', data.refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch {
    return NextResponse.json({ message: 'Error del servidor' }, { status: 500 });
  }
}
