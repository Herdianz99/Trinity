'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock, Loader2, ShoppingCart, User, DollarSign } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface PendingInvoice {
  id: string;
  number: string;
  status: string;
  totalUsd: number;
  totalBs: number;
  exchangeRate: number;
  createdAt: string;
  customer: { id: string; name: string; rif: string | null } | null;
  items: { id: string; productName: string; quantity: number; unitPrice: number; totalUsd: number }[];
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

export default function PendingPage() {
  const [invoices, setInvoices] = useState<PendingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/invoices/pending');
      const data = await res.json();
      setInvoices(Array.isArray(data) ? data : []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 30000);
    return () => clearInterval(interval);
  }, [fetchPending]);

  function handleCollect(id: string) {
    router.push(`/sales/pos?invoiceId=${id}`);
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <Clock className="text-amber-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Pre-facturas Pendientes</h1>
          <p className="text-slate-400 text-sm">{invoices.length} pendientes de cobro</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-green-500" size={32} />
        </div>
      ) : invoices.length === 0 ? (
        <div className="card p-12 text-center">
          <Clock className="mx-auto text-slate-600 mb-3" size={40} />
          <p className="text-slate-400">No hay pre-facturas pendientes</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {invoices.map(inv => (
            <div key={inv.id} className="card p-4 flex flex-col gap-3 hover:border-green-500/30 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono text-green-400">{inv.number}</span>
                <span className="text-xs text-slate-500">{timeAgo(inv.createdAt)}</span>
              </div>

              {inv.customer && (
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <User size={14} className="text-slate-500" />
                  <span>{inv.customer.name}</span>
                  {inv.customer.rif && <span className="text-xs text-slate-500">({inv.customer.rif})</span>}
                </div>
              )}

              <div className="text-xs text-slate-500 space-y-0.5">
                {inv.items.slice(0, 3).map(item => (
                  <div key={item.id} className="flex justify-between">
                    <span className="truncate mr-2">{item.quantity}x {item.productName}</span>
                    <span className="flex-shrink-0">${item.totalUsd.toFixed(2)}</span>
                  </div>
                ))}
                {inv.items.length > 3 && (
                  <div className="text-slate-600">+{inv.items.length - 3} items mas</div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
                <div>
                  <span className="text-lg font-bold text-white">${inv.totalUsd.toFixed(2)}</span>
                  <span className="text-xs text-slate-500 ml-2">Bs {inv.totalBs.toFixed(2)}</span>
                </div>
                <button
                  onClick={() => handleCollect(inv.id)}
                  className="btn-primary !py-2 !px-4 text-sm flex items-center gap-2"
                >
                  <DollarSign size={16} /> Cobrar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
