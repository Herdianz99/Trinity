'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, ShoppingBag } from 'lucide-react';

export default function PortalHeader({ name }: { name: string }) {
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-3">
        <Link href="/portal" className="flex items-center gap-2 min-w-0">
          <span className="p-1.5 rounded-lg bg-emerald-600/15 border border-emerald-600/30">
            <ShoppingBag size={18} className="text-emerald-400" />
          </span>
          <span className="text-sm font-semibold text-white truncate">Portal de pedidos</span>
        </Link>
        <span className="ml-auto text-xs text-slate-400 truncate max-w-[40%]">{name}</span>
        <button onClick={logout} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800" aria-label="Salir">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
