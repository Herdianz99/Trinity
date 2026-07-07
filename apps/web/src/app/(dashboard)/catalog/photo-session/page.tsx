'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Search, Loader2, X, Image as ImageIcon, Trash2, Star, ScanLine } from 'lucide-react';

interface FoundProduct {
  id: string;
  code: string;
  name: string;
  barcode?: string | null;
  supplierRef?: string | null;
  primaryImageThumbUrl?: string | null;
}

interface ProductImg {
  id: string;
  thumbUrl: string;
  mediumUrl: string;
  isPrimary: boolean;
}

// Reduce la imagen a maxSize px (lado mayor) y devuelve un data URI JPEG.
function downscaleToDataUri(file: File, maxSize = 1600, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No canvas context'));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

const NATIVE_BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];
const SCANNER_VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
};

export default function PhotoSessionPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoundProduct[]>([]);
  const [selected, setSelected] = useState<FoundProduct | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [images, setImages] = useState<ProductImg[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScanRef = useRef<{ code: string; count: number }>({ code: '', count: 0 });

  useEffect(() => { document.title = 'Sesión de fotos | Trinity ERP'; }, []);

  const loadImages = useCallback(async (productId: string) => {
    setLoadingImages(true);
    try {
      const res = await fetch(`/api/proxy/products/${productId}/images`);
      setImages(res.ok ? await res.json() : []);
    } catch { setImages([]); }
    finally { setLoadingImages(false); }
  }, []);

  useEffect(() => {
    if (selected) loadImages(selected.id); else setImages([]);
  }, [selected, loadImages]);

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

  // ── Escáner de código de barras (reusa el patrón del POS: detector nativo + ZXing) ──
  function stopScanner() {
    if (scannerControlsRef.current) { scannerControlsRef.current.stop(); scannerControlsRef.current = null; }
    lastScanRef.current = { code: '', count: 0 };
  }

  // Exige 2 lecturas iguales seguidas (mata falsos positivos)
  function confirmScan(code: string): boolean {
    if (lastScanRef.current.code === code) lastScanRef.current.count += 1;
    else lastScanRef.current = { code, count: 1 };
    return lastScanRef.current.count >= 2;
  }

  async function resolveScanned(code: string) {
    try {
      const res = await fetch(`/api/proxy/products?search=${encodeURIComponent(code)}&limit=10`);
      const data = await res.json();
      const list: FoundProduct[] = data.data || [];
      // Auto-selecciona por match EXACTO. barcode/código son únicos; supplierRef NO,
      // así que por Ref. Proveedor solo si es inequívoco (un único producto).
      const bySupplierRef = list.filter((p) => p.supplierRef === code);
      const exact =
        list.find((p) => p.barcode === code) ||
        list.find((p) => p.code === code) ||
        (bySupplierRef.length === 1 ? bySupplierRef[0] : null) ||
        (list.length === 1 ? list[0] : null);
      if (exact) { setSelected(exact); setResults([]); setQuery(''); setMsg(null); }
      else {
        setQuery(code);
        setResults(list);
        setMsg(list.length === 0
          ? { type: 'err', text: `Sin resultados para "${code}"` }
          : { type: 'ok', text: `Varios coinciden con "${code}" — elige el correcto` });
      }
    } catch { setQuery(code); }
  }

  function finishScan(code: string) {
    setScannerActive(false);
    stopScanner();
    resolveScanned(code);
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
          if (code && confirmScan(code)) { finishScan(code); return; }
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
      if (result) { const code = result.getText(); if (code && confirmScan(code)) finishScan(code); }
    });
    scannerControlsRef.current = { stop: () => controls.stop() };
  }

  async function toggleScanner() {
    if (scannerActive) { setScannerActive(false); stopScanner(); return; }
    if (typeof window !== 'undefined' && !window.isSecureContext) { setMsg({ type: 'err', text: 'La cámara requiere conexión HTTPS.' }); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setMsg({ type: 'err', text: 'Este navegador no soporta la cámara' }); return; }
    try {
      lastScanRef.current = { code: '', count: 0 };
      setMsg(null);
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

  // Apagar el escáner al elegir producto o al salir de la pantalla
  useEffect(() => { if (selected) { setScannerActive(false); stopScanner(); } }, [selected]);
  useEffect(() => () => stopScanner(), []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selected) return;
    setUploading(true);
    setMsg(null);
    try {
      const dataUri = await downscaleToDataUri(file);
      const res = await fetch(`/api/proxy/products/${selected.id}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUri }),
      });
      if (res.ok) {
        await res.json();
        setMsg({ type: 'ok', text: `Foto guardada para ${selected.code}` });
        loadImages(selected.id);
      } else {
        const err = await res.json().catch(() => ({}));
        setMsg({ type: 'err', text: err.message || 'Error al subir la foto' });
      }
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setUploading(false);
    }
  }

  async function deleteImage(imageId: string) {
    if (!selected || !confirm('¿Borrar esta foto? No se puede deshacer.')) return;
    const res = await fetch(`/api/proxy/products/${selected.id}/images/${imageId}`, { method: 'DELETE' });
    if (res.ok) { setMsg({ type: 'ok', text: 'Foto borrada' }); loadImages(selected.id); }
    else setMsg({ type: 'err', text: 'No se pudo borrar la foto' });
  }

  async function makePrimary(imageId: string) {
    if (!selected) return;
    const res = await fetch(`/api/proxy/products/${selected.id}/images/${imageId}/primary`, { method: 'PATCH' });
    if (res.ok) { setMsg({ type: 'ok', text: 'Foto principal actualizada' }); loadImages(selected.id); }
    else setMsg({ type: 'err', text: 'No se pudo marcar como principal' });
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <Camera className="text-purple-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Sesión de fotos</h1>
          <p className="text-slate-400 text-sm">Busca o escanea un producto y tómale la foto</p>
        </div>
      </div>

      {msg && (
        <div className={`mb-3 px-4 py-2 rounded-lg text-sm ${msg.type === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {msg.text}
        </div>
      )}

      {!selected ? (
        <>
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                autoFocus
                value={query}
                onChange={(e) => doSearch(e.target.value)}
                placeholder="Código, nombre o código de barras..."
                className="input-field pl-10 w-full"
              />
            </div>
            <button
              onClick={toggleScanner}
              title="Escanear código de barras"
              className={`px-3 rounded-lg border flex items-center justify-center transition-colors ${scannerActive ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:text-white'}`}
            >
              <ScanLine size={20} />
            </button>
          </div>
          {scannerActive && (
            <div className="mb-3 rounded-lg overflow-hidden border border-slate-700">
              <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-48 object-cover" />
            </div>
          )}
          <div className="card divide-y divide-slate-700/40">
            {results.map((p) => (
              <button key={p.id} onClick={() => { setSelected(p); setResults([]); setQuery(''); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-700/40">
                {p.primaryImageThumbUrl
                  ? <img src={p.primaryImageThumbUrl} alt="" className="w-10 h-10 rounded object-cover border border-slate-700" />
                  : <div className="w-10 h-10 rounded bg-slate-800 border border-slate-700 flex items-center justify-center"><ImageIcon size={16} className="text-slate-600" /></div>}
                <div className="min-w-0">
                  <div className="text-xs font-mono text-slate-500">{p.code}{p.supplierRef ? ` · ${p.supplierRef}` : ''}</div>
                  <div className="text-sm text-white truncate">{p.name}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="card p-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs font-mono text-slate-500">{selected.code}</div>
              <div className="text-lg text-white font-medium">{selected.name}</div>
            </div>
            <button onClick={() => { setSelected(null); setMsg(null); }} className="text-slate-400 hover:text-white"><X size={20} /></button>
          </div>

          <div className="mb-4">
            {loadingImages ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-2"><Loader2 size={16} className="animate-spin" /> Cargando fotos...</div>
            ) : images.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-2"><ImageIcon size={16} /> Sin fotos todavía</div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {images.map((img) => (
                  <div key={img.id} className="relative">
                    <img
                      src={img.thumbUrl}
                      alt=""
                      onClick={() => setLightboxUrl(img.mediumUrl || img.thumbUrl)}
                      className={`w-full aspect-square rounded-lg object-cover border cursor-zoom-in ${img.isPrimary ? 'border-green-500' : 'border-slate-700'}`}
                    />
                    {img.isPrimary && (
                      <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-green-500 text-white text-[10px] font-medium flex items-center gap-0.5">
                        <Star size={9} className="fill-white" /> Principal
                      </span>
                    )}
                    <div className="absolute bottom-1 right-1 flex gap-1">
                      {!img.isPrimary && (
                        <button onClick={() => makePrimary(img.id)} title="Marcar como principal"
                          className="p-1.5 rounded bg-slate-900/80 text-slate-200 hover:text-green-400">
                          <Star size={13} />
                        </button>
                      )}
                      <button onClick={() => deleteImage(img.id)} title="Borrar foto"
                        className="p-1.5 rounded bg-slate-900/80 text-slate-200 hover:text-red-400">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3">
            {uploading ? <><Loader2 size={20} className="animate-spin" /> Subiendo...</> : <><Camera size={20} /> {images.length > 0 ? 'Agregar otra foto' : 'Tomar / elegir foto'}</>}
          </button>

          <button onClick={() => { setSelected(null); setMsg(null); }} className="btn-secondary w-full mt-2">
            Siguiente producto
          </button>
        </div>
      )}

      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)} className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <img src={lightboxUrl} alt="" className="max-w-full max-h-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}
