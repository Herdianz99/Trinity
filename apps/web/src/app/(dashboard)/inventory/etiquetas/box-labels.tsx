'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Trash2, Printer, Plus, X, FileText, User, Package } from 'lucide-react';

// ════════════════════════════════════════════════════════════
// Etiquetas de DESPACHO por caja (ventas al mayor): en un camion van cajas de varios
// clientes; cada caja lleva el CLIENTE grande, el contenido y "CAJA n/N".
// ════════════════════════════════════════════════════════════

interface BoxGroup { id: number; content: string; count: string }
interface InvoiceHit { id: string; number: string; createdAt: string; customer: { id: string; name: string; rif: string | null } | null }
interface CustomerHit { id: string; name: string; rif: string | null; documentType?: string | null; address?: string | null }

// RIF guardado como letra en documentType + digitos en rif (ej. J + 123456789 -> J-123456789)
function formatRif(c: { rif?: string | null; documentType?: string | null }): string {
  const rif = (c.rif || '').trim();
  if (!rif) return '';
  if (/^[A-Za-z]/.test(rif)) return rif.toUpperCase();
  return c.documentType ? `${c.documentType}-${rif}` : rif;
}

// Fecha local del navegador (= Caracas para el usuario), nunca toISOString
function todayLabel(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Fecha de la factura en hora local del navegador (dd/mm/aaaa)
const fmtDate = (s: string) => new Date(s).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });

let nextId = 1;
const newGroup = (content = '', count = '1'): BoxGroup => ({ id: nextId++, content, count });

