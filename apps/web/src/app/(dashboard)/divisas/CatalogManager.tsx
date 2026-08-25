'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Check, X, Pencil, Power, ChevronRight, Coins } from 'lucide-react';
import MoneyInput from '@/components/money-input';

interface CatalogRow {
  id: string;
  name: string;
  isActive: boolean;
  disponibleUsd?: number;
  transitoUsd?: number;
  balanceUsd?: number;
  bsBalance?: number;
}

const fmt = (n: number) =>
  (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Lista de un catálogo del módulo de divisas (Empresas, Bancos o Bancos de origen).
 * Empresas y Bancos muestran su saldo Disponible/Tránsito (desde el summary); las
 * Empresas además muestran su saldo en Bs y permiten "cargar Bs". Los Bancos de
 * origen son un maestro simple (solo nombre + activo).
 */
export default function CatalogManager({
  endpoint,
  dimensionParam,
  titleSingular,
  titlePlural,
  subtitle,
}: {
  endpoint: 'companies' | 'banks' | 'origin-banks';
  dimensionParam?: 'companyId' | 'bankId';
  titleSingular: string;
  titlePlural: string;
  subtitle: string;
}) {
  const isCompanies = endpoint === 'companies';
  const isSimple = endpoint === 'origin-banks'; // sin saldos, no clicable
  const [items, setItems] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  // Carga de Bs (solo empresas)
  const [bsFor, setBsFor] = useState<string | null>(null);
  const [bsAmount, setBsAmount] = useState('');
  const [bsNote, setBsNote] = useState('');

  useEffect(() => {
    document.title = `${titlePlural} | Trinity ERP`;
  }, [titlePlural]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isSimple) {
        const res = await fetch(`/api/proxy/divisas/${endpoint}?all=true`);
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
      } else {
        // El summary ya trae cada empresa/banco con su saldo (activos e inactivos).
        const res = await fetch('/api/proxy/divisas/summary');
        const data = await res.json();
        setItems(Array.isArray(data?.[endpoint]) ? data[endpoint] : []);
      }
    } finally {
      setLoading(false);
    }
  }, [endpoint, isSimple]);

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

  const saveBsLoad = async (companyId: string) => {
    const amount = Number(bsAmount);
    if (!amount || amount <= 0) {
      toast('Ingresa un monto de Bs (> 0)', false);
      return;
    }
    const res = await fetch('/api/proxy/divisas/bs-loads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, amountBs: amount, note: bsNote.trim() || undefined }),
    });
    if (res.ok) {
      setBsFor(null);
      setBsAmount('');
      setBsNote('');
      toast('Bs cargados');
      load();
    } else {
      const e = await res.json().catch(() => ({}));
      toast(e.message || 'Error al cargar Bs', false);
    }
  };

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const RowInner = ({ item }: { item: CatalogRow }) => (
    <>
      <div className="flex-1 min-w-0">
        <div className={`text-sm ${item.isActive ? 'text-slate-100' : 'text-slate-500'}`}>
          {item.name}
          {!item.isActive && <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-600">inactivo</span>}
        </div>
        {!isSimple && (
          <div className="text-[11px] text-slate-500 mt-0.5">
            Disponible ${fmt(item.disponibleUsd || 0)} · Tránsito ${fmt(item.transitoUsd || 0)}
            {isCompanies && <span className="text-sky-300/80"> · Bs {fmt(item.bsBalance || 0)}</span>}
          </div>
        )}
      </div>
      {!isSimple && (
        <span
          className={`text-sm font-mono font-semibold tabular-nums ${
            (item.disponibleUsd || 0) < 0 ? 'text-red-400' : 'text-emerald-400'
          }`}
        >
          ${fmt(item.disponibleUsd || 0)}
        </span>
      )}
      <span className="flex items-center">
        {isCompanies && (
          <button
            onClick={(e) => {
              stop(e);
              setBsFor(bsFor === item.id ? null : item.id);
              setBsAmount('');
              setBsNote('');
            }}
            className="text-slate-500 hover:text-sky-300 p-1"
            title="Cargar Bs"
          >
            <Coins size={15} />
          </button>
        )}
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
        {!isSimple && <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 ml-1" />}
      </span>
    </>
  );

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

      {/* Lista */}
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
                <div key={item.id}>
                  {isSimple ? (
                    <div className="flex items-center gap-3 px-4 py-3 group">
                      <RowInner item={item} />
                    </div>
                  ) : (
                    <Link
                      href={`/divisas/movimientos?${dimensionParam}=${item.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/50 group"
                    >
                      <RowInner item={item} />
                    </Link>
                  )}
                  {/* Cargar Bs (solo empresas) */}
                  {isCompanies && bsFor === item.id && (
                    <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-slate-900/60 border-t border-slate-700/40">
                      <span className="text-xs text-sky-300 font-medium">Cargar Bs a {item.name}:</span>
                      <MoneyInput
                        thousands
                        value={bsAmount === '' ? 0 : Number(bsAmount)}
                        onValueChange={(n) => setBsAmount(n ? String(n) : '')}
                        placeholder="Monto Bs"
                        className="w-36 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-slate-100 text-sm"
                      />
                      <input
                        value={bsNote}
                        onChange={(e) => setBsNote(e.target.value)}
                        placeholder="Nota (opcional)"
                        className="flex-1 min-w-[120px] bg-slate-900 border border-slate-600 rounded px-2 py-1 text-slate-100 text-sm"
                      />
                      <button
                        onClick={() => saveBsLoad(item.id)}
                        className="bg-sky-600 hover:bg-sky-500 text-white px-3 py-1 rounded text-sm font-medium"
                      >
                        Cargar
                      </button>
                      <button onClick={() => setBsFor(null)} className="text-slate-400 hover:text-slate-200 px-2 py-1 text-sm">
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500 mt-3">
        {isSimple
          ? 'Maestro de bancos de origen (Bs). Se usan al registrar un movimiento.'
          : 'Toca una fila para entrar y ver sus movimientos. Los íconos de la derecha son para renombrar o activar/desactivar.'}
        {isCompanies && ' El ícono de moneda carga Bs a la empresa.'}
      </p>
    </div>
  );
}
