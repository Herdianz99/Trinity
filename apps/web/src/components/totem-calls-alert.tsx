'use client';

// Llamados del totem Clover (Sesion 193): cuando un cliente toca "Llamar a un vendedor" (o el bot
// lo pasa a un vendedor), a TODOS los vendedores les suena un timbre y sale una tarjeta con
// "Voy yo". El primero que la toca se queda con el llamado y a los demas se les quita.
// Ademas invita a activar las notificaciones push en esta tablet (llegan con Trinity cerrado).
// Lo monta el sidebar una sola vez; para quien no es vendedor no muestra nada.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { BellRing, Hand, X } from 'lucide-react';
import { chime } from '@/components/online-orders-alert';
import { enablePush, getPushState, PushState } from '@/lib/push';

const POLL_MS = 10_000;
const SEEN_KEY = 'trinity-totem-calls-notified';
const SNOOZE_KEY = 'trinity-push-prompt-snooze';

export type TotemCall = {
  id: string;
  escalatedAt: string;
  reason: string | null;
  asked: string[];
  attendedAt: string | null;
  attendedBy: { name: string; mine: boolean } | null;
};

export async function attendTotemCall(id: string): Promise<{ mine: boolean; attendedByName: string | null } | null> {
  try {
    const res = await fetch(`/api/proxy/totem-calls/${id}/attend`, { method: 'POST' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function minutesAgo(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m === 0 ? 'ahora' : m === 1 ? 'hace 1 min' : `hace ${m} min`;
}

function readSeen(): string[] {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; }
}
function writeSeen(ids: string[]) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-50))); } catch {}
}
function snoozed() {
  try { return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now(); } catch { return false; }
}

