'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle, Loader2, ArrowLeft, Repeat, PackageX, Ban, ExternalLink, CheckCircle2, Undo2, Printer,
} from 'lucide-react';
import { ImageZoomLightbox } from '@/components/image-zoom-lightbox';

interface Photo { id: string; thumbUrl: string; mediumUrl: string }
interface Item {
  id: string; productId: string; productName: string; productCode: string | null;
  quantity: number; note: string | null; photos: Photo[];
}
interface Report {
  id: string; number: string; date: string; zone: string; status: string;
  resolution: string | null; notes: string | null;
  warehouse: { id: string; name: string } | null;
  createdBy: { name: string } | null;
  processedBy: { name: string } | null;
  processedAt: string | null;
  replacement: { id: string; number: string; status: string } | null;
  items: Item[];
}

const STATUS_BADGE: Record<string, string> = {
  PENDIENTE: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  EN_PROCESO: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  PROCESADO: 'bg-green-500/10 text-green-400 border-green-500/30',
  ANULADO: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
};
const STATUS_LABEL: Record<string, string> = { PENDIENTE: 'Pendiente', EN_PROCESO: 'En proceso', PROCESADO: 'Procesado', ANULADO: 'Anulado' };
const RESOLUTION_LABEL: Record<string, string> = { REEMPLAZO: 'Reemplazo', MERMA: 'Merma' };

