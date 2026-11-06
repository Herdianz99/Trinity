'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, UserRound, ImageOff } from 'lucide-react';
import CloverAvatar, { CloverState } from './clover-avatar';
import { useVoice } from './use-voice';

interface Card { code: string; name: string; price: string; available: boolean; imageUrl: string | null }

const GREETING = '¡Hola! Soy Clover. Mantén presionado el botón verde y dime qué estás buscando.';
const ERROR_TEXT = 'Ahora no puedo responder. Pregúntale a un vendedor, por favor.';
const NOT_HEARD = 'No te escuché bien. Mantén presionado el botón mientras hablas, y suéltalo al terminar.';
const IDLE_RESET_MS = 60_000;

// Precio para la tarjeta: "12.50$ bcv" -> "$12.50"
const cardPrice = (p: string) => {
  const m = p.match(/(\d+(?:[.,]\d+)?)\s*\$/);
  return m ? `$${m[1]}` : p;
};

export default function TotemPage() {
  const { supported, interim, startListening, stopListening, speak } = useVoice();
  const [state, setState] = useState<CloverState>('idle');
  const [heard, setHeard] = useState('');
  const [answer, setAnswer] = useState(GREETING);
  const [cards, setCards] = useState<Card[]>([]);
  const [sellerCalled, setSellerCalled] = useState(false);
  const stateRef = useRef<CloverState>('idle');
  const convId = useRef<string | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();

  const go = (s: CloverState) => { stateRef.current = s; setState(s); };

  useEffect(() => { document.title = 'Clover | Trinity ERP'; }, []);

  // Sin uso por un minuto: el siguiente cliente empieza de cero.
  const reset = useCallback(() => {
    window.speechSynthesis?.cancel();
    convId.current = null;
    setHeard(''); setAnswer(GREETING); setCards([]); setSellerCalled(false); go('idle');
  }, []);
  const touch = useCallback(() => {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(reset, IDLE_RESET_MS);
  }, [reset]);
  useEffect(() => () => clearTimeout(idleTimer.current), []);

  const say = (text: string) => {
    setAnswer(text);
    go('speaking');
    speak(text, () => { if (stateRef.current === 'speaking') go('idle'); });
  };

  const newConversation = async () => {
    const res = await fetch('/api/proxy/chatbot/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: 'KIOSK' }),
    });
    if (!res.ok) throw new Error('no se pudo crear la conversación');
    convId.current = (await res.json()).id as string;
    return convId.current;
  };

  const send = async (text: string) => {
    const post = (id: string) => fetch(`/api/proxy/chatbot/conversations/${id}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    });
    let res = await post(convId.current ?? (await newConversation()));
    // 409: la conversacion ya se paso a un vendedor (o el bot se apago). Otro cliente puede estar
    // hablando: se abre una conversacion nueva y se reintenta una vez.
    if (res.status === 409) {
      setSellerCalled(false);
      res = await post(await newConversation());
    }
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  };

  const onPressStart = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (stateRef.current === 'thinking' || stateRef.current === 'listening') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    touch();
    go('listening');
    startListening();
  };

  const onPressEnd = async () => {
    if (stateRef.current !== 'listening') return;
    go('thinking');
    const text = await stopListening();
    if (!text) { say(NOT_HEARD); touch(); return; }
    setHeard(text);
    try {
      const data = await send(text);
      setCards(data.productCards ?? []);
      if (data.status && data.status !== 'BOT') setSellerCalled(true);
      say(data.message.text);
    } catch {
      setCards([]);
      say(ERROR_TEXT);
    }
    touch();
  };

  const callSeller = async () => {
    touch();
    try {
      const id = convId.current ?? (await newConversation());
      await fetch(`/api/proxy/chatbot/conversations/${id}/call-seller`, { method: 'POST' });
    } catch { /* igual se muestra el aviso */ }
    setSellerCalled(true);
    say('¡Listo! Ya le aviso a un vendedor. Viene en camino.');
  };

  if (!supported) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-8 text-center text-3xl font-semibold">
        Esta pantalla necesita Google Chrome para escuchar. Ábrela en Chrome.
      </div>
    );
  }

  const live = state === 'listening' ? interim : heard;

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col items-center px-4 pt-6 pb-5">
      <span className="mb-1 rounded-full bg-emerald-500/15 px-4 py-1 text-sm font-bold uppercase tracking-[0.25em] text-emerald-300 ring-1 ring-emerald-400/30">
        Clover · Asistente El Trébol
      </span>

      <CloverAvatar state={state} compact={cards.length > 0} />

      {/* Globo de dialogo: lo que dice Clover */}
      <div className="relative -mt-4 w-full rounded-[28px] bg-white px-6 py-5 text-center text-slate-900 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]">
        <span className="absolute -top-3 left-1/2 h-6 w-6 -translate-x-1/2 rotate-45 rounded-sm bg-white" />
        <p className="relative text-[clamp(1.35rem,3.4vw,1.9rem)] font-semibold leading-snug">{answer}</p>
        {sellerCalled && (
          <p className="relative mt-2 text-lg font-bold text-emerald-700">Un vendedor viene en camino.</p>
        )}
      </div>

      {live && (
        <p className="mt-3 max-w-full truncate rounded-full bg-white/10 px-4 py-1.5 text-lg text-sky-100">
          <span className="font-bold text-sky-300">{state === 'listening' ? 'Escuchando: ' : 'Tú: '}</span>
          “{live}”
        </p>
      )}

      {cards.length > 0 && (
        <div className="mt-4 flex w-full flex-wrap justify-center gap-3">
          {cards.map((c, i) => (
            <div
              key={c.code}
              className="w-[calc(50%-0.375rem)] animate-[card-in_.4s_ease-out_both] overflow-hidden rounded-2xl bg-white text-slate-900 shadow-lg sm:w-[calc(25%-0.5625rem)]"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div className="flex aspect-square items-center justify-center bg-slate-50 p-2">
                {c.imageUrl
                  ? <img src={c.imageUrl} alt={c.name} className="h-full w-full object-contain" />
                  : <ImageOff className="h-10 w-10 text-slate-300" />}
              </div>
              <div className="border-t border-slate-100 px-3 py-2">
                <p className="line-clamp-2 text-[15px] font-semibold leading-tight">{c.name}</p>
                <p className={`mt-1 text-2xl font-extrabold ${c.available ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {c.available ? cardPrice(c.price) : 'Agotado'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto flex w-full flex-col items-center gap-4 pt-5">
        {/* Boton principal con borde de cinta de seguridad (amarillo/negro), como el chaleco de Clover */}
        <div className="w-full rounded-full p-[6px]" style={{ background: 'repeating-linear-gradient(-45deg,#facc15 0 14px,#111827 14px 28px)' }}>
          <button
            onPointerDown={onPressStart}
            onPointerUp={onPressEnd}
            onPointerCancel={onPressEnd}
            onContextMenu={(e) => e.preventDefault()}
            disabled={state === 'thinking'}
            className={`flex h-28 w-full touch-none items-center justify-center gap-4 rounded-full text-[clamp(1.4rem,3.6vw,2rem)] font-extrabold shadow-xl transition-all duration-150 ${
              state === 'listening'
                ? 'scale-[0.97] bg-emerald-400 text-emerald-950'
                : state === 'thinking'
                  ? 'bg-emerald-800 text-white/70'
                  : 'bg-emerald-600 text-white active:scale-[0.97]'}`}
          >
            <Mic className={`h-11 w-11 ${state === 'listening' ? 'animate-pulse' : ''}`} />
            {state === 'listening' ? 'Te escucho… suelta al terminar'
              : state === 'thinking' ? 'Buscando…'
              : 'Mantén presionado para hablar'}
          </button>
        </div>
        <button
          onClick={callSeller}
          className="flex items-center gap-2 rounded-full border-2 border-white/25 px-7 py-3 text-xl font-bold text-white/90 transition active:scale-95 active:bg-white/10"
        >
          <UserRound className="h-6 w-6" /> Llamar a un vendedor
        </button>
      </div>

      <style>{`@keyframes card-in { from { opacity: 0; transform: translateY(14px) scale(.97) } to { opacity: 1; transform: none } }`}</style>
    </main>
  );
}
