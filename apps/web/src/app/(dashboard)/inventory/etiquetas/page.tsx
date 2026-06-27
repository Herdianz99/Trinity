'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tags, Search, Loader2, Trash2, Printer, Plus, X, ShoppingCart, Layers } from 'lucide-react';

interface StockRow { quantity: number; }
interface Product {
  id: string; code: string; name: string; supplierRef: string | null; stock?: StockRow[];
}
interface LabelRow { productId: string; code: string; name: string; supplierRef: string | null; quantity: number; }
interface Named { id: string; name: string; }
interface PurchaseLite {
  id: string; number: string; invoiceDate: string; createdAt: string; status: string;
  supplier: { id: string; name: string }; items?: { id: string }[];
}

const totalStock = (p: Product) => (p.stock || []).reduce((s, r) => s + r.quantity, 0);

export default function LabelsPage() {
  const [rows, setRows] = useState<LabelRow[]>([]);
  const [widthMm, setWidthMm] = useState('57');
  const [heightMm, setHeightMm] = useState('40');
  const [qtyFromStock, setQtyFromStock] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // filtros + browse
  const [categories, setCategories] = useState<Named[]>([]);
  const [brands, setBrands] = useState<Named[]>([]);
  const [suppliers, setSuppliers] = useState<Named[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [browse, setBrowse] = useState<Product[]>([]);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [addingAll, setAddingAll] = useState(false);

  // importar de compra
  const [showImport, setShowImport] = useState(false);

  useEffect(() => { document.title = 'Etiquetas | Trinity ERP'; }, []);

  // catalogos para los filtros
  useEffect(() => {
    Promise.all([
      fetch('/api/proxy/categories').then(r => r.ok ? r.json() : []),
      fetch('/api/proxy/brands').then(r => r.ok ? r.json() : []),
      fetch('/api/proxy/suppliers').then(r => r.ok ? r.json() : []),
    ]).then(([c, b, s]) => {
      setCategories(Array.isArray(c) ? c : []);
      setBrands(Array.isArray(b) ? b : []);
      setSuppliers(Array.isArray(s) ? s : []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const hasFilter = !!(supplierId || categoryId || brandId || debounced);

  // browse de productos segun filtros
  const fetchBrowse = useCallback(async () => {
    if (!hasFilter) { setBrowse([]); setBrowseTotal(0); return; }
    setBrowseLoading(true);
    try {
      const params = new URLSearchParams({ isActive: 'true', limit: '50', page: '1' });
      if (supplierId) params.set('supplierId', supplierId);
      if (categoryId) params.set('categoryId', categoryId);
      if (brandId) params.set('brandId', brandId);
      if (debounced) params.set('search', debounced);
      const res = await fetch(`/api/proxy/products?${params}`);
      if (res.ok) {
        const d = await res.json();
        setBrowse(d.data || []);
        setBrowseTotal(d.total || 0);
      }
    } catch { /* ignore */ } finally {
      setBrowseLoading(false);
    }
  }, [hasFilter, supplierId, categoryId, brandId, debounced]);

  useEffect(() => { fetchBrowse(); }, [fetchBrowse]);

  // ── cart helpers ──
  function qtyFor(p: Product): number {
    if (!qtyFromStock) return 1;
    const s = Math.floor(totalStock(p));
    return s > 0 ? s : 1;
  }
  function upsert(p: { id: string; code: string; name: string; supplierRef: string | null }, quantity: number, mode: 'set' | 'add') {
    setRows(prev => {
      const idx = prev.findIndex(r => r.productId === p.id);
      if (idx === -1) return [...prev, { productId: p.id, code: p.code, name: p.name, supplierRef: p.supplierRef ?? null, quantity: Math.max(0, Math.floor(quantity)) }];
      if (mode === 'add') {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + Math.floor(quantity) };
        return copy;
      }
      return prev; // ya esta
    });
  }
  function addBrowseProduct(p: Product) { upsert(p, qtyFor(p), 'set'); }

  async function addAllFiltered() {
    if (!hasFilter) return;
    setAddingAll(true); setError(''); setMsg('');
    try {
      const params = new URLSearchParams({ isActive: 'true', limit: '1000', page: '1' });
      if (supplierId) params.set('supplierId', supplierId);
      if (categoryId) params.set('categoryId', categoryId);
      if (brandId) params.set('brandId', brandId);
      if (debounced) params.set('search', debounced);
      const res = await fetch(`/api/proxy/products?${params}`);
      if (res.ok) {
        const d = await res.json();
        const list: Product[] = d.data || [];
        list.forEach(p => upsert(p, qtyFor(p), 'set'));
        setMsg(`${list.length} producto(s) agregados${(d.total || 0) > list.length ? ` (de ${d.total}, tope 1000)` : ''}`);
      }
    } catch { /* ignore */ } finally {
      setAddingAll(false);
    }
  }

  function setQty(productId: string, q: number) {
    setRows(prev => prev.map(r => (r.productId === productId ? { ...r, quantity: q } : r)));
  }
  function removeRow(productId: string) { setRows(prev => prev.filter(r => r.productId !== productId)); }
  function clearRows() { setRows([]); }

  // importar items de una compra (cantidad = comprada, sumando si ya esta)
  function importPurchaseItems(items: { productId: string; quantity: number; product: { id: string; code: string; name: string; supplierRef: string | null } }[]) {
    items.forEach(it => upsert(
      { id: it.productId, code: it.product.code, name: it.product.name, supplierRef: it.product.supplierRef ?? null },
      it.quantity, 'add',
    ));
  }

  const totalLabels = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);

  const handleGenerate = useCallback(async () => {
    setError('');
    const items = rows
      .map(r => ({ productId: r.productId, quantity: Math.floor(Number(r.quantity) || 0) }))
      .filter(i => i.quantity > 0);
    if (items.length === 0) { setError('Agrega al menos un producto con cantidad mayor a 0'); return; }
    const w = Number(widthMm), h = Number(heightMm);
    if (!(w >= 10) || !(h >= 10)) { setError('El tamano de la etiqueta debe ser de al menos 10mm'); return; }
    setGenerating(true);
    try {
      const res = await fetch('/api/proxy/labels/pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, widthMm: w, heightMm: h }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Error al generar etiquetas'); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }, [rows, widthMm, heightMm]);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20"><Tags className="text-green-400" size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-white">Etiquetas</h1>
            <p className="text-slate-400 text-sm">Etiquetas internas con codigo de barras (nombre, codigo, ref. proveedor)</p>
          </div>
        </div>
        <button onClick={() => setShowImport(true)} className="btn-secondary !py-2 text-sm flex items-center gap-2">
          <ShoppingCart size={16} /> Importar de una compra
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg border text-sm bg-red-500/10 border-red-500/20 text-red-400">{error}</div>}
      {msg && <div className="mb-4 p-3 rounded-lg border text-sm bg-green-500/10 border-green-500/20 text-green-400">{msg}</div>}

      {/* Opciones */}
      <div className="card p-4 mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Ancho (mm)</label>
          <input type="number" min="10" value={widthMm} onChange={(e) => setWidthMm(e.target.value)} className="input-field !py-2 text-sm w-24 text-right font-mono" />
        </div>
        <span className="text-slate-500 pb-2">×</span>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Alto (mm)</label>
          <input type="number" min="10" value={heightMm} onChange={(e) => setHeightMm(e.target.value)} className="input-field !py-2 text-sm w-24 text-right font-mono" />
        </div>
        <p className="text-xs text-slate-500 pb-2">Default 57 × 40 mm.</p>

        {/* Toggle: cantidad = existencias (a la derecha) */}
        <div
          onClick={() => setQtyFromStock(v => !v)}
          role="switch"
          aria-checked={qtyFromStock}
          className="flex items-center gap-2.5 ml-auto pb-2 cursor-pointer select-none"
        >
          <span className="text-sm text-slate-300">Cantidad = existencias</span>
          <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${qtyFromStock ? 'bg-green-500' : 'bg-slate-600'}`}>
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${qtyFromStock ? 'translate-x-6' : 'translate-x-1'}`} />
          </div>
        </div>
      </div>

      {/* Filtros + buscador */}
      <div className="card p-4 mb-4">
        <p className="text-xs font-medium text-slate-400 mb-3">Buscar / filtrar productos</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="input-field !py-2 text-sm">
            <option value="">Todos los proveedores</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input-field !py-2 text-sm">
            <option value="">Todas las categorias</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="input-field !py-2 text-sm">
            <option value="">Todas las marcas</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
            <input type="text" placeholder="Codigo o nombre..." value={search} onChange={(e) => setSearch(e.target.value)} className="input-field pl-9 !py-2 text-sm w-full" />
          </div>
        </div>

        {/* Resultados del browse */}
        {hasFilter && (
          <div className="mt-3 border-t border-slate-700/40 pt-3">
            {browseLoading ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="animate-spin text-green-500" size={22} /></div>
            ) : browse.length === 0 ? (
              <p className="text-center text-slate-500 text-sm py-4">Sin resultados</p>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400">{browseTotal} resultado(s){browse.length < browseTotal ? ` (mostrando ${browse.length})` : ''}</span>
                  <button onClick={addAllFiltered} disabled={addingAll} className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1.5">
                    {addingAll ? <Loader2 className="animate-spin" size={13} /> : <Layers size={13} />} Agregar todos los filtrados
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-700/40">
                  {browse.map(p => {
                    const added = rows.some(r => r.productId === p.id);
                    return (
                      <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm border-b border-slate-700/30 last:border-0">
                        <span className="font-mono text-xs text-green-400 w-20 flex-shrink-0">{p.code}</span>
                        <span className="text-white flex-1 truncate">{p.name}</span>
                        <span className="text-xs text-slate-500 flex-shrink-0">Exist: {totalStock(p)}</span>
                        <button onClick={() => addBrowseProduct(p)} disabled={added}
                          className={`flex-shrink-0 text-xs flex items-center gap-1 ${added ? 'text-green-500 opacity-50' : 'text-green-400 hover:text-green-300'}`}>
                          {added ? 'Agregado' : <><Plus size={13} /> Agregar</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Lista de etiquetas */}
      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Tags size={40} className="mx-auto mb-3 opacity-40" />
            <p>No hay productos en la lista</p>
            <p className="text-xs mt-1">Filtra/busca arriba, o importa de una compra</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Codigo</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Ref. proveedor</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Nombre</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium w-32">Etiquetas</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.productId} className="border-b border-slate-700/30 hover:bg-slate-800/40">
                    <td className="px-4 py-2.5 font-mono text-xs text-green-400 whitespace-nowrap">{r.code}</td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs hidden md:table-cell">{r.supplierRef || '—'}</td>
                    <td className="px-4 py-2.5 text-white">{r.name}</td>
                    <td className="px-4 py-2.5 text-right">
                      <input type="number" min="1" step="1" value={r.quantity} onChange={(e) => setQty(r.productId, Number(e.target.value))}
                        className="input-field !py-1 text-sm w-24 text-right font-mono" />
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <button onClick={() => removeRow(r.productId)} className="p-1 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400" title="Quitar"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Accion */}
      {rows.length > 0 && (
        <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">{rows.length} producto(s) — <span className="text-white font-semibold">{totalLabels}</span> etiqueta(s)</span>
            <button onClick={clearRows} className="text-xs text-slate-400 hover:text-red-400">Vaciar lista</button>
          </div>
          <button onClick={handleGenerate} disabled={generating || totalLabels <= 0} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
            {generating ? <Loader2 className="animate-spin" size={16} /> : <Printer size={16} />} Generar PDF
          </button>
        </div>
      )}

      {showImport && <ImportPurchaseModal onClose={() => setShowImport(false)} onImport={importPurchaseItems} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Modal: importar etiquetas de una compra
// ════════════════════════════════════════════════════════════
function ImportPurchaseModal({ onClose, onImport }: {
  onClose: () => void;
  onImport: (items: { productId: string; quantity: number; product: { id: string; code: string; name: string; supplierRef: string | null } }[]) => void;
}) {
  const [supplierText, setSupplierText] = useState('');
  const [supplierResults, setSupplierResults] = useState<Named[]>([]);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplier, setSupplier] = useState<Named | null>(null);
  const [purchases, setPurchases] = useState<PurchaseLite[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [numberFilter, setNumberFilter] = useState('');
  const [loadingId, setLoadingId] = useState('');
  const [imported, setImported] = useState<string[]>([]);
  const [note, setNote] = useState('');

  // buscar proveedores
  useEffect(() => {
    if (supplierText.length < 2) { setSupplierResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/proxy/suppliers?search=${encodeURIComponent(supplierText)}&limit=15`);
        if (res.ok) { setSupplierResults(await res.json()); setSupplierOpen(true); }
      } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(t);
  }, [supplierText]);

  async function pickSupplier(s: Named) {
    setSupplier(s); setSupplierText(s.name); setSupplierOpen(false);
    setLoadingPurchases(true); setPurchases([]);
    try {
      const res = await fetch(`/api/proxy/purchases?supplierId=${s.id}&limit=100`);
      if (res.ok) { const d = await res.json(); setPurchases(d.data || []); }
    } catch { /* ignore */ } finally {
      setLoadingPurchases(false);
    }
  }

  async function loadPurchase(p: PurchaseLite) {
    setLoadingId(p.id); setNote('');
    try {
      const res = await fetch(`/api/proxy/purchases/${p.id}`);
      if (res.ok) {
        const d = await res.json();
        const items = (d.items || []).filter((it: any) => it.product && !it.product.isService);
        onImport(items);
        setImported(prev => [...prev, p.id]);
        setNote(`Cargados ${items.length} articulo(s) de ${p.number}`);
      }
    } catch { /* ignore */ } finally {
      setLoadingId('');
    }
  }

  const fmt = (d: string) => new Date(d).toLocaleDateString('es-VE', { timeZone: 'UTC' });
  const filtered = purchases.filter(p => !numberFilter || p.number.toLowerCase().includes(numberFilter.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50 flex-shrink-0">
          <h2 className="text-lg font-bold text-white">Importar etiquetas de una compra</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-5 flex-1 min-h-0 flex flex-col">
          {note && <div className="mb-3 p-2.5 rounded-lg border text-sm bg-green-500/10 border-green-500/20 text-green-400">{note}</div>}

          {/* Proveedor */}
          <div className="relative mb-3">
            <label className="block text-xs font-medium text-slate-400 mb-1">Proveedor</label>
            <input type="text" placeholder="Escribe el nombre del proveedor..." value={supplierText}
              onChange={(e) => { setSupplierText(e.target.value); setSupplier(null); }}
              className="input-field !py-2.5 text-sm w-full" autoComplete="off" />
            {supplierOpen && supplierResults.length > 0 && !supplier && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700/50 rounded-lg shadow-xl max-h-56 overflow-y-auto">
                {supplierResults.map(s => (
                  <button key={s.id} onClick={() => pickSupplier(s)} className="w-full text-left px-4 py-2 text-sm text-white hover:bg-slate-700/50 border-b border-slate-700/30 last:border-0">{s.name}</button>
                ))}
              </div>
            )}
          </div>

          {/* Lista de compras del proveedor */}
          {supplier && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="mb-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">Filtrar por N° de factura (opcional)</label>
                <input type="text" placeholder="Ej. FC-00012" value={numberFilter} onChange={(e) => setNumberFilter(e.target.value)} className="input-field !py-2 text-sm w-full" />
              </div>
              {loadingPurchases ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="animate-spin text-green-500" size={24} /></div>
              ) : filtered.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-6">Este proveedor no tiene compras{numberFilter ? ' con ese numero' : ''}</p>
              ) : (
                <div className="rounded-lg border border-slate-700/40 divide-y divide-slate-700/30 flex-1 min-h-0 overflow-y-auto">
                  {filtered.map(p => (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-green-400">{p.number}</span>
                        <span className="text-slate-500 text-xs ml-2">{fmt(p.invoiceDate || p.createdAt)}</span>
                        <span className="text-slate-600 text-xs ml-2">{p.items?.length ?? 0} item(s)</span>
                      </div>
                      <button onClick={() => loadPurchase(p)} disabled={loadingId === p.id}
                        className={`text-xs flex items-center gap-1 ${imported.includes(p.id) ? 'text-green-500' : 'text-green-400 hover:text-green-300'}`}>
                        {loadingId === p.id ? <Loader2 className="animate-spin" size={13} /> : imported.includes(p.id) ? 'Cargada ✓' : <><Plus size={13} /> Cargar</>}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-700/50 flex justify-end flex-shrink-0">
          <button onClick={onClose} className="btn-primary !py-2 text-sm">Listo</button>
        </div>
      </div>
    </div>
  );
}
