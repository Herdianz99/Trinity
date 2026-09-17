'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Truck, Loader2, Plus, Package, ChevronRight } from 'lucide-react';

interface GoodsReceipt {
  id: string;
  number: string;
  date: string;
  status: string;
  supplierName: string;
  driverName: string | null;
  truckPlate: string | null;
  warehouse: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  createdBy: { name: string } | null;
  _count: { items: number };
  createdAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  REGISTRADO: 'bg-green-500/10 text-green-400 border-green-500/30',
  ANULADO: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
};
const STATUS_LABEL: Record<string, string> = { REGISTRADO: 'Registrado', ANULADO: 'Anulado' };
const STATUS_FILTERS = ['', 'REGISTRADO', 'ANULADO'];

export default function GoodsReceiptsPage() {
  const router = useRouter();
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => { document.title = 'Recepción de mercancía | Trinity ERP'; }, []);

  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      const res = await fetch(`/api/proxy/goods-receipts?${params}`);
      if (res.ok) setReceipts(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { fetchReceipts(); }, [fetchReceipts]);

  function fmtDate(d: string) {
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Truck className="text-sky-400" size={24} />
          <div>
            <h1 className="text-xl font-bold text-white">Recepción de mercancía</h1>
            <p className="text-sm text-slate-400">Registro de lo que recibe el almacén: chofer, camión, proveedor, artículos y devoluciones.</p>
          </div>
        </div>
        <Link href="/inventory/goods-receipts/new" className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nueva recepción
        </Link>
      </div>

      <div className="flex items-center gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${status === s ? 'bg-sky-500/10 text-sky-400 border-sky-500/30' : 'text-slate-400 border-slate-700/50 hover:bg-slate-800/60'}`}
          >
            {s ? STATUS_LABEL[s] : 'Todos'}
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500"><Loader2 className="animate-spin inline" size={20} /></div>
        ) : receipts.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No hay recepciones registradas.</div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-700/40">
                    <th className="px-4 py-2 font-medium">N°</th>
                    <th className="px-4 py-2 font-medium">Fecha</th>
                    <th className="px-4 py-2 font-medium">Proveedor</th>
                    <th className="px-4 py-2 font-medium">Camión</th>
                    <th className="px-4 py-2 font-medium text-center">Artículos</th>
                    <th className="px-4 py-2 font-medium text-center">Estado</th>
                    <th className="px-4 py-2 font-medium">Recibió</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => router.push(`/inventory/goods-receipts/${r.id}`)}
                      className="border-b border-slate-700/20 hover:bg-slate-800/40 cursor-pointer"
                    >
                      <td className="px-4 py-2 font-mono text-xs text-sky-400 whitespace-nowrap">{r.number}</td>
                      <td className="px-4 py-2 text-slate-300 whitespace-nowrap">{fmtDate(r.date)}</td>
                      <td className="px-4 py-2 text-white">{r.supplierName}</td>
                      <td className="px-4 py-2 text-xs text-slate-400">
                        {r.truckPlate || '—'}{r.driverName ? ` · ${r.driverName}` : ''}
                      </td>
                      <td className="px-4 py-2 text-center text-slate-300">
                        <span className="inline-flex items-center gap-1"><Package size={13} className="text-slate-500" />{r._count.items}</span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-400">{r.createdBy?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Móvil */}
            <div className="md:hidden divide-y divide-slate-700/30">
              {receipts.map((r) => (
                <button
                  key={r.id}
                  onClick={() => router.push(`/inventory/goods-receipts/${r.id}`)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-slate-800/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-sky-400 whitespace-nowrap">{r.number}</span>
                      <span className="text-xs text-slate-500 ml-auto whitespace-nowrap">{fmtDate(r.date)}</span>
                    </div>
                    <p className="text-sm text-white truncate mt-0.5">{r.supplierName}</p>
                    <p className="text-xs text-slate-500 mt-0.5 inline-flex items-center gap-1">
                      <Package size={12} className="text-slate-600" />{r._count.items} artículo(s)
                      {r.truckPlate ? ` · ${r.truckPlate}` : ''}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold border flex-shrink-0 ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  <ChevronRight size={16} className="text-slate-600 flex-shrink-0" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
