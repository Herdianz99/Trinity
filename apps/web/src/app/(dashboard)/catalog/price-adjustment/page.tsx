'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  SlidersHorizontal, Search, Replace, PlusCircle,
  Loader2, AlertTriangle, CheckCircle2, History, X,
  TrendingUp, TrendingDown, Percent
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

const selectClass = 'w-full bg-slate-900/80 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors';

export default function PriceAdjustmentPage() {
  // Filter state
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSubcategory, setFilterSubcategory] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterBrega, setFilterBrega] = useState(''); // '' | 'true' | 'false'
  const [costMin, setCostMin] = useState('');
  const [costMax, setCostMax] = useState('');
  const [bregaGlobalPct, setBregaGlobalPct] = useState(0);

  // Product preview state
  const [products, setProducts] = useState<Product[]>([]);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Selection state (default: nothing selected)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  useEffect(() => { document.title = 'Ajuste de Precios | Trinity ERP'; }, []);

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

  const hasFilters = filterCategory || filterSubcategory || filterBrand || filterSupplier || filterBrega || costMin || costMax;

  const fetchPreview = useCallback(async () => {
    if (!hasFilters) return;
    setLoadingPreview(true);
    setResult(null);
    setSelectedIds(new Set()); // reset selection on new preview
    const params = new URLSearchParams();
    if (filterCategory) params.set('categoryId', filterCategory);
    if (filterSubcategory) params.set('subcategoryId', filterSubcategory);
    if (filterBrand) params.set('brandId', filterBrand);
    if (filterSupplier) params.set('supplierId', filterSupplier);
    if (filterBrega) params.set('bregaApplies', filterBrega);
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
  }, [filterCategory, filterSubcategory, filterBrand, filterSupplier, filterBrega, costMin, costMax, hasFilters]);

  async function fetchHistory() {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/proxy/products/price-adjustment/history');
      if (res.ok) setHistory(await res.json());
    } finally {
      setLoadingHistory(false);
    }
  }

  // ── Selection helpers ──
  const allSelected = products.length > 0 && selectedIds.size === products.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(prev => {
      if (prev.size === products.length) return new Set();
      return new Set(products.map(p => p.id));
    });
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

  const canApply = selectedIds.size > 0 && (gananciaPctInput !== '' || gananciaMayorPctInput !== '');

  async function handleApply() {
    setApplying(true);
    setShowConfirmModal(false);
    try {
      const body: any = {
        filters: {} as Record<string, any>,
        productIds: Array.from(selectedIds),
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

  const sampleProduct = products.length > 0 ? products[0] : null;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <SlidersHorizontal size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Ajuste masivo de precios</h1>
            <p className="text-sm text-slate-400">Filtra, selecciona los articulos a modificar y ajusta sus porcentajes de ganancia</p>
          </div>
        </div>
      </div>

      {/* Success banner */}
      {result && (
        <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-5 py-4 flex items-center gap-3">
          <CheckCircle2 size={22} className="text-emerald-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-emerald-300 font-semibold">{result.productsAffected} productos actualizados correctamente</p>
            <button
              onClick={() => document.getElementById('history-section')?.scrollIntoView({ behavior: 'smooth' })}
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

      {/* ── Filtros (barra superior) ── */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[160px] flex-1">
            <label className="block text-xs font-medium text-slate-400 mb-1">Categoria</label>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className={selectClass}>
              <option value="">Todas</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.code ? `${c.code} — ` : ''}{c.name}</option>
              ))}
            </select>
          </div>

          {subcategories.length > 0 && (
            <div className="min-w-[150px] flex-1">
              <label className="block text-xs font-medium text-slate-400 mb-1">Subcategoria</label>
              <select value={filterSubcategory} onChange={(e) => setFilterSubcategory(e.target.value)} className={selectClass}>
                <option value="">Todas</option>
                {subcategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div className="min-w-[150px] flex-1">
            <label className="block text-xs font-medium text-slate-400 mb-1">Marca</label>
            <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)} className={selectClass}>
              <option value="">Todas</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div className="min-w-[150px] flex-1">
            <label className="block text-xs font-medium text-slate-400 mb-1">Proveedor</label>
            <select value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)} className={selectClass}>
              <option value="">Todos</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="w-[130px]">
            <label className="block text-xs font-medium text-slate-400 mb-1">Brecha</label>
            <select value={filterBrega} onChange={(e) => setFilterBrega(e.target.value)} className={selectClass}>
              <option value="">Todas</option>
              <option value="true">Con brecha</option>
              <option value="false">Sin brecha</option>
            </select>
          </div>

          <div className="w-[100px]">
            <label className="block text-xs font-medium text-slate-400 mb-1">Costo min</label>
            <input type="number" min="0" step="0.01" placeholder="Min" value={costMin} onChange={(e) => setCostMin(e.target.value)} className={selectClass} />
          </div>
          <div className="w-[100px]">
            <label className="block text-xs font-medium text-slate-400 mb-1">Costo max</label>
            <input type="number" min="0" step="0.01" placeholder="Max" value={costMax} onChange={(e) => setCostMax(e.target.value)} className={selectClass} />
          </div>

          <button
            onClick={fetchPreview}
            disabled={!hasFilters || loadingPreview}
            className="bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-amber-600/20 disabled:shadow-none"
          >
            {loadingPreview ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Ver productos
          </button>
          {hasFilters && (
            <button
              onClick={() => {
                setFilterCategory(''); setFilterSubcategory(''); setFilterBrand(''); setFilterSupplier(''); setFilterBrega('');
                setCostMin(''); setCostMax(''); setProducts([]); setPreviewLoaded(false); setSelectedIds(new Set());
              }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors py-2 px-2"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ── Configuracion del ajuste (barra) ── */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Tipo de ajuste</label>
            <div className="grid grid-cols-2 gap-1 bg-slate-900/60 rounded-lg p-1">
              <button
                onClick={() => setAdjustmentType('REPLACE')}
                className={`flex items-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-semibold transition-all ${adjustmentType === 'REPLACE' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <Replace size={13} /> Reemplazar %
              </button>
              <button
                onClick={() => setAdjustmentType('ADD')}
                className={`flex items-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-semibold transition-all ${adjustmentType === 'ADD' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <PlusCircle size={13} /> Sumar/Restar %
              </button>
            </div>
          </div>

          <div className="w-[170px]">
            <label className="block text-xs font-medium text-slate-400 mb-1">
              {adjustmentType === 'REPLACE' ? 'Nueva ganancia detal %' : 'Sumar/Restar detal %'}
            </label>
            <div className="relative">
              <input type="number" step="0.1" placeholder={adjustmentType === 'REPLACE' ? 'Ej: 35' : 'Ej: 5 o -5'} value={gananciaPctInput} onChange={(e) => setGananciaPctInput(e.target.value)} className={`${selectClass} pr-7`} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
            </div>
          </div>

          <div className="w-[170px]">
            <label className="block text-xs font-medium text-slate-400 mb-1">
              {adjustmentType === 'REPLACE' ? 'Nueva ganancia mayor %' : 'Sumar/Restar mayor %'}
            </label>
            <div className="relative">
              <input type="number" step="0.1" placeholder={adjustmentType === 'REPLACE' ? 'Ej: 25' : 'Ej: 5 o -5'} value={gananciaMayorPctInput} onChange={(e) => setGananciaMayorPctInput(e.target.value)} className={`${selectClass} pr-7`} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
            </div>
          </div>

          {/* Sample preview */}
          {sampleProduct && (gananciaPctInput !== '' || gananciaMayorPctInput !== '') && (
            <div className="bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/30 text-xs">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Ej. {sampleProduct.code}</p>
              <div className="flex items-center gap-3">
                {gananciaPctInput !== '' && (
                  <span className="flex items-center gap-1">
                    <span className="text-slate-500">Detal</span>
                    <span className="text-slate-400 line-through">${sampleProduct.priceDetal.toFixed(2)}</span>
                    <span className="text-amber-400 font-semibold">${calculateNewPrice(sampleProduct, 'detal')?.toFixed(2) ?? '—'}</span>
                    {(() => { const n = calculateNewPrice(sampleProduct, 'detal'); if (n === null) return null; const d = n - sampleProduct.priceDetal; if (d === 0) return null; return d > 0 ? <TrendingUp size={11} className="text-emerald-400" /> : <TrendingDown size={11} className="text-red-400" />; })()}
                  </span>
                )}
                {gananciaMayorPctInput !== '' && (
                  <span className="flex items-center gap-1">
                    <span className="text-slate-500">Mayor</span>
                    <span className="text-slate-400 line-through">${sampleProduct.priceMayor.toFixed(2)}</span>
                    <span className="text-amber-400 font-semibold">${calculateNewPrice(sampleProduct, 'mayor')?.toFixed(2) ?? '—'}</span>
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm">
              <span className="font-bold text-amber-400">{selectedIds.size}</span>
              <span className="text-slate-400"> seleccionado{selectedIds.size !== 1 ? 's' : ''}</span>
            </span>
            <button
              onClick={() => setShowConfirmModal(true)}
              disabled={!canApply || applying}
              className="bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-2.5 px-5 rounded-lg transition-all flex items-center gap-2 text-sm shadow-lg shadow-red-600/20 disabled:shadow-none"
            >
              {applying ? <Loader2 size={16} className="animate-spin" /> : <SlidersHorizontal size={16} />}
              Aplicar cambio
            </button>
          </div>
        </div>
        {selectedIds.size === 0 && previewLoaded && products.length > 0 && (
          <p className="text-[11px] text-slate-500 mt-2">Marca los articulos que quieres modificar en la tabla de abajo.</p>
        )}
      </div>

      {/* ── Tabla a ancho completo ── */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700/40 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Search size={14} /> Productos
          </h2>
          {previewLoaded && (
            <span className="text-xs text-slate-400">
              {products.length} encontrado{products.length !== 1 ? 's' : ''} · <span className="text-amber-400 font-semibold">{selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}</span>
            </span>
          )}
        </div>

        {!previewLoaded && !loadingPreview && (
          <div className="px-5 py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-700/40 flex items-center justify-center mx-auto mb-4">
              <Search size={28} className="text-slate-500" />
            </div>
            <p className="text-slate-400 text-sm font-medium">Aplica al menos un filtro y presiona &quot;Ver productos&quot;</p>
          </div>
        )}

        {loadingPreview && (
          <div className="px-5 py-20 text-center">
            <Loader2 size={32} className="text-amber-400 animate-spin mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Cargando productos...</p>
          </div>
        )}

        {previewLoaded && products.length === 0 && !loadingPreview && (
          <div className="px-5 py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-700/40 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={28} className="text-slate-500" />
            </div>
            <p className="text-slate-400 text-sm font-medium">Ningun producto coincide con los filtros</p>
          </div>
        )}

        {previewLoaded && products.length > 0 && !loadingPreview && (
          <div className="overflow-auto max-h-[calc(100vh-340px)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-900/95 backdrop-blur">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleAll}
                      className="rounded border-slate-600 bg-slate-700 text-amber-500 focus:ring-amber-500/40 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Codigo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Nombre</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Categoria</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Marca</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Brecha</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Costo USD</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Gan. Detal%</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Gan. Mayor%</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">P. Detal</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">P. Mayor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {products.map((p) => {
                  const checked = selectedIds.has(p.id);
                  const newDetalPrice = calculateNewPrice(p, 'detal');
                  const newMayorPrice = calculateNewPrice(p, 'mayor');
                  const newDetalPct = calculateNewPct(p, 'detal');
                  const newMayorPct = calculateNewPct(p, 'mayor');

                  return (
                    <tr
                      key={p.id}
                      onClick={() => toggleOne(p.id)}
                      className={`cursor-pointer transition-colors ${checked ? 'bg-amber-500/10 hover:bg-amber-500/15' : 'hover:bg-slate-700/20'}`}
                    >
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(p.id)}
                          className="rounded border-slate-600 bg-slate-700 text-amber-500 focus:ring-amber-500/40 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-slate-300 font-mono text-xs">{p.code}</td>
                      <td className="px-4 py-2.5 text-slate-200 font-medium max-w-[260px] truncate">{p.name}</td>
                      <td className="px-4 py-2.5 text-slate-400 text-xs">{p.category?.name || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-400 text-xs">{p.brand?.name || '—'}</td>
                      <td className="px-3 py-2.5 text-center">
                        {p.bregaApplies
                          ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Si</span>
                          : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-600/20 text-slate-500 border border-slate-600/20">No</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-300 font-mono">${p.costUsd.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-slate-400 font-mono">{p.gananciaPct}%</span>
                        {checked && newDetalPct !== null && newDetalPct !== p.gananciaPct && (
                          <span className="text-amber-400 font-mono text-xs ml-1">&rarr; {newDetalPct}%</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-slate-400 font-mono">{p.gananciaMayorPct}%</span>
                        {checked && newMayorPct !== null && newMayorPct !== p.gananciaMayorPct && (
                          <span className="text-amber-400 font-mono text-xs ml-1">&rarr; {newMayorPct}%</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-slate-300 font-mono">${p.priceDetal.toFixed(2)}</span>
                        {checked && newDetalPrice !== null && newDetalPrice !== p.priceDetal && (
                          <span className={`font-mono text-xs ml-1 ${newDetalPrice > p.priceDetal ? 'text-emerald-400' : 'text-red-400'}`}>&rarr; ${newDetalPrice.toFixed(2)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-slate-300 font-mono">${p.priceMayor.toFixed(2)}</span>
                        {checked && newMayorPrice !== null && newMayorPrice !== p.priceMayor && (
                          <span className={`font-mono text-xs ml-1 ${newMayorPrice > p.priceMayor ? 'text-emerald-400' : 'text-red-400'}`}>&rarr; ${newMayorPrice.toFixed(2)}</span>
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

      {/* History section */}
      <div id="history-section" className="mt-8">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/40">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <History size={14} /> Historial de ajustes
            </h2>
          </div>

          {loadingHistory && (
            <div className="px-5 py-12 text-center"><Loader2 size={24} className="text-amber-400 animate-spin mx-auto" /></div>
          )}

          {!loadingHistory && history.length === 0 && (
            <div className="px-5 py-12 text-center"><p className="text-slate-500 text-sm">No hay ajustes registrados</p></div>
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
                      <td className="px-4 py-2.5 text-slate-400 text-xs max-w-[250px]"><span className="line-clamp-2">{formatFilters(log.filters)}</span></td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${log.adjustmentType === 'REPLACE' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20' : 'bg-purple-500/15 text-purple-400 border border-purple-500/20'}`}>
                          {log.adjustmentType === 'REPLACE' ? 'Reemplazar' : 'Sumar/Restar'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-300 font-mono text-xs">{log.gananciaPct !== null ? `${log.gananciaPct}%` : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-300 font-mono text-xs">{log.gananciaMayorPct !== null ? `${log.gananciaMayorPct}%` : '—'}</td>
                      <td className="px-4 py-2.5 text-right"><span className="text-xs font-semibold text-amber-400">{log.productsAffected}</span></td>
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
                <h3 className="text-lg font-bold text-slate-100">Confirmar ajuste masivo de precios?</h3>
              </div>

              <div className="space-y-3 mb-5">
                <div className="bg-slate-900/60 rounded-lg px-4 py-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Productos seleccionados:</span>
                    <span className="text-slate-200 font-semibold">{selectedIds.size}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Tipo de ajuste:</span>
                    <span className="text-slate-200 font-semibold">{adjustmentType === 'REPLACE' ? 'Reemplazar' : 'Sumar/Restar'}</span>
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
                <button onClick={() => setShowConfirmModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm">Cancelar</button>
                <button onClick={handleApply} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm shadow-lg shadow-red-600/20">Confirmar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
