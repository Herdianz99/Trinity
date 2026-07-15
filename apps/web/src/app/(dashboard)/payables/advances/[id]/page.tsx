'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Printer, Banknote, History } from 'lucide-react';

interface Consumo {
  receiptId: string;
  number: string | null;
  type: string | null;
  date: string;
  amountUsd: number;
  amountBs: number;
}

interface Advance {
  id: string;
  amountUsd: number;
  amountBs: number;
  exchangeRate: number;
  paidAmountUsd: number;
  paidAmountBs: number;
  remainingUsd: number;
  remainingBs: number;
  status: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  supplier?: { id: string; name: string; rif: string | null } | null;
  method?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
  consumos: Consumo[];
}

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'text-green-400 border-green-500/30 bg-green-500/10',
  PARTIAL: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  CONSUMED: 'text-slate-400 border-slate-500/30 bg-slate-500/10',
};
const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Disponible',
  PARTIAL: 'Parcial',
  CONSUMED: 'Consumido',
};

function fmt(n: number | undefined) {
  return (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SupplierAdvanceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [advance, setAdvance] = useState<Advance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'info' | 'history'>('info');

  const fetchAdvance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/supplier-advances/${id}`);
      if (!res.ok) throw new Error('No se pudo cargar el anticipo');
      setAdvance(await res.json());
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchAdvance(); }, [fetchAdvance]);
  useEffect(() => {
    document.title = advance?.supplier
      ? `Anticipo ${advance.supplier.name} | Trinity ERP`
      : 'Anticipo | Trinity ERP';
  }, [advance]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-teal-400" size={32} /></div>;
  }
  if (error || !advance) {
    return (
      <div className="p-4 lg:p-6 max-w-4xl mx-auto">
        <Link href="/payables" className="text-slate-400 hover:text-slate-200 text-sm inline-flex items-center gap-1 mb-4">
          <ArrowLeft size={16} /> Volver a CxP
        </Link>
        <div className="card p-8 text-center text-red-400">{error || 'Anticipo no encontrado'}</div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <button onClick={() => router.push('/payables')} className="text-slate-400 hover:text-slate-200 text-sm inline-flex items-center gap-1 mb-3">
          <ArrowLeft size={16} /> Volver a CxP
        </button>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20">
              <Banknote className="text-teal-400" size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Anticipo a Proveedor</h1>
              <p className="text-slate-400 text-sm">
                {advance.supplier?.name || '—'}
                {advance.supplier?.rif ? ` · ${advance.supplier.rif}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2.5 py-1 rounded-full border ${STATUS_COLORS[advance.status] || ''}`}>
              {STATUS_LABELS[advance.status] || advance.status}
            </span>
            <button
              onClick={() => window.open(`/api/proxy/supplier-advances/${advance.id}/pdf`, '_blank')}
              className="btn-secondary !py-2 text-sm flex items-center gap-2"
              title="Imprimir comprobante"
            >
              <Printer size={15} /> Comprobante
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-slate-700/50">
        <button
          onClick={() => setTab('info')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'info' ? 'border-teal-400 text-teal-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          Informacion
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${tab === 'history' ? 'border-teal-400 text-teal-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <History size={14} /> Historial de consumo
          {advance.consumos.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-300">{advance.consumos.length}</span>
          )}
        </button>
      </div>

      {tab === 'info' && (
        <div className="space-y-5">
          {/* Montos */}
          <div className="card p-5">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Monto del anticipo</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-500 uppercase">Monto USD</p>
                <p className="text-2xl font-bold text-teal-400 font-mono">${fmt(advance.amountUsd)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">Tasa (Bs/USD)</p>
                <p className="text-xl font-bold text-white font-mono">{fmt(advance.exchangeRate)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">Monto Bs</p>
                <p className="text-xl font-bold text-teal-400 font-mono">Bs {fmt(advance.amountBs)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">Consumido USD</p>
                <p className="text-xl font-bold text-amber-400 font-mono">${fmt(advance.paidAmountUsd)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">Restante USD</p>
                <p className="text-xl font-bold text-green-400 font-mono">${fmt(advance.remainingUsd)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">Restante Bs</p>
                <p className="text-xl font-bold text-green-400 font-mono">Bs {fmt(advance.remainingBs)}</p>
              </div>
            </div>
          </div>

          {/* Datos */}
          <div className="card p-5">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Datos</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-slate-500 block text-xs uppercase">Metodo</span><span className="text-white">{advance.method?.name || '—'}</span></div>
              <div><span className="text-slate-500 block text-xs uppercase">Referencia</span><span className="text-white font-mono">{advance.reference || '—'}</span></div>
              <div><span className="text-slate-500 block text-xs uppercase">Registrado por</span><span className="text-white">{advance.createdBy?.name || '—'}</span></div>
              <div><span className="text-slate-500 block text-xs uppercase">Fecha</span><span className="text-white">{new Date(advance.createdAt).toLocaleString('es-VE')}</span></div>
            </div>
            {advance.notes && (
              <div className="mt-4 pt-4 border-t border-slate-700/50">
                <span className="text-slate-500 block text-xs uppercase mb-1">Notas</span>
                <p className="text-slate-200 text-sm whitespace-pre-wrap">{advance.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="card overflow-hidden">
          {advance.consumos.length === 0 ? (
            <p className="text-center py-12 text-slate-500 text-sm">
              Sin consumos — el anticipo esta disponible en su totalidad.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Recibo</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Monto USD</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Monto Bs</th>
                  </tr>
                </thead>
                <tbody>
                  {advance.consumos.map(c => (
                    <tr key={c.receiptId} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 text-slate-300 text-xs whitespace-nowrap">{new Date(c.date).toLocaleString('es-VE')}</td>
                      <td className="px-4 py-3">
                        <Link href={`/receipts/${c.receiptId}`} className="font-mono text-teal-400 hover:text-teal-300 hover:underline">
                          {c.number || '—'}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-amber-400">${fmt(c.amountUsd)}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">Bs {fmt(c.amountBs)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-600">
                    <td colSpan={2} className="px-4 py-3 text-right text-slate-300 font-semibold">Total consumido</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-white">${fmt(advance.paidAmountUsd)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-white">Bs {fmt(advance.paidAmountBs)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
