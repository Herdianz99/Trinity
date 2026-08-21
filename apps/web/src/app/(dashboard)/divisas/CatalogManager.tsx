'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Check, X, Pencil, Power, ChevronRight } from 'lucide-react';

interface CatalogRow {
  id: string;
  name: string;
  isActive: boolean;
  balanceUsd: number;
  inUsd: number;
  outUsd: number;
}

const fmt = (n: number) =>
  (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Lista de un catálogo del módulo de divisas (Empresas o Bancos) con su saldo.
 * Cada fila es clicable para ENTRAR a ver sus movimientos; además se pueden
 * crear, renombrar y activar/desactivar.
 */
export default function CatalogManager({
  endpoint,
  dimensionParam,
  titleSingular,
  titlePlural,
  subtitle,
}: {
  endpoint: 'companies' | 'banks';
  dimensionParam: 'companyId' | 'bankId';
  titleSingular: string;
  titlePlural: string;
  subtitle: string;
}) {
  const [items, setItems] = useState<CatalogRow[]>([]);
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
      // El summary ya trae cada empresa/banco con su saldo (activos e inactivos).
      const res = await fetch('/api/proxy/divisas/summary');
      const data = await res.json();
      setItems(Array.isArray(data?.[endpoint]) ? data[endpoint] : []);
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

  const toggleActive = async (item: CatalogRow) => {
    await fetch(`/api/proxy/divisas/${endpoint}/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !item.isActive }),
    });
    load();
  };

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-100 mb-1">{titlePlural}</h1>
      <p className="text-sm text-slate-400 mb-6">{subtitle}</p>

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

      {/* Lista clicable */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-slate-500 text-sm">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">Sin registros. Agrega el primero arriba.</div>
        ) : (
          <div className="divide-y divide-slate-700/30">
            {items.map((item) =>
              editingId === item.id ? (
                <div key={item.id} className="flex items-center gap-2 px-4 py-3">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveEdit(item.id)}
                    autoFocus
                    className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                  />
                  <button onClick={() => saveEdit(item.id)} className="text-emerald-400 hover:text-emerald-300 p-1">
                    <Check size={16} />
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-300 p-1">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <Link
                  key={item.id}
                  href={`/divisas/movimientos?${dimensionParam}=${item.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/50 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm ${item.isActive ? 'text-slate-100' : 'text-slate-500'}`}>
                      {item.name}
                      {!item.isActive && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-600">inactivo</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Entradas ${fmt(item.inUsd)} · Salidas ${fmt(item.outUsd)}
                    </div>
                  </div>
                  <span
                    className={`text-sm font-mono font-semibold tabular-nums ${
                      item.balanceUsd < 0 ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    ${fmt(item.balanceUsd)}
                  </span>
                  {/* Acciones (no navegan) */}
                  <span className="flex items-center">
                    <button
                      onClick={(e) => {
                        stop(e);
                        setEditingId(item.id);
                        setEditName(item.name);
                      }}
                      className="text-slate-500 hover:text-blue-300 p-1"
                      title="Renombrar"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={(e) => {
                        stop(e);
                        toggleActive(item);
                      }}
                      className={`p-1 ${item.isActive ? 'text-slate-500 hover:text-red-300' : 'text-slate-500 hover:text-emerald-300'}`}
                      title={item.isActive ? 'Desactivar' : 'Activar'}
                    >
                      <Power size={15} />
                    </button>
                    <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 ml-1" />
                  </span>
                </Link>
              ),
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500 mt-3">
        Toca una fila para entrar y ver sus movimientos. Los íconos de la derecha son para renombrar o
        activar/desactivar.
      </p>
    </div>
  );
}
