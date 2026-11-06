'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeTranscripts, rankVoices, textForSpeech } from '@/lib/kiosk-speech';

const VOICE_KEY = 'clover-voice';

// Reconocimiento de voz (solo Chrome) + sintesis del navegador. Gratis, sin servicios externos.
export function useVoice() {
  const recRef = useRef<any>(null);
  const finalRef = useRef('');
  const endResolver = useRef<((t: string) => void) | null>(null);
  const activeRef = useRef(false); // el reconocedor esta grabando (Chrome puede cortarlo solo)
  const [supported, setSupported] = useState(true);
  const [interim, setInterim] = useState('');

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    const rec = new SR();
    rec.lang = 'es-VE';
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) parts.push(e.results[i][0].transcript);
      const text = mergeTranscripts(parts);
      finalRef.current = text;
      setInterim(text);
    };
    rec.onend = () => {
      activeRef.current = false;
      endResolver.current?.(finalRef.current.trim());
      endResolver.current = null;
    };
    recRef.current = rec;
    window.speechSynthesis?.getVoices(); // precarga la lista de voces
    return () => { try { rec.abort(); } catch { /* nada */ } };
  }, []);

  const startListening = useCallback(() => {
    window.speechSynthesis?.cancel(); // si Clover esta hablando, se calla
    finalRef.current = '';
    setInterim('');
    try { recRef.current?.start(); activeRef.current = true; } catch { /* ya estaba escuchando */ }
  }, []);

  // Devuelve lo entendido cuando el reconocedor termina de procesar el audio.
  const stopListening = useCallback(() => new Promise<string>((resolve) => {
    const rec = recRef.current;
    if (!rec) return resolve('');
    // Si Chrome ya corto la grabacion (silencio, error, sin permiso), onend no vuelve a llegar.
    if (!activeRef.current) return resolve(finalRef.current.trim());
    endResolver.current = resolve;
    try { rec.stop(); } catch { resolve(finalRef.current.trim()); }
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
    synth.cancel();
    const u = new SpeechSynthesisUtterance(textForSpeech(text));
    u.voice = voice;
    u.lang = voice?.lang ?? 'es-US';
    u.rate = 1;
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    synth.speak(u);
  }, [voice]);

  return { supported, interim, startListening, stopListening, speak, voices, voice, setVoiceURI };
}
