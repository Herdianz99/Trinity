'use client';

import { useState, useEffect } from 'react';
import {
  Truck, Plus, Edit2, Trash2, Loader2, Shield,
} from 'lucide-react';
import Link from 'next/link';

interface Supplier {
  id: string; name: string; rif: string | null; phone: string | null;
  email: string | null; contactName: string | null;
  isRetentionAgent: boolean; isActive: boolean;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function fetchSuppliers() {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/suppliers');
      if (res.ok) setSuppliers(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  useEffect(() => { fetchSuppliers(); }, []);

  async function handleDelete(id: string) {
    if (!confirm('Desactivar este proveedor?')) return;
    const res = await fetch(`/api/proxy/suppliers/${id}`, { method: 'DELETE' });
    if (res.ok) { fetchSuppliers(); setMessage({ type: 'success', text: 'Proveedor desactivado' }); }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Truck className="text-blue-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Proveedores</h1>
            <p className="text-slate-400 text-sm">{suppliers.length} proveedores registrados</p>
          </div>
        </div>
        <Link href="/catalog/suppliers/new" className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nuevo proveedor
        </Link>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">RIF</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Telefono</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Email</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden xl:table-cell">Contacto</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Ret.</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium w-28">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12"><Loader2 className="animate-spin text-green-500 mx-auto" size={28} /></td></tr>
              ) : suppliers.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-500">No hay proveedores registrados</td></tr>
              ) : suppliers.map(s => (
                <tr key={s.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/catalog/suppliers/${s.id}`} className="text-white font-medium hover:text-blue-400 transition-colors">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-400 hidden md:table-cell font-mono text-xs">{s.rif || '—'}</td>
                  <td className="px-4 py-3 text-slate-400 hidden lg:table-cell">{s.phone || '—'}</td>
                  <td className="px-4 py-3 text-slate-400 hidden lg:table-cell">{s.email || '—'}</td>
                  <td className="px-4 py-3 text-slate-400 hidden xl:table-cell">{s.contactName || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {s.isRetentionAgent ? <span title="Agente de retencion"><Shield size={16} className="inline text-amber-400" /></span> : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s.isActive ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Activo</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Link href={`/catalog/suppliers/${s.id}`} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" title="Editar">
                        <Edit2 size={14} />
                      </Link>
                      <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors" title="Desactivar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
