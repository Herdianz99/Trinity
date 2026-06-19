'use client';

import { useEffect } from 'react';

// Registra el service worker para que la app sea instalable como PWA.
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* si falla el registro, la app sigue funcionando como web normal */
      });
    }
  }, []);
  return null;
}
