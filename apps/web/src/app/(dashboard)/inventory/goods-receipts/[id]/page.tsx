'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Truck, Loader2, ArrowLeft, Ban, PackageX } from 'lucide-react';
import { ImageZoomLightbox } from '@/components/image-zoom-lightbox';

interface Photo { id: string; thumbUrl: string; mediumUrl: string }
interface Item {
  id: string; productId: string; productName: string; productCode: string | null;
  qtyReceived: number; qtyReturned: number; returnReason: string | null; note: string | null; photos: Photo[];
}
interface Receipt {
  id: string; number: string; date: string; status: string;
  supplierName: string; driverName: string | null; truckPlate: string | null; notes: string | null;
  warehouse: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  createdBy: { name: string } | null;
  photos: Photo[];
  items: Item[];
}

const STATUS_BADGE: Record<string, string> = {
  REGISTRADO: 'bg-green-500/10 text-green-400 border-green-500/30',
  ANULADO: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
};
const STATUS_LABEL: Record<string, string> = { REGISTRADO: 'Registrado', ANULADO: 'Anulado' };

export default function GoodsReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const fetchReceipt = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/goods-receipts/${id}`);
      if (res.ok) setReceipt(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchReceipt(); }, [fetchReceipt]);
  useEffect(() => {
    document.title = receipt ? `${receipt.number} - Recepción | Trinity ERP` : 'Recepción de mercancía | Trinity ERP';
  }, [receipt]);
  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 4000); return () => clearTimeout(t); }
  }, [message]);

  async function cancel() {
    setBusy(true);
    try {
      const res = await fetch(`/api/proxy/goods-receipts/${id}/cancel`, { method: 'POST' });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Error'); }
      setConfirmCancel(false);
      setMessage({ type: 'success', text: 'Recepción anulada' });
      fetchReceipt();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Error al anular' });
    } finally { setBusy(false); }
  }

  function fmtDate(d: string) {
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
  }

  if (loading) return <div className="p-8 text-center text-slate-500"><Loader2 className="animate-spin inline" size={24} /></div>;
  if (!receipt) return <div className="p-8 text-center text-slate-500">Recepción no encontrada.</div>;

  const totalReturned = receipt.items.reduce((n, it) => n + (it.qtyReturned || 0), 0);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/inventory/goods-receipts" className="text-slate-400 hover:text-white"><ArrowLeft size={20} /></Link>
        <Truck className="text-sky-400" size={22} />
        <h1 className="text-xl font-bold text-white font-mono">{receipt.number}</h1>
        <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${STATUS_BADGE[receipt.status]}`}>{STATUS_LABEL[receipt.status]}</span>
        {receipt.status === 'REGISTRADO' && (
          <button onClick={() => setConfirmCancel(true)} disabled={busy} className="ml-auto text-slate-400 hover:text-red-400 flex items-center gap-2 text-sm">
            <Ban size={15} /> Anular
          </button>
        )}
      </div>

      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
          {message.text}
        </div>
      )}

      {/* Datos de la ficha */}
      <div className="card p-5 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
        <div><p className="text-xs text-slate-500">Fecha</p><p className="text-white">{fmtDate(receipt.date)}</p></div>
        <div className="col-span-2"><p className="text-xs text-slate-500">Proveedor</p><p className="text-white">{receipt.supplierName}</p></div>
        <div><p className="text-xs text-slate-500">Chofer</p><p className="text-white">{receipt.driverName || '—'}</p></div>
        <div><p className="text-xs text-slate-500">Placa del camión</p><p className="text-white font-mono">{receipt.truckPlate || '—'}</p></div>
        <div><p className="text-xs text-slate-500">Almacén</p><p className="text-white">{receipt.warehouse?.name || '—'}</p></div>
        <div><p className="text-xs text-slate-500">Recibió</p><p className="text-white">{receipt.createdBy?.name || '—'}</p></div>
        {receipt.notes && <div className="col-span-2 sm:col-span-3"><p className="text-xs text-slate-500">Nota general</p><p className="text-slate-300">{receipt.notes}</p></div>}
      </div>

      {/* Fotos generales */}
      {receipt.photos.length > 0 && (
        <div className="card p-4">
          <p className="text-xs text-slate-500 mb-2">Fotos de la recepción</p>
          <div className="flex items-center gap-2 flex-wrap">
            {receipt.photos.map((p) => (
              <button key={p.id} onClick={() => setLightbox(p.mediumUrl)} className="w-20 h-20 rounded-lg overflow-hidden border border-slate-700 hover:border-sky-500">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumbUrl} alt="foto" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Renglones */}
      <div className="space-y-3">
        {receipt.items.map((it) => (
          <div key={it.id} className="card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="font-mono text-xs text-sky-400">{it.productCode || '—'}</span>
                <p className="text-sm text-white">{it.productName}</p>
                {it.note && <p className="text-xs text-slate-500 mt-0.5">{it.note}</p>}
              </div>
              <div className="flex items-center gap-4 flex-shrink-0 text-right">
                <div>
                  <p className="text-xs text-slate-500">Recibido</p>
                  <p className="text-lg font-semibold text-white">{it.qtyReceived}</p>
                </div>
                {it.qtyReturned > 0 && (
                  <div>
                    <p className="text-xs text-amber-400">Devuelto</p>
                    <p className="text-lg font-semibold text-amber-400">{it.qtyReturned}</p>
                  </div>
                )}
              </div>
            </div>
            {it.qtyReturned > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
                <p className="text-xs text-amber-400 inline-flex items-center gap-1">
                  <PackageX size={13} /> Devuelto: {it.returnReason || 'sin motivo especificado'}
                </p>
                {it.photos.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {it.photos.map((p) => (
                      <button key={p.id} onClick={() => setLightbox(p.mediumUrl)} className="w-16 h-16 rounded-lg overflow-hidden border border-slate-700 hover:border-amber-500">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.thumbUrl} alt="evidencia" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        {receipt.items.length} artículo(s){totalReturned > 0 ? ` · ${totalReturned} unidad(es) devuelta(s)` : ''}
      </p>

      {/* Confirmación de anulación */}
      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-semibold text-white">Anular recepción</h3>
            <p className="text-sm text-slate-400">
              La recepción quedará marcada como anulada. Es un registro documental, así que no afecta el inventario.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setConfirmCancel(false)} disabled={busy} className="btn-secondary">Cancelar</button>
              <button onClick={cancel} disabled={busy} className="btn-primary flex items-center gap-2">
                {busy ? <Loader2 className="animate-spin" size={16} /> : <Ban size={16} />}
                Confirmar anulación
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && <ImageZoomLightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
