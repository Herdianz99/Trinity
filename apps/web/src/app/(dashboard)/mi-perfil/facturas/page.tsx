'use client';
import { useEffect, useState } from 'react';

const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-VE') : '—');

interface Factura {
  id: string; number: string; fiscalNumber: string | null; status: string;
  totalUsd: number; totalPaidUsd: number; saldoUsd: number; createdAt: string; isCredit: boolean;
}

export default function MisFacturasPage() {
  const [rows, setRows] = useState<Factura[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { document.title = 'Mis facturas | Trinity ERP'; }, []);
  useEffect(() => {
    fetch('/api/proxy/me/facturas')
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'No disponible'); return r.json(); })
      .then(setRows).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="py-20 text-center text-slate-400">{error}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Mis facturas</h1>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/30 text-slate-400">
              <th className="text-left px-4 py-3">Número</th>
              <th className="text-left px-4 py-3">Fecha</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-right px-4 py-3">Pagado</th>
              <th className="text-right px-4 py-3">Saldo</th>
              <th className="text-center px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id} className="border-b border-slate-700/30">
                <td className="px-4 py-3 text-slate-200">{f.fiscalNumber || f.number}</td>
                <td className="px-4 py-3 text-slate-400">{fmtDate(f.createdAt)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-200">$ {fmt(f.totalUsd)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-400">$ {fmt(f.totalPaidUsd)}</td>
                <td className="px-4 py-3 text-right font-mono text-white">$ {fmt(f.saldoUsd)}</td>
                <td className="px-4 py-3 text-center text-slate-300">{f.status}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-slate-500">No tienes facturas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
