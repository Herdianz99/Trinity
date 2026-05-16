'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, Loader2, Save, CreditCard, X, Search,
} from 'lucide-react';

interface PendingDoc {
  id: string;
  documentType: string;
  receivableId?: string;
  payableId?: string;
  description: string;
  date: string;
  amountUsd: number;
  amountBsHistoric: number;
  exchangeRate: number;
  balanceUsd: number;
  status: string;
}

interface SelectedDoc extends PendingDoc {
  sign: number;
  amountBsToday: number;
  selectedAmountUsd: number;
}

interface Customer {
  id: string;
  name: string;
  documentType: string | null;
  rif: string | null;
}

interface Supplier {
  id: string;
  name: string;
  rif: string | null;
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

export default function NewReceiptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = (searchParams.get('type') || 'COLLECTION') as 'COLLECTION' | 'PAYMENT';
  const isCollection = type === 'COLLECTION';

  // Entity selection (combobox)
  const [entityId, setEntityId] = useState('');
  const [entityName, setEntityName] = useState('');
  const [comboQuery, setComboQuery] = useState('');
  const [comboResults, setComboResults] = useState<(Customer | Supplier)[]>([]);
  const [comboOpen, setComboOpen] = useState(false);
  const [comboLoading, setComboLoading] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Documents
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<SelectedDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Exchange rate
  const [todayRate, setTodayRate] = useState<number>(0);
  const [rateLoading, setRateLoading] = useState(true);

  // Notes
  const [notes, setNotes] = useState('');

  // Saving
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Payment modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodData[]>([]);
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [processing, setProcessing] = useState(false);

