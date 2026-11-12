'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeTranscripts, rankVoices, textForSpeech } from '@/lib/kiosk-speech';

const VOICE_KEY = 'clover-voice';
// Si el reconocedor no avisa que termino (pasa en iPhone), se usa lo que se alcanzo a entender.
const STOP_FALLBACK_MS = 1500;

// Reconocimiento de voz (Chrome / Safari) + sintesis del navegador. Gratis, sin servicios externos.
//
// iPhone (Safari y Chrome usan WebKit) tiene tres trampas, por eso este hook:
// - Reusar el mismo reconocedor: el 2do start() no graba ni dispara onend -> se queda "Buscando…".
//   Se crea uno nuevo en cada pulsacion.
// - onend a veces no llega tras stop() -> se resuelve igual con un temporizador.
// - speechSynthesis solo suena si el primer speak() ocurre dentro de un toque del usuario; la
//   respuesta llega despues de un fetch (fuera del toque) y se descarta en silencio. Se "desbloquea"
//   con una frase muda al presionar el boton. Tambien puede no disparar onend: hay respaldo por tiempo.
export function useVoice() {
  const SRRef = useRef<any>(null);
  const recRef = useRef<any>(null);
  const finalRef = useRef('');
  const endResolver = useRef<((t: string) => void) | null>(null);
  const activeRef = useRef(false); // el reconocedor esta grabando (el navegador puede cortarlo solo)
  const unlockedRef = useRef(false);
  const [supported, setSupported] = useState(true);
  const [interim, setInterim] = useState('');

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    SRRef.current = SR;
    window.speechSynthesis?.getVoices(); // precarga la lista de voces
    return () => { try { recRef.current?.abort(); } catch { /* nada */ } };
  }, []);

  const finish = useCallback((rec: any) => {
    if (recRef.current !== rec) return; // aviso tardio de un reconocedor viejo
    activeRef.current = false;
    endResolver.current?.(finalRef.current.trim());
    endResolver.current = null;
  }, []);

  // Debe llamarse dentro del toque del usuario (pointerdown/click).
  const unlockSpeech = useCallback(() => {
    const synth = window.speechSynthesis;
    if (!synth || unlockedRef.current) return;
    unlockedRef.current = true;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
  }, []);

  const startListening = useCallback(() => {
    const SR = SRRef.current;
    if (!SR) return;
    const synth = window.speechSynthesis;
    synth?.cancel(); // si Clover esta hablando, se calla
    unlockSpeech();
    try { recRef.current?.abort(); } catch { /* nada */ }
    finalRef.current = '';
    setInterim('');

    const rec = new SR();
    rec.lang = 'es-VE';
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      if (recRef.current !== rec) return;
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) parts.push(e.results[i][0].transcript);
      const text = mergeTranscripts(parts);
      finalRef.current = text;
      setInterim(text);
    };
    rec.onend = () => finish(rec);
    rec.onerror = () => finish(rec);
    recRef.current = rec;
    try { rec.start(); activeRef.current = true; } catch { activeRef.current = false; }
  }, [finish, unlockSpeech]);

  // Devuelve lo entendido cuando el reconocedor termina de procesar el audio.
  const stopListening = useCallback(() => new Promise<string>((resolve) => {
    const rec = recRef.current;
    if (!rec) return resolve('');
    // Si el navegador ya corto la grabacion (silencio, error, sin permiso), onend no vuelve a llegar.
    if (!activeRef.current) return resolve(finalRef.current.trim());
    let done = false;
    const once = (t: string) => { if (!done) { done = true; clearTimeout(timer); resolve(t); } };
    const timer = setTimeout(() => {
      if (recRef.current === rec) { activeRef.current = false; endResolver.current = null; }
      try { rec.abort(); } catch { /* nada */ }
      once(finalRef.current.trim());
    }, STOP_FALLBACK_MS);
    endResolver.current = once;
    try { rec.stop(); } catch { once(finalRef.current.trim()); }
  }), []);

  // Voces en español de este equipo, de mejor a peor. La lista llega tarde en Chrome (voiceschanged).
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURIState] = useState<string | null>(null);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const load = () => setVoices(rankVoices(synth.getVoices()));
    load();
    synth.addEventListener('voiceschanged', load);
    try { setVoiceURIState(localStorage.getItem(VOICE_KEY)); } catch { /* sin almacenamiento */ }
    return () => synth.removeEventListener('voiceschanged', load);
  }, []);

  // Voz elegida a mano en este equipo (se guarda en el navegador); si no, la mejor disponible.
  const setVoiceURI = useCallback((uri: string | null) => {
    setVoiceURIState(uri);
    try { uri ? localStorage.setItem(VOICE_KEY, uri) : localStorage.removeItem(VOICE_KEY); } catch { /* nada */ }
  }, []);
  const voice = voices.find((v) => v.voiceURI === voiceURI) ?? voices[0] ?? null;

  const speak = useCallback((text: string, onEnd?: () => void) => {
    const synth = window.speechSynthesis;
    if (!synth) { onEnd?.(); return; }
    const spoken = textForSpeech(text);
    let ended = false;
    // Respaldo: si el navegador no avisa el final (iPhone), el boton no se queda en "hablando".
    const fallback = setTimeout(() => end(), 4000 + spoken.length * 90);
    const end = () => { if (!ended) { ended = true; clearTimeout(fallback); onEnd?.(); } };
    synth.cancel();
    synth.resume(); // Safari a veces deja la sintesis en pausa
    const u = new SpeechSynthesisUtterance(spoken);
    u.voice = voice;
    u.lang = voice?.lang ?? 'es-US';
    u.rate = 1;
    u.onend = end;
    u.onerror = end;
    synth.speak(u);
  }, [voice]);

  return { supported, interim, startListening, stopListening, speak, unlockSpeech, voices, voice, setVoiceURI };
}
