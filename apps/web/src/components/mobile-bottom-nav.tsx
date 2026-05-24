'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Monitor,
  FileText,
  FileCheck,
  UserCheck,
  LayoutDashboard,
  Package,
  Banknote,
  Clock,
  Menu,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const ROLE_NAV: Record<string, NavItem[]> = {
  SELLER: [
    { label: 'POS', href: '/sales/pos', icon: <Monitor size={20} /> },
    { label: 'Facturas', href: '/sales/invoices', icon: <FileText size={20} /> },
    { label: 'Cotizaciones', href: '/quotations', icon: <FileCheck size={20} /> },
    { label: 'Clientes', href: '/sales/customers', icon: <UserCheck size={20} /> },
  ],
  CASHIER: [
    { label: 'POS', href: '/sales/pos', icon: <Monitor size={20} /> },
    { label: 'Facturas', href: '/sales/invoices', icon: <FileText size={20} /> },
    { label: 'Pendientes', href: '/sales/pending', icon: <Clock size={20} /> },
    { label: 'Caja', href: '/cash', icon: <Banknote size={20} /> },
  ],
  ADMIN: [
    { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={20} /> },
    { label: 'POS', href: '/sales/pos', icon: <Monitor size={20} /> },
    { label: 'Facturas', href: '/sales/invoices', icon: <FileText size={20} /> },
    { label: 'Inventario', href: '/inventory/stock', icon: <Package size={20} /> },
  ],
  SUPERVISOR: [
    { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={20} /> },
    { label: 'POS', href: '/sales/pos', icon: <Monitor size={20} /> },
    { label: 'Facturas', href: '/sales/invoices', icon: <FileText size={20} /> },
    { label: 'Inventario', href: '/inventory/stock', icon: <Package size={20} /> },
  ],
};

// Fallback for roles not explicitly mapped
const DEFAULT_NAV: NavItem[] = [
  { label: 'Inicio', href: '/dashboard', icon: <LayoutDashboard size={20} /> },
  { label: 'POS', href: '/sales/pos', icon: <Monitor size={20} /> },
  { label: 'Facturas', href: '/sales/invoices', icon: <FileText size={20} /> },
  { label: 'Inventario', href: '/inventory/stock', icon: <Package size={20} /> },
];

interface MobileBottomNavProps {
  role: string;
}

export default function MobileBottomNav({ role }: MobileBottomNavProps) {
  const pathname = usePathname();
  const navItems = ROLE_NAV[role] || DEFAULT_NAV;

  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (href !== '/' && pathname.startsWith(href + '/')) return true;
    // Special case: /dashboard sub-routes
    if (href === '/dashboard' && pathname.startsWith('/dashboard')) return true;
    return false;
  };

  const openSidebar = () => {
    window.dispatchEvent(new CustomEvent('trinity-open-sidebar'));
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-700/50 safe-area-bottom">
      <div className="flex items-stretch justify-around h-14">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 gap-0.5 text-[10px] font-medium transition-colors ${
                active
                  ? 'text-green-400'
                  : 'text-slate-500 active:text-slate-300'
              }`}
            >
              <span className={active ? 'text-green-400' : ''}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={openSidebar}
          className="flex flex-col items-center justify-center flex-1 gap-0.5 text-[10px] font-medium text-slate-500 active:text-slate-300 transition-colors"
        >
          <Menu size={20} />
          Mas
        </button>
      </div>
    </nav>
  );
}
