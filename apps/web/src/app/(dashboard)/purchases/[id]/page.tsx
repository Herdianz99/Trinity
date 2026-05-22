'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ShoppingCart,
  Loader2,
  CheckCircle,
  Ban,
  ExternalLink,
  X,
  BookOpen,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Supplier {
  id: string;
  name: string;
  rif: string | null;
  isRetentionAgent: boolean;
}

interface Product {
  id: string;
  code: string;
  name: string;
  costUsd: number;
  priceDetal: number;
  priceMayor: number;
  isService: boolean;
  gananciaPct: number;
  gananciaMayorPct: number;
  ivaType: string;
  bregaApplies: boolean;
}

interface PurchaseItem {
  id: string;
  productId: string;
  product: Product;
  quantity: number;
  costUsd: number;
  costBs: number;
  discountPct: number;
  discountUsd: number;
  discountBs: number;
  netCostUsd: number;
  netCostBs: number;
  totalUsd: number;
  totalBs: number;
  receivedQty: number;
}

interface PurchaseBill {
  id: string;
  number: string;
  purchaseNumber: number;
  status: 'PENDING' | 'PROCESSED' | 'CANCELLED';
  supplierId: string;
  supplier: Supplier;
  responsibleId: string | null;
  responsible: { id: string; name: string } | null;
  warehouseId: string | null;
  warehouse: { id: string; name: string } | null;
  invoiceDate: string | null;
  receivedDate: string | null;
  processedAt: string | null;
  currency: string;
  exchangeRate: number;
  isCredit: boolean;
  creditDays: number;
  supplierSerialNumber: string | null;
  supplierControlNumber: string | null;
  supplierInvoiceNumber: string | null;
  discountGlobalPct: number;
  discountGlobalUsd: number;
  discountGlobalBs: number;
  subtotalUsd: number;
  subtotalBs: number;
  exemptAmountUsd: number;
  exemptAmountBs: number;
  taxableBaseUsd: number;
  taxableBaseBs: number;
  totalIvaUsd: number;
  totalIvaBs: number;
  surchargeUsd: number;
  surchargeDistribution: string;
  totalSurchargeUsd: number;
  totalSurchargeBs: number;
  totalUsd: number;
  totalBs: number;
  totalWithSurchargeUsd: number;
  islrRetentionPct: number | null;
  islrRetentionUsd: number | null;
  islrRetentionBs: number | null;
  retentionVoucherNumber: string | null;
  notes: string | null;
  items: PurchaseItem[];
  createdAt: string;
}

interface SuggestedPrice {
  productId: string;
  productCode: string;
  productName: string;
  currentCostUsd: number;
  newCostUsd: number;
  currentGananciaPct: number;
  currentGananciaMayorPct: number;
  currentPriceDetal: number;
  suggestedPriceDetal: number;
  currentPriceMayor: number;
  suggestedPriceMayor: number;
  bregaPct: number;
  ivaMultiplier: number;
  ivaType: string;
}

interface Payable {
  id: string;
  amountUsd: number;
  amountBs: number;
  exchangeRate: number;
  retentionUsd: number;
  retentionBs: number;
  islrRetentionUsd: number;
  islrRetentionBs: number;
  netPayableUsd: number;
  netPayableBs: number;
  balanceUsd: number;
  paidAmountUsd: number;
  dueDate: string | null;
  status: string;
  notes: string | null;
  payments: {
    id: string;
    amountUsd: number;
    amountBs: number;
    method: { id: string; name: string } | null;
    reference: string | null;
    createdAt: string;
  }[];
}

