'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, FileText, Loader2, Printer, XCircle, CreditCard, X,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import DynamicKeyModal from '@/components/dynamic-key-modal';

interface ReceiptItem {
  id: string;
  itemType: string;
  receivableId: string | null;
  payableId: string | null;
  receivable: { id: string; invoice?: { number: string }; amountUsd: number; status: string } | null;
  payable: { id: string; purchaseOrder?: { number: string }; netPayableUsd: number; status: string } | null;
  description: string;
  amountUsd: number;
  amountBsHistoric: number;
  amountBsToday: number;
  differentialBs: number;
  sign: number;
}

interface ReceiptPayment {
  id: string;
  method: { id: string; name: string };
  amountUsd: number;
  amountBs: number;
  exchangeRate: number;
  reference: string | null;
  createdAt: string;
}

interface Receipt {
  id: string;
  number: string;
  type: string;
  customer: { id: string; name: string; rif: string | null } | null;
  supplier: { id: string; name: string; rif: string | null } | null;
  status: string;
  totalUsd: number;
  totalBsHistoric: number;
  totalBsToday: number;
  exchangeRate: number;
  differentialBs: number;
  hasDifferential: boolean;
  notes: string | null;
  items: ReceiptItem[];
  payments: ReceiptPayment[];
  createdAt: string;
}

interface PaymentMethodData {
  id: string;
  name: string;
  isDivisa: boolean;
  children?: PaymentMethodData[];
}

interface PaymentLine {
  methodId: string;
  methodName: string;
  isDivisa: boolean;
  amountUsd: number;
  amountBs: number;
  reference: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  POSTED: 'text-green-400 border-green-500/30 bg-green-500/10',
  CANCELLED: 'text-red-400 border-red-500/30 bg-red-500/10',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  POSTED: 'Procesado',
  CANCELLED: 'Cancelado',
};

const TYPE_LABELS: Record<string, string> = {
  COLLECTION: 'Recibo de Cobro',
  PAYMENT: 'Recibo de Pago',
};

