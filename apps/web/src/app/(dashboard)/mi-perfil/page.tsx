'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, Receipt, Bell } from 'lucide-react';

const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function MiPerfilResumenPage() {
  const [data, setData] = useState<{ saldoCxcUsd: number; facturasPendientes: number; notificacionesPendientes: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'Mi Perfil | Trinity ERP'; }, []);
  useEffect(() => {
    fetch('/api/proxy/me/resumen')
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'No disponible'); return r.json(); })
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="py-20 text-center text-slate-400">{error}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Mi Perfil</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/mi-perfil/cxc" className="card p-5 hover:bg-slate-800/40">
          <div className="flex items-center gap-3 text-slate-400"><CreditCard size={18} /> Saldo por cobrar</div>
          <div className="mt-2 text-2xl font-bold text-white font-mono">$ {fmt(data?.saldoCxcUsd ?? 0)}</div>
        </Link>
        <Link href="/mi-perfil/facturas" className="card p-5 hover:bg-slate-800/40">
          <div className="flex items-center gap-3 text-slate-400"><Receipt size={18} /> Facturas pendientes</div>
          <div className="mt-2 text-2xl font-bold text-white">{data?.facturasPendientes ?? 0}</div>
        </Link>
        <Link href="/mi-perfil/notificaciones" className="card p-5 hover:bg-slate-800/40">
          <div className="flex items-center gap-3 text-slate-400"><Bell size={18} /> Notificaciones pendientes</div>
          <div className="mt-2 text-2xl font-bold text-white">{data?.notificacionesPendientes ?? 0}</div>
        </Link>
      </div>
    </div>
  );
}
