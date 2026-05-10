'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  SlidersHorizontal, Search, ArrowUpDown, Replace, PlusCircle,
  Loader2, AlertTriangle, CheckCircle2, History, X, ChevronDown,
  TrendingUp, TrendingDown, DollarSign, Percent
} from 'lucide-react';

interface Product {
  id: string;
  code: string;
  name: string;
  costUsd: number;
  gananciaPct: number;
  gananciaMayorPct: number;
  priceDetal: number;
  priceMayor: number;
  ivaType: string;
  bregaApplies: boolean;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
}

interface Category {
  id: string;
  name: string;
  code: string | null;
  children: { id: string; name: string }[];
}

interface Brand { id: string; name: string }
interface Supplier { id: string; name: string }

interface AdjustmentLog {
  id: string;
  filters: Record<string, any>;
  adjustmentType: string;
  gananciaPct: number | null;
  gananciaMayorPct: number | null;
  productsAffected: number;
  createdById: string;
  createdByName: string;
  createdAt: string;
}

const IVA_MULTIPLIERS: Record<string, number> = {
  EXEMPT: 1, REDUCED: 1.08, GENERAL: 1.16, SPECIAL: 1.31,
};

export default function PriceAdjustmentPage() {
  // Filter state
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSubcategory, setFilterSubcategory] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [costMin, setCostMin] = useState('');
  const [costMax, setCostMax] = useState('');
  const [bregaGlobalPct, setBregaGlobalPct] = useState(0);

  // Product preview state
  const [products, setProducts] = useState<Product[]>([]);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Adjustment config state
  const [adjustmentType, setAdjustmentType] = useState<'REPLACE' | 'ADD'>('REPLACE');
  const [gananciaPctInput, setGananciaPctInput] = useState('');
  const [gananciaMayorPctInput, setGananciaMayorPctInput] = useState('');

  // Apply state
  const [applying, setApplying] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [result, setResult] = useState<{ productsAffected: number } | null>(null);

  // History state
  const [history, setHistory] = useState<AdjustmentLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Subcategories derived from selected category
  const subcategories = useMemo(() => {
    if (!filterCategory) return [];
    const cat = categories.find(c => c.id === filterCategory);
    return cat?.children || [];
  }, [filterCategory, categories]);

  // Fetch metadata
  useEffect(() => {
    async function fetchMeta() {
      const [catRes, brandRes, supRes, configRes] = await Promise.all([
        fetch('/api/proxy/categories'),
        fetch('/api/proxy/brands'),
        fetch('/api/proxy/suppliers'),
        fetch('/api/proxy/config'),
      ]);
      if (catRes.ok) setCategories(await catRes.json());
      if (brandRes.ok) setBrands(await brandRes.json());
      if (supRes.ok) setSuppliers(await supRes.json());
      if (configRes.ok) {
        const cfg = await configRes.json();
        setBregaGlobalPct(cfg.bregaGlobalPct || 0);
      }
    }
    fetchMeta();
    fetchHistory();
  }, []);

  // Reset subcategory when category changes
  useEffect(() => {
    setFilterSubcategory('');
  }, [filterCategory]);

  const hasFilters = filterCategory || filterSubcategory || filterBrand || filterSupplier || costMin || costMax;

  const fetchPreview = useCallback(async () => {
    if (!hasFilters) return;
    setLoadingPreview(true);
    setResult(null);
    const params = new URLSearchParams();
    if (filterCategory) params.set('categoryId', filterCategory);
    if (filterSubcategory) params.set('subcategoryId', filterSubcategory);
    if (filterBrand) params.set('brandId', filterBrand);
    if (filterSupplier) params.set('supplierId', filterSupplier);
    if (costMin) params.set('costMin', costMin);
    if (costMax) params.set('costMax', costMax);

    try {
      const res = await fetch(`/api/proxy/products/price-adjustment?${params}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
        setPreviewLoaded(true);
      }
    } finally {
      setLoadingPreview(false);
    }
  }, [filterCategory, filterSubcategory, filterBrand, filterSupplier, costMin, costMax, hasFilters]);

  async function fetchHistory() {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/proxy/products/price-adjustment/history');
      if (res.ok) setHistory(await res.json());
    } finally {
      setLoadingHistory(false);
    }
  }

  // Calculate preview prices
  function calculateNewPrice(product: Product, type: 'detal' | 'mayor'): number | null {
    const inputVal = type === 'detal' ? gananciaPctInput : gananciaMayorPctInput;
    if (inputVal === '') return null;

    const val = parseFloat(inputVal);
    if (isNaN(val)) return null;

    const currentPct = type === 'detal' ? product.gananciaPct : product.gananciaMayorPct;
    const newPct = adjustmentType === 'REPLACE' ? val : currentPct + val;
    const effectivePct = Math.max(0, newPct);

    const bregaPct = product.bregaApplies ? bregaGlobalPct : 0;
    const ivaMultiplier = IVA_MULTIPLIERS[product.ivaType] || 1.16;
    const price = product.costUsd * (1 + bregaPct / 100) * (1 + effectivePct / 100) * ivaMultiplier;
    return Math.round(price * 100) / 100;
  }

  function calculateNewPct(product: Product, type: 'detal' | 'mayor'): number | null {
    const inputVal = type === 'detal' ? gananciaPctInput : gananciaMayorPctInput;
    if (inputVal === '') return null;
    const val = parseFloat(inputVal);
    if (isNaN(val)) return null;
    const currentPct = type === 'detal' ? product.gananciaPct : product.gananciaMayorPct;
    const newPct = adjustmentType === 'REPLACE' ? val : currentPct + val;
    return Math.max(0, newPct);
  }

  const canApply = products.length > 0 && (gananciaPctInput !== '' || gananciaMayorPctInput !== '');

  async function handleApply() {
    setApplying(true);
    setShowConfirmModal(false);
    try {
      const body: any = {
        filters: {} as Record<string, any>,
        adjustmentType,
      };
      if (filterCategory) body.filters.categoryId = filterCategory;
      if (filterSubcategory) body.filters.subcategoryId = filterSubcategory;
      if (filterBrand) body.filters.brandId = filterBrand;
      if (filterSupplier) body.filters.supplierId = filterSupplier;
      if (costMin) body.filters.costMin = parseFloat(costMin);
      if (costMax) body.filters.costMax = parseFloat(costMax);
      if (gananciaPctInput !== '') body.gananciaPct = parseFloat(gananciaPctInput);
      if (gananciaMayorPctInput !== '') body.gananciaMayorPct = parseFloat(gananciaMayorPctInput);

      const res = await fetch('/api/proxy/products/price-adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setResult({ productsAffected: data.productsAffected });
        // Refresh preview and history
        fetchPreview();
        fetchHistory();
      } else {
        const err = await res.json().catch(() => ({ message: 'Error al aplicar' }));
        alert(err.message || 'Error al aplicar el ajuste');
      }
    } finally {
      setApplying(false);
    }
  }

  function formatFilters(filters: Record<string, any>): string {
    const parts: string[] = [];
    if (filters.categoryId) {
      const cat = categories.find(c => c.id === filters.categoryId);
      if (cat) parts.push(`Cat: ${cat.name}`);
    }
    if (filters.subcategoryId) {
      for (const cat of categories) {
        const sub = cat.children?.find(c => c.id === filters.subcategoryId);
        if (sub) { parts.push(`Subcat: ${sub.name}`); break; }
      }
    }
    if (filters.brandId) {
      const b = brands.find(b => b.id === filters.brandId);
      if (b) parts.push(`Marca: ${b.name}`);
    }
    if (filters.supplierId) {
      const s = suppliers.find(s => s.id === filters.supplierId);
      if (s) parts.push(`Prov: ${s.name}`);
    }
    if (filters.costMin !== undefined) parts.push(`Costo min: $${filters.costMin}`);
    if (filters.costMax !== undefined) parts.push(`Costo max: $${filters.costMax}`);
    return parts.length > 0 ? parts.join(' | ') : 'Sin filtros';
  }

  // Sample product for preview
  const sampleProduct = products.length > 0 ? products[0] : null;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <SlidersHorizontal size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Ajuste masivo de precios</h1>
            <p className="text-sm text-slate-400">Modifica los porcentajes de ganancia de multiples productos a la vez</p>
          </div>
        </div>
      </div>

      {/* Success banner */}
      {result && (
        <div className="mb-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-5 py-4 flex items-center gap-3">
          <CheckCircle2 size={22} className="text-emerald-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-emerald-300 font-semibold">{result.productsAffected} productos actualizados correctamente</p>
            <button
              onClick={() => {
                const historyEl = document.getElementById('history-section');
                historyEl?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="text-sm text-emerald-400/80 hover:text-emerald-300 underline underline-offset-2 mt-0.5"
            >
              Ver historial de ajustes
            </button>
          </div>
          <button onClick={() => setResult(null)} className="text-emerald-400/60 hover:text-emerald-300">
            <X size={18} />
          </button>
        </div>
      )}

      {/* Main layout: 3 panels */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left panel - Filters */}
        <div className="xl:col-span-3">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 sticky top-4">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Search size={14} />
              Filtros
            </h2>

            <div className="space-y-4">
              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Categoria</label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-600/50 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
                >
                  <option value="">Todas</option>
                  {categories.filter(c => !c.children || categories.some(cat => cat.id === c.id)).map(c => (
                    <option key={c.id} value={c.id}>{c.code ? `${c.code} — ` : ''}{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Subcategory */}
              {subcategories.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Subcategoria</label>
                  <select
                    value={filterSubcategory}
                    onChange={(e) => setFilterSubcategory(e.target.value)}
                    className="w-full bg-slate-900/80 border border-slate-600/50 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
                  >
                    <option value="">Todas</option>
                    {subcategories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Brand */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Marca</label>
                <select
                  value={filterBrand}
                  onChange={(e) => setFilterBrand(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-600/50 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
                >
                  <option value="">Todas</option>
                  {brands.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Supplier */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Proveedor</label>
                <select
                  value={filterSupplier}
                  onChange={(e) => setFilterSupplier(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-600/50 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
                >
                  <option value="">Todos</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Cost range */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Rango de costo USD</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Min"
                    value={costMin}
                    onChange={(e) => setCostMin(e.target.value)}
                    className="bg-slate-900/80 border border-slate-600/50 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Max"
                    value={costMax}
                    onChange={(e) => setCostMax(e.target.value)}
                    className="bg-slate-900/80 border border-slate-600/50 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
                  />
                </div>
              </div>

              {/* Preview button */}
              <button
                onClick={fetchPreview}
                disabled={!hasFilters || loadingPreview}
                className="w-full mt-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-2.5 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-sm shadow-lg shadow-amber-600/20 disabled:shadow-none"
              >
                {loadingPreview ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                Ver productos afectados
              </button>

              {/* Clear filters */}
              {hasFilters && (
                <button
                  onClick={() => {
                    setFilterCategory('');
                    setFilterSubcategory('');
                    setFilterBrand('');
                    setFilterSupplier('');
                    setCostMin('');
                    setCostMax('');
                    setProducts([]);
                    setPreviewLoaded(false);
                  }}
                  className="w-full text-xs text-slate-500 hover:text-slate-300 transition-colors py-1"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Center panel - Preview table */}
        <div className="xl:col-span-6">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/40 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <ArrowUpDown size={14} />
                Preview de productos
              </h2>
              {previewLoaded && (
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
                  {products.length} producto{products.length !== 1 ? 's' : ''} {products.length !== 1 ? 'seran' : 'sera'} afectado{products.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {!previewLoaded && !loadingPreview && (
              <div className="px-5 py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-700/40 flex items-center justify-center mx-auto mb-4">
                  <Search size={28} className="text-slate-500" />
                </div>
                <p className="text-slate-400 text-sm font-medium">Aplica al menos un filtro para ver los productos</p>
                <p className="text-slate-500 text-xs mt-1">Usa los filtros de la izquierda y presiona &quot;Ver productos afectados&quot;</p>
              </div>
            )}

            {loadingPreview && (
              <div className="px-5 py-16 text-center">
                <Loader2 size={32} className="text-amber-400 animate-spin mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Cargando productos...</p>
              </div>
            )}

            {previewLoaded && products.length === 0 && !loadingPreview && (
              <div className="px-5 py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-700/40 flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle size={28} className="text-slate-500" />
                </div>
                <p className="text-slate-400 text-sm font-medium">Ningun producto coincide con los filtros</p>
                <p className="text-slate-500 text-xs mt-1">Intenta con filtros menos restrictivos</p>
              </div>
            )}

            {previewLoaded && products.length > 0 && !loadingPreview && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-900/40">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Codigo</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Nombre</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Categoria</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Marca</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Costo USD</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Gan. Detal%</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Gan. Mayor%</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">P. Detal</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">P. Mayor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {products.map((p) => {
                      const newDetalPrice = calculateNewPrice(p, 'detal');
                      const newMayorPrice = calculateNewPrice(p, 'mayor');
                      const newDetalPct = calculateNewPct(p, 'detal');
                      const newMayorPct = calculateNewPct(p, 'mayor');

                      return (
                        <tr key={p.id} className="hover:bg-slate-700/20 transition-colors">
                          <td className="px-4 py-2.5 text-slate-300 font-mono text-xs">{p.code}</td>
                          <td className="px-4 py-2.5 text-slate-200 font-medium max-w-[180px] truncate">{p.name}</td>
                          <td className="px-4 py-2.5 text-slate-400 text-xs">{p.category?.name || '—'}</td>
                          <td className="px-4 py-2.5 text-slate-400 text-xs">{p.brand?.name || '—'}</td>
                          <td className="px-4 py-2.5 text-right text-slate-300 font-mono">${p.costUsd.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="text-slate-400 font-mono">{p.gananciaPct}%</span>
                            {newDetalPct !== null && newDetalPct !== p.gananciaPct && (
                              <span className="text-amber-400 font-mono text-xs ml-1">
                                &rarr; {newDetalPct}%
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="text-slate-400 font-mono">{p.gananciaMayorPct}%</span>
                            {newMayorPct !== null && newMayorPct !== p.gananciaMayorPct && (
                              <span className="text-amber-400 font-mono text-xs ml-1">
                                &rarr; {newMayorPct}%
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="text-slate-300 font-mono">${p.priceDetal.toFixed(2)}</span>
                            {newDetalPrice !== null && newDetalPrice !== p.priceDetal && (
                              <span className={`font-mono text-xs ml-1 ${newDetalPrice > p.priceDetal ? 'text-emerald-400' : 'text-red-400'}`}>
                                &rarr; ${newDetalPrice.toFixed(2)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="text-slate-300 font-mono">${p.priceMayor.toFixed(2)}</span>
                            {newMayorPrice !== null && newMayorPrice !== p.priceMayor && (
                              <span className={`font-mono text-xs ml-1 ${newMayorPrice > p.priceMayor ? 'text-emerald-400' : 'text-red-400'}`}>
                                &rarr; ${newMayorPrice.toFixed(2)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right panel - Adjustment config */}
        <div className="xl:col-span-3">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 sticky top-4">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Percent size={14} />
              Configuracion del ajuste
            </h2>

            <div className="space-y-5">
              {/* Adjustment type toggle */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Tipo de ajuste</label>
                <div className="grid grid-cols-2 gap-1 bg-slate-900/60 rounded-lg p-1">
                  <button
                    onClick={() => setAdjustmentType('REPLACE')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                      adjustmentType === 'REPLACE'
                        ? 'bg-amber-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Replace size={13} />
                    Reemplazar %
                  </button>
                  <button
                    onClick={() => setAdjustmentType('ADD')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                      adjustmentType === 'ADD'
                        ? 'bg-amber-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <PlusCircle size={13} />
                    Sumar/Restar %
                  </button>
                </div>
              </div>

              {/* Ganancia Detal */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  {adjustmentType === 'REPLACE' ? 'Nueva ganancia detal %' : 'Sumar/Restar ganancia detal %'}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    placeholder={adjustmentType === 'REPLACE' ? 'Ej: 35' : 'Ej: 5 o -5'}
                    value={gananciaPctInput}
                    onChange={(e) => setGananciaPctInput(e.target.value)}
                    className="w-full bg-slate-900/80 border border-slate-600/50 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 pr-8 transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                </div>
                {/* Preview price */}
                {sampleProduct && gananciaPctInput !== '' && (
                  <div className="mt-2 bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/30">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Preview ({sampleProduct.code})</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 line-through">${sampleProduct.priceDetal.toFixed(2)}</span>
                      <span className="text-xs text-slate-500">&rarr;</span>
                      <span className="text-sm font-semibold text-amber-400">
                        ${calculateNewPrice(sampleProduct, 'detal')?.toFixed(2) || '—'}
                      </span>
                      {(() => {
                        const newPrice = calculateNewPrice(sampleProduct, 'detal');
                        if (newPrice === null) return null;
                        const diff = newPrice - sampleProduct.priceDetal;
                        if (diff === 0) return null;
                        return diff > 0
                          ? <TrendingUp size={12} className="text-emerald-400" />
                          : <TrendingDown size={12} className="text-red-400" />;
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* Ganancia Mayor */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  {adjustmentType === 'REPLACE' ? 'Nueva ganancia mayor %' : 'Sumar/Restar ganancia mayor %'}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    placeholder={adjustmentType === 'REPLACE' ? 'Ej: 25' : 'Ej: 5 o -5'}
                    value={gananciaMayorPctInput}
                    onChange={(e) => setGananciaMayorPctInput(e.target.value)}
                    className="w-full bg-slate-900/80 border border-slate-600/50 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 pr-8 transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                </div>
                {/* Preview price */}
                {sampleProduct && gananciaMayorPctInput !== '' && (
                  <div className="mt-2 bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/30">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Preview ({sampleProduct.code})</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 line-through">${sampleProduct.priceMayor.toFixed(2)}</span>
                      <span className="text-xs text-slate-500">&rarr;</span>
                      <span className="text-sm font-semibold text-amber-400">
                        ${calculateNewPrice(sampleProduct, 'mayor')?.toFixed(2) || '—'}
                      </span>
                      {(() => {
                        const newPrice = calculateNewPrice(sampleProduct, 'mayor');
                        if (newPrice === null) return null;
                        const diff = newPrice - sampleProduct.priceMayor;
                        if (diff === 0) return null;
                        return diff > 0
                          ? <TrendingUp size={12} className="text-emerald-400" />
                          : <TrendingDown size={12} className="text-red-400" />;
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* Apply button */}
              <button
                onClick={() => setShowConfirmModal(true)}
                disabled={!canApply || applying}
                className="w-full mt-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-sm shadow-lg shadow-red-600/20 disabled:shadow-none"
              >
                {applying ? <Loader2 size={16} className="animate-spin" /> : <SlidersHorizontal size={16} />}
                Aplicar cambio
              </button>

              {!canApply && previewLoaded && products.length > 0 && (
                <p className="text-[11px] text-slate-500 text-center">Ingresa al menos un valor de ganancia para aplicar</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* History section */}
      <div id="history-section" className="mt-8">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/40">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <History size={14} />
              Historial de ajustes
            </h2>
          </div>

          {loadingHistory && (
            <div className="px-5 py-12 text-center">
              <Loader2 size={24} className="text-amber-400 animate-spin mx-auto" />
            </div>
          )}

          {!loadingHistory && history.length === 0 && (
            <div className="px-5 py-12 text-center">
              <p className="text-slate-500 text-sm">No hay ajustes registrados</p>
            </div>
          )}

          {!loadingHistory && history.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900/40">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Filtros aplicados</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Tipo</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Gan. Detal%</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Gan. Mayor%</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Productos</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Usuario</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {history.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-2.5 text-slate-300 text-xs whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })}{' '}
                        <span className="text-slate-500">{new Date(log.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 text-xs max-w-[250px]">
                        <span className="line-clamp-2">{formatFilters(log.filters)}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          log.adjustmentType === 'REPLACE'
                            ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                            : 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                        }`}>
                          {log.adjustmentType === 'REPLACE' ? 'Reemplazar' : 'Sumar/Restar'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-300 font-mono text-xs">
                        {log.gananciaPct !== null ? `${log.gananciaPct}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-300 font-mono text-xs">
                        {log.gananciaMayorPct !== null ? `${log.gananciaMayorPct}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-xs font-semibold text-amber-400">{log.productsAffected}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 text-xs">{log.createdByName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
          <div className="relative bg-slate-800 border border-slate-700/50 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-xl bg-red-500/15 flex items-center justify-center">
                  <AlertTriangle size={22} className="text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-100">Confirmar ajuste masivo de precios?</h3>
                </div>
              </div>

              <div className="space-y-3 mb-5">
                <div className="bg-slate-900/60 rounded-lg px-4 py-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Productos afectados:</span>
                    <span className="text-slate-200 font-semibold">{products.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Tipo de ajuste:</span>
                    <span className="text-slate-200 font-semibold">
                      {adjustmentType === 'REPLACE' ? 'Reemplazar' : 'Sumar/Restar'}
                    </span>
                  </div>
                  {gananciaPctInput !== '' && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Ganancia detal:</span>
                      <span className="text-slate-200 font-semibold">{gananciaPctInput}%</span>
                    </div>
                  )}
                  {gananciaMayorPctInput !== '' && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Ganancia mayor:</span>
                      <span className="text-slate-200 font-semibold">{gananciaMayorPctInput}%</span>
                    </div>
                  )}
                </div>

                <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg px-4 py-3 flex items-start gap-2.5">
                  <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-300/90">Esta accion no se puede deshacer. Los precios se recalcularan inmediatamente.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleApply}
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm shadow-lg shadow-red-600/20"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
