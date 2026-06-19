// Service worker minimo: habilita la instalacion de la PWA (sin cache offline).
// La presencia de un handler 'fetch' es lo que Chrome exige para considerar la app instalable.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // Passthrough: no interceptamos nada, la red maneja todas las peticiones.
});
