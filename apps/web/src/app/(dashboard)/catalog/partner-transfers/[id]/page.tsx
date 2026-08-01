'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ArrowLeft, AlertTriangle } from 'lucide-react';

interface TItem { code: string; name?: string; quantity: number; unitCost?: number }
interface Transfer {
  id: string; number: string; kind: 'SEND' | 'REQUEST'; direction: 'OUTGOING' | 'INCOMING';
  status: string; partnerName: string; notes?: string | null; items: TItem[];
  fromWarehouseId?: string | null; toWarehouseId?: string | null;
  createdAt: string; updatedAt: string;
}
interface Warehouse { id: string; name: string }

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Solicitado', APPROVED: 'Aprobado', SENT: 'Enviado',
  PENDING_RECEIPT: 'Por recibir', RECEIVED: 'Recibido', REJECTED: 'Rechazado', CANCELLED: 'Anulado',
};
const STATUS_COLOR: Record<string, string> = {
  RECEIVED: 'text-emerald-400', SENT: 'text-amber-400', PENDING_RECEIPT: 'text-amber-400',
  REQUESTED: 'text-sky-400', REJECTED: 'text-red-400', CANCELLED: 'text-slate-400', APPROVED: 'text-sky-400',
};

export default function PartnerTransferDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [t, setT] = useState<Transfer | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [tr, whs] = await Promise.all([
          fetch(`/api/proxy/integration/transfers/${encodeURIComponent(id)}`),
          fetch('/api/proxy/warehouses'),
        ]);
        if (!tr.ok) { setError('No se encontró el traslado.'); return; }
        setT(await tr.json());
        if (whs.ok) setWarehouses(await whs.json());
      } catch {
        setError('Error al cargar el traslado.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  useEffect(() => { if (t) document.title = `Traslado ${t.number} | Trinity ERP`; }, [t]);

  const whName = (wid?: string | null) => warehouses.find((w) => w.id === wid)?.name || (wid ? '—' : null);

  function tipoLabel(x: Transfer) {
    if (x.kind === 'SEND') return x.direction === 'OUTGOING' ? 'Envío (salida de mi inventario)' : 'Envío recibido';
    return x.direction === 'OUTGOING' ? 'Solicitud mía' : 'Solicitud recibida';
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="animate-spin mr-2" size={20} /> Cargando…</div>;

  if (error || !t) {
    return (
      <div className="max-w-2xl mx-auto mt-10 bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 text-amber-400" size={28} />
        <p className="text-slate-300">{error || 'Traslado no encontrado.'}</p>
        <Link href="/catalog/partner-transfers" className="text-sky-400 text-sm mt-3 inline-block">Volver a traslados</Link>
      </div>
    );
  }

  const totalUsd = (t.items || []).reduce((s, i) => s + (i.unitCost || 0) * i.quantity, 0);

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/catalog/partner-transfers" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 mb-4">
        <ArrowLeft size={16} /> Volver a traslados
      </Link>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white font-mono">{t.number}</h1>
        <span className={`text-sm font-semibold ${STATUS_COLOR[t.status] || 'text-slate-300'}`}>{STATUS_LABEL[t.status] || t.status}</span>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 mb-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div><div className="text-xs text-slate-500">Tipo</div><div className="text-slate-200">{tipoLabel(t)}</div></div>
        <div><div className="text-xs text-slate-500">Empresa socia</div><div className="text-slate-200">{t.partnerName}</div></div>
        <div><div className="text-xs text-slate-500">Creado</div><div className="text-slate-200">{new Date(t.createdAt).toLocaleString('es-VE')}</div></div>
        {whName(t.fromWarehouseId) && <div><div className="text-xs text-slate-500">Almacén origen</div><div className="text-slate-200">{whName(t.fromWarehouseId)}</div></div>}
        {whName(t.toWarehouseId) && <div><div className="text-xs text-slate-500">Almacén destino</div><div className="text-slate-200">{whName(t.toWarehouseId)}</div></div>}
        {t.notes && <div className="col-span-2 md:col-span-3"><div className="text-xs text-slate-500">Notas</div><div className="text-slate-200">{t.notes}</div></div>}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 text-slate-400">
              <th className="px-4 py-2 text-left">Código</th>
              <th className="px-4 py-2 text-left">Artículo</th>
              <th className="px-4 py-2 text-right">Cantidad</th>
              <th className="px-4 py-2 text-right">Costo unit. $</th>
              <th className="px-4 py-2 text-right">Subtotal $</th>
            </tr>
          </thead>
          <tbody>
            {(t.items || []).map((i, idx) => (
              <tr key={idx} className="border-b border-slate-700/30">
                <td className="px-4 py-2 font-mono text-green-400">{i.code}</td>
                <td className="px-4 py-2 text-slate-200">{i.name || '—'}</td>
                <td className="px-4 py-2 text-right text-slate-200">{i.quantity}</td>
                <td className="px-4 py-2 text-right text-slate-300">{i.unitCost != null ? `$${i.unitCost.toFixed(2)}` : '—'}</td>
                <td className="px-4 py-2 text-right text-slate-300">{i.unitCost != null ? `$${(i.unitCost * i.quantity).toFixed(2)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-700/50 bg-slate-800/30">
              <td colSpan={2} className="px-4 py-2 text-slate-300 font-semibold">Totales</td>
              <td className="px-4 py-2 text-right text-slate-200 font-semibold">{(t.items || []).reduce((s, i) => s + i.quantity, 0)}</td>
              <td className="px-4 py-2"></td>
              <td className="px-4 py-2 text-right text-slate-200 font-semibold">${totalUsd.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
