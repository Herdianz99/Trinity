'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Package, Plus, Search, Filter, ChevronLeft, ChevronRight,
  Edit2, Trash2, Loader2, X, AlertTriangle, Eye, EyeOff
} from 'lucide-react';

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
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  stock: { quantity: number; warehouse: { id: string; name: string } }[];
}

interface Category {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

interface Brand { id: string; name: string; }
interface Supplier { id: string; name: string; }

const IVA_OPTIONS = [
  { value: 'EXEMPT', label: 'Exento (0%)' },
  { value: 'REDUCED', label: 'Reducido (8%)' },
  { value: 'GENERAL', label: 'General (16%)' },
  { value: 'SPECIAL', label: 'Especial (31%)' },
];

const IVA_MULTIPLIERS: Record<string, number> = {
  EXEMPT: 1, REDUCED: 1.08, GENERAL: 1.16, SPECIAL: 1.31,
};

const defaultForm = {
  code: '', barcode: '', supplierRef: '', name: '', description: '',
  categoryId: '', brandId: '', supplierId: '',
  purchaseUnit: 'UNIT', saleUnit: 'UNIT', conversionFactor: 1,
  costUsd: 0, bregaApplies: true, gananciaPct: 0, gananciaMayorPct: 0,
  ivaType: 'GENERAL', minStock: 0, isActive: true,
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [exchangeRate, setExchangeRate] = useState(0);
  const [bregaGlobalPct, setBregaGlobalPct] = useState(0);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (search) params.set('search', search);
      if (filterCategory) params.set('categoryId', filterCategory);
      if (filterBrand) params.set('brandId', filterBrand);
      if (filterSupplier) params.set('supplierId', filterSupplier);
      if (lowStock) params.set('lowStock', 'true');

      const res = await fetch(`/api/proxy/products?${params}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.data);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [page, search, filterCategory, filterBrand, filterSupplier, lowStock]);

  const fetchMeta = useCallback(async () => {
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
      setExchangeRate(cfg.exchangeRate || 0);
      setBregaGlobalPct(cfg.bregaGlobalPct || 0);
    }
  }, []);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  function getTotalStock(product: Product) {
    return product.stock?.reduce((sum, s) => sum + s.quantity, 0) || 0;
  }

  function calcPreviewPrice(costUsd: number, gananciaPct: number, bregaApplies: boolean, ivaType: string) {
    const brecha = bregaApplies ? bregaGlobalPct : 0;
    return costUsd * (1 + brecha / 100) * (1 + gananciaPct / 100) * IVA_MULTIPLIERS[ivaType];
  }

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setModalOpen(true);
  }

  function openEdit(product: Product) {
    setEditingId(product.id);
    setForm({
      code: product.code,
      barcode: product.barcode || '',
      supplierRef: product.supplierRef || '',
      name: product.name,
      description: product.description || '',
      categoryId: product.categoryId || '',
      brandId: product.brandId || '',
      supplierId: product.supplierId || '',
      purchaseUnit: product.purchaseUnit,
      saleUnit: product.saleUnit,
      conversionFactor: product.conversionFactor,
      costUsd: product.costUsd,
      bregaApplies: product.bregaApplies,
      gananciaPct: product.gananciaPct,
      gananciaMayorPct: product.gananciaMayorPct,
      ivaType: product.ivaType,
      minStock: product.minStock,
      isActive: product.isActive,
    });
    setModalOpen(true);
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
      if (!editingId && form.code) body.code = form.code;

      const url = editingId ? `/api/proxy/products/${editingId}` : '/api/proxy/products';
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setModalOpen(false);
        fetchProducts();
        setMessage({ type: 'success', text: editingId ? 'Producto actualizado' : 'Producto creado' });
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Desactivar este producto?')) return;
    const res = await fetch(`/api/proxy/products/${id}`, { method: 'DELETE' });
    if (res.ok) fetchProducts();
  }

  const previewDetal = calcPreviewPrice(Number(form.costUsd), Number(form.gananciaPct), form.bregaApplies, form.ivaType);
  const previewMayor = calcPreviewPrice(Number(form.costUsd), Number(form.gananciaMayorPct), form.bregaApplies, form.ivaType);

  // Flatten categories for select
  const allCategories: { id: string; name: string; isChild: boolean }[] = [];
  categories.forEach(cat => {
    allCategories.push({ id: cat.id, name: cat.name, isChild: false });
    cat.children?.forEach(child => {
      allCategories.push({ id: child.id, name: `  ${child.name}`, isChild: true });
    });
  });

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <Package className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Productos</h1>
            <p className="text-slate-400 text-sm">{total} productos registrados</p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nuevo producto
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Buscar por nombre, codigo, barcode..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="input-field pl-9 !py-2.5 text-sm"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
            className="input-field !py-2.5 text-sm"
          >
            <option value="">Todas las categorias</option>
            {allCategories.map(c => (
              <option key={c.id} value={c.id}>{c.isChild ? `└ ${c.name.trim()}` : c.name}</option>
            ))}
          </select>
          <select
            value={filterBrand}
            onChange={(e) => { setFilterBrand(e.target.value); setPage(1); }}
            className="input-field !py-2.5 text-sm"
          >
            <option value="">Todas las marcas</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select
            value={filterSupplier}
            onChange={(e) => { setFilterSupplier(e.target.value); setPage(1); }}
            className="input-field !py-2.5 text-sm"
          >
            <option value="">Todos los proveedores</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={lowStock}
              onChange={(e) => { setLowStock(e.target.checked); setPage(1); }}
              className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40"
            />
            <AlertTriangle size={14} className="text-amber-400" />
            Solo stock bajo
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Codigo</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Categoria</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Marca</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden xl:table-cell">Proveedor</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Precio USD</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Precio Bs</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Stock</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium w-20">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-12">
                  <Loader2 className="animate-spin text-green-500 mx-auto" size={28} />
                </td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-slate-500">
                  No se encontraron productos
                </td></tr>
              ) : products.map(product => {
                const totalStock = getTotalStock(product);
                const isLow = totalStock < product.minStock;
                return (
                  <tr key={product.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded">
                        {product.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white font-medium">{product.name}</td>
                    <td className="px-4 py-3 text-slate-400 hidden lg:table-cell">{product.category?.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 hidden lg:table-cell">{product.brand?.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 hidden xl:table-cell">{product.supplier?.name || '—'}</td>
                    <td className="px-4 py-3 text-right text-white font-mono">
                      ${product.priceDetal.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300 font-mono hidden md:table-cell">
                      {exchangeRate > 0 ? `Bs ${(product.priceDetal * exchangeRate).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-mono ${isLow ? 'text-amber-400' : 'text-white'}`}>
                        {totalStock}
                      </span>
                      {isLow && <AlertTriangle size={12} className="inline ml-1 text-amber-400" />}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {product.isActive ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Activo</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Inactivo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEdit(product)}
                          className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                          title="Desactivar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <span className="text-sm text-slate-400">
              Pagina {page} de {totalPages} ({total} productos)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal create/edit */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-white">
                {editingId ? 'Editar producto' : 'Nuevo producto'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5">
              {/* Basic fields */}
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Datos basicos</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Codigo</label>
                    <input
                      type="text"
                      value={form.code}
                      onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))}
                      className="input-field !py-2 text-sm"
                      placeholder="Auto-generado"
                      disabled={!!editingId}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Barcode</label>
                    <input
                      type="text"
                      value={form.barcode}
                      onChange={(e) => setForm(f => ({ ...f, barcode: e.target.value }))}
                      className="input-field !py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Ref. Proveedor</label>
                    <input
                      type="text"
                      value={form.supplierRef}
                      onChange={(e) => setForm(f => ({ ...f, supplierRef: e.target.value }))}
                      className="input-field !py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Nombre *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                      className="input-field !py-2 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Descripcion</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                      className="input-field !py-2 text-sm"
                      rows={2}
                    />
                  </div>
                </div>
              </div>

              {/* Classification */}
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Clasificacion</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Categoria</label>
                    <select
                      value={form.categoryId}
                      onChange={(e) => setForm(f => ({ ...f, categoryId: e.target.value }))}
                      className="input-field !py-2 text-sm"
                    >
                      <option value="">Sin categoria</option>
                      {allCategories.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.isChild ? `└ ${c.name.trim()}` : c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Marca</label>
                    <select
                      value={form.brandId}
                      onChange={(e) => setForm(f => ({ ...f, brandId: e.target.value }))}
                      className="input-field !py-2 text-sm"
                    >
                      <option value="">Sin marca</option>
                      {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Proveedor principal</label>
                    <select
                      value={form.supplierId}
                      onChange={(e) => setForm(f => ({ ...f, supplierId: e.target.value }))}
                      className="input-field !py-2 text-sm"
                    >
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
                    <input
                      type="text"
                      value={form.purchaseUnit}
                      onChange={(e) => setForm(f => ({ ...f, purchaseUnit: e.target.value }))}
                      className="input-field !py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Unidad de venta</label>
                    <input
                      type="text"
                      value={form.saleUnit}
                      onChange={(e) => setForm(f => ({ ...f, saleUnit: e.target.value }))}
                      className="input-field !py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Factor conversion</label>
                    <input
                      type="number"
                      step="0.001"
                      value={form.conversionFactor}
                      onChange={(e) => setForm(f => ({ ...f, conversionFactor: Number(e.target.value) }))}
                      className="input-field !py-2 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Precios</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">IVA</label>
                    <select
                      value={form.ivaType}
                      onChange={(e) => setForm(f => ({ ...f, ivaType: e.target.value }))}
                      className="input-field !py-2 text-sm"
                    >
                      {IVA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none pb-2">
                      <input
                        type="checkbox"
                        checked={form.bregaApplies}
                        onChange={(e) => setForm(f => ({ ...f, bregaApplies: e.target.checked }))}
                        className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40"
                      />
                      Aplica brecha ({bregaGlobalPct}%)
                    </label>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Costo USD</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.costUsd}
                      onChange={(e) => setForm(f => ({ ...f, costUsd: Number(e.target.value) }))}
                      className="input-field !py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Ganancia Detal %</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.gananciaPct}
                      onChange={(e) => setForm(f => ({ ...f, gananciaPct: Number(e.target.value) }))}
                      className="input-field !py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Ganancia Mayor %</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.gananciaMayorPct}
                      onChange={(e) => setForm(f => ({ ...f, gananciaMayorPct: Number(e.target.value) }))}
                      className="input-field !py-2 text-sm"
                    />
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
                    <input
                      type="number"
                      step="1"
                      value={form.minStock}
                      onChange={(e) => setForm(f => ({ ...f, minStock: Number(e.target.value) }))}
                      className="input-field !py-2 text-sm"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none pb-2">
                      <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))}
                        className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40"
                      />
                      Producto activo
                    </label>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="btn-secondary !py-2.5 text-sm"
                >
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
                  {saving && <Loader2 className="animate-spin" size={16} />}
                  {editingId ? 'Guardar cambios' : 'Crear producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
