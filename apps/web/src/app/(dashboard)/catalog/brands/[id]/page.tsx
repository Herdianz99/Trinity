'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Tag, Save, Loader2, ChevronLeft, ChevronRight, ExternalLink, LogOut,
  Upload, Image as ImageIcon, Trash2,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface Brand {
  id: string;
  name: string;
  logoKey?: string | null;
  logoUrl?: string | null;
}

// Reduce la imagen en el navegador antes de subirla y la devuelve como data URI.
function downscaleToDataUri(file: File, maxSize = 1024, quality = 0.9): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No canvas context'));
      ctx.drawImage(img, 0, 0, w, h);
      // PNG para conservar transparencia de los logos
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
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

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

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
      setLogoUrl(data.logoUrl || null);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [id]);

  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingLogo(true); setSaveMsg(null);
    try {
      const dataUri = await downscaleToDataUri(file);
      const res = await fetch(`/api/proxy/brands/${id}/logo`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUri }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'No se pudo subir el logo'); }
      const updated = await res.json();
      setLogoUrl(updated.logoUrl || null);
      setSaveMsg({ type: 'success', text: 'Logo actualizado' });
    } catch (err: any) {
      setSaveMsg({ type: 'error', text: err.message });
    } finally { setUploadingLogo(false); }
  }

  async function handleRemoveLogo() {
    if (!confirm('¿Quitar el logo de esta marca?')) return;
    setUploadingLogo(true); setSaveMsg(null);
    try {
      const res = await fetch(`/api/proxy/brands/${id}/logo`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo quitar el logo');
      setLogoUrl(null);
      setSaveMsg({ type: 'success', text: 'Logo eliminado' });
    } catch (err: any) {
      setSaveMsg({ type: 'error', text: err.message });
    } finally { setUploadingLogo(false); }
  }

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
    if (brand) document.title = `${brand.name} | Trinity ERP`;
  }, [brand]);

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

            {/* Logo para la tienda online */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Logo para la tienda online</label>
              <div className="flex items-center gap-4">
                <div className="w-28 h-20 rounded-lg bg-slate-800 border border-slate-700/50 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt={brand.name} className="w-full h-full object-contain p-2" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-slate-500 text-[10px]">
                      <ImageIcon size={20} /> Sin logo
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoFile} className="hidden" />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="btn-secondary !py-2 text-sm flex items-center gap-2"
                  >
                    {uploadingLogo ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                    {logoUrl ? 'Cambiar logo' : 'Subir logo'}
                  </button>
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      disabled={uploadingLogo}
                      className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                    >
                      <Trash2 size={12} /> Quitar logo
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">PNG con fondo transparente recomendado. Al tener logo, la marca deja de mostrarse como recuadro con el nombre.</p>
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
