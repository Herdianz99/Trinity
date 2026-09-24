'use client';
import { useEffect, useState } from 'react';
import { FileDown } from 'lucide-react';

const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-VE') : '—');

interface Recibo {
  id: string; grossBs: number; totalDeductionsBs: number; netBs: number; netUsd: number; creditDeductionBs: number;
  payrollRun: { id: string; number: string; periodFrom: string; periodTo: string; type: string };
}

export default function MisRecibosPage() {
  const [rows, setRows] = useState<Recibo[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { document.title = 'Mis recibos de nómina | Trinity ERP'; }, []);
  useEffect(() => {
    fetch('/api/proxy/me/recibos')
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'No disponible'); return r.json(); })
      .then(setRows).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="py-20 text-center text-slate-400">{error}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Mis recibos de nómina</h1>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/30 text-slate-400">
              <th className="text-left px-4 py-3">Período</th>
              <th className="text-right px-4 py-3">Bruto (Bs)</th>
              <th className="text-right px-4 py-3">Deducciones (Bs)</th>
              <th className="text-right px-4 py-3">Abono a deuda (Bs)</th>
              <th className="text-right px-4 py-3">Neto (Bs)</th>
              <th className="text-center px-4 py-3">Recibo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-700/30">
                <td className="px-4 py-3 text-slate-200">{fmtDate(r.payrollRun.periodFrom)} – {fmtDate(r.payrollRun.periodTo)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-200">{fmt(r.grossBs)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-400">{fmt(r.totalDeductionsBs)}</td>
                <td className="px-4 py-3 text-right font-mono text-amber-300">{fmt(r.creditDeductionBs)}</td>
                <td className="px-4 py-3 text-right font-mono text-white">{fmt(r.netBs)}</td>
                <td className="px-4 py-3 text-center">
                  <a href={`/api/proxy/me/recibos/${r.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-400 hover:underline">
                    <FileDown size={15} /> PDF
                  </a>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-slate-500">No tienes recibos.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
