'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Tag, Plus, Pencil, Trash2, Loader2, X, Image as ImageIcon } from 'lucide-react';

interface Brand {
  id: string;
  name: string;
  createdAt: string;
  logoUrl?: string | null;
  _count?: { products: number };
}

export default function BrandsPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function fetchBrands() {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/brands');
      if (res.ok) setBrands(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { document.title = 'Marcas | Trinity ERP'; }, []);
  useEffect(() => { fetchBrands(); }, []);

  async function handleAdd() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/proxy/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        setNewName('');
        setShowAdd(false);
        fetchBrands();
        setMessage({ type: 'success', text: 'Marca creada' });
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: err.message || 'Error' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error al crear marca' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Eliminar la marca "${name}"?`)) return;
    try {
      const res = await fetch(`/api/proxy/brands/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchBrands();
        setMessage({ type: 'success', text: 'Marca eliminada' });
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: err.message || 'Error al eliminar' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error al eliminar' });
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Tag className="text-purple-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Marcas</h1>
            <p className="text-slate-400 text-sm">{brands.length} marcas registradas</p>
          </div>
        </div>
        <button onClick={() => { setShowAdd(true); setNewName(''); }} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nueva marca
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left px-4 py-3 text-slate-400 font-medium w-20">Logo</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Nombre</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Productos</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium w-28">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {showAdd && (
              <tr className="border-b border-slate-700/30 bg-slate-800/40">
                <td className="px-4 py-2" colSpan={3}>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowAdd(false); }}
                    placeholder="Nombre de la marca..."
                    className="input-field !py-1.5 text-sm"
                    autoFocus
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={handleAdd} disabled={saving} className="text-sm text-green-400 hover:text-green-300 font-medium">
                      {saving ? <Loader2 className="animate-spin" size={14} /> : 'Crear'}
                    </button>
                    <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-300"><X size={16} /></button>
                  </div>
                </td>
              </tr>
            )}
            {loading ? (
              <tr><td colSpan={4} className="text-center py-12">
                <Loader2 className="animate-spin text-green-500 mx-auto" size={28} />
              </td></tr>
            ) : brands.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-12 text-slate-500">
                No hay marcas registradas
              </td></tr>
            ) : brands.map(brand => (
              <tr key={brand.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors group">
                <td className="px-4 py-2">
                  <button
                    onClick={() => router.push(`/catalog/brands/${brand.id}`)}
                    className="w-12 h-10 rounded-md bg-slate-800 border border-slate-700/50 flex items-center justify-center overflow-hidden hover:border-slate-500 transition-colors"
                    title="Abrir ficha (subir logo)"
                  >
                    {brand.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={brand.logoUrl} alt={brand.name} className="w-full h-full object-contain p-1" />
                    ) : (
                      <ImageIcon size={16} className="text-slate-600" />
                    )}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => router.push(`/catalog/brands/${brand.id}`)} className="text-white font-medium hover:underline text-left">{brand.name}</button>
                </td>
                <td className="px-4 py-3 text-center text-slate-400">
                  {brand._count?.products || 0}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => router.push(`/catalog/brands/${brand.id}`)}
                      className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                      title="Editar marca / logo"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(brand.id, brand.name)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                      title="Eliminar"
                    >
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
  );
}
