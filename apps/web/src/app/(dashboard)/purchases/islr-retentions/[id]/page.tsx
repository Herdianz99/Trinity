'use client';

import { useState, useEffect, useCallback } from 'react';
import { fmtRate } from '@/lib/format';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, FileText, Loader2, CheckCircle, Ban, Calendar, X,
  Printer, Edit3, Save, Plus, Trash2,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface IslrRetentionLine {
  id: string;
  purchaseOrderId: string | null;
  payableId: string | null;
  isExtraConcept: boolean;
  islrRetentionTypeId: string;
  islrRetentionType: {
    id: string;
    codigo: number;
    descripcion: string;
  };
  supplierInvoiceNumber: string | null;
  supplierControlNumber: string | null;
  invoiceDate: string | null;
  invoiceTotalUsd: number;
  invoiceTotalBs: number;
  taxableBaseUsd: number;
  taxableBaseBs: number;
  baseImponiblePct: number;
  retentionPct: number;
  sustraendoUt: number;
  sustraendoBs: number;
  retentionAmountUsd: number;
  retentionAmountBs: number;
  exchangeRate: number;
  isManual: boolean;
  purchaseOrder: {
    id: string;
    number: string;
    purchaseNumber: number;
    subtotalUsd: number;
    subtotalBs: number;
    totalUsd: number;
    totalBs: number;
    exchangeRate: number;
    supplierControlNumber: string | null;
    supplierInvoiceNumber: string | null;
  } | null;
  payable: { id: string; number: string; documentNumber: string | null } | null;
}

interface IslrType {
  id: string;
  codigo: number;
  descripcion: string;
  baseImponiblePct: number;
  retentionPct: number;
  sustraendoUt: number;
}

// Conceptos adicionales justo debajo de su factura (mismo orden que el PDF).
function orderLines(lines: IslrRetentionLine[]): IslrRetentionLine[] {
  const key = (l: IslrRetentionLine) => l.payableId || l.purchaseOrderId || l.id;
  const order = new Map<string, number>();
  lines.forEach(l => { if (!order.has(key(l))) order.set(key(l), order.size); });
  return [...lines].sort((a, b) =>
    (order.get(key(a))! - order.get(key(b))!) || (Number(a.isExtraConcept) - Number(b.isExtraConcept)));
}

