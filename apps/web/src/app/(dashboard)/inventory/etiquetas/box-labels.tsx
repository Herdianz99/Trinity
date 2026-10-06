'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
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
  const firstContent = groups.find((g) => g.content.trim())?.content.trim() || '';
  const date = todayLabel();

  const handleGenerate = useCallback(async () => {
    setError('');
    if (!customerName.trim()) { setError('Escribe el cliente (o búscalo por factura)'); return; }
    const boxes = groups
      .map((g) => ({ content: g.content.trim() || undefined, count: Math.floor(Number(g.count) || 0) }))
      .filter((b) => b.count > 0);
    if (boxes.length === 0) { setError('Indica al menos una caja'); return; }
    const w = Number(widthMm), h = Number(heightMm);
    if (!(w >= 10) || !(h >= 10)) { setError('El tamaño de la etiqueta debe ser de al menos 10mm'); return; }
    setGenerating(true);
    try {
      const res = await fetch('/api/proxy/labels/boxes/pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerRif: customerRif.trim() || undefined,
          address: showAddress && address.trim() ? address.trim() : undefined,
          reference: reference.trim() || undefined,
          date,
          numbered,
          boxes,
          widthMm: w,
          heightMm: h,
        }),
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
  }, [customerName, customerRif, address, showAddress, reference, date, numbered, groups, widthMm, heightMm]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
      <div className="space-y-4 min-w-0">
        {error && <div className="p-3 rounded-lg border text-sm bg-red-500/10 border-red-500/20 text-red-400">{error}</div>}

        {/* Cliente */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-400 flex items-center gap-1.5"><User size={13} /> Cliente destino</p>
            <button onClick={clearAll} className="text-xs text-slate-400 hover:text-red-400">Limpiar todo</button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => (invoiceHits.length || customerHits.length) && setOpen(true)}
              placeholder="Buscar por N° de factura o nombre del cliente…"
              className="input-field pl-9 pr-9 !py-2.5 text-sm w-full"
              autoComplete="off"
            />
            {(searching || loadingPick) && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-500" size={15} />}
            {open && (invoiceHits.length > 0 || customerHits.length > 0) && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700/50 rounded-lg shadow-xl max-h-72 overflow-y-auto">
                {invoiceHits.length > 0 && (
                  <>
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Facturas</p>
                    {invoiceHits.map((inv) => (
                      <button key={inv.id} onClick={() => pickInvoice(inv)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700/50 flex items-center gap-2">
                        <FileText size={13} className="text-slate-500 flex-shrink-0" />
                        <span className="font-mono text-green-400 text-xs flex-shrink-0">{inv.number}</span>
                        <span className="text-white truncate">{inv.customer?.name || '—'}</span>
                      </button>
                    ))}
                  </>
                )}
                {customerHits.length > 0 && (
                  <>
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Clientes</p>
                    {customerHits.map((c) => (
                      <button key={c.id} onClick={() => pickCustomer(c)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700/50 flex items-center gap-2">
                        <User size={13} className="text-slate-500 flex-shrink-0" />
                        <span className="text-white truncate flex-1">{c.name}</span>
                        <span className="text-xs text-slate-500 flex-shrink-0">{formatRif(c)}</span>
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
        <BoxLabelPreview
          widthMm={Number(widthMm) || 57}
          heightMm={Number(heightMm) || 40}
          customer={customerName.trim() || 'NOMBRE DEL CLIENTE'}
          rif={customerRif.trim()}
          address={showAddress ? address.trim() : ''}
          meta={[reference.trim(), date].filter(Boolean).join(' · ')}
          tag={numbered ? `CAJA 1/${totalBoxes || 1}` : ''}
          content={firstContent}
          placeholder={!customerName.trim()}
        />
        <p className="text-[11px] text-slate-500 mt-3">Vista aproximada; el PDF ajusta el tamaño de letra para llenar la etiqueta.</p>
      </div>
    </div>
  );
}

// Texto que se achica hasta caber en su caja (aproxima el auto-ajuste del PDF)
function FitText({ text, max, min, className }: { text: string; max: number; min: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(max);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let s = max;
    el.style.fontSize = `${s}px`;
    while (s > min && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) {
      s -= 0.5;
      el.style.fontSize = `${s}px`;
    }
    setSize(s);
  }, [text, max, min]);
  return (
    <div ref={ref} className={`h-full w-full flex items-center justify-center text-center overflow-hidden break-words leading-tight ${className || ''}`} style={{ fontSize: size }}>
      <span className="max-h-full">{text}</span>
    </div>
  );
}

function BoxLabelPreview({ widthMm, heightMm, customer, rif, address, meta, tag, content, placeholder }: {
  widthMm: number; heightMm: number; customer: string; rif: string; address: string;
  meta: string; tag: string; content: string; placeholder: boolean;
}) {
  // Escala: el lado mas restrictivo ocupa el ancho disponible (~300px) o 220px de alto
  const pxPerMm = Math.min(300 / widthMm, 220 / heightMm);
  const w = widthMm * pxPerMm;
  const h = heightMm * pxPerMm;
  const k = Math.min(widthMm / 57, heightMm / 40) * (pxPerMm / 2.8346); // pt -> px aprox
  const small = Math.max(7, 6.5 * k);

  return (
    <div className="flex justify-center">
      <div className="bg-white text-black flex flex-col shadow-lg" style={{ width: w, height: h, padding: 3 * k, fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div className="flex-1 min-h-0 flex flex-col" style={{ border: `${Math.max(1, 1.2 * k)}px solid #000`, padding: `${3 * k}px ${4 * k}px` }}>
          {/* Franja superior */}
          <div className="flex items-center justify-between gap-1 flex-shrink-0" style={{ height: Math.max(12, 13 * k) }}>
            <span className="truncate" style={{ fontSize: small }}>{meta}</span>
            {tag && (
              <span className="bg-black text-white font-bold whitespace-nowrap flex items-center h-full" style={{ fontSize: Math.max(8, 9 * k), padding: `0 ${4 * k}px` }}>{tag}</span>
            )}
          </div>
          {/* Cliente */}
          <div className="min-h-0" style={{ flex: content ? 55 : 100, marginTop: 3 * k }}>
            <FitText text={customer} max={22 * k} min={7} className={`font-bold ${placeholder ? 'text-gray-300' : ''}`} />
          </div>
          {rif && <div className="text-center flex-shrink-0 truncate" style={{ fontSize: small }}>{rif}</div>}
          {content && (
            <>
              <div className="flex-shrink-0 bg-black" style={{ height: Math.max(1, 0.6 * k), margin: `${1 * k}px 0` }} />
              <div className="min-h-0" style={{ flex: 45 }}>
                <FitText text={content} max={16 * k} min={6} className="font-bold" />
              </div>
            </>
          )}
          {address && <div className="flex-shrink-0 line-clamp-2 leading-tight" style={{ fontSize: small }}>{address}</div>}
        </div>
      </div>
    </div>
  );
}
