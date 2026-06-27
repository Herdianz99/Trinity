'use client';

import { useState, useEffect, useCallback } from 'react';
import { PackageX, Loader2, TrendingDown } from 'lucide-react';

interface ProductRow {
  productId: string | null;
  productName: string;
  productCode: string | null;
  count: number;
  quantity: number;
  estimatedUsd: number;
  estimatedBs: number;
}
interface ReasonRow { reason: string; count: number; quantity: number; estimatedUsd: number; }
interface Report {
  byProduct: ProductRow[];
  byReason: ReasonRow[];
  totals: { count: number; quantity: number; estimatedUsd: number; estimatedBs: number };
}

const REASON_LABELS: Record<string, string> = {
  SIN_STOCK: 'Sin stock',
  PRECIO_ALTO: 'Precio muy alto',
  DESCONTINUADO: 'Descontinuado',
  PEDIDO_NO_RECIBIDO: 'Pedido y no recibido',
};

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const fmtBs = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function LostSalesReportPage() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = 'Ventas Perdidas | Trinity ERP'; }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/lost-sales/report?from=${from}&to=${to}`);
      if (res.ok) setReport(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <PackageX className="text-amber-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Ventas Perdidas</h1>
          <p className="text-slate-400 text-sm">Demanda que no se pudo vender (lo que dejaste de facturar)</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-4 mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Desde</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input-field !py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Hasta</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input-field !py-2 text-sm" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-amber-500" size={28} /></div>
      ) : !report || report.totals.count === 0 ? (
        <div className="card text-center py-16 text-slate-500">
          <TrendingDown size={40} className="mx-auto mb-3 opacity-40" />
          <p>No hay ventas perdidas registradas en este periodo</p>
        </div>
      ) : (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="card p-4">
              <p className="text-xs text-slate-400 mb-1">Registros</p>
              <p className="text-2xl font-bold text-white">{report.totals.count}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-400 mb-1">Unidades perdidas</p>
              <p className="text-2xl font-bold text-white">{report.totals.quantity}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-400 mb-1">Estimado perdido (USD)</p>
              <p className="text-2xl font-bold text-amber-400">${report.totals.estimatedUsd.toFixed(2)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-400 mb-1">Estimado perdido (Bs)</p>
              <p className="text-2xl font-bold text-amber-400">Bs {fmtBs(report.totals.estimatedBs)}</p>
            </div>
          </div>

          {/* Por motivo */}
          <div className="card p-4 mb-4">
            <p className="text-xs font-medium text-slate-400 mb-3">Por motivo</p>
            <div className="flex flex-wrap gap-3">
              {report.byReason.map((r) => (
                <div key={r.reason} className="flex-1 min-w-[140px] rounded-lg bg-slate-800/50 border border-slate-700/40 px-3 py-2">
                  <p className="text-xs text-slate-400">{REASON_LABELS[r.reason] || r.reason}</p>
                  <p className="text-sm text-white font-semibold">{r.count} reg · {r.quantity} und</p>
                  <p className="text-xs text-amber-400">${r.estimatedUsd.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Por producto */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50">
              <p className="text-sm font-semibold text-white">Por producto (lo que más se dejó de vender)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Codigo</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Producto</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Veces</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Unidades</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Estimado USD</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Estimado Bs</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byProduct.map((p, i) => (
                    <tr key={p.productId || `free-${i}`} className="border-b border-slate-700/30 hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 font-mono text-xs text-green-400 whitespace-nowrap">{p.productCode || '—'}</td>
                      <td className="px-4 py-2.5 text-white">{p.productName}{!p.productId && <span className="text-xs text-slate-500 ml-2">(texto libre)</span>}</td>
                      <td className="px-4 py-2.5 text-right text-slate-300">{p.count}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-200">{p.quantity}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-amber-400">${p.estimatedUsd.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-400 hidden md:table-cell">Bs {fmtBs(p.estimatedBs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