export default function BoxLabels({ widthMm, heightMm }: { widthMm: string; heightMm: string }) {
  const [customerName, setCustomerName] = useState('');
  const [customerRif, setCustomerRif] = useState('');
  const [address, setAddress] = useState('');
  const [reference, setReference] = useState('');
  const [numbered, setNumbered] = useState(true);
  const [showAddress, setShowAddress] = useState(true);
  const [groups, setGroups] = useState<BoxGroup[]>(() => [newGroup()]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  // Buscador unificado: facturas (por numero o cliente) + clientes
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [invoiceHits, setInvoiceHits] = useState<InvoiceHit[]>([]);
  const [customerHits, setCustomerHits] = useState<CustomerHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loadingPick, setLoadingPick] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Cerrar la lista al tocar/clic fuera del buscador
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setInvoiceHits([]); setCustomerHits([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const [inv, cus] = await Promise.all([
          fetch(`/api/proxy/invoices?search=${encodeURIComponent(q)}&limit=6`).then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/proxy/customers?search=${encodeURIComponent(q)}&limit=6`).then((r) => (r.ok ? r.json() : null)),
        ]);
        setInvoiceHits(inv?.data || []);
        setCustomerHits(Array.isArray(cus) ? cus : cus?.data || []);
        setOpen(true);
      } catch { /* ignore */ } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function applyCustomer(customerId: string | undefined, fallback: { name: string; rif?: string | null }) {
    setCustomerName(fallback.name);
    setCustomerRif(formatRif({ rif: fallback.rif }));
    setAddress('');
    if (!customerId) return;
    // La ficha trae documentType (letra del RIF) y la direccion
    try {
      const r = await fetch(`/api/proxy/customers/${customerId}`);
      if (r.ok) {
        const c: CustomerHit = await r.json();
        setCustomerName(c.name || fallback.name);
        setCustomerRif(formatRif(c));
        setAddress(c.address || '');
      }
    } catch { /* se queda con lo basico */ }
  }

  async function pickInvoice(inv: InvoiceHit) {
    setOpen(false); setQuery(''); setLoadingPick(true);
    setReference(inv.number);
    await applyCustomer(inv.customer?.id, { name: inv.customer?.name || '', rif: inv.customer?.rif });
    setLoadingPick(false);
  }
  async function pickCustomer(c: CustomerHit) {
    setOpen(false); setQuery(''); setLoadingPick(true);
    await applyCustomer(c.id, c);
    setLoadingPick(false);
  }

  function updateGroup(id: number, patch: Partial<BoxGroup>) {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }
  function removeGroup(id: number) {
    setGroups((prev) => (prev.length > 1 ? prev.filter((g) => g.id !== id) : [newGroup()]));
  }
  function clearAll() {
    setCustomerName(''); setCustomerRif(''); setAddress(''); setReference('');
    setGroups([newGroup()]); setError('');
  }

  const totalBoxes = groups.reduce((s, g) => s + Math.max(0, Math.floor(Number(g.count) || 0)), 0);
  const date = todayLabel();

  // Mismo cuerpo para la vista previa y el PDF final (asi no pueden diferir)
  const boxes = groups
    .map((g) => ({ content: g.content.trim() || undefined, count: Math.floor(Number(g.count) || 0) }))
    .filter((b) => b.count > 0);
  const buildPayload = (previewOnly: boolean) => ({
    customerName: customerName.trim() || 'NOMBRE DEL CLIENTE',
    customerRif: customerRif.trim() || undefined,
    address: showAddress && address.trim() ? address.trim() : undefined,
    reference: reference.trim() || undefined,
    date,
    numbered,
    boxes: boxes.length ? boxes : [{ count: 1 }],
    widthMm: Number(widthMm) >= 10 ? Number(widthMm) : 57,
    heightMm: Number(heightMm) >= 10 ? Number(heightMm) : 40,
    ...(previewOnly ? { previewOnly: true } : {}),
  });
  const previewPayload = JSON.stringify(buildPayload(true));

  const handleGenerate = async () => {
    setError('');
    if (!customerName.trim()) { setError('Escribe el cliente (o búscalo por factura)'); return; }
    if (boxes.length === 0) { setError('Indica al menos una caja'); return; }
    const w = Number(widthMm), h = Number(heightMm);
    if (!(w >= 10) || !(h >= 10)) { setError('El tamaño de la etiqueta debe ser de al menos 10mm'); return; }
    setGenerating(true);
    try {
      const res = await fetch('/api/proxy/labels/boxes/pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(false)),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(Array.isArray(e.message) ? e.message.join(', ') : e.message || 'Error al generar etiquetas'); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
      <div className="space-y-4 min-w-0">
        {error && <div className="p-3 rounded-lg border text-sm bg-red-500/10 border-red-500/20 text-red-400">{error}</div>}

        {/* Cliente. relative z-30: .card usa backdrop-blur (crea su propio contexto de apilado),
            sin esto la tarjeta "Cajas" de abajo tapa la lista desplegable */}
        <div className="card p-4 space-y-3 relative z-30">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-400 flex items-center gap-1.5"><User size={13} /> Cliente destino</p>
            <button onClick={clearAll} className="text-xs text-slate-400 hover:text-red-400">Limpiar todo</button>
          </div>

          <div className="relative" ref={searchRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => (invoiceHits.length || customerHits.length) && setOpen(true)}
              onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
              placeholder="Buscar por N° de factura o nombre del cliente…"
              className="input-field pl-9 pr-9 !py-2.5 text-sm w-full"
              autoComplete="off"
            />
            {(searching || loadingPick) && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-500" size={15} />}
            {open && !searching && query.trim().length >= 2 && invoiceHits.length === 0 && customerHits.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl px-3 py-3 text-sm text-slate-400">
                Sin resultados. Puedes escribir el nombre a mano abajo.
              </div>
            )}
            {open && (invoiceHits.length > 0 || customerHits.length > 0) && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl max-h-80 overflow-y-auto overscroll-contain">
                {invoiceHits.length > 0 && (
                  <>
                    <p className="sticky top-0 bg-slate-800 px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Facturas</p>
                    {invoiceHits.map((inv) => (
                      <button key={inv.id} onClick={() => pickInvoice(inv)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-700/60 active:bg-slate-700 flex items-start gap-2.5 border-t border-slate-700/40 first-of-type:border-t-0">
                        <FileText size={14} className="text-slate-500 flex-shrink-0 mt-0.5" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-white break-words leading-snug">{inv.customer?.name || '—'}</span>
                          <span className="block text-[11px] text-slate-500 mt-0.5">
                            <span className="font-mono text-green-400">{inv.number}</span> · {fmtDate(inv.createdAt)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </>
                )}
                {customerHits.length > 0 && (
                  <>
                    <p className="sticky top-0 bg-slate-800 px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-t border-slate-700/60">Clientes</p>
                    {customerHits.map((c) => (
                      <button key={c.id} onClick={() => pickCustomer(c)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-700/60 active:bg-slate-700 flex items-start gap-2.5 border-t border-slate-700/40">
                        <User size={14} className="text-slate-500 flex-shrink-0 mt-0.5" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-white break-words leading-snug">{c.name}</span>
                          {formatRif(c) && <span className="block text-[11px] text-slate-500 font-mono mt-0.5">{formatRif(c)}</span>}
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_160px] gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nombre en la etiqueta *</label>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={150}
                placeholder="Ej. FERREAGRO LA SABANITA, C.A." className="input-field !py-2 text-sm w-full font-semibold" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">RIF (opcional)</label>
              <input value={customerRif} onChange={(e) => setCustomerRif(e.target.value)} maxLength={30}
                placeholder="J-12345678-9" className="input-field !py-2 text-sm w-full font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_160px] gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-slate-400">Dirección / destino</label>
                <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
                  <input type="checkbox" checked={showAddress} onChange={(e) => setShowAddress(e.target.checked)} className="accent-green-500" />
                  Imprimir
                </label>
              </div>
              <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} disabled={!showAddress}
                placeholder="Ej. Calle 5, La Sabanita, Ciudad Bolívar" className="input-field !py-2 text-sm w-full disabled:opacity-50" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Factura / referencia</label>
              <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={40}
                placeholder="Ej. FAC-00123" className="input-field !py-2 text-sm w-full font-mono" />
            </div>
          </div>
        </div>

        {/* Cajas */}
        <div className="card p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs font-medium text-slate-400 flex items-center gap-1.5"><Package size={13} /> Cajas</p>
            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
              <input type="checkbox" checked={numbered} onChange={(e) => setNumbered(e.target.checked)} className="accent-green-500" />
              Numerar “CAJA 1/{totalBoxes || 'N'}”
            </label>
          </div>
          <div className="space-y-2">
            {groups.map((g, idx) => (
              <div key={g.id} className="flex items-center gap-2">
                <input
                  value={g.content}
                  onChange={(e) => updateGroup(g.id, { content: e.target.value })}
                  maxLength={120}
                  placeholder={idx === 0 ? 'Contenido (opcional). Ej. 24 UND, TUBO PVC 1/2' : 'Contenido de estas cajas'}
                  className="input-field !py-2 text-sm flex-1 min-w-0"
                />
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-xs text-slate-500 hidden sm:inline">×</span>
                  <input
                    type="number" min="1" step="1" inputMode="numeric"
                    value={g.count}
                    onChange={(e) => updateGroup(g.id, { count: e.target.value })}
                    className="input-field !py-2 text-sm w-16 sm:w-20 text-right font-mono"
                    aria-label="Cantidad de cajas"
                  />
                  <span className="text-xs text-slate-500 w-9">caja{Number(g.count) === 1 ? '' : 's'}</span>
                </div>
                <button onClick={() => removeGroup(g.id)} className="p-1.5 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 flex-shrink-0" title="Quitar">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => setGroups((prev) => [...prev, newGroup()])} className="mt-3 text-xs text-green-400 hover:text-green-300 flex items-center gap-1.5">
            <Plus size={13} /> Agregar otro contenido
          </button>
          <p className="text-[11px] text-slate-500 mt-2">
            Cada fila es un tipo de caja. Ej. “TUBO PVC 1/2 - 24 UND” × 3 y “CODOS 1/2 - 100 UND” × 1 = 4 etiquetas (CAJA 1/4 … 4/4).
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <span className="text-sm text-slate-400"><span className="text-white font-semibold">{totalBoxes}</span> etiqueta(s) · una por caja</span>
          <button onClick={handleGenerate} disabled={generating || totalBoxes <= 0} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
            {generating ? <Loader2 className="animate-spin" size={16} /> : <Printer size={16} />} Generar PDF
          </button>
        </div>
      </div>

      {/* Vista previa */}
      <div className="card p-4 lg:sticky lg:top-4">
        <p className="text-xs font-medium text-slate-400 mb-3">Vista previa · caja 1 ({widthMm} × {heightMm} mm)</p>
        <PdfLabelPreview payload={previewPayload} />
        <p className="text-[11px] text-slate-500 mt-3">Es la etiqueta real del PDF: así sale impresa.</p>
      </div>
    </div>
  );
}

// Vista previa EXACTA: pide al servidor el PDF de la 1ra etiqueta (previewOnly) y lo dibuja
// con pdf.js, así lo que se ve es lo que se imprime. pdf.js se carga solo al usar la pestaña.
function PdfLabelPreview({ payload }: { payload: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/proxy/labels/boxes/pdf', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload,
        });
        if (!res.ok) throw new Error('preview');
        const data = new Uint8Array(await res.arrayBuffer());
        const pdfjs = await import('pdfjs-dist');
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          // El worker se sirve desde /public (empaquetarlo rompe el build de Next 14: el
          // minificador no lo parsea). Si se actualiza pdfjs-dist, copiar el worker nuevo:
          // node_modules/pdfjs-dist/build/pdf.worker.min.mjs -> public/pdfjs/pdf.worker-<version>.min.mjs
          pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/pdf.worker-${pdfjs.version}.min.mjs`;
        }
        const doc = await pdfjs.getDocument({ data }).promise;
        const page = await doc.getPage(1);
        if (cancelled) return;
        // Ancho disponible (max 300px) y nitidez segun la pantalla
        const base = page.getViewport({ scale: 1 });
        const maxW = Math.min(300, boxRef.current?.clientWidth || 300);
        const cssScale = Math.min(maxW / base.width, 220 / base.height);
        const dpr = window.devicePixelRatio || 1;
        const vp = page.getViewport({ scale: cssScale * dpr });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
        canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
        doc.destroy();
        if (!cancelled) setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [payload]);

  return (
    <div ref={boxRef} className="relative flex justify-center min-h-[120px]">
      <canvas ref={canvasRef} className={`bg-white shadow-lg transition-opacity ${loading ? 'opacity-60' : ''} ${failed ? 'hidden' : ''}`} />
      {loading && <Loader2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-slate-400" size={20} />}
      {failed && !loading && <p className="text-xs text-slate-500 self-center">No se pudo generar la vista previa.</p>}
    </div>
  );
}
