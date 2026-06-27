'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';

// Mismo motor hibrido que el POS: BarcodeDetector nativo (Android, instantaneo)
// con fallback a ZXing (iPhone/Safari). Solo formatos 1D (rapido y confiable).
const NATIVE_BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];
const SCANNER_VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
};

export function BarcodeScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScanRef = useRef<{ code: string; count: number }>({ code: '', count: 0 });
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(true);

  const stopScanner = useCallback(() => {
    if (controlsRef.current) { controlsRef.current.stop(); controlsRef.current = null; }
    lastScanRef.current = { code: '', count: 0 };
  }, []);

  // Exige 2 lecturas identicas seguidas (mata falsos positivos)
  const confirmScan = useCallback((code: string) => {
    if (lastScanRef.current.code === code) lastScanRef.current.count += 1;
    else lastScanRef.current = { code, count: 1 };
    return lastScanRef.current.count >= 2;
  }, []);

  const finish = useCallback((code: string) => {
    stopScanner();
    onScan(code);
  }, [onScan, stopScanner]);

  const startNative = useCallback(async (): Promise<boolean> => {
    const BD = (window as any).BarcodeDetector;
    if (!BD) return false;
    let formats = NATIVE_BARCODE_FORMATS;
    try {
      const supported: string[] = await BD.getSupportedFormats();
      formats = NATIVE_BARCODE_FORMATS.filter((f) => supported.includes(f));
      if (formats.length === 0) return false;
    } catch { /* usa la lista por defecto */ }
    const detector = new BD({ formats });
    const stream = await navigator.mediaDevices.getUserMedia(SCANNER_VIDEO_CONSTRAINTS);
    if (!videoRef.current) { stream.getTracks().forEach((t) => t.stop()); return false; }
    videoRef.current.srcObject = stream;
    await videoRef.current.play().catch(() => {});
    let stopped = false;
    let rafId = 0;
    const tick = async () => {
      if (stopped || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes && codes.length > 0) {
          const code = codes[0].rawValue as string;
          if (code && confirmScan(code)) { finish(code); return; }
        }
      } catch { /* frame no listo */ }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    controlsRef.current = {
      stop: () => {
        stopped = true;
        cancelAnimationFrame(rafId);
        stream.getTracks().forEach((t) => t.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
      },
    };
    return true;
  }, [confirmScan, finish]);

  const startZxing = useCallback(async () => {
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');
    const hints = new Map<number, any>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
    ]);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 });
    if (!videoRef.current) throw new Error('No se pudo inicializar el video');
    const controls = await reader.decodeFromConstraints(
      SCANNER_VIDEO_CONSTRAINTS,
      videoRef.current,
      (result) => {
        if (result) { const code = result.getText(); if (code && confirmScan(code)) finish(code); }
      },
    );
    controlsRef.current = { stop: () => controls.stop() };
  }, [confirmScan, finish]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        setError('La camara requiere conexion HTTPS. No funciona en HTTP.'); setStarting(false); return;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('Este navegador no soporta acceso a la camara'); setStarting(false); return;
      }
      try {
        await new Promise((r) => setTimeout(r, 100));
        if (cancelled) return;
        const native = await startNative();
        if (!native && !cancelled) await startZxing();
      } catch (err: any) {
        const m = err?.name === 'NotAllowedError'
          ? 'Permiso de camara denegado. Verifica los permisos del navegador.'
          : err?.name === 'NotFoundError'
            ? 'No se encontro ninguna camara en este dispositivo.'
            : 'No se pudo acceder a la camara';
        setError(m);
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();
    return () => { cancelled = true; stopScanner(); };
  }, [startNative, startZxing, stopScanner]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
          <h3 className="text-sm font-semibold text-white">Escanear codigo de barras</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-4">
          {error ? (
            <p className="text-sm text-red-400 text-center py-6">{error}</p>
          ) : (
            <div className="rounded-lg overflow-hidden border border-slate-700 bg-black relative">
              <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-72 object-cover" />
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="animate-spin text-green-400" size={28} />
                </div>
              )}
            </div>
          )}
          <p className="text-xs text-slate-500 text-center mt-3">Apunta la camara al codigo de barras</p>
        </div>
      </div>
    </div>
  );
}
