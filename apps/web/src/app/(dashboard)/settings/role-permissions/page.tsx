'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, Save, Check } from 'lucide-react';

interface RolePermission {
  id: string;
  role: string;
  modules: string[];
  updatedAt: string;
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-red-500/15 text-red-400 border-red-500/30',
  SUPERVISOR: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  CASHIER: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  SELLER: 'bg-green-500/15 text-green-400 border-green-500/30',
  WAREHOUSE: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  BUYER: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  ACCOUNTANT: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  AUDITOR: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
};

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

const MODULE_GROUPS: { group: string; items: { key: string; label: string }[] }[] = [
  {
    group: 'Acceso a Modulos',
    items: [
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'sales', label: 'Ventas y POS' },
      { key: 'quotations', label: 'Cotizaciones' },
      { key: 'catalog', label: 'Catalogo' },
      { key: 'inventory', label: 'Inventario' },
      { key: 'purchases', label: 'Compras' },
      { key: 'cash', label: 'Caja' },
      { key: 'receivables', label: 'Cuentas por Cobrar' },
      { key: 'payables', label: 'Cuentas por Pagar' },
      { key: 'expenses', label: 'Gastos' },
      { key: 'fiscal', label: 'Documentos Fiscales' },
      { key: 'users', label: 'Gestion de Usuarios' },
      { key: 'settings', label: 'Configuracion' },
    ],
  },
  {
    group: 'Notas y Devoluciones',
    items: [
      { key: 'RETURN_INVOICE', label: 'Devolver factura' },
      { key: 'CREDIT_NOTE_SALE', label: 'NC Venta' },
      { key: 'DEBIT_NOTE_SALE', label: 'ND Venta' },
      { key: 'RETURN_PURCHASE', label: 'Devolver compra' },
      { key: 'CREDIT_NOTE_PURCHASE', label: 'NC Compra' },
      { key: 'DEBIT_NOTE_PURCHASE', label: 'ND Compra' },
    ],
  },
  {
    group: 'Administracion',
    items: [
      { key: 'MANAGE_EXPENSES', label: 'Gestionar gastos' },
    ],
  },
];

const AVAILABLE_MODULES = MODULE_GROUPS.flatMap(g => g.items);

const ROLE_ORDER = ['ADMIN', 'SUPERVISOR', 'CASHIER', 'SELLER', 'WAREHOUSE', 'BUYER', 'ACCOUNTANT', 'AUDITOR'];

export default function RolePermissionsPage() {
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [editedModules, setEditedModules] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/role-permissions');
      if (res.ok) {
        const data: RolePermission[] = await res.json();
        setRolePermissions(data);
        const initial: Record<string, string[]> = {};
        data.forEach((rp) => {
          initial[rp.role] = [...rp.modules];
        });
        setEditedModules(initial);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  function toggleModule(role: string, moduleKey: string) {
    if (role === 'ADMIN') return;
    setEditedModules((prev) => {
      const current = prev[role] || [];
      if (current.includes(moduleKey)) {
        return { ...prev, [role]: current.filter((m) => m !== moduleKey) };
      }
      return { ...prev, [role]: [...current, moduleKey] };
    });
  }

  function hasChanged(role: string): boolean {
    const original = rolePermissions.find((rp) => rp.role === role)?.modules || [];
    const edited = editedModules[role] || [];
    if (original.length !== edited.length) return true;
    return !original.every((m) => edited.includes(m));
  }

  async function handleSave(role: string) {
    setSaving((prev) => ({ ...prev, [role]: true }));
    try {
      const res = await fetch(`/api/proxy/role-permissions/${role}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules: editedModules[role] }),
      });
      if (res.ok) {
        const updated = await res.json();
        setRolePermissions((prev) =>
          prev.map((rp) => (rp.role === role ? updated : rp))
        );
        setToast('Permisos actualizados. Los cambios aplican en el proximo login');
      }
    } catch {
    } finally {
      setSaving((prev) => ({ ...prev, [role]: false }));
    }
  }

  const sorted = ROLE_ORDER.map((role) =>
    rolePermissions.find((rp) => rp.role === role)
  ).filter(Boolean) as RolePermission[];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <Shield size={22} className="text-green-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Permisos por rol</h1>
          <p className="text-sm text-slate-400">Configura los modulos accesibles para cada rol</p>
        </div>
      </div>

      {/* Role cards */}
      <div className="space-y-4">
        {sorted.map((rp) => {
          const isAdmin = rp.role === 'ADMIN';
          const modules = isAdmin
            ? AVAILABLE_MODULES.map((m) => m.key)
            : (editedModules[rp.role] || []);
          const changed = hasChanged(rp.role);

          return (
            <div key={rp.role} className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex px-3 py-1 rounded-full text-sm font-bold border ${ROLE_COLORS[rp.role]}`}>
                    {ROLE_LABELS[rp.role] || rp.role}
                  </span>
                  {isAdmin && (
                    <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                      Acceso total
                    </span>
                  )}
                </div>
                {!isAdmin && (
                  <button
                    onClick={() => handleSave(rp.role)}
                    disabled={!changed || saving[rp.role]}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      changed
                        ? 'btn-primary'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    }`}
                  >
                    {saving[rp.role] ? (
                      <>
                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        Guardar cambios
                      </>
                    )}
                  </button>
                )}
              </div>

              {MODULE_GROUPS.map((group) => (
                <div key={group.group} className="mb-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{group.group}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {group.items.map((mod) => {
                      const checked = isAdmin || modules.includes(mod.key);
                      const disabled = isAdmin;

                      return (
                        <label
                          key={mod.key}
                          className={`
                            flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm cursor-pointer select-none transition-all
                            ${disabled ? 'opacity-60 cursor-not-allowed' : ''}
                            ${checked
                              ? 'bg-green-500/10 border-green-500/30 text-green-400'
                              : 'bg-slate-800/40 border-slate-700/50 text-slate-400 hover:bg-slate-800/70 hover:border-slate-600'
                            }
                          `}
                        >
                          <div className={`
                            flex-shrink-0 w-4.5 h-4.5 rounded flex items-center justify-center border transition-colors
                            ${checked
                              ? 'bg-green-500 border-green-500'
                              : 'border-slate-600 bg-slate-800'
                            }
                          `}
                            style={{ width: '18px', height: '18px' }}
                          >
                            {checked && <Check size={12} className="text-white" />}
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleModule(rp.role, mod.key)}
                            className="sr-only"
                          />
                          <span className="truncate">{mod.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 text-sm font-medium shadow-2xl backdrop-blur-sm animate-in slide-in-from-bottom-4">
          <Check size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
