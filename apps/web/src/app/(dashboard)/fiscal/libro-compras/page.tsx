'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import {
  BookOpen, Loader2, FileDown, Search, Plus, Pencil, Trash2, X, Save, Calendar, FileSpreadsheet,
} from 'lucide-react';
import * as XLSX from 'xlsx';

// ── Types ────────────────────────────────────────────────────────────────────

interface PurchaseBookEntry {
  id: string;
  purchaseOrderId: string | null;
  purchaseOrder: { id: string; number: string; purchaseNumber: number } | null;
  entryDate: string;
  supplierControlNumber: string | null;
  supplierInvoiceNumber: string | null;
  supplierName: string;
  supplierRif: string;
  exemptAmountBs: number;
  taxableBaseBs: number;
  ivaAmountBs: number;
  retentionVoucherNumber: string | null;
  retentionAmountBs: number;
  islrRetentionAmountBs: number;
  islrRetentionVoucherNumber: string | null;
  isIslrRetentionLine: boolean;
  totalBs: number;
  isManual: boolean;
  isRetentionLine: boolean;
  documentType: string;
  affectedDocNumber: string | null;
  notes: string | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

interface Totales {
  totalEntries: number;
  exemptAmountBs: number;
  taxableBaseBs: number;
  ivaAmountBs: number;
  retentionAmountBs: number;
  islrRetentionAmountBs: number;
  totalBs: number;
}

interface PdfSummary {
  comprasExentas: number;
  baseImponibleGeneral: number;
  creditoFiscalGeneral: number;
  totalBaseImponible: number;
  totalCreditoFiscal: number;
  totalRetencionesIva: number;
  creditoFiscalNeto: number;
  totalCompras: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const PURCHASE_DOC_LABEL: Record<string, string> = {
  FACTURA: 'Factura',
  NCC: 'N. Crédito',
  NDC: 'N. Débito',
  RETENCION_IVA: 'Ret. IVA',
  RETENCION_ISLR: 'Ret. ISLR',
};
function purchaseDocLabel(t: string): string {
  return PURCHASE_DOC_LABEL[t] || t;
}

function formatVe(n: number): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// ── Entry form defaults ──────────────────────────────────────────────────────

const EMPTY_FORM = {
  entryDate: '',
  supplierControlNumber: '',
  supplierInvoiceNumber: '',
  supplierName: '',
  supplierRif: '',
  exemptAmountBs: 0,
  taxableBaseBs: 0,
  ivaAmountBs: 0,
  retentionVoucherNumber: '',
  retentionAmountBs: 0,
  totalBs: 0,
  notes: '',
};

type EntryForm = typeof EMPTY_FORM;

// ── Component ────────────────────────────────────────────────────────────────

export default function LibroComprasPage() {
  const now = new Date();

  // Date range state
  const [fromDate, setFromDate] = useState(toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [toDate, setToDate] = useState(toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), lastDayOfMonth(now.getFullYear(), now.getMonth()))));

  // Data state
  const [entries, setEntries] = useState<PurchaseBookEntry[]>([]);
  const [totales, setTotales] = useState<Totales | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EntryForm>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  useEffect(() => { document.title = 'Libro de Compras | Trinity ERP'; }, []);

  // ── Quick period buttons ─────────────────────────────────────────────────