interface CreditDebitNote {
  id: string;
  number: string;
  type: string;
  totalUsd: number;
  status: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IVA_LABELS: Record<string, string> = {
  EXEMPT: '0%',
  REDUCED: '8%',
  GENERAL: '16%',
  SPECIAL: '31%',
};

const STATUS_BADGES: Record<string, string> = {
  PENDING: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  PROCESSED: 'text-green-400 border-green-500/30 bg-green-500/10',
  CANCELLED: 'text-red-400 border-red-500/30 bg-red-500/10',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PROCESSED: 'Procesada',
  CANCELLED: 'Cancelada',
};

const PAYABLE_STATUS_BADGES: Record<string, string> = {
  PENDING: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  PARTIAL: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  PAID: 'text-green-400 border-green-500/30 bg-green-500/10',
  OVERDUE: 'text-red-400 border-red-500/30 bg-red-500/10',
};

const PAYABLE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Pagado',
  OVERDUE: 'Vencido',
};

const NOTE_TYPE_LABELS: Record<string, string> = {
  NCV: 'NC Venta',
  NDV: 'ND Venta',
  NCC: 'NC Compra',
  NDC: 'ND Compra',
};

const NOTE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  POSTED: 'Confirmada',
  CANCELLED: 'Anulada',
};

const NOTE_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  POSTED: 'text-green-400 border-green-500/30 bg-green-500/10',
  CANCELLED: 'text-red-400 border-red-500/30 bg-red-500/10',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function fmt(n: number): string {
  return n.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PurchaseBillDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  // Main state
  const [bill, setBill] = useState<PurchaseBill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState('info');

  // Process modal
  const [processModal, setProcessModal] = useState(false);
  const [suggestedPrices, setSuggestedPrices] = useState<SuggestedPrice[]>([]);
  const [priceEdits, setPriceEdits] = useState<Record<string, { gananciaPct: number; gananciaMayorPct: number; priceDetal: number; priceMayor: number }>>({});
  const [processing, setProcessing] = useState(false);

  // Lazy-loaded tab data
  const [payables, setPayables] = useState<Payable[]>([]);
  const [payablesLoading, setPayablesLoading] = useState(false);
  const [payablesFetched, setPayablesFetched] = useState(false);

  const [notes, setNotes] = useState<CreditDebitNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesFetched, setNotesFetched] = useState(false);

  // ---- Fetch bill ----
  const fetchBill = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/purchases/${id}`);
      if (!res.ok) throw new Error('Factura de compra no encontrada');
      const data = await res.json();
      setBill(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // ---- Fetch payables (lazy) ----
  const fetchPayables = useCallback(async () => {
    if (payablesFetched) return;
    setPayablesLoading(true);
    try {
      const res = await fetch(`/api/proxy/payables?purchaseOrderId=${id}`);
      if (res.ok) {
        const data = await res.json();
        const rows = data.data || data;
        setPayables(Array.isArray(rows) ? rows : []);
      }
    } catch { /* ignore */ } finally {
      setPayablesLoading(false);
      setPayablesFetched(true);
    }
  }, [id, payablesFetched]);

  // ---- Fetch credit/debit notes (lazy) ----
  const fetchNotes = useCallback(async () => {
    if (notesFetched) return;
    setNotesLoading(true);
    try {
      const res = await fetch(`/api/proxy/credit-debit-notes?purchaseOrderId=${id}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data.data || []);
      }
    } catch { /* ignore */ } finally {
      setNotesLoading(false);
      setNotesFetched(true);
    }
  }, [id, notesFetched]);

  // ---- Initial load ----
  useEffect(() => {
    fetchBill();
  }, [fetchBill]);

  // ---- Document title ----
  useEffect(() => {
    if (bill) {
      document.title = `${bill.number} - ${bill.supplier.name} | Trinity ERP`;
    }
  }, [bill]);

  // ---- Lazy tab loading ----
  useEffect(() => {
    if (activeTab === 'cxp' && bill) fetchPayables();
    if (activeTab === 'notas' && bill) fetchNotes();
  }, [activeTab, bill, fetchPayables, fetchNotes]);

  // ---- Process action ----
  async function handleOpenProcess() {
    if (!bill) return;
    setProcessing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/purchases/${id}/suggested-prices`);
      if (res.ok) {
        const prices: SuggestedPrice[] = await res.json();
        setSuggestedPrices(prices);
        const edits: Record<string, { gananciaPct: number; gananciaMayorPct: number; priceDetal: number; priceMayor: number }> = {};
        for (const p of prices) {
          edits[p.productId] = {
            gananciaPct: p.currentGananciaPct,
            gananciaMayorPct: p.currentGananciaMayorPct,
            priceDetal: p.suggestedPriceDetal,
            priceMayor: p.suggestedPriceMayor,
          };
        }
        setPriceEdits(edits);
      } else {
        setSuggestedPrices([]);
        setPriceEdits({});
      }
      setProcessModal(true);
    } catch {
      setSuggestedPrices([]);
      setPriceEdits({});
      setProcessModal(true);
    } finally {
      setProcessing(false);
    }
  }

  function handleGananciaChange(productId: string, field: 'gananciaPct' | 'gananciaMayorPct', value: number) {
    const sp = suggestedPrices.find((p) => p.productId === productId);
    if (!sp) return;
    const cost = sp.newCostUsd;
    const base = cost * (1 + sp.bregaPct / 100) * sp.ivaMultiplier;
    const prev = priceEdits[productId] || {
      gananciaPct: sp.currentGananciaPct,
      gananciaMayorPct: sp.currentGananciaMayorPct,
      priceDetal: sp.suggestedPriceDetal,
      priceMayor: sp.suggestedPriceMayor,
    };
    if (field === 'gananciaPct') {
      setPriceEdits({
        ...priceEdits,
        [productId]: {
          ...prev,
          gananciaPct: value,
          priceDetal: Math.round(base * (1 + value / 100) * 100) / 100,
        },
      });
    } else {
      setPriceEdits({
        ...priceEdits,
        [productId]: {
          ...prev,
          gananciaMayorPct: value,
          priceMayor: Math.round(base * (1 + value / 100) * 100) / 100,
        },
      });
    }
  }

  function handlePriceChange(productId: string, field: 'priceDetal' | 'priceMayor', value: number) {
    const sp = suggestedPrices.find((p) => p.productId === productId);
    if (!sp) return;
    const cost = sp.newCostUsd;
    const base = cost * (1 + sp.bregaPct / 100) * sp.ivaMultiplier;
    const ganancia = base > 0 ? ((value / base) - 1) * 100 : 0;
    const prev = priceEdits[productId] || {
      gananciaPct: sp.currentGananciaPct,
      gananciaMayorPct: sp.currentGananciaMayorPct,
      priceDetal: sp.suggestedPriceDetal,
      priceMayor: sp.suggestedPriceMayor,
    };
    if (field === 'priceDetal') {
      setPriceEdits({
        ...priceEdits,
        [productId]: {
          ...prev,
          priceDetal: value,
          gananciaPct: Math.round(ganancia * 100) / 100,
        },
      });
    } else {
      setPriceEdits({
        ...priceEdits,
        [productId]: {
          ...prev,
          priceMayor: value,
          gananciaMayorPct: Math.round(ganancia * 100) / 100,
        },
      });
    }
  }

  async function handleProcessWithPrices() {
    setProcessing(true);
    setMessage(null);
    try {
      const priceUpdates = Object.entries(priceEdits).map(([productId, data]) => ({
        productId,
        gananciaPct: data.gananciaPct,
        gananciaMayorPct: data.gananciaMayorPct,
      }));
      const res = await fetch(`/api/proxy/purchases/${id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceUpdates }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Error al procesar');
      }
      setProcessModal(false);
      setMessage({ type: 'success', text: 'Factura procesada exitosamente -- stock y precios actualizados' });
      // Reset lazy-loaded data so it refetches
      setPayablesFetched(false);
      setNotesFetched(false);
      fetchBill();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setProcessing(false);
    }
  }

  async function handleProcessWithoutPrices() {
    setProcessing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/purchases/${id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Error al procesar');
      }
      setProcessModal(false);
      setMessage({ type: 'success', text: 'Factura procesada exitosamente -- stock actualizado' });
      setPayablesFetched(false);
      setNotesFetched(false);
      fetchBill();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setProcessing(false);
    }
  }

  // ---- Cancel action ----
  async function handleCancel() {
    if (!confirm('¿Cancelar esta factura de compra? Esta accion no se puede deshacer.')) return;
    try {
      const res = await fetch(`/api/proxy/purchases/${id}/cancel`, {
        method: 'PATCH',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Error al cancelar');
      }
      setMessage({ type: 'success', text: 'Factura cancelada exitosamente' });
      fetchBill();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
  }

  // ---- Loading / Error states ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-green-500" size={32} />
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 mb-4">{error || 'Factura de compra no encontrada'}</p>
        <button onClick={() => router.push('/purchases')} className="btn-secondary">
          Volver a facturas de compra
        </button>
      </div>
    );
  }

  // ---- Derived computations ----
  const isRetentionAgent = bill.supplier.isRetentionAgent;
  const retentionIvaUsd = isRetentionAgent && bill.isCredit ? bill.totalIvaUsd * 0.75 : 0;
  const netPayable = retentionIvaUsd > 0 ? bill.totalUsd - retentionIvaUsd : bill.totalUsd;

  // ---- Render ----
  return (
    <div>
      {/* ═══ Header ═══ */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/purchases')}
            className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <ShoppingCart className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Factura {bill.number}
            </h1>
            <p className="text-slate-400 text-sm">{bill.supplier.name}</p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full border ${STATUS_BADGES[bill.status]}`}>
            {STATUS_LABELS[bill.status]}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {bill.status === 'PENDING' && (
            <>
              <button
                onClick={handleOpenProcess}
                disabled={processing}
                className="btn-primary text-sm flex items-center gap-1.5"
              >
                {processing ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <CheckCircle size={14} />
                )}
                Procesar
              </button>
              <button
                onClick={handleCancel}
                className="text-sm px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1.5"
              >
                <Ban size={14} /> Cancelar
              </button>
            </>
          )}
          {bill.status === 'PROCESSED' && (
            <Link
              href="/fiscal/libro-compras"
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              <BookOpen size={14} /> Ver en libro de compras
            </Link>
          )}
        </div>
      </div>

      {/* ═══ Message ═══ */}
      {message && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
            message.type === 'success'
              ? 'bg-green-500/10 text-green-400 border-green-500/20'
              : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* ═══ Tabs ═══ */}
      <Tabs defaultValue="info" onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="info">Informacion General</TabsTrigger>
          <TabsTrigger value="cxp">Cuenta por pagar</TabsTrigger>
          <TabsTrigger value="notas">Notas Cr/Db</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB 1: Informacion General                              */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="info">
          {/* Info grid */}
          <div className="card p-6 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-y-5 gap-x-6">
              {/* Row 1 */}
              <div>
                <p className="text-xs text-slate-500 uppercase mb-1">N. Documento</p>
                <p className="text-white font-mono font-medium">{bill.number}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase mb-1">Proveedor</p>
                <p className="text-white font-medium">{bill.supplier.name}</p>
                {bill.supplier.rif && (
                  <p className="text-slate-400 text-xs font-mono">{bill.supplier.rif}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase mb-1">Divisa</p>
                <p className="text-white">{bill.currency || 'USD'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase mb-1">Factor cambiario</p>
                <p className="text-white font-mono">{bill.exchangeRate?.toFixed(4)}</p>
              </div>

              {/* Row 2 */}
              <div>
                <p className="text-xs text-slate-500 uppercase mb-1">N. Serie proveedor</p>
                <p className="text-white font-mono">{bill.supplierSerialNumber || '--'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase mb-1">Almacen</p>
                <p className="text-white">{bill.warehouse?.name || '--'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase mb-1">Fecha factura</p>
                <p className="text-white font-mono">
                  {bill.invoiceDate ? fmtDate(bill.invoiceDate) : '--'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase mb-1">Fecha recepcion</p>
                <p className="text-white font-mono">
                  {bill.receivedDate ? fmtDate(bill.receivedDate) : '--'}
                </p>
              </div>

              {/* Row 3 */}
              <div>
                <p className="text-xs text-slate-500 uppercase mb-1">N. Control fiscal</p>
                <p className="text-white font-mono">{bill.supplierControlNumber || '--'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase mb-1">N. Factura proveedor</p>
                <p className="text-white font-mono">{bill.supplierInvoiceNumber || '--'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase mb-1">Forma de pago</p>
                <p className="text-white">
                  {bill.isCredit ? (
                    <span>
                      Credito{' '}
                      <span className="text-blue-400 text-xs font-medium">
                        ({bill.creditDays} dias)
                      </span>
                    </span>
                  ) : (
                    'Contado'
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase mb-1">Responsable</p>
                <p className="text-white">{bill.responsible?.name || '--'}</p>
              </div>
            </div>

            {bill.notes && (
              <div className="mt-5 pt-4 border-t border-slate-700/50">
                <p className="text-xs text-slate-500 uppercase mb-1">Observaciones</p>
                <p className="text-slate-300 text-sm">{bill.notes}</p>
              </div>
            )}
          </div>

          {/* Items table */}
          <div className="card overflow-hidden mb-4">
            <div className="px-6 py-3 border-b border-slate-700/50">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Articulos
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-800/30">
                    <th className="text-left px-3 py-3 text-slate-400 font-medium w-20">Ref. Art.</th>
                    <th className="text-left px-3 py-3 text-slate-400 font-medium min-w-[200px]">Articulo</th>
                    <th className="text-right px-3 py-3 text-slate-400 font-medium w-24">Cantidad</th>
                    <th className="text-right px-3 py-3 text-slate-400 font-medium w-28">Precio USD</th>
                    <th className="text-right px-3 py-3 text-slate-400 font-medium w-20">% Dto.</th>
                    <th className="text-right px-3 py-3 text-slate-400 font-medium w-28">Importe USD</th>
                    <th className="text-center px-3 py-3 text-slate-400 font-medium w-16">% IVA</th>
                    <th className="text-right px-3 py-3 text-slate-400 font-medium w-28">Importe Bs</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-700/30">
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-xs text-green-400">
                          {item.product.code}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-white text-sm">{item.product.name}</span>
                          {item.product.isService && (
                            <span className="shrink-0 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded font-bold">
                              SERVICIO
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-300">
                        {item.quantity}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-300">
                        ${fmt(item.costUsd)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-400">
                        {item.discountPct > 0 ? `${item.discountPct}%` : '--'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-white">
                        ${fmt(item.totalUsd)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`text-xs font-mono px-2 py-0.5 rounded-full border ${
                            item.product.ivaType === 'EXEMPT'
                              ? 'text-slate-400 border-slate-600 bg-slate-800'
                              : item.product.ivaType === 'REDUCED'
                              ? 'text-blue-400 border-blue-500/30 bg-blue-500/10'
                              : item.product.ivaType === 'SPECIAL'
                              ? 'text-purple-400 border-purple-500/30 bg-purple-500/10'
                              : 'text-green-400 border-green-500/30 bg-green-500/10'
                          }`}
                        >
                          {IVA_LABELS[item.product.ivaType] || '16%'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-400">
                        {fmt(item.totalBs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Fiscal totals footer */}
          <div className="card p-6 space-y-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Totales Fiscales
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Subtotal $</p>
                <p className="text-white font-mono text-lg">${fmt(bill.subtotalUsd)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">% Dto. global</p>
                <p className="text-white font-mono">
                  {bill.discountGlobalPct > 0 ? (
                    <span>
                      {bill.discountGlobalPct}%{' '}
                      <span className="text-red-400">-${fmt(bill.discountGlobalUsd)}</span>
                    </span>
                  ) : (
                    '--'
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Sub-Total c/Dto $</p>
                <p className="text-white font-mono text-lg">
                  ${fmt(bill.subtotalUsd - bill.discountGlobalUsd)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Monto Exento $</p>
                <p className="text-slate-300 font-mono">${fmt(bill.exemptAmountUsd)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Base IVA $</p>
                <p className="text-white font-mono">${fmt(bill.taxableBaseUsd)}</p>
              </div>
            </div>

            <div className="border-t border-slate-700/50 pt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Total IVA $</p>
                <p className="text-amber-400 font-mono">${fmt(bill.totalIvaUsd)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Recargo $</p>
                <p className="text-cyan-400 font-mono">
                  {bill.totalSurchargeUsd > 0 ? `$${fmt(bill.totalSurchargeUsd)}` : '--'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Total $</p>
                <p className="text-green-400 font-mono text-xl font-bold">
                  ${fmt(bill.totalUsd)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Total Bs</p>
                <p className="text-blue-400 font-mono text-lg">
                  Bs {fmt(bill.totalBs)}
                </p>
              </div>
              <div></div>
            </div>

            {/* IVA Retention (retention agent + credit) */}
            {isRetentionAgent && bill.isCredit && (
              <div className="border-t border-purple-500/20 pt-4">
                <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
                    Retencion IVA (Agente de Retencion)
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Retencion IVA (75%)</p>
                      <p className="text-purple-400 font-mono font-bold">
                        -${fmt(retentionIvaUsd)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">N. Comprobante retencion</p>
                      <p className="text-white font-mono">
                        {bill.retentionVoucherNumber || '--'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Neto a pagar $</p>
                      <p className="text-green-400 font-mono text-lg font-bold">
                        ${fmt(netPayable)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Neto a pagar Bs</p>
                      <p className="text-blue-400 font-mono">
                        Bs {fmt(netPayable * bill.exchangeRate)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB 2: Cuenta por pagar                                */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="cxp">
          <PayableTab
            bill={bill}
            payables={payables}
            loading={payablesLoading}
          />
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB 3: Notas Cr/Db                                     */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="notas">
          <NotesTab notes={notes} loading={notesLoading} />
        </TabsContent>
      </Tabs>

      {/* ═══ Process Modal ═══ */}
      {processModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setProcessModal(false)}
          />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Procesar Factura {bill.number}
                </h2>
                <p className="text-sm text-slate-400">
                  Revisa y ajusta los precios de venta antes de procesar
                </p>
              </div>
              <button
                onClick={() => setProcessModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {suggestedPrices.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">
                  No hay productos (no servicio) para actualizar precios
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="text-left px-2 py-2 text-slate-400 font-medium text-xs">Codigo</th>
                        <th className="text-left px-2 py-2 text-slate-400 font-medium text-xs">Producto</th>
                        <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">Costo ant.</th>
                        <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">Costo nuevo</th>
                        <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">Gan.% Detal</th>
                        <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">P. Venta Detal</th>
                        <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">Gan.% Mayor</th>
                        <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">P. Venta Mayor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suggestedPrices.map((sp) => {
                        const edits = priceEdits[sp.productId] || {
                          gananciaPct: sp.currentGananciaPct,
                          gananciaMayorPct: sp.currentGananciaMayorPct,
                          priceDetal: sp.suggestedPriceDetal,
                          priceMayor: sp.suggestedPriceMayor,
                        };
                        const costUp = sp.newCostUsd > sp.currentCostUsd;
                        const costDown = sp.newCostUsd < sp.currentCostUsd;
                        return (
                          <tr key={sp.productId} className="border-b border-slate-700/30">
                            <td className="px-2 py-2 font-mono text-green-400 text-xs">
                              {sp.productCode}
                            </td>
                            <td className="px-2 py-2 text-white text-xs">{sp.productName}</td>
                            <td className="px-2 py-2 text-right font-mono text-slate-400 text-xs">
                              ${sp.currentCostUsd.toFixed(2)}
                            </td>
                            <td
                              className={`px-2 py-2 text-right font-mono text-xs font-bold ${
                                costUp ? 'text-red-400' : costDown ? 'text-green-400' : 'text-white'
                              }`}
                            >
                              ${sp.newCostUsd.toFixed(2)}
                            </td>
                            <td className="px-2 py-2 text-right">
                              <input
                                type="number"
                                step="0.1"
                                value={edits.gananciaPct}
                                onChange={(e) =>
                                  handleGananciaChange(sp.productId, 'gananciaPct', Number(e.target.value))
                                }
                                className="input-field !py-0.5 text-xs w-16 text-right font-mono"
                              />
                            </td>
                            <td className="px-2 py-2 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={edits.priceDetal}
                                onChange={(e) =>
                                  handlePriceChange(sp.productId, 'priceDetal', Number(e.target.value))
                                }
                                className="input-field !py-0.5 text-xs w-20 text-right font-mono"
                              />
                            </td>
                            <td className="px-2 py-2 text-right">
                              <input
                                type="number"
                                step="0.1"
                                value={edits.gananciaMayorPct}
                                onChange={(e) =>
                                  handleGananciaChange(sp.productId, 'gananciaMayorPct', Number(e.target.value))
                                }
                                className="input-field !py-0.5 text-xs w-16 text-right font-mono"
                              />
                            </td>
                            <td className="px-2 py-2 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={edits.priceMayor}
                                onChange={(e) =>
                                  handlePriceChange(sp.productId, 'priceMayor', Number(e.target.value))
                                }
                                className="input-field !py-0.5 text-xs w-20 text-right font-mono"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-slate-700/50">
                <button
                  type="button"
                  onClick={() => setProcessModal(false)}
                  className="text-sm text-slate-400 hover:text-white transition-colors px-3 py-2"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleProcessWithoutPrices}
                  disabled={processing}
                  className="btn-secondary !py-2.5 text-sm flex items-center gap-2"
                >
                  {processing && <Loader2 className="animate-spin" size={16} />}
                  Procesar sin cambiar precios
                </button>
                <button
                  type="button"
                  onClick={handleProcessWithPrices}
                  disabled={processing}
                  className="btn-primary !py-2.5 text-sm flex items-center gap-2"
                >
                  {processing ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <CheckCircle size={16} />
                  )}
                  Procesar con estos precios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Payable Tab
// ---------------------------------------------------------------------------

function PayableTab({
  bill,
  payables,
  loading,
}: {
  bill: PurchaseBill;
  payables: Payable[];
  loading: boolean;
}) {
  const router = useRouter();

  if (!bill.isCredit || bill.status !== 'PROCESSED') {
    return (
      <div className="card p-12 text-center text-slate-500">
        {bill.status === 'PENDING'
          ? 'La cuenta por pagar se generara al procesar la factura'
          : bill.status === 'CANCELLED'
          ? 'Factura cancelada -- no hay cuenta por pagar'
          : !bill.isCredit
          ? 'Esta factura es de contado -- no genera cuenta por pagar'
          : 'No hay cuenta por pagar vinculada'}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-green-500" size={24} />
      </div>
    );
  }

  if (payables.length === 0) {
    return (
      <div className="card p-12 text-center text-slate-500">
        No hay cuenta por pagar vinculada
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {payables.map((p) => (
        <div key={p.id} className="card p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-slate-500 uppercase mb-1">Monto total</p>
              <p className="text-white font-mono font-bold">${fmt(p.amountUsd)}</p>
              <p className="text-slate-400 font-mono text-xs">Bs {fmt(p.amountBs)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase mb-1">Retenciones</p>
              {p.retentionUsd > 0 ? (
                <p className="text-purple-400 font-mono">-${fmt(p.retentionUsd)}</p>
              ) : (
                <p className="text-slate-500 font-mono">--</p>
              )}
              {p.islrRetentionUsd > 0 && (
                <p className="text-orange-400 font-mono text-xs">ISLR -${fmt(p.islrRetentionUsd)}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase mb-1">Neto a pagar</p>
              <p className="text-white font-mono font-bold">${fmt(p.netPayableUsd)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase mb-1">Saldo pendiente</p>
              <p className="text-amber-400 font-mono font-bold">${fmt(p.balanceUsd)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-slate-500 uppercase mb-1">Fecha vencimiento</p>
              <p className="text-white">{p.dueDate ? fmtDate(p.dueDate) : '--'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase mb-1">Estado</p>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${PAYABLE_STATUS_BADGES[p.status] || ''}`}>
                {PAYABLE_STATUS_LABELS[p.status] || p.status}
              </span>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase mb-1">Pagado</p>
              <p className="text-slate-300 font-mono">${fmt(p.paidAmountUsd)}</p>
            </div>
            <div></div>
          </div>

          {/* Payments history */}
          {p.payments && p.payments.length > 0 && (
            <div className="border-t border-slate-700/50 pt-4 mt-2">
              <p className="text-xs text-slate-500 uppercase mb-2">Pagos registrados</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-3 py-2 text-slate-400 font-medium text-xs">Fecha</th>
                    <th className="text-right px-3 py-2 text-slate-400 font-medium text-xs">Monto USD</th>
                    <th className="text-right px-3 py-2 text-slate-400 font-medium text-xs">Monto Bs</th>
                    <th className="text-left px-3 py-2 text-slate-400 font-medium text-xs">Metodo</th>
                    <th className="text-left px-3 py-2 text-slate-400 font-medium text-xs">Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  {p.payments.map((pay) => (
                    <tr key={pay.id} className="border-b border-slate-700/30">
                      <td className="px-3 py-2 text-slate-300 text-xs">{fmtDate(pay.createdAt)}</td>
                      <td className="px-3 py-2 text-right font-mono text-white">${fmt(pay.amountUsd)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-300">Bs {fmt(pay.amountBs)}</td>
                      <td className="px-3 py-2 text-slate-300">{pay.method?.name || '--'}</td>
                      <td className="px-3 py-2 text-slate-400 text-xs">{pay.reference || '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4">
            <button
              onClick={() => router.push(`/payables/${p.id}`)}
              className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              Ver cuenta por pagar <ExternalLink size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Credit/Debit Notes Tab
// ---------------------------------------------------------------------------

function NotesTab({
  notes,
  loading,
}: {
  notes: CreditDebitNote[];
  loading: boolean;
}) {
  const router = useRouter();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-green-500" size={24} />
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="card p-12 text-center text-slate-500">
        No hay notas de credito/debito vinculadas
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/50">
            <th className="text-left px-4 py-3 text-slate-400 font-medium">Numero</th>
            <th className="text-left px-4 py-3 text-slate-400 font-medium">Tipo</th>
            <th className="text-left px-4 py-3 text-slate-400 font-medium hidden sm:table-cell">Fecha</th>
            <th className="text-right px-4 py-3 text-slate-400 font-medium">Total USD</th>
            <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
            <th className="text-center px-4 py-3 text-slate-400 font-medium w-16"></th>
          </tr>
        </thead>
        <tbody>
          {notes.map((n) => (
            <tr key={n.id} className="border-b border-slate-700/30">
              <td className="px-4 py-3 text-white font-mono">{n.number}</td>
              <td className="px-4 py-3 text-slate-300">
                {NOTE_TYPE_LABELS[n.type] || n.type}
              </td>
              <td className="px-4 py-3 text-slate-400 text-xs hidden sm:table-cell">
                {fmtDate(n.createdAt)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-white">
                ${fmt(n.totalUsd)}
              </td>
              <td className="px-4 py-3 text-center">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${NOTE_STATUS_COLORS[n.status] || ''}`}>
                  {NOTE_STATUS_LABELS[n.status] || n.status}
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                <button
                  onClick={() => router.push(`/credit-debit-notes/${n.id}`)}
                  className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 mx-auto"
                >
                  Ver <ExternalLink size={10} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
