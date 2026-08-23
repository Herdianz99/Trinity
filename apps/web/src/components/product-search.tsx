'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';

interface StockEntry { quantity: number; warehouseId?: string; warehouse?: { id: string } }

export interface ProductSearchResult {
  id: string;
  code: string;
  name: string;
  supplierRef?: string | null;
  isService?: boolean;
  stock?: StockEntry[];
  // el endpoint /products?search= devuelve el Product completo
  [key: string]: any;
}

interface Props {
  onSelect: (p: ProductSearchResult) => void;
  /** Si se pasa, la existencia mostrada es la de ese almacen; si no, el total entre almacenes. */
  warehouseId?: string;
  /** Marca (y deshabilita) las filas ya agregadas. */
  isAdded?: (p: ProductSearchResult) => boolean;
  /** Deshabilita todas las filas mientras hay una operacion en curso. */
  busy?: boolean;
  placeholder?: string;
  /** Color del codigo (reemplazos usan rojo=sale / verde=entra). */
  accent?: 'green' | 'red';
  limit?: number;
  minChars?: number;
  /** Clase del contenedor (para ancho / margen). */
  className?: string;
}

/** Existencia de un producto: del almacen dado, o total entre almacenes. */
function stockFor(p: ProductSearchResult, warehouseId?: string): number {
  const arr = p.stock || [];
  const rows = warehouseId
    ? arr.filter((s) => (s.warehouse?.id ?? s.warehouseId) === warehouseId)
    : arr;
  return rows.reduce((sum, s) => sum + (s.quantity || 0), 0);
}

/**
 * Buscador de articulos reutilizable. Muestra en cada fila: codigo, ref. proveedor,
 * nombre y existencia. Usado por los buscadores de inventario (ajustes, reemplazos,
 * transferencias). El endpoint /products?search= ya devuelve supplierRef y stock.
 */
export default function ProductSearch({
  onSelect,
  warehouseId,
  isAdded,
  busy = false,
  placeholder = 'Buscar producto...',
  accent = 'green',
  limit = 100,
  minChars = 2,
  className = '',
}: Props) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (text.length < minChars) { setResults([]); setOpen(false); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/proxy/products?search=${encodeURIComponent(text)}&limit=${limit}`);
        if (res.ok) { const d = await res.json(); setResults(d.data || []); setOpen(true); }
      } catch { /* ignore */ } finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [text, limit, minChars]);

  useEffect(() => {
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const codeColor = accent === 'red' ? 'text-red-400' : 'text-green-400';

  function pick(p: ProductSearchResult) {
    onSelect(p);
    setText(''); setResults([]); setOpen(false);
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
        <input
          type="text"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          className="input-field pl-9 !py-2.5 text-sm w-full"
          autoComplete="off"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-500" size={16} />}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700/50 rounded-lg shadow-xl max-h-80 overflow-y-auto">
          {results.map((p) => {
            const added = isAdded ? isAdded(p) : false;
            const ex = stockFor(p, warehouseId);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => !added && !busy && pick(p)}
                disabled={added || busy}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-slate-700/30 last:border-0 ${added ? 'opacity-40 cursor-default' : 'hover:bg-slate-700/50 cursor-pointer'}`}
              >
                {/* Estilo POS: código · ref arriba (mono), nombre completo abajo, badge de existencia a la derecha */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-xs ${codeColor} whitespace-nowrap`}>
                      {p.code}{p.supplierRef ? ` · ${p.supplierRef}` : ''}
                    </span>
                    {added && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full text-green-500 bg-green-500/10 border border-green-500/20 whitespace-nowrap">Agregado</span>
                    )}
                  </div>
                  <p className="text-sm text-white break-words mt-0.5">{p.name}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${ex > 0 ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                  Exist: {ex}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {open && text.length >= minChars && !loading && results.length === 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700/50 rounded-lg shadow-xl p-3 text-center text-xs text-slate-500">
          Sin resultados
        </div>
      )}
    </div>
  );
}
