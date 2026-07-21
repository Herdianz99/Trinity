'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield, Loader2, Search, AlertTriangle, Ban, X, Plus, FileCheck,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface CustomerRetention {
  id: string;
  number: string;
  retentionPct: number;
  retentionUsd: number;
  retentionBs: number;
  ivaAmountBs: number;
  exchangeRate: number;
  voucherNumber: string | null;
  voucherDate: string | null;
  voucherReceivedAt: string | null;
  appliedAt: string | null;
  cancelledAt: string | null;
  salesBookEntryId: string | null;
  salesBookEntry: { entryDate: string } | null;
  notes: string | null;
  // Origen: una factura fiscal (reintegro) O una cuenta por cobrar fiscal (CxC)
  invoice: { id: string; number: string | null; controlNumber: string | null; totalBs: number } | null;
  receivable: { id: string; number: string | null; documentNumber: string | null; amountBs: number } | null;
  customer: { id: string; name: string; rif: string | null; documentType: string | null };
  createdBy: { id: string; name: string };
  createdAt: string;
}

// Numero del documento de origen (factura o CxC) para mostrar en la tabla y modales
function sourceDoc(r: { invoice: { number: string | null } | null; receivable: { number: string | null; documentNumber: string | null } | null }): string {
  return r.invoice?.number || r.receivable?.number || r.receivable?.documentNumber || '--';
}

interface InvoiceResult {
  id: string;
  number: string | null;
  ivaBs: number;
  totalBs: number;
  exchangeRate: number;
  customer: { id: string; name: string; rif: string | null } | null;
  serie: { isFiscal: boolean } | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

// Fecha del asiento del libro: se guarda a medianoche UTC (fecha-documento elegida por el
// usuario), asi que se muestra en UTC para que coincida exactamente con el Libro de Ventas.
function fmtDateUtc(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  return `${d.getUTCDate().toString().padStart(2, '0')}/${(d.getUTCMonth() + 1).toString().padStart(2, '0')}/${d.getUTCFullYear()}`;
}

// Fecha a mostrar para una retencion: la del asiento del libro si existe (coincide con el
// Libro de Ventas), si no la de creacion.
function displayDate(r: { salesBookEntry: { entryDate: string } | null; createdAt: string }): string {
  return r.salesBookEntry?.entryDate ? fmtDateUtc(r.salesBookEntry.entryDate) : fmtDate(r.createdAt);
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type StatusKey = 'pending' | 'applied-no-voucher' | 'voucher-received' | 'cancelled';

function statusOf(r: CustomerRetention): StatusKey {
  if (r.cancelledAt) return 'cancelled';
  if (r.voucherNumber) return 'voucher-received';
  if (r.appliedAt) return 'applied-no-voucher';
  return 'pending';
}

const STATUS_BADGES: Record<StatusKey, string> = {
  'pending': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'applied-no-voucher': 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  'voucher-received': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'cancelled': 'bg-red-500/15 text-red-400 border-red-500/30',
};

const STATUS_LABELS: Record<StatusKey, string> = {
  'pending': 'Pendiente comprobante',
  'applied-no-voucher': 'Cobrada — exigir comprobante',
  'voucher-received': 'Con comprobante',
  'cancelled': 'Anulada',
};

const TABS = [
  { key: 'pending-voucher', label: 'Pendientes de comprobante' },
  { key: 'voucher-received', label: 'Con comprobante' },
  { key: 'cancelled', label: 'Anuladas' },
  { key: '', label: 'Todas' },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function CustomerRetentionsPage() {
  const now = new Date();

  // Filters
  const [tab, setTab] = useState('pending-voucher');
  const [search, setSearch] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Data
  const [retentions, setRetentions] = useState<CustomerRetention[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Voucher modal
  const [voucherModal, setVoucherModal] = useState<CustomerRetention | null>(null);
  const [voucherNumber, setVoucherNumber] = useState('');
  const [voucherDate, setVoucherDate] = useState(toLocalDateStr(now));
  const [voucherAmountBs, setVoucherAmountBs] = useState('');
  const [savingVoucher, setSavingVoucher] = useState(false);

  // Cancel modal
  const [cancelModal, setCancelModal] = useState<CustomerRetention | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // New retention modal (reintegro)
  const [newModal, setNewModal] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceResults, setInvoiceResults] = useState<InvoiceResult[]>([]);
  const [searchingInvoices, setSearchingInvoices] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceResult | null>(null);
  const [takenInvoiceIds, setTakenInvoiceIds] = useState<Set<string>>(new Set());
  const [newPct, setNewPct] = useState('75');
  const [newAmountBs, setNewAmountBs] = useState('');
  const [newVoucherNumber, setNewVoucherNumber] = useState('');
  const [newVoucherDate, setNewVoucherDate] = useState(toLocalDateStr(now));
  const [creating, setCreating] = useState(false);

  useEffect(() => { document.title = 'Retenciones de Clientes | Trinity ERP'; }, []);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchRetentions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab) params.set('status', tab);
      if (search) params.set('search', search);
      const res = await fetch(`/api/proxy/customer-iva-retentions?${params}`);
      const data = await res.json();
      setRetentions(Array.isArray(data) ? data : []);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar retenciones' });
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => { fetchRetentions(); }, search ? 300 : 0);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [fetchRetentions, search]);