export default function DamageReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [confirmMerma, setConfirmMerma] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/damage-reports/${id}`);
      if (res.ok) setReport(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchReport(); }, [fetchReport]);
  useEffect(() => {
    document.title = report ? `${report.number} - Daños | Trinity ERP` : 'Reporte de daños | Trinity ERP';
  }, [report]);
  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 4000); return () => clearTimeout(t); }
  }, [message]);

  async function generateReplacement() {
    setBusy(true);
    try {
      const res = await fetch(`/api/proxy/damage-reports/${id}/replacement`, { method: 'POST' });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Error'); }
      const data = await res.json();
      router.push(`/inventory/replacements/${data.replacementId}`);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Error al generar el reemplazo' });
      setBusy(false);
    }
  }

  async function processMerma() {
    setBusy(true);
    try {
      const res = await fetch(`/api/proxy/damage-reports/${id}/merma`, { method: 'POST' });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Error'); }
      setConfirmMerma(false);
      setMessage({ type: 'success', text: 'Reporte procesado como merma (stock descontado)' });
      fetchReport();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Error al procesar la merma' });
    } finally { setBusy(false); }
  }

  async function cancel() {
    setBusy(true);
    try {
      const res = await fetch(`/api/proxy/damage-reports/${id}/cancel`, { method: 'POST' });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Error'); }
      setMessage({ type: 'success', text: 'Reporte anulado' });
      fetchReport();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Error al anular' });
    } finally { setBusy(false); }
  }

  async function cancelDraftReplacement() {
    setBusy(true);
    try {
      const res = await fetch(`/api/proxy/damage-reports/${id}/replacement/cancel`, { method: 'POST' });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Error'); }
      setMessage({ type: 'success', text: 'Reemplazo deshecho — el reporte volvió a pendiente' });
      fetchReport();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Error al deshacer el reemplazo' });
    } finally { setBusy(false); }
  }

  function fmtDate(d: string) {
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
  }

  if (loading) return <div className="p-8 text-center text-slate-500"><Loader2 className="animate-spin inline" size={24} /></div>;
  if (!report) return <div className="p-8 text-center text-slate-500">Reporte no encontrado.</div>;

  const isPendiente = report.status === 'PENDIENTE';

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/inventory/damage-reports" className="text-slate-400 hover:text-white"><ArrowLeft size={20} /></Link>
        <AlertTriangle className="text-amber-400" size={22} />
        <h1 className="text-xl font-bold text-white font-mono">{report.number}</h1>
        <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${STATUS_BADGE[report.status]}`}>{STATUS_LABEL[report.status]}</span>
        <button
          onClick={() => window.open(`/api/proxy/damage-reports/${id}/pdf`)}
          className="btn-secondary !py-1.5 text-sm flex items-center gap-2 ml-auto"
        >
          <Printer size={15} /> PDF
        </button>
      </div>

      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
          {message.text}
        </div>
      )}

      {/* Datos */}
      <div className="card p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><p className="text-xs text-slate-500">Fecha</p><p className="text-white">{fmtDate(report.date)}</p></div>
        <div><p className="text-xs text-slate-500">Zona</p><p className="text-white">{report.zone}</p></div>
        <div><p className="text-xs text-slate-500">Almacén</p><p className="text-white">{report.warehouse?.name || '—'}</p></div>
        <div><p className="text-xs text-slate-500">Reportó</p><p className="text-white">{report.createdBy?.name || '—'}</p></div>
        {report.notes && <div className="col-span-2 sm:col-span-4"><p className="text-xs text-slate-500">Nota general</p><p className="text-slate-300">{report.notes}</p></div>}
        {report.status === 'PROCESADO' && (
          <div className="col-span-2 sm:col-span-4 border-t border-slate-700/40 pt-3 flex items-center gap-2 flex-wrap text-xs text-slate-400">
            <CheckCircle2 size={15} className="text-green-400" />
            Resuelto como <span className="text-white font-medium">{report.resolution ? RESOLUTION_LABEL[report.resolution] : '—'}</span>
            {report.processedBy && <span>por {report.processedBy.name}</span>}
            {report.processedAt && <span>el {fmtDate(report.processedAt)}</span>}
            {report.replacement && (
              <Link href={`/inventory/replacements/${report.replacement.id}`} className="inline-flex items-center gap-1 text-green-400 hover:underline ml-1">
                {report.replacement.number} <ExternalLink size={12} />
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Reemplazo en curso (borrador) */}
      {report.status === 'EN_PROCESO' && (
        <div className="card p-5 border border-sky-500/30 bg-sky-500/5 space-y-3">
          <div className="flex items-center gap-2 text-sm text-sky-300">
            <Repeat size={16} />
            <span>
              Reemplazo en curso{report.replacement ? `: ${report.replacement.number}` : ''} (borrador).
              Complétalo en el editor de reemplazos para finalizar, o deshazlo para volver a pendiente.
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {report.replacement && (
              <Link href={`/inventory/replacements/${report.replacement.id}`} className="btn-primary flex items-center gap-2">
                <ExternalLink size={16} /> Ir al reemplazo
              </Link>
            )}
            <button onClick={cancelDraftReplacement} disabled={busy} className="btn-secondary flex items-center gap-2">
              {busy ? <Loader2 className="animate-spin" size={16} /> : <Undo2 size={16} />}
              Deshacer reemplazo
            </button>
          </div>
        </div>
      )}

      {/* Artículos */}
      <div className="space-y-3">
        {report.items.map((it) => (
          <div key={it.id} className="card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="font-mono text-xs text-red-400">{it.productCode || '—'}</span>
                <p className="text-sm text-white">{it.productName}</p>
                {it.note && <p className="text-xs text-slate-500 mt-0.5">{it.note}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-slate-500">Cantidad</p>
                <p className="text-lg font-semibold text-white">{it.quantity}</p>
              </div>
            </div>
            {it.photos.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {it.photos.map((p) => (
                  <button key={p.id} onClick={() => setLightbox(p.mediumUrl)} className="w-16 h-16 rounded-lg overflow-hidden border border-slate-700 hover:border-green-500">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.thumbUrl} alt="evidencia" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Acciones del auditor */}
      {isPendiente && (
        <div className="card p-5 space-y-3">
          <p className="text-sm text-slate-300">Resolver este reporte:</p>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={generateReplacement} disabled={busy} className="btn-primary flex items-center gap-2">
              {busy ? <Loader2 className="animate-spin" size={16} /> : <Repeat size={16} />}
              Generar reemplazo
            </button>
            <button onClick={() => setConfirmMerma(true)} disabled={busy} className="btn-secondary flex items-center gap-2">
              <PackageX size={16} /> Procesar como merma
            </button>
            <button onClick={cancel} disabled={busy} className="text-slate-400 hover:text-red-400 flex items-center gap-2 text-sm ml-auto">
              <Ban size={15} /> Anular
            </button>
          </div>
          <p className="text-xs text-slate-500">
            <b>Reemplazo:</b> el artículo dañado sale y otro entra (lo eliges en el editor de reemplazos).
            <b className="ml-2">Merma:</b> baja pura de stock, sin reposición. Ambos mueven el inventario.
          </p>
        </div>
      )}

      {/* Confirmación de merma */}
      {confirmMerma && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-semibold text-white">Procesar como merma</h3>
            <p className="text-sm text-slate-400">
              Se descontará del inventario (almacén {report.warehouse?.name}) la cantidad dañada de cada artículo,
              con un movimiento de ajuste de salida. Esta acción no se puede deshacer.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setConfirmMerma(false)} disabled={busy} className="btn-secondary">Cancelar</button>
              <button onClick={processMerma} disabled={busy} className="btn-primary flex items-center gap-2">
                {busy ? <Loader2 className="animate-spin" size={16} /> : <PackageX size={16} />}
                Confirmar merma
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && <ImageZoomLightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
