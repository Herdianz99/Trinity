'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  documentType?: string;
  rif?: string | null;
  creditDays?: number;
}

interface Props {
  value: string; // customerId seleccionado
  onSelect: (customer: Customer | null) => void;
  placeholder?: string;
  className?: string;
}

// Selector de cliente con búsqueda SERVER-SIDE (por nombre/cédula). Necesario porque la
// empresa grande tiene ~48k clientes: no se pueden cargar todos en un <select> con límite.
export default function CustomerSearchSelect({ value, onSelect, placeholder, className }: Props) {
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<any>(null);

  // Si viene un value preseleccionado sin nombre, traer el nombre del cliente para mostrarlo.
  useEffect(() => {
    if (!value) { setName(''); return; }
    fetch(`/api/proxy/customers/${value}`).then(r => r.ok ? r.json() : null).then(c => { if (c?.name) setName(c.name); }).catch(() => {});
  }, [value]);

  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/proxy/customers?search=${encodeURIComponent(search.trim())}&limit=20&isActive=true`);
        const data = await res.json();
        setResults(Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : []);
      } catch { setResults([]); } finally { setSearching(false); }
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [search, open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={open ? search : (value ? name : '')}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => { setOpen(true); setSearch(''); }}
          placeholder={placeholder || 'Buscar cliente por nombre o cédula…'}
          className={`${className || 'input-field !py-2.5 text-sm'} pl-9`}
        />
        {value && !open ? (
          <button type="button" onClick={() => { onSelect(null); setName(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-red-400"><X size={14} /></button>
        ) : searching ? (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-500" />
        ) : null}
      </div>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-slate-700 border border-slate-600 rounded-lg shadow-xl max-h-56 overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-slate-400">{searching ? 'Buscando…' : 'Sin resultados'}</div>
          ) : results.map(c => (
            <button key={c.id} type="button"
              onClick={() => { onSelect(c); setName(c.name); setOpen(false); setSearch(''); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-600 transition-colors text-white">
              <span className="font-medium">{c.name}</span>
              {c.rif && <span className="ml-2 text-xs text-slate-400">{c.documentType}-{c.rif}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
