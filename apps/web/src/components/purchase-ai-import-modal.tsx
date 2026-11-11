'use client';

import { useState, useRef, useEffect, Fragment } from 'react';
import { Loader2, Sparkles, X, Upload, Check, AlertTriangle, Search, Plus } from 'lucide-react';

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
  /** Formulario de "crear producto" abierto para esta línea. */
  createForm: NewProductForm | null;
  creating: boolean;
  createError: string;
  /** El producto de la línea se creó desde esta pantalla. */
  created: boolean;
}

// Datos para crear en el catálogo un artículo que no existe (línea "Nuevo").
interface NewProductForm {
  name: string;
  supplierRef: string;
  costUsd: string;
  categoryId: string;
  brandId: string;
  ivaType: string;
}

interface CategoryNode { id: string; name: string; children?: { id: string; name: string }[] }
interface BrandOption { id: string; name: string }

const IVA_OPTIONS = [
  { value: 'EXEMPT', label: 'Exento (0%)' },
  { value: 'REDUCED', label: 'Reducido (8%)' },
  { value: 'GENERAL', label: 'General (16%)' },
  { value: 'SPECIAL', label: 'Especial (31%)' },
];

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

  // Datos para crear productos nuevos (se cargan una vez, al llegar a la revisión).
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [todayRate, setTodayRate] = useState(0);
  const [metaLoaded, setMetaLoaded] = useState(false);
  // Últimos valores elegidos: se proponen en el siguiente producto y en "crear todos".
  const [lastCategoryId, setLastCategoryId] = useState('');
  const [lastIvaType, setLastIvaType] = useState('GENERAL');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkBrandId, setBulkBrandId] = useState('');
  const [bulkIvaType, setBulkIvaType] = useState('GENERAL');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');

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
      setBulkOpen(false);
      setBulkMessage('');
    }
  }, [open]);

  useEffect(() => {
    if (!draft || metaLoaded) return;
    setMetaLoaded(true);
    (async () => {
      try {
        const [catRes, brandRes, rateRes] = await Promise.all([
          fetch('/api/proxy/categories'),
          fetch('/api/proxy/brands'),
          fetch('/api/proxy/exchange-rate/today'),
        ]);
        if (catRes.ok) {
          const tree: CategoryNode[] = await catRes.json();
          const flat: { id: string; name: string }[] = [];
          tree.forEach((c) => {
            flat.push({ id: c.id, name: c.name });
            c.children?.forEach((ch) => flat.push({ id: ch.id, name: `${c.name} › ${ch.name}` }));
          });
          setCategories(flat);
        }
        if (brandRes.ok) setBrands(await brandRes.json());
        if (rateRes.ok) {
          const text = await rateRes.text();
          if (text) {
            try { setTodayRate(JSON.parse(text).rate || 0); } catch { /* sin tasa */ }
          }
        }
      } catch {
        /* el formulario mostrará listas vacías */
      }
    })();
  }, [draft, metaLoaded]);

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
            createForm: null,
            creating: false,
            createError: '',
            created: false,
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

  // ---- Crear productos nuevos -------------------------------------------------

  // Tasa para pasar el costo de la factura a USD: la de la factura o, si no trae, la de hoy.
  const invoiceIsBs = draft?.header.currency === 'BS';
  const conversionRate = invoiceIsBs ? draft?.header.exchangeRate || todayRate : 1;

  // Costo USD propuesto para el producto: costo unitario neto del descuento de línea.
  function suggestedCostUsd(ls: LineState): string {
    if (!conversionRate) return '0';
    const net = ls.unitCost * (1 - ls.discountPct / 100);
    return String(Math.round((net / conversionRate) * 10000) / 10000);
  }

  function openCreate(idx: number) {
    const ls = lineStates[idx];
    if (!ls) return;
    patchLine(idx, {
      createError: '',
      createForm: {
        name: ls.description.trim(),
        supplierRef: ls.supplierCode?.trim() || '',
        costUsd: suggestedCostUsd(ls),
        categoryId: lastCategoryId,
        brandId: '',
        ivaType: lastIvaType,
      },
    });
  }

  function patchCreateForm(idx: number, patch: Partial<NewProductForm>) {
    setLineStates((prev) =>
      prev.map((ls, i) => (i === idx && ls.createForm ? { ...ls, createForm: { ...ls.createForm, ...patch } } : ls)),
    );
  }

  // POST /products: el código sale de la categoría y los precios de la ganancia por defecto de la empresa.
  async function postProduct(form: NewProductForm): Promise<DraftProduct> {
    const cost = parseFloat(form.costUsd.replace(',', '.'));
    const res = await fetch('/api/proxy/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        supplierRef: form.supplierRef.trim() || null,
        categoryId: form.categoryId,
        brandId: form.brandId || null,
        supplierId: draft?.supplier?.id || supplierId || null,
        ivaType: form.ivaType,
        costUsd: isNaN(cost) || cost < 0 ? 0 : cost,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
      throw new Error(msg || `Error ${res.status}`);
    }
    return {
      id: data.id,
      code: data.code,
      name: data.name,
      supplierRef: data.supplierRef ?? null,
      costUsd: data.costUsd ?? 0,
      priceDetal: data.priceDetal ?? 0,
      priceMayor: data.priceMayor ?? 0,
      ivaType: data.ivaType ?? form.ivaType,
      isService: data.isService ?? false,
    };
  }

  function validateForm(form: NewProductForm): string {
    if (form.name.trim().length < 2) return 'El nombre debe tener al menos 2 caracteres.';
    if (!form.categoryId) return 'Elige una categoría (de ella sale el código del producto).';
    return '';
  }

  async function createForLine(idx: number) {
    const form = lineStates[idx]?.createForm;
    if (!form) return;
    const invalid = validateForm(form);
    if (invalid) return patchLine(idx, { createError: invalid });
    patchLine(idx, { creating: true, createError: '' });
    try {
      const product = await postProduct(form);
      setLastCategoryId(form.categoryId);
      setLastIvaType(form.ivaType);
      patchLine(idx, { product, include: true, created: true, createForm: null, creating: false });
    } catch (e) {
      patchLine(idx, { creating: false, createError: (e as Error).message || 'No se pudo crear el producto.' });
    }
  }

  // Líneas sin producto que se pueden crear en lote.
  const pendingNewIdx = lineStates
    .map((ls, i) => (!ls.product && ls.description.trim().length >= 2 ? i : -1))
    .filter((i) => i >= 0);

  function openBulk() {
    setBulkCategoryId(lastCategoryId);
    setBulkIvaType(lastIvaType);
    setBulkBrandId('');
    setBulkMessage('');
    setBulkOpen(true);
  }

  async function createAllNew() {
    if (!bulkCategoryId) return setBulkMessage('Elige una categoría.');
    setBulkBusy(true);
    setBulkMessage('');
    let ok = 0;
    let failed = 0;
    // En serie: cada código sale del correlativo de la categoría.
    for (const idx of pendingNewIdx) {
      const ls = lineStates[idx];
      const form: NewProductForm = {
        name: ls.description.trim(),
        supplierRef: ls.supplierCode?.trim() || '',
        costUsd: suggestedCostUsd(ls),
        categoryId: bulkCategoryId,
        brandId: bulkBrandId,
        ivaType: bulkIvaType,
      };
      try {
        const product = await postProduct(form);
        patchLine(idx, { product, include: true, created: true, createForm: null, createError: '' });
        ok++;
      } catch (e) {
        patchLine(idx, { createError: (e as Error).message || 'No se pudo crear.' });
        failed++;
      }
    }
    setLastCategoryId(bulkCategoryId);
    setLastIvaType(bulkIvaType);
    setBulkBusy(false);
    if (failed === 0) {
      setBulkOpen(false);
      setBulkMessage(`${ok} producto(s) creados.`);
    } else {
      setBulkMessage(`${ok} creados, ${failed} con error (ver las líneas en rojo).`);
    }
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
                {pendingNewIdx.length > 0 && !bulkOpen && (
                  <button
                    onClick={openBulk}
                    className="ml-auto flex items-center gap-1 rounded bg-indigo-600/20 px-2 py-1 font-medium text-indigo-300 hover:bg-indigo-600/30"
                  >
                    <Plus className="h-3.5 w-3.5" /> Crear los {pendingNewIdx.length} sin producto
                  </button>
                )}
              </div>

              {bulkMessage && !bulkOpen && (
                <div className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-300">{bulkMessage}</div>
              )}

              {/* Crear en lote los artículos que no existen */}
              {bulkOpen && (
                <div className="space-y-3 rounded-lg border border-indigo-500/40 bg-indigo-500/5 p-3 text-sm">
                  <div className="font-medium text-white">
                    Crear {pendingNewIdx.length} producto(s) nuevos en el catálogo
                  </div>
                  <p className="text-xs text-slate-400">
                    Cada uno usa la descripción de la factura como nombre, el código del proveedor como Ref. proveedor y el
                    costo de la línea{invoiceIsBs ? ' convertido a USD' : ''}. El código sale de la categoría y los precios de la
                    ganancia por defecto de la empresa. Si un artículo necesita datos distintos, créalo por separado en su línea.
                  </p>
                  <div className="grid gap-2 md:grid-cols-3">
                    <select value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value)} className="rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-slate-100">
                      <option value="">Categoría *</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select value={bulkBrandId} onChange={(e) => setBulkBrandId(e.target.value)} className="rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-slate-100">
                      <option value="">Sin marca</option>
                      {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <select value={bulkIvaType} onChange={(e) => setBulkIvaType(e.target.value)} className="rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-slate-100">
                      {IVA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  {invoiceIsBs && !conversionRate && (
                    <div className="text-xs text-amber-300">No hay tasa en la factura ni tasa de hoy: los costos quedarán en 0.</div>
                  )}
                  {bulkMessage && <div className="text-xs text-red-300">{bulkMessage}</div>}
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setBulkOpen(false)} disabled={bulkBusy} className="rounded border border-slate-600 px-3 py-1.5 text-slate-300 hover:bg-slate-700">
                      Cancelar
                    </button>
                    <button
                      onClick={createAllNew}
                      disabled={bulkBusy}
                      className="flex items-center gap-1 rounded bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      {bulkBusy ? 'Creando…' : `Crear ${pendingNewIdx.length}`}
                    </button>
                  </div>
                </div>
              )}

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
                        <Fragment key={idx}>
                        <tr className={ls.include || ls.createForm ? '' : 'opacity-50'}>
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
                              {ls.created ? (
                                <span className="rounded bg-indigo-500/20 px-1 text-indigo-300">Creado</span>
                              ) : (
                                <span className={`rounded px-1 ${st.cls}`}>{st.text}</span>
                              )}
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
                                {!ls.createForm && (
                                  <button
                                    onClick={() => openCreate(idx)}
                                    className="mt-1 flex items-center gap-1 text-xs text-indigo-400 hover:underline"
                                  >
                                    <Plus className="h-3 w-3" /> Crear producto nuevo
                                  </button>
                                )}
                                {ls.createError && !ls.createForm && (
                                  <div className="mt-1 text-xs text-red-300">{ls.createError}</div>
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
                        {ls.createForm && (
                          <tr className="bg-indigo-500/5">
                            <td></td>
                            <td colSpan={5} className="px-2 pb-3 pt-1">
                              <div className="space-y-2 rounded-lg border border-indigo-500/40 p-3 text-sm">
                                <div className="text-xs font-medium uppercase text-indigo-300">Nuevo producto en el catálogo</div>
                                <div className="grid gap-2 md:grid-cols-6">
                                  <label className="md:col-span-3">
                                    <span className="mb-0.5 block text-xs text-slate-400">Nombre *</span>
                                    <input
                                      value={ls.createForm.name}
                                      onChange={(e) => patchCreateForm(idx, { name: e.target.value })}
                                      className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
                                    />
                                  </label>
                                  <label className="md:col-span-2">
                                    <span className="mb-0.5 block text-xs text-slate-400">Ref. proveedor</span>
                                    <input
                                      value={ls.createForm.supplierRef}
                                      onChange={(e) => patchCreateForm(idx, { supplierRef: e.target.value })}
                                      className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
                                    />
                                  </label>
                                  <label>
                                    <span className="mb-0.5 block text-xs text-slate-400">Costo USD</span>
                                    <input
                                      inputMode="decimal"
                                      value={ls.createForm.costUsd}
                                      onChange={(e) => patchCreateForm(idx, { costUsd: e.target.value })}
                                      className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-right text-slate-100"
                                    />
                                  </label>
                                  <label className="md:col-span-3">
                                    <span className="mb-0.5 block text-xs text-slate-400">Categoría *</span>
                                    <select
                                      value={ls.createForm.categoryId}
                                      onChange={(e) => patchCreateForm(idx, { categoryId: e.target.value })}
                                      className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
                                    >
                                      <option value="">Elegir…</option>
                                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                  </label>
                                  <label className="md:col-span-2">
                                    <span className="mb-0.5 block text-xs text-slate-400">Marca</span>
                                    <select
                                      value={ls.createForm.brandId}
                                      onChange={(e) => patchCreateForm(idx, { brandId: e.target.value })}
                                      className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
                                    >
                                      <option value="">Sin marca</option>
                                      {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                  </label>
                                  <label>
                                    <span className="mb-0.5 block text-xs text-slate-400">IVA</span>
                                    <select
                                      value={ls.createForm.ivaType}
                                      onChange={(e) => patchCreateForm(idx, { ivaType: e.target.value })}
                                      className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
                                    >
                                      {IVA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                  </label>
                                </div>
                                <p className="text-xs text-slate-500">
                                  El código sale de la categoría y los precios de la ganancia por defecto de la empresa.
                                  {invoiceIsBs && (conversionRate
                                    ? ` Costo convertido de Bs a USD con tasa ${n2(conversionRate)}.`
                                    : ' Sin tasa: escribe el costo en USD a mano.')}
                                </p>
                                {ls.createError && <div className="text-xs text-red-300">{ls.createError}</div>}
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => patchLine(idx, { createForm: null, createError: '' })}
                                    disabled={ls.creating}
                                    className="rounded border border-slate-600 px-3 py-1 text-slate-300 hover:bg-slate-700"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    onClick={() => createForLine(idx)}
                                    disabled={ls.creating}
                                    className="flex items-center gap-1 rounded bg-indigo-600 px-3 py-1 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                                  >
                                    {ls.creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                    Crear y asignar
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </Fragment>
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
