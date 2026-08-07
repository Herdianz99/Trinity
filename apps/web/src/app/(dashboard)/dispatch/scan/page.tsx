'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ScanLine, Check, AlertTriangle, X, Camera, Search, ArrowLeft } from 'lucide-react';

type Line = {
  dispatchItemId: string;
  productId: string;
  productName: string;
  productCode: string | null;
  barcode: string | null;
  quantityInvoiced: number;
  quantityDelivered: number;
  remaining: number;
};
type Resolved = {
  dispatchId: string;
  number: string;
  status: string;
  invoiceNumber: string;
  customerName: string | null;
  lines: Line[];
};

// Beep corto vía WebAudio (sin assets). freq alta = OK, baja = error.
function beep(ok: boolean) {
  try {
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = ok ? 'sine' : 'square';
    osc.frequency.value = ok ? 1180 : 220;
    gain.gain.value = 0.12;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.09 : 0.32));
    osc.onended = () => ctx.close();
  } catch { /* ignore */ }
}

const norm = (s: string) => (s || '').trim().toUpperCase();

// Formatos 1D retail + restricciones de cámara (cámara trasera en móvil). Mismo set que el POS.
const NATIVE_BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];
const SCANNER_VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDIENTE: { label: 'Pendiente', cls: 'bg-slate-600/30 text-slate-300 border-slate-600' },
  PARCIAL: { label: 'Parcial', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  COMPLETADO: { label: 'Entregada', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  CANCELADO: { label: 'Cancelada', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
};

export default function DispatchScanPage() {
  const [flagOn, setFlagOn] = useState<boolean | null>(null); // null = cargando
  const [invoiceInput, setInvoiceInput] = useState('');
  const [invoiceResults, setInvoiceResults] = useState<any[]>([]);
  const [searchingInv, setSearchingInv] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  // scanned[dispatchItemId] = cuánto se ha verificado en ESTA sesión
  const [scanned, setScanned] = useState<Record<string, number>>({});
  const [scanInput, setScanInput] = useState('');
  const [errorModal, setErrorModal] = useState<{ title: string; detail: string } | null>(null);
  const [partialModal, setPartialModal] = useState<Line[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [recent, setRecent] = useState<any[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const scanRef = useRef<HTMLInputElement | null>(null);
  const lastKeyRef = useRef<{ token: string; at: number }>({ token: '', at: 0 });
  const invTimer = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null);
  const confirmRef = useRef<{ code: string; count: number }>({ code: '', count: 0 });
  const camCooldownRef = useRef<Map<string, number>>(new Map());
  const acceptCodeRef = useRef<(raw: string) => void>(() => {});

  useEffect(() => { document.title = 'Despacho verificado | Trinity ERP'; }, []);

  // Guard por flag de empresa.
  useEffect(() => {
    fetch('/api/proxy/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFlagOn(!!d?.useScanDispatch))
      .catch(() => setFlagOn(false));
  }, []);

  // Buscador de facturas con debounce (mismo patrón que /dispatch): número, N° fiscal, cliente, RIF.
  useEffect(() => {
    if (resolved || !invoiceInput.trim()) { setInvoiceResults([]); return; }
    if (invTimer.current) clearTimeout(invTimer.current);
    invTimer.current = setTimeout(async () => {
      setSearchingInv(true);
      try {
        const res = await fetch(`/api/proxy/invoices?search=${encodeURIComponent(invoiceInput)}&limit=10&status=PAID`);
        const data = await res.json();
        setInvoiceResults(Array.isArray(data.data) ? data.data : []);
      } catch { setInvoiceResults([]); }
      finally { setSearchingInv(false); }
    }, 250);
    return () => { if (invTimer.current) clearTimeout(invTimer.current); };
  }, [resolved, invoiceInput]);

  // Comandas de HOY (todas: entregadas, parciales, pendientes). Se refresca al volver a la lista.
  useEffect(() => {
    if (resolved) return;
    let cancel = false;
    setLoadingRecent(true);
    fetch('/api/proxy/dispatches?status=TODAS&today=1')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (!cancel) setRecent(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancel) setRecent([]); })
      .finally(() => { if (!cancel) setLoadingRecent(false); });
    return () => { cancel = true; };
  }, [resolved]);

  // Índices para validar cada lectura en el cliente (barcode exacto o código exacto).
  const byBarcode = useMemo(() => {
    const m = new Map<string, Line>();
    resolved?.lines.forEach((l) => { if (l.barcode) m.set(norm(l.barcode), l); });
    return m;
  }, [resolved]);
  const byCode = useMemo(() => {
    const m = new Map<string, Line>();
    resolved?.lines.forEach((l) => { if (l.productCode) m.set(norm(l.productCode), l); });
    return m;
  }, [resolved]);

  const resolveInvoice = useCallback(async (number: string) => {
    const num = number.trim();
    if (!num) return;
    setLoading(true); setBanner(null); setInvoiceResults([]);
    try {
      const res = await fetch('/api/proxy/dispatches/resolve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceNumber: num }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'No se pudo cargar la factura');
      setResolved(json);
      setScanned({});
      setTimeout(() => scanRef.current?.focus(), 50);
    } catch (err: any) {
      setResolved(null);
      setBanner({ type: 'err', text: err.message });
    } finally { setLoading(false); }
  }, []);

  const addToLine = useCallback((line: Line, qty: number) => {
    setScanned((prev) => {
      const current = prev[line.dispatchItemId] || 0;
      const next = Math.round((current + qty) * 1000) / 1000;
      if (next > line.remaining + 0.001) {
        beep(false);
        setErrorModal({
          title: `SON SOLO ${line.remaining}`,
          detail: `"${line.productName}": ya verificaste ${current}. No lleva más de ${line.remaining}.`,
        });
        return prev;
      }
      beep(true);
      return { ...prev, [line.dispatchItemId]: next };
    });
  }, []);

  // Núcleo de validación de una lectura (lo usan el teclado y la cámara).
  const acceptCode = useCallback((raw: string) => {
    const token = norm(raw);
    if (!token || !resolved) return;
    const line = byBarcode.get(token) || byCode.get(token);
    if (!line) {
      beep(false);
      setErrorModal({ title: 'NO ESTÁ EN LA FACTURA', detail: `Escaneaste: ${raw.trim()}` });
      return;
    }
    addToLine(line, 1);
  }, [resolved, byBarcode, byCode, addToLine]);

  // Mantener una ref a la última versión de acceptCode para los callbacks de la cámara.
  useEffect(() => { acceptCodeRef.current = acceptCode; }, [acceptCode]);

  // Tecleado / lector físico (HID): Enter dispara. Anti-doble-lectura corto (150ms).
  const onScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const raw = scanInput;
    setScanInput('');
    const token = norm(raw);
    const now = Date.now();
    if (lastKeyRef.current.token === token && now - lastKeyRef.current.at < 150) return;
    lastKeyRef.current = { token, at: now };
    acceptCode(raw);
  };

  // Cantidad manual para bultos: pide cuánto agregar de una línea (respeta el tope).
  const manualAdd = (line: Line) => {
    const current = scanned[line.dispatchItemId] || 0;
    const max = Math.round((line.remaining - current) * 1000) / 1000;
    if (max <= 0) { setErrorModal({ title: `SON SOLO ${line.remaining}`, detail: `"${line.productName}" ya está completo.` }); return; }
    const val = window.prompt(`¿Cuántos de "${line.productName}" agregar? (máx ${max})`, String(max));
    if (val == null) return;
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return;
    addToLine(line, n);
    scanRef.current?.focus();
  };

  // ---- Escáner por cámara (reutiliza el patrón del POS) ----
  const stopScanner = useCallback(() => {
    if (scannerControlsRef.current) { scannerControlsRef.current.stop(); scannerControlsRef.current = null; }
    confirmRef.current = { code: '', count: 0 };
    camCooldownRef.current.clear();
  }, []);

  // Exige 2 lecturas iguales seguidas + cooldown por código (para escaneo continuo sin repetir).
  const onCameraCode = useCallback((code: string) => {
    if (!code) return;
    if (confirmRef.current.code === code) confirmRef.current.count += 1;
    else confirmRef.current = { code, count: 1 };
    if (confirmRef.current.count < 2) return;
    const now = Date.now();
    const last = camCooldownRef.current.get(code) || 0;
    if (now - last < 1500) return; // misma unidad en cámara: no recontar por 1.5s
    camCooldownRef.current.set(code, now);
    acceptCodeRef.current(code);
  }, []);

  const toggleScanner = useCallback(async () => {
    if (scannerActive) { setScannerActive(false); stopScanner(); return; }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setErrorModal({ title: 'CÁMARA NO DISPONIBLE', detail: 'La cámara requiere HTTPS (no funciona en HTTP).' });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorModal({ title: 'CÁMARA NO SOPORTADA', detail: 'Este navegador no soporta acceso a la cámara.' });
      return;
    }
    try {
      confirmRef.current = { code: '', count: 0 };
      setScannerActive(true);
      await new Promise((r) => setTimeout(r, 100)); // esperar a que React monte el <video>

      // 1) BarcodeDetector nativo (Android -> instantáneo)
      const BD = (window as any).BarcodeDetector;
      let startedNative = false;
      if (BD && videoRef.current) {
        let formats = NATIVE_BARCODE_FORMATS;
        try {
          const supported: string[] = await BD.getSupportedFormats();
          formats = NATIVE_BARCODE_FORMATS.filter((f) => supported.includes(f));
        } catch { /* usar default */ }
        if (formats.length > 0) {
          const detector = new BD({ formats });
          const stream = await navigator.mediaDevices.getUserMedia(SCANNER_VIDEO_CONSTRAINTS);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play().catch(() => {});
            let stopped = false; let rafId = 0;
            const tick = async () => {
              if (stopped || !videoRef.current) return;
              try {
                const codes = await detector.detect(videoRef.current);
                if (codes && codes.length > 0) onCameraCode(codes[0].rawValue as string);
              } catch { /* frame error */ }
              rafId = requestAnimationFrame(tick);
            };
            rafId = requestAnimationFrame(tick);
            scannerControlsRef.current = {
              stop: () => { stopped = true; cancelAnimationFrame(rafId); stream.getTracks().forEach((t) => t.stop()); if (videoRef.current) videoRef.current.srcObject = null; },
            };
            startedNative = true;
          } else {
            stream.getTracks().forEach((t) => t.stop());
          }
        }
      }

      // 2) Fallback ZXing (iPhone/Safari)
      if (!startedNative) {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');
        const hints = new Map<number, any>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
        ]);
        const codeReader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 });
        if (!videoRef.current) throw new Error('No se pudo inicializar el video');
        const controls = await codeReader.decodeFromConstraints(
          SCANNER_VIDEO_CONSTRAINTS, videoRef.current,
          (result) => { if (result) onCameraCode(result.getText()); },
        );
        scannerControlsRef.current = { stop: () => controls.stop() };
      }
    } catch (err: any) {
      const msg = err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Permiso de cámara denegado. Revisa los permisos del navegador.'
        : err instanceof DOMException && err.name === 'NotFoundError'
        ? 'No se encontró ninguna cámara en este dispositivo.'
        : 'No se pudo acceder a la cámara.';
      setErrorModal({ title: 'CÁMARA', detail: msg });
      setScannerActive(false); stopScanner();
    }
  }, [scannerActive, stopScanner, onCameraCode]);

  // Apagar la cámara al desmontar o al soltar la factura.
  useEffect(() => () => stopScanner(), [stopScanner]);
  useEffect(() => { if (!resolved && scannerActive) { setScannerActive(false); stopScanner(); } }, [resolved, scannerActive, stopScanner]);

  const closeInvoice = () => { setResolved(null); setScanned({}); setInvoiceInput(''); setScannerActive(false); stopScanner(); };

  const totals = useMemo(() => {
    if (!resolved) return { done: 0, target: 0, complete: false };
    let done = 0, target = 0;
    resolved.lines.forEach((l) => { target += l.remaining; done += Math.min(scanned[l.dispatchItemId] || 0, l.remaining); });
    return { done: Math.round(done * 1000) / 1000, target: Math.round(target * 1000) / 1000, complete: done >= target - 0.001 && target > 0 };
  }, [resolved, scanned]);

  // Modo consulta (solo lectura): comanda ya entregada/cancelada o sin nada por despachar.
  const consultMode = !!resolved && (resolved.status === 'COMPLETADO' || resolved.status === 'CANCELADO' || totals.target === 0);

  const buildPayload = () =>
    (resolved?.lines || [])
      .map((l) => ({ dispatchItemId: l.dispatchItemId, qty: scanned[l.dispatchItemId] || 0 }))
      .filter((x) => x.qty > 0);

  const submit = useCallback(async () => {
    if (!resolved) return;
    const lines = buildPayload();
    if (lines.length === 0) { setBanner({ type: 'err', text: 'No has verificado ningún artículo' }); return; }
    setSaving(true); setBanner(null);
    try {
      const res = await fetch(`/api/proxy/dispatches/${resolved.dispatchId}/deliver`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'No se pudo registrar el despacho');
      setPartialModal(null);
      setBanner({ type: 'ok', text: json.status === 'COMPLETADO' ? `Despacho COMPLETO — ${resolved.number}` : `Despacho PARCIAL (quedó abierta) — ${resolved.number}` });
      setScannerActive(false); stopScanner();
      setResolved(null); setScanned({}); setInvoiceInput('');
    } catch (err: any) { setBanner({ type: 'err', text: err.message }); }
    finally { setSaving(false); }
  }, [resolved, scanned, stopScanner]);

  const onFinalize = () => {
    if (!resolved) return;
    if (totals.complete) { submit(); return; }
    const missing = resolved.lines
      .map((l) => ({ ...l, faltan: Math.round((l.remaining - (scanned[l.dispatchItemId] || 0)) * 1000) / 1000 }))
      .filter((l) => l.faltan > 0.001);
    setPartialModal(missing as any);
  };

  if (flagOn === null) return <div className="p-6 text-slate-400 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Cargando…</div>;
  if (!flagOn) return <div className="p-6 text-slate-400">Esta función no está habilitada para esta empresa.</div>;

  return (
    <div className="p-3 sm:p-6 max-w-4xl mx-auto pb-24 md:pb-6">
      <h1 className="text-xl font-semibold text-slate-100 flex items-center gap-2 mb-4">
        <ScanLine size={22} /> Despacho verificado
      </h1>

      {banner && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${banner.type === 'ok' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'}`}>
          {banner.text}
        </div>
      )}

      {!resolved && (
        <div>
        <div className="relative">
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3">
            <Search size={18} className="text-slate-500 shrink-0" />
            <input
              autoFocus
              value={invoiceInput}
              onChange={(e) => setInvoiceInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') resolveInvoice(invoiceInput); }}
              placeholder="Factura, cliente o cédula/RIF…"
              className="flex-1 bg-transparent py-3 text-base text-slate-100 outline-none"
            />
            {(searchingInv || loading) && <Loader2 className="animate-spin text-slate-500 shrink-0" size={16} />}
          </div>

          {invoiceResults.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-80 overflow-auto">
              {invoiceResults.map((inv) => (
                <button key={inv.id} onClick={() => resolveInvoice(inv.number)}
                  className="w-full text-left px-3 py-3 border-b border-slate-700/60 last:border-0 hover:bg-slate-700/60 active:bg-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-indigo-300 text-sm">{inv.number}</span>
                    <span className="text-xs text-slate-400">${Number(inv.totalUsd || 0).toFixed(2)}</span>
                  </div>
                  <div className="text-sm text-slate-200 truncate">{inv.customer?.name || 'Sin cliente'}</div>
                  {inv.customer?.rif && <div className="text-xs text-slate-500">{inv.customer.rif}</div>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Comandas de hoy: tocar una PARCIAL/PENDIENTE la reabre para seguir escaneando;
            las ENTREGADAS se abren como consulta (registro compartido con /dispatch). */}
        <div className="mt-6">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Comandas de hoy</div>
          {loadingRecent && recent.length === 0 ? (
            <div className="text-slate-500 text-sm flex items-center gap-2"><Loader2 className="animate-spin" size={14} /> Cargando…</div>
          ) : recent.length === 0 ? (
            <div className="text-slate-500 text-sm">Aún no hay comandas hoy.</div>
          ) : (
            <div className="space-y-2">
              {recent.map((d) => {
                const st = STATUS_META[d.status] || STATUS_META.PENDIENTE;
                return (
                  <button key={d.id} onClick={() => d.invoice?.number && resolveInvoice(d.invoice.number)}
                    className="w-full text-left rounded-lg border border-slate-700 bg-slate-800/60 hover:bg-slate-700/60 active:bg-slate-700 p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm text-slate-100 truncate">{d.invoice?.customer?.name || d.contactName || 'Sin cliente'}</div>
                      <div className="text-xs text-slate-500 font-mono">{d.invoice?.number || d.number}</div>
                    </div>
                    <span className={`shrink-0 text-xs px-2 py-1 rounded-full border ${st.cls}`}>{st.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        </div>
      )}

      {resolved && (
        <div>
          <button onClick={closeInvoice}
            className="mb-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 hover:bg-slate-700 active:bg-slate-600 text-sm font-medium">
            <ArrowLeft size={16} /> Volver
          </button>
          <div className="text-slate-300 text-sm mb-3">
            <span className="font-semibold text-slate-100">Factura {resolved.invoiceNumber}</span>
            {resolved.customerName ? ` · ${resolved.customerName}` : ''} · Comanda {resolved.number}
          </div>

          {consultMode ? (
            <div>
              <div className={`mb-4 rounded-xl border-2 p-5 text-center ${resolved.status === 'CANCELADO' ? 'border-red-500/50 bg-red-500/10' : 'border-emerald-500/50 bg-emerald-500/10'}`}>
                <div className={`text-2xl font-extrabold ${resolved.status === 'CANCELADO' ? 'text-red-300' : 'text-emerald-300'}`}>
                  {resolved.status === 'CANCELADO' ? 'COMANDA CANCELADA' : '✓ YA ENTREGADA'}
                </div>
                <div className="text-sm text-slate-300 mt-1">
                  {resolved.status === 'CANCELADO'
                    ? 'Esta comanda fue cancelada.'
                    : 'Esta comanda ya se despachó completa. La estás viendo solo como consulta.'}
                </div>
              </div>
              <div className="space-y-2">
                {resolved.lines.map((l) => (
                  <div key={l.dispatchItemId} className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-slate-100 truncate">{l.productName}</div>
                      <div className="text-xs text-slate-400">{l.productCode || l.barcode || '—'}</div>
                    </div>
                    <div className="shrink-0 text-sm text-emerald-300 font-semibold">Entregado: {l.quantityDelivered}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
          <>
          {/* Escáner de cámara (mobile) */}
          {scannerActive && (
            <div className="mb-3 rounded-lg overflow-hidden border-2 border-indigo-500/40 relative">
              <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-64 object-cover bg-black" />
              <button onClick={toggleScanner} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5">
                <X size={18} />
              </button>
              <div className="absolute inset-x-0 bottom-0 text-center text-xs text-white/90 bg-black/40 py-1">Apunta al código de barras</div>
            </div>
          )}

          {/* Entrada de escaneo + botón de cámara */}
          <div className="mb-4">
            <div className="flex gap-2">
              <input
                ref={scanRef}
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={onScanKeyDown}
                placeholder="Escanear/teclear código + Enter"
                className="flex-1 min-w-0 bg-slate-800 border-2 border-indigo-500/40 rounded-lg px-3 py-3 text-lg text-slate-100"
              />
              <button onClick={toggleScanner}
                className={`shrink-0 px-4 rounded-lg border flex items-center gap-2 font-medium ${scannerActive ? 'bg-red-500/20 border-red-500/30 text-red-300' : 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300'}`}>
                <Camera size={20} /><span className="hidden sm:inline">{scannerActive ? 'Cerrar' : 'Escanear'}</span>
              </button>
            </div>
            <div className="mt-2 text-sm text-slate-400">Progreso: {totals.done} / {totals.target}</div>
          </div>

          <div className="space-y-2 flex flex-col">
            {resolved.lines.map((l) => {
              const s = scanned[l.dispatchItemId] || 0;
              const complete = s >= l.remaining - 0.001;
              const pct = l.remaining > 0 ? Math.min(100, (s / l.remaining) * 100) : 100;
              return (
                <div key={l.dispatchItemId}
                  className={`rounded-lg border p-3 flex items-center gap-3 ${complete ? 'border-emerald-500/40 bg-emerald-500/10 order-last' : 'border-slate-700 bg-slate-800/60'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-100 truncate">{l.productName}</div>
                    <div className="text-xs text-slate-400">{l.productCode || l.barcode || '—'}</div>
                    <div className="mt-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full ${complete ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className={`text-lg font-semibold tabular-nums ${complete ? 'text-emerald-300' : 'text-slate-200'}`}>
                    {s}/{l.remaining}{complete && <Check className="inline ml-1" size={16} />}
                  </div>
                  <button onClick={() => manualAdd(l)} className="shrink-0 text-xs px-3 py-2 rounded border border-slate-600 text-slate-300 hover:bg-slate-700 active:bg-slate-600">+ cant.</button>
                </div>
              );
            })}
          </div>

          <div className="mt-5">
            <button onClick={onFinalize} disabled={saving}
              className="w-full py-3 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium disabled:opacity-40 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="animate-spin" size={18} /> : 'Finalizar despacho'}
            </button>
          </div>
          </>
          )}
        </div>
      )}

      {/* Modal de ERROR (grande, rojo) */}
      {errorModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { setErrorModal(null); scanRef.current?.focus(); }}>
          <div className="bg-red-950 border-2 border-red-500 rounded-2xl p-6 sm:p-8 max-w-md w-full text-center" onClick={(e) => e.stopPropagation()}>
            <AlertTriangle className="mx-auto mb-3 text-red-400" size={56} />
            <div className="text-2xl sm:text-3xl font-extrabold text-red-300 mb-2">⛔ {errorModal.title}</div>
            <div className="text-red-200 mb-5 break-words">{errorModal.detail}</div>
            <button onClick={() => { setErrorModal(null); scanRef.current?.focus(); }}
              className="px-6 py-2 rounded-lg bg-red-500/20 text-red-200 border border-red-500/40 font-medium">Entendido</button>
          </div>
        </div>
      )}

      {/* Modal de PARCIAL (confirmar que queda abierta) */}
      {partialModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-amber-500/50 rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold text-amber-300">Falta despachar</div>
              <button onClick={() => setPartialModal(null)}><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="text-sm text-slate-300 mb-3">Si continúas, la comanda queda <b>abierta (parcial)</b>. Falta:</div>
            <ul className="space-y-1 mb-5 max-h-48 overflow-auto">
              {partialModal.map((l: any) => (
                <li key={l.dispatchItemId} className="text-sm text-slate-200 flex justify-between">
                  <span className="truncate">{l.productName}</span><span className="text-amber-300 font-semibold ml-2">{l.faltan}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button onClick={() => setPartialModal(null)} className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-300">Seguir escaneando</button>
              <button onClick={submit} disabled={saving}
                className="flex-1 py-2 rounded-lg bg-amber-500/20 text-amber-200 border border-amber-500/40 font-medium disabled:opacity-40">
                {saving ? <Loader2 className="animate-spin inline" size={16} /> : 'Despachar parcial'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
