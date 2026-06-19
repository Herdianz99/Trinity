import type { MetadataRoute } from 'next';

// Next App Router sirve esto en /manifest.webmanifest con el content-type correcto
// y agrega el <link rel="manifest"> automaticamente.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'El Trebol — Trinity ERP',
    short_name: 'El Trebol',
    description: 'ERP para ferreterias venezolanas',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0f172a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