// onState: el sidebar lo usa para mostrar (o no) el enlace "Llamados del tótem" y su contador.
export default function TotemCallsAlert({ onState }: { onState?: (s: { enabled: boolean; open: number }) => void }) {
  const pathname = usePathname();
  const onPage = !!pathname && pathname.startsWith('/llamados'); // ahi la pagina ya muestra los llamados
  const onStateRef = useRef(onState);
  onStateRef.current = onState;
  const [mounted, setMounted] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [isSeller, setIsSeller] = useState(false);
  const [calls, setCalls] = useState<TotemCall[]>([]);
  const [hidden, setHidden] = useState<string[]>([]); // tarjetas cerradas con la X (solo en esta pestaña)
  const [busy, setBusy] = useState<string | null>(null);
  const [pushState, setPushState] = useState<PushState | null>(null);
  const [promptOff, setPromptOff] = useState(true);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    setMounted(true);
    setPromptOff(snoozed());
    return () => { alive.current = false; };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/totem-calls/pending');
      if (!res.ok || !alive.current) return false;
      const data = await res.json();
      if (!alive.current) return false;
      setEnabled(!!data.enabled);
      setIsSeller(!!data.seller);
      const list: TotemCall[] = Array.isArray(data.calls) ? data.calls : [];
      setCalls(list);
      onStateRef.current?.({ enabled: !!data.enabled, open: list.filter((c) => !c.attendedBy).length });
      // Timbre solo por llamados nuevos sin atender (una vez por navegador, aunque haya varias pestañas).
      const seen = readSeen();
      const fresh = list.filter((c) => !c.attendedBy && !seen.includes(c.id));
      if (fresh.length) {
        writeSeen([...seen, ...fresh.map((c) => c.id)]);
        chime(); setTimeout(chime, 900); setTimeout(chime, 1800);
      }
      return !!data.enabled;
    } catch {
      return true; // sin red: se reintenta
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    load().then((on) => { if (on && !cancelled && alive.current) timer = setInterval(load, POLL_MS); });
    // El service worker avisa cuando llega un push: se refresca al instante.
    const onSw = (e: MessageEvent) => { if (e.data?.type === 'trinity-push') load(); };
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    navigator.serviceWorker?.addEventListener('message', onSw);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      navigator.serviceWorker?.removeEventListener('message', onSw);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  // Estado de las notificaciones push de esta tablet (solo a vendedores se les ofrece activarlas).
  useEffect(() => {
    if (isSeller) getPushState().then((s) => alive.current && setPushState(s));
  }, [isSeller]);

  const attend = async (id: string) => {
    setBusy(id);
    const r = await attendTotemCall(id);
    setBusy(null);
    if (r) await load();
  };

  const activate = async () => {
    const s = await enablePush();
    setPushState(s);
  };
  const snooze = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 24 * 3600_000)); } catch {}
    setPromptOff(true);
  };

  if (!mounted || !enabled) return null;

  // Tarjetas: llamados sin atender + los atendidos en los ultimos 2 min (para ver "Lo atiende X").
  const visible = onPage ? [] : calls.filter((c) => !hidden.includes(c.id) && (!c.attendedAt || Date.now() - new Date(c.attendedAt).getTime() < 120_000));
  const showPrompt = !onPage && isSeller && !promptOff && (pushState === 'off' || pushState === 'denied');
  if (visible.length === 0 && !showPrompt) return null;

  return createPortal(
    <div className="fixed left-4 right-4 md:left-auto md:right-4 bottom-20 md:bottom-4 z-[71] flex flex-col gap-2 md:w-[26rem]">
      {visible.map((c) => {
        const open = !c.attendedBy;
        return (
          <div
            key={c.id}
            role="alert"
            className={`rounded-xl border p-4 shadow-2xl shadow-black/40 flex gap-3 items-start ${
              open ? 'border-amber-400/60 bg-slate-900 animate-[pulse_2s_ease-in-out_3]' : 'border-emerald-500/40 bg-slate-900'}`}
          >
            <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${open ? 'bg-amber-400/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-400'}`}>
              <BellRing size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold uppercase tracking-wide ${open ? 'text-amber-300' : 'text-emerald-400'}`}>
                {open ? 'Cliente en el tótem pide un vendedor' : c.attendedBy?.mine ? 'Vas tú' : `Lo atiende ${c.attendedBy?.name}`}
              </p>
              {c.asked.length > 0 && (
                <p className="mt-0.5 text-sm text-slate-200 line-clamp-2">Preguntó: “{c.asked.join(' · ')}”</p>
              )}
              <p className="text-xs text-slate-500 mt-0.5">{minutesAgo(c.escalatedAt)}</p>
              {open ? (
                <button
                  onClick={() => attend(c.id)}
                  disabled={busy === c.id}
                  className="mt-2 inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-amber-300 disabled:opacity-60"
                >
                  <Hand size={16} /> {busy === c.id ? 'Marcando…' : 'Voy yo'}
                </button>
              ) : c.attendedBy?.mine ? (
                <p className="mt-1 text-sm text-emerald-300">Clover le dijo al cliente que ya vas.</p>
              ) : null}
            </div>
            <button
              onClick={() => setHidden((h) => [...h, c.id])}
              className="p-1 rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-800"
              aria-label="Cerrar aviso"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}

      {showPrompt && (
        <div className="rounded-xl border border-blue-500/40 bg-slate-900 p-4 shadow-2xl shadow-black/40">
          <p className="text-sm font-semibold text-slate-100">Activa los avisos en este equipo</p>
          {pushState === 'denied' ? (
            <p className="mt-1 text-sm text-slate-400">
              Las notificaciones de Trinity están bloqueadas. En Chrome toca el candado junto a la dirección →
              Permisos → Notificaciones → Permitir, y recarga la página.
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-400">
              Así te avisamos cuando un cliente del tótem pida un vendedor, aunque la tablet esté bloqueada.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            {pushState === 'off' && (
              <button onClick={activate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
                Activar avisos
              </button>
            )}
            <button onClick={snooze} className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-slate-200">
              Ahora no
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
