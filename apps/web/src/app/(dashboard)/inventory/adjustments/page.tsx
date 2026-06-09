'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PackagePlus, Plus, Loader2 } from 'lucide-react';

interface InventoryAdjustment {
  id: string;
  warehouseId: string;
  warehouse: { id: string; name: string };
  type: 'IN' | 'OUT';
  status: 'DRAFT' | 'PROCESSED' | 'CANCELLED';
  description: string | null;
  customer: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  _count?: { items: number };
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  PROCESSED: 'Procesado',
  CANCELLED: 'Cancelado',
};

const STATUS_BADGES: Record<string, string> = {
  DRAFT: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  PROCESSED: 'bg-green-500/10 text-green-400 border-green-500/20',
  CANCELLED: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const TYPE_LABELS: Record<string, string> = {
  IN: 'Entrada',
  OUT: 'Salida',
};

const TYPE_BADGES: Record<string, string> = {
  IN: 'bg-green-500/10 text-green-400 border-green-500/20',
  OUT: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

function getRecipientName(a: InventoryAdjustment): string {
  if (a.customer) return a.customer.name;
  if (a.supplier) return a.supplier.name;
  return '—';
}

export default function InventoryAdjustmentsPage() {
  const router = useRouter();
  const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchAdjustments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/proxy/inventory-adjustments?${params}`);
      if (res.ok) setAdjustments(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { document.title = 'Ajustes de Inventario | Trinity ERP'; }, []);
  useEffect(() => { fetchAdjustments(); }, [fetchAdjustments]);

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <PackagePlus className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Ajustes de Inventario</h1>
            <p className="text-slate-400 text-sm">Entradas y salidas de stock por ajuste</p>
          </div>
        </div>
        <button
          onClick={() => router.push('/inventory/adjustments/new')}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} /> Nuevo ajuste
        </button>
      </div>

      {/* Filtro por estado */}
      <div className="mb-4 flex items-center gap-2">
        {[
          { value: '', label: 'Todos' },
          { value: 'DRAFT', label: 'Borrador' },
          { value: 'PROCESSED', label: 'Procesado' },
          { value: 'CANCELLED', label: 'Cancelado' },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === opt.value
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Tipo</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Almacen</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Destinatario</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Productos</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Descripcion</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12"><Loader2 className="animate-spin text-green-500 mx-auto" size={28} /></td></tr>
              ) : adjustments.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-500">No hay ajustes de inventario</td></tr>
              ) : adjustments.map(a => (
                <tr
                  key={a.id}
                  onClick={() => router.push(`/inventory/adjustments/${a.id}`)}
                  className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 text-slate-300 text-xs">{new Date(a.createdAt).toLocaleDateString('es-VE')}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_BADGES[a.type]}`}>
                      {TYPE_LABELS[a.type] || a.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white">{a.warehouse.name}</td>
                  <td className="px-4 py-3 text-slate-300 text-xs">{getRecipientName(a)}</td>
                  <td className="px-4 py-3 text-center text-slate-300">{a._count?.items || 0}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs hidden lg:table-cell">{a.description || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGES[a.status]}`}>
                      {STATUS_LABELS[a.status] || a.status}
                    </span>
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
