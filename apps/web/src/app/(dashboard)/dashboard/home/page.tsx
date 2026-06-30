'use client';

import { useState, useEffect } from 'react';
import { fmtRate } from '@/lib/format';
import { useRouter } from 'next/navigation';
import {
  Monitor, FileText, Landmark, Wallet, Package, ArrowLeftRight,
  RefreshCw, ClipboardList, ShoppingCart, CreditCard, CalendarClock,
  Factory, BookOpen, BarChart3, AlertTriangle, Loader2, AlertCircle,
  ChevronRight, ArrowDownRight, Clock,
} from 'lucide-react';

// ── Role config ──────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  CASHIER: 'Cajero',
  WAREHOUSE: 'Almacen',
  BUYER: 'Comprador',
  ACCOUNTANT: 'Contador',
  AUDITOR: 'Auditor',
};

const ROLE_COLORS: Record<string, string> = {
  CASHIER: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  WAREHOUSE: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  BUYER: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  ACCOUNTANT: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  AUDITOR: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
};

interface QuickLink {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  color: string;
}

const ROLE_LINKS: Record<string, QuickLink[]> = {
  CASHIER: [
    { icon: <Monitor size={24} />, title: 'Ir al POS', description: 'Facturar y cobrar', href: '/sales/pos', color: 'from-blue-500/15 to-blue-600/5 border-blue-500/20 hover:border-blue-400/40' },
    { icon: <FileText size={24} />, title: 'Facturas de hoy', description: 'Mis facturas del dia', href: '/sales/invoices', color: 'from-cyan-500/15 to-cyan-600/5 border-cyan-500/20 hover:border-cyan-400/40' },
    { icon: <Landmark size={24} />, title: 'Cajas', description: 'Abrir o cerrar sesion', href: '/cash', color: 'from-indigo-500/15 to-indigo-600/5 border-indigo-500/20 hover:border-indigo-400/40' },
    { icon: <Wallet size={24} />, title: 'Cuentas por cobrar', description: 'CxC pendientes', href: '/receivables', color: 'from-emerald-500/15 to-emerald-600/5 border-emerald-500/20 hover:border-emerald-400/40' },
  ],
  WAREHOUSE: [
    { icon: <Package size={24} />, title: 'Stock', description: 'Ver existencias', href: '/inventory/stock', color: 'from-amber-500/15 to-amber-600/5 border-amber-500/20 hover:border-amber-400/40' },
    { icon: <ArrowLeftRight size={24} />, title: 'Movimientos', description: 'Historial de inventario', href: '/inventory/movements', color: 'from-orange-500/15 to-orange-600/5 border-orange-500/20 hover:border-orange-400/40' },
    { icon: <RefreshCw size={24} />, title: 'Transferencias', description: 'Entre almacenes', href: '/inventory/transfers', color: 'from-yellow-500/15 to-yellow-600/5 border-yellow-500/20 hover:border-yellow-400/40' },
    { icon: <ClipboardList size={24} />, title: 'Conteo fisico', description: 'Inventario fisico', href: '/inventory/count', color: 'from-lime-500/15 to-lime-600/5 border-lime-500/20 hover:border-lime-400/40' },
  ],
  BUYER: [
    { icon: <ShoppingCart size={24} />, title: 'Facturas de compra', description: 'Gestionar compras', href: '/purchases', color: 'from-violet-500/15 to-violet-600/5 border-violet-500/20 hover:border-violet-400/40' },
    { icon: <CreditCard size={24} />, title: 'Cuentas por pagar', description: 'CxP pendientes', href: '/payables', color: 'from-fuchsia-500/15 to-fuchsia-600/5 border-fuchsia-500/20 hover:border-fuchsia-400/40' },
    { icon: <CalendarClock size={24} />, title: 'Programacion de pagos', description: 'Calendario de pagos', href: '/payment-schedules', color: 'from-pink-500/15 to-pink-600/5 border-pink-500/20 hover:border-pink-400/40' },
    { icon: <Factory size={24} />, title: 'Proveedores', description: 'Directorio', href: '/catalog/suppliers', color: 'from-purple-500/15 to-purple-600/5 border-purple-500/20 hover:border-purple-400/40' },
  ],
  ACCOUNTANT: [
    { icon: <Wallet size={24} />, title: 'Cuentas por cobrar', description: 'CxC pendientes', href: '/receivables', color: 'from-emerald-500/15 to-emerald-600/5 border-emerald-500/20 hover:border-emerald-400/40' },
    { icon: <CreditCard size={24} />, title: 'Cuentas por pagar', description: 'CxP pendientes', href: '/payables', color: 'from-teal-500/15 to-teal-600/5 border-teal-500/20 hover:border-teal-400/40' },
    { icon: <BookOpen size={24} />, title: 'Libro de ventas', description: 'Registro fiscal', href: '/fiscal/libro-ventas', color: 'from-green-500/15 to-green-600/5 border-green-500/20 hover:border-green-400/40' },
    { icon: <BookOpen size={24} />, title: 'Libro de compras', description: 'Registro fiscal', href: '/fiscal/libro-compras', color: 'from-cyan-500/15 to-cyan-600/5 border-cyan-500/20 hover:border-cyan-400/40' },
  ],
  AUDITOR: [
    { icon: <Package size={24} />, title: 'Stock', description: 'Ver existencias', href: '/inventory/stock', color: 'from-slate-400/15 to-slate-500/5 border-slate-400/20 hover:border-slate-300/40' },
    { icon: <ArrowLeftRight size={24} />, title: 'Movimientos', description: 'Historial de inventario', href: '/inventory/movements', color: 'from-zinc-400/15 to-zinc-500/5 border-zinc-400/20 hover:border-zinc-300/40' },
    { icon: <BarChart3 size={24} />, title: 'Analisis ABC', description: 'Rotacion de productos', href: '/purchases/analysis', color: 'from-gray-400/15 to-gray-500/5 border-gray-400/20 hover:border-gray-300/40' },
    { icon: <ClipboardList size={24} />, title: 'Conteo fisico', description: 'Inventario fisico', href: '/inventory/count', color: 'from-neutral-400/15 to-neutral-500/5 border-neutral-400/20 hover:border-neutral-300/40' },
  ],
};

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function HomeDashboardPage() {
  const router = useRouter();
  const now = new Date();

  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [homeData, setHomeData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = 'Inicio | Trinity ERP'; }, []);

  useEffect(() => {
    async function load() {
      try {
        const [meRes, homeRes] = await Promise.all([
          fetch('/api/auth/me'),
          fetch('/api/proxy/dashboard/home'),
        ]);
        if (meRes.ok) {
          const u = await meRes.json();
          setUser({ name: u.name, role: u.role });
          // Redirect admins/supervisors to gerencial
          if (u.role === 'ADMIN' || u.role === 'SUPERVISOR') {
            router.replace('/dashboard');
            return;
          }
          if (u.role === 'SELLER') {
            router.replace('/dashboard/seller');
            return;
          }
        }
        if (homeRes.ok) setHomeData(await homeRes.json());
      } catch {}
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return 'Buenos dias';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  })();

  const todayFormatted = now.toLocaleDateString('es-VE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={32} className="text-slate-400 animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const role = user.role;
  const links = ROLE_LINKS[role] || [];
  const roleLabel = ROLE_LABELS[role] || role;
  const roleColor = ROLE_COLORS[role] || 'bg-slate-500/20 text-slate-300 border-slate-500/30';

  return (
    <div className="space-y-6 max-w-4xl mx-auto -mx-6 -mt-6 lg:-mt-8 lg:-mx-8 px-4 pt-5 pb-8 sm:px-6 sm:pt-6">
      {/* ═══ Header ═══ */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100">
              {greeting}, {user.name.split(' ')[0]}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5 capitalize">{todayFormatted}</p>
          </div>
          <span className={`text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-full border ${roleColor}`}>
            {roleLabel}
          </span>
        </div>
        {homeData?.exchangeRate && (
          <p className="text-xs text-slate-500">
            Tasa BCV: <span className="text-slate-300 font-medium">Bs {fmtRate(homeData.exchangeRate)}</span>
          </p>
        )}
      </div>

      {/* ═══ Quick Access Grid ═══ */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Acceso rapido</h2>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {links.map((link, i) => (
            <button
              key={i}
              onClick={() => router.push(link.href)}
              className={`group bg-gradient-to-br ${link.color} border rounded-xl p-4 sm:p-5 text-left transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20 active:scale-[0.98]`}
            >
              <div className="text-slate-300 group-hover:text-slate-100 transition-colors mb-3">
                {link.icon}
              </div>
              <p className="text-sm font-semibold text-slate-200 group-hover:text-slate-100">{link.title}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{link.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ Role-specific Info ═══ */}
      {homeData && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Informacion rapida</h2>

          {/* CASHIER: Open sessions */}
          {role === 'CASHIER' && homeData.openSessions && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-1.5">
                <Landmark size={14} className="text-blue-400" />
                Cajas abiertas
              </h3>
              {homeData.openSessions.length === 0 ? (
                <p className="text-sm text-slate-500">No hay cajas abiertas</p>
              ) : (
                <div className="space-y-2">
                  {homeData.openSessions.map((s: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{s.registerName}</span>
                      <span className="text-slate-500 text-xs">{s.openedBy} &middot; {new Date(s.openedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* WAREHOUSE: Low stock + Pending transfers */}
          {role === 'WAREHOUSE' && (
            <>
              {homeData.lowStock && homeData.lowStock.length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-1.5">
                    <AlertTriangle size={14} />
                    Productos bajo stock minimo
                  </h3>
                  <div className="space-y-2">
                    {homeData.lowStock.map((p: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="min-w-0 flex-1 mr-3">
                          <span className="text-slate-300 truncate block">{p.productName}</span>
                          <span className="text-[10px] text-slate-500">{p.productCode}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-red-400 font-medium">{p.currentStock}</span>
                          <span className="text-slate-600 text-xs"> / {p.minStock}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {homeData.pendingTransfers > 0 && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RefreshCw size={16} className="text-amber-400" />
                    <span className="text-sm text-slate-300">
                      <span className="font-semibold text-amber-400">{homeData.pendingTransfers}</span> transferencias pendientes
                    </span>
                  </div>
                  <button onClick={() => router.push('/inventory/transfers')} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5">
                    Ver <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </>
          )}

          {/* BUYER: Overdue + Upcoming payables */}
          {role === 'BUYER' && (
            <>
              {homeData.overduePayables && homeData.overduePayables.count > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <AlertTriangle size={14} className="text-red-400" />
                        <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">CxP Vencidas</span>
                      </div>
                      <p className="text-lg font-bold text-slate-100">${fmt(homeData.overduePayables.totalUsd)}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{homeData.overduePayables.count} por pagar</p>
                    </div>
                    <button onClick={() => router.push('/payables')} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5">
                      Ver <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
              {homeData.upcomingPayables > 0 && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-amber-400" />
                    <span className="text-sm text-slate-300">
                      <span className="font-semibold text-amber-400">{homeData.upcomingPayables}</span> pagos por vencer esta semana
                    </span>
                  </div>
                  <button onClick={() => router.push('/payment-schedules')} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5">
                    Ver <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </>
          )}

          {/* ACCOUNTANT: CxC + CxP */}
          {role === 'ACCOUNTANT' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {homeData.receivables && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">CxC Pendientes</span>
                      <p className="text-lg font-bold text-slate-100 mt-1">${fmt(homeData.receivables.totalUsd)}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{homeData.receivables.count} registros</p>
                    </div>
                    <button onClick={() => router.push('/receivables')} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
              {homeData.payables && (
                <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider">CxP Pendientes</span>
                      <p className="text-lg font-bold text-slate-100 mt-1">${fmt(homeData.payables.totalUsd)}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{homeData.payables.count} registros</p>
                    </div>
                    <button onClick={() => router.push('/payables')} className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-0.5">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AUDITOR: Low stock + Recent adjustments */}
          {role === 'AUDITOR' && (
            <>
              {homeData.lowStock && homeData.lowStock.length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-1.5">
                    <AlertTriangle size={14} />
                    Productos bajo stock minimo
                  </h3>
                  <div className="space-y-2">
                    {homeData.lowStock.map((p: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="min-w-0 flex-1 mr-3">
                          <span className="text-slate-300 truncate block">{p.productName}</span>
                          <span className="text-[10px] text-slate-500">{p.productCode}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-red-400 font-medium">{p.currentStock}</span>
                          <span className="text-slate-600 text-xs"> / {p.minStock}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {homeData.recentAdjustments && homeData.recentAdjustments.length > 0 && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-1.5">
                    <ArrowLeftRight size={14} className="text-slate-400" />
                    Ultimos ajustes de inventario
                  </h3>
                  <div className="space-y-2">
                    {homeData.recentAdjustments.map((a: any, i: number) => {
                      const isIn = a.type === 'ADJUSTMENT_IN' || a.type === 'COUNT_ADJUST' && a.quantity > 0;
                      return (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="min-w-0 flex-1 mr-3">
                            <span className="text-slate-300 truncate block">{a.productName}</span>
                            <span className="text-[10px] text-slate-500">{a.productCode} &middot; {a.warehouseName}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={isIn ? 'text-emerald-400' : 'text-red-400'}>
                              {isIn ? '+' : ''}{a.quantity}
                            </span>
                            <p className="text-[10px] text-slate-600">{new Date(a.createdAt).toLocaleDateString('es-VE')}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
