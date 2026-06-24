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
  supplierSerie: string | null;
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
    const t = totales || { exemptAmountBs: 0, taxableBaseBs: 0, ivaAmountBs: 0, retentionAmountBs: 0, totalBs: 0 };

    // Mismo orden de columnas que el PDF (formato SENIAT)
    const aoa: (string | number)[][] = [[
      'Oper. Nro.', 'Fecha', 'N° Rif', 'Nombre o Razón Social', 'Factura', 'Serie', 'Fiscal',
      'N° Factura Afectada', 'N° Nota Débito', 'N° Nota Crédito', 'Tipo Transac.',
      'Total Compras Bs', 'Compras No Gravadas Bs', 'Base Imponible 16% Bs', '% Alícuota',
      'Impuesto IVA 16% Bs', 'IVA Retenido Bs', 'Comp. Retención', 'IVA Percibido Bs',
    ]];

    let n = 0;
    for (const e of entries) {
      if (e.isIslrRetentionLine) continue; // ISLR fuera del libro por ahora
      const fecha = e.entryDate ? new Date(e.entryDate).toLocaleDateString('es-VE') : '';
      if (e.isRetentionLine) {
        aoa.push([
          '', fecha, e.supplierRif || '', e.supplierName || '', '', '', '',
          e.supplierInvoiceNumber || '', '', '', '01 - reg',
          '', '', '', '16,00', '', r2(e.retentionAmountBs), e.retentionVoucherNumber || '', '',
        ]);
        continue;
      }
      n += 1;
      const isNCC = e.documentType === 'NCC';
      const isNDC = e.documentType === 'NDC';
      const isFactura = !isNCC && !isNDC;
      aoa.push([
        n, fecha, e.supplierRif || '', e.supplierName || '',
        isFactura ? (e.supplierInvoiceNumber || '') : '',
        e.supplierSerie || '', e.supplierControlNumber || '',
        e.affectedDocNumber || '',
        isNDC ? (e.supplierInvoiceNumber || '') : '',
        isNCC ? (e.supplierInvoiceNumber || '') : '',
        '01 - reg',
        r2(e.totalBs), r2(e.exemptAmountBs), r2(e.taxableBaseBs),
        e.taxableBaseBs ? '16,00' : '',
        r2(e.ivaAmountBs), '', '', '',
      ]);
    }

    // Fila de totales (alineada a las columnas)
    aoa.push([
      'TOTALES', '', '', '', '', '', '', '', '', '', '',
      r2(t.totalBs), r2(t.exemptAmountBs), r2(t.taxableBaseBs), '',
      r2(t.ivaAmountBs), r2(t.retentionAmountBs), '', '',
    ]);

    // Cuadro de totales (resumen SENIAT) — igual que el PDF
    aoa.push([]);
    aoa.push(['', '', 'Base Imponible', 'Crédito Fiscal', 'Iva retenido por el comprador']);
    aoa.push(['Total compras internas no gravadas', '', r2(t.exemptAmountBs)]);
    aoa.push(['Suma de las compras de importación']);
    aoa.push(['Suma de las compras internas afecta solo Alicuota General', '', r2(t.taxableBaseBs), r2(t.ivaAmountBs), r2(t.retentionAmountBs)]);
    aoa.push(['Suma de las compras internas afecta solo Alicuota General + Adicional', '', 0, 0]);
    aoa.push(['Suma de las compras internas afecta solo Alicuota Reducida', '', 0, 0]);
    aoa.push(['Total IGTF', '', 0, 0]);
    aoa.push(['SUBTOTAL', '', r2(t.taxableBaseBs + t.exemptAmountBs), r2(t.ivaAmountBs), r2(t.retentionAmountBs)]);
    aoa.push([]);
    aoa.push(['Compras internas afectas solo alicuota general periodos anteriores']);
    aoa.push(['Compras internas afectas en alicuota Gral. + Adic. periodos anteriores']);
    aoa.push(['Compras internas afectas en alicuota reducida periodos anteriores']);
    aoa.push([]);
    aoa.push(['Contribuyente', '', r2(t.taxableBaseBs), r2(t.ivaAmountBs)]);
    aoa.push(['No contribuyente']);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 8 }, { wch: 11 }, { wch: 13 }, { wch: 30 }, { wch: 14 }, { wch: 7 }, { wch: 14 },
      { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 11 }, { wch: 16 }, { wch: 18 }, { wch: 18 },
      { wch: 9 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Libro de Compras');
    XLSX.writeFile(wb, `libro-compras-${fromDate}_${toDate}.xlsx`);
  }

  // ── PDF Export ───────────────────────────────────────────────────────────

  async function exportPdf() {
    let companyName = 'Trinity ERP';
    let companyRif = '';
    let companyAddress = '';
    try {
      const cfgRes = await fetch('/api/proxy/config');
      const cfg = await cfgRes.json();
      companyName = cfg.companyName || companyName;
      companyRif = cfg.rif || '';
      companyAddress = cfg.address || '';
    } catch {}

    const printWin = window.open('', '_blank');
    if (!printWin) return;

    const from = new Date(fromDate + 'T00:00:00');
    const to = new Date(toDate + 'T00:00:00');
    const periodoStr = `${from.toLocaleDateString('es-VE')} al ${to.toLocaleDateString('es-VE')}`;

    const fmtNum = (n: number) => n ? formatVe(n) : '';
    let rowNum = 0;
    const tableRows = entries.map((r) => {
      // ISLR fuera del libro por ahora (decision del usuario)
      if (r.isIslrRetentionLine) return '';
      const fecha = r.entryDate ? new Date(r.entryDate).toLocaleDateString('es-VE') : '';

      // Fila de retencion IVA: repite proveedor y factura, muestra retencion + comprobante
      if (r.isRetentionLine) {
        return `<tr>
          <td class="fit"></td>
          <td class="fit">${fecha}</td>
          <td class="fit">${r.supplierRif || ''}</td>
          <td>${r.supplierName || ''}</td>
          <td class="fit"></td>
          <td class="fit"></td>
          <td class="fit"></td>
          <td class="fit">${r.supplierInvoiceNumber || ''}</td>
          <td class="fit"></td>
          <td class="fit"></td>
          <td class="fit">01 - reg</td>
          <td class="num"></td>
          <td class="num"></td>
          <td class="num"></td>
          <td class="fit">16,00</td>
          <td class="num"></td>
          <td class="num">${fmtNum(r.retentionAmountBs)}</td>
          <td class="fit">${r.retentionVoucherNumber || ''}</td>
          <td class="num"></td>
        </tr>`;
      }

      rowNum++;
      const isNCC = r.documentType === 'NCC';
      const isNDC = r.documentType === 'NDC';
      const isFactura = !isNCC && !isNDC;
      return `<tr>
        <td class="fit">${rowNum}</td>
        <td class="fit">${fecha}</td>
        <td class="fit">${r.supplierRif || ''}</td>
        <td>${r.supplierName || ''}</td>
        <td class="fit">${isFactura ? (r.supplierInvoiceNumber || '') : ''}</td>
        <td class="fit">${r.supplierSerie || ''}</td>
        <td class="fit">${r.supplierControlNumber || ''}</td>
        <td class="fit">${r.affectedDocNumber || ''}</td>
        <td class="fit">${isNDC ? (r.supplierInvoiceNumber || '') : ''}</td>
        <td class="fit">${isNCC ? (r.supplierInvoiceNumber || '') : ''}</td>
        <td class="fit">01 - reg</td>
        <td class="num">${fmtNum(r.totalBs)}</td>
        <td class="num">${fmtNum(r.exemptAmountBs)}</td>
        <td class="num">${fmtNum(r.taxableBaseBs)}</td>
        <td class="fit">${r.taxableBaseBs ? '16,00' : ''}</td>
        <td class="num">${fmtNum(r.ivaAmountBs)}</td>
        <td class="num"></td>
        <td class="fit"></td>
        <td class="num"></td>
      </tr>`;
    }).join('');

    const t = totales || { exemptAmountBs: 0, taxableBaseBs: 0, ivaAmountBs: 0, retentionAmountBs: 0, totalBs: 0 };
    const totalesRow = totales ? `
      <tr class="totales">
        <td colspan="11"></td>
        <td class="num"><strong>${formatVe(t.totalBs)}</strong></td>
        <td class="num"><strong>${formatVe(t.exemptAmountBs)}</strong></td>
        <td class="num"><strong>${formatVe(t.taxableBaseBs)}</strong></td>
        <td></td>
        <td class="num"><strong>${formatVe(t.ivaAmountBs)}</strong></td>
        <td class="num"><strong>${formatVe(t.retentionAmountBs)}</strong></td>
        <td></td>
        <td></td>
      </tr>
    ` : '';

    const summaryPage = `
      <table class="resumen" style="margin-top:20px;">
        <tr>
          <td colspan="2"></td>
          <td class="lbl">Base Imponible</td>
          <td class="lbl">Cr&eacute;dito Fiscal</td>
          <td class="lbl">Iva retenido por<br/>el comprador</td>
        </tr>
        <tr>
          <td colspan="2" class="lbl">Total compras internas no gravadas</td>
          <td class="num">${formatVe(t.exemptAmountBs)}</td>
          <td></td><td></td>
        </tr>
        <tr>
          <td colspan="2" class="lbl">Suma de las compras de importaci&oacute;n</td>
          <td></td><td></td><td></td>
        </tr>
        <tr>
          <td colspan="2" class="lbl">Suma de las compras internas afecta solo Alicuota General</td>
          <td class="num">${formatVe(t.taxableBaseBs)}</td>
          <td class="num">${formatVe(t.ivaAmountBs)}</td>
          <td class="num">${fmtNum(t.retentionAmountBs)}</td>
        </tr>
        <tr>
          <td colspan="2" class="lbl">Suma de las compras internas afecta solo Alicuota General + Adicional</td>
          <td class="num">0,00</td><td class="num">0,00</td><td></td>
        </tr>
        <tr>
          <td colspan="2" class="lbl">Suma de las compras internas afecta solo Alicuota Reducida</td>
          <td class="num">0,00</td><td class="num">0,00</td><td></td>
        </tr>
        <tr>
          <td colspan="2" class="lbl">Total IGTF</td>
          <td class="num">0,00</td><td class="num">0,00</td><td></td>
        </tr>
        <tr class="subtotal">
          <td colspan="2"></td>
          <td class="num"><strong>${formatVe(t.taxableBaseBs + t.exemptAmountBs)}</strong></td>
          <td class="num"><strong>${formatVe(t.ivaAmountBs)}</strong></td>
          <td class="num"><strong>${fmtNum(t.retentionAmountBs)}</strong></td>
        </tr>
        <tr><td colspan="5" style="height:10px;border:none;"></td></tr>
        <tr>
          <td colspan="2" class="lbl">Compras internas afectas solo alicuota general periodos anteriores</td>
          <td></td><td></td><td></td>
        </tr>
        <tr>
          <td colspan="2" class="lbl">Compras internas afectas en alicuota Gral. + Adic. periodos anteriores</td>
          <td></td><td></td><td></td>
        </tr>
        <tr>
          <td colspan="2" class="lbl">Compras internas afectas en alicuota reducida periodos anteriores</td>
          <td></td><td></td><td></td>
        </tr>
        <tr><td colspan="5" style="height:10px;border:none;"></td></tr>
        <tr>
          <td colspan="2" class="lbl">Contribuyente</td>
          <td class="num">${formatVe(t.taxableBaseBs)}</td>
          <td class="num">${formatVe(t.ivaAmountBs)}</td>
          <td></td>
        </tr>
        <tr>
          <td colspan="2" class="lbl">No contribuyente</td>
          <td></td><td></td><td></td>
        </tr>
      </table>
    `;

    printWin.document.write(`<!DOCTYPE html>
    <html>
    <head>
      <title>Libro de Compras - ${periodoStr}</title>
      <style>
        @page { size: legal landscape; margin: 8mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 6.5pt; color: #000; margin: 0; padding: 0; }
        .header { text-align: center; margin-bottom: 6px; position: relative; }
        .header h1 { font-size: 10pt; margin: 0; font-weight: bold; }
        .header .rif { font-size: 8pt; margin: 1px 0; }
        .header .address { font-size: 7pt; margin: 1px 0; }
        .header h2 { font-size: 9pt; margin: 4px 0 2px; font-weight: bold; }
        .header-right { position: absolute; top: 0; right: 0; text-align: right; font-size: 7pt; }
        .header-right .label { font-weight: bold; display: inline-block; width: 50px; text-align: right; }
        table.main { width: 100%; border-collapse: collapse; }
        table.main th, table.main td { border: 0.5px solid #999; padding: 1px 2px; text-align: left; font-size: 6pt; }
        table.main th { background: #f0f0f0; font-size: 5.5pt; text-align: center; vertical-align: bottom; }
        table.main th.group { background: #e0e0e0; text-align: center; font-weight: bold; border-bottom: 1.5px solid #333; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        table.main th.fit, table.main td.fit { width: 1px; white-space: nowrap; }
        .totales td { background: #f0f0f0; border-top: 1.5px solid #333; }
        .footer { font-size: 6pt; color: #888; margin-top: 4px; }
        table.resumen { border-collapse: collapse; margin: 15px 0; width: auto; page-break-inside: avoid; break-inside: avoid; }
        table.resumen tr { page-break-inside: avoid; break-inside: avoid; }
        table.resumen td { border: 0.5px solid #999; padding: 2px 6px; font-size: 6.5pt; }
        table.resumen .lbl { text-align: left; font-weight: normal; }
        table.resumen .num { text-align: right; }
        table.resumen .subtotal td { border-top: 1.5px solid #333; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${companyName.toUpperCase()}</h1>
        ${companyRif ? `<div class="rif">RIF: ${companyRif}</div>` : ''}
        ${companyAddress ? `<div class="address">${companyAddress.toUpperCase()}</div>` : ''}
        <h2>LIBRO DE COMPRAS</h2>
        <div class="header-right">
          <div><span class="label">Desde</span>&nbsp;&nbsp;${from.toLocaleDateString('es-VE')}</div>
          <div><span class="label">Hasta</span>&nbsp;&nbsp;${to.toLocaleDateString('es-VE')}</div>
        </div>
      </div>
      <table class="main">
        <thead>
          <tr>
            <th rowspan="2" class="fit">Oper.<br/>Nro.</th>
            <th rowspan="2" class="fit">Fecha<br/>documento</th>
            <th rowspan="2" class="fit">N&deg; Rif</th>
            <th rowspan="2">Nombre o Raz&oacute;n Social</th>
            <th rowspan="2" class="fit">Factura</th>
            <th rowspan="2" class="fit">Serie</th>
            <th rowspan="2" class="fit">Fiscal</th>
            <th rowspan="2" class="fit">Numero de<br/>Factura<br/>Afectada</th>
            <th rowspan="2" class="fit">Numero<br/>Nota<br/>Debito</th>
            <th rowspan="2" class="fit">Numero<br/>Nota<br/>Credito</th>
            <th rowspan="2" class="fit">Tipo<br/>de<br/>Transac.</th>
            <th rowspan="2">Total compras<br/>Incluyendo<br/>el IVA</th>
            <th rowspan="2">Compras<br/>Internas<br/>No Gravadas</th>
            <th class="group" colspan="3">COMPRAS INTERNAS O<br/>IMPORTACIONES GRAVADAS</th>
            <th rowspan="2">Iva Retenido<br/>(Por el<br/>Comprador)</th>
            <th rowspan="2" class="fit">Comp. de<br/>Retencion</th>
            <th rowspan="2" class="fit">IVA<br/>Percibido</th>
          </tr>
          <tr>
            <th>Base<br/>imponible<br/>16%</th>
            <th>%<br/>Alicuota</th>
            <th>Impuesto<br/>iva 16%</th>
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
                  <th className="text-left px-2 py-2.5 text-slate-400 font-medium">Serie</th>
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
                    <td colSpan={15} className="text-center py-10 text-slate-500">
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
                        <td className="px-2 py-2 text-slate-300 font-mono text-[11px]">
                          {(entry.isRetentionLine || entry.isIslrRetentionLine) ? '' : (entry.supplierSerie || '')}
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
                        <td colSpan={7} className="px-2 py-2.5 text-slate-100 font-bold">
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
