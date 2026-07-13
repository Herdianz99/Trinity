'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Loader2, Plus, Trash2, X } from 'lucide-react';
import ProductSearch from '@/components/product-search';

interface Warehouse { id: string; name: string; }
interface StockEntry { quantity: number; warehouse: { id: string }; }
interface SearchResult { id: string; code: string; name: string; stock?: StockEntry[]; }
interface ItemRow { productId: string; code: string; name: string; quantity: number; stock: StockEntry[]; }

const availableIn = (stock: StockEntry[] | undefined, whId: string) =>
  (stock || []).filter(s => s.warehouse?.id === whId).reduce((sum, s) => sum + s.quantity, 0);

export default function NewTransferPage() {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'Nueva Transferencia | Trinity ERP'; }, []);
  useEffect(() => {
    fetch('/api/proxy/warehouses').then(r => r.ok ? r.json() : []).then((d) => {
      setWarehouses(d);
      if (d.length > 0) setFromWarehouseId(d[0].id);
    }).catch(() => {});
  }, []);

  function addProduct(p: SearchResult) {
    setRows(prev => prev.some(r => r.productId === p.id) ? prev : [...prev, { productId: p.id, code: p.code, name: p.name, quantity: 1, stock: p.stock || [] }]);
  }
  function setQty(productId: string, q: number) {
    setRows(prev => prev.map(r => r.productId === productId ? { ...r, quantity: q } : r));
  }
  function removeRow(productId: string) { setRows(prev => prev.filter(r => r.productId !== productId)); }

  const handleSubmit = useCallback(async () => {
    setError('');
    if (!fromWarehouseId || !toWarehouseId) { setError('Selecciona almacen origen y destino'); return; }
    if (fromWarehouseId === toWarehouseId) { setError('El origen y el destino no pueden ser el mismo almacen'); return; }
    const items = rows.map(r => ({ productId: r.productId, quantity: Math.floor(Number(r.quantity) || 0) })).filter(i => i.quantity > 0);
    if (items.length === 0) { setError('Agrega al menos un producto con cantidad mayor a 0'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/proxy/transfers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromWarehouseId, toWarehouseId, notes: notes || undefined, items }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Error al crear la transferencia'); }
      const created = await res.json();
      router.push(`/inventory/transfers/${created.id}`);
    } catch (err: any) {
      setError(err.message); setSaving(false);
    }
  }, [fromWarehouseId, toWarehouseId, notes, rows, router]);

  return (
    <div>
      <button onClick={() => router.push('/inventory/transfers')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm mb-4">
        <ArrowLeft size={16} /> Volver a transferencias
      </button>
      <h1 className="text-2xl font-bold text-white mb-1">Nueva Transferencia</h1>
      <p className="text-slate-400 text-sm mb-6">Mueve productos de un almacen a otro (queda pendiente de aprobacion).</p>

      {error && <div className="mb-4 p-3 rounded-lg border text-sm bg-red-500/10 border-red-500/20 text-red-400">{error}</div>}

      {/* Cabecera */}
      <div className="card p-5 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr] gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Almacen origen *</label>
            <select value={fromWarehouseId} onChange={(e) => setFromWarehouseId(e.target.value)} className="input-field !py-2.5 text-sm w-full">
              <option value="">Seleccionar...</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="hidden sm:flex items-center justify-center pb-2.5 text-slate-500"><ArrowRight size={20} /></div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Almacen destino *</label>
            <select value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)} className="input-field !py-2.5 text-sm w-full">
              <option value="">Seleccionar...</option>
              {warehouses.filter(w => w.id !== fromWarehouseId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-xs font-medium text-slate-400 mb-1">Notas</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field !py-2 text-sm w-full" placeholder="Opcional..." />
        </div>
      </div>

      {/* Buscar producto */}
      <ProductSearch
        className="mb-4 max-w-xl"
        warehouseId={fromWarehouseId || undefined}
        isAdded={(p) => rows.some(r => r.productId === p.id)}
        onSelect={(p) => addProduct(p as SearchResult)}
        placeholder="Buscar producto para agregar..."
      />

      {/* Items */}
      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <p>No hay productos en la transferencia</p>
            <p className="text-xs mt-1">Busca productos arriba para agregarlos</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Codigo</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Producto</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Disponible</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium w-32">Cantidad</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const avail = availableIn(r.stock, fromWarehouseId);
                  const exceeds = Number(r.quantity) > avail;
                  return (
                  <tr key={r.productId} className="border-b border-slate-700/30 hover:bg-slate-800/40">
                    <td className="px-4 py-2.5 font-mono text-xs text-green-400 whitespace-nowrap">{r.code}</td>
                    <td className="px-4 py-2.5 text-white">{r.name}</td>
                    <td className={`px-4 py-2.5 text-right font-mono ${avail > 0 ? 'text-slate-300' : 'text-red-400'}`}>{avail}</td>
                    <td className="px-4 py-2.5 text-right">
                      <input type="number" min="1" step="1" value={r.quantity} onChange={(e) => setQty(r.productId, Number(e.target.value))}
                        className={`input-field !py-1 text-sm w-24 text-right font-mono ${exceeds ? 'border-red-500/50 text-red-400' : ''}`} />
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <button onClick={() => removeRow(r.productId)} className="p-1 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400" title="Quitar"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="mt-4 flex items-center justify-end gap-3">
        <button onClick={() => router.push('/inventory/transfers')} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
        <button onClick={handleSubmit} disabled={saving || rows.length === 0} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Crear transferencia
        </button>
      </div>
    </div>
  );
}
