'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserCheck, Plus, Search, Loader2, Edit2, Trash2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

interface Customer {
  id: string; name: string; documentType: string; rif: string | null;
  phone: string | null; email: string | null; creditLimit: number;
  creditDays: number; isActive: boolean;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (search) params.set('search', search);
      const res = await fetch(`/api/proxy/customers?${params}`);
      const data = await res.json();
      setCustomers(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch { setMessage({ type: 'error', text: 'Error al cargar clientes' }); } finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  async function handleDelete(id: string) {
    if (!confirm('Desactivar este cliente?')) return;
    try {
      const res = await fetch(`/api/proxy/customers/${id}`, { method: 'DELETE' });
      if (res.ok) { fetchCustomers(); setMessage({ type: 'success', text: 'Cliente desactivado' }); }
    } catch (err: any) { setMessage({ type: 'error', text: err.message }); }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <UserCheck className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Clientes</h1>
            <p className="text-slate-400 text-sm">{total} clientes registrados</p>
          </div>
        </div>
        <Link href="/sales/customers/new" className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nuevo cliente
        </Link>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          {message.text}
        </div>
      )}

      <div className="card p-4 mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input type="text" placeholder="Buscar por nombre, RIF, telefono..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} className="input-field pl-9 !py-2.5 text-sm" />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden sm:table-cell">RIF</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Telefono</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Tipo</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Credito USD</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12"><Loader2 className="animate-spin text-green-500 mx-auto" size={28} /></td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-500">No se encontraron clientes</td></tr>
              ) : customers.map(c => (
                <tr key={c.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/sales/customers/${c.id}`} className="text-white font-medium hover:text-green-400 transition-colors">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-300 hidden sm:table-cell">{c.rif || '—'}</td>
                  <td className="px-4 py-3 text-slate-300 hidden md:table-cell">{c.phone || '—'}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs px-2 py-0.5 rounded-full border text-blue-400 border-blue-500/30 bg-blue-500/10">
                      {c.documentType || 'V'}-{c.rif || ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300 font-mono">${c.creditLimit.toFixed(2)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${c.isActive ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-red-400 border-red-500/30 bg-red-500/10'}`}>
                      {c.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Link href={`/sales/customers/${c.id}`} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-blue-400" title="Editar">
                        <Edit2 size={15} />
                      </Link>
                      <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-red-400" title="Desactivar">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <span className="text-sm text-slate-400">Pag. {page} de {totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"><ChevronLeft size={18} /></button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"><ChevronRight size={18} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
