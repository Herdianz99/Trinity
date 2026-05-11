'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ShoppingCart, Loader2, Save, Search, X } from 'lucide-react';

interface Supplier { id: string; name: string; isRetentionAgent?: boolean; }
interface ProductSearch { id: string; code: string; name: string; priceDetal: number; priceMayor: number; totalStock: number; }

export default function EditPurchasePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [formSupplier, setFormSupplier] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formIsCredit, setFormIsCredit] = useState(false);
  const [formCreditDays, setFormCreditDays] = useState(0);
  const [formSupplierControlNumber, setFormSupplierControlNumber] = useState('');
  const [formApplyIslr, setFormApplyIslr] = useState(false);
  const [formIslrPct, setFormIslrPct] = useState(0);
  const [formItems, setFormItems] = useState<{ productId: string; productLabel: string; quantity: number; costUsd: number }[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<ProductSearch[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    try {
      const [oRes, sRes] = await Promise.all([
        fetch(`/api/proxy/purchase-orders/${id}`),
        fetch('/api/proxy/suppliers'),
      ]);
      if (sRes.ok) { const d = await sRes.json(); setSuppliers(d.data || d); }
      if (oRes.ok) {
        const order = await oRes.json();
        setFormSupplier(order.supplier.id);
        setFormNotes(order.notes || '');
        setFormIsCredit(order.isCredit || false);
        setFormCreditDays(order.creditDays || 0);
        setFormSupplierControlNumber(order.supplierControlNumber || '');
        setFormApplyIslr(!!(order.islrRetentionPct));
        setFormIslrPct(order.islrRetentionPct || 0);
        setFormItems(order.items.map((i: any) => ({
          productId: i.productId,
          productLabel: `${i.product.code} - ${i.product.name}`,
          quantity: i.quantity,
          costUsd: i.costUsd,
        })));
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  async function searchProducts(q: string) {
    setProductSearch(q);
    if (q.length < 2) { setProductResults([]); return; }
    setSearchingProducts(true);
    try {
      const res = await fetch(`/api/proxy/products/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setProductResults(await res.json());
    } catch { /* ignore */ } finally { setSearchingProducts(false); }
  }

  function addProduct(p: ProductSearch) {
    if (formItems.some(i => i.productId === p.id)) return;
    setFormItems([...formItems, { productId: p.id, productLabel: `${p.code} - ${p.name}`, quantity: 1, costUsd: 0 }]);
    setProductSearch(''); setProductResults([]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (formItems.length === 0) { setMessage({ type: 'error', text: 'Agrega al menos un producto' }); return; }
    setSaving(true); setMessage(null);
    try {
      const body: any = {
        supplierId: formSupplier,
        notes: formNotes || undefined,
        isCredit: formIsCredit,
        creditDays: formIsCredit ? formCreditDays : 0,
        supplierControlNumber: formSupplierControlNumber || undefined,
        applyIslr: formApplyIslr,
        islrRetentionPct: formApplyIslr ? formIslrPct : 0,
        items: formItems.filter(i => i.productId && i.quantity > 0).map(i => ({
          productId: i.productId, quantity: Number(i.quantity), costUsd: Number(i.costUsd),
        })),
      };
      const res = await fetch(`/api/proxy/purchase-orders/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push(`/purchases/${id}`);
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) { setMessage({ type: 'error', text: err.message }); } finally { setSaving(false); }
  }

  const formTotal = formItems.reduce((sum, i) => sum + (i.quantity * i.costUsd), 0);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-green-500" size={32} /></div>;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => router.push(`/purchases/${id}`)} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <ShoppingCart className="text-green-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Editar Orden de Compra</h1>
          <p className="text-slate-400 text-sm">Modifica los datos de la orden</p>
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="card p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Proveedor *</label>
          <select value={formSupplier} onChange={e => setFormSupplier(e.target.value)} className="input-field !py-2 text-sm" required>
            <option value="">Seleccionar...</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">N° Control del proveedor</label>
          <input type="text" value={formSupplierControlNumber} onChange={e => setFormSupplierControlNumber(e.target.value)} className="input-field !py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Notas</label>
          <input type="text" value={formNotes} onChange={e => setFormNotes(e.target.value)} className="input-field !py-2 text-sm" placeholder="Opcional..." />
        </div>

        {/* Credit */}
        <div className="bg-slate-900/50 rounded-lg p-3 space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
            <input type="checkbox" checked={formIsCredit} onChange={e => setFormIsCredit(e.target.checked)} className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40" />
            Compra a credito
          </label>
          {formIsCredit && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Dias de credito</label>
              <input type="number" min="0" value={formCreditDays} onChange={e => setFormCreditDays(Number(e.target.value))} className="input-field !py-2 text-sm w-32" />
            </div>
          )}
        </div>

        {/* ISLR */}
        <div className="bg-slate-900/50 rounded-lg p-3 space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
            <input type="checkbox" checked={formApplyIslr} onChange={e => setFormApplyIslr(e.target.checked)} className="rounded border-slate-600 bg-slate-700 text-purple-500 focus:ring-purple-500/40" />
            Aplica retencion ISLR
          </label>
          {formApplyIslr && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Porcentaje ISLR (%)</label>
              <input type="number" min="0" max="100" step="0.01" value={formIslrPct} onChange={e => setFormIslrPct(Number(e.target.value))} className="input-field !py-2 text-sm w-32" />
              {formTotal > 0 && formIslrPct > 0 && (
                <p className="mt-1 text-xs text-purple-400">Retencion ISLR: ${(formTotal * formIslrPct / 100).toFixed(2)}</p>
              )}
            </div>
          )}
        </div>

        {/* Products */}
        <div>
          <label className="text-xs font-medium text-slate-400 mb-2 block">Productos</label>
          <div className="relative mb-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input type="text" value={productSearch} onChange={e => searchProducts(e.target.value)} className="input-field !py-2 text-sm pl-9" placeholder="Buscar producto..." />
              {searchingProducts && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-500" />}
            </div>
            {productResults.length > 0 && (
              <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-slate-700 border border-slate-600 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                {productResults.map(p => (
                  <button key={p.id} type="button" onClick={() => addProduct(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-600 text-white flex justify-between">
                    <span><span className="font-mono text-green-400 text-xs">{p.code}</span> {p.name}</span>
                    <span className="text-slate-400 text-xs">Stock: {p.totalStock}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            {formItems.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-center bg-slate-900/50 rounded-lg p-2">
                <span className="flex-1 text-sm text-white truncate">{item.productLabel}</span>
                <input type="number" min="1" value={item.quantity || ''} onChange={e => { const n = [...formItems]; n[idx] = { ...n[idx], quantity: Number(e.target.value) }; setFormItems(n); }} className="input-field !py-1.5 text-sm w-20" placeholder="Cant." required />
                <input type="number" min="0" step="0.01" value={item.costUsd || ''} onChange={e => { const n = [...formItems]; n[idx] = { ...n[idx], costUsd: Number(e.target.value) }; setFormItems(n); }} className="input-field !py-1.5 text-sm w-24" placeholder="Costo $" required />
                <span className="text-xs text-slate-400 w-20 text-right font-mono">${(item.quantity * item.costUsd).toFixed(2)}</span>
                <button type="button" onClick={() => setFormItems(formItems.filter((_, i) => i !== idx))} className="p-1 text-slate-500 hover:text-red-400"><X size={14} /></button>
              </div>
            ))}
          </div>
          {formItems.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-700/50 flex justify-end">
              <span className="text-sm text-slate-300">Total: <span className="font-mono font-bold text-white">${formTotal.toFixed(2)}</span></span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
          <button type="button" onClick={() => router.push(`/purchases/${id}`)} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
            {saving && <Loader2 className="animate-spin" size={16} />}
            <Save size={16} /> Guardar cambios
          </button>
        </div>
      </form>
    </div>
  );
}
