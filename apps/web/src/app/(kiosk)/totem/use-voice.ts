'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { textForSpeech } from '@/lib/kiosk-speech';

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
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
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

  const speak = useCallback((text: string, onEnd?: () => void) => {
    const synth = window.speechSynthesis;
    if (!synth) { onEnd?.(); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(textForSpeech(text));
    const voices = synth.getVoices();
    const voice = voices.find((v) => v.lang === 'es-US') ?? voices.find((v) => v.lang.startsWith('es-4') || v.lang === 'es-MX')
      ?? voices.find((v) => v.lang.startsWith('es')) ?? null;
    u.voice = voice;
    u.lang = voice?.lang ?? 'es-ES';
    u.rate = 1.05;
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    synth.speak(u);
  }, []);

  return { supported, interim, startListening, stopListening, speak };
}
