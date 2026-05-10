'use client';

import { useRouter } from 'next/navigation';
import { ShieldX, ArrowLeft } from 'lucide-react';

export default function ForbiddenPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-red-950/20" />

      <div className="relative z-10 text-center mx-4">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 mb-6">
          <ShieldX size={40} className="text-red-400" />
        </div>
        <h1 className="text-4xl font-bold text-white mb-3">403</h1>
        <p className="text-lg text-slate-400 mb-8">
          No tienes permiso para acceder a esta seccion
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          className="btn-primary inline-flex items-center gap-2"
        >
          <ArrowLeft size={18} />
          Volver al inicio
        </button>
      </div>
    </div>
  );
}
