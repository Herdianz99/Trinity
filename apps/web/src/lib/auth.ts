import { cookies } from 'next/headers';

export function getToken(): string | undefined {
  const cookieStore = cookies();
  return cookieStore.get('accessToken')?.value;
}

export function getRefreshToken(): string | undefined {
  const cookieStore = cookies();
  return cookieStore.get('refreshToken')?.value;
}
