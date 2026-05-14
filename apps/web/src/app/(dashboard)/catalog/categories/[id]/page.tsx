'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Layers, Save, Loader2, ChevronLeft, ChevronRight, ExternalLink, LogOut,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface Category {
  id: string;
  name: string;
  code: string | null;
  commissionPct: number;
  parentId: string | null;
  printAreaId: string | null;
  printArea: { id: string; name: string } | null;
  parent: { id: string; name: string; code: string | null } | null;
  children: { id: string; name: string; code: string | null }[];
}

interface PrintArea {
  id: string;
  name: string;
}

interface Product {
  id: string;
  code: string;
  name: string;
  priceUsd: number;
  stock: { quantity: number }[];
  isActive: boolean;
}

export default function CategoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [category, setCategory] = useState<Category | null>(null);
  const [printAreas, setPrintAreas] = useState<PrintArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [activeTab, setActiveTab] = useState('info');

  // Products
  const [products, setProducts] = useState<Product[]>([]);
  const [prodLoading, setProdLoading] = useState(false);
  const [prodPage, setProdPage] = useState(1);
  const [prodTotalPages, setProdTotalPages] = useState(0);
  const [prodTotal, setProdTotal] = useState(0);

  const fetchCategory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/categories/${id}`);
      if (!res.ok) throw new Error('Categoria no encontrada');
      const data = await res.json();
      setCategory(data);
      setForm({
        name: data.name,
        code: data.code || '',
        printAreaId: data.printAreaId || '',
        commissionPct: String(data.commissionPct || 0),
      });
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [id]);

  const fetchPrintAreas = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/print-areas');
      if (res.ok) setPrintAreas(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchProducts = useCallback(async () => {
    setProdLoading(true);
    try {
      const res = await fetch(`/api/proxy/products?categoryId=${id}&page=${prodPage}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.data || []);
        setProdTotalPages(data.totalPages || Math.ceil((data.total || 0) / 20));
        setProdTotal(data.total || 0);
      }
    } catch { /* ignore */ } finally { setProdLoading(false); }
  }, [id, prodPage]);

  useEffect(() => { fetchCategory(); fetchPrintAreas(); }, [fetchCategory, fetchPrintAreas]);

  useEffect(() => {
    if (activeTab === 'products') fetchProducts();
  }, [activeTab, prodPage, fetchProducts]);

  async function handleSave(e?: React.FormEvent): Promise<boolean> {
    if (e) e.preventDefault();
    setSaving(true); setSaveMsg(null);
    try {
      const isRoot = !category?.parentId;
      const body: Record<string, unknown> = { name: form.name };
      if (isRoot) {
        body.code = form.code?.toUpperCase();
        body.printAreaId = form.printAreaId || null;
        body.commissionPct = parseFloat(form.commissionPct) || 0;
      }
      const res = await fetch(`/api/proxy/categories/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.ok) {
        setSaveMsg({ type: 'success', text: 'Categoria actualizada' });
        fetchCategory();
        return true;
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) {
      setSaveMsg({ type: 'error', text: err.message });
      return false;
    } finally { setSaving(false); }
  }

  async function handleSaveAndExit() {
    const ok = await handleSave();
    if (ok) router.push('/catalog/categories');
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-green-500" size={32} /></div>;
  if (error || !category) return (
    <div className="text-center py-20">
      <p className="text-red-400 mb-4">{error || 'Categoria no encontrada'}</p>
      <button onClick={() => router.push('/catalog/categories')} className="btn-secondary">Volver a categorias</button>
    </div>
  );

  const isRoot = !category.parentId;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => router.push('/catalog/categories')} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <Layers className="text-amber-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">
            {category.code && <span className="text-amber-400 font-mono tracking-wider mr-2">{category.code}</span>}
            {category.name}
          </h1>
          <p className="text-slate-400 text-sm">
            {isRoot ? 'Categoria raiz' : `Subcategoria de ${category.parent?.name || '—'}`}
          </p>
        </div>
      </div>

      {saveMsg && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${saveMsg.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {saveMsg.text}
        </div>
      )}

      <Tabs defaultValue="info" onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="info">Informacion General</TabsTrigger>
          <TabsTrigger value="products">Productos</TabsTrigger>
        </TabsList>

        {/* ═══ TAB: Info ═══ */}
        <TabsContent value="info">
          <form onSubmit={handleSave} className="card p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {isRoot && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Codigo (3 letras) *</label>
                  <input
                    type="text"
                    value={form.code || ''}
                    onChange={e => setForm((f: any) => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) }))}
                    className="input-field !py-2 text-sm uppercase font-mono tracking-wider"
                    maxLength={3}
                    readOnly={category.children && category.children.length > 0}
                  />
                  {category.children && category.children.length > 0 && (
                    <p className="text-[10px] text-slate-500 mt-0.5">No editable — tiene subcategorias</p>
                  )}
                </div>
              )}
              <div className={isRoot ? '' : 'md:col-span-2'}>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nombre *</label>
                <input type="text" value={form.name || ''} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} className="input-field !py-2 text-sm" required />
              </div>
              {isRoot && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Area de impresion</label>
                  <select
                    value={form.printAreaId || ''}
                    onChange={e => setForm((f: any) => ({ ...f, printAreaId: e.target.value }))}
                    className="input-field !py-2 text-sm"
                  >
                    <option value="">Sin area</option>
                    {printAreas.map(pa => (
                      <option key={pa.id} value={pa.id}>{pa.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {isRoot && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Comision %</label>
                  <input
                    type="number"
                    value={form.commissionPct ?? '0'}
                    onChange={e => setForm((f: any) => ({ ...f, commissionPct: e.target.value }))}
                    className="input-field !py-2 text-sm"
                    min="0" max="100" step="0.1"
                  />
                </div>
              )}
            </div>

            {/* Parent (read-only for subcategories) */}
            {!isRoot && category.parent && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Categoria padre</label>
                <div className="input-field !py-2 text-sm bg-slate-800/60 text-slate-300 cursor-default">
                  <button type="button" onClick={() => router.push(`/catalog/categories/${category.parent!.id}`)} className="text-amber-400 hover:underline">
                    {category.parent.code && <span className="font-mono tracking-wider mr-1">{category.parent.code}</span>}
                    {category.parent.name}
                  </button>
                </div>
              </div>
            )}

            {/* Subcategories (read-only for root) */}
            {isRoot && category.children && category.children.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Subcategorias ({category.children.length})</label>
                <div className="flex flex-wrap gap-2">
                  {category.children.map(child => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => router.push(`/catalog/categories/${child.id}`)}
                      className="text-xs px-2.5 py-1 rounded-full bg-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-600/40 transition-colors"
                    >
                      {child.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveAndExit}
                className="btn-secondary !py-2.5 text-sm flex items-center gap-2"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <LogOut size={16} />}
                Guardar y salir
              </button>
              <button type="submit" disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                Guardar cambios
              </button>
            </div>
          </form>
        </TabsContent>

        {/* ═══ TAB: Productos ═══ */}
        <TabsContent value="products">
          <div className="card overflow-hidden">
            {prodLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-green-500" size={24} /></div>
            ) : (
              <>
                {prodTotal > 0 && (
                  <div className="px-4 py-3 border-b border-slate-700/50 text-sm text-slate-400">
                    {prodTotal} producto{prodTotal !== 1 ? 's' : ''} en esta categoria
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Codigo</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Nombre</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">Precio USD</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Stock</th>
                      <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                      <th className="text-center px-4 py-3 text-slate-400 font-medium w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-8 text-slate-500">Sin productos en esta categoria</td></tr>
                    ) : products.map(p => (
                      <tr key={p.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 font-mono text-amber-400 text-xs">{p.code}</td>
                        <td className="px-4 py-3 text-white">{p.name}</td>
                        <td className="px-4 py-3 text-right font-mono text-white">${Number(p.priceUsd).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-300 hidden md:table-cell">{p.stock?.reduce((s, st) => s + st.quantity, 0) || 0}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${p.isActive ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-red-400 border-red-500/30 bg-red-500/10'}`}>
                            {p.isActive ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => router.push(`/catalog/products/${p.code}`)} className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 mx-auto">
                            Ver <ExternalLink size={10} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {prodTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
                    <span className="text-sm text-slate-400">Pagina {prodPage} de {prodTotalPages}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setProdPage(p => Math.max(1, p - 1))} disabled={prodPage <= 1} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"><ChevronLeft size={16} /></button>
                      <button onClick={() => setProdPage(p => Math.min(prodTotalPages, p + 1))} disabled={prodPage >= prodTotalPages} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"><ChevronRight size={16} /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
