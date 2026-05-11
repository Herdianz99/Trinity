'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Package, Loader2 } from 'lucide-react';

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
  costUsd: 0, bregaApplies: true, gananciaPct: 0, gananciaMayorPct: 0,
  ivaType: 'GENERAL', minStock: 0, isActive: true,
};

export default function NewProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [exchangeRate, setExchangeRate] = useState(0);
  const [bregaGlobalPct, setBregaGlobalPct] = useState(0);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
    if (configRes.ok) {
      const cfg = await configRes.json();
      setBregaGlobalPct(cfg.bregaGlobalPct || 0);
      setForm(f => ({
        ...f,
        gananciaPct: cfg.defaultGananciaPct || 0,
        gananciaMayorPct: cfg.defaultGananciaMayorPct || 0,
      }));
    }
    if (rateRes.ok) {
      const rate = await rateRes.json();
      if (rate) setExchangeRate(rate.rate || 0);
    }
  }, []);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  function calcPreviewPrice(costUsd: number, gananciaPct: number, bregaApplies: boolean, ivaType: string) {
    const brecha = bregaApplies ? bregaGlobalPct : 0;
    return costUsd * (1 + brecha / 100) * (1 + gananciaPct / 100) * (IVA_MULTIPLIERS[ivaType] || 1.16);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
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
        costUsd: Number(form.costUsd),
        bregaApplies: form.bregaApplies,
        gananciaPct: Number(form.gananciaPct),
        gananciaMayorPct: Number(form.gananciaMayorPct),
        ivaType: form.ivaType,
        minStock: Number(form.minStock),
        isActive: form.isActive,
      };
      if (form.code) body.code = form.code;

      const res = await fetch('/api/proxy/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const created = await res.json();
        router.push(`/catalog/products/${created.code}`);
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al crear' });
    } finally {
      setSaving(false);
    }
  }

  const allCategories: { id: string; name: string; isChild: boolean }[] = [];
  categories.forEach(cat => {
    allCategories.push({ id: cat.id, name: cat.name, isChild: false });
    cat.children?.forEach(child => {
      allCategories.push({ id: child.id, name: `  ${child.name}`, isChild: true });
    });
  });

  const previewDetal = calcPreviewPrice(Number(form.costUsd), Number(form.gananciaPct), form.bregaApplies, form.ivaType);
  const previewMayor = calcPreviewPrice(Number(form.costUsd), Number(form.gananciaMayorPct), form.bregaApplies, form.ivaType);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.push('/catalog/products')}
          className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <Package className="text-green-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Nuevo producto</h1>
          <p className="text-slate-400 text-sm">Completa los datos para crear un producto</p>
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="card p-6 space-y-5">
        {/* Basic fields */}
        <div>
          <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Datos basicos</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Codigo</label>
              <input type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className="input-field !py-2 text-sm" placeholder="Auto (segun categoria)" />
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

        {/* Classification */}
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

        {/* Units */}
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

        {/* Pricing */}
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
              <input type="number" step="0.01" value={form.costUsd} onChange={e => setForm(f => ({ ...f, costUsd: Number(e.target.value) }))} className="input-field !py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Ganancia Detal %</label>
              <input type="number" step="0.01" value={form.gananciaPct} onChange={e => setForm(f => ({ ...f, gananciaPct: Number(e.target.value) }))} className="input-field !py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Ganancia Mayor %</label>
              <input type="number" step="0.01" value={form.gananciaMayorPct} onChange={e => setForm(f => ({ ...f, gananciaMayorPct: Number(e.target.value) }))} className="input-field !py-2 text-sm" />
            </div>
          </div>

          {/* Price preview */}
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
                <p className="text-lg font-bold text-slate-300 font-mono">
                  {exchangeRate > 0 ? `Bs ${(previewDetal * exchangeRate).toFixed(2)}` : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase">Mayor Bs</p>
                <p className="text-lg font-bold text-slate-300 font-mono">
                  {exchangeRate > 0 ? `Bs ${(previewMayor * exchangeRate).toFixed(2)}` : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Stock minimum */}
        <div>
          <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Inventario</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Stock minimo</label>
              <input type="number" step="1" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: Number(e.target.value) }))} className="input-field !py-2 text-sm" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none pb-2">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40" />
                Producto activo
              </label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
          <button type="button" onClick={() => router.push('/catalog/products')} className="btn-secondary !py-2.5 text-sm">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
            {saving && <Loader2 className="animate-spin" size={16} />}
            Crear producto
          </button>
        </div>
      </form>
    </div>
  );
}
