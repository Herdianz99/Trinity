// Notificaciones push en este navegador (Sesion 193). El service worker (/sw.js) las muestra;
// aqui solo se pide el permiso y se registra el navegador en el API.

export type PushState =
  | 'unsupported'   // navegador sin push (o sin HTTPS)
  | 'server-off'    // el API no tiene llaves VAPID: push apagado
  | 'denied'        // el usuario bloqueo las notificaciones de Trinity
  | 'off'           // se puede activar
  | 'on';           // este navegador ya recibe avisos

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (!existing) await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

async function publicKey(): Promise<string | null> {
  const res = await fetch('/api/proxy/push/public-key');
  if (!res.ok) return null;
  return (await res.json())?.publicKey ?? null;
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    const params = sub ? `?endpoint=${encodeURIComponent(sub.endpoint)}` : '';
    const res = await fetch(`/api/proxy/push/status${params}`);
    const st = res.ok ? await res.json() : null;
    if (st && st.enabled === false) return 'server-off';
    if (sub && st?.subscribed && Notification.permission === 'granted') return 'on';
    return 'off';
  } catch {
    return 'off';
  }
}

/** Pide el permiso (tiene que llamarse dentro de un toque/clic) y registra este navegador. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const key = await publicKey();
  if (!key) return 'server-off';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  // Si la suscripcion vieja es de otra llave (se regeneraron las llaves), se rehace.
  if (sub) {
    const current = sub.options?.applicationServerKey;
    const want = urlBase64ToUint8Array(key);
    const same = current && new Uint8Array(current).every((b, i) => b === want[i]) && new Uint8Array(current).length === want.length;
    if (!same) { await sub.unsubscribe().catch(() => undefined); sub = null; }
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  }
  const json = sub.toJSON();
  const res = await fetch('/api/proxy/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth }),
  });
  return res.ok ? 'on' : 'off';
}

export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const reg = await registration();
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await fetch('/api/proxy/push/unsubscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  return 'off';
}

export async function sendTestPush(): Promise<number> {
  const res = await fetch('/api/proxy/push/test', { method: 'POST' });
  if (!res.ok) return 0;
  return (await res.json())?.sent ?? 0;
}

/** Notificacion local (sin servidor) que funciona tambien en Android: via service worker. */
export async function localNotify(title: string, options: NotificationOptions & { data?: { url?: string } }) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration('/');
    if (reg) { await reg.showNotification(title, { icon: '/icons/icon-192.png', ...options }); return; }
    new Notification(title, { icon: '/icons/icon-192.png', ...options });
  } catch { /* sin notificacion: queda la tarjeta dentro de Trinity */ }
}
