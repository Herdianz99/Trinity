import { NextRequest, NextResponse } from 'next/server';
import { SERVER_API_URL, forwardClientIp } from '@/lib/server-api';

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get('accessToken')?.value;

  if (!token) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await request.json();

    const res = await fetch(`${SERVER_API_URL}/auth/change-password`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...forwardClientIp(request),
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { message: data.message || 'Error al cambiar contrasena' },
        { status: res.status },
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { message: 'Error del servidor' },
      { status: 500 },
    );
  }
}
