'use client';
import { useEffect, useState } from 'react';

const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FRECUENCIA: Record<string, string> = { WEEKLY: 'Semanal', BIWEEKLY: 'Quincenal', MONTHLY: 'Mensual' };

interface Perfil {
  code: string | null; bank: string | null; salaryBaseUsd: number; frequency: string;
  department: { name: string } | null; position: { name: string } | null;
  customer: { name: string; documentType: string; rif: string | null; phone: string | null; email: string | null; address: string | null; creditLimit: number; creditDays: number };
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-slate-700/30">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-200 text-right">{value ?? '—'}</span>
    </div>
  );
}

export default function MisDatosPage() {
  const [p, setP] = useState<Perfil | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { document.title = 'Mis datos | Trinity ERP'; }, []);
  useEffect(() => {
    fetch('/api/proxy/me/perfil')
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'No disponible'); return r.json(); })
      .then(setP).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="py-20 text-center text-slate-400">{error}</div>;
  if (!p) return <div className="py-20 text-center text-slate-400">Cargando…</div>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">Mis datos</h1>
      <div className="card p-6">
        <Row label="Nombre" value={p.customer.name} />
        <Row label="Documento" value={`${p.customer.documentType}-${p.customer.rif ?? ''}`} />
        <Row label="Teléfono" value={p.customer.phone} />
        <Row label="Correo" value={p.customer.email} />
        <Row label="Dirección" value={p.customer.address} />
        <Row label="Departamento" value={p.department?.name} />
        <Row label="Cargo" value={p.position?.name} />
        <Row label="Frecuencia de pago" value={FRECUENCIA[p.frequency] || p.frequency} />
        <Row label="Banco" value={p.bank} />
        <Row label="Límite de crédito" value={`$ ${fmt(p.customer.creditLimit)}`} />
        <Row label="Días de crédito" value={p.customer.creditDays} />
      </div>
      <p className="mt-3 text-xs text-slate-500">Si algún dato está incorrecto, contacta a Recursos Humanos.</p>
    </div>
  );
}
