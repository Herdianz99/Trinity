'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Package, Loader2 } from 'lucide-react';

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
  code: '', barcode: '', supplierRef: '', name: '', description: '',
  categoryId: '', brandId: '', supplierId: '',
  purchaseUnit: 'UNIT', saleUnit: 'UNIT', conversionFactor: 1,
  costUsd: '0', bregaApplies: true, gananciaPct: '0', gananciaMayorPct: '0',
  ivaType: 'GENERAL', minStock: 0, isActive: true, isService: false,
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
    let defGanancia = 0, defGananciaMayor = 0;
    if (configRes.ok) {
      const cfg = await configRes.json();
      setBregaGlobalPct(cfg.bregaGlobalPct || 0);
      defGanancia = cfg.defaultGananciaPct || 0;
      defGananciaMayor = cfg.defaultGananciaMayorPct || 0;
    }
    if (rateRes.ok) {
      const text = await rateRes.text();
      if (text) { try { const rate = JSON.parse(text); setExchangeRate(rate.rate || 0); } catch {} }
    }
    return { defGanancia, defGananciaMayor };
  }, []);

  // Cargar meta + (editar) producto, o (crear) limpiar al abrir
  useEffect(() => {
    if (!open) return;
    setMessage(null);
    setLoading(true);
    (async () => {
      const { defGanancia, defGananciaMayor } = await fetchMeta();
      if (mode === 'edit' && productId) {
        const res = await fetch(`/api/proxy/products/${productId}`);
        if (res.ok) {
          const p = await res.json();
          setForm({
            code: p.code || '', barcode: p.barcode || '', supplierRef: p.supplierRef || '',
            name: p.name || '', description: p.description || '',
            categoryId: p.categoryId || '', brandId: p.brandId || '', supplierId: p.supplierId || '',
            purchaseUnit: p.purchaseUnit || 'UNIT', saleUnit: p.saleUnit || 'UNIT',
            conversionFactor: p.conversionFactor ?? 1,
            costUsd: String(p.costUsd ?? 0), bregaApplies: p.bregaApplies !== false,
            gananciaPct: String(p.gananciaPct ?? 0), gananciaMayorPct: String(p.gananciaMayorPct ?? 0),
            ivaType: p.ivaType || 'GENERAL', minStock: p.minStock ?? 0,
            isActive: p.isActive !== false, isService: !!p.isService,
            showInStore: !!p.showInStore, storeFeatured: !!p.storeFeatured,
          });
        }
      } else {
        setForm({
          ...defaultForm,
          gananciaPct: String(defGanancia),
          gananciaMayorPct: String(defGananciaMayor),
          supplierId: defaultSupplierId || '',
        });
      }
      setLoading(false);
    })();
  }, [open, mode, productId, defaultSupplierId, fetchMeta]);

  const parseNum = (v: string | number) => {
    const n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };
  const sanitizeDecimal = (v: string) => v.replace(/[^0-9.,]/g, '');

  function calcPreviewPrice(costUsd: number, gananciaPct: number, bregaApplies: boolean, ivaType: string) {
    const brecha = bregaApplies ? bregaGlobalPct : 0;
    return costUsd * (1 + brecha / 100) * (1 + gananciaPct / 100) * (IVA_MULTIPLIERS[ivaType] || 1.16);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMessage(null);
    try {
      const body: any = {
        name: form.name,
        barcode: form.barcode || undefined,
        supplierRef: form.supplierRef || undefined,
        description: form.description || undefined,
        categoryId: form.categoryId || undefined,
        brandId: form.brandId || undefined,
        supplierId: form.supplierId || undefined,
        purchaseUnit: form.purchaseUnit,
        saleUnit: form.saleUnit,
        conversionFactor: Number(form.conversionFactor),
        costUsd: parseNum(form.costUsd),
        bregaApplies: form.bregaApplies,
        gananciaPct: parseNum(form.gananciaPct),
        gananciaMayorPct: parseNum(form.gananciaMayorPct),
        ivaType: form.ivaType,
        minStock: Number(form.minStock),
        isActive: form.isActive,
        isService: form.isService,
        showInStore: form.showInStore,
        storeFeatured: form.storeFeatured,
      };
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

  const allCategories: { id: string; name: string; isChild: boolean }[] = [];
  categories.forEach(cat => {
    allCategories.push({ id: cat.id, name: cat.name, isChild: false });
    cat.children?.forEach(child => allCategories.push({ id: child.id, name: `  ${child.name}`, isChild: true }));
  });

  const previewDetal = calcPreviewPrice(parseNum(form.costUsd), parseNum(form.gananciaPct), form.bregaApplies, form.ivaType);
  const previewMayor = calcPreviewPrice(parseNum(form.costUsd), parseNum(form.gananciaMayorPct), form.bregaApplies, form.ivaType);

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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
              </div>
              <div className="grid grid-cols-1 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Nombre *</label>
                  <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field !py-2 text-sm" required />
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

            {/* Precios */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Precios</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">IVA</label>
                  <select value={form.ivaType} onChange={e => setForm(f => ({ ...f, ivaType: e.target.value }))} className="input-field !py-2 text-sm">
                    {IVA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none pb-2">
                    <input type="checkbox" checked={form.bregaApplies} onChange={e => setForm(f => ({ ...f, bregaApplies: e.target.checked }))} className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40" />
                    Aplica brecha ({bregaGlobalPct}%)
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Costo USD</label>
                  <input type="text" inputMode="decimal" value={form.costUsd} onChange={e => setForm(f => ({ ...f, costUsd: sanitizeDecimal(e.target.value) }))} className="input-field !py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Ganancia Detal %</label>
                  <input type="text" inputMode="decimal" value={form.gananciaPct} onChange={e => setForm(f => ({ ...f, gananciaPct: sanitizeDecimal(e.target.value) }))} className="input-field !py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Ganancia Mayor %</label>
                  <input type="text" inputMode="decimal" value={form.gananciaMayorPct} onChange={e => setForm(f => ({ ...f, gananciaMayorPct: sanitizeDecimal(e.target.value) }))} className="input-field !py-2 text-sm" />
                </div>
              </div>
              <div className="mt-4 p-4 rounded-xl bg-slate-900/60 border border-slate-700/50">
                <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Vista previa de precios</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase">Detal USD</p>
                    <p className="text-lg font-bold text-green-400 font-mono">${previewDetal.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase">Mayor USD</p>
                    <p className="text-lg font-bold text-blue-400 font-mono">${previewMayor.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase">Detal Bs</p>
                    <p className="text-lg font-bold text-slate-300 font-mono">{exchangeRate > 0 ? `Bs ${(previewDetal * exchangeRate).toFixed(2)}` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase">Mayor Bs</p>
                    <p className="text-lg font-bold text-slate-300 font-mono">{exchangeRate > 0 ? `Bs ${(previewMayor * exchangeRate).toFixed(2)}` : '—'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Inventario */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Inventario</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Stock minimo</label>
                  <input type="number" step="1" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: Number(e.target.value) }))} className="input-field !py-2 text-sm" />
                </div>
                <div className="flex items-end gap-6">
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none pb-2">
                    <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40" />
                    Producto activo
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none pb-2">
                    <input type="checkbox" checked={form.isService} onChange={e => setForm(f => ({ ...f, isService: e.target.checked }))} className="rounded border-slate-600 bg-slate-700 text-amber-500 focus:ring-amber-500/40" />
                    Articulo de servicio
                  </label>
                </div>
                <div className="flex items-end gap-6">
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none pb-2">
                    <input type="checkbox" checked={form.showInStore} onChange={e => setForm(f => ({ ...f, showInStore: e.target.checked }))} className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500/40" />
                    Mostrar en tienda online
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none pb-2">
                    <input type="checkbox" checked={form.storeFeatured} onChange={e => setForm(f => ({ ...f, storeFeatured: e.target.checked }))} className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500/40" disabled={!form.showInStore} />
                    Destacado en tienda
                  </label>
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
