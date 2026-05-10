'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  BoxesIcon, AlertTriangle, Loader2, X, ArrowUpDown, Activity,
} from 'lucide-react';

interface StockItem {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  product: {
    id: string;
    code: string;
    name: string;
    costUsd: number;
    minStock: number;
    priceDetal: number;
    category?: { name: string } | null;
  };
  warehouse: { id: string; name: string };
}

interface Warehouse {
  id: string;
  name: string;
  isDefault: boolean;
}

interface GlobalStock {
  product: {
    id: string;
    code: string;
    name: string;
    costUsd: number;
    minStock: number;
    category?: { name: string } | null;
  };
  totalStock: number;
  minStock: number;
}

export default function StockPage() {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [globalStock, setGlobalStock] = useState<GlobalStock[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [exchangeRate, setExchangeRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adjustModal, setAdjustModal] = useState<{ productId: string; productName: string; currentStock: number } | null>(null);
  const [adjustForm, setAdjustForm] = useState({ warehouseId: '', type: 'ADJUSTMENT_IN' as string, quantity: 0, reason: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchWarehouses = useCallback(async () => {
    const res = await fetch('/api/proxy/warehouses');
    if (res.ok) {
      const data = await res.json();
      setWarehouses(data);
    }
  }, []);

  const fetchStock = useCallback(async () => {
    setLoading(true);
    try {
      if (selectedWarehouse === 'all') {
        const res = await fetch('/api/proxy/stock/global');
        if (res.ok) {
          const data = await res.json();
          setGlobalStock(data);
          setStockItems([]);
        }
      } else {
        const res = await fetch(`/api/proxy/stock?warehouseId=${selectedWarehouse}`);
        if (res.ok) {
          const data = await res.json();
          setStockItems(data);
          setGlobalStock([]);
        }
      }
      // Low stock count
      const lowRes = await fetch('/api/proxy/stock/low');
      if (lowRes.ok) {
        const lowData = await lowRes.json();
        setLowStockCount(lowData.length);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [selectedWarehouse]);

  const fetchConfig = useCallback(async () => {
    const res = await fetch('/api/proxy/config');
    if (res.ok) {
      const data = await res.json();
      setExchangeRate(data.exchangeRate || 0);
    }
  }, []);

  useEffect(() => { fetchWarehouses(); fetchConfig(); }, [fetchWarehouses, fetchConfig]);
  useEffect(() => { fetchStock(); }, [fetchStock]);

  function openAdjust(productId: string, productName: string, currentStock: number) {
    setAdjustModal({ productId, productName, currentStock });
    setAdjustForm({
      warehouseId: selectedWarehouse !== 'all' ? selectedWarehouse : (warehouses[0]?.id || ''),
      type: 'ADJUSTMENT_IN',
      quantity: 0,
      reason: '',
    });
  }

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/proxy/stock/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: adjustModal!.productId,
          warehouseId: adjustForm.warehouseId,
          type: adjustForm.type,
          quantity: adjustForm.quantity,
          reason: adjustForm.reason,
        }),
      });
      if (res.ok) {
        setAdjustModal(null);
        fetchStock();
        setMessage({ type: 'success', text: 'Ajuste realizado correctamente' });
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al ajustar stock');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  // Compute valuation
  const totalValuationUsd = selectedWarehouse === 'all'
    ? globalStock.reduce((sum, item) => sum + item.totalStock * (item.product.costUsd || 0), 0)
    : stockItems.reduce((sum, item) => sum + item.quantity * (item.product.costUsd || 0), 0);
  const totalValuationBs = totalValuationUsd * exchangeRate;

  function getStockStatus(qty: number, minStock: number) {
    if (qty === 0) return { label: 'Sin stock', color: 'bg-red-500/10 text-red-400 border-red-500/20', rowBg: 'bg-red-500/5' };
    if (qty <= minStock) return { label: 'Bajo', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', rowBg: 'bg-amber-500/5' };
    return { label: 'Normal', color: 'bg-green-500/10 text-green-400 border-green-500/20', rowBg: '' };
  }

  const previewStock = adjustModal
    ? adjustForm.type === 'ADJUSTMENT_IN'
      ? adjustModal.currentStock + adjustForm.quantity
      : adjustModal.currentStock - adjustForm.quantity
    : 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <BoxesIcon className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Stock</h1>
            <p className="text-slate-400 text-sm">Inventario por almacen</p>
          </div>
        </div>
      </div>

      {/* Low stock banner */}
      {lowStockCount > 0 && (
        <div className="mb-4 p-3 rounded-lg border bg-amber-500/10 border-amber-500/20 flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-400" />
          <span className="text-sm text-amber-400 font-medium">
            {lowStockCount} producto{lowStockCount > 1 ? 's' : ''} con stock bajo
          </span>
        </div>
      )}

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* Warehouse selector */}
      <div className="card p-4 mb-6">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedWarehouse('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedWarehouse === 'all'
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
            }`}
          >
            Todos los almacenes
          </button>
          {warehouses.map(w => (
            <button
              key={w.id}
              onClick={() => setSelectedWarehouse(w.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedWarehouse === w.id
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
              }`}
            >
              {w.name} {w.isDefault && '(Principal)'}
            </button>
          ))}
        </div>
      </div>

      {/* Stock table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Codigo</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Producto</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Categoria</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Stock</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Min.</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Costo USD</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Valor USD</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium w-28">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12">
                  <Loader2 className="animate-spin text-green-500 mx-auto" size={28} />
                </td></tr>
              ) : selectedWarehouse === 'all' ? (
                globalStock.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-slate-500">No hay stock registrado</td></tr>
                ) : globalStock.map(item => {
                  const status = getStockStatus(item.totalStock, item.minStock);
                  return (
                    <tr key={item.product.id} className={`border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors ${status.rowBg}`}>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded">{item.product.code}</span>
                      </td>
                      <td className="px-4 py-3 text-white font-medium">{item.product.name}</td>
                      <td className="px-4 py-3 text-slate-400 hidden lg:table-cell">{item.product.category?.name || '—'}</td>
                      <td className="px-4 py-3 text-right text-white font-mono">{item.totalStock}</td>
                      <td className="px-4 py-3 text-right text-slate-400 font-mono hidden md:table-cell">{item.minStock}</td>
                      <td className="px-4 py-3 text-right text-slate-300 font-mono hidden lg:table-cell">${item.product.costUsd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-white font-mono hidden lg:table-cell">${(item.totalStock * item.product.costUsd).toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${status.color}`}>{status.label}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openAdjust(item.product.id, item.product.name, item.totalStock)}
                            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                            title="Ajustar stock"
                          >
                            <ArrowUpDown size={14} />
                          </button>
                          <button
                            onClick={() => router.push(`/inventory/movements?productId=${item.product.id}`)}
                            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                            title="Ver movimientos"
                          >
                            <Activity size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                stockItems.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-slate-500">No hay stock en este almacen</td></tr>
                ) : stockItems.map(item => {
                  const status = getStockStatus(item.quantity, item.product.minStock);
                  return (
                    <tr key={item.id} className={`border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors ${status.rowBg}`}>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded">{item.product.code}</span>
                      </td>
                      <td className="px-4 py-3 text-white font-medium">{item.product.name}</td>
                      <td className="px-4 py-3 text-slate-400 hidden lg:table-cell">{item.product.category?.name || '—'}</td>
                      <td className="px-4 py-3 text-right text-white font-mono">{item.quantity}</td>
                      <td className="px-4 py-3 text-right text-slate-400 font-mono hidden md:table-cell">{item.product.minStock}</td>
                      <td className="px-4 py-3 text-right text-slate-300 font-mono hidden lg:table-cell">${item.product.costUsd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-white font-mono hidden lg:table-cell">${(item.quantity * item.product.costUsd).toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${status.color}`}>{status.label}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openAdjust(item.productId, item.product.name, item.quantity)}
                            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                            title="Ajustar stock"
                          >
                            <ArrowUpDown size={14} />
                          </button>
                          <button
                            onClick={() => router.push(`/inventory/movements?productId=${item.productId}`)}
                            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                            title="Ver movimientos"
                          >
                            <Activity size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Valuation summary */}
      <div className="card p-4 mt-6">
        <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Reporte Valorizado</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-500 uppercase">Productos</p>
            <p className="text-xl font-bold text-white font-mono">
              {selectedWarehouse === 'all' ? globalStock.length : stockItems.length}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase">Unidades totales</p>
            <p className="text-xl font-bold text-white font-mono">
              {selectedWarehouse === 'all'
                ? globalStock.reduce((s, i) => s + i.totalStock, 0).toLocaleString()
                : stockItems.reduce((s, i) => s + i.quantity, 0).toLocaleString()
              }
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase">Valor Total USD</p>
            <p className="text-xl font-bold text-green-400 font-mono">${totalValuationUsd.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase">Valor Total Bs</p>
            <p className="text-xl font-bold text-blue-400 font-mono">
              {exchangeRate > 0 ? `Bs ${totalValuationBs.toFixed(2)}` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Adjust modal */}
      {adjustModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAdjustModal(null)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold text-white">Ajustar Stock</h2>
              <button onClick={() => setAdjustModal(null)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={handleAdjust} className="p-6 space-y-4">
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-700/50">
                <p className="text-sm text-slate-400">Producto</p>
                <p className="text-white font-medium">{adjustModal.productName}</p>
                <p className="text-xs text-slate-500 mt-1">Stock actual: <span className="text-white font-mono">{adjustModal.currentStock}</span></p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Almacen</label>
                <select
                  value={adjustForm.warehouseId}
                  onChange={(e) => setAdjustForm(f => ({ ...f, warehouseId: e.target.value }))}
                  className="input-field !py-2 text-sm"
                  required
                >
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Tipo de ajuste</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustForm(f => ({ ...f, type: 'ADJUSTMENT_IN' }))}
                    className={`py-2 rounded-lg text-sm font-medium border transition-all ${
                      adjustForm.type === 'ADJUSTMENT_IN'
                        ? 'bg-green-500/20 text-green-400 border-green-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    Entrada
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustForm(f => ({ ...f, type: 'ADJUSTMENT_OUT' }))}
                    className={`py-2 rounded-lg text-sm font-medium border transition-all ${
                      adjustForm.type === 'ADJUSTMENT_OUT'
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    Salida
                  </button>
                </div>
                {adjustForm.type === 'ADJUSTMENT_OUT' && (
                  <p className="mt-2 text-xs text-amber-400 flex items-center gap-1">
                    <AlertTriangle size={12} /> Requiere aprobacion de Supervisor
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Cantidad</label>
                <input
                  type="number"
                  min="1"
                  value={adjustForm.quantity || ''}
                  onChange={(e) => setAdjustForm(f => ({ ...f, quantity: Number(e.target.value) }))}
                  className="input-field !py-2 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Motivo *</label>
                <textarea
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm(f => ({ ...f, reason: e.target.value }))}
                  className="input-field !py-2 text-sm"
                  rows={2}
                  required
                  placeholder="Motivo del ajuste..."
                />
              </div>

              {/* Preview */}
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-700/50">
                <p className="text-xs text-slate-500 uppercase mb-1">Stock resultante</p>
                <p className={`text-2xl font-bold font-mono ${previewStock < 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {previewStock}
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
                <button type="button" onClick={() => setAdjustModal(null)} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
                  {saving && <Loader2 className="animate-spin" size={16} />}
                  Aplicar ajuste
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
