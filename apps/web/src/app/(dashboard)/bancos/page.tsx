'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Landmark, Plus, RefreshCw, AlertTriangle } from 'lucide-react';

interface AccountRow {
  id: string;
  name: string;
  bankName: string;
  currency: string;
  accountType: string;
  balance: number;
  pendingCount: number;
}
interface Summary {
  accounts: AccountRow[];
  totalBs: number;
  totalUsd: number;
  methodsSinCuenta: number;
}

const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BancosPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'Bancos | Trinity ERP';
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/bancos/summary');
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  if (loading) return <div className="py-20 text-center text-slate-400">Cargando…</div>;
  if (!data) return null;

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <Landmark className="text-emerald-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Bancos</h1>
            <p className="text-slate-400 text-sm">Saldos, libro banco y conciliación por cuenta.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={16} /> Actualizar
          </button>
          <Link href="/bancos/cuentas" className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Cuentas
          </Link>
        </div>
      </div>

      {data.methodsSinCuenta > 0 && (
        <div className="mb-4 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 text-sm flex items-center gap-2">
          <AlertTriangle size={16} /> Hay {data.methodsSinCuenta} método(s) electrónico(s) sin cuenta bancaria asignada — sus cobros/pagos no
          entrarán al libro banco.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl p-5 bg-slate-800/50 border border-slate-700/40">
          <p className="text-xs text-slate-500 uppercase">Total en Bs</p>
          <p className="text-2xl font-bold text-sky-400 font-mono">Bs {fmt(data.totalBs)}</p>
        </div>
        <div className="rounded-xl p-5 bg-slate-800/50 border border-slate-700/40">
          <p className="text-xs text-slate-500 uppercase">Total en divisas</p>
          <p className="text-2xl font-bold text-emerald-400 font-mono">$ {fmt(data.totalUsd)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.accounts.map((a) => (
          <Link
            key={a.id}
            href={`/bancos/${a.id}`}
            className="rounded-xl p-4 bg-slate-800/50 border border-slate-700/40 hover:bg-slate-800/70 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-medium">{a.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700/50 text-slate-300">{a.currency}</span>
            </div>
            <p className="text-xs text-slate-500">
              {a.bankName} · {a.accountType}
            </p>
            <p className="text-xl font-mono font-bold text-white mt-2">
              {a.currency === 'USD' ? '$ ' : 'Bs '}
              {fmt(a.balance)}
            </p>
            {a.pendingCount > 0 && <p className="text-[11px] text-amber-400 mt-1">{a.pendingCount} sin conciliar</p>}
          </Link>
        ))}
        {data.accounts.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-500">
            No hay cuentas.{' '}
            <Link href="/bancos/cuentas" className="text-emerald-400 hover:underline">
              Crea la primera
            </Link>
            .
          </div>
        )}
      </div>
    </div>
  );
}
