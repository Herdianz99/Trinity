'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Plus, Loader2 } from 'lucide-react';

interface InventoryCount {
  id: string;
  warehouseId: string;
  warehouse: { id: string; name: string };
  status: 'DRAFT' | 'IN_PROGRESS' | 'APPROVED' | 'CANCELLED';
  notes: string | null;
  _count?: { items: number };
  createdAt: string;
}

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

export default function InventoryCountPage() {
  const router = useRouter();
  const [counts, setCounts] = useState<InventoryCount[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/inventory-counts');
      if (res.ok) setCounts(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { document.title = 'Conteos de Inventario | Trinity ERP'; }, []);
  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <ClipboardCheck className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Conteo Fisico</h1>
            <p className="text-slate-400 text-sm">Sesiones de inventario fisico</p>
          </div>
        </div>
        <button
          onClick={() => router.push('/inventory/count/new')}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} /> Nueva sesion de conteo
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Almacen</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Productos</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Notas</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12"><Loader2 className="animate-spin text-green-500 mx-auto" size={28} /></td></tr>
              ) : counts.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-500">No hay sesiones de conteo</td></tr>
              ) : counts.map(c => (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/inventory/count/${c.id}`)}
                  className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 text-slate-300 text-xs">{new Date(c.createdAt).toLocaleDateString('es-VE')}</td>
                  <td className="px-4 py-3 text-white">{c.warehouse.name}</td>
                  <td className="px-4 py-3 text-center text-slate-300">{c._count?.items || 0}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGES[c.status]}`}>
                      {STATUS_LABELS[c.status] || c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs hidden md:table-cell">{c.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
