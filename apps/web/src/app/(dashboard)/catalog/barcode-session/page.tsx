'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Barcode, Search, Loader2, X, Check, ScanLine } from 'lucide-react';

interface FoundProduct {
  id: string;
  code: string;
  name: string;
  barcode?: string | null;
  supplierRef?: string | null;
}

const NATIVE_BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];
const SCANNER_VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
};

export default function BarcodeSessionPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoundProduct[]>([]);
  const [selected, setSelected] = useState<FoundProduct | null>(null);
  const [firstCode, setFirstCode] = useState<string | null>(null);
  const [confirmedCode, setConfirmedCode] = useState<string | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScanRef = useRef<{ code: string; count: number }>({ code: '', count: 0 });
  const firstCodeRef = useRef<string | null>(null); // espejo para leer dentro de los closures del escáner

  useEffect(() => { document.title = 'Sesión de códigos de barras | Trinity ERP'; }, []);

  const doSearch = useCallback((q: string) => {
    setQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!q.trim()) { setResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/proxy/products?search=${encodeURIComponent(q)}&limit=30`);
        const data = await res.json();
        setResults(data.data || []);
      } catch { /* ignore */ }
    }, 300);
  }, []);

  function resetCapture() {
    firstCodeRef.current = null;
    setFirstCode(null);
    setConfirmedCode(null);
  }

  // ── Motor de escaneo (BarcodeDetector nativo + ZXing), igual que el POS/Sesión de fotos ──
  function stopScanner() {
    if (scannerControlsRef.current) { scannerControlsRef.current.stop(); scannerControlsRef.current = null; }
    lastScanRef.current = { code: '', count: 0 };
  }

  function confirmScan(code: string): boolean {
    if (lastScanRef.current.code === code) lastScanRef.current.count += 1;
    else lastScanRef.current = { code, count: 1 };
    return lastScanRef.current.count >= 2;
  }

  // Cada lectura estable pasa por aquí: 1ra vez captura, 2da vez confirma (o rechaza si no coincide).
  function onScanned(code: string) {
    setScannerActive(false);
    stopScanner();
    if (!firstCodeRef.current) {
      firstCodeRef.current = code;
      setFirstCode(code);
      setConfirmedCode(null);
      setMsg({ type: 'ok', text: 'Capturado. Escanea otra vez para confirmar.' });
    } else if (code === firstCodeRef.current) {
      setConfirmedCode(code);
      setMsg({ type: 'ok', text: 'Código confirmado ✓' });
    } else {
      firstCodeRef.current = null;
      setFirstCode(null);
      setConfirmedCode(null);
      setMsg({ type: 'err', text: `No coincidió (${code} ≠ el anterior). Empieza de nuevo.` });
    }
  }

  async function startNativeDetector(): Promise<boolean> {
    const BD = (window as any).BarcodeDetector;
    if (!BD) return false;
    let formats = NATIVE_BARCODE_FORMATS;
    try {
      const supported: string[] = await BD.getSupportedFormats();
      formats = NATIVE_BARCODE_FORMATS.filter((f) => supported.includes(f));
      if (formats.length === 0) return false;
    } catch { /* usar lista por defecto */ }
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
          if (code && confirmScan(code)) { onScanned(code); return; }
        }
      } catch { /* frame no listo */ }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    scannerControlsRef.current = {
      stop: () => {
        stopped = true;
        cancelAnimationFrame(rafId);
        stream.getTracks().forEach((t) => t.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
      },
    };
    return true;
  }

  async function startZxingScanner() {
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');
    const hints = new Map<number, any>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
    ]);
    const codeReader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 });
    if (!videoRef.current) throw new Error('No se pudo inicializar el video');
    const controls = await codeReader.decodeFromConstraints(SCANNER_VIDEO_CONSTRAINTS, videoRef.current, (result) => {
      if (result) { const code = result.getText(); if (code && confirmScan(code)) onScanned(code); }
    });
    scannerControlsRef.current = { stop: () => controls.stop() };
  }

  async function startScan() {
    if (scannerActive) { setScannerActive(false); stopScanner(); return; }
    if (typeof window !== 'undefined' && !window.isSecureContext) { setMsg({ type: 'err', text: 'La cámara requiere conexión HTTPS.' }); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setMsg({ type: 'err', text: 'Este navegador no soporta la cámara' }); return; }
    try {
      lastScanRef.current = { code: '', count: 0 };
      setScannerActive(true);
      await new Promise((r) => setTimeout(r, 100));
      const nativeOk = await startNativeDetector();
      if (!nativeOk) await startZxingScanner();
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof DOMException && err.name === 'NotAllowedError' ? 'Permiso de cámara denegado.' : 'No se pudo acceder a la cámara' });
      setScannerActive(false);
      stopScanner();
    }
  }

  async function save() {
    if (!selected || !confirmedCode) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/proxy/products/${selected.id}/barcode`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: confirmedCode }),
      });
      if (res.ok) {
        setMsg({ type: 'ok', text: `Código ${confirmedCode} guardado en ${selected.code}` });
        resetCapture();
        setSelected(null);
        setResults([]);
        setQuery('');
      } else {
        const err = await res.json().catch(() => ({}));
        setMsg({ type: 'err', text: err.message || 'No se pudo guardar el código' });
      }
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  // Al cambiar de producto (o salir), reiniciar captura y apagar cámara
  useEffect(() => { resetCapture(); setScannerActive(false); stopScanner(); }, [selected]);
  useEffect(() => () => stopScanner(), []);

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20">
          <Barcode className="text-sky-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Sesión de códigos de barras</h1>
          <p className="text-slate-400 text-sm">Busca un artículo, escanea el código dos veces y guarda</p>
        </div>
      </div>

      {msg && (
        <div className={`mb-3 px-4 py-2 rounded-lg text-sm ${msg.type === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {msg.text}
        </div>
      )}

      {!selected ? (
        <>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              autoFocus
              value={query}
              onChange={(e) => doSearch(e.target.value)}
              placeholder="Código, nombre o Ref. Proveedor..."
              className="input-field pl-10 w-full"
            />
          </div>
          <div className="card divide-y divide-slate-700/40">
            {results.map((p) => (
              <button key={p.id} onClick={() => { setSelected(p); setResults([]); setQuery(''); setMsg(null); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-700/40">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-mono text-slate-500">{p.code}{p.supplierRef ? ` · ${p.supplierRef}` : ''}</div>
                  <div className="text-sm text-white truncate">{p.name}</div>
                </div>
                {p.barcode
                  ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 shrink-0">Con código</span>
                  : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 shrink-0">Sin código</span>}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="card p-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs font-mono text-slate-500">{selected.code}{selected.supplierRef ? ` · ${selected.supplierRef}` : ''}</div>
              <div className="text-lg text-white font-medium">{selected.name}</div>
            </div>
            <button onClick={() => { setSelected(null); setMsg(null); }} className="text-slate-400 hover:text-white"><X size={20} /></button>
          </div>

          {selected.barcode && (
            <div className="mb-3 text-xs text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2">
              Ya tiene un código: <span className="font-mono">{selected.barcode}</span>. Si guardas, lo reemplazas.
            </div>
          )}

          {/* Estado de captura */}
          <div className="mb-3 rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-3 text-center">
            {confirmedCode ? (
              <div className="text-green-400">
                <div className="text-xs">Confirmado ✓</div>
                <div className="text-xl font-mono font-bold">{confirmedCode}</div>
              </div>
            ) : firstCode ? (
              <div className="text-slate-300">
                <div className="text-xs text-slate-400">Capturado (falta confirmar)</div>
                <div className="text-xl font-mono font-bold">{firstCode}</div>
              </div>
            ) : (
              <div className="text-slate-500 text-sm py-2">Aún no has escaneado</div>
            )}
          </div>

          {scannerActive && (
            <div className="mb-3 rounded-lg overflow-hidden border border-slate-700">
              <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-56 object-cover" />
            </div>
          )}

          {/* Acciones */}
          {confirmedCode ? (
            <>
              <button onClick={save} disabled={saving}
                className="btn-primary w-full flex items-center justify-center gap-2 py-3">
                {saving ? <><Loader2 size={20} className="animate-spin" /> Guardando...</> : <><Check size={20} /> Guardar y siguiente</>}
              </button>
              <button onClick={() => { resetCapture(); setMsg(null); }} className="btn-secondary w-full mt-2">
                Volver a escanear
              </button>
            </>
          ) : (
            <button onClick={startScan}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-colors ${scannerActive ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'btn-primary'}`}>
              <ScanLine size={20} />
              {scannerActive ? 'Cancelar' : firstCode ? 'Escanear otra vez para confirmar' : 'Escanear código'}
            </button>
          )}

          <button onClick={() => { setSelected(null); setMsg(null); }} className="btn-secondary w-full mt-2">
            Siguiente producto
          </button>
        </div>
      )}
    </div>
  );
}