  const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Fetch today's rate
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/proxy/exchange-rate/today');
        if (res.ok) {
          const data = await res.json();
          setTodayRate(data.rate || 0);
        }
      } catch { /* ignore */ }
      setRateLoading(false);
    })();
  }, []);

  // Debounced entity search
  useEffect(() => {
    if (comboQuery.length < 2) {
      setComboResults([]);
      setComboOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setComboLoading(true);
      try {
        if (isCollection) {
          const res = await fetch(`/api/proxy/customers?search=${encodeURIComponent(comboQuery)}&limit=15`);
          const json = await res.json();
          setComboResults(json.data || []);
        } else {
          const res = await fetch('/api/proxy/suppliers?limit=500');
          const json = await res.json();
          const list: Supplier[] = json.data || json || [];
          const q = comboQuery.toLowerCase();
          setComboResults(list.filter((s) =>
            s.name.toLowerCase().includes(q) || (s.rif && s.rif.toLowerCase().includes(q))
          ));
        }
        setComboOpen(true);
      } catch { /* ignore */ }
      setComboLoading(false);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [comboQuery, isCollection]);

  // Close combobox on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setComboOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch payment methods
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/proxy/payment-methods');
        const json = await res.json();
        setPaymentMethods(json || []);
      } catch { /* ignore */ }
    })();
  }, []);

  // Fetch pending documents when entity changes
  useEffect(() => {
    if (!entityId) {
      setPendingDocs([]);
      setSelectedDocs([]);
      return;
    }
    (async () => {
      setLoadingDocs(true);
      try {
        const res = await fetch(`/api/proxy/receipts/pending-documents?type=${type}&entityId=${entityId}`);
        const json = await res.json();
        setPendingDocs(json || []);
        setSelectedDocs([]);
      } catch { /* ignore */ }
      setLoadingDocs(false);
    })();
  }, [entityId, type]);

  // Move document to selected
  const addDoc = (doc: PendingDoc) => {
    const sign = doc.documentType === 'CxC' ? 1 : -1;
    const amountBsToday = Math.round(doc.balanceUsd * todayRate * 100) / 100;
    setSelectedDocs((prev) => [...prev, {
      ...doc,
      sign,
      amountBsToday,
      selectedAmountUsd: doc.balanceUsd,
    }]);
    setPendingDocs((prev) => prev.filter((d) => d.id !== doc.id));
  };

  // Move document back to pending
  const removeDoc = (doc: SelectedDoc) => {
    setSelectedDocs((prev) => prev.filter((d) => d.id !== doc.id));
    setPendingDocs((prev) => [...prev, doc]);
  };

  // Update selected amount
  const updateAmount = (docId: string, amount: number) => {
    setSelectedDocs((prev) => prev.map((d) => {
      if (d.id !== docId) return d;
      const clamped = Math.min(amount, d.balanceUsd);
      const proportion = d.amountUsd > 0 ? clamped / d.amountUsd : 0;
      return {
        ...d,
        selectedAmountUsd: clamped,
        amountBsToday: Math.round(clamped * todayRate * 100) / 100,
        amountBsHistoric: Math.round(d.amountBsHistoric * proportion * 100) / 100,
      };
    }));
  };

  // Calculate totals
  const totalUsd = selectedDocs.reduce((sum, d) => sum + d.selectedAmountUsd * d.sign, 0);
  const totalBsHistoric = selectedDocs.reduce((sum, d) => {
    const proportion = d.amountUsd > 0 ? d.selectedAmountUsd / d.amountUsd : 0;
    return sum + d.amountBsHistoric * proportion * d.sign;
  }, 0);
  const totalBsToday = selectedDocs.reduce((sum, d) => sum + d.amountBsToday * d.sign, 0);
  const differentialBs = Math.round((totalBsToday - totalBsHistoric) * 100) / 100;
  const hasDifferential = Math.abs(differentialBs) >= 0.01;

  // Save draft
  const saveDraft = async () => {
    if (selectedDocs.length === 0) return;
    setSaving(true);
    setMessage(null);
    try {
      const body = {
        type,
        customerId: isCollection ? entityId : undefined,
        supplierId: !isCollection ? entityId : undefined,
        itemIds: selectedDocs.map((d) => ({
          receivableId: d.receivableId,
          payableId: d.payableId,
          sign: d.sign,
          amountUsd: d.selectedAmountUsd,
        })),
        notes,
      };
      const res = await fetch('/api/proxy/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error al crear recibo');
      setMessage({ type: 'success', text: `Recibo ${json.number} creado en borrador` });
      setTimeout(() => router.push(`/receipts/${json.id}`), 1500);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
    setSaving(false);
  };

  // Open payment modal
  const openPayModal = async () => {
    if (selectedDocs.length === 0) return;
    setSaving(true);
    setMessage(null);
    try {
      // First save as draft
      const body = {
        type,
        customerId: isCollection ? entityId : undefined,
        supplierId: !isCollection ? entityId : undefined,
        itemIds: selectedDocs.map((d) => ({
          receivableId: d.receivableId,
          payableId: d.payableId,
          sign: d.sign,
          amountUsd: d.selectedAmountUsd,
        })),
        notes,
      };
      const res = await fetch('/api/proxy/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error al crear recibo');

      // Store draft ID for processing
      setDraftId(json.id);
      setDraftNumber(json.number);

      // Pre-fill payment with net amount
      const netAbsUsd = Math.abs(Math.round(totalUsd * 100) / 100);
      setPaymentLines([{
        methodId: '',
        methodName: '',
        isDivisa: false,
        amountUsd: netAbsUsd,
        amountBs: Math.round(netAbsUsd * todayRate * 100) / 100,
        reference: '',
      }]);
      setPayModalOpen(true);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
    setSaving(false);
  };

  const [draftId, setDraftId] = useState('');
  const [draftNumber, setDraftNumber] = useState('');

  // Process receipt
  const processReceipt = async () => {
    if (!draftId) return;
    const validLines = paymentLines.filter((l) => l.methodId && l.amountUsd > 0);
    if (validLines.length === 0) return;

    setProcessing(true);
    try {
      const res = await fetch(`/api/proxy/receipts/${draftId}/post`, {
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
      if (!res.ok) throw new Error(json.message || 'Error al procesar recibo');
      setPayModalOpen(false);
      setMessage({ type: 'success', text: `Recibo ${draftNumber} procesado exitosamente` });
      setTimeout(() => router.push(`/receipts/${draftId}`), 1500);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
    setProcessing(false);
  };

  // Payment line helpers
  const addPaymentLine = () => {
    setPaymentLines((prev) => [...prev, { methodId: '', methodName: '', isDivisa: false, amountUsd: 0, amountBs: 0, reference: '' }]);
  };

  const removePaymentLine = (index: number) => {
    setPaymentLines((prev) => prev.filter((_, i) => i !== index));
  };

  const updatePaymentLine = (index: number, field: string, value: any) => {
    setPaymentLines((prev) => prev.map((line, i) => {
      if (i !== index) return line;
      const updated = { ...line, [field]: value };
      if (field === 'methodId') {
        // Find method details
        const findMethod = (methods: PaymentMethodData[]): PaymentMethodData | undefined => {
          for (const m of methods) {
            if (m.id === value) return m;
            if (m.children) {
              const found = findMethod(m.children);
              if (found) return found;
            }
          }
        };
        const method = findMethod(paymentMethods);
        if (method) {
          updated.methodName = method.name;
          updated.isDivisa = method.isDivisa;
          if (method.isDivisa) {
            updated.amountBs = Math.round(updated.amountUsd * todayRate * 100) / 100;
          }
        }
      }
      if (field === 'amountUsd' && updated.isDivisa) {
        updated.amountBs = Math.round(Number(value) * todayRate * 100) / 100;
      }
      if (field === 'amountBs' && !updated.isDivisa) {
        updated.amountUsd = todayRate > 0 ? Math.round(Number(value) / todayRate * 100) / 100 : 0;
      }
      return updated;
    }));
  };

  const flatMethods = paymentMethods.flatMap((m) =>
    m.children && m.children.length > 0
      ? m.children.filter((c) => c.id)
      : [m]
  );

  // Select entity from combobox
  const selectEntity = (entity: Customer | Supplier) => {
    setEntityId(entity.id);
    setEntityName(entity.name);
    setComboQuery(entity.name);
    setComboOpen(false);
  };

  // Clear entity selection
  const clearEntity = () => {
    setEntityId('');
    setEntityName('');
    setComboQuery('');
    setComboResults([]);
    setPendingDocs([]);
    setSelectedDocs([]);
  };

  if (rateLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="animate-spin text-green-400" size={32} />
      </div>
    );
  }

  if (!todayRate) {
    return (
      <div className="text-center py-32 space-y-4">
        <p className="text-red-400 text-lg font-medium">No hay tasa de cambio registrada para hoy</p>
        <p className="text-slate-400">Registre la tasa antes de crear recibos</p>
        <button onClick={() => router.push('/config')} className="px-4 py-2 bg-slate-700 text-white rounded-lg">
          Ir a configuracion
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">
            Nuevo {isCollection ? 'Recibo de Cobro' : 'Recibo de Pago'}
          </h1>
          <p className="text-slate-400 mt-0.5">
            Tasa del dia: <span className="text-white font-mono">{fmt(todayRate)} Bs/$</span>
          </p>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg border ${message.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* Section 1: Entity selector (combobox) */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
          {isCollection ? 'Cliente' : 'Proveedor'}
        </h2>
        <div ref={comboRef} className="relative">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={entityId ? entityName : comboQuery}
              onChange={(e) => {
                if (entityId) {
                  clearEntity();
                  setComboQuery(e.target.value);
                } else {
                  setComboQuery(e.target.value);
                }
              }}
              onFocus={() => { if (comboResults.length > 0 && !entityId) setComboOpen(true); }}
              placeholder={`Buscar ${isCollection ? 'cliente' : 'proveedor'} por nombre o RIF...`}
              className={`w-full bg-slate-700 border text-white rounded-lg pl-9 pr-10 py-2.5 text-sm transition-colors ${
                entityId ? 'border-green-500/50 bg-green-500/5' : 'border-slate-600'
              }`}
              readOnly={!!entityId}
            />
            {entityId ? (
              <button
                onClick={clearEntity}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            ) : comboLoading ? (
              <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 animate-spin" />
            ) : null}
          </div>

          {/* Dropdown results */}
          {comboOpen && comboResults.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-60 overflow-y-auto">
              {comboResults.map((entity) => {
                const doc = 'documentType' in entity ? (entity as Customer).documentType : null;
                return (
                  <button
                    key={entity.id}
                    onClick={() => selectEntity(entity)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-700/60 transition-colors border-b border-slate-700/30 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{entity.name}</p>
                      <p className="text-xs text-slate-400">
                        {doc ? `${doc} ` : ''}{entity.rif || ''}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {comboOpen && comboQuery.length >= 2 && comboResults.length === 0 && !comboLoading && (
            <div className="absolute z-20 mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-xl px-3 py-4 text-center text-sm text-slate-500">
              No se encontraron resultados
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Document selection */}
      {entityId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Pending documents */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50">
              <h3 className="text-sm font-semibold text-slate-300">Documentos pendientes</h3>
              <p className="text-xs text-slate-500">{pendingDocs.length} disponible{pendingDocs.length !== 1 ? 's' : ''}</p>
            </div>
            {loadingDocs ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-slate-400" size={24} />
              </div>
            ) : pendingDocs.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                No hay documentos pendientes
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-800">
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left px-3 py-2 text-slate-500">Tipo</th>
                      <th className="text-left px-3 py-2 text-slate-500">Documento</th>
                      <th className="text-right px-3 py-2 text-slate-500">USD</th>
                      <th className="text-right px-3 py-2 text-slate-500">Bs hist.</th>
                      <th className="text-right px-3 py-2 text-slate-500">Saldo</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingDocs.map((doc) => (
                      <tr
                        key={doc.id}
                        className={`border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors ${
                          doc.documentType === 'CxC' ? 'bg-green-500/5' : 'bg-red-500/5'
                        }`}
                      >
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            doc.documentType === 'CxC'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {doc.documentType}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-300 font-mono">{doc.description}</td>
                        <td className="px-3 py-2 text-right text-white font-mono">${fmt(doc.amountUsd)}</td>
                        <td className="px-3 py-2 text-right text-slate-400 font-mono">{fmt(doc.amountBsHistoric)}</td>
                        <td className="px-3 py-2 text-right text-amber-400 font-mono">${fmt(doc.balanceUsd)}</td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => addDoc(doc)}
                            className="p-1 hover:bg-green-500/20 rounded text-green-400 hover:text-green-300 transition-colors"
                          >
                            <ArrowRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right: Selected documents */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50">
              <h3 className="text-sm font-semibold text-slate-300">Documentos a cancelar</h3>
              <p className="text-xs text-slate-500">{selectedDocs.length} seleccionado{selectedDocs.length !== 1 ? 's' : ''}</p>
            </div>
            {selectedDocs.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                Seleccione documentos de la lista izquierda
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-800">
                    <tr className="border-b border-slate-700/50">
                      <th className="px-3 py-2"></th>
                      <th className="text-left px-3 py-2 text-slate-500">Documento</th>
                      <th className="text-right px-3 py-2 text-slate-500">Monto USD</th>
                      <th className="text-right px-3 py-2 text-slate-500">Bs hist.</th>
                      <th className="text-right px-3 py-2 text-slate-500">Bs hoy</th>
                      <th className="text-center px-3 py-2 text-slate-500">Signo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDocs.map((doc) => (
                      <tr
                        key={doc.id}
                        className={`border-b border-slate-700/20 ${
                          doc.sign === 1 ? 'bg-green-500/5' : 'bg-red-500/5'
                        }`}
                      >
                        <td className="px-3 py-2">
                          <button
                            onClick={() => removeDoc(doc)}
                            className="p-1 hover:bg-red-500/20 rounded text-red-400 hover:text-red-300 transition-colors"
                          >
                            <ArrowLeft size={14} />
                          </button>
                        </td>
                        <td className="px-3 py-2 text-slate-300 font-mono">{doc.description}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={doc.selectedAmountUsd}
                            onChange={(e) => updateAmount(doc.id, Number(e.target.value))}
                            step="0.01"
                            min="0.01"
                            max={doc.balanceUsd}
                            className="w-20 bg-slate-700 border border-slate-600 text-white text-right rounded px-1.5 py-0.5 text-xs font-mono"
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-slate-400 font-mono">
                          {fmt(doc.amountBsHistoric * (doc.selectedAmountUsd / doc.amountUsd || 0))}
                        </td>
                        <td className="px-3 py-2 text-right text-white font-mono">{fmt(doc.amountBsToday)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-xs font-bold ${doc.sign === 1 ? 'text-green-400' : 'text-red-400'}`}>
                            {doc.sign === 1 ? '+' : '-'}
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
      )}

      {/* Section 3: Summary */}
      {selectedDocs.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Resumen</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Totals */}
            <div className="space-y-3 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Total USD:</span>
                <span className="text-white font-medium">${fmt(Math.abs(totalUsd))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Bs historico:</span>
                <span className="text-slate-300">{fmt(Math.abs(totalBsHistoric))} Bs</span>
              </div>
              <div className="border-t border-slate-700/50 pt-3 flex justify-between">
                <span className="text-slate-400">Tasa del dia:</span>
                <span className="text-white">{fmt(todayRate)} Bs/$</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Bs a tasa hoy:</span>
                <span className="text-white">{fmt(Math.abs(totalBsToday))} Bs</span>
              </div>
              {hasDifferential && (
                <div className={`flex justify-between px-3 py-2 rounded-lg ${
                  differentialBs > 0 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-green-500/10 border border-green-500/20'
                }`}>
                  <span className={differentialBs > 0 ? 'text-amber-400' : 'text-green-400'}>
                    Diferencial cambiario:
                  </span>
                  <span className={`font-medium ${differentialBs > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                    {differentialBs > 0 ? '+' : ''}{fmt(differentialBs)} Bs
                  </span>
                </div>
              )}
              <div className="border-t border-slate-700/50 pt-3 flex justify-between text-base">
                <span className="text-white font-semibold">SALDO NETO:</span>
                <span className="text-white font-bold">${fmt(Math.abs(totalUsd))}</span>
              </div>
            </div>

            {/* Right: Action indicator */}
            <div className="flex flex-col items-center justify-center">
              <div className={`px-6 py-4 rounded-xl border-2 text-center ${
                totalUsd >= 0
                  ? 'border-green-500/40 bg-green-500/10'
                  : 'border-red-500/40 bg-red-500/10'
              }`}>
                <p className={`text-lg font-bold ${totalUsd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {isCollection
                    ? (totalUsd >= 0 ? 'SE COBRA AL CLIENTE' : 'SE DEVUELVE AL CLIENTE')
                    : (totalUsd >= 0 ? 'SE PAGA AL PROVEEDOR' : 'EL PROVEEDOR DEBE')
                  }
                </p>
                <p className="text-2xl font-bold text-white mt-1 font-mono">
                  ${fmt(Math.abs(totalUsd))}
                </p>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-slate-500">Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full mt-1 bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              placeholder="Notas opcionales..."
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={saveDraft}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Guardar borrador
            </button>
            <button
              onClick={openPayModal}
              disabled={saving}
              className={`flex items-center gap-2 px-5 py-2.5 text-white rounded-lg font-medium transition-colors disabled:opacity-50 ${
                isCollection
                  ? 'bg-green-600 hover:bg-green-500'
                  : 'bg-blue-600 hover:bg-blue-500'
              }`}
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <CreditCard size={16} />}
              Procesar recibo
            </button>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {payModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">
                {isCollection ? 'Cobrar recibo' : 'Pagar recibo'} {draftNumber}
              </h3>
              <button onClick={() => setPayModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Summary in modal */}
              <div className="bg-slate-700/50 rounded-lg p-3 space-y-1 font-mono text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Saldo neto:</span>
                  <span className="text-white font-bold">${fmt(Math.abs(totalUsd))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tasa:</span>
                  <span className="text-slate-300">{fmt(todayRate)} Bs/$</span>
                </div>
              </div>

              {/* Payment lines */}
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

              {/* Total payments */}
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
