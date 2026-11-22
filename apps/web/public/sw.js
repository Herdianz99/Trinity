// Service worker de Trinity.
// 1) Habilita la instalacion de la PWA (sin cache offline): Chrome exige un handler 'fetch'.
// 2) Notificaciones push (Sesion 193): llamados del totem a los vendedores y pedidos de la tienda
//    online. Llegan aunque Trinity este cerrado o la tablet bloqueada. El API las firma con VAPID
//    (apps/api/src/modules/push) y manda un JSON { title, body, tag, url, actions, ... }.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // Passthrough: no interceptamos nada, la red maneja todas las peticiones.
});

const ICON = '/icons/icon-192.png';

self.addEventListener('push', (event) => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch { p = { title: 'Trinity', body: event.data ? event.data.text() : '' }; }
  const options = {
    body: p.body || '',
    tag: p.tag || undefined,
    renotify: !!(p.renotify && p.tag),
    silent: !!p.silent,
    requireInteraction: !!p.requireInteraction,
    icon: ICON,
    badge: ICON,
    vibrate: p.silent ? undefined : [300, 120, 300, 120, 300],
    actions: Array.isArray(p.actions) ? p.actions : [],
    data: { url: p.url || '/', ...(p.data || {}) },
  };
  // Avisar a las pestanas abiertas (el aviso dentro de Trinity se refresca al instante).
  const notifyTabs = self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((tabs) => tabs.forEach((t) => t.postMessage({ type: 'trinity-push', data: options.data })));
  event.waitUntil(Promise.all([self.registration.showNotification(p.title || 'Trinity', options), notifyTabs]));
});

// POST al API pasando por el proxy de Next (lleva la cookie de sesion). Si el token de acceso
// vencio (la tablet estuvo bloqueada mas de 1 h), se renueva con el refresh token y se reintenta.
async function apiPost(path) {
  const call = () => fetch(`/api/proxy/${path}`, { method: 'POST', credentials: 'include' });
  let res = await call();
  if (res.status === 401) {
    const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (r.ok) res = await call();
  }
  return res;
}

async function openUrl(url) {
  const target = new URL(url, self.location.origin).href;
  const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const t of tabs) {
    if (new URL(t.url).origin === self.location.origin && 'focus' in t) {
      await t.focus();
      if ('navigate' in t) return t.navigate(target).catch(() => undefined);
      return undefined;
    }
  }
  return self.clients.openWindow(target);
}

self.addEventListener('notificationclick', (event) => {
  const n = event.notification;
  const data = n.data || {};
  n.close();

  // Boton "Voy yo" del llamado del totem: se atiende sin abrir Trinity.
  if (event.action === 'attend-totem' && data.conversationId) {
    event.waitUntil((async () => {
      let title = '✅ Listo, le avisamos al cliente que vas';
      let body = 'Acércate a la pantalla de Clover.';
      try {
        const res = await apiPost(`totem-calls/${data.conversationId}/attend`);
        if (res.ok) {
          const r = await res.json();
          if (!r.mine) { title = `${r.attendedByName || 'Otro vendedor'} ya va a atender al cliente`; body = 'No hace falta que vayas.'; }
        } else if (res.status === 401) {
          return openUrl(`/llamados?id=${data.conversationId}`); // sin sesion: que entre y lo haga ahi
        } else {
          title = 'No se pudo marcar "Voy yo"'; body = 'Abre Trinity → Llamados del tótem.';
        }
      } catch {
        title = 'Sin conexión'; body = 'No se pudo marcar "Voy yo". Revisa el internet de la tablet.';
      }
      // Mismo tag: reemplaza el aviso del llamado, sin sonar.
      return self.registration.showNotification(title, { body, tag: n.tag, silent: true, icon: ICON, data: { url: '/llamados' } });
    })());
    return;
  }

  event.waitUntil(openUrl(data.url || '/'));
});
