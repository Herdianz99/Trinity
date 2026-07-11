'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Se llama al elegir una sugerencia, con el producto COMPLETO (para copiar atributos). */
  onPickTemplate: (product: any) => void;
  /** Si es false, se comporta como un input normal (sin sugerencias). Ej: modo edicion. */
  enabled?: boolean;
  className?: string;
  required?: boolean;
}

// Campo de nombre con autocompletado desde productos existentes: al elegir una sugerencia
// copia su nombre (y el padre copia los atributos como plantilla) para estandarizar la
// nomenclatura y ayudar a la busqueda. Reusa la busqueda tolerante /products?search=.
export default function ProductNameSuggest({ value, onChange, onPickTemplate, enabled = true, className, required }: Props) {
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [searching, setSearching] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<any>(null);
  const justPicked = useRef(false);

  // Cerrar al hacer clic afuera
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Busqueda con debounce (solo si esta habilitado y abierto)
  useEffect(() => {
    if (!enabled || !open) return;
    const q = value.trim();
    if (debounce.current) clearTimeout(debounce.current);
    if (q.length < 2) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/proxy/products?search=${encodeURIComponent(q)}&limit=20`);
        const data = await res.json();
        const list = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
        // Dedup por nombre exacto (sin distinguir mayusculas) para no repetir la misma familia
        const seen = new Set<string>();
        const deduped = list.filter((p: any) => {
          const k = (p.name || '').toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        setResults(deduped);
        setHighlight(0);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [value, open, enabled]);

  async function pick(p: any) {
    setOpen(false);
    setResults([]);
    // Traer el producto completo para copiar todos los atributos (la busqueda puede venir liviana)
    let full = p;
    try {
      const res = await fetch(`/api/proxy/products/${p.id}`);
      if (res.ok) full = await res.json();
    } catch { /* usa lo que vino de la busqueda */ }
    onPickTemplate(full);
    // Devolver foco al campo con el cursor al final para editar la medida enseguida
    justPicked.current = true;
    setTimeout(() => {
      const el = inputRef.current;
      if (el) { el.focus(); const len = el.value.length; el.setSelectionRange(len, len); }
    }, 0);
  }

  if (!enabled) {
    return <input type="text" value={value} onChange={e => onChange(e.target.value)} className={className} required={required} />;
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        autoComplete="off"
        required={required}
        className={className}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => {
          // No reabrir justo despues de elegir (el foco vuelve por codigo)
          if (justPicked.current) { justPicked.current = false; return; }
          if (value.trim().length >= 2) setOpen(true);
        }}
        onKeyDown={e => {
          if (!open || results.length === 0) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, results.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(results[highlight]); }
          else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
        }}
      />
      {open && (searching || results.length > 0) && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-slate-700 border border-slate-600 rounded-lg shadow-xl max-h-56 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-600/60 flex items-center gap-1.5">
            <Search size={11} /> Usar como plantilla
            {searching && <Loader2 size={11} className="animate-spin ml-auto" />}
          </div>
          {results.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(p)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${i === highlight ? 'bg-slate-600 text-white' : 'text-slate-200 hover:bg-slate-600/60'}`}
            >
              <span className="font-medium">{p.name}</span>
              {p.code && <span className="ml-2 text-[11px] text-slate-400 font-mono">{p.code}</span>}
            </button>
          ))}
          {!searching && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400">Sin coincidencias</div>
          )}
        </div>
      )}
    </div>
  );
}
