'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Package, Loader2 } from 'lucide-react';
import Toggle from '@/components/toggle';
import ProductNameSuggest from '@/components/product-name-suggest';

interface Category { id: string; name: string; children: { id: string; name: string }[]; }
interface Brand { id: string; name: string; }
interface Supplier { id: string; name: string; }

const IVA_OPTIONS = [
  { value: 'EXEMPT', label: 'Exento (0%)' },
  { value: 'REDUCED', label: 'Reducido (8%)' },
  { value: 'GENERAL', label: 'General (16%)' },
  { value: 'SPECIAL', label: 'Especial (31%)' },
];
const IVA_MULTIPLIERS: Record<string, number> = { EXEMPT: 1, REDUCED: 1.08, GENERAL: 1.16, SPECIAL: 1.31 };

const defaultForm = {
  code: '', barcode: '', supplierRef: '', otherCode: '', name: '', description: '',
  categoryId: '', brandId: '', supplierId: '',
  purchaseUnit: 'UNIT', saleUnit: 'UNIT', conversionFactor: 1,
  costUsd: '0', manualCost: false, bregaApplies: true,
  manualPrice: false, priceDetal: '0', priceMayor: '0',
  gananciaPct: '0', gananciaMayorPct: '0',
  ivaType: 'GENERAL', minStock: 0, isActive: true, saleBlocked: false, isService: false,
  showInStore: false, storeFeatured: false,
};

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  productId?: string | null;
  /** Sugerencia de proveedor por defecto al crear (ej. el proveedor de la compra) */
  defaultSupplierId?: string | null;
  onClose: () => void;
  onSaved: (product: any) => void;
}