  function setThisMonth() {
    setFromDate(toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1)));
    setToDate(toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), lastDayOfMonth(now.getFullYear(), now.getMonth()))));
  }

  function setQuincena1() {
    setFromDate(toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1)));
    setToDate(toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 15)));
  }

  function setQuincena2() {
    setFromDate(toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 16)));
    setToDate(toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), lastDayOfMonth(now.getFullYear(), now.getMonth()))));
  }

  function setLastMonth() {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    setFromDate(toLocalDateStr(prev));
    setToDate(toLocalDateStr(new Date(prev.getFullYear(), prev.getMonth(), lastDayOfMonth(prev.getFullYear(), prev.getMonth()))));
  }

  // ── Fetch data ───────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/proxy/purchase-book?from=${fromDate}&to=${toDate}`);
      if (!res.ok) throw new Error('Error al cargar datos');
      const data = await res.json();
      setEntries(data.entries || []);
      setTotales(data.totales || null);
      setLoaded(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  // ── Modal handlers ───────────────────────────────────────────────────────

  function openCreateModal() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, entryDate: toLocalDateStr(now) });
    setModalOpen(true);
  }

  function openEditModal(entry: PurchaseBookEntry) {
    setEditingId(entry.id);
    setForm({
      entryDate: entry.entryDate ? entry.entryDate.substring(0, 10) : '',
      supplierControlNumber: entry.supplierControlNumber || '',
      supplierInvoiceNumber: entry.supplierInvoiceNumber || '',
      supplierName: entry.supplierName,
      supplierRif: entry.supplierRif,
      exemptAmountBs: entry.exemptAmountBs,
      taxableBaseBs: entry.taxableBaseBs,
      ivaAmountBs: entry.ivaAmountBs,
      retentionVoucherNumber: entry.retentionVoucherNumber || '',
      retentionAmountBs: entry.retentionAmountBs,
      totalBs: entry.totalBs,
      notes: entry.notes || '',
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  }

  function updateForm(field: keyof EntryForm, value: string | number) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        exemptAmountBs: Number(form.exemptAmountBs) || 0,
        taxableBaseBs: Number(form.taxableBaseBs) || 0,
        ivaAmountBs: Number(form.ivaAmountBs) || 0,
        retentionAmountBs: Number(form.retentionAmountBs) || 0,
        totalBs: Number(form.totalBs) || 0,
      };

      const url = editingId
        ? `/api/proxy/purchase-book/${editingId}`
        : '/api/proxy/purchase-book';
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al guardar');
      }

      closeModal();
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta entrada del libro de compras?')) return;
    try {
      const res = await fetch(`/api/proxy/purchase-book/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al eliminar');
      }
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  }

  // ── Excel Export (detallado tal cual, editable) ───────────────────────────

  function exportExcel() {
    const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
    let n = 0;
    const rows: Record<string, string | number>[] = entries.map((e) => {
      const isRet = e.isRetentionLine || e.isIslrRetentionLine;
      if (!isRet) n += 1;
      const tipo = e.isRetentionLine ? 'Retención IVA'
        : e.isIslrRetentionLine ? 'Retención ISLR'
        : purchaseDocLabel(e.documentType);
      return {
        'N°': isRet ? '' : n,
        'Fecha': isRet ? '' : (e.entryDate ? new Date(e.entryDate).toLocaleDateString('es-VE') : ''),
        'Tipo': tipo,
        'N° Control': isRet ? '' : (e.supplierControlNumber || ''),
        'N° Factura': isRet ? '' : (e.supplierInvoiceNumber || ''),
        'N° Doc. Afectado': isRet ? '' : (e.affectedDocNumber || ''),
        'Proveedor': isRet ? '' : e.supplierName,
        'RIF': isRet ? '' : e.supplierRif,
        'Exento Bs': isRet ? '' : r2(e.exemptAmountBs),
        'Base Imponible Bs': isRet ? '' : r2(e.taxableBaseBs),
        'Crédito Fiscal Bs': isRet ? '' : r2(e.ivaAmountBs),
        'N° Comprobante Ret.': e.retentionVoucherNumber || e.islrRetentionVoucherNumber || '',
        'Ret. IVA Bs': e.retentionAmountBs ? r2(e.retentionAmountBs) : '',
        'Ret. ISLR Bs': e.islrRetentionAmountBs ? r2(e.islrRetentionAmountBs) : '',
        'Total Bs': r2(e.totalBs),
      };
    });

    if (totales) {
      rows.push({
        'N°': '', 'Fecha': '', 'Tipo': 'TOTALES', 'N° Control': '', 'N° Factura': '',
        'N° Doc. Afectado': '', 'Proveedor': '', 'RIF': '',
        'Exento Bs': r2(totales.exemptAmountBs),
        'Base Imponible Bs': r2(totales.taxableBaseBs),
        'Crédito Fiscal Bs': r2(totales.ivaAmountBs),
        'N° Comprobante Ret.': '',
        'Ret. IVA Bs': r2(totales.retentionAmountBs),
        'Ret. ISLR Bs': totales.islrRetentionAmountBs ? r2(totales.islrRetentionAmountBs) : '',
        'Total Bs': r2(totales.totalBs),
      });
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 5 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
      { wch: 28 }, { wch: 14 }, { wch: 13 }, { wch: 16 }, { wch: 16 }, { wch: 20 },
      { wch: 13 }, { wch: 13 }, { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Libro de Compras');
    XLSX.writeFile(wb, `libro-compras-${fromDate}_${toDate}.xlsx`);
  }

  // ── PDF Export ───────────────────────────────────────────────────────────

  async function exportPdf() {
    let companyName = 'Trinity ERP';
    let companyRif = '';
    try {
      const cfgRes = await fetch('/api/proxy/config');
      const cfg = await cfgRes.json();
      companyName = cfg.companyName || companyName;
      companyRif = cfg.rif || '';
    } catch {}

    let summary: PdfSummary | null = null;
    try {
      const pdfRes = await fetch(`/api/proxy/purchase-book/pdf?from=${fromDate}&to=${toDate}`);
      const pdfData = await pdfRes.json();
      summary = pdfData.summary;
    } catch {}

    const printWin = window.open('', '_blank');
    if (!printWin) return;

    const from = new Date(fromDate + 'T00:00:00');
    const to = new Date(toDate + 'T00:00:00');
    const periodoStr = `${from.toLocaleDateString('es-VE')} al ${to.toLocaleDateString('es-VE')}`;

    let rowNum = 0;
    const tableRows = entries.map((r) => {
      if (!r.isRetentionLine && !r.isIslrRetentionLine) rowNum++;
      if (r.isRetentionLine) {
        return `<tr class="retention-line">
            <td></td><td></td><td></td><td></td>
            <td style="padding-left:16px;font-style:italic;color:#8b5cf6;font-size:7pt;">↳ Retención IVA</td>
            <td></td><td></td><td></td><td></td>
            <td style="color:#8b5cf6;font-weight:bold;">${r.retentionVoucherNumber || ''}</td>
            <td class="num" style="color:#8b5cf6;">${formatVe(r.retentionAmountBs)}</td>
            <td></td>
            <td class="num" style="color:#8b5cf6;">${formatVe(r.totalBs)}</td>
          </tr>`;
      }
      if (r.isIslrRetentionLine) {
        return `<tr class="retention-line">
            <td></td><td></td><td></td><td></td>
            <td style="padding-left:16px;font-style:italic;color:#d97706;font-size:7pt;">↳ Retención ISLR</td>
            <td></td><td></td><td></td><td></td>
            <td>${r.islrRetentionVoucherNumber || ''}</td>
            <td></td>
            <td class="num" style="color:#d97706;">${formatVe(r.islrRetentionAmountBs)}</td>
            <td class="num" style="color:#d97706;">${formatVe(r.totalBs)}</td>
          </tr>`;
      }
      return `<tr>
            <td>${rowNum}</td>
            <td>${r.entryDate ? new Date(r.entryDate).toLocaleDateString('es-VE') : ''}</td>
            <td>${r.supplierControlNumber || ''}</td>
            <td>${r.supplierInvoiceNumber || ''}</td>
            <td>${r.supplierName}</td>
            <td>${r.supplierRif}</td>
            <td class="num">${formatVe(r.exemptAmountBs)}</td>
            <td class="num">${formatVe(r.taxableBaseBs)}</td>
            <td class="num">${formatVe(r.ivaAmountBs)}</td>
            <td>${r.retentionVoucherNumber || ''}</td>
            <td class="num">${formatVe(r.retentionAmountBs)}</td>
            <td class="num">${formatVe(r.islrRetentionAmountBs)}</td>
            <td class="num total">${formatVe(r.totalBs)}</td>
          </tr>`;
    }).join('');

    const totalesRow = totales ? `
      <tr class="totales">
        <td colspan="6"><strong>TOTALES</strong></td>
        <td class="num"><strong>${formatVe(totales.exemptAmountBs)}</strong></td>
        <td class="num"><strong>${formatVe(totales.taxableBaseBs)}</strong></td>
        <td class="num"><strong>${formatVe(totales.ivaAmountBs)}</strong></td>
        <td></td>
        <td class="num"><strong>${formatVe(totales.retentionAmountBs)}</strong></td>
        <td class="num"><strong>${totales.islrRetentionAmountBs > 0 ? formatVe(totales.islrRetentionAmountBs) : ''}</strong></td>
        <td class="num total"><strong>${formatVe(totales.totalBs)}</strong></td>
      </tr>
    ` : '';

    const summaryPage = summary ? `
      <div class="page-break"></div>
      <div class="header">
        <h1>${companyName}</h1>
        ${companyRif ? `<p>RIF: ${companyRif}</p>` : ''}
        <h2>RESUMEN FISCAL DEL LIBRO DE COMPRAS</h2>
        <p>Per&iacute;odo: ${periodoStr}</p>
      </div>
      <div class="summary">
        <table class="summary-table">
          <tbody>
            <tr><td class="label">Compras internas exentas:</td><td class="value">Bs ${formatVe(summary.comprasExentas)}</td></tr>
            <tr><td class="label">Base imponible general (16%):</td><td class="value">Bs ${formatVe(summary.baseImponibleGeneral)}</td></tr>
            <tr><td class="label">Cr&eacute;dito fiscal (16%):</td><td class="value">Bs ${formatVe(summary.creditoFiscalGeneral)}</td></tr>
            <tr class="separator"><td colspan="2"><hr/></td></tr>
            <tr class="highlight"><td class="label">Total base imponible:</td><td class="value">Bs ${formatVe(summary.totalBaseImponible)}</td></tr>
            <tr class="highlight"><td class="label">Total cr&eacute;dito fiscal:</td><td class="value">Bs ${formatVe(summary.totalCreditoFiscal)}</td></tr>
            <tr><td class="label">Total retenciones IVA:</td><td class="value">Bs ${formatVe(summary.totalRetencionesIva)}</td></tr>
            <tr class="highlight"><td class="label">Cr&eacute;dito fiscal neto (despu&eacute;s retenciones):</td><td class="value">Bs ${formatVe(summary.creditoFiscalNeto)}</td></tr>
            <tr class="grand-total"><td class="label">Total compras del per&iacute;odo:</td><td class="value">Bs ${formatVe(summary.totalCompras)}</td></tr>
          </tbody>
        </table>
      </div>
    ` : '';

    printWin.document.write(`<!DOCTYPE html>
    <html>
    <head>
      <title>Libro de Compras - ${periodoStr}</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        body { font-family: Arial, sans-serif; font-size: 8pt; color: #000; }
        .header { text-align: center; margin-bottom: 10px; }
        .header h1 { font-size: 12pt; margin: 2px 0; }
        .header h2 { font-size: 10pt; margin: 2px 0; font-weight: normal; }
        .header p { font-size: 8pt; margin: 2px 0; color: #555; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #999; padding: 3px 4px; text-align: left; }
        th { background: #e0e0e0; font-size: 7pt; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        .total { font-weight: bold; }
        .totales td { background: #f0f0f0; border-top: 2px solid #333; }
        .footer { text-align: center; margin-top: 8px; font-size: 7pt; color: #888; }
        .page-break { page-break-before: always; margin-top: 20mm; }
        .summary { max-width: 600px; margin: 30px auto; }
        .summary-table { border: none; }
        .summary-table td { border: none; padding: 6px 12px; font-size: 10pt; }
        .summary-table .label { text-align: left; color: #333; }
        .summary-table .value { text-align: right; font-weight: bold; font-variant-numeric: tabular-nums; }
        .summary-table .separator td { padding: 2px; }
        .summary-table .separator hr { border: 1px solid #666; margin: 0; }
        .summary-table .highlight td { font-weight: bold; }
        .summary-table .grand-total td { font-size: 12pt; font-weight: bold; border-top: 2px solid #333; padding-top: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${companyName}</h1>
        ${companyRif ? `<p>RIF: ${companyRif}</p>` : ''}
        <h2>LIBRO DE COMPRAS</h2>
        <p>Per&iacute;odo: ${periodoStr}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>N&deg;</th><th>Fecha</th><th>N&deg; Control</th><th>N&deg; Factura</th>
            <th>Proveedor</th><th>RIF</th>
            <th>Exento Bs</th><th>Base Imponible Bs</th><th>Cr&eacute;dito Fiscal Bs</th>
            <th>N&deg; Comprobante</th><th>Ret. IVA Bs</th><th>Ret. ISLR Bs</th><th>Total Bs</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
          ${totalesRow}
        </tbody>
      </table>
      <div class="footer">Generado el ${new Date().toLocaleString('es-VE')}</div>
      ${summaryPage}
      <script>window.print();</script>
    </body>
    </html>`);
    printWin.document.close();
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <BookOpen className="text-blue-400" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Libro de Compras</h1>
            <p className="text-sm text-slate-400">Formato SENIAT - Registro de compras con entradas editables</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Period Selector */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Desde</label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-2.5 text-slate-500" size={14} />
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 w-[160px]" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Hasta</label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-2.5 text-slate-500" size={14} />
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 w-[160px]" />
            </div>
          </div>
          <button onClick={fetchData} disabled={loading}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm flex items-center gap-2 disabled:opacity-50 h-[38px]">
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
            Generar
          </button>
        </div>

        {/* Quick period buttons */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-slate-500 self-center mr-1">Rápido:</span>
          <button onClick={setThisMonth}
            className="px-3 py-1 rounded-md bg-slate-700/60 hover:bg-slate-700 text-slate-300 text-xs transition-colors">
            Este mes
          </button>
          <button onClick={setQuincena1}
            className="px-3 py-1 rounded-md bg-slate-700/60 hover:bg-slate-700 text-slate-300 text-xs transition-colors">
            Quincena 1 (1-15)
          </button>
          <button onClick={setQuincena2}
            className="px-3 py-1 rounded-md bg-slate-700/60 hover:bg-slate-700 text-slate-300 text-xs transition-colors">
            Quincena 2 (16-fin)
          </button>
          <button onClick={setLastMonth}
            className="px-3 py-1 rounded-md bg-slate-700/60 hover:bg-slate-700 text-slate-300 text-xs transition-colors">
            Mes anterior
          </button>
        </div>
      </div>

      {/* Action buttons */}
      {loaded && (
        <div className="flex flex-wrap gap-2">
          <button onClick={openCreateModal}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center gap-2">
            <Plus size={16} />
            Agregar entrada manual
          </button>
          {entries.length > 0 && (
            <>
              <button onClick={exportExcel}
                className="px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white font-medium text-sm flex items-center gap-2">
                <FileSpreadsheet size={16} />
                Exportar Excel
              </button>
              <button onClick={exportPdf}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-sm flex items-center gap-2">
                <FileDown size={16} />
                Exportar PDF
              </button>
            </>
          )}
        </div>
      )}

      {/* Table */}
      {loaded && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-2 py-2.5 text-slate-400 font-medium w-10">N&deg;</th>
                  <th className="text-left px-2 py-2.5 text-slate-400 font-medium">Fecha</th>
                  <th className="text-left px-2 py-2.5 text-slate-400 font-medium">N&deg; Control</th>
                  <th className="text-left px-2 py-2.5 text-slate-400 font-medium">N&deg; Factura</th>
                  <th className="text-left px-2 py-2.5 text-slate-400 font-medium">Proveedor</th>
                  <th className="text-left px-2 py-2.5 text-slate-400 font-medium">RIF</th>
                  <th className="text-right px-2 py-2.5 text-slate-400 font-medium">Exento Bs</th>
                  <th className="text-right px-2 py-2.5 text-slate-400 font-medium">Base Imp. Bs</th>
                  <th className="text-right px-2 py-2.5 text-blue-400 font-medium">Cred. Fiscal Bs</th>
                  <th className="text-left px-2 py-2.5 text-slate-400 font-medium">N&deg; Comp.</th>
                  <th className="text-right px-2 py-2.5 text-orange-400 font-medium">Ret. IVA Bs</th>
                  <th className="text-right px-2 py-2.5 text-amber-400 font-medium">Ret. ISLR Bs</th>
                  <th className="text-right px-2 py-2.5 text-slate-400 font-medium">Total Bs</th>
                  <th className="text-center px-2 py-2.5 text-slate-400 font-medium w-20">Acc.</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="text-center py-10 text-slate-500">
                      <div className="flex flex-col items-center gap-2">
                        <BookOpen size={32} className="text-slate-600" />
                        <span>No hay entradas en este periodo</span>
                        <button onClick={openCreateModal}
                          className="mt-1 text-emerald-400 hover:text-emerald-300 text-xs flex items-center gap-1">
                          <Plus size={14} /> Agregar entrada manual
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <>
                    {entries.map((entry, i) => (
                      <tr key={entry.id} className={`border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors group ${
                        entry.isRetentionLine ? 'bg-purple-500/5' : entry.isIslrRetentionLine ? 'bg-amber-500/5' : ''
                      }`}>
                        <td className="px-2 py-2 text-slate-400">
                          {(entry.isRetentionLine || entry.isIslrRetentionLine) ? '' : i + 1 - entries.slice(0, i).filter(e => e.isRetentionLine || e.isIslrRetentionLine).length}
                        </td>
                        <td className="px-2 py-2 text-slate-300" style={(entry.isRetentionLine || entry.isIslrRetentionLine) ? { fontSize: '10px' } : {}}>
                          {(entry.isRetentionLine || entry.isIslrRetentionLine) ? '' : entry.entryDate ? new Date(entry.entryDate).toLocaleDateString('es-VE') : ''}
                        </td>
                        <td className="px-2 py-2 text-slate-300 font-mono text-[11px]">
                          {(entry.isRetentionLine || entry.isIslrRetentionLine) ? '' : entry.supplierControlNumber || '-'}
                        </td>
                        <td className="px-2 py-2 text-slate-200 font-mono text-[11px]">
                          {(entry.isRetentionLine || entry.isIslrRetentionLine) ? '' : (
                            <div className="flex items-center gap-1">
                              <span>{entry.supplierInvoiceNumber || '-'}</span>
                              {entry.documentType && entry.documentType !== 'FACTURA' && (
                                <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-slate-600/40 text-slate-300 border border-slate-500/30 whitespace-nowrap">
                                  {purchaseDocLabel(entry.documentType)}
                                </span>
                              )}
                              {entry.affectedDocNumber && (
                                <span className="text-[9px] text-slate-500">→ {entry.affectedDocNumber}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2 text-slate-200">
                          {entry.isRetentionLine ? (
                            <span className="text-[10px] text-purple-400 italic pl-4">↳ Retención IVA</span>
                          ) : entry.isIslrRetentionLine ? (
                            <span className="text-[10px] text-amber-400 italic pl-4">↳ Retención ISLR</span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="truncate max-w-[160px]">{entry.supplierName}</span>
                              {entry.isManual ? (
                                <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">MANUAL</span>
                              ) : (
                                <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">AUTO</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2 text-slate-300 font-mono text-[11px]">
                          {(entry.isRetentionLine || entry.isIslrRetentionLine) ? '' : entry.supplierRif}
                        </td>
                        <td className="px-2 py-2 text-right text-slate-300 tabular-nums">
                          {(entry.isRetentionLine || entry.isIslrRetentionLine) ? '' : formatVe(entry.exemptAmountBs)}
                        </td>
                        <td className="px-2 py-2 text-right text-slate-300 tabular-nums">
                          {(entry.isRetentionLine || entry.isIslrRetentionLine) ? '' : formatVe(entry.taxableBaseBs)}
                        </td>
                        <td className="px-2 py-2 text-right text-blue-400 tabular-nums font-medium">
                          {(entry.isRetentionLine || entry.isIslrRetentionLine) ? '' : formatVe(entry.ivaAmountBs)}
                        </td>
                        <td className="px-2 py-2 text-purple-400 font-mono text-[11px] font-medium">
                          {entry.retentionVoucherNumber || '-'}
                        </td>
                        <td className="px-2 py-2 text-right text-orange-400 tabular-nums">
                          {entry.isRetentionLine
                            ? formatVe(entry.retentionAmountBs)
                            : formatVe(entry.retentionAmountBs)}
                        </td>
                        <td className="px-2 py-2 text-right text-amber-400 tabular-nums">
                          {entry.isIslrRetentionLine
                            ? formatVe(entry.islrRetentionAmountBs)
                            : (entry.islrRetentionAmountBs > 0 ? formatVe(entry.islrRetentionAmountBs) : '')}
                        </td>
                        <td className={`px-2 py-2 text-right tabular-nums ${
                          entry.isRetentionLine || entry.isIslrRetentionLine ? 'text-purple-400 font-medium' : 'text-slate-100 font-semibold'
                        }`}>
                          {formatVe(entry.totalBs)}
                        </td>
                        <td className="px-2 py-2">
                          {!entry.isRetentionLine && !entry.isIslrRetentionLine && (
                            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEditModal(entry)}
                                className="p-1 rounded hover:bg-slate-600/60 text-slate-400 hover:text-blue-400 transition-colors"
                                title="Editar">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => handleDelete(entry.id)}
                                className="p-1 rounded hover:bg-slate-600/60 text-slate-400 hover:text-red-400 transition-colors"
                                title="Eliminar">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    {totales && (
                      <tr className="bg-slate-700/30 border-t-2 border-slate-600">
                        <td colSpan={6} className="px-2 py-2.5 text-slate-100 font-bold">
                          TOTALES ({totales.totalEntries} entradas)
                        </td>
                        <td className="px-2 py-2.5 text-right text-slate-100 font-bold tabular-nums">{formatVe(totales.exemptAmountBs)}</td>
                        <td className="px-2 py-2.5 text-right text-slate-100 font-bold tabular-nums">{formatVe(totales.taxableBaseBs)}</td>
                        <td className="px-2 py-2.5 text-right text-blue-400 font-bold tabular-nums">{formatVe(totales.ivaAmountBs)}</td>
                        <td className="px-2 py-2.5"></td>
                        <td className="px-2 py-2.5 text-right text-orange-400 font-bold tabular-nums">{formatVe(totales.retentionAmountBs)}</td>
                        <td className="px-2 py-2.5 text-right text-amber-400 font-bold tabular-nums">{totales.islrRetentionAmountBs > 0 ? formatVe(totales.islrRetentionAmountBs) : ''}</td>
                        <td className="px-2 py-2.5 text-right text-emerald-400 font-bold tabular-nums">{formatVe(totales.totalBs)}</td>
                        <td></td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl mx-4 shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-100">
                {editingId ? 'Editar entrada' : 'Nueva entrada manual'}
              </h2>
              <button onClick={closeModal} className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200">
                <X size={20} />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Row 1: Fecha, Control, Factura */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Fecha *</label>
                  <input type="date" value={form.entryDate}
                    onChange={e => updateForm('entryDate', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">N&deg; Control</label>
                  <input type="text" value={form.supplierControlNumber}
                    onChange={e => updateForm('supplierControlNumber', e.target.value)}
                    placeholder="00-000000"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">N&deg; Factura</label>
                  <input type="text" value={form.supplierInvoiceNumber}
                    onChange={e => updateForm('supplierInvoiceNumber', e.target.value)}
                    placeholder="Numero de factura"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
              </div>

              {/* Row 2: Proveedor, RIF */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Proveedor *</label>
                  <input type="text" value={form.supplierName}
                    onChange={e => updateForm('supplierName', e.target.value)}
                    placeholder="Nombre del proveedor"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">RIF *</label>
                  <input type="text" value={form.supplierRif}
                    onChange={e => updateForm('supplierRif', e.target.value)}
                    placeholder="J-12345678-9"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
              </div>

              {/* Row 3: Montos fiscales */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Exento Bs</label>
                  <input type="number" step="0.01" value={form.exemptAmountBs}
                    onChange={e => updateForm('exemptAmountBs', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Base Imponible Bs</label>
                  <input type="number" step="0.01" value={form.taxableBaseBs}
                    onChange={e => updateForm('taxableBaseBs', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Credito Fiscal Bs</label>
                  <input type="number" step="0.01" value={form.ivaAmountBs}
                    onChange={e => updateForm('ivaAmountBs', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
              </div>

              {/* Row 4: Retenciones y total */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">N&deg; Comprobante Ret.</label>
                  <input type="text" value={form.retentionVoucherNumber}
                    onChange={e => updateForm('retentionVoucherNumber', e.target.value)}
                    placeholder="Numero"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Retencion IVA Bs</label>
                  <input type="number" step="0.01" value={form.retentionAmountBs}
                    onChange={e => updateForm('retentionAmountBs', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Total Bs</label>
                  <input type="number" step="0.01" value={form.totalBs}
                    onChange={e => updateForm('totalBs', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Notas</label>
                <textarea value={form.notes}
                  onChange={e => updateForm('notes', e.target.value)}
                  rows={2}
                  placeholder="Observaciones opcionales"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 resize-none" />
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-slate-700">
              <p className="text-xs text-slate-500 italic max-w-xs">
                Los cambios en el libro no afectan la factura de compra original
              </p>
              <div className="flex gap-2">
                <button onClick={closeModal}
                  className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving || !form.entryDate || !form.supplierName || !form.supplierRif}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm flex items-center gap-2 disabled:opacity-50">
                  {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                  Guardar cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
