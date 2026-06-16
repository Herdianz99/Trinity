'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface PrintJobItem {
  code: string;
  supplierRef: string;
  name: string;
  quantity: number;
}

interface PrintJob {
  id: string;
  invoiceId: string;
  invoice: { number: string };
  printAreaId: string;
  printArea: { name: string };
  status: string;
  items: PrintJobItem[];
  createdAt: string;
}

const POLL_INTERVAL = 5000;

export default function PrintMonitor() {
  const [currentJob, setCurrentJob] = useState<PrintJob | null>(null);
  // Estado solo para el indicador visual de la PC de despacho
  const [areaName, setAreaName] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [printing, setPrinting] = useState(false);

  const processedIds = useRef<Set<string>>(new Set());
  const isPrinting = useRef(false);
  const printAreaId = useRef<string | null>(null);

  const markAsPrinted = useCallback(async (jobId: string) => {
    try {
      await fetch(`/api/proxy/print-jobs/${jobId}/printed`, {
        method: 'PATCH',
      });
    } catch {
      // Silently fail - the job will remain pending and be retried
    }
  }, []);

  const buildTicketText = useCallback((job: PrintJob): string => {
    const createdDate = new Date(job.createdAt);
    const dateStr = createdDate.toLocaleDateString('es-VE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const timeStr = createdDate.toLocaleTimeString('es-VE', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });

    const totalUnits = job.items.reduce((s, i) => s + i.quantity, 0);
    const lines: string[] = [];

    // Encabezado: titulo COMANDA + zona destacada
    lines.push('{{CENTER}}{{BIG}}COMANDA{{/BIG}}{{/CENTER}}');
    lines.push(`{{CENTER}}{{BOLD}}${job.printArea.name}{{/BOLD}}{{/CENTER}}`);
    lines.push('{{LINE}}');

    // Datos de la factura
    lines.push(`{{BOLD}}Factura: ${job.invoice.number || 'S/N'}{{/BOLD}}`);
    lines.push(`${dateStr} ${timeStr}`);
    lines.push('{{LINE}}');

    // Items: cantidad y nombre destacados, codigo/ref en linea secundaria
    for (const item of job.items) {
      const name = (item.name || 'Producto').toUpperCase();
      lines.push(`{{BOLD}}${item.quantity} x ${name}{{/BOLD}}`);
      const ref = item.supplierRef ? `  Ref: ${item.supplierRef}` : '';
      lines.push(`   Cod: ${item.code || '-'}${ref}`);
    }

    lines.push('{{LINE}}');
    lines.push(`{{BOLD}}Renglones: ${job.items.length}  |  Unidades: ${totalUnits}{{/BOLD}}`);
    lines.push('{{FEED:1}}');
    lines.push('{{CUT}}');

    return lines.join('\n');
  }, []);

  const handlePrint = useCallback(async (job: PrintJob) => {
    if (isPrinting.current) return;
    isPrinting.current = true;
    setPrinting(true);

    // Try printing via Trinity Agent first
    try {
      const { isAgentRunning, printTicket } = await import('@/lib/trinity-agent');
      const agentUp = await isAgentRunning();
      if (agentUp) {
        const content = buildTicketText(job);
        const printed = await printTicket(content);
        if (printed) {
          await markAsPrinted(job.id);
          isPrinting.current = false;
          setPrinting(false);
          return;
        }
      }
    } catch {}

    // Fallback: use window.print()
    setCurrentJob(job);
    await new Promise((resolve) => setTimeout(resolve, 100));
    window.print();

    await markAsPrinted(job.id);

    setCurrentJob(null);
    isPrinting.current = false;
    setPrinting(false);
  }, [markAsPrinted, buildTicketText]);

  const fetchPendingJobs = useCallback(async () => {
    if (isPrinting.current || !printAreaId.current) return;

    try {
      const res = await fetch(
        `/api/proxy/print-jobs/pending?printAreaId=${printAreaId.current}`
      );
      if (!res.ok) return;

      const jobs: PrintJob[] = await res.json();
      setPendingCount(jobs.length);

      for (const job of jobs) {
        if (!processedIds.current.has(job.id)) {
          processedIds.current.add(job.id);
          await handlePrint(job);
        }
      }
    } catch {
      // Silently fail - will retry on next poll
    }
  }, [handlePrint]);

  useEffect(() => {
    // Leer la zona configurada para esta PC desde localStorage
    const storedId = localStorage.getItem('printAreaId');
    const storedName = localStorage.getItem('printAreaName');
    printAreaId.current = storedId;
    setAreaName(storedId ? (storedName || null) : null);

    // Si hay id pero falta el nombre (config vieja), resolverlo del API
    if (storedId && !storedName) {
      fetch('/api/proxy/print-areas')
        .then(r => (r.ok ? r.json() : []))
        .then((areas: { id: string; name: string }[]) => {
          const found = areas.find(a => a.id === storedId);
          if (found) {
            localStorage.setItem('printAreaName', found.name);
            setAreaName(found.name);
          }
        })
        .catch(() => {});
    }

    // Polling inicial + intervalo
    fetchPendingJobs();
    const interval = setInterval(fetchPendingJobs, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchPendingJobs]);

  // Aplicar un cambio de zona (desde esta pestana o desde otra)
  const applyAreaChange = useCallback((id: string | null, name: string | null) => {
    printAreaId.current = id;
    processedIds.current.clear();
    setAreaName(id ? name : null);
    setPendingCount(0);
    // Tomar pendientes de la nueva zona de inmediato, sin esperar al intervalo
    fetchPendingJobs();
  }, [fetchPendingJobs]);

  // Cambio desde ESTA pestana (Configuracion) -> evento custom
  useEffect(() => {
    function handleAreaChanged(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      applyAreaChange(detail.id ?? null, detail.name ?? null);
    }
    window.addEventListener('printAreaChanged', handleAreaChanged);
    return () => window.removeEventListener('printAreaChanged', handleAreaChanged);
  }, [applyAreaChange]);

  // Cambio desde OTRA pestana -> evento nativo 'storage'
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === 'printAreaId') {
        applyAreaChange(e.newValue, localStorage.getItem('printAreaName'));
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [applyAreaChange]);

  return (
    <>
      {/* Indicador de estado en la PC de despacho (oculto al imprimir) */}
      {areaName && (
        <div
          className="print:hidden fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-xs text-slate-200 shadow-lg backdrop-blur"
          title="Esta PC imprime las comandas de esta zona al cobrar"
        >
          {printing ? (
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          ) : (
            <span className="h-2 w-2 rounded-full bg-green-400" />
          )}
          <span className="font-medium">Comandas:</span>
          <span>{areaName}</span>
          {printing ? (
            <span className="text-amber-400">imprimiendo…</span>
          ) : pendingCount > 0 ? (
            <span className="text-amber-400">{pendingCount} pend.</span>
          ) : null}
        </div>
      )}

      {/* Fallback de impresion via window.print() cuando el agente no esta */}
      {currentJob && (
        <div
          id="print-ticket"
          className="hidden print:block"
          style={{
            width: '80mm',
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: '11px',
            lineHeight: '1.3',
            color: '#000',
            padding: '2mm',
          }}
        >
          <style
            dangerouslySetInnerHTML={{
              __html: `
                @media print {
                  body * { visibility: hidden !important; }
                  #print-ticket,
                  #print-ticket * { visibility: visible !important; }
                  #print-ticket {
                    position: fixed !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 80mm !important;
                  }
                  @page { size: 80mm auto; margin: 0; }
                }
              `,
            }}
          />

          {/* Header */}
          <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '4px', marginBottom: '4px' }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>COMANDA</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
              {currentJob.printArea.name}
            </div>
            <div style={{ marginTop: '2px' }}>
              Factura: {currentJob.invoice.number || 'S/N'}
            </div>
            <div>
              {new Date(currentJob.createdAt).toLocaleString('es-VE', { hour12: false })}
            </div>
          </div>

          {/* Items table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #000' }}>
                <th style={{ textAlign: 'right', padding: '2px 1px', fontWeight: 'bold' }}>Cant</th>
                <th style={{ textAlign: 'left', padding: '2px 1px', fontWeight: 'bold' }}>Cod.</th>
                <th style={{ textAlign: 'left', padding: '2px 1px', fontWeight: 'bold' }}>Ref.Prov</th>
                <th style={{ textAlign: 'left', padding: '2px 1px', fontWeight: 'bold' }}>Descripcion</th>
              </tr>
            </thead>
            <tbody>
              {currentJob.items.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px dotted #ccc' }}>
                  <td style={{ padding: '2px 1px', verticalAlign: 'top', textAlign: 'right', fontWeight: 'bold' }}>
                    {item.quantity}
                  </td>
                  <td style={{ padding: '2px 1px', verticalAlign: 'top' }}>{item.code}</td>
                  <td style={{ padding: '2px 1px', verticalAlign: 'top' }}>{item.supplierRef || '—'}</td>
                  <td style={{ padding: '2px 1px', verticalAlign: 'top', wordBreak: 'break-word' }}>{item.name}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Footer */}
          <div style={{ borderTop: '1px dashed #000', marginTop: '4px', paddingTop: '4px', textAlign: 'center', fontSize: '9px' }}>
            Renglones: {currentJob.items.length} | Unidades:{' '}
            {currentJob.items.reduce((sum, i) => sum + i.quantity, 0)}
          </div>
        </div>
      )}
    </>
  );
}
