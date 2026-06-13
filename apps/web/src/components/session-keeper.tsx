'use client';

import { useEffect, useRef } from 'react';

// El token de acceso dura 1h. Renovamos cada 45 min (antes de que venza) usando el
// refresh token (7d) via /api/auth/refresh, para que la sesion no expire mientras se trabaja.
const REFRESH_INTERVAL_MS = 45 * 60 * 1000; // 45 minutos
const STALE_MS = 10 * 60 * 1000; // si paso >10 min sin refrescar, refrescar al volver a la pestaña

export default function SessionKeeper() {
  const lastRefresh = useRef<number>(Date.now());

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        await fetch('/api/auth/refresh', { method: 'POST' });
        if (!cancelled) lastRefresh.current = Date.now();
      } catch {
        /* si falla, no hacemos nada: el flujo normal seguira su curso */
      }
    }

    const interval = setInterval(() => {
      if (!cancelled) refresh();
    }, REFRESH_INTERVAL_MS);

    // Al volver a la pestaña tras un rato, renovar para evitar quedar con token vencido
    function onVisible() {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastRefresh.current > STALE_MS
      ) {
        refresh();
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  return null;
}
