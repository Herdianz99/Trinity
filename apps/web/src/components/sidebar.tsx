'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Settings,
  Users,
  Package,
  ShoppingCart,
  Warehouse,
  Receipt,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  X,
  Layers,
  Tag,
  Truck,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  section?: string;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={20} /> },
  { label: 'Configuracion', href: '/config', icon: <Settings size={20} />, section: 'SISTEMA' },
  { label: 'Usuarios', href: '/users', icon: <Users size={20} /> },
  { label: 'Productos', href: '/catalog/products', icon: <Package size={20} />, section: 'CATALOGO' },
  { label: 'Categorias', href: '/catalog/categories', icon: <Layers size={20} /> },
  { label: 'Marcas', href: '/catalog/brands', icon: <Tag size={20} /> },
  { label: 'Proveedores', href: '/catalog/suppliers', icon: <Truck size={20} /> },
  { label: 'Inventario', href: '/inventory', icon: <Warehouse size={20} />, section: 'INVENTARIO' },
  { label: 'Compras', href: '/purchases', icon: <ShoppingCart size={20} />, section: 'COMPRAS' },
  { label: 'Ventas', href: '/sales', icon: <Receipt size={20} />, section: 'VENTAS' },
];

interface SidebarProps {
  user: { name: string; email: string; role: string } | null;
}

export default function Sidebar({ user }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-700/50">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-md">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight whitespace-nowrap">
            Trinity <span className="text-green-400">ERP</span>
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.map((item, idx) => {
          const isActive = pathname === item.href;
          const showSection = item.section && !collapsed;
          const prevItem = navItems[idx - 1];
          const isFirstInSection = item.section && (!prevItem || prevItem.section !== item.section);

          return (
            <div key={item.href}>
              {isFirstInSection && showSection && (
                <div className="px-4 pt-4 pb-2 first:pt-0">
                  <span className="text-[10px] font-bold tracking-[0.15em] text-slate-500 uppercase">
                    {item.section}
                  </span>
                </div>
              )}
              <Link
                href={item.href}
                className={`
                  flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-all duration-150
                  ${isActive
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                  }
                  ${collapsed ? 'justify-center' : ''}
                `}
                title={collapsed ? item.label : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <span className={isActive ? 'text-green-400' : ''}>{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            </div>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-slate-700/50 p-3">
        {!collapsed && user && (
          <div className="px-2 mb-3">
            <p className="text-sm font-medium text-slate-200 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">{user.role}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={`
            flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium
            text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150
            ${collapsed ? 'justify-center' : ''}
          `}
          title={collapsed ? 'Cerrar sesion' : undefined}
        >
          <LogOut size={20} />
          {!collapsed && <span>Cerrar sesion</span>}
        </button>
      </div>

      {/* Collapse toggle (desktop only) */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden lg:flex items-center justify-center h-10 border-t border-slate-700/50 text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors"
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile menu button */}
      <button
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          bg-slate-900/95 backdrop-blur-md border-r border-slate-700/50
          transition-all duration-300 ease-in-out
          ${collapsed ? 'w-[68px]' : 'w-64'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
