'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Package, Save, Loader2, AlertTriangle,
  ChevronLeft, ChevronRight, ExternalLink,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// ───── types ─────
interface Product {
  id: string;
  code: string;
  barcode: string | null;
  supplierRef: string | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  brandId: string | null;
  supplierId: string | null;
  purchaseUnit: string;
  saleUnit: string;
  conversionFactor: number;
  costUsd: number;
  bregaApplies: boolean;
  gananciaPct: number;
  gananciaMayorPct: number;
  ivaType: string;
  priceDetal: number;
  priceMayor: number;
  minStock: number;
  isActive: boolean;
  category: { id: string; name: string; printArea?: { id: string; name: string } | null } | null;
  brand: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  stock: { quantity: number; warehouse: { id: string; name: string } }[];
}
interface Category { id: string; name: string; children: { id: string; name: string }[]; }
interface Brand { id: string; name: string; }
interface Supplier { id: string; name: string; }
interface Movement {
  id: string; type: string; quantity: number; costUsd: number | null;
  reason: string | null; reference: string | null; createdAt: string; createdById: string;
  warehouse: { id: string; name: string };
}
interface PurchaseRow {
  id: string; date: string; orderNumber: string; orderId: string;
  status: string; supplier: string; quantity: number; costUsd: number; totalUsd: number;
}

const IVA_OPTIONS = [
  { value: 'EXEMPT', label: 'Exento (0%)' },
  { value: 'REDUCED', label: 'Reducido (8%)' },
  { value: 'GENERAL', label: 'General (16%)' },
  { value: 'SPECIAL', label: 'Especial (31%)' },
];
const IVA_MULTIPLIERS: Record<string, number> = { EXEMPT: 1, REDUCED: 1.08, GENERAL: 1.16, SPECIAL: 1.31 };
const IVA_PCTS: Record<string, number> = { EXEMPT: 0, REDUCED: 8, GENERAL: 16, SPECIAL: 31 };