  // Invoice search for new retention modal
  useEffect(() => {
    if (!newModal || !invoiceSearch.trim()) { setInvoiceResults([]); return; }
    const t = setTimeout(async () => {
      setSearchingInvoices(true);
      try {
        const res = await fetch(`/api/proxy/invoices?search=${encodeURIComponent(invoiceSearch)}&limit=8&status=PAID`);
        const data = await res.json();
        setInvoiceResults((data.data || []).filter((inv: InvoiceResult) =>
          inv.serie?.isFiscal && (inv.ivaBs || 0) > 0 && !takenInvoiceIds.has(inv.id),
        ));
      } catch { /* ignore */ }
      setSearchingInvoices(false);
    }, 300);
    return () => clearTimeout(t);
  }, [newModal, invoiceSearch, takenInvoiceIds]);

  const pendingCount = tab === 'pending-voucher' ? retentions.length : retentions.filter(r => !r.voucherNumber && !r.cancelledAt).length;

  // ── Actions ────────────────────────────────────────────────────────────────

  const openVoucherModal = (r: CustomerRetention) => {
    setVoucherModal(r);
    setVoucherNumber('');
    setVoucherDate(toLocalDateStr(new Date()));
    setVoucherAmountBs(r.retentionBs.toFixed(2));
  };

