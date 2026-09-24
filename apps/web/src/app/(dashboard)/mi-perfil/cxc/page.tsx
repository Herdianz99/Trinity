'use client';
import { useEffect, useState } from 'react';

const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-VE') : '—');

interface Cxc {
  id: string; number: string; documentNumber: string | null; type: string;
  amountUsd: number; paidAmountUsd: number; saldoUsd: number; dueDate: string | null; status: string;
}

export default function MisCxcPage() {
  const [rows, setRows] = useState<Cxc[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { document.title = 'Mis cuentas por cobrar | Trinity ERP'; }, []);
  useEffect(() => {
    fetch('/api/proxy/me/cxc')
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'No disponible'); return r.json(); })
      .then(setRows).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="py-20 text-center text-slate-400">{error}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Mis cuentas por cobrar</h1>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/30 text-slate-400">
              <th className="text-left px-4 py-3">Documento</th>
              <th className="text-left px-4 py-3">Vence</th>
              <th className="text-right px-4 py-3">Monto</th>
              <th className="text-right px-4 py-3">Pagado</th>
              <th className="text-right px-4 py-3">Saldo</th>
              <th className="text-center px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-700/30">
                <td className="px-4 py-3 text-slate-200">{r.documentNumber || r.number}</td>
                <td className="px-4 py-3 text-slate-400">{fmtDate(r.dueDate)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-200">$ {fmt(r.amountUsd)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-400">$ {fmt(r.paidAmountUsd)}</td>
                <td className="px-4 py-3 text-right font-mono text-white">$ {fmt(r.saldoUsd)}</td>
                <td className="px-4 py-3 text-center text-slate-300">{r.status}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-slate-500">No tienes cuentas por cobrar.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
