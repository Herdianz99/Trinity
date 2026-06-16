'use client';

import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, RotateCw, Search, Printer } from 'lucide-react';

interface PrintArea {
  id: string;
  name: string;
}

interface PrintJob {
  id: string;
  invoiceId: string;
  invoice: { id: string; number: string | null };
  printArea: { id: string; name: string };
  status: 'PENDING' | 'PRINTING' | 'PRINTED' | 'FAILED';
  items: { code: string; name: string; quantity: number }[];
  isReprint: boolean;
  failureReason: string | null;
  createdAt: string;
}

const STATUS_META: Record<string, { label: string; cls: string; rank: number }> = {
  FAILED:   { label: 'Fallida',     cls: 'bg-red-500/15 text-red-400 border-red-500/30',       rank: 0 },
  PENDING:  { label: 'En cola',     cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',  rank: 1 },
  PRINTING: { label: 'Imprimiendo', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30',     rank: 2 },
  PRINTED:  { label: 'Impresa',     cls: 'bg-green-500/15 text-green-400 border-green-500/30',   rank: 3 },
};

const REFRESH_MS = 10000;

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function CommandsPage() {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [areas, setAreas] = useState<PrintArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(todayLocal());
  const [to, setTo] = useState(todayLocal());
  const [areaId, setAreaId] = useState('');
  const [status, setStatus] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [reprinting, setReprinting] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { document.title = 'Control de Comandas | Trinity ERP'; }, []);

  useEffect(() => {
    fetch('/api/proxy/print-areas')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: PrintArea[]) => setAreas(data))
      .catch(() => {});
  }, []);

  const fetchJobs = useCallback(async () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (areaId) params.set('printAreaId', areaId);
    if (status) params.set('status', status);
    if (invoiceNumber.trim()) params.set('invoiceNumber', invoiceNumber.trim());

    try {
      const res = await fetch(`/api/proxy/print-jobs?${params.toString()}`);
      if (res.ok) {
        const data: PrintJob[] = await res.json();
        // Fallidas y pendientes primero; dentro, mas recientes primero
        data.sort((a, b) => {
          const r = STATUS_META[a.status].rank - STATUS_META[b.status].rank;
          if (r !== 0) return r;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        setJobs(data);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [from, to, areaId, status, invoiceNumber]);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  async function handleReprint(job: PrintJob) {
    const ok = window.confirm(
      `Reimprimir la factura ${job.invoice.number || 'S/N'}? Se enviara a todas sus zonas.`,
    );
    if (!ok) return;

    setReprinting(job.invoiceId);
    try {
      const res = await fetch(`/api/proxy/print-jobs/reprint/${job.invoiceId}`, {
        method: 'POST',
      });
      if (res.ok) {
        const data: { zones: number } = await res.json();
        setToast(`Reimpresion enviada a ${data.zones} zona(s). Saldra en la(s) impresora(s) de despacho.`);
        fetchJobs();
      } else {
        setToast('No se pudo reimprimir. Intenta de nuevo.');
      }
    } catch {
      setToast('Error de conexion al reimprimir.');
    } finally {
      setReprinting(null);
    }
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString('es-VE', { hour12: false });
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <ClipboardList size={22} className="text-green-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Control de Comandas</h1>
          <p className="text-sm text-slate-400">
            Revisa el estado de las comandas y reimprime las que no salieron
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-4 mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Desde</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="input-field" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Hasta</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="input-field" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Zona</label>
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className="input-field">
            <option value="">Todas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Estado</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-field">
            <option value="">Todos</option>
            <option value="FAILED">Fallida</option>
            <option value="PENDING">En cola</option>
            <option value="PRINTING">Imprimiendo</option>
            <option value="PRINTED">Impresa</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Factura</label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 z-10" />
            <input type="text" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="N. de factura" className="input-field pl-9" />
          </div>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-green-500 border-t-transparent rounded-full" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          No hay comandas para los filtros seleccionados.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-left">
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Factura</th>
                <th className="px-4 py-3 font-medium">Zona</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Hora</th>
                <th className="px-4 py-3 font-medium text-right">Accion</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const meta = STATUS_META[job.status];
                const units = job.items.reduce((s, i) => s + (i.quantity || 0), 0);
                return (
                  <tr key={job.id} className="border-b border-slate-800 hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${meta.cls}`}>
                        {meta.label}
                      </span>
                      {job.isReprint && (
                        <span className="ml-1.5 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                          REIMP.
                        </span>
                      )}
                      {job.status === 'FAILED' && job.failureReason && (
                        <p className="text-[11px] text-red-400/80 mt-1">{job.failureReason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-white">{job.invoice.number || 'S/N'}</td>
                    <td className="px-4 py-3 text-slate-300">{job.printArea.name}</td>
                    <td className="px-4 py-3 text-slate-300">{job.items.length} reng. / {units} und.</td>
                    <td className="px-4 py-3 text-slate-400">{formatTime(job.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleReprint(job)}
                        disabled={reprinting === job.invoiceId}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {reprinting === job.invoiceId ? (
                          <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                        ) : (
                          <RotateCw size={13} />
                        )}
                        Reimprimir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 text-sm font-medium shadow-2xl backdrop-blur-sm">
          <Printer size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
