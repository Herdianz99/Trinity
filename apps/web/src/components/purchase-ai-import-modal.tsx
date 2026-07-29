'use client';

import { useState, useRef, useEffect } from 'react';
import { Loader2, Sparkles, X, Upload, Check, AlertTriangle, Search } from 'lucide-react';

// ---------------------------------------------------------------------------
// Tipos que devuelve POST /purchases/ai/extract
// ---------------------------------------------------------------------------
interface DraftProduct {
  id: string;
  code: string;
  name: string;
  supplierRef: string | null;
  costUsd: number;
  priceDetal: number;
  priceMayor: number;
  ivaType: string;
  isService: boolean;
}

interface DraftLine {
  supplierCode: string | null;
  description: string;
  quantity: number;
  unitCost: number;
  lineDiscountPct: number;
  lineTotal: number | null;
  matchStatus: 'matched' | 'suggested' | 'new';
  product: DraftProduct | null;
  candidates: DraftProduct[];
}

interface DraftHeader {
  supplierName: string | null;
  supplierRif: string | null;
  invoiceNumber: string | null;
  controlNumber: string | null;
  date: string | null;
  currency: 'USD' | 'BS' | null;
  exchangeRate: number | null;
  subtotal: number | null;
  discountGlobalAmount: number | null;
  tax: number | null;
  exempt: number | null;
  total: number | null;
}

interface Draft {
  header: DraftHeader;
  supplier: { id: string; name: string; rif: string | null } | null;
  lines: DraftLine[];
  summary: { totalLines: number; matched: number; suggested: number; new: number };
  fileUrl: string | null;
  model: string;
}

interface SearchResult {
  id: string;
  code: string;
  name: string;
  isService?: boolean;
}

// Estado por línea que el usuario resuelve en la revisión
interface LineState {
  include: boolean;
  product: DraftProduct | null;
  quantity: number;
  unitCost: number;
  discountPct: number;
  description: string;
  supplierCode: string | null;
  search: string;
  results: SearchResult[];
  searching: boolean;
}

// Payload que se aplica al formulario de compra
export interface AiImportItem {
  productId: string;
  code: string;
  name: string;
  supplierRef: string;
  quantity: number;
  costUsd: number; // en la moneda de la factura
  previousCostUsd: number; // costo actual del producto en USD
  discountPct: number;
  ivaType: string;
  isService: boolean;
}

export interface AiImportResult {
  header: {
    supplierId?: string;
    supplierInvoiceNumber?: string;
    supplierControlNumber?: string;
    invoiceDate?: string;
    currency?: 'USD' | 'BS';
    exchangeRate?: number;
    discountGlobalPct?: number;
  };
  items: AiImportItem[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  supplierId?: string;
  onApply: (result: AiImportResult) => void;
}

const STATUS_LABEL: Record<DraftLine['matchStatus'], { text: string; cls: string }> = {
  matched: { text: 'Emparejado', cls: 'bg-green-500/100/15 text-green-300' },
  suggested: { text: 'Sugerido', cls: 'bg-amber-500/15 text-amber-300' },
  new: { text: 'Nuevo', cls: 'bg-red-500/100/15 text-red-300' },
};

function n2(n: number): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('read error'));
    reader.readAsDataURL(file);
  });
}

// Reduce una imagen a un lado máximo (px) y la re-comprime como JPEG.
function downscaleImage(dataUri: string, maxSide: number, quality: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      if (scale >= 1) return resolve(dataUri); // ya es pequeña
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUri);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUri);
    img.src = dataUri;
  });
}

