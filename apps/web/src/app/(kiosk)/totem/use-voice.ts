'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeTranscripts, rankVoices, textForSpeech } from '@/lib/kiosk-speech';

const VOICE_KEY = 'clover-voice';
// Si el reconocedor no avisa que termino (pasa en iPhone), se usa lo que se alcanzo a entender.
const STOP_FALLBACK_MS = 1500;
const AI_TTS_TIMEOUT_MS = 10_000;
// WAV silencioso minimo (46 bytes) para desbloquear <audio> dentro del toque del usuario en Android/iOS.
const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export interface AiVoiceOption {
  id: string;
  name: string;
  description: string;
}

// Reconocimiento de voz (Chrome / Safari) + voz natural IA (Gemini TTS via /totem/tts) con respaldo
// automatico en la sintesis local del navegador si no hay clave o falla la red.
//
// iPhone (Safari y Chrome usan WebKit) tiene tres trampas, por eso este hook:
// - Reusar el mismo reconocedor: el 2do start() no graba ni dispara onend -> se queda "Buscando…".
//   Se crea uno nuevo en cada pulsacion.
// - onend a veces no llega tras stop() -> se resuelve igual con un temporizador.
// - <audio> y speechSynthesis solo suenan si se desbloquearon dentro de un toque del usuario; la
//   respuesta llega despues de un fetch (fuera del toque) y se descartaria en silencio.
export function useVoice() {
  const SRRef = useRef<any>(null);
  const recRef = useRef<any>(null);
  const finalRef = useRef('');
  const endResolver = useRef<((t: string) => void) | null>(null);
  const activeRef = useRef(false); // el reconocedor esta grabando (el navegador puede cortarlo solo)
  const unlockedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const speakSeqRef = useRef(0);
  const [supported, setSupported] = useState(true);
  const [interim, setInterim] = useState('');

  // Voces naturales de Gemini TTS (si el API tiene GEMINI_API_KEY).
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiDefaultVoice, setAiDefaultVoice] = useState('Orus');
  const [aiVoices, setAiVoices] = useState<AiVoiceOption[]>([]);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current && typeof Audio !== 'undefined') {
      audioRef.current = new Audio();
      audioRef.current.preload = 'auto';
    }
    return audioRef.current;
  }, []);

  const stopSpeaking = useCallback(() => {
    speakSeqRef.current++;
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    const a = audioRef.current;
    if (a) {
      a.onended = null;
      a.onerror = null;
      try { a.pause(); } catch { /* nada */ }
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    try { window.speechSynthesis?.cancel(); } catch { /* nada */ }
  }, []);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    SRRef.current = SR;
    window.speechSynthesis?.getVoices(); // precarga la lista de voces
    let alive = true;
    fetch('/api/proxy/totem/tts/voices')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        setAiEnabled(!!d.enabled);
        if (d.defaultVoice) setAiDefaultVoice(String(d.defaultVoice));
        if (Array.isArray(d.voices)) setAiVoices(d.voices);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      stopSpeaking();
      try { recRef.current?.abort(); } catch { /* nada */ }
    };
  }, [stopSpeaking]);

  const finish = useCallback((rec: any) => {
    if (recRef.current !== rec) return; // aviso tardio de un reconocedor viejo
    activeRef.current = false;
    endResolver.current?.(finalRef.current.trim());
    endResolver.current = null;
  }, []);

  // Debe llamarse dentro del toque del usuario (pointerdown/click).
  const unlockSpeech = useCallback(() => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    const synth = window.speechSynthesis;
    if (synth) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      synth.speak(u);
    }
    const a = ensureAudio();
    if (a) {
      a.volume = 0;
      a.src = SILENT_WAV;
      a.play().then(() => { a.pause(); a.volume = 1; }).catch(() => { a.volume = 1; });
    }
  }, [ensureAudio]);

  const startListening = useCallback(() => {
    const SR = SRRef.current;
    if (!SR) return;
    stopSpeaking(); // si Clover esta hablando, se calla
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
  }, [finish, stopSpeaking, unlockSpeech]);

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

  // Voz elegida a mano en este equipo (se guarda en el navegador); prefijo "ai:" = Gemini TTS.
  const setVoiceURI = useCallback((uri: string | null) => {
    setVoiceURIState(uri);
    try { uri ? localStorage.setItem(VOICE_KEY, uri) : localStorage.removeItem(VOICE_KEY); } catch { /* nada */ }
  }, []);

  // Si IA esta activa y no se eligio una voz local especifica, usa la voz masculina IA por defecto.
  const activeAiVoice: string | null = !aiEnabled
    ? null
    : voiceURI?.startsWith('ai:')
      ? voiceURI.slice(3)
      : voiceURI === null
        ? aiDefaultVoice
        : null;
  const voice = voices.find((v) => v.voiceURI === voiceURI) ?? voices[0] ?? null;

  const speakBrowser = useCallback((spoken: string, seq: number, onEnd?: () => void) => {
    if (speakSeqRef.current !== seq) return;
    const synth = window.speechSynthesis;
    if (!synth) { onEnd?.(); return; }
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

  const speakAi = useCallback(async (spoken: string, aiVoice: string, seq: number, onEnd?: () => void) => {
    const ctrl = new AbortController();
    ttsAbortRef.current = ctrl;
    const timeout = setTimeout(() => ctrl.abort(), AI_TTS_TIMEOUT_MS);
    try {
      const res = await fetch('/api/proxy/totem/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: spoken, voice: aiVoice }),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      if (speakSeqRef.current !== seq) return;
      if (!res.ok) { speakBrowser(spoken, seq, onEnd); return; }
      const blob = await res.blob();
      if (speakSeqRef.current !== seq || blob.size < 64) {
        if (speakSeqRef.current === seq) speakBrowser(spoken, seq, onEnd);
        return;
      }
      const a = ensureAudio();
      if (!a) { speakBrowser(spoken, seq, onEnd); return; }
      const url = URL.createObjectURL(blob);
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = url;
      let ended = false;
      const done = () => {
        if (ended) return;
        ended = true;
        clearTimeout(safety);
        if (speakSeqRef.current === seq) onEnd?.();
      };
      const safety = setTimeout(done, 8000 + spoken.length * 100);
      a.volume = 1;
      a.src = url;
      a.onended = done;
      a.onerror = () => {
        if (ended) return;
        ended = true;
        clearTimeout(safety);
        speakBrowser(spoken, seq, onEnd);
      };
      await a.play();
    } catch {
      clearTimeout(timeout);
      if (speakSeqRef.current === seq) speakBrowser(spoken, seq, onEnd);
    }
  }, [ensureAudio, speakBrowser]);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    stopSpeaking();
    const seq = speakSeqRef.current;
    const spoken = textForSpeech(text);
    if (!spoken) { onEnd?.(); return; }
    if (activeAiVoice) {
      void speakAi(spoken, activeAiVoice, seq, onEnd);
      return;
    }
    speakBrowser(spoken, seq, onEnd);
  }, [activeAiVoice, speakAi, speakBrowser, stopSpeaking]);

  // Prueba una voz IA especifica desde el panel oculto del encargado.
  const previewAiVoice = useCallback((voiceId: string, text: string) => {
    unlockSpeech();
    stopSpeaking();
    const seq = speakSeqRef.current;
    void speakAi(textForSpeech(text), voiceId, seq);
  }, [speakAi, stopSpeaking, unlockSpeech]);

  return {
    supported, interim, startListening, stopListening, speak, stopSpeaking, unlockSpeech,
    voices, voice, voiceURI, setVoiceURI, aiEnabled, aiVoices, activeAiVoice, previewAiVoice,
  };
}
