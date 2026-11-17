import { NextRequest, NextResponse } from 'next/server';
import { SERVER_API_URL, forwardClientIp } from '@/lib/server-api';
import { refreshCookieMaxAge } from '@/lib/auth-cookies';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const res = await fetch(`${SERVER_API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...forwardClientIp(request) },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { message: data.message || 'Credenciales invalidas' },
        { status: res.status },
      );
    }

    const response = NextResponse.json({
      user: data.user,
      mustChangePassword: data.user.mustChangePassword,
    });

    const isSecure = process.env.COOKIE_SECURE !== 'false';

    response.cookies.set('accessToken', data.accessToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60, // 1 hour
    });

    response.cookies.set('refreshToken', data.refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: refreshCookieMaxAge(data.refreshToken), // 7 dias (90 el totem)
    });

    return response;
  } catch (error: any) {
    return NextResponse.json(
      { message: 'Error del servidor' },
      { status: 500 },
    );
  }
}
