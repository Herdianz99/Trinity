'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Building2, Wallet, ArrowLeftRight, Plus, ChevronRight, DollarSign } from 'lucide-react';

interface Row {
  id: string;
  name: string;
  isActive: boolean;
  inUsd: number;
  outUsd: number;
  balanceUsd: number;
}
interface Summary {
  companies: Row[];
  banks: Row[];
  totalUsd: number;
}

const fmt = (n: number) =>
  (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function BalancePanel({
  title,
  icon,
  rows,
  hrefKey,
  emptyHref,
  emptyLabel,
}: {
  title: string;
  icon: React.ReactNode;
  rows: Row[];
  hrefKey: 'companyId' | 'bankId';
  emptyHref: string;
  emptyLabel: string;
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50">
        {icon}
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <div className="p-6 text-center text-slate-500 text-sm">
          Sin registros.{' '}
          <Link href={emptyHref} className="text-emerald-400 hover:underline">
            {emptyLabel}
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-slate-700/30">
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/divisas/movimientos?${hrefKey}=${r.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-slate-800/40 group"
            >
              <span className={`text-sm ${r.isActive ? 'text-slate-200' : 'text-slate-500'}`}>
                {r.name}
                {!r.isActive && <span className="ml-2 text-[10px] uppercase text-slate-600">inactivo</span>}
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={`text-sm font-mono font-semibold tabular-nums ${
                    r.balanceUsd < 0 ? 'text-red-400' : 'text-emerald-400'
                  }`}
                >
                  ${fmt(r.balanceUsd)}
                </span>
                <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DivisasResumenPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'Compra de divisas | Trinity ERP';
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/divisas/summary');
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Compra de divisas</h1>
          <p className="text-sm text-slate-400">Saldos de dólares por empresa y por banco/ubicación.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/divisas/movimientos?new=1"
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus size={16} /> Registrar movimiento
          </Link>
          <Link
            href="/divisas/movimientos"
            className="inline-flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 px-4 py-2 rounded-lg text-sm font-medium"
          >
            <ArrowLeftRight size={16} /> Ver movimientos
          </Link>
        </div>
      </div>

      {/* Total */}
      <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-t-2 border-emerald-500 border-x border-b border-slate-700/40 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign className="text-emerald-400" size={18} />
          <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total en divisas</span>
        </div>
        <p className="text-4xl font-bold text-emerald-400 tabular-nums">
          ${fmt(data?.totalUsd || 0)}
        </p>
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-500 text-sm">Cargando…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <BalancePanel
            title="Saldo por empresa"
            icon={<Building2 size={16} className="text-blue-400" />}
            rows={data?.companies || []}
            hrefKey="companyId"
            emptyHref="/divisas/empresas"
            emptyLabel="Crear empresa"
          />
          <BalancePanel
            title="Saldo por banco / ubicación"
            icon={<Wallet size={16} className="text-purple-400" />}
            rows={data?.banks || []}
            hrefKey="bankId"
            emptyHref="/divisas/bancos"
            emptyLabel="Crear banco"
          />
        </div>
      )}
    </div>
  );
}
