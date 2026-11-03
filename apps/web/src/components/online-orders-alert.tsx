'use client';

// Aviso de pedido nuevo de la tienda online (gratis, sin WhatsApp):
// cada 30 s consulta los pedidos "Por verificar"; si aparece uno que este navegador no ha
// avisado, suena un timbre, sale una notificación de Windows (si el usuario la permitió) y
// una tarjeta abajo a la derecha. Lo usa el sidebar, que además pinta el contador del menú.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ShoppingCart, X } from 'lucide-react';

const SEEN_KEY = 'trinity-online-orders-notified';
const POLL_MS = 30_000;
export const ONLINE_ORDERS_CHANGED = 'trinity-online-orders-changed';

type PendingOrder = { id: string; number: string; customerName: string; totalUsd: number; createdAt: string };

const money = (n: number) =>
  '$' + (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Ids ya avisados en este navegador (compartido entre pestañas para no sonar dos veces).
// null = primera vez en este navegador.
function readSeen(): string[] | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}
function writeSeen(ids: string[]) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-100))); } catch {}
}

// Timbre de dos notas con Web Audio (sin archivo de sonido). Si el navegador aún no permite
// audio (nadie ha hecho clic en la página), simplemente no suena.
function chime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx: AudioContext = new Ctx();
    ctx.resume().catch(() => {});
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.45);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch {}
}

function desktopNotify(o: PendingOrder, onClick: () => void) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(`Nuevo pedido online ${o.number}`, {
      body: `${o.customerName} · ${money(o.totalUsd)}`,
      tag: `online-order-${o.id}`,
      icon: '/icons/icon-192.png',
    });
    n.onclick = () => { window.focus(); onClick(); n.close(); };
  } catch {
    // En Android Chrome el constructor no existe fuera de un service worker: queda la tarjeta.
  }
}

export default function OnlineOrdersAlert({ enabled, onCount }: { enabled: boolean; onCount: (n: number) => void }) {
  const router = useRouter();
  const [toasts, setToasts] = useState<PendingOrder[]>([]);
  const [mounted, setMounted] = useState(false);
  const onCountRef = useRef(onCount);
  onCountRef.current = onCount;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!enabled) { onCountRef.current(0); setToasts([]); return; }
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch('/api/proxy/online-orders/pending-count');
        if (!res.ok || !alive) return;
        const data = await res.json();
        if (!alive) return;
        onCountRef.current(data?.count ?? 0);
        const latest: PendingOrder[] = Array.isArray(data?.latest) ? data.latest : [];

        // Quita tarjetas de pedidos que ya alguien verificó o canceló.
        setToasts((prev) => prev.filter((t) => latest.some((l) => l.id === t.id)));

        const seen = readSeen();
        if (seen === null) {
          // Primera vez en este navegador: no avisar de los pedidos viejos.
          writeSeen(latest.map((o) => o.id));
          return;
        }
        const fresh = latest.filter((o) => !seen.includes(o.id));
        if (fresh.length === 0) return;
        writeSeen([...seen, ...fresh.map((o) => o.id)]);

        chime();
        fresh.forEach((o) => desktopNotify(o, () => router.push(`/store/orders/${o.id}`)));
        setToasts((prev) => [...fresh.filter((f) => !prev.some((p) => p.id === f.id)), ...prev].slice(0, 3));
      } catch {}
    };

    load();
    const timer = setInterval(load, POLL_MS);
    window.addEventListener(ONLINE_ORDERS_CHANGED, load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener(ONLINE_ORDERS_CHANGED, load);
    };
  }, [enabled, router]);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  if (!mounted || toasts.length === 0) return null;

  // Portal al body: el sidebar en móvil está dentro de un contenedor con transform,
  // y ahí un position:fixed no quedaría fijo a la pantalla.
  return createPortal(
    <div className="fixed right-4 bottom-20 md:bottom-4 z-[70] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm">
      {toasts.map((o) => (
        <div
          key={o.id}
          role="alert"
          className="rounded-xl border border-green-500/40 bg-slate-900 shadow-2xl shadow-black/40 p-4 flex gap-3 items-start"
        >
          <div className="h-9 w-9 rounded-full bg-green-500/15 text-green-400 flex items-center justify-center flex-shrink-0">
            <ShoppingCart size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-green-400">Nuevo pedido online</p>
            <p className="text-sm text-slate-100 font-mono">{o.number}</p>
            <p className="text-sm text-slate-400 truncate">{o.customerName} · {money(o.totalUsd)}</p>
            <button
              onClick={() => { dismiss(o.id); router.push(`/store/orders/${o.id}`); }}
              className="mt-2 text-sm font-medium text-blue-400 hover:text-blue-300"
            >
              Ver pedido →
            </button>
          </div>
          <button
            onClick={() => dismiss(o.id)}
            className="p-1 rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-800"
            aria-label="Cerrar aviso"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
