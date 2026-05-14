'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Tag, Save, Loader2, ChevronLeft, ChevronRight, ExternalLink, LogOut,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface Brand {
  id: string;
  name: string;
}

interface Product {
  id: string;
  code: string;
  name: string;
  category: { name: string } | null;
  priceUsd: number;
  stock: { quantity: number }[];
}

export default function BrandDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [brand, setBrand] = useState<Brand | null>(null);
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

  const fetchBrand = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/brands/${id}`);
      if (!res.ok) throw new Error('Marca no encontrada');
      const data = await res.json();
      setBrand(data);
      setForm({ name: data.name });
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [id]);

  const fetchProducts = useCallback(async () => {
    setProdLoading(true);
    try {
      const res = await fetch(`/api/proxy/products?brandId=${id}&page=${prodPage}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.data || []);
        setProdTotalPages(data.totalPages || Math.ceil((data.total || 0) / 20));
        setProdTotal(data.total || 0);
      }
    } catch { /* ignore */ } finally { setProdLoading(false); }
  }, [id, prodPage]);

  useEffect(() => { fetchBrand(); }, [fetchBrand]);

  useEffect(() => {
    if (activeTab === 'products') fetchProducts();
  }, [activeTab, prodPage, fetchProducts]);

  async function handleSave(e?: React.FormEvent): Promise<boolean> {
    if (e) e.preventDefault();
    setSaving(true); setSaveMsg(null);
    try {
      const res = await fetch(`/api/proxy/brands/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name }),
      });
      if (res.ok) {
        setSaveMsg({ type: 'success', text: 'Marca actualizada' });
        fetchBrand();
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
    if (ok) router.push('/catalog/brands');
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-green-500" size={32} /></div>;
  if (error || !brand) return (
    <div className="text-center py-20">
      <p className="text-red-400 mb-4">{error || 'Marca no encontrada'}</p>
      <button onClick={() => router.push('/catalog/brands')} className="btn-secondary">Volver a marcas</button>
    </div>
  );

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => router.push('/catalog/brands')} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <Tag className="text-purple-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{brand.name}</h1>
          <p className="text-slate-400 text-sm">Detalle de marca</p>
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
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Nombre *</label>
              <input type="text" value={form.name || ''} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} className="input-field !py-2 text-sm" required />
            </div>
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
                    {prodTotal} producto{prodTotal !== 1 ? 's' : ''} de esta marca
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Codigo</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Nombre</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Categoria</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">Precio USD</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Stock</th>
                      <th className="text-center px-4 py-3 text-slate-400 font-medium w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-8 text-slate-500">Sin productos de esta marca</td></tr>
                    ) : products.map(p => (
                      <tr key={p.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 font-mono text-amber-400 text-xs">{p.code}</td>
                        <td className="px-4 py-3 text-white">{p.name}</td>
                        <td className="px-4 py-3 text-slate-300 hidden md:table-cell">{p.category?.name || '—'}</td>
                        <td className="px-4 py-3 text-right font-mono text-white">${Number(p.priceUsd).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-300 hidden md:table-cell">{p.stock?.reduce((s, st) => s + st.quantity, 0) || 0}</td>
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
