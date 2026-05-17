'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, FileX2, Loader2, Save, CheckCircle } from 'lucide-react';

interface ReturnSummaryItem {
  itemId: string;
  productId: string;
  productName: string;
  originalQty: number;
  returnedQty: number;
  availableQty: number;
}

interface InvoiceItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitPriceWithoutIva: number;
  ivaType: string;
  ivaAmount: number;
  totalUsd: number;
}

interface POItem {
  id: string;
  productId: string;
  product: { code: string; name: string; ivaType: string };
  quantity: number;
  costUsd: number;
  totalUsd: number;
  receivedQty: number;
}

interface ParentDoc {
  id: string;
  number: string;
  totalUsd: number;
  totalBs: number;
  exchangeRate: number;
  customer?: { name: string; rif: string | null } | null;
  supplier?: { name: string; rif: string | null } | null;
  items?: InvoiceItem[];
  poItems?: POItem[];
}

const TYPE_TITLES: Record<string, string> = {
  NCV: 'Nueva Nota de Crédito de Venta',
  NDV: 'Nueva Nota de Débito de Venta',
  NCC: 'Nueva Nota de Crédito de Compra',
  NDC: 'Nueva Nota de Débito de Compra',
};

export default function NewCreditDebitNotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const noteType = searchParams.get('type') || 'NCV';
  const invoiceId = searchParams.get('invoiceId') || '';
  const purchaseOrderId = searchParams.get('purchaseOrderId') || '';
  const originParam = searchParams.get('origin') as 'MERCHANDISE' | 'MANUAL' | null;

  const [parentDoc, setParentDoc] = useState<ParentDoc | null>(null);
  const [origin, setOrigin] = useState<'MERCHANDISE' | 'MANUAL'>(originParam || 'MERCHANDISE');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // MERCHANDISE state
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [returnSummary, setReturnSummary] = useState<ReturnSummaryItem[]>([]);

  // MANUAL state
  const [manualMode, setManualMode] = useState<'fixed' | 'pct'>('fixed');
  const [manualAmountUsd, setManualAmountUsd] = useState<number>(0);
  const [manualPct, setManualPct] = useState<number>(0);

  const [notes, setNotes] = useState('');
  const [exchangeRate, setExchangeRate] = useState(0);

  const isSale = ['NCV', 'NDV'].includes(noteType);

  const fetchParentDoc = useCallback(async () => {
    setLoading(true);
    try {
      if (isSale && invoiceId) {
        const [invRes, summaryRes] = await Promise.all([
          fetch(`/api/proxy/invoices/${invoiceId}`),
          fetch(`/api/proxy/credit-debit-notes/invoice-return-summary/${invoiceId}`),
        ]);
        if (!invRes.ok) throw new Error('Factura no encontrada');
        const inv = await invRes.json();
        setParentDoc({
          id: inv.id,
          number: inv.number,
          totalUsd: inv.totalUsd,
          totalBs: inv.totalBs,
          exchangeRate: inv.exchangeRate,
          customer: inv.customer,
          items: inv.items,
        });
        if (summaryRes.ok) {
          setReturnSummary(await summaryRes.json());
        }
      } else if (!isSale && purchaseOrderId) {
        const [poRes, summaryRes] = await Promise.all([
          fetch(`/api/proxy/purchase-orders/${purchaseOrderId}`),
          fetch(`/api/proxy/credit-debit-notes/purchase-return-summary/${purchaseOrderId}`),
        ]);
        if (!poRes.ok) throw new Error('Orden de compra no encontrada');
        const po = await poRes.json();
        setParentDoc({
          id: po.id,
          number: po.number,
          totalUsd: po.totalUsd,
          totalBs: po.totalBs || 0,
          exchangeRate: po.exchangeRate || 0,
          supplier: po.supplier,
          poItems: po.items,
        });
        if (summaryRes.ok) {
          setReturnSummary(await summaryRes.json());
        }
      }
      // Fetch today's exchange rate
      const rateRes = await fetch('/api/proxy/exchange-rate/today');
      if (rateRes.ok) {
        const rateData = await rateRes.json();
        setExchangeRate(rateData.rate || 0);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [invoiceId, purchaseOrderId, isSale]);

  useEffect(() => { fetchParentDoc(); }, [fetchParentDoc]);

  // NDV/NDC are always manual
  useEffect(() => {
    if (['NDV', 'NDC'].includes(noteType)) {
      setOrigin('MANUAL');
    }
  }, [noteType]);

  const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Calculate totals for merchandise
  const getIvaRate = (type: string) => {
    switch (type) {
      case 'GENERAL': return 0.16;
      case 'REDUCED': return 0.08;
      case 'SPECIAL': return 0.31;
      default: return 0;
    }
  };

  const merchandiseTotal = (() => {
    let subtotal = 0;
    let iva = 0;

    if (isSale && parentDoc?.items) {
      parentDoc.items.forEach((item) => {
        const qty = selectedItems[item.id] || 0;
        if (qty > 0) {
          const unitPrice = item.unitPriceWithoutIva || item.unitPrice / (1 + getIvaRate(item.ivaType));
          const lineSubtotal = unitPrice * qty;
          const lineIva = lineSubtotal * getIvaRate(item.ivaType);
          subtotal += lineSubtotal;
          iva += lineIva;
        }
      });
    } else if (!isSale && parentDoc?.poItems) {
      parentDoc.poItems.forEach((item) => {
        const qty = selectedItems[item.id] || 0;
        if (qty > 0) {
          const lineSubtotal = item.costUsd * qty;
          const lineIva = lineSubtotal * getIvaRate(item.product.ivaType);
          subtotal += lineSubtotal;
          iva += lineIva;
        }
      });
    }
    return { subtotal, iva, total: subtotal + iva };
  })();

  const manualTotal = (() => {
    if (manualMode === 'fixed') return manualAmountUsd;
    if (parentDoc) return parentDoc.totalUsd * (manualPct / 100);
    return 0;
  })();

  const currentTotal = origin === 'MERCHANDISE' ? merchandiseTotal.total : manualTotal;

  async function handleSubmit(andPost: boolean) {
    setSaving(true);
    setError('');
    try {
      const items = origin === 'MERCHANDISE'
        ? Object.entries(selectedItems)
            .filter(([, qty]) => qty > 0)
            .map(([id, qty]) => ({ invoiceItemId: id, quantity: qty }))
        : undefined;

      const body: any = {
        type: noteType,
        origin,
        invoiceId: isSale ? invoiceId : undefined,
        purchaseOrderId: !isSale ? purchaseOrderId : undefined,
        items,
        manualAmountUsd: origin === 'MANUAL' && manualMode === 'fixed' ? manualAmountUsd : undefined,
        manualPct: origin === 'MANUAL' && manualMode === 'pct' ? manualPct : undefined,
        notes: notes || undefined,
      };

      const res = await fetch('/api/proxy/credit-debit-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al crear la nota');
      }
      const created = await res.json();

      if (andPost) {
        const postRes = await fetch(`/api/proxy/credit-debit-notes/${created.id}/post`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!postRes.ok) {
          const err = await postRes.json().catch(() => ({}));
          throw new Error(err.message || 'Error al confirmar la nota');
        }
      }

      router.push(`/credit-debit-notes/${created.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-green-500" size={32} /></div>;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <FileX2 className="text-green-400" size={22} />
        </div>
        <h1 className="text-2xl font-bold text-white">{TYPE_TITLES[noteType] || 'Nueva Nota'}</h1>
      </div>

      {error && (
        <div className="p-3 rounded-lg border bg-red-500/10 border-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      {/* Parent doc info */}
      {parentDoc && (
        <div className="card p-5">
          <h3 className="text-xs text-slate-500 uppercase mb-3">Documento Origen</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-500">Número</p>
              <p className="text-white font-mono">{parentDoc.number}</p>
            </div>
            <div>
              <p className="text-slate-500">{isSale ? 'Cliente' : 'Proveedor'}</p>
              <p className="text-white">{parentDoc.customer?.name || parentDoc.supplier?.name || '—'}</p>
            </div>
            <div>
              <p className="text-slate-500">Total USD</p>
              <p className="text-white font-mono">$ {fmt(parentDoc.totalUsd)}</p>
            </div>
            <div>
              <p className="text-slate-500">Tasa hoy</p>
              <p className="text-white font-mono">Bs {fmt(exchangeRate)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Origin tabs - only show if no origin param forces a specific mode */}
      {['NCV', 'NCC'].includes(noteType) && !originParam && (
        <div className="flex gap-2">
          <button
            onClick={() => setOrigin('MERCHANDISE')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${origin === 'MERCHANDISE' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'}`}
          >
            Devolución de mercancía
          </button>
          <button
            onClick={() => setOrigin('MANUAL')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${origin === 'MANUAL' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'}`}
          >
            Ajuste manual
          </button>
        </div>
      )}

      {/* NDV/NDC are always manual - handled by useEffect below */}

      {/* MERCHANDISE tab */}
      {origin === 'MERCHANDISE' && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/30">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Producto</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Cant. Original</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Cant. a devolver</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Total USD</th>
              </tr>
            </thead>
            <tbody>
              {isSale && parentDoc?.items?.map((item) => {
                const qty = selectedItems[item.id] || 0;
                const unitPrice = item.unitPriceWithoutIva || item.unitPrice / (1 + getIvaRate(item.ivaType));
                const lineTotal = unitPrice * qty * (1 + getIvaRate(item.ivaType));
                const summary = returnSummary.find((s) => s.itemId === item.id);
                const availableQty = summary ? summary.availableQty : item.quantity;
                const returnedQty = summary ? summary.returnedQty : 0;
                const isFullyReturned = availableQty <= 0;
                const isPartial = returnedQty > 0 && !isFullyReturned;
                return (
                  <tr key={item.id} className={`border-b border-slate-700/30 ${isFullyReturned ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-white">{item.productName}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{item.quantity}</td>
                    <td className="px-4 py-3 text-center">
                      {isFullyReturned ? (
                        <span className="text-xs px-2 py-0.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-400">Devuelto completamente</span>
                      ) : isPartial ? (
                        <span className="text-xs px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400">Parcial ({returnedQty}/{item.quantity})</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isFullyReturned ? (
                        <span className="text-xs text-slate-500">—</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          max={availableQty}
                          value={qty || ''}
                          onChange={(e) => setSelectedItems((prev) => ({ ...prev, [item.id]: Math.min(Number(e.target.value) || 0, availableQty) }))}
                          className="input-field w-20 text-right"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-white font-mono">$ {fmt(lineTotal)}</td>
                  </tr>
                );
              })}
              {!isSale && parentDoc?.poItems?.map((item) => {
                const qty = selectedItems[item.id] || 0;
                const lineTotal = item.costUsd * qty * (1 + getIvaRate(item.product.ivaType));
                const summary = returnSummary.find((s) => s.itemId === item.id);
                const availableQty = summary ? summary.availableQty : item.receivedQty;
                const returnedQty = summary ? summary.returnedQty : 0;
                const isFullyReturned = availableQty <= 0;
                const isPartial = returnedQty > 0 && !isFullyReturned;
                return (
                  <tr key={item.id} className={`border-b border-slate-700/30 ${isFullyReturned ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-white">{item.product.name}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{item.receivedQty}</td>
                    <td className="px-4 py-3 text-center">
                      {isFullyReturned ? (
                        <span className="text-xs px-2 py-0.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-400">Devuelto completamente</span>
                      ) : isPartial ? (
                        <span className="text-xs px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400">Parcial ({returnedQty}/{item.receivedQty})</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isFullyReturned ? (
                        <span className="text-xs text-slate-500">—</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          max={availableQty}
                          value={qty || ''}
                          onChange={(e) => setSelectedItems((prev) => ({ ...prev, [item.id]: Math.min(Number(e.target.value) || 0, availableQty) }))}
                          className="input-field w-20 text-right"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-white font-mono">$ {fmt(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MANUAL tab */}
      {origin === 'MANUAL' && (
        <div className="card p-5 space-y-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={manualMode === 'fixed'} onChange={() => setManualMode('fixed')} className="text-green-500" />
              <span className="text-sm text-slate-300">Monto fijo</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={manualMode === 'pct'} onChange={() => setManualMode('pct')} className="text-green-500" />
              <span className="text-sm text-slate-300">Porcentaje</span>
            </label>
          </div>

          {manualMode === 'fixed' ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Monto USD</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={manualAmountUsd || ''}
                  onChange={(e) => setManualAmountUsd(Number(e.target.value) || 0)}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Equivalente Bs</label>
                <p className="text-white font-mono mt-2">Bs {fmt(manualAmountUsd * exchangeRate)}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Porcentaje %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={manualPct || ''}
                  onChange={(e) => setManualPct(Number(e.target.value) || 0)}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Monto calculado USD</label>
                <p className="text-white font-mono mt-2">$ {fmt(manualTotal)}</p>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Equivalente Bs</label>
                <p className="text-white font-mono mt-2">Bs {fmt(manualTotal * exchangeRate)}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="card p-5">
        <label className="text-xs text-slate-500 block mb-1">Observaciones</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="input-field w-full"
          placeholder="Motivo de la nota..."
        />
      </div>

      {/* Summary footer */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-xs text-slate-500">Subtotal USD</p>
              <p className="text-white font-mono text-lg">$ {fmt(origin === 'MERCHANDISE' ? merchandiseTotal.subtotal : (currentTotal * 0.86))}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">IVA USD</p>
              <p className="text-white font-mono text-lg">$ {fmt(origin === 'MERCHANDISE' ? merchandiseTotal.iva : (currentTotal * 0.14))}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Total USD</p>
              <p className="text-green-400 font-mono text-xl font-bold">$ {fmt(currentTotal)}</p>
              <p className="text-slate-500 font-mono text-xs">Bs {fmt(currentTotal * exchangeRate)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleSubmit(false)}
              disabled={saving || currentTotal <= 0}
              className="btn-secondary flex items-center gap-2 disabled:opacity-40"
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Guardar borrador
            </button>
            <button
              onClick={() => handleSubmit(true)}
              disabled={saving || currentTotal <= 0}
              className="btn-primary flex items-center gap-2 disabled:opacity-40"
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
              Crear y confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
