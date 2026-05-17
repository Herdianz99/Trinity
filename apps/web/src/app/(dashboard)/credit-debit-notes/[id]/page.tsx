'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, FileX2, Loader2, CheckCircle, Ban, Printer, ExternalLink,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import DynamicKeyModal from '@/components/dynamic-key-modal';

interface NoteDetail {
  id: string;
  number: string;
  type: string;
  origin: string;
  status: string;
  subtotalUsd: number;
  ivaUsd: number;
  totalUsd: number;
  subtotalBs: number;
  ivaBs: number;
  totalBs: number;
  exchangeRate: number;
  manualAmountUsd: number | null;
  manualPct: number | null;
  notes: string | null;
  createdAt: string;
  invoice: { id: string; number: string; totalUsd: number; totalBs: number; customer: { id: string; name: string; rif: string | null } | null; cashRegister: { code: string; name: string } | null } | null;
  purchaseOrder: { id: string; number: string; totalUsd: number; totalBs: number; supplier: { id: string; name: string; rif: string | null } | null } | null;
  items: NoteItem[];
}

interface NoteItem {
  id: string;
  productName: string;
  productCode: string;
  quantity: number;
  unitPriceUsd: number;
  unitPriceBs: number;
  ivaType: string;
  ivaAmount: number;
  ivaAmountBs: number;
  totalUsd: number;
  totalBs: number;
}

const TYPE_LABELS: Record<string, string> = {
  NCV: 'Nota de Crédito - Venta',
  NDV: 'Nota de Débito - Venta',
  NCC: 'Nota de Crédito - Compra',
  NDC: 'Nota de Débito - Compra',
};

const TYPE_COLORS: Record<string, string> = {
  NCV: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  NDV: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  NCC: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  NDC: 'text-pink-400 border-pink-500/30 bg-pink-500/10',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  POSTED: 'text-green-400 border-green-500/30 bg-green-500/10',
  CANCELLED: 'text-red-400 border-red-500/30 bg-red-500/10',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  POSTED: 'Confirmada',
  CANCELLED: 'Anulada',
};

const IVA_LABELS: Record<string, string> = {
  EXEMPT: 'Exento',
  REDUCED: 'Reducido (8%)',
  GENERAL: 'General (16%)',
  SPECIAL: 'Especial (31%)',
};

