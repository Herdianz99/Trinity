'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ScanLine, Check, AlertTriangle, X } from 'lucide-react';

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

export default function DispatchScanPage() {
  const [flagOn, setFlagOn] = useState<boolean | null>(null); // null = cargando
  const [invoiceInput, setInvoiceInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  // scanned[dispatchItemId] = cuánto se ha verificado en ESTA sesión
  const [scanned, setScanned] = useState<Record<string, number>>({});
  const [scanInput, setScanInput] = useState('');
  const [errorModal, setErrorModal] = useState<{ title: string; detail: string } | null>(null);
  const [partialModal, setPartialModal] = useState<Line[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const scanRef = useRef<HTMLInputElement | null>(null);
  const lastScanRef = useRef<{ token: string; at: number }>({ token: '', at: 0 });

  useEffect(() => { document.title = 'Despacho verificado | Trinity ERP'; }, []);

  // Guard por flag de empresa.
  useEffect(() => {
    fetch('/api/proxy/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFlagOn(!!d?.useScanDispatch))
      .catch(() => setFlagOn(false));
  }, []);

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
    setLoading(true); setBanner(null);
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

  const handleScan = useCallback((raw: string) => {
    const token = norm(raw);
    if (!token || !resolved) return;
    // Anti-doble-lectura: ignora el mismo token repetido en <150ms (gatillo doble).
    const now = Date.now();
    if (lastScanRef.current.token === token && now - lastScanRef.current.at < 150) return;
    lastScanRef.current = { token, at: now };

    const line = byBarcode.get(token) || byCode.get(token);
    if (!line) {
      beep(false);
      setErrorModal({ title: 'NO ESTÁ EN LA FACTURA', detail: `Escaneaste: ${raw.trim()}` });
      return;
    }
    addToLine(line, 1);
  }, [resolved, byBarcode, byCode, addToLine]);

  const onScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleScan(scanInput);
      setScanInput('');
    }
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

  const totals = useMemo(() => {
    if (!resolved) return { done: 0, target: 0, complete: false };
    let done = 0, target = 0;
    resolved.lines.forEach((l) => { target += l.remaining; done += Math.min(scanned[l.dispatchItemId] || 0, l.remaining); });
    return { done: Math.round(done * 1000) / 1000, target: Math.round(target * 1000) / 1000, complete: done >= target - 0.001 && target > 0 };
  }, [resolved, scanned]);

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
      setResolved(null); setScanned({}); setInvoiceInput('');
    } catch (err: any) { setBanner({ type: 'err', text: err.message }); }
    finally { setSaving(false); }
  }, [resolved, scanned]);

  const onFinalize = () => {
    if (!resolved) return;
    if (totals.complete) { submit(); return; }
    // Falta algo → modal con lo que queda pendiente, para confirmar parcial.
    const missing = resolved.lines
      .map((l) => ({ ...l, faltan: Math.round((l.remaining - (scanned[l.dispatchItemId] || 0)) * 1000) / 1000 }))
      .filter((l) => l.faltan > 0.001);
    setPartialModal(missing as any);
  };

  if (flagOn === null) return <div className="p-6 text-slate-400 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Cargando…</div>;
  if (!flagOn) return <div className="p-6 text-slate-400">Esta función no está habilitada para esta empresa.</div>;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-100 flex items-center gap-2 mb-4">
        <ScanLine size={22} /> Despacho verificado
      </h1>

      {banner && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${banner.type === 'ok' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'}`}>
          {banner.text}
        </div>
      )}

      {!resolved && (
        <div className="flex gap-2">
          <input
            autoFocus
            value={invoiceInput}
            onChange={(e) => setInvoiceInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') resolveInvoice(invoiceInput); }}
            placeholder="N° de factura (escanear o teclear) + Enter"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
          />
          <button onClick={() => resolveInvoice(invoiceInput)} disabled={loading}
            className="px-4 py-2 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 disabled:opacity-40 flex items-center gap-2">
            {loading ? <Loader2 className="animate-spin" size={16} /> : 'Buscar'}
          </button>
        </div>
      )}

      {resolved && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="text-slate-300 text-sm">
              <span className="font-semibold text-slate-100">Factura {resolved.invoiceNumber}</span>
              {resolved.customerName ? ` · ${resolved.customerName}` : ''} · Comanda {resolved.number}
            </div>
            <button onClick={() => { setResolved(null); setScanned({}); setInvoiceInput(''); }}
              className="text-xs text-slate-400 hover:text-slate-200">Cambiar factura</button>
          </div>

          <div className="mb-4">
            <input
              ref={scanRef}
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={onScanKeyDown}
              placeholder="Escanear/teclear código de artículo + Enter"
              className="w-full bg-slate-800 border-2 border-indigo-500/40 rounded-lg px-3 py-3 text-lg text-slate-100"
            />
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
                  <button onClick={() => manualAdd(l)} className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-300 hover:bg-slate-700">+ cant.</button>
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
        </div>
      )}

      {/* Modal de ERROR (grande, rojo) */}
      {errorModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { setErrorModal(null); scanRef.current?.focus(); }}>
          <div className="bg-red-950 border-2 border-red-500 rounded-2xl p-8 max-w-md text-center" onClick={(e) => e.stopPropagation()}>
            <AlertTriangle className="mx-auto mb-3 text-red-400" size={56} />
            <div className="text-3xl font-extrabold text-red-300 mb-2">⛔ {errorModal.title}</div>
            <div className="text-red-200 mb-5">{errorModal.detail}</div>
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