export default function PurchaseAiImportModal({ open, onClose, supplierId, onApply }: Props) {
  const [fileName, setFileName] = useState('');
  const [fileDataUri, setFileDataUri] = useState('');
  const [instructions, setInstructions] = useState('');
  const [precise, setPrecise] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [lineStates, setLineStates] = useState<LineState[]>([]);
  const searchTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Reset al cerrar
  useEffect(() => {
    if (!open) {
      setFileName('');
      setFileDataUri('');
      setInstructions('');
      setPrecise(false);
      setError('');
      setDraft(null);
      setLineStates([]);
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError('');
    try {
      const dataUri = await readAsDataUri(file);
      // Las imágenes se reducen en el navegador (menos peso de red y menos tokens);
      // los PDF se envían tal cual.
      const finalUri = file.type === 'application/pdf' ? dataUri : await downscaleImage(dataUri, 2000, 0.85);
      setFileDataUri(finalUri);
      setFileName(file.name);
    } catch {
      setError('No se pudo leer el archivo.');
    }
  }

  async function runExtraction() {
    if (!fileDataUri) {
      setError('Sube primero la factura (PDF o imagen).');
      return;
    }
    setLoading(true);
    setError('');
    setDraft(null);
    try {
      const res = await fetch('/api/proxy/purchases/ai/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: fileDataUri,
          instructions: instructions.trim() || undefined,
          supplierId,
          preciseModel: precise,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
      const d = data as Draft;
      setDraft(d);
      setLineStates(
        d.lines.map((l) => {
          const product = l.matchStatus === 'matched' ? l.product : l.candidates[0] ?? null;
          return {
            include: l.matchStatus !== 'new',
            product,
            quantity: l.quantity || 1,
            unitCost: l.unitCost || 0,
            discountPct: l.lineDiscountPct || 0,
            description: l.description,
            supplierCode: l.supplierCode,
            search: '',
            results: [],
            searching: false,
          };
        }),
      );
    } catch (e) {
      setError((e as Error).message || 'Falló la extracción.');
    } finally {
      setLoading(false);
    }
  }

  function patchLine(idx: number, patch: Partial<LineState>) {
    setLineStates((prev) => prev.map((ls, i) => (i === idx ? { ...ls, ...patch } : ls)));
  }

  function searchProduct(idx: number, q: string) {
    patchLine(idx, { search: q });
    if (searchTimers.current[idx]) clearTimeout(searchTimers.current[idx]);
    if (q.length < 2) {
      patchLine(idx, { results: [] });
      return;
    }
    searchTimers.current[idx] = setTimeout(async () => {
      patchLine(idx, { searching: true });
      try {
        const res = await fetch(`/api/proxy/products/search?q=${encodeURIComponent(q)}`);
        const data = res.ok ? await res.json() : [];
        patchLine(idx, { results: Array.isArray(data) ? data : [] });
      } catch {
        patchLine(idx, { results: [] });
      } finally {
        patchLine(idx, { searching: false });
      }
    }, 300);
  }

  async function pickProduct(idx: number, r: SearchResult) {
    // Traer detalle para costUsd / ivaType / supplierRef
    let product: DraftProduct = {
      id: r.id,
      code: r.code,
      name: r.name,
      supplierRef: null,
      costUsd: 0,
      priceDetal: 0,
      priceMayor: 0,
      ivaType: 'GENERAL',
      isService: r.isService || false,
    };
    try {
      const res = await fetch(`/api/proxy/products/${r.id}`);
      if (res.ok) {
        const d = await res.json();
        product = {
          ...product,
          supplierRef: d.supplierRef ?? null,
          costUsd: d.costUsd ?? 0,
          ivaType: d.ivaType ?? 'GENERAL',
          isService: d.isService ?? false,
        };
      }
    } catch {
      /* usa defaults */
    }
    patchLine(idx, { product, include: true, search: '', results: [] });
  }

  // Total calculado de las líneas incluidas (en moneda de la factura)
  const calcSubtotal = lineStates.reduce(
    (acc, ls) => (ls.include && ls.product ? acc + ls.quantity * ls.unitCost * (1 - ls.discountPct / 100) : acc),
    0,
  );
  const invoiceTotal = draft?.header.total ?? null;
  const invoiceSubtotal = draft?.header.subtotal ?? null;
  const reconBase = invoiceSubtotal ?? (invoiceTotal != null && draft?.header.tax != null ? invoiceTotal - draft.header.tax : null);
  const reconciles = reconBase != null ? Math.abs(reconBase - calcSubtotal) < Math.max(1, reconBase * 0.02) : null;

  function apply() {
    if (!draft) return;
    const items: AiImportItem[] = lineStates
      .filter((ls) => ls.include && ls.product)
      .map((ls) => {
        const p = ls.product as DraftProduct;
        return {
          productId: p.id,
          code: p.code,
          name: p.name,
          supplierRef: p.supplierRef || ls.supplierCode || '',
          quantity: ls.quantity,
          costUsd: ls.unitCost,
          previousCostUsd: p.costUsd,
          discountPct: ls.discountPct,
          ivaType: p.ivaType,
          isService: p.isService,
        };
      });

    const h = draft.header;
    const discountGlobalPct =
      h.discountGlobalAmount && h.subtotal && h.subtotal > 0
        ? Math.round((h.discountGlobalAmount / h.subtotal) * 10000) / 100
        : undefined;

    onApply({
      header: {
        supplierId: draft.supplier?.id,
        supplierInvoiceNumber: h.invoiceNumber || undefined,
        supplierControlNumber: h.controlNumber || undefined,
        invoiceDate: h.date || undefined,
        currency: h.currency || undefined,
        exchangeRate: h.exchangeRate || undefined,
        discountGlobalPct,
      },
      items,
    });
    onClose();
  }

  const includedCount = lineStates.filter((ls) => ls.include && ls.product).length;
  const unresolved = lineStates.filter((ls) => ls.include && !ls.product).length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-800 text-slate-200 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Sparkles className="h-5 w-5 text-indigo-400" /> Cargar factura con IA
          </h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Paso 1: subir + instrucciones */}
          {!draft && (
            <div className="space-y-4">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-600 bg-slate-900 text-slate-100 py-8 text-slate-400 hover:border-indigo-400 hover:text-indigo-400">
                <Upload className="h-7 w-7" />
                <span className="text-sm font-medium">{fileName || 'Sube el PDF o la foto de la factura'}</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </label>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">
                  Instrucciones para la IA <span className="font-normal text-slate-500">(opcional)</span>
                </label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={3}
                  placeholder='Ej: "aplícale 10% de descuento global que no viene en la factura", "la columna de costo buena es la 3ra", "los precios ya traen IVA"'
                  className="w-full rounded-lg border border-slate-600 bg-slate-900 text-slate-100 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <label className="flex items-start gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={precise} onChange={(e) => setPrecise(e.target.checked)} className="mt-0.5" />
                <span>
                  <span className="font-medium text-slate-300">Factura difícil / foto de baja calidad</span> — usa el modelo más
                  preciso (lee mejor tablas densas y códigos, pero es más lento y algo más caro).
                </span>
              </label>
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  <AlertTriangle className="h-4 w-4" /> {error}
                </div>
              )}
              <button
                onClick={runExtraction}
                disabled={loading || !fileDataUri}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {loading ? 'Leyendo la factura…' : 'Leer con IA'}
              </button>
            </div>
          )}

          {/* Paso 2: revisión */}
          {draft && (
            <div className="space-y-4">
              {/* Encabezado extraído */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-slate-900/50 p-3 text-sm md:grid-cols-3">
                <div><span className="text-slate-400">Proveedor:</span> {draft.header.supplierName || '—'}
                  {draft.supplier ? <Check className="ml-1 inline h-3.5 w-3.5 text-green-600" /> : <span className="ml-1 text-xs text-red-400">(no en sistema)</span>}
                </div>
                <div><span className="text-slate-400">RIF:</span> {draft.header.supplierRif || '—'}</div>
                <div><span className="text-slate-400">Factura N°:</span> {draft.header.invoiceNumber || '—'}</div>
                <div><span className="text-slate-400">Fecha:</span> {draft.header.date || '—'}</div>
                <div><span className="text-slate-400">Moneda:</span> {draft.header.currency || '—'}</div>
                <div><span className="text-slate-400">Total:</span> {draft.header.total != null ? n2(draft.header.total) : '—'}</div>
              </div>

              {/* Resumen del match */}
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="rounded bg-green-500/15 px-2 py-1 text-green-300">Emparejados: {draft.summary.matched}</span>
                <span className="rounded bg-amber-500/15 px-2 py-1 text-amber-300">Sugeridos: {draft.summary.suggested}</span>
                <span className="rounded bg-red-500/15 px-2 py-1 text-red-300">Nuevos: {draft.summary.new}</span>
                <span className="rounded bg-slate-700 px-2 py-1 text-slate-400">Modelo: {draft.model}</span>
              </div>

              {/* Tabla de líneas */}
              <div className="overflow-x-auto rounded-lg border border-slate-700">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900/50 text-left text-xs uppercase text-slate-400">
                    <tr>
                      <th className="px-2 py-2"></th>
                      <th className="px-2 py-2">Factura (proveedor)</th>
                      <th className="px-2 py-2">Producto en sistema</th>
                      <th className="px-2 py-2 text-right">Cant.</th>
                      <th className="px-2 py-2 text-right">Costo</th>
                      <th className="px-2 py-2 text-right">Desc.%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {draft.lines.map((line, idx) => {
                      const ls = lineStates[idx];
                      if (!ls) return null;
                      const st = STATUS_LABEL[line.matchStatus];
                      return (
                        <tr key={idx} className={ls.include ? '' : 'opacity-50'}>
                          <td className="px-2 py-2 align-top">
                            <input
                              type="checkbox"
                              checked={ls.include}
                              onChange={(e) => patchLine(idx, { include: e.target.checked })}
                              className="mt-1"
                            />
                          </td>
                          <td className="px-2 py-2 align-top">
                            <div className="font-medium text-slate-100">{line.description || '—'}</div>
                            <div className="text-xs text-slate-500">
                              {line.supplierCode ? `Cód: ${line.supplierCode}` : 'sin código'} ·{' '}
                              <span className={`rounded px-1 ${st.cls}`}>{st.text}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2 align-top">
                            {ls.product ? (
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-medium text-slate-100">{ls.product.name}</div>
                                  <div className="text-xs text-slate-500">{ls.product.code}</div>
                                </div>
                                <button
                                  onClick={() => patchLine(idx, { product: null })}
                                  className="text-xs text-indigo-400 hover:underline"
                                >
                                  cambiar
                                </button>
                              </div>
                            ) : (
                              <div className="relative">
                                <div className="flex items-center gap-1 rounded border border-slate-600 bg-slate-900 text-slate-100 px-2 py-1">
                                  <Search className="h-3.5 w-3.5 text-slate-500" />
                                  <input
                                    value={ls.search}
                                    onChange={(e) => searchProduct(idx, e.target.value)}
                                    placeholder="Buscar producto…"
                                    className="w-full text-sm focus:outline-none"
                                  />
                                  {ls.searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />}
                                </div>
                                {ls.results.length > 0 && (
                                  <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded border border-slate-700 bg-slate-800 shadow-lg">
                                    {ls.results.map((r) => (
                                      <button
                                        key={r.id}
                                        onClick={() => pickProduct(idx, r)}
                                        className="block w-full px-2 py-1.5 text-left text-sm hover:bg-slate-700"
                                      >
                                        <span className="text-slate-500">{r.code}</span> {r.name}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right align-top">
                            <input
                              type="number"
                              value={ls.quantity}
                              onChange={(e) => patchLine(idx, { quantity: parseFloat(e.target.value) || 0 })}
                              className="w-16 rounded border border-slate-600 bg-slate-900 text-slate-100 px-1 py-0.5 text-right"
                            />
                          </td>
                          <td className="px-2 py-2 text-right align-top">
                            <input
                              type="number"
                              value={ls.unitCost}
                              onChange={(e) => patchLine(idx, { unitCost: parseFloat(e.target.value) || 0 })}
                              className="w-20 rounded border border-slate-600 bg-slate-900 text-slate-100 px-1 py-0.5 text-right"
                            />
                          </td>
                          <td className="px-2 py-2 text-right align-top">
                            <input
                              type="number"
                              value={ls.discountPct}
                              onChange={(e) => patchLine(idx, { discountPct: parseFloat(e.target.value) || 0 })}
                              className="w-14 rounded border border-slate-600 bg-slate-900 text-slate-100 px-1 py-0.5 text-right"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Semáforo de cuadre */}
              {reconciles != null && (
                <div
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                    reconciles ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-300'
                  }`}
                >
                  {reconciles ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  Subtotal calculado: {n2(calcSubtotal)} · Subtotal factura: {reconBase != null ? n2(reconBase) : '—'}
                  {reconciles ? ' — cuadra' : ' — NO cuadra, revisa las líneas'}
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  <AlertTriangle className="h-4 w-4" /> {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {draft && (
          <div className="flex items-center justify-between border-t border-slate-700 px-5 py-3">
            <div className="text-xs text-slate-400">
              {includedCount} línea(s) a cargar
              {unresolved > 0 && <span className="text-red-400"> · {unresolved} sin producto</span>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDraft(null)} className="rounded-lg border px-4 py-2 text-sm text-slate-300 hover:bg-slate-900/50">
                Volver
              </button>
              <button
                onClick={apply}
                disabled={includedCount === 0}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Cargar {includedCount} al formulario
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