export default function CreditDebitNoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [note, setNote] = useState<NoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [posting, setPosting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const fetchNote = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/credit-debit-notes/${id}`);
      if (!res.ok) throw new Error('Nota no encontrada');
      setNote(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchNote(); }, [fetchNote]);

  async function handlePost() {
    if (!confirm('¿Confirmar esta nota? Se aplicarán los efectos contables e inventario.')) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/proxy/credit-debit-notes/${id}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al confirmar');
      }
      setMessage({ type: 'success', text: 'Nota confirmada exitosamente' });
      fetchNote();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setPosting(false);
    }
  }

  function requestCancel() {
    setAuthModalOpen(true);
  }

  async function executeCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/proxy/credit-debit-notes/${id}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al anular');
      }
      setMessage({ type: 'success', text: 'Nota anulada' });
      fetchNote();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setCancelling(false);
    }
  }

  function getCancelPermission(): string {
    if (!note) return '';
    const map: Record<string, string> = {
      NCV: 'DELETE_CREDIT_NOTE_SALE',
      NDV: 'DELETE_DEBIT_NOTE_SALE',
      NCC: 'DELETE_CREDIT_NOTE_PURCHASE',
      NDC: 'DELETE_DEBIT_NOTE_PURCHASE',
    };
    return map[note.type] || '';
  }

  const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function fmtDate(iso: string) {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-green-500" size={32} /></div>;
  if (error || !note) return (
    <div className="text-center py-20">
      <p className="text-red-400 mb-4">{error || 'Nota no encontrada'}</p>
      <button onClick={() => router.push('/credit-debit-notes')} className="btn-secondary">Volver</button>
    </div>
  );

  const isSale = ['NCV', 'NDV'].includes(note.type);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/credit-debit-notes')} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <FileX2 className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white font-mono">{note.number}</h1>
            <p className="text-slate-400 text-sm">{TYPE_LABELS[note.type]}</p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full border ${STATUS_COLORS[note.status]}`}>
            {STATUS_LABELS[note.status]}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {note.status === 'POSTED' && (
            <button onClick={() => window.open(`/api/proxy/credit-debit-notes/${id}/pdf`, '_blank')} className="btn-secondary text-sm flex items-center gap-1.5">
              <Printer size={14} /> Imprimir PDF
            </button>
          )}
          {note.status === 'DRAFT' && (
            <>
              <button onClick={handlePost} disabled={posting} className="btn-primary text-sm flex items-center gap-1.5">
                {posting ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle size={14} />} Confirmar nota
              </button>
              <button onClick={requestCancel} disabled={cancelling} className="text-sm px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1.5">
                {cancelling ? <Loader2 className="animate-spin" size={14} /> : <Ban size={14} />} Anular
              </button>
            </>
          )}
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Información General</TabsTrigger>
          <TabsTrigger value="effects">Efectos contables</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <div className="card p-6 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div>
                <p className="text-xs text-slate-500 uppercase">Tipo</p>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_COLORS[note.type]}`}>
                  {TYPE_LABELS[note.type]}
                </span>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">Origen</p>
                <p className="text-white">{note.origin === 'MERCHANDISE' ? 'Devolución de mercancía' : 'Ajuste manual'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">Fecha</p>
                <p className="text-white font-mono">{fmtDate(note.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">Tasa</p>
                <p className="text-white font-mono">Bs {fmt(note.exchangeRate)}</p>
              </div>
            </div>

            {/* Linked document */}
            <div className="bg-slate-900/50 rounded-lg p-4 mb-6">
              <h3 className="text-xs text-slate-500 uppercase mb-2">Documento vinculado</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-slate-400">Número:</span>
                  {isSale && note.invoice ? (
                    <button onClick={() => router.push(`/sales/invoices/${note.invoice!.id}`)} className="text-green-400 ml-2 hover:underline inline-flex items-center gap-1">
                      {note.invoice.number} <ExternalLink size={12} />
                    </button>
                  ) : note.purchaseOrder ? (
                    <button onClick={() => router.push(`/purchases/${note.purchaseOrder!.id}`)} className="text-green-400 ml-2 hover:underline inline-flex items-center gap-1">
                      {note.purchaseOrder.number} <ExternalLink size={12} />
                    </button>
                  ) : (
                    <span className="text-white ml-2">—</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-400">{isSale ? 'Cliente' : 'Proveedor'}:</span>
                  <span className="text-white ml-2">
                    {note.invoice?.customer?.name || note.purchaseOrder?.supplier?.name || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">RIF:</span>
                  <span className="text-white ml-2">
                    {note.invoice?.customer?.rif || note.purchaseOrder?.supplier?.rif || '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Items table (MERCHANDISE) */}
          {note.origin === 'MERCHANDISE' && note.items.length > 0 && (
            <div className="card overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-800/30">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Producto</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Cant.</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">P.Unit $</th>
                    <th className="text-center px-4 py-3 text-slate-400 font-medium">IVA</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">IVA $</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Total $</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Total Bs</th>
                  </tr>
                </thead>
                <tbody>
                  {note.items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-700/30">
                      <td className="px-4 py-3 text-white">{item.productName}</td>
                      <td className="px-4 py-3 text-right text-slate-300">{item.quantity}</td>
                      <td className="px-4 py-3 text-right text-white font-mono">{fmt(item.unitPriceUsd)}</td>
                      <td className="px-4 py-3 text-center text-xs text-slate-400">{IVA_LABELS[item.ivaType] || item.ivaType}</td>
                      <td className="px-4 py-3 text-right text-white font-mono">{fmt(item.ivaAmount)}</td>
                      <td className="px-4 py-3 text-right text-white font-mono">{fmt(item.totalUsd)}</td>
                      <td className="px-4 py-3 text-right text-slate-300 font-mono">{fmt(item.totalBs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Manual info */}
          {note.origin === 'MANUAL' && (
            <div className="card p-5 mb-4">
              <h3 className="text-xs text-slate-500 uppercase mb-3">Detalle del ajuste</h3>
              {note.manualPct ? (
                <p className="text-white">Porcentaje aplicado: <span className="font-mono text-green-400">{note.manualPct}%</span> sobre documento origen</p>
              ) : (
                <p className="text-white">Monto fijo: <span className="font-mono text-green-400">$ {fmt(note.manualAmountUsd || 0)}</span></p>
              )}
            </div>
          )}

          {/* Totals */}
          <div className="card p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-500 uppercase">Subtotal USD</p>
                <p className="text-white font-mono text-lg">$ {fmt(note.subtotalUsd)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">IVA USD</p>
                <p className="text-white font-mono text-lg">$ {fmt(note.ivaUsd)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">Total USD</p>
                <p className="text-green-400 font-mono text-xl font-bold">$ {fmt(note.totalUsd)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">Total Bs</p>
                <p className="text-white font-mono text-lg">Bs {fmt(note.totalBs)}</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          {note.notes && (
            <div className="card p-5 mt-4">
              <h3 className="text-xs text-slate-500 uppercase mb-2">Observaciones</h3>
              <p className="text-slate-300 text-sm">{note.notes}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="effects">
          <div className="card p-6">
            <h3 className="text-sm font-medium text-white mb-4">Efectos al confirmar la nota</h3>
            <div className="space-y-3 text-sm">
              {note.type === 'NCV' && (
                <>
                  {note.origin === 'MERCHANDISE' && (
                    <div className="flex items-start gap-2 text-slate-300">
                      <span className="text-green-400">●</span>
                      Mercancía devuelta al inventario (movimiento RETURN_IN)
                    </div>
                  )}
                  <div className="flex items-start gap-2 text-slate-300">
                    <span className="text-blue-400">●</span>
                    CxC de la factura reducida/cancelada por $ {fmt(note.totalUsd)}
                  </div>
                </>
              )}
              {note.type === 'NDV' && (
                <div className="flex items-start gap-2 text-slate-300">
                  <span className="text-orange-400">●</span>
                  Nueva CxC creada al cliente por $ {fmt(note.totalUsd)}
                </div>
              )}
              {note.type === 'NCC' && (
                <>
                  {note.origin === 'MERCHANDISE' && (
                    <div className="flex items-start gap-2 text-slate-300">
                      <span className="text-red-400">●</span>
                      Mercancía retirada del inventario (movimiento RETURN_OUT)
                    </div>
                  )}
                  <div className="flex items-start gap-2 text-slate-300">
                    <span className="text-purple-400">●</span>
                    CxP de la OC reducida/cancelada por $ {fmt(note.totalUsd)}
                  </div>
                </>
              )}
              {note.type === 'NDC' && (
                <div className="flex items-start gap-2 text-slate-300">
                  <span className="text-pink-400">●</span>
                  Nueva CxP creada al proveedor por $ {fmt(note.totalUsd)}
                </div>
              )}
              {note.status === 'POSTED' && (
                <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                  Estos efectos ya fueron aplicados al confirmar la nota.
                </div>
              )}
              {note.status === 'DRAFT' && (
                <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
                  Estos efectos se aplicarán al confirmar la nota.
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <DynamicKeyModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthorized={executeCancel}
        permission={getCancelPermission()}
        entityType="CreditDebitNote"
        entityId={id}
        action={`Anular ${note.type} ${note.number}`}
      />
    </div>
  );
}
