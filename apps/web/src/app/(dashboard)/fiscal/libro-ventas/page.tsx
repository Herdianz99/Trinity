'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Loader2, FileDown, Search, Plus, Pencil, Trash2, X, Save, Calendar,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface SalesBookEntry {
  id: string;
  invoiceId: string | null;
  invoice: { id: string; number: string } | null;
  entryDate: string;
  invoiceNumber: string;
  controlNumber: string | null;
  customerName: string;
  customerRif: string | null;
  exemptAmountBs: number;
  taxableBaseBs: number;
  ivaAmountBs: number;
  igtfAmountBs: number;
  totalBs: number;
  isManual: boolean;
  isRetentionLine: boolean;
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
  igtfAmountBs: number;
  totalBs: number;
}

interface PdfSummary {
  ventasExentas: number;
  baseImponibleGeneral: number;
  debitoFiscalGeneral: number;
  totalBaseImponible: number;
  totalDebitoFiscal: number;
  totalIgtf: number;
  totalVentas: number;
}

interface ZDisplayRow {
  id: string;
  type: 'ventas' | 'devoluciones' | 'debitos' | 'retencion';
  reportDate: string;
  zNumber: number | null;
  machineSerial: string;
  cashRegister: { id: string; name: string; code: string } | null;
  fromDoc: string;
  toDoc: string;
  docCount: number;
  exemptBs: number;
  taxBaseBs: number;
  taxBs: number;
  igtfBs: number;
  totalBs: number;
  isManual: boolean;
  createdBy: { id: string; name: string };
  zReportId: string | null;
  customerName?: string;
  customerRif?: string;
}

interface ZTotales {
  totalRows: number;
  exemptBs: number;
  taxBaseBs: number;
  taxBs: number;
  igtfBs: number;
  totalBs: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  invoiceNumber: '',
  controlNumber: '',
  customerName: '',
  customerRif: '',
  exemptAmountBs: 0,
  taxableBaseBs: 0,
  ivaAmountBs: 0,
  igtfAmountBs: 0,
  totalBs: 0,
  notes: '',
};

type EntryForm = typeof EMPTY_FORM;

const EMPTY_Z_FORM = {
  zNumber: 0,
  reportDate: '',
  machineSerial: '',
  cashRegisterId: '',
  // Ventas
  salesExemptBs: 0,
  salesTaxBase1Bs: 0,
  salesTax1Bs: 0,
  salesTotalBs: 0,
  igtfSalesTaxBs: 0,
  firstInvoiceNumber: '',
  lastInvoiceNumber: '',
  // NC
  ncExemptBs: 0,
  ncTaxBase1Bs: 0,
  ncTax1Bs: 0,
  ncTotalBs: 0,
  igtfNcTaxBs: 0,
  firstCreditNoteNumber: '',
  lastCreditNoteNumber: '',
  // Shared
  notes: '',
};

type ZForm = typeof EMPTY_Z_FORM;

// ── Component ────────────────────────────────────────────────────────────────