const MOVEMENT_LABELS: Record<string, { label: string; color: string }> = {
  PURCHASE: { label: 'Compra', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  SALE: { label: 'Venta', color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  ADJUSTMENT_IN: { label: 'Ajuste +', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  ADJUSTMENT_OUT: { label: 'Ajuste -', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
  TRANSFER_IN: { label: 'Transf. +', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  TRANSFER_OUT: { label: 'Transf. -', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  COUNT_ADJUST: { label: 'Conteo', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
};

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  // ── Product data ──
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── Meta data ──
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [exchangeRate, setExchangeRate] = useState(0);
  const [bregaGlobalPct, setBregaGlobalPct] = useState(0);

  // ── Form state ──
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Movements ──
  const [movements, setMovements] = useState<Movement[]>([]);
  const [movPage, setMovPage] = useState(1);
  const [movTotalPages, setMovTotalPages] = useState(0);
  const [movLoading, setMovLoading] = useState(false);

  // ── Purchase history ──
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);

  // ── Fetch product ──
  const fetchProduct = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/products/by-code/${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error('Producto no encontrado');
      const data = await res.json();
      setProduct(data);
      setForm({
        name: data.name,
        barcode: data.barcode || '',
        supplierRef: data.supplierRef || '',
        description: data.description || '',
        categoryId: data.categoryId || '',
        brandId: data.brandId || '',
        supplierId: data.supplierId || '',
        purchaseUnit: data.purchaseUnit,
        saleUnit: data.saleUnit,
        conversionFactor: data.conversionFactor,
        costUsd: data.costUsd,
        bregaApplies: data.bregaApplies,
        gananciaPct: data.gananciaPct,
        gananciaMayorPct: data.gananciaMayorPct,
        ivaType: data.ivaType,
        minStock: data.minStock,
        isActive: data.isActive,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [code]);

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
    }
    if (rateRes.ok) {
      const text = await rateRes.text();
      if (text) { try { const rate = JSON.parse(text); setExchangeRate(rate.rate || 0); } catch {} }
    }
  }, []);

  const fetchMovements = useCallback(async () => {
    if (!product) return;
    setMovLoading(true);
    try {
      const res = await fetch(`/api/proxy/stock-movements?productId=${product.id}&page=${movPage}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setMovements(data.data);
        setMovTotalPages(data.meta.totalPages);
      }
    } catch { /* ignore */ } finally {
      setMovLoading(false);
    }
  }, [product, movPage]);

  const fetchPurchases = useCallback(async () => {
    if (!product) return;
    setPurchasesLoading(true);
    try {
      const res = await fetch(`/api/proxy/products/${product.id}/purchases`);
      if (res.ok) setPurchases(await res.json());
    } catch { /* ignore */ } finally {
      setPurchasesLoading(false);
    }
  }, [product]);

  useEffect(() => { fetchProduct(); fetchMeta(); }, [fetchProduct, fetchMeta]);
  useEffect(() => { fetchMovements(); }, [fetchMovements]);
  useEffect(() => { fetchPurchases(); }, [fetchPurchases]);

  // ── Save handler ──
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;
    setSaving(true);
    setSaveMsg(null);
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
      const res = await fetch(`/api/proxy/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const updated = await res.json();
        setProduct(updated);
        setSaveMsg({ type: 'success', text: 'Producto actualizado' });
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) {
      setSaveMsg({ type: 'error', text: err.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  }

  // ── Helpers ──
  const allCategories: { id: string; name: string; isChild: boolean }[] = [];
  categories.forEach(cat => {
    allCategories.push({ id: cat.id, name: cat.name, isChild: false });
    cat.children?.forEach(child => {
      allCategories.push({ id: child.id, name: `  ${child.name}`, isChild: true });
    });
  });

  function calcPrice(costUsd: number, gananciaPct: number, bregaApplies: boolean, ivaType: string) {
    const brecha = bregaApplies ? bregaGlobalPct : 0;
    return costUsd * (1 + brecha / 100) * (1 + gananciaPct / 100) * (IVA_MULTIPLIERS[ivaType] || 1.16);
  }

  function fmtDate(iso: string) {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  }

  // ── Loading / Error ──
  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="animate-spin text-green-500" size={32} />
    </div>
  );
  if (error || !product) return (
    <div className="text-center py-20">
      <p className="text-red-400 mb-4">{error || 'Producto no encontrado'}</p>
      <button onClick={() => router.push('/catalog/products')} className="btn-secondary">
        Volver a productos
      </button>
    </div>
  );

  const totalStock = product.stock?.reduce((s, st) => s + st.quantity, 0) || 0;
  const costUsd = Number(form.costUsd);
  const brecha = form.bregaApplies ? bregaGlobalPct : 0;
  const brechaAmt = costUsd * brecha / 100;
  const costConBrecha = costUsd + brechaAmt;
  const gananciaDetal = costConBrecha * Number(form.gananciaPct) / 100;
  const gananciaMayor = costConBrecha * Number(form.gananciaMayorPct) / 100;
  const ivaPct = IVA_PCTS[form.ivaType] || 16;
  const subtotalDetal = costConBrecha + gananciaDetal;
  const ivaDetal = subtotalDetal * ivaPct / 100;
  const priceDetal = subtotalDetal + ivaDetal;
  const subtotalMayor = costConBrecha + gananciaMayor;
  const ivaMayor = subtotalMayor * ivaPct / 100;
  const priceMayor = subtotalMayor + ivaMayor;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
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
            <h1 className="text-2xl font-bold text-white">{product.name}</h1>
            <p className="text-slate-400 text-sm">
              <span className="font-mono text-green-400">{product.code}</span>
              {product.barcode && <span className="ml-2 text-slate-500">| {product.barcode}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {product.isActive ? (
            <span className="text-xs px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Activo</span>
          ) : (
            <span className="text-xs px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Inactivo</span>
          )}
        </div>
      </div>

      {saveMsg && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${saveMsg.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {saveMsg.text}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Informacion General</TabsTrigger>
          <TabsTrigger value="stock">Existencias</TabsTrigger>
          <TabsTrigger value="movements">Movimientos</TabsTrigger>
          <TabsTrigger value="purchases">Historial de compras</TabsTrigger>
          <TabsTrigger value="prices">Precios</TabsTrigger>
        </TabsList>

        {/* ═══ TAB: Informacion General ═══ */}
        <TabsContent value="info">
          <form onSubmit={handleSave} className="card p-6 space-y-5">
            {/* Basic fields */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Datos basicos</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Codigo</label>
                  <input type="text" value={product.code} disabled className="input-field !py-2 text-sm opacity-60" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Barcode</label>
                  <input type="text" value={form.barcode || ''} onChange={e => setForm((f: any) => ({ ...f, barcode: e.target.value }))} className="input-field !py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Ref. Proveedor</label>
                  <input type="text" value={form.supplierRef || ''} onChange={e => setForm((f: any) => ({ ...f, supplierRef: e.target.value }))} className="input-field !py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Nombre *</label>
                  <input type="text" value={form.name || ''} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} className="input-field !py-2 text-sm" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Descripcion</label>
                  <textarea value={form.description || ''} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))} className="input-field !py-2 text-sm" rows={2} />
                </div>
              </div>
            </div>

            {/* Classification */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Clasificacion</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Categoria</label>
                  <select value={form.categoryId || ''} onChange={e => setForm((f: any) => ({ ...f, categoryId: e.target.value }))} className="input-field !py-2 text-sm">
                    <option value="">Sin categoria</option>
                    {allCategories.map(c => <option key={c.id} value={c.id}>{c.isChild ? `└ ${c.name.trim()}` : c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Marca</label>
                  <select value={form.brandId || ''} onChange={e => setForm((f: any) => ({ ...f, brandId: e.target.value }))} className="input-field !py-2 text-sm">
                    <option value="">Sin marca</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Proveedor principal</label>
                  <select value={form.supplierId || ''} onChange={e => setForm((f: any) => ({ ...f, supplierId: e.target.value }))} className="input-field !py-2 text-sm">
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
                  <input type="text" value={form.purchaseUnit || ''} onChange={e => setForm((f: any) => ({ ...f, purchaseUnit: e.target.value }))} className="input-field !py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Unidad de venta</label>
                  <input type="text" value={form.saleUnit || ''} onChange={e => setForm((f: any) => ({ ...f, saleUnit: e.target.value }))} className="input-field !py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Factor conversion</label>
                  <input type="number" step="0.001" value={form.conversionFactor ?? ''} onChange={e => setForm((f: any) => ({ ...f, conversionFactor: Number(e.target.value) }))} className="input-field !py-2 text-sm" />
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Precios</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">IVA</label>
                  <select value={form.ivaType || 'GENERAL'} onChange={e => setForm((f: any) => ({ ...f, ivaType: e.target.value }))} className="input-field !py-2 text-sm">
                    {IVA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none pb-2">
                    <input type="checkbox" checked={form.bregaApplies ?? true} onChange={e => setForm((f: any) => ({ ...f, bregaApplies: e.target.checked }))} className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40" />
                    Aplica brecha ({bregaGlobalPct}%)
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Costo USD</label>
                  <input type="number" step="0.01" value={form.costUsd ?? ''} onChange={e => setForm((f: any) => ({ ...f, costUsd: Number(e.target.value) }))} className="input-field !py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Ganancia Detal %</label>
                  <input type="number" step="0.01" value={form.gananciaPct ?? ''} onChange={e => setForm((f: any) => ({ ...f, gananciaPct: Number(e.target.value) }))} className="input-field !py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Ganancia Mayor %</label>
                  <input type="number" step="0.01" value={form.gananciaMayorPct ?? ''} onChange={e => setForm((f: any) => ({ ...f, gananciaMayorPct: Number(e.target.value) }))} className="input-field !py-2 text-sm" />
                </div>
              </div>
            </div>

            {/* Stock minimum */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Inventario</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Stock minimo</label>
                  <input type="number" step="1" value={form.minStock ?? ''} onChange={e => setForm((f: any) => ({ ...f, minStock: Number(e.target.value) }))} className="input-field !py-2 text-sm" />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none pb-2">
                    <input type="checkbox" checked={form.isActive ?? true} onChange={e => setForm((f: any) => ({ ...f, isActive: e.target.checked }))} className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40" />
                    Producto activo
                  </label>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
              <button type="submit" disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                Guardar cambios
              </button>
            </div>
          </form>
        </TabsContent>

        {/* ═══ TAB: Existencias ═══ */}
        <TabsContent value="stock">
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Almacen</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Stock actual</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Unidad</th>
                </tr>
              </thead>
              <tbody>
                {product.stock.length === 0 ? (
                  <tr><td colSpan={3} className="text-center py-8 text-slate-500">Sin existencias registradas</td></tr>
                ) : product.stock.map(s => {
                  const isZero = s.quantity === 0;
                  const isLow = s.quantity > 0 && s.quantity < product.minStock;
                  return (
                    <tr key={s.warehouse.id} className="border-b border-slate-700/30">
                      <td className="px-4 py-3 text-white">{s.warehouse.name}</td>
                      <td className={`px-4 py-3 text-right font-mono ${isZero ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-white'}`}>
                        {s.quantity}
                        {isLow && <AlertTriangle size={12} className="inline ml-1" />}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{product.saleUnit}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-700/50 bg-slate-800/30">
                  <td className="px-4 py-3 text-slate-300 font-semibold">Total</td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold ${totalStock < product.minStock ? 'text-amber-400' : 'text-white'}`}>
                    {totalStock}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{product.saleUnit}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </TabsContent>

        {/* ═══ TAB: Movimientos ═══ */}
        <TabsContent value="movements">
          <div className="card overflow-hidden">
            {movLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-green-500" size={24} />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                        <th className="text-left px-4 py-3 text-slate-400 font-medium">Tipo</th>
                        <th className="text-right px-4 py-3 text-slate-400 font-medium">Cantidad</th>
                        <th className="text-left px-4 py-3 text-slate-400 font-medium">Almacen</th>
                        <th className="text-left px-4 py-3 text-slate-400 font-medium">Referencia</th>
                        <th className="text-center px-4 py-3 text-slate-400 font-medium w-24"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-8 text-slate-500">Sin movimientos</td></tr>
                      ) : movements.map(mov => {
                        const ml = MOVEMENT_LABELS[mov.type] || { label: mov.type, color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' };
                        const isInvoice = mov.reference && /^FAC-/.test(mov.reference);
                        const isPO = mov.reference && /^PO-/.test(mov.reference);
                        return (
                          <tr key={mov.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                            <td className="px-4 py-3 text-slate-300">{fmtDate(mov.createdAt)}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${ml.color}`}>{ml.label}</span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-white">{mov.quantity}</td>
                            <td className="px-4 py-3 text-slate-400">{mov.warehouse.name}</td>
                            <td className="px-4 py-3 text-slate-400 font-mono text-xs">{mov.reference || mov.reason || '—'}</td>
                            <td className="px-4 py-3 text-center">
                              {isInvoice && (
                                <button
                                  onClick={() => router.push('/sales/invoices')}
                                  className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 mx-auto"
                                >
                                  Ver factura <ExternalLink size={10} />
                                </button>
                              )}
                              {isPO && (
                                <button
                                  onClick={() => router.push('/purchases')}
                                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mx-auto"
                                >
                                  Ver compra <ExternalLink size={10} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {movTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
                    <span className="text-sm text-slate-400">Pagina {movPage} de {movTotalPages}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setMovPage(p => Math.max(1, p - 1))} disabled={movPage <= 1} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30 transition-colors">
                        <ChevronLeft size={16} />
                      </button>
                      <button onClick={() => setMovPage(p => Math.min(movTotalPages, p + 1))} disabled={movPage >= movTotalPages} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30 transition-colors">
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>

        {/* ═══ TAB: Historial de compras ═══ */}
        <TabsContent value="purchases">
          <div className="card overflow-hidden">
            {purchasesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-green-500" size={24} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Orden de compra</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Proveedor</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">Cant. recibida</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">Costo USD</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">Total USD</th>
                      <th className="text-center px-4 py-3 text-slate-400 font-medium w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-8 text-slate-500">Sin historial de compras</td></tr>
                    ) : purchases.map(p => (
                      <tr key={p.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 text-slate-300">{fmtDate(p.date)}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">{p.orderNumber}</span>
                        </td>
                        <td className="px-4 py-3 text-white">{p.supplier}</td>
                        <td className="px-4 py-3 text-right font-mono text-white">{p.quantity}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-300">${p.costUsd.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono text-white">${p.totalUsd.toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => router.push(`/purchases/${p.orderId}`)}
                            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mx-auto"
                          >
                            Ver orden <ExternalLink size={10} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ═══ TAB: Precios ═══ */}
        <TabsContent value="prices">
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Formula de precio — Detal</h3>
            <div className="space-y-2 font-mono text-sm mb-6">
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Costo USD:</span>
                <span className="text-white">${costUsd.toFixed(2)}</span>
              </div>
              {brecha > 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">+ Brecha ({brecha}%):</span>
                  <span className="text-white">${brechaAmt.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between py-1">
                <span className="text-slate-400">+ Ganancia detal ({Number(form.gananciaPct)}%):</span>
                <span className="text-white">${gananciaDetal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">+ IVA ({ivaPct}%):</span>
                <span className="text-white">${ivaDetal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 border-t border-slate-700/50 pt-2">
                <span className="text-green-400 font-semibold">= Precio detal:</span>
                <span className="text-green-400 font-semibold">${priceDetal.toFixed(2)}</span>
              </div>
              {exchangeRate > 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">= Precio detal Bs:</span>
                  <span className="text-slate-300">Bs {(priceDetal * exchangeRate).toFixed(2)}</span>
                </div>
              )}
            </div>

            <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Formula de precio — Mayor</h3>
            <div className="space-y-2 font-mono text-sm">
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Costo USD:</span>
                <span className="text-white">${costUsd.toFixed(2)}</span>
              </div>
              {brecha > 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">+ Brecha ({brecha}%):</span>
                  <span className="text-white">${brechaAmt.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between py-1">
                <span className="text-slate-400">+ Ganancia mayor ({Number(form.gananciaMayorPct)}%):</span>
                <span className="text-white">${gananciaMayor.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">+ IVA ({ivaPct}%):</span>
                <span className="text-white">${ivaMayor.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 border-t border-slate-700/50 pt-2">
                <span className="text-blue-400 font-semibold">= Precio mayor:</span>
                <span className="text-blue-400 font-semibold">${priceMayor.toFixed(2)}</span>
              </div>
              {exchangeRate > 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">= Precio mayor Bs:</span>
                  <span className="text-slate-300">Bs {(priceMayor * exchangeRate).toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
