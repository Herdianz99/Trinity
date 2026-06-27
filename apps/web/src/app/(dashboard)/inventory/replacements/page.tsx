'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Repeat, Plus, Loader2 } from 'lucide-react';

interface Replacement {
  id: string;
  number: string;
  warehouse: { id: string; name: string };
  date: string;
  notes: string | null;
  status: 'DRAFT' | 'PROCESSED' | 'CANCELLED';
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

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-VE', { timeZone: 'UTC' });
}

export default function InventoryReplacementsPage() {
  const router = useRouter();
  const [replacements, setReplacements] = useState<Replacement[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchReplacements = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/proxy/inventory-replacements?${params}`);
      if (res.ok) setReplacements(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { document.title = 'Reemplazos de Inventario | Trinity ERP'; }, []);
  useEffect(() => { fetchReplacements(); }, [fetchReplacements]);

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <Repeat className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Reemplazos de Inventario</h1>
            <p className="text-slate-400 text-sm">Canje de un articulo por otro (ej. 2 rollos → 200 metros)</p>
          </div>
        </div>
        <button
          onClick={() => router.push('/inventory/replacements/new')}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} /> Nuevo reemplazo
        </button>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field !py-2 text-sm w-48"
        >
          <option value="">Todos los estados</option>
          <option value="DRAFT">Borrador</option>
          <option value="PROCESSED">Procesado</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-green-500" size={28} />
          </div>
        ) : replacements.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Repeat size={40} className="mx-auto mb-3 opacity-40" />
            <p>No hay reemplazos</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">N°</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Almacen</th>
                  <th className="text-center px-4 py-3 text-slate-400 font-medium">Lineas</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Observacion</th>
                  <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {replacements.map(r => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/inventory/replacements/${r.id}`)}
                    className="border-b border-slate-700/30 hover:bg-slate-700/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-green-400">{r.number}</td>
                    <td className="px-4 py-3 text-slate-300">{fmtDate(r.date)}</td>
                    <td className="px-4 py-3 text-slate-300">{r.warehouse.name}</td>
                    <td className="px-4 py-3 text-center text-slate-300">{r._count?.items ?? 0}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs hidden md:table-cell truncate max-w-xs">{r.notes || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full border ${STATUS_BADGES[r.status]}`}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
