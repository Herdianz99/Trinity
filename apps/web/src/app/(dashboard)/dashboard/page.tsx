import { LayoutDashboard, Package, Users, ShoppingCart } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Vista general del sistema</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Productos', value: '---', icon: <Package size={22} />, color: 'green' },
          { label: 'Usuarios', value: '---', icon: <Users size={22} />, color: 'blue' },
          { label: 'Compras', value: '---', icon: <ShoppingCart size={22} />, color: 'amber' },
          { label: 'Ventas Hoy', value: '---', icon: <LayoutDashboard size={22} />, color: 'purple' },
        ].map((stat) => (
          <div key={stat.label} className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-400 text-sm font-medium">{stat.label}</span>
              <span className="text-slate-500">{stat.icon}</span>
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 card p-6">
        <h2 className="text-lg font-semibold text-white mb-2">Bienvenido a Trinity ERP</h2>
        <p className="text-slate-400 text-sm">
          Sistema de gestion empresarial para ferreterias. Navega por el sidebar para acceder
          a los diferentes modulos del sistema.
        </p>
      </div>
    </div>
  );
}