export default function ReceiptDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Payment modal for processing DRAFT
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodData[]>([]);
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [processing, setProcessing] = useState(false);
  const [todayRate, setTodayRate] = useState(0);

  const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fetchReceipt = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/receipts/${id}`);
      if (!res.ok) throw new Error('No encontrado');
      const json = await res.json();
      setReceipt(json);
    } catch {
      setMessage({ type: 'error', text: 'Recibo no encontrado' });
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchReceipt(); }, [fetchReceipt]);

  // Fetch rate and methods for processing
  useEffect(() => {
    (async () => {
      try {
        const [rateRes, methodsRes] = await Promise.all([
          fetch('/api/proxy/exchange-rate/today'),
          fetch('/api/proxy/payment-methods'),
        ]);
        if (rateRes.ok) {
          const rateData = await rateRes.json();
          setTodayRate(rateData.rate || 0);
        }
        if (methodsRes.ok) {
          const methodsData = await methodsRes.json();
          setPaymentMethods(methodsData || []);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  function requestCancel() {
    setAuthModalOpen(true);
  }

  async function executeCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/proxy/receipts/${id}/cancel`, { method: 'PATCH' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error');
      setMessage({ type: 'success', text: 'Recibo cancelado' });
      fetchReceipt();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
    setCancelling(false);
  }

  function getCancelPermission(): string {
    if (!receipt) return '';
    return receipt.type === 'COLLECTION' ? 'DELETE_RECEIPT_COLLECTION' : 'DELETE_RECEIPT_PAYMENT';
  }

  // Payment modal
  const flatMethods = paymentMethods.flatMap((m) =>
    m.children && m.children.length > 0 ? m.children.filter((c) => c.id) : [m]
  );

  const openPayModal = () => {
    if (!receipt) return;
    const netAbsUsd = Math.abs(receipt.totalUsd);
    setPaymentLines([{
      methodId: '',
      methodName: '',
      isDivisa: false,
      amountUsd: netAbsUsd,
      amountBs: Math.round(netAbsUsd * todayRate * 100) / 100,
      reference: '',
    }]);
    setPayModalOpen(true);
  };

  const addPaymentLine = () => {
    setPaymentLines((prev) => {
      const netAbsUsd = Math.abs(receipt?.totalUsd || 0);
      const usedUsd = prev.reduce((s, l) => s + l.amountUsd, 0);
      const remainingUsd = Math.max(0, Math.round((netAbsUsd - usedUsd) * 100) / 100);
      const remainingBs = Math.round(remainingUsd * todayRate * 100) / 100;
      return [...prev, { methodId: '', methodName: '', isDivisa: false, amountUsd: remainingUsd, amountBs: remainingBs, reference: '' }];
    });
  };

  const removePaymentLine = (index: number) => {
    setPaymentLines((prev) => prev.filter((_, i) => i !== index));
  };

  const updatePaymentLine = (index: number, field: string, value: any) => {
    setPaymentLines((prev) => prev.map((line, i) => {
      if (i !== index) return line;
      const updated = { ...line, [field]: value };
      if (field === 'methodId') {
        const findMethod = (methods: PaymentMethodData[]): PaymentMethodData | undefined => {
          for (const m of methods) {
            if (m.id === value) return m;
            if (m.children) { const f = findMethod(m.children); if (f) return f; }
          }
        };
        const method = findMethod(paymentMethods);
        if (method) {
          updated.methodName = method.name;
          updated.isDivisa = method.isDivisa;
        }
      }
      if (field === 'amountUsd') {
        updated.amountBs = Math.round(Number(value) * todayRate * 100) / 100;
      }
      if (field === 'amountBs' && !updated.isDivisa) {
        updated.amountUsd = todayRate > 0 ? Math.round(Number(value) / todayRate * 100) / 100 : 0;
      }
      return updated;
    }));
  };

  const processReceipt = async () => {
    const validLines = paymentLines.filter((l) => l.methodId && l.amountUsd > 0);
    if (validLines.length === 0) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/proxy/receipts/${id}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payments: validLines.map((l) => ({
            methodId: l.methodId,
            amountUsd: l.amountUsd,
            amountBs: l.amountBs,
            reference: l.reference || undefined,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error');
      setPayModalOpen(false);
      setMessage({ type: 'success', text: 'Recibo procesado exitosamente' });
      fetchReceipt();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
    setProcessing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="animate-spin text-green-400" size={32} />
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="text-center py-32 text-red-400">Recibo no encontrado</div>
    );
  }

  const isCollection = receipt.type === 'COLLECTION';
  const entity = isCollection ? receipt.customer : receipt.supplier;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white font-mono">{receipt.number}</h1>
              <span className={`px-3 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[receipt.status]}`}>
                {STATUS_LABELS[receipt.status]}
              </span>
            </div>
            <p className="text-slate-400 mt-0.5">{TYPE_LABELS[receipt.type]}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {receipt.status === 'DRAFT' && (
            <>
              <button
                onClick={openPayModal}
                className={`flex items-center gap-2 px-4 py-2.5 text-white rounded-lg font-medium transition-colors ${
                  isCollection ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600 hover:bg-blue-500'
                }`}
              >
                <CreditCard size={16} />
                Procesar
              </button>
              <button
                onClick={requestCancel}
                disabled={cancelling}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg font-medium transition-colors"
              >
                <XCircle size={16} />
                Cancelar
              </button>
            </>
          )}
          {receipt.status === 'POSTED' && (
            <a
              href={`/api/proxy/receipts/${id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
            >
              <Printer size={16} />
              Imprimir PDF
            </a>
          )}
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg border ${message.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Informacion General</TabsTrigger>
          <TabsTrigger value="payments">Pagos registrados</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <div className="space-y-6 mt-4">
            {/* Receipt info */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-slate-500 block">Numero</span>
                  <span className="text-white font-mono font-medium">{receipt.number}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">{isCollection ? 'Cliente' : 'Proveedor'}</span>
                  <span className="text-white">{entity?.name || '—'}</span>
                  {entity?.rif && <span className="text-slate-400 text-xs block">{entity.rif}</span>}
                </div>
                <div>
                  <span className="text-slate-500 block">Fecha</span>
                  <span className="text-white">{new Date(receipt.createdAt).toLocaleDateString('es-VE')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Tasa del dia</span>
                  <span className="text-white font-mono">{fmt(receipt.exchangeRate)} Bs/$</span>
                </div>
              </div>
              {receipt.notes && (
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <span className="text-slate-500 text-sm block mb-1">Notas</span>
                  <p className="text-slate-300 text-sm">{receipt.notes}</p>
                </div>
              )}
            </div>

            {/* Documents table */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/50">
                <h3 className="text-sm font-semibold text-slate-300">Documentos incluidos</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Documento</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Tipo</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">USD</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">Bs historico</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">Bs hoy</th>
                      <th className="text-center px-4 py-3 text-slate-400 font-medium">Signo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipt.items.map((item) => (
                      <tr
                        key={item.id}
                        className={`border-b border-slate-700/30 ${
                          item.itemType === 'DIFFERENTIAL'
                            ? 'bg-amber-500/5'
                            : item.sign === 1 ? 'bg-green-500/5' : 'bg-red-500/5'
                        }`}
                      >
                        <td className="px-4 py-3 text-white font-mono">{item.description}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            item.itemType === 'RECEIVABLE' ? 'bg-green-500/20 text-green-400' :
                            item.itemType === 'PAYABLE' ? 'bg-red-500/20 text-red-400' :
                            'bg-amber-500/20 text-amber-400'
                          }`}>
                            {item.itemType === 'RECEIVABLE' ? 'CxC' : item.itemType === 'PAYABLE' ? 'CxP' : 'Diferencial'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-white font-mono">
                          {item.itemType === 'DIFFERENTIAL' ? '—' : `$${fmt(item.amountUsd)}`}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-300 font-mono">
                          {item.itemType === 'DIFFERENTIAL' ? '—' : `${fmt(item.amountBsHistoric)} Bs`}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {item.itemType === 'DIFFERENTIAL'
                            ? <span className={item.differentialBs > 0 ? 'text-amber-400' : 'text-green-400'}>{fmt(item.differentialBs)} Bs</span>
                            : <span className="text-white">{fmt(item.amountBsToday)} Bs</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-center">
                          {item.itemType !== 'DIFFERENTIAL' && (
                            <span className={`font-bold ${item.sign === 1 ? 'text-green-400' : 'text-red-400'}`}>
                              {item.sign === 1 ? '+' : '-'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="px-4 py-4 border-t border-slate-700/50 space-y-2 font-mono text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Total USD:</span>
                  <span className="text-white font-medium">${fmt(receipt.totalUsd)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Bs historico:</span>
                  <span className="text-slate-300">{fmt(receipt.totalBsHistoric)} Bs</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Bs hoy:</span>
                  <span className="text-white">{fmt(receipt.totalBsToday)} Bs</span>
                </div>
                {receipt.hasDifferential && (
                  <div className={`flex justify-between px-3 py-2 rounded-lg ${
                    receipt.differentialBs > 0 ? 'bg-amber-500/10' : 'bg-green-500/10'
                  }`}>
                    <span className={receipt.differentialBs > 0 ? 'text-amber-400' : 'text-green-400'}>
                      Diferencial cambiario:
                    </span>
                    <span className={receipt.differentialBs > 0 ? 'text-amber-400' : 'text-green-400'}>
                      {receipt.differentialBs > 0 ? '+' : ''}{fmt(receipt.differentialBs)} Bs
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-slate-700/50 text-base">
                  <span className="text-white font-semibold">Saldo Neto:</span>
                  <span className="text-white font-bold">${fmt(Math.abs(receipt.totalUsd))}</span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="payments">
          <div className="mt-4 bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            {receipt.payments.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                No hay pagos registrados
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Metodo</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">USD</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Bs</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Referencia</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.payments.map((p) => (
                    <tr key={p.id} className="border-b border-slate-700/30">
                      <td className="px-4 py-3 text-white">{p.method?.name || '—'}</td>
                      <td className="px-4 py-3 text-right text-white font-mono">${fmt(p.amountUsd)}</td>
                      <td className="px-4 py-3 text-right text-slate-300 font-mono">{fmt(p.amountBs)} Bs</td>
                      <td className="px-4 py-3 text-slate-400">{p.reference || '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{new Date(p.createdAt).toLocaleDateString('es-VE')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <DynamicKeyModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthorized={executeCancel}
        permission={getCancelPermission()}
        entityType="Receipt"
        entityId={id}
        action={`Cancelar recibo ${receipt.number}`}
      />

      {/* Payment Modal */}
      {payModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">
                Procesar {receipt.number}
              </h3>
              <button onClick={() => setPayModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-700/50 rounded-lg p-3 space-y-1 font-mono text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Saldo neto:</span>
                  <span className="text-white font-bold">${fmt(Math.abs(receipt.totalUsd))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tasa:</span>
                  <span className="text-slate-300">{fmt(todayRate)} Bs/$</span>
                </div>
              </div>

              {paymentLines.map((line, idx) => (
                <div key={idx} className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Pago {idx + 1}</span>
                    {paymentLines.length > 1 && (
                      <button onClick={() => removePaymentLine(idx)} className="text-red-400 hover:text-red-300">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <select
                    value={line.methodId}
                    onChange={(e) => updatePaymentLine(idx, 'methodId', e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 text-slate-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Seleccionar metodo</option>
                    {flatMethods.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500">USD</label>
                      <input
                        type="number"
                        value={line.amountUsd}
                        onChange={(e) => updatePaymentLine(idx, 'amountUsd', Number(e.target.value))}
                        step="0.01"
                        className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500">Bs</label>
                      <input
                        type="number"
                        value={line.amountBs}
                        onChange={(e) => updatePaymentLine(idx, 'amountBs', Number(e.target.value))}
                        step="0.01"
                        className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono"
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    value={line.reference}
                    onChange={(e) => updatePaymentLine(idx, 'reference', e.target.value)}
                    placeholder="Referencia (opcional)"
                    className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              ))}

              <button
                onClick={addPaymentLine}
                className="w-full text-sm text-slate-400 hover:text-white py-2 border border-dashed border-slate-600 rounded-lg hover:border-slate-400 transition-colors"
              >
                + Agregar otro metodo de pago
              </button>

              <div className="bg-slate-700/50 rounded-lg p-3 font-mono text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Total pagos:</span>
                  <span className="text-white">${fmt(paymentLines.reduce((s, l) => s + l.amountUsd, 0))}</span>
                </div>
              </div>

              <button
                onClick={processReceipt}
                disabled={processing || paymentLines.every((l) => !l.methodId)}
                className={`w-full flex items-center justify-center gap-2 py-3 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 ${
                  isCollection ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600 hover:bg-blue-500'
                }`}
              >
                {processing ? <Loader2 className="animate-spin" size={18} /> : <CreditCard size={18} />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
