// Duracion de la cookie del refresh token. El totem del piso de venta (rol TOTEM) no debe cerrarse solo:
// su refresh token dura 90 dias y se renueva en cada refresco (ver auth.service del API).
const DAY = 60 * 60 * 24;

export function refreshCookieMaxAge(refreshToken: string): number {
  try {
    const part = refreshToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(part));
    if (payload?.role === 'TOTEM') return 90 * DAY;
  } catch { /* token raro: duracion normal */ }
  return 7 * DAY;
}