  const submitVoucher = async () => {
    if (!voucherModal) return;
    if (!/^\d{14}$/.test(voucherNumber)) {
      setMessage({ type: 'error', text: 'El número de comprobante debe tener 14 dígitos (AAAAMM + 8 dígitos)' });
      return;
    }
    setSavingVoucher(true);
    setMessage(null);
    try {
      const body: any = { voucherNumber, voucherDate };
      const amount = parseFloat(voucherAmountBs);
      if (!isNaN(amount) && Math.abs(amount - voucherModal.retentionBs) > 0.001) body.retentionBs = amount;
      const res = await fetch(`/api/proxy/customer-iva-retentions/${voucherModal.id}/voucher`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error al registrar comprobante');
      setMessage({ type: 'success', text: `Comprobante registrado para ${voucherModal.number} — línea creada en libro de ventas` });
      setVoucherModal(null);
      fetchRetentions();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
    setSavingVoucher(false);
  };

  const submitCancel = async () => {
    if (!cancelModal) return;
    setCancelling(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/customer-iva-retentions/${cancelModal.id}/cancel`, { method: 'PATCH' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error al anular');
      setMessage({ type: 'success', text: `Retención ${cancelModal.number} anulada` });
      setCancelModal(null);
      fetchRetentions();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
    setCancelling(false);
  };

  const openNewModal = async () => {
    setNewModal(true);
    setInvoiceSearch('');
    setInvoiceResults([]);
    setSelectedInvoice(null);
    setNewPct('75');
    setNewAmountBs('');
    setNewVoucherNumber('');
    setNewVoucherDate(toLocalDateStr(new Date()));
    // Cargar facturas que ya tienen una retención activa para excluirlas del buscador
    try {
      const res = await fetch('/api/proxy/customer-iva-retentions');
      const data = await res.json();
      const ids = new Set<string>(
        (Array.isArray(data) ? data : [])
          .filter((r: CustomerRetention) => !r.cancelledAt && r.invoice?.id)
          .map((r: CustomerRetention) => r.invoice!.id),
      );
      setTakenInvoiceIds(ids);
    } catch { /* ignore */ }
  };

  const selectInvoice = (inv: InvoiceResult) => {
    setSelectedInvoice(inv);
    setInvoiceResults([]);
    setInvoiceSearch('');
    const pct = parseFloat(newPct) || 75;
    setNewAmountBs((Math.round(inv.ivaBs * (pct / 100) * 100) / 100).toFixed(2));
  };

  const onPctChange = (value: string) => {
    setNewPct(value);
    if (selectedInvoice) {
      const pct = parseFloat(value) || 0;
      setNewAmountBs((Math.round(selectedInvoice.ivaBs * (pct / 100) * 100) / 100).toFixed(2));
    }
  };

  const submitNew = async () => {
    if (!selectedInvoice) return;
    if (newVoucherNumber && !/^\d{14}$/.test(newVoucherNumber)) {
      setMessage({ type: 'error', text: 'El número de comprobante debe tener 14 dígitos' });
      return;
    }
    setCreating(true);
    setMessage(null);
    try {
      const body: any = {
        invoiceId: selectedInvoice.id,
        retentionPct: parseFloat(newPct) || 75,
      };
      const amount = parseFloat(newAmountBs);
      if (!isNaN(amount)) body.retentionBs = amount;
      if (newVoucherNumber) {
        body.voucherNumber = newVoucherNumber;
        body.voucherDate = newVoucherDate;
      }
      const res = await fetch('/api/proxy/customer-iva-retentions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Error al crear retención');
      setMessage({ type: 'success', text: `Retención ${json.number} creada${newVoucherNumber ? ' con comprobante — haz el recibo de cobro para registrar el reintegro' : ''}` });
      setNewModal(false);
      fetchRetentions();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
    setCreating(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/15 text-purple-400">
            <Shield size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Retenciones de clientes</h1>
            <p className="text-xs text-slate-500">Retenciones de IVA que los clientes (contribuyentes especiales) aplican a nuestras facturas</p>
          </div>
        </div>
        <button
          onClick={openNewModal}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Nueva retención (reintegro)
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm flex items-center justify-between ${
          message.type === 'success'
            ? 'bg-green-500/10 border border-green-500/30 text-green-400'
            : 'bg-red-500/10 border border-red-500/30 text-red-400'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)}><X size={14} /></button>
        </div>
      )}

      {/* Pending alert */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle size={18} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-300">
            <span className="font-semibold">{pendingCount} retención{pendingCount !== 1 ? 'es' : ''} sin comprobante</span>
            {' '}— el cliente debe entregar el comprobante de retención. Exígelo si han pasado más de 7 días.
          </p>
        </div>
      )}

      {/* Tabs + search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 bg-slate-800/60 border border-slate-700/50 rounded-lg p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === t.key ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número, factura, cliente..."
            className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg pl-9 pr-3 py-2 w-72"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-slate-500" size={24} />
          </div>
        ) : retentions.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">No hay retenciones en este filtro</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-800">
                <tr className="border-b border-slate-700/50 text-slate-500">
                  <th className="text-left px-3 py-2.5">Número</th>
                  <th className="text-left px-3 py-2.5">Fecha</th>
                  <th className="text-left px-3 py-2.5">Cliente</th>
                  <th className="text-left px-3 py-2.5">Factura / CxC</th>
                  <th className="text-right px-3 py-2.5">%</th>
                  <th className="text-right px-3 py-2.5">Retenido Bs</th>
                  <th className="text-left px-3 py-2.5">Comprobante</th>
                  <th className="text-left px-3 py-2.5">Estado</th>
                  <th className="text-right px-3 py-2.5">Días</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {retentions.map((r) => {
                  const st = statusOf(r);
                  const days = daysSince(r.createdAt);
                  const overdue = !r.voucherNumber && !r.cancelledAt && days > 7;
                  return (
                    <tr key={r.id} className={`border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors ${
                      st === 'cancelled' ? 'opacity-50' : ''
                    }`}>
                      <td className="px-3 py-2.5 font-mono text-purple-300">{r.number}</td>
                      <td className="px-3 py-2.5 text-slate-400">{displayDate(r)}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-white">{r.customer?.name}</span>
                        {r.customer?.rif && (
                          <span className="block text-[10px] text-slate-500">
                            {r.customer.documentType ? `${r.customer.documentType}-` : ''}{r.customer.rif}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-300">
                        {sourceDoc(r)}
                        {r.receivable && !r.invoice && (
                          <span className="ml-1.5 px-1 py-0.5 bg-blue-500/15 text-blue-400 text-[9px] rounded font-sans font-semibold align-middle">CxC</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-300">{r.retentionPct}%</td>
                      <td className="px-3 py-2.5 text-right font-mono text-white">{fmt(r.retentionBs)}</td>
                      <td className="px-3 py-2.5">
                        {r.voucherNumber ? (
                          <>
                            <span className="font-mono text-emerald-400">{r.voucherNumber}</span>
                            <span className="block text-[10px] text-slate-500">{fmtDate(r.voucherDate)}</span>
                          </>
                        ) : (
                          <span className="text-slate-600">--</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_BADGES[st]}`}>
                          {STATUS_LABELS[st]}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono ${overdue ? 'text-red-400 font-bold' : 'text-slate-400'}`}>
                        {st === 'voucher-received' || st === 'cancelled' ? '--' : days}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {!r.voucherNumber && !r.cancelledAt && (
                            <button
                              onClick={() => openVoucherModal(r)}
                              title="Registrar comprobante"
                              className="p-1.5 rounded hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                            >
                              <FileCheck size={14} />
                            </button>
                          )}
                          {!r.cancelledAt && !r.appliedAt && (
                            <button
                              onClick={() => setCancelModal(r)}
                              title="Anular retención"
                              className="p-1.5 rounded hover:bg-red-500/20 text-red-400 transition-colors"
                            >
                              <Ban size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Voucher modal */}
      {voucherModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">Registrar comprobante — {voucherModal.number}</h3>
              <button onClick={() => setVoucherModal(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-700/40 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-slate-400">Cliente:</span><span className="text-white">{voucherModal.customer?.name}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Factura/CxC:</span><span className="text-white font-mono">{sourceDoc(voucherModal)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Cálculo teórico ({voucherModal.retentionPct}% IVA):</span><span className="text-white font-mono">{fmt(Math.round(voucherModal.ivaAmountBs * (voucherModal.retentionPct / 100) * 100) / 100)} Bs</span></div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Número de comprobante (14 dígitos)</label>
                <input
                  type="text"
                  value={voucherNumber}
                  onChange={(e) => setVoucherNumber(e.target.value.replace(/\D/g, '').slice(0, 14))}
                  placeholder="AAAAMM00000000"
                  maxLength={14}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono"
                />
                {voucherNumber && voucherNumber.length !== 14 && (
                  <p className="text-[10px] text-amber-400 mt-1">{voucherNumber.length}/14 dígitos</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Fecha del comprobante</label>
                  <input
                    type="date"
                    value={voucherDate}
                    onChange={(e) => setVoucherDate(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Monto retenido Bs</label>
                  <input
                    type="number"
                    step="0.01"
                    value={voucherAmountBs}
                    onChange={(e) => setVoucherAmountBs(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Tolerancia ±1 Bs vs cálculo teórico</p>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Al registrar el comprobante se crea la línea de retención en el libro de ventas (período de la fecha del comprobante).
              </p>
              <button
                onClick={submitVoucher}
                disabled={savingVoucher || voucherNumber.length !== 14}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {savingVoucher ? <Loader2 className="animate-spin" size={16} /> : <FileCheck size={16} />}
                Registrar comprobante
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel modal */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm mx-4">
            <div className="p-5 space-y-4">
              <h3 className="text-lg font-semibold text-white">¿Anular retención {cancelModal.number}?</h3>
              <p className="text-sm text-slate-400">
                El monto retenido (Bs {fmt(cancelModal.retentionBs)}) dejará de descontarse del cobro de {cancelModal.invoice ? 'la factura' : 'la CxC'} {sourceDoc(cancelModal)}.
                {cancelModal.salesBookEntryId ? ' También se eliminará la línea del libro de ventas.' : ''}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setCancelModal(null)}
                  className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Volver
                </button>
                <button
                  onClick={submitCancel}
                  disabled={cancelling}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {cancelling ? <Loader2 className="animate-spin" size={16} /> : <Ban size={16} />}
                  Anular
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New retention modal */}
      {newModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-xl mx-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">Nueva retención de cliente</h3>
              <button onClick={() => setNewModal(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-5 min-h-[460px]">
              <p className="text-xs text-slate-500">
                Para el caso de reintegro: el cliente pagó la factura completa y luego trajo el comprobante de retención.
                Si registras el comprobante aquí, la línea del libro de ventas se crea de inmediato; luego haz el
                <span className="text-slate-300"> recibo de cobro</span> cruzando solo esta retención para registrar la salida del dinero.
              </p>

              {/* Invoice search */}
              {!selectedInvoice ? (
                <div className="relative">
                  <label className="text-xs text-slate-400 mb-1 block">Buscar factura (número, cliente o RIF)</label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={invoiceSearch}
                      onChange={(e) => setInvoiceSearch(e.target.value)}
                      placeholder="FAC-000123..."
                      className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg pl-9 pr-3 py-2 text-sm font-mono"
                      autoFocus
                    />
                    {searchingInvoices && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-500" />}
                  </div>
                  {invoiceResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-slate-700 border border-slate-600 rounded-lg shadow-xl max-h-56 overflow-y-auto">
                      {invoiceResults.map((inv) => (
                        <button
                          key={inv.id}
                          onClick={() => selectInvoice(inv)}
                          className="w-full text-left px-3 py-2 hover:bg-slate-600 transition-colors border-b border-slate-600/50 last:border-0"
                        >
                          <span className="text-sm text-white font-mono">{inv.number}</span>
                          <span className="block text-[10px] text-slate-400">
                            {inv.customer?.name || 'Sin cliente'} — IVA: {fmt(inv.ivaBs)} Bs
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {invoiceSearch && !searchingInvoices && invoiceResults.length === 0 && (
                    <p className="text-[10px] text-slate-500 mt-1">Solo se listan facturas pagadas de serie fiscal con IVA &gt; 0</p>
                  )}
                </div>
              ) : (
                <div className="bg-slate-700/40 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-mono">{selectedInvoice.number}</span>
                    <button onClick={() => setSelectedInvoice(null)} className="text-xs text-red-400">Cambiar</button>
                  </div>
                  <div className="flex justify-between"><span className="text-slate-400">Cliente:</span><span className="text-white">{selectedInvoice.customer?.name || 'Sin cliente'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Total Bs:</span><span className="text-white font-mono">{fmt(selectedInvoice.totalBs)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">IVA Bs:</span><span className="text-white font-mono">{fmt(selectedInvoice.ivaBs)}</span></div>
                </div>
              )}

              {selectedInvoice && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">% Retención</label>
                      <select
                        value={newPct}
                        onChange={(e) => onPctChange(e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="75">75%</option>
                        <option value="100">100%</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Monto retenido Bs</label>
                      <input
                        type="number"
                        step="0.01"
                        value={newAmountBs}
                        onChange={(e) => setNewAmountBs(e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">Tolerancia ±1 Bs vs cálculo teórico</p>
                    </div>
                  </div>
                  <div className="border-t border-slate-700/50 pt-4 space-y-3">
                    <p className="text-xs text-slate-400">Comprobante del cliente (opcional — si ya lo entregó)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-400 mb-1 block">Número (14 dígitos)</label>
                        <input
                          type="text"
                          value={newVoucherNumber}
                          onChange={(e) => setNewVoucherNumber(e.target.value.replace(/\D/g, '').slice(0, 14))}
                          placeholder="AAAAMM00000000"
                          maxLength={14}
                          className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 mb-1 block">Fecha</label>
                        <input
                          type="date"
                          value={newVoucherDate}
                          onChange={(e) => setNewVoucherDate(e.target.value)}
                          className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={submitNew}
                    disabled={creating || !newAmountBs || (newVoucherNumber.length > 0 && newVoucherNumber.length !== 14)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {creating ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                    Crear retención
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
