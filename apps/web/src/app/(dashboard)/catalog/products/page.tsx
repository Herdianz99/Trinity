'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Package, Plus, Search, ChevronLeft, ChevronRight,
  Edit2, Trash2, Loader2, AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';

interface Product {
  id: string;
  code: string;
  barcode: string | null;
  name: string;
  categoryId: string | null;
  brandId: string | null;
  supplierId: string | null;
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

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [exchangeRate, setExchangeRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [lowStock, setLowStock] = useState(false);
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
    const [catRes, brandRes, supRes, rateRes] = await Promise.all([
      fetch('/api/proxy/categories'),
      fetch('/api/proxy/brands'),
      fetch('/api/proxy/suppliers'),
      fetch('/api/proxy/exchange-rate/today'),
    ]);
    if (catRes.ok) setCategories(await catRes.json());
    if (brandRes.ok) setBrands(await brandRes.json());
    if (supRes.ok) setSuppliers(await supRes.json());
    if (rateRes.ok) {
      const text = await rateRes.text();
      if (text) { try { const rate = JSON.parse(text); setExchangeRate(rate.rate || 0); } catch {} }
    }
  }, []);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  function getTotalStock(product: Product) {
    return product.stock?.reduce((sum, s) => sum + s.quantity, 0) || 0;
  }

  async function handleDelete(id: string) {
    if (!confirm('Desactivar este producto?')) return;
    const res = await fetch(`/api/proxy/products/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchProducts();
      setMessage({ type: 'success', text: 'Producto desactivado' });
    }
  }

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
        <Link href="/catalog/products/new" className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nuevo producto
        </Link>
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
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden xl:table-cell">Area de impresion</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Precio USD</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Precio Bs</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Stock</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium w-20">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="text-center py-12">
                  <Loader2 className="animate-spin text-green-500 mx-auto" size={28} />
                </td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-slate-500">
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
                    <td className="px-4 py-3">
                      <Link
                        href={`/catalog/products/${product.code}`}
                        className="text-white font-medium hover:text-green-400 transition-colors"
                      >
                        {product.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-400 hidden lg:table-cell">{product.category?.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 hidden lg:table-cell">{product.brand?.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 hidden xl:table-cell">{product.supplier?.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 hidden xl:table-cell">{product.category?.printArea?.name || '—'}</td>
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
                        <Link
                          href={`/catalog/products/${product.code}`}
                          className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={14} />
                        </Link>
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
    </div>
  );
}
