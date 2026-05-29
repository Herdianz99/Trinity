'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Shield, Loader2, CheckCircle, Ban, Calendar, X,
  FileText, Printer, Edit3, Save,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface RetentionVoucherLine {
  id: string;
  purchaseOrderId: string;
  supplierInvoiceNumber: string | null;
  supplierControlNumber: string | null;
  invoiceDate: string | null;
  invoiceTotalUsd: number;
  invoiceTotalBs: number;
  taxableBaseUsd: number;
  taxableBaseBs: number;
  ivaAmountUsd: number;
  ivaAmountBs: number;
  retentionPct: number;
  retentionAmountUsd: number;
  retentionAmountBs: number;
  exchangeRate: number;
  isManual: boolean;
  purchaseOrder: {
    id: string;
    number: string;
    purchaseNumber: number;
    invoiceDate: string | null;
    totalIvaUsd: number;
    totalIvaBs: number;
    totalUsd: number;
    totalBs: number;
    exchangeRate: number;
    supplierControlNumber: string | null;
    supplierInvoiceNumber: string | null;
  };
}

interface RetentionVoucher {
  id: string;
  number: string;
  status: 'PENDING' | 'ISSUED' | 'CANCELLED';
  issueDate: string | null;
  retentionPct: number;
  retentionAmountUsd: number;
  retentionAmountBs: number;
  exchangeRate: number;
  notes: string | null;
  supplier: { id: string; name: string; rif: string | null };
  serie: { id: string; prefix: string; name: string } | null;
  lines: RetentionVoucherLine[];
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

// ── Component ────────────────────────────────────────────────────────────────

export default function RetentionVoucherDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [voucher, setVoucher] = useState<RetentionVoucher | null>(null);
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

  useEffect(() => {
    if (voucher) {
      document.title = `Retención ${voucher.number} | Trinity ERP`;
    } else {
      document.title = 'Retención IVA | Trinity ERP';
    }
  }, [voucher]);

  // ── Fetch ──────────────────────────────────────────────────────────────

  const fetchVoucher = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/proxy/retention-vouchers/${id}`);
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

  // ── Handlers ──────────────────────────────────────────────────────────

  async function handleIssue() {
    if (!voucher || !issueDate) return;
    setIssuing(true);
    try {
      const res = await fetch(`/api/proxy/retention-vouchers/${id}/issue`, {
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
    if (!confirm('¿Anular este comprobante de retención?')) return;
    try {
      const res = await fetch(`/api/proxy/retention-vouchers/${id}/cancel`, { method: 'PATCH' });
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
      const res = await fetch(`/api/proxy/retention-vouchers/${id}`, {
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
        <Loader2 className="animate-spin text-purple-400" size={32} />
      </div>
    );
  }

  if (error && !voucher) {
    return (
      <div className="p-6 space-y-4">
        <div className="px-4 py-3 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400">
          {error}
        </div>
        <button onClick={() => router.push('/purchases/retentions')}
          className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm flex items-center gap-2">
          <ArrowLeft size={16} /> Volver
        </button>
      </div>
    );
  }

  if (!voucher) return null;

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/purchases/retentions')}
            className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Shield className="text-purple-400" size={24} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-purple-400 font-mono">{voucher.number}</h1>
              <span className={`inline-block px-2.5 py-1 rounded text-xs font-bold border ${STATUS_BADGES[voucher.status]}`}>
                {STATUS_LABELS[voucher.status]}
              </span>
            </div>
            <p className="text-sm text-slate-400">Comprobante de Retención IVA</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button onClick={() => window.open(`/api/proxy/retention-vouchers/${id}/pdf`, '_blank')}
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
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">% Retención</p>
          <p className="text-2xl font-bold text-slate-100">{voucher.retentionPct}%</p>
        </div>
        <div className="bg-slate-800/50 border border-purple-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Total retenido USD</p>
          <p className="text-2xl font-bold text-purple-400 font-mono">${fmt(voucher.retentionAmountUsd)}</p>
        </div>
        <div className="bg-slate-800/50 border border-purple-500/20 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Total retenido Bs</p>
          <p className="text-2xl font-bold text-purple-400 font-mono">Bs {fmt(voucher.retentionAmountBs)}</p>
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
            <p className="text-slate-300 font-mono">{fmt(voucher.exchangeRate)}</p>
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
              className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm disabled:opacity-50">
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
        <div className="px-5 py-3 border-b border-slate-700/50">
          <h2 className="text-sm font-semibold text-slate-300">
            Facturas incluidas ({voucher.lines.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Factura</th>
                <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Nº Factura Prov.</th>
                <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Nº Control</th>
                <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Fecha</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Total $</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Base imp. $</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">IVA $</th>
                <th className="text-center px-3 py-2.5 text-slate-400 font-medium">%</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Ret. $</th>
                <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Ret. Bs</th>
              </tr>
            </thead>
            <tbody>
              {voucher.lines.map(line => (
                <tr key={line.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                  <td className="px-3 py-2.5">
                    <a href={`/purchases/${line.purchaseOrder.id}`}
                      className="text-blue-400 hover:text-blue-300 font-mono text-xs">
                      {line.purchaseOrder.number}
                    </a>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300 font-mono text-xs">{line.supplierInvoiceNumber || '--'}</td>
                  <td className="px-3 py-2.5 text-slate-300 font-mono text-xs">{line.supplierControlNumber || '--'}</td>
                  <td className="px-3 py-2.5 text-slate-300 text-xs">{fmtDate(line.invoiceDate)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-300 font-mono">${fmt(line.invoiceTotalUsd)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-300 font-mono">${fmt(line.taxableBaseUsd)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-300 font-mono">${fmt(line.ivaAmountUsd)}</td>
                  <td className="px-3 py-2.5 text-center text-slate-400">{line.retentionPct}%</td>
                  <td className="px-3 py-2.5 text-right text-purple-400 font-mono font-bold">${fmt(line.retentionAmountUsd)}</td>
                  <td className="px-3 py-2.5 text-right text-purple-400 font-mono font-bold">Bs {fmt(line.retentionAmountBs)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-600/50 bg-slate-900/30">
                <td colSpan={4} className="px-3 py-2.5 text-right text-slate-400 font-medium">Totales:</td>
                <td className="px-3 py-2.5 text-right text-slate-300 font-mono font-bold">
                  ${fmt(voucher.lines.reduce((s, l) => s + l.invoiceTotalUsd, 0))}
                </td>
                <td className="px-3 py-2.5 text-right text-slate-300 font-mono font-bold">
                  ${fmt(voucher.lines.reduce((s, l) => s + l.taxableBaseUsd, 0))}
                </td>
                <td className="px-3 py-2.5 text-right text-slate-300 font-mono font-bold">
                  ${fmt(voucher.lines.reduce((s, l) => s + l.ivaAmountUsd, 0))}
                </td>
                <td className="px-3 py-2.5"></td>
                <td className="px-3 py-2.5 text-right text-purple-400 font-mono font-bold">${fmt(voucher.retentionAmountUsd)}</td>
                <td className="px-3 py-2.5 text-right text-purple-400 font-mono font-bold">Bs {fmt(voucher.retentionAmountBs)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Issue Modal */}
      {issueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-100">Emitir retención</h2>
              <button onClick={() => setIssueModal(false)} className="p-1 rounded hover:bg-slate-700 text-slate-400">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Nº Retención</p>
                  <p className="text-purple-400 font-mono font-bold">{voucher.number}</p>
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
