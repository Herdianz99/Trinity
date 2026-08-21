'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Check, X, Pencil, Power } from 'lucide-react';

interface CatalogItem {
  id: string;
  name: string;
  isActive: boolean;
}

/** Administrador reutilizable de catálogos del módulo de divisas (Empresas / Bancos). */
export default function CatalogManager({
  endpoint,
  titleSingular,
  titlePlural,
}: {
  endpoint: 'companies' | 'banks';
  titleSingular: string;
  titlePlural: string;
}) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    document.title = `${titlePlural} | Trinity ERP`;
  }, [titlePlural]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/divisas/${endpoint}?all=true`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  const toast = (text: string, ok = true) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 3000);
  };

  const create = async () => {
    const name = newName.trim();
    if (name.length < 2) return;
    const res = await fetch(`/api/proxy/divisas/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      setNewName('');
      toast(`${titleSingular} creada`);
      load();
    } else {
      const e = await res.json().catch(() => ({}));
      toast(e.message || 'Error al crear', false);
    }
  };

  const saveEdit = async (id: string) => {
    const name = editName.trim();
    if (name.length < 2) return;
    const res = await fetch(`/api/proxy/divisas/${endpoint}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      setEditingId(null);
      toast('Guardado');
      load();
    } else {
      const e = await res.json().catch(() => ({}));
      toast(e.message || 'Error al guardar', false);
    }
  };

  const toggleActive = async (item: CatalogItem) => {
    await fetch(`/api/proxy/divisas/${endpoint}/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !item.isActive }),
    });
    load();
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-100 mb-1">{titlePlural}</h1>
      <p className="text-sm text-slate-400 mb-6">
        Catálogo del módulo de compra de divisas. Solo afecta este módulo.
      </p>

      {message && (
        <div
          className={`mb-4 px-4 py-2 rounded-lg text-sm ${
            message.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Alta */}
      <div className="flex gap-2 mb-6">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder={`Nombre de ${titleSingular.toLowerCase()}…`}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
        />
        <button
          onClick={create}
          className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Agregar
        </button>
      </div>

      {/* Lista */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-slate-500 text-sm">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">Sin registros. Agrega el primero arriba.</div>
        ) : (
          <table className="w-full">
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-700/30 last:border-0 hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    {editingId === item.id ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit(item.id)}
                        autoFocus
                        className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                      />
                    ) : (
                      <span className={`text-sm ${item.isActive ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                        {item.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 w-24 text-right">
                    {!item.isActive && (
                      <span className="text-[11px] uppercase tracking-wide text-slate-500 mr-2">inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-3 w-32 text-right whitespace-nowrap">
                    {editingId === item.id ? (
                      <>
                        <button onClick={() => saveEdit(item.id)} className="text-emerald-400 hover:text-emerald-300 p-1">
                          <Check size={16} />
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-300 p-1">
                          <X size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingId(item.id);
                            setEditName(item.name);
                          }}
                          className="text-slate-400 hover:text-blue-300 p-1"
                          title="Renombrar"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => toggleActive(item)}
                          className={`p-1 ${item.isActive ? 'text-slate-400 hover:text-red-300' : 'text-slate-400 hover:text-emerald-300'}`}
                          title={item.isActive ? 'Desactivar' : 'Activar'}
                        >
                          <Power size={16} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