export default function ProductFormModal({ open, mode, productId, defaultSupplierId, onClose, onSaved }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [exchangeRate, setExchangeRate] = useState(0);
  const [bregaGlobalPct, setBregaGlobalPct] = useState(0);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error'; text: string } | null>(null);

  // ── Precios de dos vías (ganancia ↔ precio final), como la ficha del articulo ──
  const [priceGananciaPct, setPriceGananciaPct] = useState(0);
  const [priceGananciaMayorPct, setPriceGananciaMayorPct] = useState(0);
  const [priceFinalDetal, setPriceFinalDetal] = useState(0);
  const [priceFinalMayor, setPriceFinalMayor] = useState(0);
  // Borradores de texto (evitan que el punto borre el campo mientras se escribe)
  const [detalGananciaStr, setDetalGananciaStr] = useState('0');
  const [detalPriceStr, setDetalPriceStr] = useState('0');
  const [mayorGananciaStr, setMayorGananciaStr] = useState('0');
  const [mayorPriceStr, setMayorPriceStr] = useState('0');

  const parseNum = (v: string | number) => {
    const n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };
  const sanitizeDecimal = (v: string) => v.replace(/[^0-9.,]/g, '');

  // Siembra los estados de precios (ganancia + precio final + borradores) a partir de
  // un costo/ganancias/IVA/brecha dados. brechaGlobal se pasa explicito por si aun no esta en estado.
  const seedPrices = useCallback((opts: {
    cost: number; ivaType: string; bregaApplies: boolean; brechaGlobal: number;
    gananciaPct: number; gananciaMayorPct: number;
    manualPrice?: boolean; priceDetal?: number; priceMayor?: number;
  }) => {
    const base = opts.cost * (opts.bregaApplies ? (1 + opts.brechaGlobal / 100) : 1) * (IVA_MULTIPLIERS[opts.ivaType] || 1.16);
    setPriceGananciaPct(opts.gananciaPct);
    setPriceGananciaMayorPct(opts.gananciaMayorPct);
    setDetalGananciaStr(opts.gananciaPct.toFixed(2));
    setMayorGananciaStr(opts.gananciaMayorPct.toFixed(2));
    const pd = opts.manualPrice && opts.priceDetal != null ? opts.priceDetal : base * (1 + opts.gananciaPct / 100);
    const pm = opts.manualPrice && opts.priceMayor != null ? opts.priceMayor : base * (1 + opts.gananciaMayorPct / 100);
    setPriceFinalDetal(pd);
    setPriceFinalMayor(pm);
    setDetalPriceStr(pd.toFixed(2));
    setMayorPriceStr(pm.toFixed(2));
  }, []);

  const fetchMeta = useCallback(async () => {
    const [catRes, brandRes, supRes, configRes, rateRes] = await Promise.all([
      fetch('/api/proxy/categories'),
      fetch('/api/proxy/brands'),
      fetch('/api/proxy/suppliers'),
      fetch('/api/proxy/config'),
      fetch('/api/proxy/exchange-rate/today'),
    ]);
    if (catRes.ok) setCategories(await catRes.json());
    if (brandRes.ok) setBrands(await brandRes.json());
    if (supRes.ok) setSuppliers(await supRes.json());
    let defGanancia = 0, defGananciaMayor = 0, brechaGlobal = 0;
    if (configRes.ok) {
      const cfg = await configRes.json();
      brechaGlobal = cfg.bregaGlobalPct || 0;
      setBregaGlobalPct(brechaGlobal);
      defGanancia = cfg.defaultGananciaPct || 0;
      defGananciaMayor = cfg.defaultGananciaMayorPct || 0;
    }
    if (rateRes.ok) {
      const text = await rateRes.text();
      if (text) { try { const rate = JSON.parse(text); setExchangeRate(rate.rate || 0); } catch {} }
    }
    return { defGanancia, defGananciaMayor, brechaGlobal };
  }, []);

  // Cargar meta + (editar) producto, o (crear) limpiar al abrir
  useEffect(() => {
    if (!open) return;
    setMessage(null);
    setLoading(true);
    (async () => {
      const { defGanancia, defGananciaMayor, brechaGlobal } = await fetchMeta();
      if (mode === 'edit' && productId) {
        const res = await fetch(`/api/proxy/products/${productId}`);
        if (res.ok) {
          const p = await res.json();
          setForm({
            code: p.code || '', barcode: p.barcode || '', supplierRef: p.supplierRef || '',
            otherCode: p.otherCode || '',
            name: p.name || '', description: p.description || '',
            categoryId: p.categoryId || '', brandId: p.brandId || '', supplierId: p.supplierId || '',
            purchaseUnit: p.purchaseUnit || 'UNIT', saleUnit: p.saleUnit || 'UNIT',
            conversionFactor: p.conversionFactor ?? 1,
            costUsd: String(p.costUsd ?? 0), manualCost: !!p.manualCost, bregaApplies: p.bregaApplies !== false,
            manualPrice: !!p.manualPrice,
            priceDetal: String(p.priceDetal ?? 0), priceMayor: String(p.priceMayor ?? 0),
            gananciaPct: String(p.gananciaPct ?? 0), gananciaMayorPct: String(p.gananciaMayorPct ?? 0),
            ivaType: p.ivaType || 'GENERAL', minStock: p.minStock ?? 0,
            isActive: p.isActive !== false, saleBlocked: !!p.saleBlocked, isService: !!p.isService,
            showInStore: !!p.showInStore, storeFeatured: !!p.storeFeatured,
          });
          seedPrices({
            cost: Number(p.costUsd ?? 0), ivaType: p.ivaType || 'GENERAL',
            bregaApplies: p.bregaApplies !== false, brechaGlobal,
            gananciaPct: Number(p.gananciaPct ?? 0), gananciaMayorPct: Number(p.gananciaMayorPct ?? 0),
            manualPrice: !!p.manualPrice, priceDetal: Number(p.priceDetal ?? 0), priceMayor: Number(p.priceMayor ?? 0),
          });
        }
      } else {
        setForm({
          ...defaultForm,
          gananciaPct: String(defGanancia),
          gananciaMayorPct: String(defGananciaMayor),
          supplierId: defaultSupplierId || '',
        });
        seedPrices({
          cost: 0, ivaType: 'GENERAL', bregaApplies: true, brechaGlobal,
          gananciaPct: defGanancia, gananciaMayorPct: defGananciaMayor,
        });
      }
      setLoading(false);
    })();
  }, [open, mode, productId, defaultSupplierId, fetchMeta, seedPrices]);

  // ── Handlers de precios de dos vias (idénticos a la ficha del articulo) ──
  function handleDetalGananciaChange(raw: string) {
    setDetalGananciaStr(sanitizeDecimal(raw));
    const value = parseNum(raw);
    setPriceGananciaPct(value);
    const cost = parseNum(form.costUsd);
    const brechaM = form.bregaApplies ? (1 + bregaGlobalPct / 100) : 1;
    const ivaM = IVA_MULTIPLIERS[form.ivaType] || 1.16;
    const price = cost * brechaM * (1 + value / 100) * ivaM;
    setPriceFinalDetal(price);
    setDetalPriceStr(price.toFixed(2));
  }
  function handleDetalPriceChange(raw: string) {
    setDetalPriceStr(sanitizeDecimal(raw));
    const value = parseNum(raw);
    setPriceFinalDetal(value);
    const cost = parseNum(form.costUsd);
    const brechaM = form.bregaApplies ? (1 + bregaGlobalPct / 100) : 1;
    const ivaM = IVA_MULTIPLIERS[form.ivaType] || 1.16;
    const base = cost * brechaM * ivaM;
    if (base > 0) {
      const g = ((value / base) - 1) * 100;
      setPriceGananciaPct(g);
      setDetalGananciaStr(g.toFixed(2));
    }
  }
  function handleMayorGananciaChange(raw: string) {
    setMayorGananciaStr(sanitizeDecimal(raw));
    const value = parseNum(raw);
    setPriceGananciaMayorPct(value);
    const cost = parseNum(form.costUsd);
    const brechaM = form.bregaApplies ? (1 + bregaGlobalPct / 100) : 1;
    const ivaM = IVA_MULTIPLIERS[form.ivaType] || 1.16;
    const price = cost * brechaM * (1 + value / 100) * ivaM;
    setPriceFinalMayor(price);
    setMayorPriceStr(price.toFixed(2));
  }
  function handleMayorPriceChange(raw: string) {
    setMayorPriceStr(sanitizeDecimal(raw));
    const value = parseNum(raw);
    setPriceFinalMayor(value);
    const cost = parseNum(form.costUsd);
    const brechaM = form.bregaApplies ? (1 + bregaGlobalPct / 100) : 1;
    const ivaM = IVA_MULTIPLIERS[form.ivaType] || 1.16;
    const base = cost * brechaM * ivaM;
    if (base > 0) {
      const g = ((value / base) - 1) * 100;
      setPriceGananciaMayorPct(g);
      setMayorGananciaStr(g.toFixed(2));
    }
  }
  function recomputeFinalsFromGanancia(cost: number, brechaApplies: boolean, ivaType: string) {
    const base = cost * (brechaApplies ? (1 + bregaGlobalPct / 100) : 1) * (IVA_MULTIPLIERS[ivaType] || 1.16);
    const pd = base * (1 + priceGananciaPct / 100);
    setPriceFinalDetal(pd);
    setDetalPriceStr(pd.toFixed(2));
    const pm = base * (1 + priceGananciaMayorPct / 100);
    setPriceFinalMayor(pm);
    setMayorPriceStr(pm.toFixed(2));
  }
  function handleCostChange(raw: string) {
    const clean = sanitizeDecimal(raw);
    setForm(f => ({ ...f, costUsd: clean }));
    if (!form.manualPrice) recomputeFinalsFromGanancia(parseNum(clean), form.bregaApplies, form.ivaType);
  }
  function handleIvaChange(val: string) {
    setForm(f => ({ ...f, ivaType: val }));
    if (!form.manualPrice) recomputeFinalsFromGanancia(parseNum(form.costUsd), form.bregaApplies, val);
  }
  function handleBrechaToggle(checked: boolean) {
    setForm(f => ({ ...f, bregaApplies: checked }));
    if (!form.manualPrice) recomputeFinalsFromGanancia(parseNum(form.costUsd), checked, form.ivaType);
  }
  function handleManualPriceToggle(checked: boolean) {
    setForm(f => {
      const next = { ...f, manualPrice: checked };
      if (checked) {
        next.priceDetal = (priceFinalDetal || parseNum(f.priceDetal) || 0).toFixed(2);
        next.priceMayor = (priceFinalMayor || parseNum(f.priceMayor) || 0).toFixed(2);
      }
      return next;
    });
    if (!checked) recomputeFinalsFromGanancia(parseNum(form.costUsd), form.bregaApplies, form.ivaType);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMessage(null);
    try {
      const body: any = {
        name: form.name,
        barcode: form.barcode || undefined,
        supplierRef: form.supplierRef || undefined,
        otherCode: form.otherCode || undefined,
        description: form.description || undefined,
        categoryId: form.categoryId || undefined,
        brandId: form.brandId || undefined,
        supplierId: form.supplierId || undefined,
        purchaseUnit: form.purchaseUnit,
        saleUnit: form.saleUnit,
        conversionFactor: Number(form.conversionFactor),
        costUsd: parseNum(form.costUsd),
        manualCost: form.manualCost,
        bregaApplies: form.bregaApplies,
        manualPrice: form.manualPrice,
        gananciaPct: Number(priceGananciaPct.toFixed(2)),
        gananciaMayorPct: Number(priceGananciaMayorPct.toFixed(2)),
        ivaType: form.ivaType,
        minStock: Number(form.minStock),
        isActive: form.isActive,
        saleBlocked: form.saleBlocked,
        isService: form.isService,
        showInStore: form.showInStore,
        storeFeatured: form.storeFeatured,
      };
      // En precio manual se manda el precio final directo; si no, lo calcula el backend desde la ganancia.
      if (form.manualPrice) {
        body.priceDetal = parseNum(form.priceDetal);
        body.priceMayor = parseNum(form.priceMayor);
      }
      // El codigo solo se envia al crear (en edicion es el identificador y no se cambia aqui)
      if (mode === 'create' && form.code) body.code = form.code;

      const url = mode === 'edit' && productId ? `/api/proxy/products/${productId}` : '/api/proxy/products';
      const res = await fetch(url, {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Error'); }
      const saved = await res.json();
      onSaved(saved);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al guardar' });
    } finally { setSaving(false); }
  }

  // Al elegir un articulo como plantilla: copia el nombre + atributos (categoria, IVA,
  // ganancias, brecha, unidades). NO copia codigos/costo/existencia (son propios del articulo).
  const applyTemplate = (p: any) => {
    const gDetal = p.gananciaPct != null ? Number(p.gananciaPct) : priceGananciaPct;
    const gMayor = p.gananciaMayorPct != null ? Number(p.gananciaMayorPct) : priceGananciaMayorPct;
    const ivaType = p.ivaType || form.ivaType;
    const brechaApplies = p.bregaApplies != null ? !!p.bregaApplies : form.bregaApplies;
    setForm(f => ({
      ...f,
      name: p.name || f.name,
      categoryId: p.categoryId || f.categoryId,
      ivaType,
      gananciaPct: String(gDetal),
      gananciaMayorPct: String(gMayor),
      bregaApplies: brechaApplies,
      purchaseUnit: p.purchaseUnit || f.purchaseUnit,
      saleUnit: p.saleUnit || f.saleUnit,
      conversionFactor: p.conversionFactor != null ? p.conversionFactor : f.conversionFactor,
    }));
    seedPrices({
      cost: parseNum(form.costUsd), ivaType, bregaApplies: brechaApplies, brechaGlobal: bregaGlobalPct,
      gananciaPct: gDetal, gananciaMayorPct: gMayor,
    });
  };

  const allCategories: { id: string; name: string; isChild: boolean }[] = [];
  categories.forEach(cat => {
    allCategories.push({ id: cat.id, name: cat.name, isChild: false });
    cat.children?.forEach(child => allCategories.push({ id: child.id, name: `  ${child.name}`, isChild: true }));
  });

  const costUsd = parseNum(form.costUsd);
  const brecha = form.bregaApplies ? bregaGlobalPct : 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-3xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20"><Package className="text-green-400" size={18} /></div>
            <h2 className="text-lg font-semibold text-white">{mode === 'edit' ? 'Editar producto' : 'Nuevo producto'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-green-400" size={28} /></div>
        ) : (
          <form onSubmit={handleSave} className="p-5 space-y-5 overflow-y-auto">
            {message && <div className="p-3 rounded-lg border text-sm bg-red-500/10 border-red-500/20 text-red-400">{message.text}</div>}

            {/* Datos basicos */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Datos basicos</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Codigo</label>
                  <input type="text" value={form.code} disabled={mode === 'edit'} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className="input-field !py-2 text-sm disabled:opacity-60" placeholder="Auto (segun categoria)" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Barcode</label>
                  <input type="text" value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} className="input-field !py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Ref. Proveedor</label>
                  <input type="text" value={form.supplierRef} onChange={e => setForm(f => ({ ...f, supplierRef: e.target.value }))} className="input-field !py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Otro codigo</label>
                  <input type="text" value={form.otherCode} onChange={e => setForm(f => ({ ...f, otherCode: e.target.value }))} className="input-field !py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Nombre *</label>
                  <ProductNameSuggest
                    value={form.name}
                    onChange={v => setForm(f => ({ ...f, name: v }))}
                    onPickTemplate={applyTemplate}
                    enabled={mode === 'create'}
                    className="input-field !py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Descripcion</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-field !py-2 text-sm" rows={2} />
                </div>
              </div>
            </div>

            {/* Clasificacion */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Clasificacion</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Categoria</label>
                  <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} className="input-field !py-2 text-sm">
                    <option value="">Sin categoria</option>
                    {allCategories.map(c => <option key={c.id} value={c.id}>{c.isChild ? `└ ${c.name.trim()}` : c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Marca</label>
                  <select value={form.brandId} onChange={e => setForm(f => ({ ...f, brandId: e.target.value }))} className="input-field !py-2 text-sm">
                    <option value="">Sin marca</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Proveedor principal</label>
                  <select value={form.supplierId} onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))} className="input-field !py-2 text-sm">
                    <option value="">Sin proveedor</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Unidades */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Unidades</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Unidad de compra</label>
                  <input type="text" value={form.purchaseUnit} onChange={e => setForm(f => ({ ...f, purchaseUnit: e.target.value }))} className="input-field !py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Unidad de venta</label>
                  <input type="text" value={form.saleUnit} onChange={e => setForm(f => ({ ...f, saleUnit: e.target.value }))} className="input-field !py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Factor conversion</label>
                  <input type="number" step="0.001" value={form.conversionFactor} onChange={e => setForm(f => ({ ...f, conversionFactor: Number(e.target.value) }))} className="input-field !py-2 text-sm" />
                </div>
              </div>
            </div>

            {/* Precios (dos vias: ganancia ↔ precio final, + costo/precio manual) */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Precios</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Costo USD</label>
                  <input type="text" inputMode="decimal" value={form.costUsd} onChange={e => handleCostChange(e.target.value)} className="input-field !py-2 text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">IVA</label>
                  <select value={form.ivaType} onChange={e => handleIvaChange(e.target.value)} className="input-field !py-2 text-sm">
                    {IVA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="flex items-end pb-2">
                  <Toggle checked={form.bregaApplies} onChange={handleBrechaToggle} disabled={form.manualPrice} label={`Brecha (${bregaGlobalPct}%)`} />
                </div>
                <div className="flex items-end pb-2">
                  <Toggle checked={form.manualCost} onChange={v => setForm(f => ({ ...f, manualCost: v }))} label="Costo manual 🔒" />
                </div>
              </div>
              <div className="flex items-center gap-6 mt-3">
                <Toggle checked={form.manualPrice} onChange={handleManualPriceToggle} color="amber" label="Precio manual (escribo el precio final)" />
              </div>
              {form.manualCost && (
                <p className="mt-2 text-xs text-emerald-400/90">Costo congelado: las compras y reemplazos no lo actualizan.</p>
              )}

              {form.manualPrice ? (
                <>
                  <div className="mt-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <p className="text-sm text-amber-400">Precio manual activo: escribe el precio final (con IVA). No se calcula desde la ganancia.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block text-xs font-medium text-amber-400 mb-1">Precio Detal (final c/IVA)</label>
                      <input type="text" inputMode="decimal" value={form.priceDetal} onChange={e => setForm(f => ({ ...f, priceDetal: sanitizeDecimal(e.target.value) }))} className="input-field !py-2 text-sm font-mono !border-amber-500/30 focus:!border-amber-500" />
                      {exchangeRate > 0 && <p className="text-xs text-slate-500 mt-1 font-mono">= Bs {(parseNum(form.priceDetal) * exchangeRate).toFixed(2)}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-amber-400 mb-1">Precio Mayor (final c/IVA)</label>
                      <input type="text" inputMode="decimal" value={form.priceMayor} onChange={e => setForm(f => ({ ...f, priceMayor: sanitizeDecimal(e.target.value) }))} className="input-field !py-2 text-sm font-mono !border-amber-500/30 focus:!border-amber-500" />
                      {exchangeRate > 0 && <p className="text-xs text-slate-500 mt-1 font-mono">= Bs {(parseNum(form.priceMayor) * exchangeRate).toFixed(2)}</p>}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Detal */}
                  <div className="mt-4">
                    <h4 className="text-xs font-semibold text-green-400 mb-2 uppercase tracking-wider">Precio Detal</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Ganancia detal (%)</label>
                        <input type="text" inputMode="decimal" value={detalGananciaStr} onChange={e => handleDetalGananciaChange(e.target.value)} className="input-field !py-2 text-sm font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Precio final USD</label>
                        <input type="text" inputMode="decimal" value={detalPriceStr} onChange={e => handleDetalPriceChange(e.target.value)} className="input-field !py-2 text-sm font-mono" />
                      </div>
                    </div>
                    {exchangeRate > 0 && <p className="text-xs text-slate-500 mt-1 font-mono">= Bs {(priceFinalDetal * exchangeRate).toFixed(2)}</p>}
                  </div>
                  {/* Mayor */}
                  <div className="mt-4">
                    <h4 className="text-xs font-semibold text-blue-400 mb-2 uppercase tracking-wider">Precio Mayor</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Ganancia mayor (%)</label>
                        <input type="text" inputMode="decimal" value={mayorGananciaStr} onChange={e => handleMayorGananciaChange(e.target.value)} className="input-field !py-2 text-sm font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Precio final USD</label>
                        <input type="text" inputMode="decimal" value={mayorPriceStr} onChange={e => handleMayorPriceChange(e.target.value)} className="input-field !py-2 text-sm font-mono" />
                      </div>
                    </div>
                    {exchangeRate > 0 && <p className="text-xs text-slate-500 mt-1 font-mono">= Bs {(priceFinalMayor * exchangeRate).toFixed(2)}</p>}
                  </div>
                  {/* Formula */}
                  <div className="mt-3 p-3 rounded-lg bg-slate-800/40 border border-slate-700/30 text-[11px] font-mono text-slate-500 space-y-0.5">
                    <p>Formula: costo x (1 + brecha%) x (1 + ganancia%) x (1 + IVA%)</p>
                    <p>Detal: ${costUsd.toFixed(2)} x {(1 + brecha / 100).toFixed(2)} x {(1 + priceGananciaPct / 100).toFixed(4)} x {(IVA_MULTIPLIERS[form.ivaType] || 1.16).toFixed(2)} = ${priceFinalDetal.toFixed(2)}</p>
                    <p>Mayor: ${costUsd.toFixed(2)} x {(1 + brecha / 100).toFixed(2)} x {(1 + priceGananciaMayorPct / 100).toFixed(4)} x {(IVA_MULTIPLIERS[form.ivaType] || 1.16).toFixed(2)} = ${priceFinalMayor.toFixed(2)}</p>
                  </div>
                </>
              )}
            </div>

            {/* Inventario */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Inventario</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Stock minimo</label>
                  <input type="number" step="1" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: Number(e.target.value) }))} className="input-field !py-2 text-sm" />
                </div>
                <div className="flex items-center gap-6 pb-1">
                  <Toggle checked={form.isActive} onChange={v => setForm(f => ({ ...f, isActive: v }))} label="Producto activo" />
                  <Toggle checked={form.isService} onChange={v => setForm(f => ({ ...f, isService: v }))} label="Articulo de servicio" color="amber" />
                </div>
                <div className="flex items-center gap-3 pb-1">
                  <Toggle checked={!form.saleBlocked} onChange={v => setForm(f => ({ ...f, saleBlocked: !v }))} label="Activo para la venta" />
                  {form.saleBlocked && <span className="text-xs text-red-400/90">Bloqueado: se ve en el POS pero no se puede facturar</span>}
                </div>
                <div className="flex items-center gap-6 pb-1">
                  <Toggle checked={form.showInStore} onChange={v => setForm(f => ({ ...f, showInStore: v }))} label="Mostrar en tienda online" color="blue" />
                  <Toggle checked={form.storeFeatured} onChange={v => setForm(f => ({ ...f, storeFeatured: v }))} label="Destacado en tienda" color="blue" disabled={!form.showInStore} />
                </div>
                {form.isService && <p className="text-xs text-amber-400/80">Los articulos de servicio no generan movimiento de inventario</p>}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
              <button type="button" onClick={onClose} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
                {saving && <Loader2 className="animate-spin" size={16} />}
                {mode === 'edit' ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
