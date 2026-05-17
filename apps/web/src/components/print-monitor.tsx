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

    const lines: string[] = [];
    const w = 42; // 80mm printer ~42 chars
    const sep = '-'.repeat(w);

    lines.push(job.printArea.name.substring(0, w).padStart((w + job.printArea.name.length) / 2));
    lines.push(`Factura: ${job.invoice.number}`.padStart((w + `Factura: ${job.invoice.number}`.length) / 2));
    lines.push(`${dateStr} ${timeStr}`.padStart((w + `${dateStr} ${timeStr}`.length) / 2));
    lines.push(sep);
    lines.push('Cod.   Ref.Prov   Descripcion         Cant');
    lines.push(sep);

    for (const item of job.items) {
      const code = (item.code || '').substring(0, 6).padEnd(6);
      const ref = (item.supplierRef || '-').substring(0, 10).padEnd(10);
      const name = (item.name || '').substring(0, 20).padEnd(20);
      const qty = String(item.quantity).padStart(4);
      lines.push(`${code} ${ref} ${name} ${qty}`);
    }

    lines.push(sep);
    const totalUnits = job.items.reduce((s, i) => s + i.quantity, 0);
    lines.push(`Items: ${job.items.length} | Total unidades: ${totalUnits}`);

    return lines.join('\n');
  }, []);

  const handlePrint = useCallback(async (job: PrintJob) => {
    if (isPrinting.current) return;
    isPrinting.current = true;

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
  }, [markAsPrinted, buildTicketText]);

  const fetchPendingJobs = useCallback(async () => {
    if (isPrinting.current || !printAreaId.current) return;

    try {
      const res = await fetch(
        `/api/proxy/print-jobs/pending?printAreaId=${printAreaId.current}`
      );
      if (!res.ok) return;

      const jobs: PrintJob[] = await res.json();

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
    // Read printAreaId from localStorage
    const storedId = localStorage.getItem('printAreaId');
    if (!storedId) return;
    printAreaId.current = storedId;

    // Initial fetch
    fetchPendingJobs();

    // Start polling
    const interval = setInterval(fetchPendingJobs, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchPendingJobs]);

  // Listen for localStorage changes (e.g. from another tab or settings page)
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === 'printAreaId') {
        printAreaId.current = e.newValue;
        processedIds.current.clear();
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  if (!currentJob) return null;

  const createdDate = new Date(currentJob.createdAt);
  const dateStr = createdDate.toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeStr = createdDate.toLocaleTimeString('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return (
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
              /* Hide everything except the ticket */
              body * {
                visibility: hidden !important;
              }
              #print-ticket,
              #print-ticket * {
                visibility: visible !important;
              }
              #print-ticket {
                position: fixed !important;
                left: 0 !important;
                top: 0 !important;
                width: 80mm !important;
              }
              @page {
                size: 80mm auto;
                margin: 0;
              }
            }
          `,
        }}
      />

      {/* Header */}
      <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '4px', marginBottom: '4px' }}>
        <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
          {currentJob.printArea.name}
        </div>
        <div style={{ marginTop: '2px' }}>
          Factura: {currentJob.invoice.number}
        </div>
        <div>
          {dateStr} {timeStr}
        </div>
      </div>

      {/* Items table */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '10px',
        }}
      >
        <thead>
          <tr style={{ borderBottom: '1px solid #000' }}>
            <th style={{ textAlign: 'left', padding: '2px 1px', fontWeight: 'bold' }}>Cod.</th>
            <th style={{ textAlign: 'left', padding: '2px 1px', fontWeight: 'bold' }}>Ref.Prov</th>
            <th style={{ textAlign: 'left', padding: '2px 1px', fontWeight: 'bold' }}>Descripcion</th>
            <th style={{ textAlign: 'right', padding: '2px 1px', fontWeight: 'bold' }}>Cant</th>
          </tr>
        </thead>
        <tbody>
          {currentJob.items.map((item, idx) => (
            <tr key={idx} style={{ borderBottom: '1px dotted #ccc' }}>
              <td style={{ padding: '2px 1px', verticalAlign: 'top' }}>{item.code}</td>
              <td style={{ padding: '2px 1px', verticalAlign: 'top' }}>{item.supplierRef || '—'}</td>
              <td style={{ padding: '2px 1px', verticalAlign: 'top', wordBreak: 'break-word' }}>{item.name}</td>
              <td style={{ padding: '2px 1px', verticalAlign: 'top', textAlign: 'right', fontWeight: 'bold' }}>
                {item.quantity}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer */}
      <div style={{ borderTop: '1px dashed #000', marginTop: '4px', paddingTop: '4px', textAlign: 'center', fontSize: '9px' }}>
        Items: {currentJob.items.length} | Total unidades:{' '}
        {currentJob.items.reduce((sum, i) => sum + i.quantity, 0)}
      </div>
    </div>
  );
}