function lineDocLabel(l: IslrRetentionLine): string {
  if (l.purchaseOrder) return l.purchaseOrder.number;
  if (l.payable) return `CxP ${l.payable.number}`;
  return l.supplierInvoiceNumber || 'Manual';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface IslrRetentionVoucher {
  id: string;
  number: string;
  status: 'PENDING' | 'ISSUED' | 'CANCELLED';
  issueDate: string | null;
  appliedAt: string | null;
  retentionAmountUsd: number;
  retentionAmountBs: number;
  exchangeRate: number;
  unidadTributaria: number;
  notes: string | null;
  supplier: { id: string; name: string; rif: string | null; supplierType: string | null };
  serie: { id: string; prefix: string; name: string } | null;
  lines: IslrRetentionLine[];
  createdBy: { id: string; name: string };
  createdAt: string;
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

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const STATUS_BADGES: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  ISSUED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  CANCELLED: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  ISSUED: 'Emitida',
  CANCELLED: 'Anulada',
};

const SUPPLIER_TYPE_LABELS: Record<string, string> = {
  JURIDICA: 'Persona Jurídica',
  NATURAL_RESIDENTE: 'P.N. Residente',
  NATURAL_NO_RESIDENTE: 'P.N. No Residente',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function IslrRetentionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [voucher, setVoucher] = useState<IslrRetentionVoucher | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Issue modal
  const [issueModal, setIssueModal] = useState(false);
  const [issueDate, setIssueDate] = useState(toLocalDateStr(new Date()));
  const [issuing, setIssuing] = useState(false);

  // Edit notes
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // Concepto adicional
  const [conceptModal, setConceptModal] = useState(false);
  const [islrTypes, setIslrTypes] = useState<IslrType[]>([]);
  const [conceptBaseLineId, setConceptBaseLineId] = useState('');
  const [conceptTypeId, setConceptTypeId] = useState('');
  const [conceptBaseBs, setConceptBaseBs] = useState('');
  const [savingConcept, setSavingConcept] = useState(false);
  const [removingLineId, setRemovingLineId] = useState<string | null>(null);

  useEffect(() => {
    if (voucher) {
      document.title = `Retención ISLR ${voucher.number} | Trinity ERP`;
    } else {
      document.title = 'Retención ISLR | Trinity ERP';
    }
  }, [voucher]);

  // ── Fetch ──────────────────────────────────────────────────────────────

  const fetchVoucher = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/proxy/islr-retention-vouchers/${id}`);
      if (!res.ok) throw new Error('Comprobante no encontrado');
      const data = await res.json();
      setVoucher(data);
      setNotesValue(data.notes || '');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchVoucher(); }, [fetchVoucher]);

  // Desde la lista ("Agregar concepto") se llega con ?concepto=1: abrir el modal una vez cargado.
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (!voucher || autoOpened) return;
    setAutoOpened(true);
    if (new URLSearchParams(window.location.search).get('concepto') !== '1') return;
    window.history.replaceState(null, '', window.location.pathname);
    const editable = voucher.status === 'PENDING' || (voucher.status === 'ISSUED' && !voucher.appliedAt);
    if (editable && voucher.lines.some(l => !l.isExtraConcept)) openConceptModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voucher, autoOpened]);

  // ── Handlers ──────────────────────────────────────────────────────────

  function openConceptModal() {
    if (!voucher) return;
    const firstDoc = voucher.lines.find(l => !l.isExtraConcept);
    setConceptBaseLineId(firstDoc?.id || '');
    setConceptTypeId('');
    setConceptBaseBs('');
    setConceptModal(true);
    if (islrTypes.length === 0) {
      fetch('/api/proxy/islr-retention-types?active=true')
        .then(r => r.json())
        .then(data => setIslrTypes(Array.isArray(data) ? data : []))
        .catch(() => setIslrTypes([]));
    }
  }

  async function handleAddConcept() {
    if (!voucher) return;
    setSavingConcept(true);
    try {
      const res = await fetch(`/api/proxy/islr-retention-vouchers/${id}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseLineId: conceptBaseLineId,
          islrRetentionTypeId: conceptTypeId,
          taxableBaseBs: Number(conceptBaseBs),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al agregar el concepto');
      }
      setConceptModal(false);
      fetchVoucher();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingConcept(false);
    }
  }

  async function handleRemoveConcept(lineId: string) {
    if (!confirm('¿Quitar este concepto del comprobante?')) return;
    setRemovingLineId(lineId);
    try {
      const res = await fetch(`/api/proxy/islr-retention-vouchers/${id}/lines/${lineId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al quitar el concepto');
      }
      fetchVoucher();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRemovingLineId(null);
    }
  }

  async function handleIssue() {
    if (!voucher || !issueDate) return;
    setIssuing(true);
    try {
      const res = await fetch(`/api/proxy/islr-retention-vouchers/${id}/issue`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueDate }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al emitir');
      }
      setIssueModal(false);
      fetchVoucher();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIssuing(false);
    }
  }

  async function handleCancel() {
    if (!voucher) return;
    if (!confirm('¿Anular este comprobante de retención ISLR?')) return;
    try {
      const res = await fetch(`/api/proxy/islr-retention-vouchers/${id}/cancel`, { method: 'PATCH' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al anular');
      }
      fetchVoucher();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleSaveNotes() {
    if (!voucher) return;
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/proxy/islr-retention-vouchers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesValue }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al guardar');
      }
      setEditingNotes(false);
      fetchVoucher();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingNotes(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-orange-400" size={32} />
      </div>
    );
  }

  if (error && !voucher) {
    return (
      <div className="p-6 space-y-4">
        <div className="px-4 py-3 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400">
          {error}
        </div>
        <button onClick={() => router.push('/purchases/islr-retentions')}
          className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm flex items-center gap-2">
          <ArrowLeft size={16} /> Volver
        </button>
      </div>
    );
  }

  if (!voucher) return null;

  // Conceptos editables: pendiente, o emitido aun no aplicado en un recibo de pago.
  const canEditConcepts = voucher.status === 'PENDING' || (voucher.status === 'ISSUED' && !voucher.appliedAt);
  const docLines = voucher.lines.filter(l => !l.isExtraConcept);
  const orderedLines = orderLines(voucher.lines);

  // Vista previa del concepto adicional: base x %base x %ret - sustraendo (solo P.N. residente)
  const previewType = islrTypes.find(t => t.id === conceptTypeId);
  const previewBase = Number(conceptBaseBs) || 0;
  const previewSust = previewType && previewType.sustraendoUt > 0 && voucher.supplier.supplierType === 'NATURAL_RESIDENTE'
    ? round2(previewType.sustraendoUt * voucher.unidadTributaria) : 0;
  const previewRet = previewType
    ? Math.max(0, round2(previewBase * (previewType.baseImponiblePct / 100) * (previewType.retentionPct / 100) - previewSust))
    : 0;

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/purchases/islr-retentions')}
            className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20">
            <FileText className="text-orange-400" size={24} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-orange-400 font-mono">{voucher.number}</h1>
              <span className={`inline-block px-2.5 py-1 rounded text-xs font-bold border ${STATUS_BADGES[voucher.status]}`}>
                {STATUS_LABELS[voucher.status]}
              </span>
            </div>
            <p className="text-sm text-slate-400">Comprobante de Retención ISLR</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button onClick={() => window.open(`/api/proxy/islr-retention-vouchers/${id}/pdf`, '_blank')}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-sm flex items-center gap-2 transition-colors border border-slate-600">
            <FileText size={16} /> PDF
          </button>
          {voucher.status === 'PENDING' && (
            <button onClick={() => { setIssueModal(true); setIssueDate(toLocalDateStr(new Date())); }}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center gap-2 transition-colors">
              <CheckCircle size={16} /> Emitir
            </button>
          )}
          {(voucher.status === 'PENDING' || voucher.status === 'ISSUED') && (
            <button onClick={handleCancel}
              className="px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 font-medium text-sm flex items-center gap-2 transition-colors">
              <Ban size={16} /> Anular
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300"><X size={16} /></button>
        </div>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Proveedor</p>
          <p className="text-sm font-medium text-slate-200">{voucher.supplier.name}</p>
          <p className="text-xs text-slate-500 font-mono">{voucher.supplier.rif || 'S/R'}</p>
          {voucher.supplier.supplierType && (
            <p className="text-xs text-orange-400 mt-1">{SUPPLIER_TYPE_LABELS[voucher.supplier.supplierType] || voucher.supplier.supplierType}</p>
          )}
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Unidad Tributaria</p>
          <p className="text-2xl font-bold text-slate-100">Bs {fmt(voucher.unidadTributaria)}</p>
        </div>
        <div className="bg-slate-800/50 border border-orange-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Total retenido USD</p>
          <p className="text-2xl font-bold text-orange-400 font-mono">${fmt(voucher.retentionAmountUsd)}</p>
        </div>
        <div className="bg-slate-800/50 border border-orange-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Total retenido Bs</p>
          <p className="text-2xl font-bold text-orange-400 font-mono">Bs {fmt(voucher.retentionAmountBs)}</p>
        </div>
      </div>

      {/* Meta info */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <p className="text-xs text-slate-500">Fecha emisión</p>
            <p className="text-slate-300">{fmtDate(voucher.issueDate)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Fecha creación</p>
            <p className="text-slate-300">{fmtDate(voucher.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Creado por</p>
            <p className="text-slate-300">{voucher.createdBy.name}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Tasa</p>
            <p className="text-slate-300 font-mono">{fmtRate(voucher.exchangeRate)}</p>
          </div>
          {voucher.serie && (
            <div>
              <p className="text-xs text-slate-500">Serie</p>
              <p className="text-slate-300">{voucher.serie.prefix} - {voucher.serie.name}</p>
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-slate-500 font-medium">Notas</p>
          {voucher.status === 'PENDING' && !editingNotes && (
            <button onClick={() => setEditingNotes(true)}
              className="text-xs text-slate-400 hover:text-slate-300 flex items-center gap-1">
              <Edit3 size={12} /> Editar
            </button>
          )}
        </div>
        {editingNotes ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={notesValue}
              onChange={e => setNotesValue(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
              placeholder="Observaciones..."
            />
            <button onClick={handleSaveNotes} disabled={savingNotes}
              className="px-3 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm disabled:opacity-50">
              {savingNotes ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
            </button>
            <button onClick={() => { setEditingNotes(false); setNotesValue(voucher.notes || ''); }}
              className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm">
              <X size={14} />
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-300">{voucher.notes || <span className="text-slate-600 italic">Sin notas</span>}</p>
        )}
      </div>

      {/* Lines table */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700/50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">
            Conceptos ({voucher.lines.length})
          </h2>
          {canEditConcepts && docLines.length > 0 && (
            <button onClick={openConceptModal}
              className="px-3 py-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 text-orange-300 text-xs font-medium flex items-center gap-1.5 transition-colors">
              <Plus size={14} /> Agregar concepto
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Factura</th>
                <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Nº Fact. Prov.</th>
                <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Nº Control</th>
                <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Fecha</th>
                <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Concepto</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Base imp. Bs</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Base imp. $</th>
                <th className="text-center px-3 py-2.5 text-slate-400 font-medium">% Base</th>
                <th className="text-center px-3 py-2.5 text-slate-400 font-medium">% Ret.</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Sust. Bs</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Ret. $</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Ret. Bs</th>
                {canEditConcepts && <th className="w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {orderedLines.map(line => line.isExtraConcept ? (
                <tr key={line.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                  <td colSpan={4} className="px-3 py-2.5 pl-8 text-xs text-slate-500 italic">
                    ↳ Concepto adicional (base manual)
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-orange-400 text-xs font-bold">{line.islrRetentionType.codigo}</span>
                    <span className="text-slate-400 text-xs ml-1.5 truncate max-w-[200px] inline-block align-bottom">{line.islrRetentionType.descripcion}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-300 font-mono">Bs {fmt(line.taxableBaseBs)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-300 font-mono">${fmt(line.taxableBaseUsd)}</td>
                  <td className="px-3 py-2.5 text-center text-slate-400">{line.baseImponiblePct}%</td>
                  <td className="px-3 py-2.5 text-center text-slate-400">{line.retentionPct}%</td>
                  <td className="px-3 py-2.5 text-right text-slate-400 font-mono">
                    {line.sustraendoBs > 0 ? `Bs ${fmt(line.sustraendoBs)}` : '--'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-orange-400 font-mono font-bold">${fmt(line.retentionAmountUsd)}</td>
                  <td className="px-3 py-2.5 text-right text-orange-400 font-mono font-bold">Bs {fmt(line.retentionAmountBs)}</td>
                  {canEditConcepts && (
                    <td className="px-2 py-2.5 text-center">
                      <button onClick={() => handleRemoveConcept(line.id)} disabled={removingLineId === line.id}
                        title="Quitar concepto"
                        className="p-1.5 rounded hover:bg-red-500/15 text-slate-500 hover:text-red-400 disabled:opacity-50">
                        {removingLineId === line.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                      </button>
                    </td>
                  )}
                </tr>
              ) : (
                <tr key={line.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                  <td className="px-3 py-2.5">
                    {line.purchaseOrder ? (
                      <a href={`/purchases/${line.purchaseOrder.id}`}
                        className="text-blue-400 hover:text-blue-300 font-mono text-xs">
                        {line.purchaseOrder.number}
                      </a>
                    ) : line.payable ? (
                      <span className="text-slate-300 font-mono text-xs">CxP {line.payable.number}</span>
                    ) : (
                      <span className="text-slate-500 text-xs">Manual</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300 font-mono text-xs">{line.supplierInvoiceNumber || '--'}</td>
                  <td className="px-3 py-2.5 text-slate-300 font-mono text-xs">{line.supplierControlNumber || '--'}</td>
                  <td className="px-3 py-2.5 text-slate-300 text-xs">{fmtDate(line.invoiceDate)}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-orange-400 text-xs font-bold">{line.islrRetentionType.codigo}</span>
                    <span className="text-slate-400 text-xs ml-1.5 truncate max-w-[200px] inline-block align-bottom">{line.islrRetentionType.descripcion}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-300 font-mono">Bs {fmt(line.taxableBaseBs)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-300 font-mono">${fmt(line.taxableBaseUsd)}</td>
                  <td className="px-3 py-2.5 text-center text-slate-400">{line.baseImponiblePct}%</td>
                  <td className="px-3 py-2.5 text-center text-slate-400">{line.retentionPct}%</td>
                  <td className="px-3 py-2.5 text-right text-slate-400 font-mono">
                    {line.sustraendoBs > 0 ? `Bs ${fmt(line.sustraendoBs)}` : '--'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-orange-400 font-mono font-bold">${fmt(line.retentionAmountUsd)}</td>
                  <td className="px-3 py-2.5 text-right text-orange-400 font-mono font-bold">Bs {fmt(line.retentionAmountBs)}</td>
                  {canEditConcepts && <td></td>}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-600/50 bg-slate-900/30">
                <td colSpan={5} className="px-3 py-2.5 text-right text-slate-400 font-medium">Totales:</td>
                <td className="px-3 py-2.5 text-right text-slate-300 font-mono font-bold">
                  Bs {fmt(voucher.lines.reduce((s, l) => s + l.taxableBaseBs, 0))}
                </td>
                <td className="px-3 py-2.5 text-right text-slate-300 font-mono font-bold">
                  ${fmt(voucher.lines.reduce((s, l) => s + l.taxableBaseUsd, 0))}
                </td>
                <td colSpan={2}></td>
                <td className="px-3 py-2.5 text-right text-slate-400 font-mono">
                  {voucher.lines.some(l => l.sustraendoBs > 0) ? `Bs ${fmt(voucher.lines.reduce((s, l) => s + l.sustraendoBs, 0))}` : ''}
                </td>
                <td className="px-3 py-2.5 text-right text-orange-400 font-mono font-bold">${fmt(voucher.retentionAmountUsd)}</td>
                <td className="px-3 py-2.5 text-right text-orange-400 font-mono font-bold">Bs {fmt(voucher.retentionAmountBs)}</td>
                {canEditConcepts && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Concepto adicional Modal */}
      {conceptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-100">Agregar concepto</h2>
              <button onClick={() => setConceptModal(false)} className="p-1 rounded hover:bg-slate-700 text-slate-400">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-400">
                Otro concepto ISLR sobre la misma factura. Escribe la base imponible en Bs y se calcula con el porcentaje del concepto; se suma al total del comprobante {voucher.number}.
              </p>

              {docLines.length > 1 && (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Factura *</label>
                  <select value={conceptBaseLineId} onChange={e => setConceptBaseLineId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
                    {docLines.map(l => (
                      <option key={l.id} value={l.id}>
                        {lineDocLabel(l)}{l.supplierInvoiceNumber ? ` · Fact. ${l.supplierInvoiceNumber}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Concepto *</label>
                <select value={conceptTypeId} onChange={e => setConceptTypeId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
                  <option value="">Seleccionar concepto...</option>
                  {islrTypes.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.codigo} - {t.descripcion} ({t.retentionPct}%)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Base imponible Bs *</label>
                <input type="number" step="0.01" min="0" value={conceptBaseBs}
                  onChange={e => setConceptBaseBs(e.target.value)}
                  placeholder="0,00"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono" />
              </div>

              {previewType && previewBase > 0 && (
                <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg px-3 py-2 text-xs space-y-1">
                  <div className="flex justify-between gap-3 text-slate-400">
                    <span>
                      Bs {fmt(previewBase)}
                      {previewType.baseImponiblePct !== 100 ? ` × ${previewType.baseImponiblePct}%` : ''}
                      {' '}× {previewType.retentionPct}%
                      {previewSust > 0 ? ` − sustraendo Bs ${fmt(previewSust)}` : ''}
                    </span>
                    <span className="font-mono text-orange-300 font-bold">Bs {fmt(previewRet)}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-slate-400">
                    <span>Nuevo total del comprobante</span>
                    <span className="font-mono text-slate-200">Bs {fmt(round2(voucher.retentionAmountBs + previewRet))}</span>
                  </div>
                </div>
              )}

              {voucher.status === 'ISSUED' && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2">
                  <p className="text-xs text-emerald-400">El comprobante ya está emitido: también se actualizará el monto retenido en el libro de compras.</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-700">
              <button onClick={() => setConceptModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm">
                Cancelar
              </button>
              <button onClick={handleAddConcept}
                disabled={savingConcept || !conceptBaseLineId || !conceptTypeId || !(previewBase > 0)}
                className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-medium text-sm flex items-center gap-2 disabled:opacity-50">
                {savingConcept ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Issue Modal */}
      {issueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-100">Emitir retención ISLR</h2>
              <button onClick={() => setIssueModal(false)} className="p-1 rounded hover:bg-slate-700 text-slate-400">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Nº Retención</p>
                  <p className="text-orange-400 font-mono font-bold">{voucher.number}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Proveedor</p>
                  <p className="text-slate-200">{voucher.supplier.name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Facturas</p>
                  <p className="text-slate-200">{voucher.lines.length}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Monto retención</p>
                  <p className="text-slate-200 font-mono">${fmt(voucher.retentionAmountUsd)} / Bs {fmt(voucher.retentionAmountBs)}</p>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Fecha de emisión *</label>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-2.5 text-slate-500" size={14} />
                  <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200" />
                </div>
              </div>

              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2">
                <p className="text-xs text-emerald-400">Al emitir se registrará en el libro de compras ({voucher.lines.length} línea{voucher.lines.length > 1 ? 's' : ''})</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-700">
              <button onClick={() => setIssueModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm">
                Cancelar
              </button>
              <button onClick={handleIssue} disabled={issuing || !issueDate}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center gap-2 disabled:opacity-50">
                {issuing ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                Confirmar emisión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
