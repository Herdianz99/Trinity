'use client';

import { useState, useCallback } from 'react';
import { BookOpen, Loader2, FileDown, Search } from 'lucide-react';

interface VentaRow {
  numero: number;
  fecha: string;
  numeroFactura: string;
  numeroControl: string;
  rifCliente: string;
  nombreCliente: string;
  baseImponibleExenta: number;
  baseImponibleReducida: number;
  baseImponibleGeneral: number;
  baseImponibleEspecial: number;
  ivaReducido: number;
  ivaGeneral: number;
  ivaEspecial: number;
  igtf: number;
  totalFactura: number;
}

interface Totales {
  totalFacturas: number;
  baseImponibleExenta: number;
  baseImponibleReducida: number;
  baseImponibleGeneral: number;
  baseImponibleEspecial: number;
  ivaReducido: number;
  ivaGeneral: number;
  ivaEspecial: number;
  igtf: number;
  totalVentas: number;
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatVe(n: number): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function LibroVentasPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<VentaRow[]>([]);
  const [totales, setTotales] = useState<Totales | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const to = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;
      const res = await fetch(`/api/proxy/fiscal/libro-ventas?from=${from}&to=${to}`);
      if (!res.ok) throw new Error('Error al cargar datos');
      const data = await res.json();
      setRows(data.rows || []);
      setTotales(data.totales || null);
      setLoaded(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  async function exportPdf() {
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;

    // Fetch company config for header
    let companyName = 'Trinity ERP';
    let companyRif = '';
    try {
      const cfgRes = await fetch('/api/proxy/config');
      const cfg = await cfgRes.json();
      companyName = cfg.companyName || companyName;
      companyRif = cfg.rif || '';
    } catch {}

    // Open print-friendly window
    const printWin = window.open('', '_blank');
    if (!printWin) return;

    const tableRows = rows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${new Date(r.fecha).toLocaleDateString('es-VE')}</td>
        <td>${r.numeroFactura}</td>
        <td>${r.numeroControl || ''}</td>
        <td>${r.rifCliente}</td>
        <td>${r.nombreCliente}</td>
        <td class="num">${formatVe(r.baseImponibleExenta)}</td>
        <td class="num">${formatVe(r.baseImponibleReducida)}</td>
        <td class="num">${formatVe(r.baseImponibleGeneral)}</td>
        <td class="num">${formatVe(r.baseImponibleEspecial)}</td>
        <td class="num">${formatVe(r.ivaReducido)}</td>
        <td class="num">${formatVe(r.ivaGeneral)}</td>
        <td class="num">${formatVe(r.ivaEspecial)}</td>
        <td class="num">${formatVe(r.igtf)}</td>
        <td class="num total">${formatVe(r.totalFactura)}</td>
      </tr>
    `).join('');

    const totalesRow = totales ? `
      <tr class="totales">
        <td colspan="6"><strong>TOTALES</strong></td>
        <td class="num"><strong>${formatVe(totales.baseImponibleExenta)}</strong></td>
        <td class="num"><strong>${formatVe(totales.baseImponibleReducida)}</strong></td>
        <td class="num"><strong>${formatVe(totales.baseImponibleGeneral)}</strong></td>
        <td class="num"><strong>${formatVe(totales.baseImponibleEspecial)}</strong></td>
        <td class="num"><strong>${formatVe(totales.ivaReducido)}</strong></td>
        <td class="num"><strong>${formatVe(totales.ivaGeneral)}</strong></td>
        <td class="num"><strong>${formatVe(totales.ivaEspecial)}</strong></td>
        <td class="num"><strong>${formatVe(totales.igtf)}</strong></td>
        <td class="num total"><strong>${formatVe(totales.totalVentas)}</strong></td>
      </tr>
    ` : '';

    printWin.document.write(`<!DOCTYPE html>
    <html>
    <head>
      <title>Libro de Ventas - ${MONTHS[month]} ${year}</title>
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
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${companyName}</h1>
        ${companyRif ? `<p>RIF: ${companyRif}</p>` : ''}
        <h2>LIBRO DE VENTAS</h2>
        <p>Periodo: ${MONTHS[month].toUpperCase()} ${year}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>N&deg;</th><th>Fecha</th><th>N&deg; Factura</th><th>N&deg; Control</th>
            <th>RIF Cliente</th><th>Cliente</th>
            <th>Base Exenta</th><th>Base Reducida</th><th>Base General</th><th>Base Especial</th>
            <th>IVA 8%</th><th>IVA 16%</th><th>IVA 31%</th><th>IGTF</th><th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
          ${totalesRow}
        </tbody>
      </table>
      <div class="footer">Generado el ${new Date().toLocaleString('es-VE')}</div>
      <script>window.print();</script>
    </body>
    </html>`);
    printWin.document.close();
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <BookOpen className="text-emerald-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Libro de Ventas</h1>
          <p className="text-sm text-slate-400">Formato SENIAT - Registro de ventas del periodo</p>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400">
          {error}
        </div>
      )}

      {/* Period Selector */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Mes</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Ano</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={fetchData} disabled={loading}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
            Generar
          </button>
          {loaded && rows.length > 0 && (
            <button onClick={exportPdf}
              className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-sm flex items-center gap-2">
              <FileDown size={16} />
              Exportar PDF
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loaded && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-3 py-2.5 text-slate-400 font-medium">N&deg;</th>
                  <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Fecha</th>
                  <th className="text-left px-3 py-2.5 text-slate-400 font-medium">N&deg; Factura</th>
                  <th className="text-left px-3 py-2.5 text-slate-400 font-medium">N&deg; Control</th>
                  <th className="text-left px-3 py-2.5 text-slate-400 font-medium">RIF Cliente</th>
                  <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Cliente</th>
                  <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Base Exenta</th>
                  <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Base Reducida</th>
                  <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Base General</th>
                  <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Base Especial</th>
                  <th className="text-right px-3 py-2.5 text-slate-400 font-medium">IVA 8%</th>
                  <th className="text-right px-3 py-2.5 text-slate-400 font-medium">IVA 16%</th>
                  <th className="text-right px-3 py-2.5 text-slate-400 font-medium">IVA 31%</th>
                  <th className="text-right px-3 py-2.5 text-slate-400 font-medium">IGTF</th>
                  <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={15} className="text-center py-8 text-slate-500">No hay facturas en este periodo</td></tr>
                ) : (
                  <>
                    {rows.map(r => (
                      <tr key={r.numero} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                        <td className="px-3 py-2 text-slate-300">{r.numero}</td>
                        <td className="px-3 py-2 text-slate-300">{new Date(r.fecha).toLocaleDateString('es-VE')}</td>
                        <td className="px-3 py-2 text-slate-200 font-mono">{r.numeroFactura}</td>
                        <td className="px-3 py-2 text-slate-300">{r.numeroControl || '-'}</td>
                        <td className="px-3 py-2 text-slate-300">{r.rifCliente}</td>
                        <td className="px-3 py-2 text-slate-200">{r.nombreCliente}</td>
                        <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{formatVe(r.baseImponibleExenta)}</td>
                        <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{formatVe(r.baseImponibleReducida)}</td>
                        <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{formatVe(r.baseImponibleGeneral)}</td>
                        <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{formatVe(r.baseImponibleEspecial)}</td>
                        <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{formatVe(r.ivaReducido)}</td>
                        <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{formatVe(r.ivaGeneral)}</td>
                        <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{formatVe(r.ivaEspecial)}</td>
                        <td className="px-3 py-2 text-right text-amber-400/80 tabular-nums">{formatVe(r.igtf)}</td>
                        <td className="px-3 py-2 text-right text-slate-100 font-semibold tabular-nums">{formatVe(r.totalFactura)}</td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    {totales && (
                      <tr className="bg-slate-700/30 border-t-2 border-slate-600">
                        <td colSpan={6} className="px-3 py-2.5 text-slate-100 font-bold">TOTALES ({totales.totalFacturas} facturas)</td>
                        <td className="px-3 py-2.5 text-right text-slate-100 font-bold tabular-nums">{formatVe(totales.baseImponibleExenta)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-100 font-bold tabular-nums">{formatVe(totales.baseImponibleReducida)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-100 font-bold tabular-nums">{formatVe(totales.baseImponibleGeneral)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-100 font-bold tabular-nums">{formatVe(totales.baseImponibleEspecial)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-100 font-bold tabular-nums">{formatVe(totales.ivaReducido)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-100 font-bold tabular-nums">{formatVe(totales.ivaGeneral)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-100 font-bold tabular-nums">{formatVe(totales.ivaEspecial)}</td>
                        <td className="px-3 py-2.5 text-right text-amber-400 font-bold tabular-nums">{formatVe(totales.igtf)}</td>
                        <td className="px-3 py-2.5 text-right text-emerald-400 font-bold tabular-nums">{formatVe(totales.totalVentas)}</td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
