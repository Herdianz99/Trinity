'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, Search, Plus, Trash2, Check, Save,
  Package, Settings, ClipboardList, BarChart3, Printer,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// ── Types ──────────────────────────────────────────────
interface Category { id: string; name: string; children?: Category[]; }
interface Brand { id: string; name: string; }
interface Supplier { id: string; name: string; }

interface CountItem {
  id: string;
  productId: string;
  product: {
    id: string;
    code: string;
    name: string;
    category: { id: string; name: string } | null;
    brand: { id: string; name: string } | null;
  };
  systemQuantity: number;
  countedQuantity: number | null;
  difference: number | null;
}

interface CountDetail {
  id: string;
  warehouse: { id: string; name: string };
  status: 'DRAFT' | 'IN_PROGRESS' | 'APPROVED' | 'CANCELLED';
  notes: string | null;
  items: CountItem[];
}

interface PreviewProduct {
  id: string;
  code: string;
  name: string;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  stock: { quantity: number; warehouse: { id: string; name: string } }[];
}

// ── Constants ──────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  IN_PROGRESS: 'En progreso',
  APPROVED: 'Aprobado',
  CANCELLED: 'Cancelado',
};

const STATUS_BADGES: Record<string, string> = {
  DRAFT: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  IN_PROGRESS: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  APPROVED: 'bg-green-500/10 text-green-400 border-green-500/20',
  CANCELLED: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function InventoryCountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  // ── State ──────────────────────────────────────────
  const [count, setCount] = useState<CountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Configure tab state
  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [previewProducts, setPreviewProducts] = useState<PreviewProduct[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  // Count tab state
  const [countValues, setCountValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  // ── Data fetching ──────────────────────────────────
  const fetchCount = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/inventory-counts/${id}`);
      if (res.ok) {
        const data = await res.json();
        setCount(data);
        // Pre-fill count values
        const vals: Record<string, number> = {};
        data.items.forEach((item: CountItem) => {
          if (item.countedQuantity !== null) vals[item.productId] = item.countedQuantity;
        });
        setCountValues(vals);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchMeta = useCallback(async () => {
    const [catRes, brandRes, suppRes, meRes] = await Promise.all([
      fetch('/api/proxy/categories'),
      fetch('/api/proxy/brands'),
      fetch('/api/proxy/suppliers'),
      fetch('/api/auth/me'),
    ]);
    if (catRes.ok) setCategories(await catRes.json());
    if (brandRes.ok) setBrands(await brandRes.json());
    if (suppRes.ok) setSuppliers(await suppRes.json());
    if (meRes.ok) { const u = await meRes.json(); setUserRole(u.role); }
  }, []);

  useEffect(() => { fetchCount(); }, [fetchCount]);
  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => {
    if (count) {
      document.title = `Conteo - ${count.warehouse.name} | Trinity ERP`;
    }
  }, [count]);

  // ── Flatten categories ─────────────────────────────
  const allCategories: { id: string; name: string; isChild: boolean }[] = [];
  categories.forEach(cat => {
    allCategories.push({ id: cat.id, name: cat.name, isChild: false });
    cat.children?.forEach(child => {
      allCategories.push({ id: child.id, name: child.name, isChild: true });
    });
  });

  // ── Existing product IDs (to mark already-added in preview) ──
  const existingProductIds = new Set(count?.items.map(i => i.productId) ?? []);

  // ── Search/Preview (auto-trigger on filter change) ──
  const fetchPreview = useCallback(async () => {
    if (!searchText && !filterCategory && !filterBrand && !filterSupplier) {
      setPreviewProducts([]);
      return;
    }
    setPreviewLoading(true);
    setSelectedIds(new Set());
    try {
      const params = new URLSearchParams();
      params.set('limit', '200');
      if (searchText) params.set('search', searchText);
      if (filterCategory) params.set('categoryId', filterCategory);
      if (filterBrand) params.set('brandId', filterBrand);
      if (filterSupplier) params.set('supplierId', filterSupplier);
      const res = await fetch(`/api/proxy/products?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPreviewProducts(data.data || []);
      }
    } catch { /* ignore */ } finally {
      setPreviewLoading(false);
    }
  }, [searchText, filterCategory, filterBrand, filterSupplier]);

  useEffect(() => {
    const timer = setTimeout(fetchPreview, 300);
    return () => clearTimeout(timer);
  }, [fetchPreview]);

  function toggleSelected(productId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleSelectAll() {
    const available = previewProducts.filter(p => !existingProductIds.has(p.id));
    if (selectedIds.size === available.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(available.map(p => p.id)));
    }
  }

  // ── Add products ───────────────────────────────────
  async function handleAddByIds() {
    if (selectedIds.size === 0) return;
    setAdding(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/inventory-counts/${id}/items/by-ids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: Array.from(selectedIds) }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessage({ type: 'success', text: `${data.added} producto(s) agregado(s)` });
        setSelectedIds(new Set());
        fetchCount();
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setAdding(false);
    }
  }

  async function handleAddByFilter() {
    if (!searchText && !filterCategory && !filterBrand && !filterSupplier) return;
    if (!confirm(`Agregar todos los ${previewProducts.length} productos que coinciden con los filtros?`)) return;
    setAdding(true);
    setMessage(null);
    try {
      const body: any = {};
      if (searchText) body.search = searchText;
      if (filterCategory) body.categoryId = filterCategory;
      if (filterBrand) body.brandId = filterBrand;
      if (filterSupplier) body.supplierId = filterSupplier;
      const res = await fetch(`/api/proxy/inventory-counts/${id}/items/by-filter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setMessage({ type: 'success', text: `${data.added} producto(s) agregado(s)` });
        fetchCount();
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setAdding(false);
    }
  }

  // ── Remove products ────────────────────────────────
  async function handleRemoveItem(productId: string) {
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/inventory-counts/${id}/items/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: [productId] }),
      });
      if (res.ok) fetchCount();
    } catch { /* ignore */ }
  }

  async function handleRemoveAll() {
    if (!count || count.items.length === 0) return;
    if (!confirm(`Eliminar los ${count.items.length} productos del conteo?`)) return;
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/inventory-counts/${id}/items/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: count.items.map(i => i.productId) }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Todos los productos eliminados' });
        fetchCount();
      }
    } catch { /* ignore */ }
  }

  // ── Start count (DRAFT → IN_PROGRESS) ──────────────
  async function handleStartCount() {
    if (!count) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/inventory-counts/${id}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [] }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Conteo iniciado' });
        fetchCount();
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  // ── Save count quantities ──────────────────────────
  async function handleSaveQuantities() {
    if (!count) return;
    setSaving(true);
    setMessage(null);
    try {
      const items = Object.entries(countValues).map(([productId, countedQuantity]) => ({
        productId,
        countedQuantity: Number(countedQuantity),
      }));
      if (items.length === 0) {
        setMessage({ type: 'error', text: 'Ingresa al menos una cantidad' });
        setSaving(false);
        return;
      }
      const res = await fetch(`/api/proxy/inventory-counts/${id}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Cantidades guardadas' });
        fetchCount();
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  // ── Approve (auto-saves quantities first) ──────────
  async function handleApprove() {
    if (!confirm('Aprobar este conteo? Se ajustara el stock automaticamente.')) return;
    setSaving(true);
    setMessage(null);
    try {
      // Save pending quantities before approving
      const items = Object.entries(countValues).map(([productId, countedQuantity]) => ({
        productId,
        countedQuantity: Number(countedQuantity),
      }));
      if (items.length > 0) {
        const saveRes = await fetch(`/api/proxy/inventory-counts/${id}/items`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
        });
        if (!saveRes.ok) {
          const err = await saveRes.json().catch(() => ({}));
          throw new Error(err.message || 'Error al guardar cantidades');
        }
      }

      const res = await fetch(`/api/proxy/inventory-counts/${id}/approve`, { method: 'PATCH' });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Conteo aprobado y stock ajustado' });
        fetchCount();
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  const canApprove = userRole === 'ADMIN' || userRole === 'SUPERVISOR';

  // ── Loading state ──────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-green-500" size={32} />
      </div>
    );
  }

  if (!count) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">Conteo no encontrado</p>
        <button onClick={() => router.push('/inventory/count')} className="btn-secondary mt-4 text-sm">
          Volver
        </button>
      </div>
    );
  }

  // ── Approved results calculations ──────────────────
  const totalItems = count.items.length;
  const itemsWithDiff = count.items.filter(i => i.difference !== null && i.difference !== 0).length;
  const totalSobrante = count.items.reduce((sum, i) => sum + Math.max(0, i.difference ?? 0), 0);
  const totalFaltante = count.items.reduce((sum, i) => sum + Math.abs(Math.min(0, i.difference ?? 0)), 0);

  // ── Determine active tab and available tabs ────────
  const isDraft = count.status === 'DRAFT';
  const isInProgress = count.status === 'IN_PROGRESS';
  const isApproved = count.status === 'APPROVED';

  const defaultTab = isApproved ? 'results' : isInProgress ? 'count' : 'configure';

  // Get stock for a product in the count's warehouse
  function getWarehouseStock(product: PreviewProduct): number {
    const s = product.stock?.find(s => s.warehouse.id === count!.warehouse.id);
    return s?.quantity ?? 0;
  }

  return (
    <div>
      {/* Back link */}
      <button
        onClick={() => router.push('/inventory/count')}
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm mb-4"
      >
        <ArrowLeft size={16} /> Volver a conteos
      </button>

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">{count.warehouse.name}</h1>
            <span className={`text-xs px-2.5 py-0.5 rounded-full border ${STATUS_BADGES[count.status]}`}>
              {STATUS_LABELS[count.status] || count.status}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <span>{totalItems} producto(s)</span>
            {count.notes && <span>— {count.notes}</span>}
          </div>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <Tabs key={count.status} defaultValue={defaultTab}>
        <TabsList>
          {(isDraft || isInProgress) && (
            <TabsTrigger value="configure">
              <Settings size={14} className="mr-1.5" />
              Configurar
            </TabsTrigger>
          )}
          {(isDraft || isInProgress) && (
            <TabsTrigger value="products">
              <Package size={14} className="mr-1.5" />
              Productos ({totalItems})
            </TabsTrigger>
          )}
          {isInProgress && (
            <TabsTrigger value="count">
              <ClipboardList size={14} className="mr-1.5" />
              Contar
            </TabsTrigger>
          )}
          {isApproved && (
            <TabsTrigger value="results">
              <BarChart3 size={14} className="mr-1.5" />
              Resultados
            </TabsTrigger>
          )}
        </TabsList>

        {/* ═══ TAB: Configurar ═══ */}
        <TabsContent value="configure">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Buscar productos para agregar</h3>

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  type="text"
                  placeholder="Buscar: lijas, discos, mechas..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="input-field pl-9 !py-2.5 text-sm"
                />
              </div>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="input-field !py-2.5 text-sm"
              >
                <option value="">Todas las categorias</option>
                {allCategories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.isChild ? `└ ${c.name}` : c.name}
                  </option>
                ))}
              </select>
              <select
                value={filterBrand}
                onChange={(e) => setFilterBrand(e.target.value)}
                className="input-field !py-2.5 text-sm"
              >
                <option value="">Todas las marcas</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select
                value={filterSupplier}
                onChange={(e) => setFilterSupplier(e.target.value)}
                className="input-field !py-2.5 text-sm"
              >
                <option value="">Todos los proveedores</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* Results count */}
            {(searchText || filterCategory || filterBrand || filterSupplier) && (
              <div className="flex items-center gap-2 mb-4">
                {previewLoading ? (
                  <Loader2 className="animate-spin text-slate-500" size={16} />
                ) : (
                  <span className="text-xs text-slate-400">{previewProducts.length} resultado(s)</span>
                )}
              </div>
            )}

            {/* Preview table */}
            {previewProducts.length > 0 && (
              <>
                <div className="overflow-x-auto border border-slate-700/50 rounded-lg mb-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50 bg-slate-800/50">
                        <th className="px-3 py-2 w-10">
                          <input
                            type="checkbox"
                            checked={selectedIds.size > 0 && selectedIds.size === previewProducts.filter(p => !existingProductIds.has(p.id)).length}
                            onChange={toggleSelectAll}
                            className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40"
                          />
                        </th>
                        <th className="text-left px-3 py-2 text-slate-400 font-medium">Codigo</th>
                        <th className="text-left px-3 py-2 text-slate-400 font-medium">Nombre</th>
                        <th className="text-left px-3 py-2 text-slate-400 font-medium hidden md:table-cell">Categoria</th>
                        <th className="text-left px-3 py-2 text-slate-400 font-medium hidden md:table-cell">Marca</th>
                        <th className="text-right px-3 py-2 text-slate-400 font-medium">Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewProducts.map(p => {
                        const alreadyAdded = existingProductIds.has(p.id);
                        return (
                          <tr key={p.id} className={`border-b border-slate-700/30 ${alreadyAdded ? 'opacity-40' : 'hover:bg-slate-800/40'}`}>
                            <td className="px-3 py-2">
                              {alreadyAdded ? (
                                <span className="text-xs text-green-500">Ya</span>
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(p.id)}
                                  onChange={() => toggleSelected(p.id)}
                                  className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40"
                                />
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-green-400">{p.code}</td>
                            <td className="px-3 py-2 text-white">{p.name}</td>
                            <td className="px-3 py-2 text-slate-400 text-xs hidden md:table-cell">{p.category?.name || '—'}</td>
                            <td className="px-3 py-2 text-slate-400 text-xs hidden md:table-cell">{p.brand?.name || '—'}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-300">{getWarehouseStock(p)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleAddByIds}
                    disabled={adding || selectedIds.size === 0}
                    className="btn-primary !py-2 text-sm flex items-center gap-2"
                  >
                    {adding ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                    Agregar seleccionados ({selectedIds.size})
                  </button>
                  <button
                    onClick={handleAddByFilter}
                    disabled={adding}
                    className="btn-secondary !py-2 text-sm flex items-center gap-2"
                  >
                    <Plus size={16} />
                    Agregar todos los coincidentes ({previewProducts.filter(p => !existingProductIds.has(p.id)).length})
                  </button>
                </div>
              </>
            )}
          </div>
        </TabsContent>

        {/* ═══ TAB: Productos ═══ */}
        <TabsContent value="products">
          <div className="card overflow-hidden">
            {count.items.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Package size={40} className="mx-auto mb-3 opacity-40" />
                <p>No hay productos en este conteo</p>
                <p className="text-xs mt-1">Usa la pestaña "Configurar" para agregar productos</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
                  <span className="text-sm text-slate-400">{count.items.length} producto(s)</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => window.open(`/api/proxy/inventory-counts/${id}/pdf-count-sheet`)}
                      className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                    >
                      <Printer size={12} /> Imprimir hoja de conteo
                    </button>
                    {isDraft && (
                      <button
                        onClick={handleRemoveAll}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
                      >
                        <Trash2 size={12} /> Eliminar todos
                      </button>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="text-left px-4 py-3 text-slate-400 font-medium">Codigo</th>
                        <th className="text-left px-4 py-3 text-slate-400 font-medium">Nombre</th>
                        <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Categoria</th>
                        <th className="text-right px-4 py-3 text-slate-400 font-medium">Stock sistema</th>
                        {isDraft && <th className="w-12"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {count.items.map(item => (
                        <tr key={item.id} className="border-b border-slate-700/30 hover:bg-slate-800/40">
                          <td className="px-4 py-2.5 font-mono text-xs text-green-400">{item.product.code}</td>
                          <td className="px-4 py-2.5 text-white">{item.product.name}</td>
                          <td className="px-4 py-2.5 text-slate-400 text-xs hidden md:table-cell">{item.product.category?.name || '—'}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-300">{item.systemQuantity}</td>
                          {isDraft && (
                            <td className="px-2 py-2.5 text-center">
                              <button
                                onClick={() => handleRemoveItem(item.productId)}
                                className="p-1 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
                                title="Eliminar"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Start counting button — only visible in DRAFT with products */}
          {isDraft && count.items.length > 0 && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleStartCount}
                disabled={saving}
                className="btn-primary !py-2.5 text-sm flex items-center gap-2"
              >
                {saving && <Loader2 className="animate-spin" size={16} />}
                <ClipboardList size={16} /> Iniciar conteo
              </button>
            </div>
          )}
        </TabsContent>

        {/* ═══ TAB: Contar ═══ */}
        <TabsContent value="count">
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Codigo</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Producto</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Stock sistema</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Conteo fisico</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {count.items.map(item => {
                    const counted = countValues[item.productId];
                    const diff = counted !== undefined ? counted - item.systemQuantity : null;
                    return (
                      <tr key={item.id} className="border-b border-slate-700/30">
                        <td className="px-4 py-2.5 font-mono text-xs text-green-400">{item.product.code}</td>
                        <td className="px-4 py-2.5 text-white">{item.product.name}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-300">{item.systemQuantity}</td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={countValues[item.productId] ?? ''}
                            onChange={(e) => setCountValues(v => ({
                              ...v,
                              [item.productId]: Number(e.target.value),
                            }))}
                            className="input-field !py-1 text-sm w-24 text-right font-mono"
                            placeholder="—"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          {diff !== null ? (
                            <span className={diff === 0 ? 'text-green-400' : 'text-red-400'}>
                              {diff > 0 ? '+' : ''}{diff}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-3">
            <button
              onClick={handleSaveQuantities}
              disabled={saving}
              className="btn-secondary !py-2.5 text-sm flex items-center gap-2"
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Guardar cantidades
            </button>
            {canApprove && (
              <button
                onClick={handleApprove}
                disabled={saving}
                className="btn-primary !py-2.5 text-sm flex items-center gap-2"
              >
                <Check size={16} /> Aprobar conteo
              </button>
            )}
          </div>
        </TabsContent>

        {/* ═══ TAB: Resultados ═══ */}
        <TabsContent value="results">
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="card p-4">
              <p className="text-xs text-slate-400 mb-1">Total productos</p>
              <p className="text-2xl font-bold text-white">{totalItems}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-400 mb-1">Con diferencia</p>
              <p className="text-2xl font-bold text-red-400">{itemsWithDiff}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-400 mb-1">Sobrante total</p>
              <p className="text-2xl font-bold text-blue-400">+{totalSobrante}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-400 mb-1">Faltante total</p>
              <p className="text-2xl font-bold text-red-400">-{totalFaltante}</p>
            </div>
          </div>

          {/* Print button */}
          {itemsWithDiff > 0 && (
            <div className="flex justify-end mb-4">
              <button
                onClick={() => window.open(`/api/proxy/inventory-counts/${id}/pdf-differences`)}
                className="btn-secondary !py-2 text-sm flex items-center gap-2"
              >
                <Printer size={16} /> Imprimir diferencias
              </button>
            </div>
          )}

          {/* Results table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Codigo</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Producto</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Stock sistema</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Contado</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {count.items.map(item => (
                    <tr key={item.id} className="border-b border-slate-700/30">
                      <td className="px-4 py-2.5 font-mono text-xs text-green-400">{item.product.code}</td>
                      <td className="px-4 py-2.5 text-white">{item.product.name}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-300">{item.systemQuantity}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-white">{item.countedQuantity ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        {item.difference !== null ? (
                          <span className={item.difference === 0 ? 'text-green-400' : 'text-red-400'}>
                            {item.difference > 0 ? '+' : ''}{item.difference}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
