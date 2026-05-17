'use client';

import { useState, useEffect } from 'react';
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
  Printer,
  Upload,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  Menu,
  X,
  Layers,
  Tag,
  Truck,
  BoxesIcon,
  ArrowLeftRight,
  ClipboardCheck,
  Activity,
  Building2,
  AlertTriangle,
  Monitor,
  FileText,
  UserCheck,
  SlidersHorizontal,
  FileCheck,
  Banknote,
  History,
  HandCoins,
  CreditCard,
  BookOpen,
  BarChart3,
  Shield,
  TrendingUp,
  FileX2,
  Wallet,
} from 'lucide-react';

interface MenuItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface MenuSection {
  key: string;
  label: string;
  icon: React.ReactNode;
  permission: string;
  items: MenuItem[];
}

const menuSections: MenuSection[] = [
  {
    key: 'sales',
    label: 'VENTAS',
    icon: <Banknote size={20} />,
    permission: 'sales',
    items: [
      { label: 'POS', href: '/sales/pos', icon: <Monitor size={18} /> },
      { label: 'Facturas', href: '/sales/invoices', icon: <FileText size={18} /> },
      { label: 'Cotizaciones', href: '/quotations', icon: <FileCheck size={18} /> },
      { label: 'Notas Cr/Db', href: '/credit-debit-notes', icon: <FileX2 size={18} /> },
      { label: 'Clientes', href: '/sales/customers', icon: <UserCheck size={18} /> },
    ],
  },
  {
    key: 'catalog',
    label: 'CATALOGO',
    icon: <Package size={20} />,
    permission: 'catalog',
    items: [
      { label: 'Productos', href: '/catalog/products', icon: <Package size={18} /> },
      { label: 'Categorias', href: '/catalog/categories', icon: <Layers size={18} /> },
      { label: 'Marcas', href: '/catalog/brands', icon: <Tag size={18} /> },
      { label: 'Ajuste de precios', href: '/catalog/price-adjustment', icon: <SlidersHorizontal size={18} /> },
    ],
  },
  {
    key: 'inventory',
    label: 'INVENTARIO',
    icon: <Warehouse size={20} />,
    permission: 'inventory',
    items: [
      { label: 'Stock', href: '/inventory/stock', icon: <BoxesIcon size={18} /> },
      { label: 'Almacenes', href: '/inventory/warehouses', icon: <Building2 size={18} /> },
      { label: 'Transferencias', href: '/inventory/transfers', icon: <ArrowLeftRight size={18} /> },
      { label: 'Conteo fisico', href: '/inventory/count', icon: <ClipboardCheck size={18} /> },
      { label: 'Movimientos', href: '/inventory/movements', icon: <Activity size={18} /> },
    ],
  },
  {
    key: 'purchases',
    label: 'COMPRAS',
    icon: <ShoppingCart size={20} />,
    permission: 'purchases',
    items: [
      { label: 'Ordenes de compra', href: '/purchases', icon: <ShoppingCart size={18} /> },
      { label: 'Sugerencias reorden', href: '/purchases/reorder', icon: <AlertTriangle size={18} /> },
      { label: 'Proveedores', href: '/catalog/suppliers', icon: <Truck size={18} /> },
    ],
  },
  {
    key: 'cash',
    label: 'CAJA',
    icon: <Banknote size={20} />,
    permission: 'cash',
    items: [
      { label: 'Cajas', href: '/cash', icon: <Banknote size={18} /> },
      { label: 'Sesiones', href: '/cash/sessions', icon: <History size={18} /> },
    ],
  },
  {
    key: 'receivables',
    label: 'CxC',
    icon: <HandCoins size={20} />,
    permission: 'receivables',
    items: [
      { label: 'Cuentas por cobrar', href: '/receivables', icon: <HandCoins size={18} /> },
      { label: 'Recibos de cobro', href: '/receipts/collection', icon: <FileText size={18} /> },
      { label: 'Por plataforma', href: '/receivables/platforms', icon: <CreditCard size={18} /> },
    ],
  },
  {
    key: 'payables',
    label: 'CxP',
    icon: <Receipt size={20} />,
    permission: 'payables',
    items: [
      { label: 'Cuentas por pagar', href: '/payables', icon: <Receipt size={18} /> },
      { label: 'Recibos de pago', href: '/receipts/payment', icon: <FileText size={18} /> },
    ],
  },
  {
    key: 'expenses',
    label: 'GASTOS',
    icon: <Wallet size={20} />,
    permission: 'expenses',
    items: [
      { label: 'Gastos', href: '/expenses', icon: <Wallet size={18} /> },
      { label: 'Categorias', href: '/expenses/categories', icon: <Layers size={18} /> },
    ],
  },
  {
    key: 'fiscal',
    label: 'FISCAL',
    icon: <BookOpen size={20} />,
    permission: 'fiscal',
    items: [
      { label: 'Libro de ventas', href: '/fiscal/libro-ventas', icon: <BookOpen size={18} /> },
      { label: 'Libro de compras', href: '/fiscal/libro-compras', icon: <BookOpen size={18} /> },
      { label: 'Resumen fiscal', href: '/fiscal/resumen', icon: <BarChart3 size={18} /> },
    ],
  },
  {
    key: 'reports',
    label: 'REPORTES',
    icon: <TrendingUp size={20} />,
    permission: 'reports',
    items: [
      { label: 'Comisiones', href: '/reports/commissions', icon: <BarChart3 size={18} /> },
    ],
  },
  {
    key: 'settings',
    label: 'CONFIGURACION',
    icon: <Settings size={20} />,
    permission: 'settings',
    items: [
      { label: 'Empresa', href: '/config', icon: <Settings size={18} /> },
      { label: 'Usuarios', href: '/settings/users', icon: <Users size={18} /> },
      { label: 'Permisos por rol', href: '/settings/role-permissions', icon: <Shield size={18} /> },
      { label: 'Vendedores', href: '/settings/sellers', icon: <UserCheck size={18} /> },
      { label: 'Metodos de pago', href: '/settings/payment-methods', icon: <CreditCard size={18} /> },
      { label: 'Cajas', href: '/settings/cash-registers', icon: <Monitor size={18} /> },
      { label: 'Areas de impresion', href: '/settings/print-areas', icon: <Printer size={18} /> },
      { label: 'Importacion masiva', href: '/import', icon: <Upload size={18} /> },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  CASHIER: 'Cajero',
  SELLER: 'Vendedor',
  WAREHOUSE: 'Almacenista',
  BUYER: 'Comprador',
  ACCOUNTANT: 'Contador',
  AUDITOR: 'Auditor',
};

interface SidebarProps {
  user: { name: string; email: string; role: string } | null;
  permissions: string[];
}

function hasPermission(permissions: string[], required: string): boolean {
  if (permissions.includes('*')) return true;
  return permissions.includes(required);
}

const STORAGE_KEY = 'trinity-sidebar-sections';
const COLLAPSED_KEY = 'trinity-sidebar-collapsed';

export default function Sidebar({ user, permissions }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const pathname = usePathname();
  const router = useRouter();

  // Load saved state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setOpenSections(JSON.parse(saved));
      } else {
        // Default: open the section that contains the current route
        const initial: Record<string, boolean> = {};
        menuSections.forEach((section) => {
          if (section.items.some((item) => pathname.startsWith(item.href))) {
            initial[section.key] = true;
          }
        });
        setOpenSections(initial);
      }
      const savedCollapsed = localStorage.getItem(COLLAPSED_KEY);
      if (savedCollapsed) {
        setCollapsed(JSON.parse(savedCollapsed));
      }
    } catch {}
  }, []);

  // Save section state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(openSections));
    } catch {}
  }, [openSections]);

  // Save collapsed state
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed));
    } catch {}
  }, [collapsed]);

  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const filteredSections = menuSections.filter((section) => {
    if (section.key === 'settings') {
      return user?.role === 'ADMIN';
    }
    if (section.key === 'reports') {
      return user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
    }
    return hasPermission(permissions, section.permission);
  });

  const isItemActive = (href: string) => {
    if (pathname === href) return true;
    // Check if current path is a sub-path, but avoid matching /purchases when on /purchases/reorder
    if (pathname.startsWith(href + '/')) {
      // Make sure there's no more specific item that matches
      const moreSpecific = menuSections.some((s) =>
        s.items.some((item) => item.href !== href && item.href.startsWith(href + '/') && pathname.startsWith(item.href))
      );
      return !moreSpecific;
    }
    return false;
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-700/50 flex-shrink-0">
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
      <nav className="flex-1 py-3 overflow-y-auto">
        {/* Dashboard - always visible */}
        <div className="mx-2 mb-1">
          <Link
            href="/dashboard"
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
              transition-all duration-150
              ${pathname === '/dashboard'
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
              }
              ${collapsed ? 'justify-center' : ''}
            `}
            title={collapsed ? 'Dashboard' : undefined}
            onClick={() => setMobileOpen(false)}
          >
            <LayoutDashboard size={20} />
            {!collapsed && <span>Dashboard</span>}
          </Link>
        </div>

        {/* Accordion sections */}
        {filteredSections.map((section) => {
          const isOpen = openSections[section.key] ?? false;
          const hasActiveItem = section.items.some((item) => isItemActive(item.href));

          return (
            <div key={section.key} className="mb-0.5">
              {/* Section header */}
              <button
                onClick={() => {
                  if (collapsed) {
                    setCollapsed(false);
                    setOpenSections((prev) => ({ ...prev, [section.key]: true }));
                  } else {
                    toggleSection(section.key);
                  }
                }}
                className={`
                  flex items-center w-full mx-2 px-3 py-2 rounded-lg text-xs font-bold tracking-wider uppercase
                  transition-all duration-150 cursor-pointer
                  ${hasActiveItem
                    ? 'text-green-400'
                    : 'text-slate-500 hover:text-slate-300'
                  }
                  hover:bg-slate-800/40
                  ${collapsed ? 'justify-center' : 'gap-3'}
                `}
                style={{ width: collapsed ? 'calc(100% - 16px)' : 'calc(100% - 16px)' }}
                title={collapsed ? section.label : undefined}
              >
                <span className={`flex-shrink-0 ${hasActiveItem ? 'text-green-400' : ''}`}>
                  {section.icon}
                </span>
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{section.label}</span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${isOpen ? 'rotate-0' : '-rotate-90'}`}
                    />
                  </>
                )}
              </button>

              {/* Section items */}
              {!collapsed && (
                <div
                  className={`overflow-hidden transition-all duration-200 ease-in-out ${
                    isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  {section.items.map((item) => {
                    const isActive = isItemActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`
                          flex items-center gap-3 mx-2 ml-5 px-3 py-2 rounded-lg text-sm font-medium
                          transition-all duration-150
                          ${isActive
                            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                          }
                        `}
                        onClick={() => setMobileOpen(false)}
                      >
                        <span className={isActive ? 'text-green-400' : ''}>{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-slate-700/50 p-3 flex-shrink-0">
        {!collapsed && user && (
          <div className="px-2 mb-3">
            <p className="text-sm font-medium text-slate-200 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">{ROLE_LABELS[user.role] || user.role}</p>
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
        className="hidden lg:flex items-center justify-center h-10 border-t border-slate-700/50 text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors flex-shrink-0"
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
