'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, X, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { fmtRate } from '@/lib/format';

interface ExportItem {
  id: string;
  supplierId: string | null;
  supplierName: string;
  docNumber: string;
  netUsd: number;
  bsToday: number | null;
  blockedReason: string | null;
  bankExportedAt: string | null;
  bankExportRate: number | null;
  bankExportAmountBs: number | null;
}
interface Preview { scheduleNumber: string; rate: number | null; items: ExportItem[] }

const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Seleccion de los documentos que se pagan HOY y descarga del Excel para pegar en la
// plantilla "Generador de TXT Bancaribe" (hoja Pagos, celda C14).
export default function BankExportModal({ scheduleId, onClose, onExported }: {
  scheduleId: string; onClose: () => void; onExported: () => void;
}) {
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetch(`/api/proxy/payment-schedules/${scheduleId}/bank-export`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Error'); return r.json(); })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [scheduleId]);

  const groups = useMemo(() => {
    const m = new Map<string, ExportItem[]>();
    for (const it of data?.items ?? []) m.set(it.supplierName, [...(m.get(it.supplierName) ?? []), it]);
    return Array.from(m.entries());
  }, [data]);

  const canSelect = (it: ExportItem) => !it.blockedReason && !!data?.rate;
  const chosen = (data?.items ?? []).filter((i) => selected.has(i.id));
  const totalBs = chosen.reduce((s, i) => s + (i.bsToday ?? 0), 0);
  const reExport = chosen.filter((i) => i.bankExportedAt);

  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  // Marca/desmarca todos los documentos seleccionables de un proveedor.
  function toggleSupplier(items: ExportItem[]) {
    const eligible = items.filter(canSelect);
    const allOn = eligible.length > 0 && eligible.every((i) => selected.has(i.id));
    setSelected((prev) => {
      const n = new Set(prev);
      for (const i of eligible) { if (allOn) n.delete(i.id); else n.add(i.id); }
      return n;
    });
  }

  async function download() {
    if (reExport.length && !confirm(`${reExport.length} documento(s) ya se exportaron antes. ¿Exportarlos de nuevo? Verifica que no se hayan pagado.`)) return;
    setDownloading(true); setError('');
    try {
      const res = await fetch(`/api/proxy/payment-schedules/${scheduleId}/bank-export`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: Array.from(selected) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Error al exportar');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bancaribe-${data?.scheduleNumber ?? 'pagos'}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      onExported();
      onClose();
    } catch (e: any) { setError(e.message); } finally { setDownloading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-700/50">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-green-400 flex-shrink-0" /> Exportar a Bancaribe
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Marca los documentos que se pagan hoy. Los Bs se calculan con la tasa BCV de hoy.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white flex-shrink-0"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5 space-y-3">
          {error && <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
          {!data && !error && <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-green-500" size={28} /></div>}
          {data && !data.rate && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm flex items-center gap-2">
              <AlertTriangle size={16} className="flex-shrink-0" /> No hay tasa BCV registrada para hoy. Cárgala antes de exportar.
            </div>
          )}
          {data && data.items.length === 0 && (
            <p className="text-center py-8 text-slate-500 text-sm">La programación no tiene documentos.</p>
          )}
          {data && groups.map(([supplier, items]) => {
            const eligible = items.filter(canSelect);
            const allOn = eligible.length > 0 && eligible.every((i) => selected.has(i.id));
            const supplierBlock = items.find((i) => i.blockedReason && i.supplierId && i.blockedReason !== 'Ya pagado');
            return (
              <div key={supplier} className="rounded-lg border border-slate-700/50 overflow-hidden">
                <div className="px-3 py-2 bg-slate-800/40 flex items-center gap-3">
                  <input type="checkbox" disabled={!eligible.length} checked={allOn} onChange={() => toggleSupplier(items)}
                    className="w-4 h-4 accent-green-500 disabled:opacity-30" title="Marcar todos los documentos del proveedor" />
                  <span className="text-sm font-medium text-slate-200 flex-1 min-w-0 truncate">{supplier}</span>
                  {supplierBlock && (
                    <Link href={`/catalog/suppliers/${supplierBlock.supplierId}`} target="_blank" className="text-xs text-blue-400 hover:underline flex-shrink-0">
                      Completar datos
                    </Link>
                  )}
                </div>
                {items.map((it) => (
                  <label key={it.id} className={`flex items-start gap-3 px-3 py-2 border-t border-slate-700/30 text-sm ${canSelect(it) ? 'cursor-pointer hover:bg-slate-800/30' : 'opacity-60'}`}>
                    <input type="checkbox" disabled={!canSelect(it)} checked={selected.has(it.id)} onChange={() => toggle(it.id)}
                      className="w-4 h-4 mt-0.5 accent-green-500 flex-shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block font-mono text-xs text-slate-300 truncate">{it.docNumber}</span>
                      {it.blockedReason ? (
                        <span className="block text-[11px] text-red-400">{it.blockedReason}</span>
                      ) : it.bankExportedAt ? (
                        <span className="block text-[11px] text-amber-400">
                          Exportado {new Date(it.bankExportedAt).toLocaleDateString('es-VE')} · Bs {fmt(it.bankExportAmountBs ?? 0)}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-right flex-shrink-0">
                      <span className="block text-slate-200 font-mono">${fmt(it.netUsd)}</span>
                      {it.bsToday != null && <span className="block text-[11px] text-slate-500 font-mono">Bs {fmt(it.bsToday)}</span>}
                    </span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-700/50 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="text-sm text-slate-300 flex-1">
              {data?.rate ? <>Tasa hoy: <span className="font-mono">{fmtRate(data.rate)}</span> · </> : null}
              {chosen.length} doc. · <span className="font-mono text-green-400">Bs {fmt(totalBs)}</span>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button onClick={onClose} className="btn-secondary">Cancelar</button>
              <button onClick={download} disabled={!chosen.length || downloading || !data?.rate}
                className="btn-primary flex items-center justify-center gap-2 disabled:opacity-40">
                {downloading ? <Loader2 className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />} Descargar Excel
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            En el Excel, copia desde la celda A2 de la hoja “Pagos” y pégalo en la celda C14 de la plantilla de Bancaribe.
            La hoja “Afiliacion” sirve para afiliar proveedores nuevos.
          </p>
        </div>
      </div>
    </div>
  );
}
