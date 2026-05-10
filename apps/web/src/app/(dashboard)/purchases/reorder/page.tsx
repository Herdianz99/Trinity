'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Loader2, ShoppingCart } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ReorderSuggestion {
  id: string;
  code: string;
  name: string;
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  currentStock: number;
  minStock: number;
  difference: number;
  lastCostUsd: number;
}

export default function ReorderPage() {
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/purchase-orders/reorder-suggestions');
      if (res.ok) setSuggestions(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSuggestions(); }, [fetchSuggestions]);

  async function createOrderForProduct(suggestion: ReorderSuggestion) {
    if (!suggestion.supplierId) {
      alert('Este producto no tiene proveedor asignado');
      return;
    }

    const quantity = Math.max(1, suggestion.minStock - suggestion.currentStock);

    try {
      const res = await fetch('/api/proxy/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: suggestion.supplierId,
          notes: `Reorden sugerida - ${suggestion.name}`,
          items: [{
            productId: suggestion.id,
            quantity,
            costUsd: suggestion.lastCostUsd,
          }],
        }),
      });

      if (res.ok) {
        router.push('/purchases');
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Error al crear orden');
      }
    } catch {
      alert('Error de conexion');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="text-amber-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Sugerencias de Reorden</h1>
          <p className="text-slate-400 text-sm">{suggestions.length} productos bajo stock minimo</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Producto</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Categoria</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Proveedor</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Stock</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Minimo</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Diferencia</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Costo USD</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium w-24">Accion</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12"><Loader2 className="animate-spin text-green-500 mx-auto" size={28} /></td></tr>
              ) : suggestions.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-500">No hay productos bajo stock minimo</td></tr>
              ) : suggestions.map(s => (
                <tr key={s.id} className={`border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors ${s.currentStock === 0 ? 'bg-red-500/5' : ''}`}>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-green-400">{s.code}</span>
                    <span className="text-white ml-2">{s.name}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 hidden md:table-cell">{s.categoryName || '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{s.supplierName || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span className={s.currentStock === 0 ? 'text-red-400 font-bold' : 'text-amber-400'}>{s.currentStock}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-300">{s.minStock}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span className={s.currentStock === 0 ? 'text-red-400' : 'text-amber-400'}>{s.difference}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-300 hidden md:table-cell">${s.lastCostUsd.toFixed(2)}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => createOrderForProduct(s)}
                      className="p-1.5 rounded-lg hover:bg-green-500/10 text-slate-400 hover:text-green-400 transition-colors"
                      title="Crear orden de compra"
                    >
                      <ShoppingCart size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