export default function LibroVentasPage() {
  const now = new Date();

  // Tab state
  const [activeTab, setActiveTab] = useState<'detallado' | 'reportes-z'>('detallado');

  // Date range state (shared)
  const [fromDate, setFromDate] = useState(toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [toDate, setToDate] = useState(toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), lastDayOfMonth(now.getFullYear(), now.getMonth()))));

  // Detallado state
  const [entries, setEntries] = useState<SalesBookEntry[]>([]);
  const [totales, setTotales] = useState<Totales | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  // Detallado modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EntryForm>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // Z reports state
  const [zRows, setZRows] = useState<ZDisplayRow[]>([]);
  const [zRawReports, setZRawReports] = useState<any[]>([]);
  const [zTotales, setZTotales] = useState<ZTotales | null>(null);
  const [zLoading, setZLoading] = useState(false);
  const [zLoaded, setZLoaded] = useState(false);

  // Z reports modal
  const [zModalOpen, setZModalOpen] = useState(false);
  const [zEditingId, setZEditingId] = useState<string | null>(null);
  const [zForm, setZForm] = useState<ZForm>({ ...EMPTY_Z_FORM });
  const [zSaving, setZSaving] = useState(false);
  const [zEntryType, setZEntryType] = useState<'ventas' | 'nc'>('ventas');

  // Máquinas fiscales (series con fiscalMachineSerial)
  const [fiscalMachines, setFiscalMachines] = useState<{ serial: string; name: string; cashRegisterId: string | null }[]>([]);

  useEffect(() => { document.title = 'Libro de Ventas | Trinity ERP'; }, []);

  useEffect(() => {
    fetch('/api/proxy/series')
      .then(r => r.ok ? r.json() : [])
      .then((series: any[]) => {
        const machines = series
          .filter((s: any) => s.fiscalMachineSerial && s.isFiscal)
          .map((s: any) => ({
            serial: s.fiscalMachineSerial,
            name: s.name + (s.cashRegister ? ` (${s.cashRegister.name})` : ''),
            cashRegisterId: s.cashRegisterId,
          }));
        setFiscalMachines(machines);
      })
      .catch(() => {});
  }, []);

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

  // ── Fetch detallado ───────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/proxy/sales-book?from=${fromDate}&to=${toDate}`);
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

  // ── Fetch Z reports ───────────────────────────────────────────────────────

  const fetchZData = useCallback(async () => {
    setZLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/proxy/z-reports?from=${fromDate}&to=${toDate}`);
      if (!res.ok) throw new Error('Error al cargar reportes Z');
      const data = await res.json();
      setZRows(data.rows || []);
      setZRawReports(data.zReports || []);
      setZTotales(data.totales || null);
      setZLoaded(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setZLoading(false);
    }
  }, [fromDate, toDate]);

  // ── Handle generate (calls the right fetch based on tab) ──────────────

  function handleGenerate() {
    if (activeTab === 'detallado') {
      fetchData();
    } else {
      fetchZData();
    }
  }

  // ── Detallado modal handlers ──────────────────────────────────────────────

  function openCreateModal() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, entryDate: toLocalDateStr(now) });
    setModalOpen(true);
  }

  function openEditModal(entry: SalesBookEntry) {
    setEditingId(entry.id);
    setForm({
      entryDate: entry.entryDate ? entry.entryDate.substring(0, 10) : '',
      invoiceNumber: entry.invoiceNumber,
      controlNumber: entry.controlNumber || '',
      customerName: entry.customerName,
      customerRif: entry.customerRif || '',
      exemptAmountBs: entry.exemptAmountBs,
      taxableBaseBs: entry.taxableBaseBs,
      ivaAmountBs: entry.ivaAmountBs,
      igtfAmountBs: entry.igtfAmountBs,
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
        igtfAmountBs: Number(form.igtfAmountBs) || 0,
        totalBs: Number(form.totalBs) || 0,
      };

      const url = editingId
        ? `/api/proxy/sales-book/${editingId}`
        : '/api/proxy/sales-book';
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
    if (!confirm('¿Eliminar esta entrada del libro de ventas?')) return;
    try {
      const res = await fetch(`/api/proxy/sales-book/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al eliminar');
      }
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  }

  // ── Z modal handlers ──────────────────────────────────────────────────────

  function openZCreateModal() {
    setZEditingId(null);
    const defaultMachine = fiscalMachines.length === 1 ? fiscalMachines[0] : null;
    setZForm({
      ...EMPTY_Z_FORM,
      reportDate: toLocalDateStr(now),
      machineSerial: defaultMachine?.serial || '',
      cashRegisterId: defaultMachine?.cashRegisterId || '',
    });
    setZEntryType('ventas');
    setZModalOpen(true);
  }

  function openZEditModal(zReportId: string) {
    const zr = zRawReports.find((z: any) => z.id === zReportId);
    if (!zr) return;
    setZEditingId(zr.id);
    const sExempt = zr.salesExemptBs || 0;
    const sBase = zr.salesTaxBase1Bs || 0;
    const sTax = zr.salesTax1Bs || 0;
    const ncExempt = zr.ncExemptBs || 0;
    const ncBase = zr.ncTaxBase1Bs || 0;
    const ncTax = zr.ncTax1Bs || 0;
    setZForm({
      zNumber: zr.zNumber,
      reportDate: zr.reportDate ? zr.reportDate.slice(0, 10) : '',
      machineSerial: zr.machineSerial || '',
      cashRegisterId: zr.cashRegisterId || '',
      salesExemptBs: sExempt,
      salesTaxBase1Bs: sBase,
      salesTax1Bs: sTax,
      salesTotalBs: +(sExempt + sBase + sTax + (zr.igtfSalesTaxBs || 0)).toFixed(2),
      igtfSalesTaxBs: zr.igtfSalesTaxBs || 0,
      firstInvoiceNumber: zr.firstInvoiceNumber || '',
      lastInvoiceNumber: zr.lastInvoiceNumber || '',
      ncExemptBs: ncExempt,
      ncTaxBase1Bs: ncBase,
      ncTax1Bs: ncTax,
      ncTotalBs: +(ncExempt + ncBase + ncTax + (zr.igtfNcTaxBs || 0)).toFixed(2),
      igtfNcTaxBs: zr.igtfNcTaxBs || 0,
      firstCreditNoteNumber: zr.firstCreditNoteNumber || '',
      lastCreditNoteNumber: zr.lastCreditNoteNumber || '',
      notes: zr.notes || '',
    });
    setZEntryType('ventas');
    setZModalOpen(true);
  }

  function closeZModal() {
    setZModalOpen(false);
    setZEditingId(null);
    setZForm({ ...EMPTY_Z_FORM });
    setZEntryType('ventas');
  }

  function updateZForm(field: keyof ZForm, value: string | number) {
    setZForm(prev => {
      const next = { ...prev, [field]: value };
      // Auto-recalcular totales cuando cambian los montos (a menos que se esté editando el total directamente)
      if (['salesExemptBs', 'salesTaxBase1Bs', 'salesTax1Bs', 'igtfSalesTaxBs'].includes(field)) {
        next.salesTotalBs = +(Number(next.salesExemptBs) + Number(next.salesTaxBase1Bs) + Number(next.salesTax1Bs) + Number(next.igtfSalesTaxBs)).toFixed(2);
      }
      if (['ncExemptBs', 'ncTaxBase1Bs', 'ncTax1Bs', 'igtfNcTaxBs'].includes(field)) {
        next.ncTotalBs = +(Number(next.ncExemptBs) + Number(next.ncTaxBase1Bs) + Number(next.ncTax1Bs) + Number(next.igtfNcTaxBs)).toFixed(2);
      }
      return next;
    });
  }

  function handleMachineChange(serial: string) {
    const machine = fiscalMachines.find(m => m.serial === serial);
    setZForm(prev => ({
      ...prev,
      machineSerial: serial,
      cashRegisterId: machine?.cashRegisterId || '',
    }));
  }

  async function handleZSave() {
    setZSaving(true);
    try {
      const payload: any = {
        zNumber: Number(zForm.zNumber) || 0,
        reportDate: zForm.reportDate,
        machineSerial: zForm.machineSerial,
        cashRegisterId: zForm.cashRegisterId || undefined,
        // Ventas
        salesExemptBs: Number(zForm.salesExemptBs) || 0,
        salesTaxBase1Bs: Number(zForm.salesTaxBase1Bs) || 0,
        salesTax1Bs: Number(zForm.salesTax1Bs) || 0,
        igtfSalesTaxBs: Number(zForm.igtfSalesTaxBs) || 0,
        firstInvoiceNumber: zForm.firstInvoiceNumber || undefined,
        lastInvoiceNumber: zForm.lastInvoiceNumber || undefined,
        // NC
        ncExemptBs: Number(zForm.ncExemptBs) || 0,
        ncTaxBase1Bs: Number(zForm.ncTaxBase1Bs) || 0,
        ncTax1Bs: Number(zForm.ncTax1Bs) || 0,
        igtfNcTaxBs: Number(zForm.igtfNcTaxBs) || 0,
        firstCreditNoteNumber: zForm.firstCreditNoteNumber || undefined,
        lastCreditNoteNumber: zForm.lastCreditNoteNumber || undefined,
        // Si firstInvoiceNumber/firstCreditNoteNumber van vacios, el backend los auto-deriva del Z anterior
        isManual: true,
        notes: zForm.notes || undefined,
      };

      const url = zEditingId
        ? `/api/proxy/z-reports/${zEditingId}`
        : '/api/proxy/z-reports';
      const method = zEditingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al guardar');
      }

      closeZModal();
      fetchZData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setZSaving(false);
    }
  }

  async function handleZDelete(id: string) {
    if (!confirm('¿Eliminar este Reporte Z?')) return;
    try {
      const res = await fetch(`/api/proxy/z-reports/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al eliminar');
      }
      fetchZData();
    } catch (err: any) {
      setError(err.message);
    }
  }

  // ── PDF Export (detallado) ────────────────────────────────────────────────

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
      const pdfRes = await fetch(`/api/proxy/sales-book/pdf?from=${fromDate}&to=${toDate}`);
      const pdfData = await pdfRes.json();
      summary = pdfData.summary;
    } catch {}

    const printWin = window.open('', '_blank');
    if (!printWin) return;

    const from = new Date(fromDate + 'T00:00:00');
    const to = new Date(toDate + 'T00:00:00');
    const periodoStr = `${from.toLocaleDateString('es-VE')} al ${to.toLocaleDateString('es-VE')}`;

    const tableRows = entries.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${r.entryDate ? new Date(r.entryDate).toLocaleDateString('es-VE') : ''}</td>
        <td>${r.controlNumber || ''}</td>
        <td>${r.invoiceNumber}</td>
        <td>${r.customerName}</td>
        <td>${r.customerRif || 'S/R'}</td>
        <td class="num">${formatVe(r.exemptAmountBs)}</td>
        <td class="num">${formatVe(r.taxableBaseBs)}</td>
        <td class="num">${formatVe(r.ivaAmountBs)}</td>
        <td class="num">${formatVe(r.igtfAmountBs)}</td>
        <td class="num total">${formatVe(r.totalBs)}</td>
      </tr>
    `).join('');

    const totalesRow = totales ? `
      <tr class="totales">
        <td colspan="6"><strong>TOTALES</strong></td>
        <td class="num"><strong>${formatVe(totales.exemptAmountBs)}</strong></td>
        <td class="num"><strong>${formatVe(totales.taxableBaseBs)}</strong></td>
        <td class="num"><strong>${formatVe(totales.ivaAmountBs)}</strong></td>
        <td class="num"><strong>${formatVe(totales.igtfAmountBs)}</strong></td>
        <td class="num total"><strong>${formatVe(totales.totalBs)}</strong></td>
      </tr>
    ` : '';

    const summaryPage = summary ? `
      <div class="page-break"></div>
      <div class="header">
        <h1>${companyName}</h1>
        ${companyRif ? `<p>RIF: ${companyRif}</p>` : ''}
        <h2>RESUMEN FISCAL DEL LIBRO DE VENTAS</h2>
        <p>Per&iacute;odo: ${periodoStr}</p>
      </div>
      <div class="summary">
        <table class="summary-table">
          <tbody>
            <tr><td class="label">Ventas internas exentas:</td><td class="value">Bs ${formatVe(summary.ventasExentas)}</td></tr>
            <tr><td class="label">Base imponible general (16%):</td><td class="value">Bs ${formatVe(summary.baseImponibleGeneral)}</td></tr>
            <tr><td class="label">D&eacute;bito fiscal (16%):</td><td class="value">Bs ${formatVe(summary.debitoFiscalGeneral)}</td></tr>
            <tr class="separator"><td colspan="2"><hr/></td></tr>
            <tr class="highlight"><td class="label">Total base imponible:</td><td class="value">Bs ${formatVe(summary.totalBaseImponible)}</td></tr>
            <tr class="highlight"><td class="label">Total d&eacute;bito fiscal:</td><td class="value">Bs ${formatVe(summary.totalDebitoFiscal)}</td></tr>
            <tr><td class="label">Total IGTF:</td><td class="value">Bs ${formatVe(summary.totalIgtf)}</td></tr>
            <tr class="grand-total"><td class="label">Total ventas del per&iacute;odo:</td><td class="value">Bs ${formatVe(summary.totalVentas)}</td></tr>
          </tbody>
        </table>
      </div>
    ` : '';

    printWin.document.write(`<!DOCTYPE html>
    <html>
    <head>
      <title>Libro de Ventas - ${periodoStr}</title>
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
        <h2>LIBRO DE VENTAS</h2>
        <p>Per&iacute;odo: ${periodoStr}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>N&deg;</th><th>Fecha</th><th>N&deg; Control</th><th>N&deg; Factura</th>
            <th>Cliente</th><th>RIF</th>
            <th>Exento Bs</th><th>Base Imponible Bs</th><th>IVA Bs</th>
            <th>IGTF Bs</th><th>Total Bs</th>
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

  // ── PDF Export (Libro de Ventas - Formato SENIAT) ─────────────────────────

  async function exportZPdf() {
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

    // Cargar ambos: entradas detalladas + Z reports para combinarlos
    let allEntries: SalesBookEntry[] = entries;
    let allZRows: ZDisplayRow[] = zRows;
    try {
      if (!entries.length) {
        const res = await fetch(`/api/proxy/sales-book?from=${fromDate}&to=${toDate}`);
        const data = await res.json();
        allEntries = data.entries || [];
      }
      if (!zRows.length) {
        const res = await fetch(`/api/proxy/z-reports?from=${fromDate}&to=${toDate}`);
        const data = await res.json();
        allZRows = data.rows || [];
      }
    } catch {}

    const printWin = window.open('', '_blank');
    if (!printWin) return;

    const fromDt = new Date(fromDate + 'T00:00:00');
    const toDt = new Date(toDate + 'T00:00:00');
    const fromStr = fromDt.toLocaleDateString('es-VE');
    const toStr = toDt.toLocaleDateString('es-VE');

    // Combinar entries + Z rows en un array unificado, ordenado por fecha
    interface UnifiedRow {
      date: string;
      rif: string;
      name: string;
      machineSerial: string;
      zNumber: string;
      compInicial: string;
      compFinal: string;
      factura: string;
      serie: string;
      fiscal: string;
      numFactAfectada: string;
      numND: string;
      numNC: string;
      tipoTransac: string;
      totalVentas: number;
      ventasNoGravadas: number;
      baseImponible16: number;
      alicuota: string;
      impuestoIva16: number;
      ivaRetenido: number;
      compRetencion: string;
      ivaPercibido: number;
      cont: string;
    }

    const rows: UnifiedRow[] = [];

    // Agregar entradas detalladas (facturas individuales, retenciones)
    for (const e of allEntries) {
      // Retenciones se manejan aparte
      if (e.isRetentionLine) {
        rows.push({
          date: e.entryDate,
          rif: e.customerRif || '',
          name: e.customerName || '',
          machineSerial: '', zNumber: '',
          compInicial: '', compFinal: '',
          factura: e.invoiceNumber || '',
          serie: '', fiscal: e.controlNumber || '',
          numFactAfectada: '',
          numND: '', numNC: '',
          tipoTransac: '01 - reg',
          totalVentas: 0,
          ventasNoGravadas: 0,
          baseImponible16: 0,
          alicuota: '',
          impuestoIva16: 0,
          ivaRetenido: e.ivaAmountBs || 0,
          compRetencion: e.notes || '',
          ivaPercibido: 0,
          cont: 'NO',
        });
        continue;
      }
      rows.push({
        date: e.entryDate,
        rif: e.customerRif || '',
        name: e.customerName || '',
        machineSerial: '', zNumber: '',
        compInicial: '', compFinal: '',
        factura: e.invoiceNumber || '',
        serie: '', fiscal: e.controlNumber || '',
        numFactAfectada: '',
        numND: '', numNC: '',
        tipoTransac: '01 - reg',
        totalVentas: e.totalBs,
        ventasNoGravadas: e.exemptAmountBs,
        baseImponible16: e.taxableBaseBs,
        alicuota: e.taxableBaseBs ? '16,00' : '',
        impuestoIva16: e.ivaAmountBs,
        ivaRetenido: 0,
        compRetencion: '',
        ivaPercibido: 0,
        cont: 'NO',
      });
    }

    // Agregar Z rows
    for (const z of allZRows) {
      const isNC = z.type === 'devoluciones';
      rows.push({
        date: z.reportDate,
        rif: '', name: '',
        machineSerial: z.machineSerial || '',
        zNumber: z.zNumber != null ? String(z.zNumber).padStart(8, '0') : '',
        compInicial: z.fromDoc || '',
        compFinal: z.toDoc || '',
        factura: '', serie: '', fiscal: '',
        numFactAfectada: '',
        numND: z.type === 'debitos' ? z.toDoc || '' : '',
        numNC: isNC ? z.toDoc || '' : '',
        tipoTransac: '01 - reg',
        totalVentas: z.totalBs,
        ventasNoGravadas: z.exemptBs,
        baseImponible16: z.taxBaseBs,
        alicuota: '16,00',
        impuestoIva16: z.taxBs,
        ivaRetenido: 0,
        compRetencion: '',
        ivaPercibido: 0,
        cont: 'NO',
      });
    }

    // Ordenar por fecha
    rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calcular totales
    let tTotalVentas = 0, tNoGravadas = 0, tBase16 = 0, tIva16 = 0, tIvaRetenido = 0, tIvaPercibido = 0;
    for (const r of rows) {
      tTotalVentas += r.totalVentas;
      tNoGravadas += r.ventasNoGravadas;
      tBase16 += r.baseImponible16;
      tIva16 += r.impuestoIva16;
      tIvaRetenido += r.ivaRetenido;
      tIvaPercibido += r.ivaPercibido;
    }

    const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('es-VE') : '';
    const fmtNum = (n: number) => n ? formatVe(n) : '';

    // Generar filas del tabla
    const tableRows = rows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="nowrap">${fmtDate(r.date)}</td>
        <td>${r.rif}</td>
        <td>${r.name}</td>
        <td>${r.machineSerial}</td>
        <td>${r.zNumber}</td>
        <td>${r.compInicial}</td>
        <td>${r.compFinal}</td>
        <td>${r.factura}</td>
        <td>${r.serie}</td>
        <td>${r.fiscal}</td>
        <td>${r.numFactAfectada}</td>
        <td>${r.numND}</td>
        <td>${r.numNC}</td>
        <td class="nowrap">${r.tipoTransac}</td>
        <td class="num">${fmtNum(r.totalVentas)}</td>
        <td class="num">${fmtNum(r.ventasNoGravadas)}</td>
        <td class="num">${fmtNum(r.baseImponible16)}</td>
        <td>${r.alicuota}</td>
        <td class="num">${fmtNum(r.impuestoIva16)}</td>
        <td class="num">${fmtNum(r.ivaRetenido)}</td>
        <td>${r.compRetencion}</td>
        <td class="num">${fmtNum(r.ivaPercibido)}</td>
        <td>${r.cont}</td>
      </tr>
    `).join('');

    // Resumen SENIAT al final
    const summarySection = `
      <tr class="totales">
        <td colspan="15"></td>
        <td class="num"><strong>${formatVe(tTotalVentas)}</strong></td>
        <td class="num"><strong>${formatVe(tNoGravadas)}</strong></td>
        <td class="num"><strong>${formatVe(tBase16)}</strong></td>
        <td></td>
        <td class="num"><strong>${formatVe(tIva16)}</strong></td>
        <td class="num"><strong>${fmtNum(tIvaRetenido)}</strong></td>
        <td></td>
        <td class="num"><strong>${fmtNum(tIvaPercibido)}</strong></td>
        <td></td>
      </tr>
    `;

    // Cuadro resumen SENIAT
    const resumenSeniat = `
      <table class="resumen" style="margin-top:20px;">
        <tr>
          <td colspan="2"></td>
          <td class="lbl">Base Imponible</td>
          <td class="lbl">D&eacute;bito Fiscal</td>
          <td class="lbl">Iva retenido por<br/>el comprador</td>
          <td class="lbl">Iva de ventas<br/>percibido</td>
        </tr>
        <tr>
          <td colspan="2" class="lbl">Total: Ventas internas no gravadas</td>
          <td class="num">${formatVe(tNoGravadas)}</td>
          <td></td><td></td><td></td>
        </tr>
        <tr>
          <td colspan="2" class="lbl">Suma de las ventas de exportaci&oacute;n</td>
          <td></td><td></td><td></td><td></td>
        </tr>
        <tr>
          <td colspan="2" class="lbl">Suma de las ventas internas afecta solo Alicuota General</td>
          <td class="num">${formatVe(tBase16)}</td>
          <td class="num">${formatVe(tIva16)}</td>
          <td></td>
          <td class="num">${fmtNum(tIvaPercibido)}</td>
        </tr>
        <tr>
          <td colspan="2" class="lbl">Suma de las ventas internas afecta solo Alicuota General + Adicional</td>
          <td class="num">0,00</td>
          <td class="num">0,00</td>
          <td></td><td></td>
        </tr>
        <tr>
          <td colspan="2" class="lbl">Suma de las ventas internas afecta solo Alicuota Reducida</td>
          <td class="num">0,00</td>
          <td class="num">0,00</td>
          <td></td>
          <td>(+)</td>
        </tr>
        <tr class="subtotal">
          <td colspan="2"></td>
          <td class="num"><strong>${formatVe(tBase16 + tNoGravadas)}</strong></td>
          <td class="num"><strong>${formatVe(tIva16)}</strong></td>
          <td></td>
          <td class="num"><strong>${fmtNum(tIvaPercibido)}</strong></td>
        </tr>
        <tr><td colspan="6" style="height:10px;border:none;"></td></tr>
        <tr>
          <td colspan="2" class="lbl">Ventas internas afectas solo alicuota general periodos anteriores</td>
          <td></td><td></td><td></td><td></td>
        </tr>
        <tr>
          <td colspan="2" class="lbl">Ventas internas afectas en alicuota Gral. + Adic. periodos anteriores</td>
          <td></td><td></td><td></td><td></td>
        </tr>
        <tr>
          <td colspan="2" class="lbl">Ventas internas afectas en alicuota reducida periodos anteriores</td>
          <td></td><td></td><td></td><td></td>
        </tr>
        <tr><td colspan="6" style="height:10px;border:none;"></td></tr>
        <tr>
          <td colspan="2" class="lbl">Contribuyente</td>
          <td class="num">${formatVe(tBase16)}</td>
          <td class="num">${formatVe(tIva16)}</td>
          <td></td><td></td>
        </tr>
        <tr>
          <td colspan="2" class="lbl">No contribuyente</td>
          <td></td><td></td><td></td><td></td>
        </tr>
      </table>
    `;

    // Calcular total de paginas (estimado)
    const rowsPerPage = 40;
    const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage) + 1);

    printWin.document.write(`<!DOCTYPE html>
    <html>
    <head>
      <title>Libro de Ventas - ${fromStr} al ${toStr}</title>
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
        .nowrap { white-space: nowrap; }
        .totales td { background: #f0f0f0; border-top: 1.5px solid #333; }
        .footer { font-size: 6pt; color: #888; margin-top: 4px; }
        table.resumen { border-collapse: collapse; margin: 15px 0; width: auto; }
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
        <h2>LIBRO DE VENTAS</h2>
        <div class="header-right">
          <div><span class="label">Desde</span>&nbsp;&nbsp;${fromStr}</div>
          <div><span class="label">Hasta</span>&nbsp;&nbsp;${toStr}</div>
          <div><span class="label">Pagina</span>&nbsp;&nbsp;1</div>
        </div>
      </div>

      <table class="main">
        <thead>
          <tr>
            <th rowspan="2">Oper.<br/>Nro.</th>
            <th rowspan="2">Fecha<br/>documento</th>
            <th rowspan="2">N&deg; Rif</th>
            <th rowspan="2">Nombre o Raz&oacute;n Social</th>
            <th rowspan="2">Serial Maquina<br/>Fiscal</th>
            <th rowspan="2">N&uacute;mero<br/>Reporte Z</th>
            <th rowspan="2">Comprobante<br/>Inicial</th>
            <th rowspan="2">Comprobante<br/>Final</th>
            <th rowspan="2">Factura</th>
            <th rowspan="2">Serie</th>
            <th rowspan="2">Fiscal</th>
            <th rowspan="2">Numero de<br/>Factura<br/>Afectada</th>
            <th rowspan="2">Numero<br/>Nota<br/>Debito</th>
            <th rowspan="2">Numero<br/>Nota<br/>Credito</th>
            <th rowspan="2">Tipo<br/>de<br/>Transac.</th>
            <th rowspan="2">Total ventas<br/>Incluyendo<br/>el IVA</th>
            <th rowspan="2">Ventas<br/>Internas<br/>No Gravadas</th>
            <th class="group" colspan="3">VENTAS INTERNAS O<br/>EXPORTACIONES GRAVADAS</th>
            <th rowspan="2">Iva Retenido<br/>(Por el<br/>Comprador)</th>
            <th rowspan="2">Comp. de<br/>Retencion</th>
            <th rowspan="2">IVA<br/>Percibido</th>
            <th rowspan="2">CONT</th>
          </tr>
          <tr>
            <th>Base<br/>imponible<br/>16%</th>
            <th>%<br/>Alicuota</th>
            <th>Impuesto<br/>iva 16%</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
          ${summarySection}
        </tbody>
      </table>

      ${resumenSeniat}

      <div class="footer">Documento emitido con Trinity ERP</div>
      <script>window.print();</script>
    </body>
    </html>`);
    printWin.document.close();
  }

  // ── Row type styling helper ───────────────────────────────────────────────

  function zRowClasses(type: string): string {
    switch (type) {
      case 'devoluciones': return 'bg-red-500/5 border-red-500/10';
      case 'retencion': return 'bg-purple-500/5 border-purple-500/10';
      case 'debitos': return 'bg-blue-500/5 border-blue-500/10';
      default: return '';
    }
  }

  function zTypeBadge(type: string) {
    switch (type) {
      case 'ventas':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">VENTAS</span>;
      case 'devoluciones':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">NC</span>;
      case 'debitos':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">ND</span>;
      case 'retencion':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">RET. IVA</span>;
      default:
        return null;
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const isLoading = activeTab === 'detallado' ? loading : zLoading;
  const isLoaded = activeTab === 'detallado' ? loaded : zLoaded;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <BookOpen className="text-emerald-400" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Libro de Ventas</h1>
            <p className="text-sm text-slate-400">Formato SENIAT - Registro de ventas con entradas editables</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('detallado')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'detallado'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
          }`}
        >
          Detallado
        </button>
        <button
          onClick={() => setActiveTab('reportes-z')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'reportes-z'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
          }`}
        >
          Reportes Z
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Period Selector (shared) */}
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
          <button onClick={handleGenerate} disabled={isLoading}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center gap-2 disabled:opacity-50 h-[38px]">
            {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
            Generar
          </button>
        </div>

        {/* Quick period buttons */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-slate-500 self-center mr-1">Rapido:</span>
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

      {/* ════════════════════ TAB: DETALLADO ════════════════════ */}
      {activeTab === 'detallado' && (
        <>
          {/* Action buttons */}
          {loaded && (
            <div className="flex flex-wrap gap-2">
              <button onClick={openCreateModal}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center gap-2">
                <Plus size={16} />
                Agregar entrada manual
              </button>
              {entries.length > 0 && (
                <button onClick={exportPdf}
                  className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-sm flex items-center gap-2">
                  <FileDown size={16} />
                  Exportar PDF
                </button>
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
                      <th className="text-left px-2 py-2.5 text-slate-400 font-medium">Cliente</th>
                      <th className="text-left px-2 py-2.5 text-slate-400 font-medium">RIF</th>
                      <th className="text-right px-2 py-2.5 text-slate-400 font-medium">Exento Bs</th>
                      <th className="text-right px-2 py-2.5 text-slate-400 font-medium">Base Imp. Bs</th>
                      <th className="text-right px-2 py-2.5 text-emerald-400 font-medium">IVA Bs</th>
                      <th className="text-right px-2 py-2.5 text-amber-400 font-medium">IGTF Bs</th>
                      <th className="text-right px-2 py-2.5 text-slate-400 font-medium">Total Bs</th>
                      <th className="text-center px-2 py-2.5 text-slate-400 font-medium w-20">Acc.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="text-center py-10 text-slate-500">
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
                          <tr key={entry.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors group">
                            <td className="px-2 py-2 text-slate-400">{i + 1}</td>
                            <td className="px-2 py-2 text-slate-300">
                              {entry.entryDate ? new Date(entry.entryDate).toLocaleDateString('es-VE') : ''}
                            </td>
                            <td className="px-2 py-2 text-slate-300 font-mono text-[11px]">
                              {entry.controlNumber || '-'}
                            </td>
                            <td className="px-2 py-2 text-slate-200 font-mono text-[11px]">
                              {entry.invoiceNumber}
                            </td>
                            <td className="px-2 py-2 text-slate-200">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate max-w-[160px]">{entry.customerName}</span>
                                {entry.isManual ? (
                                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">MANUAL</span>
                                ) : (
                                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">AUTO</span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-slate-300 font-mono text-[11px]">
                              {entry.customerRif || 'S/R'}
                            </td>
                            <td className="px-2 py-2 text-right text-slate-300 tabular-nums">
                              {formatVe(entry.exemptAmountBs)}
                            </td>
                            <td className="px-2 py-2 text-right text-slate-300 tabular-nums">
                              {formatVe(entry.taxableBaseBs)}
                            </td>
                            <td className="px-2 py-2 text-right text-emerald-400 tabular-nums font-medium">
                              {formatVe(entry.ivaAmountBs)}
                            </td>
                            <td className="px-2 py-2 text-right text-amber-400 tabular-nums">
                              {formatVe(entry.igtfAmountBs)}
                            </td>
                            <td className="px-2 py-2 text-right text-slate-100 font-semibold tabular-nums">
                              {formatVe(entry.totalBs)}
                            </td>
                            <td className="px-2 py-2">
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
                            <td className="px-2 py-2.5 text-right text-emerald-400 font-bold tabular-nums">{formatVe(totales.ivaAmountBs)}</td>
                            <td className="px-2 py-2.5 text-right text-amber-400 font-bold tabular-nums">{formatVe(totales.igtfAmountBs)}</td>
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
        </>
      )}

      {/* ════════════════════ TAB: REPORTES Z ════════════════════ */}
      {activeTab === 'reportes-z' && (
        <>
          {/* Action buttons */}
          {zLoaded && (
            <div className="flex flex-wrap gap-2">
              <button onClick={openZCreateModal}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center gap-2">
                <Plus size={16} />
                Agregar Z manual
              </button>
              {zRows.length > 0 && (
                <button onClick={exportZPdf}
                  className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-sm flex items-center gap-2">
                  <FileDown size={16} />
                  Exportar PDF
                </button>
              )}
            </div>
          )}

          {/* Z Reports Table */}
          {zLoaded && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left px-2 py-2.5 text-slate-400 font-medium w-10">N&deg;</th>
                      <th className="text-left px-2 py-2.5 text-slate-400 font-medium">Fecha</th>
                      <th className="text-left px-2 py-2.5 text-slate-400 font-medium">N&deg; Z</th>
                      <th className="text-left px-2 py-2.5 text-slate-400 font-medium">Serial Maq.</th>
                      <th className="text-left px-2 py-2.5 text-slate-400 font-medium">Tipo</th>
                      <th className="text-left px-2 py-2.5 text-slate-400 font-medium">Desde Doc</th>
                      <th className="text-left px-2 py-2.5 text-slate-400 font-medium">Hasta Doc</th>
                      <th className="text-right px-2 py-2.5 text-slate-400 font-medium">Exento Bs</th>
                      <th className="text-right px-2 py-2.5 text-slate-400 font-medium">Base Imp. Bs</th>
                      <th className="text-right px-2 py-2.5 text-emerald-400 font-medium">Deb. Fiscal Bs</th>
                      <th className="text-right px-2 py-2.5 text-amber-400 font-medium">IGTF Bs</th>
                      <th className="text-right px-2 py-2.5 text-slate-400 font-medium">Total Bs</th>
                      <th className="text-center px-2 py-2.5 text-slate-400 font-medium w-16">Acc.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zRows.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="text-center py-10 text-slate-500">
                          <div className="flex flex-col items-center gap-2">
                            <BookOpen size={32} className="text-slate-600" />
                            <span>No hay reportes Z en este periodo</span>
                            <button onClick={openZCreateModal}
                              className="mt-1 text-emerald-400 hover:text-emerald-300 text-xs flex items-center gap-1">
                              <Plus size={14} /> Agregar Z manual
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <>
                        {zRows.map((row, i) => (
                          <tr key={row.id} className={`border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors group ${zRowClasses(row.type)}`}>
                            <td className="px-2 py-2 text-slate-400">{i + 1}</td>
                            <td className="px-2 py-2 text-slate-300">
                              {row.reportDate ? new Date(row.reportDate).toLocaleDateString('es-VE') : ''}
                            </td>
                            <td className="px-2 py-2 text-slate-200 font-mono text-[11px] font-semibold">
                              {row.zNumber ?? '-'}
                            </td>
                            <td className="px-2 py-2 text-slate-300 font-mono text-[11px]">
                              {row.machineSerial || '-'}
                            </td>
                            <td className="px-2 py-2">
                              {zTypeBadge(row.type)}
                            </td>
                            <td className="px-2 py-2 text-slate-300 font-mono text-[11px]">
                              {row.fromDoc || '-'}
                            </td>
                            <td className="px-2 py-2 text-slate-300 font-mono text-[11px]">
                              {row.toDoc || '-'}
                            </td>
                            <td className="px-2 py-2 text-right text-slate-300 tabular-nums">
                              {formatVe(row.exemptBs)}
                            </td>
                            <td className="px-2 py-2 text-right text-slate-300 tabular-nums">
                              {formatVe(row.taxBaseBs)}
                            </td>
                            <td className="px-2 py-2 text-right text-emerald-400 tabular-nums font-medium">
                              {formatVe(row.taxBs)}
                            </td>
                            <td className="px-2 py-2 text-right text-amber-400 tabular-nums">
                              {formatVe(row.igtfBs)}
                            </td>
                            <td className="px-2 py-2 text-right text-slate-100 font-semibold tabular-nums">
                              {formatVe(row.totalBs)}
                            </td>
                            <td className="px-2 py-2">
                              {row.zReportId && row.type === 'ventas' && (
                                <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => openZEditModal(row.zReportId!)}
                                    className="p-1 rounded hover:bg-slate-600/60 text-slate-400 hover:text-blue-400 transition-colors"
                                    title="Editar Z">
                                    <Pencil size={14} />
                                  </button>
                                  <button onClick={() => handleZDelete(row.zReportId!)}
                                    className="p-1 rounded hover:bg-slate-600/60 text-slate-400 hover:text-red-400 transition-colors"
                                    title="Eliminar Z">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                        {/* Totals row */}
                        {zTotales && (
                          <tr className="bg-slate-700/30 border-t-2 border-slate-600">
                            <td colSpan={7} className="px-2 py-2.5 text-slate-100 font-bold">
                              TOTALES ({zTotales.totalRows} registros)
                            </td>
                            <td className="px-2 py-2.5 text-right text-slate-100 font-bold tabular-nums">{formatVe(zTotales.exemptBs)}</td>
                            <td className="px-2 py-2.5 text-right text-slate-100 font-bold tabular-nums">{formatVe(zTotales.taxBaseBs)}</td>
                            <td className="px-2 py-2.5 text-right text-emerald-400 font-bold tabular-nums">{formatVe(zTotales.taxBs)}</td>
                            <td className="px-2 py-2.5 text-right text-amber-400 font-bold tabular-nums">{formatVe(zTotales.igtfBs)}</td>
                            <td className="px-2 py-2.5 text-right text-emerald-400 font-bold tabular-nums">{formatVe(zTotales.totalBs)}</td>
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
        </>
      )}

      {/* ════════════════════ MODAL: DETALLADO ════════════════════ */}
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
                  <input type="text" value={form.controlNumber}
                    onChange={e => updateForm('controlNumber', e.target.value)}
                    placeholder="00-000000"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">N&deg; Factura *</label>
                  <input type="text" value={form.invoiceNumber}
                    onChange={e => updateForm('invoiceNumber', e.target.value)}
                    placeholder="Numero de factura"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
              </div>

              {/* Row 2: Cliente, RIF */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Cliente *</label>
                  <input type="text" value={form.customerName}
                    onChange={e => updateForm('customerName', e.target.value)}
                    placeholder="Nombre del cliente"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">RIF</label>
                  <input type="text" value={form.customerRif}
                    onChange={e => updateForm('customerRif', e.target.value)}
                    placeholder="V-12345678"
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
                  <label className="text-xs text-slate-400 mb-1 block">IVA Bs</label>
                  <input type="number" step="0.01" value={form.ivaAmountBs}
                    onChange={e => updateForm('ivaAmountBs', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
              </div>

              {/* Row 4: IGTF y total */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">IGTF Bs</label>
                  <input type="number" step="0.01" value={form.igtfAmountBs}
                    onChange={e => updateForm('igtfAmountBs', e.target.value)}
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
                Los cambios en el libro no afectan la factura original
              </p>
              <div className="flex gap-2">
                <button onClick={closeModal}
                  className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving || !form.entryDate || !form.invoiceNumber || !form.customerName}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center gap-2 disabled:opacity-50">
                  {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                  Guardar cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════ MODAL: Z REPORT MANUAL ════════════════════ */}
      {zModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-100">
                {zEditingId ? 'Editar Reporte Z' : 'Nuevo Reporte Z manual'}
              </h2>
              <button onClick={closeZModal} className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200">
                <X size={20} />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Row 1: Machine, Z number, date */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Maquina fiscal *</label>
                  {fiscalMachines.length > 0 ? (
                    <select value={zForm.machineSerial}
                      onChange={e => handleMachineChange(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
                      <option value="">Seleccionar...</option>
                      {fiscalMachines.map(m => (
                        <option key={m.serial} value={m.serial}>{m.serial} - {m.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" value={zForm.machineSerial}
                      onChange={e => updateZForm('machineSerial', e.target.value)}
                      placeholder="Ej: Z7C12345"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                  )}
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">N&deg; Z *</label>
                  <input type="number" value={zForm.zNumber}
                    onChange={e => updateZForm('zNumber', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Fecha *</label>
                  <input type="date" value={zForm.reportDate}
                    onChange={e => updateZForm('reportDate', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
              </div>

              {/* Toggle: Ventas / NC */}
              <div className="flex gap-1 bg-slate-900 border border-slate-700 rounded-lg p-1 w-fit">
                <button
                  type="button"
                  onClick={() => setZEntryType('ventas')}
                  className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    zEntryType === 'ventas'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Facturas de venta
                </button>
                <button
                  type="button"
                  onClick={() => setZEntryType('nc')}
                  className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    zEntryType === 'nc'
                      ? 'bg-red-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Notas de credito
                </button>
              </div>

              {/* Ventas fields */}
              {zEntryType === 'ventas' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Ventas exentas Bs</label>
                      <input type="number" step="0.01" value={zForm.salesExemptBs}
                        onChange={e => updateZForm('salesExemptBs', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Base imponible Bs</label>
                      <input type="number" step="0.01" value={zForm.salesTaxBase1Bs}
                        onChange={e => updateZForm('salesTaxBase1Bs', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Impuesto IVA Bs</label>
                      <input type="number" step="0.01" value={zForm.salesTax1Bs}
                        onChange={e => updateZForm('salesTax1Bs', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">IGTF Bs</label>
                      <input type="number" step="0.01" value={zForm.igtfSalesTaxBs}
                        onChange={e => updateZForm('igtfSalesTaxBs', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Total Bs</label>
                    <input type="number" step="0.01" value={zForm.salesTotalBs}
                      onChange={e => updateZForm('salesTotalBs', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-semibold" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Comprobante inicial</label>
                      <input type="text" value={zForm.firstInvoiceNumber}
                        onChange={e => updateZForm('firstInvoiceNumber', e.target.value)}
                        placeholder="Auto del Z anterior"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                      <p className="text-[10px] text-slate-500 mt-1">Se calcula del Z anterior si se deja vacio</p>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Comprobante final</label>
                      <input type="text" value={zForm.lastInvoiceNumber}
                        onChange={e => updateZForm('lastInvoiceNumber', e.target.value)}
                        placeholder="Ultima factura del Z"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                    </div>
                  </div>
                </>
              )}

              {/* NC fields */}
              {zEntryType === 'nc' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">NC exentas Bs</label>
                      <input type="number" step="0.01" value={zForm.ncExemptBs}
                        onChange={e => updateZForm('ncExemptBs', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Base imponible Bs</label>
                      <input type="number" step="0.01" value={zForm.ncTaxBase1Bs}
                        onChange={e => updateZForm('ncTaxBase1Bs', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Impuesto IVA Bs</label>
                      <input type="number" step="0.01" value={zForm.ncTax1Bs}
                        onChange={e => updateZForm('ncTax1Bs', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">IGTF NC Bs</label>
                      <input type="number" step="0.01" value={zForm.igtfNcTaxBs}
                        onChange={e => updateZForm('igtfNcTaxBs', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Total NC Bs</label>
                    <input type="number" step="0.01" value={zForm.ncTotalBs}
                      onChange={e => updateZForm('ncTotalBs', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-semibold" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Comprobante inicial</label>
                      <input type="text" value={zForm.firstCreditNoteNumber}
                        onChange={e => updateZForm('firstCreditNoteNumber', e.target.value)}
                        placeholder="Auto del Z anterior"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                      <p className="text-[10px] text-slate-500 mt-1">Se calcula del Z anterior si se deja vacio</p>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Comprobante final</label>
                      <input type="text" value={zForm.lastCreditNoteNumber}
                        onChange={e => updateZForm('lastCreditNoteNumber', e.target.value)}
                        placeholder="Ultima NC del Z"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                    </div>
                  </div>
                </>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Notas</label>
                <textarea value={zForm.notes}
                  onChange={e => updateZForm('notes', e.target.value)}
                  rows={2}
                  placeholder="Observaciones opcionales"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 resize-none" />
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-slate-700">
              <p className="text-xs text-slate-500 italic max-w-xs">
                Los datos se registran tal cual aparecen en el reporte Z impreso
              </p>
              <div className="flex gap-2">
                <button onClick={closeZModal}
                  className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm">
                  Cancelar
                </button>
                <button onClick={handleZSave} disabled={zSaving || !zForm.reportDate || !zForm.machineSerial || !zForm.zNumber}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center gap-2 disabled:opacity-50">
                  {zSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
