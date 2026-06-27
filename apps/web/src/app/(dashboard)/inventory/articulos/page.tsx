'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  PackageSearch, Search, Loader2, X, ChevronLeft, ChevronRight, Activity, ScanLine,
} from 'lucide-react';
import { BarcodeScanner } from '@/components/barcode-scanner';

// ── Types ──
interface StockRow { quantity: number; warehouse: { id: string; name: string }; }
interface Product {
  id: string;
  code: string;
  supplierRef: string | null;
  name: string;
  priceDetal: number;
  priceMayor: number;
  stock: StockRow[];
}
interface Movement {
  id: string;
  type: string;
  quantity: number;
  stockAfter: number;
  reason: string | null;
  reference: string | null;
  createdAt: string;
  warehouse: { id: string; name: string };
}

const MOVEMENT_LABELS: Record<string, { label: string; color: string }> = {
  PURCHASE: { label: 'Compra', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  SALE: { label: 'Venta', color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  ADJUSTMENT_IN: { label: 'Ajuste +', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  ADJUSTMENT_OUT: { label: 'Ajuste -', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
  TRANSFER_IN: { label: 'Transf. +', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  TRANSFER_OUT: { label: 'Transf. -', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  COUNT_ADJUST: { label: 'Conteo', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
  RETURN_IN: { label: 'Devol. +', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  RETURN_OUT: { label: 'Devol. -', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
  REPLACEMENT_IN: { label: 'Reemplazo +', color: 'bg-teal-500/10 text-teal-400 border-teal-500/20' },
  REPLACEMENT_OUT: { label: 'Reemplazo -', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
};

const fmtBs = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

function totalStock(p: Product): number {
  return p.stock.reduce((sum, s) => sum + s.quantity, 0);
}

export default function InventoryArticlesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [rate, setRate] = useState(0);
  const [showScanner, setShowScanner] = useState(false);

  // Kardex panel
  const [selected, setSelected] = useState<Product | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [kLoading, setKLoading] = useState(false);
  const [kPage, setKPage] = useState(1);
  const [kTotalPages, setKTotalPages] = useState(1);

  useEffect(() => { document.title = 'Consultar Articulos | Trinity ERP'; }, []);

  // exchange rate (once)
  useEffect(() => {
    fetch('/api/proxy/exchange-rate/today')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.rate) setRate(d.rate); })
      .catch(() => {});
  }, []);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25', isActive: 'true' });
      if (debounced) params.set('search', debounced);
      const res = await fetch(`/api/proxy/products?${params}`);
      if (res.ok) {
        const d = await res.json();
        setProducts(d.data || []);
        setTotalPages(d.totalPages || 1);
        setTotal(d.total || 0);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [page, debounced]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const fetchKardex = useCallback(async (productId: string, p: number) => {
    setKLoading(true);
    try {
      const res = await fetch(`/api/proxy/stock-movements/kardex/${productId}?page=${p}&limit=50`);
      if (res.ok) {
        const d = await res.json();
        setMovements(d.data || []);
        setKTotalPages(d.meta?.totalPages || 1);
      }
    } catch { /* ignore */ } finally {
      setKLoading(false);
    }
  }, []);

  function openKardex(p: Product) {
    setSelected(p);
    setKPage(1);
    fetchKardex(p.id, 1);
  }
  function closeKardex() {
    setSelected(null);
    setMovements([]);
  }
  function changeKardexPage(p: number) {
    if (!selected) return;
    setKPage(p);
    fetchKardex(selected.id, p);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <PackageSearch className="text-green-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Consultar Articulos</h1>
          <p className="text-slate-400 text-sm">Consulta de existencias, precios y kardex (solo lectura)</p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 flex items-center gap-2 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            type="text"
            placeholder="Buscar por codigo, nombre o referencia..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-9 !py-2.5 text-sm w-full"
            autoComplete="off"
          />
        </div>
        <button
          onClick={() => setShowScanner(true)}
          className="btn-secondary !py-2.5 px-3 flex items-center gap-2 flex-shrink-0"
          title="Buscar con el escaner"
        >
          <ScanLine size={18} />
          <span className="hidden sm:inline text-sm">Escanear</span>
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Codigo</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Ref. proveedor</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Nombre</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Existencias</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Precio USD</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Precio Bs</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12"><Loader2 className="animate-spin text-green-500 mx-auto" size={28} /></td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-500">No se encontraron articulos</td></tr>
              ) : products.map(p => {
                const exist = totalStock(p);
                return (
                  <tr
                    key={p.id}
                    onClick={() => openKardex(p)}
                    className="border-b border-slate-700/30 hover:bg-slate-700/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-green-400 whitespace-nowrap">{p.code}</td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs hidden md:table-cell">{p.supplierRef || '—'}</td>
                    <td className="px-4 py-2.5 text-white">{p.name}</td>
                    <td className={`px-4 py-2.5 text-right font-mono ${exist <= 0 ? 'text-red-400' : 'text-slate-200'}`}>{exist}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-200">${p.priceDetal.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-400">{rate > 0 ? `Bs ${fmtBs(p.priceDetal * rate)}` : '—'}</td>
                    <td className="px-2 py-2.5 text-center text-slate-500"><Activity size={15} className="inline" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <span className="text-sm text-slate-400">Pagina {page} de {totalPages} ({total} articulos)</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Kardex side panel ═══ */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={closeKardex} />
          <div className="relative w-full sm:max-w-2xl bg-slate-900 border-l border-slate-700/50 h-full overflow-y-auto shadow-2xl">
            {/* Panel header */}
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700/50 px-5 py-4 flex items-start justify-between gap-4 z-10">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-green-400">{selected.code}</span>
                  {selected.supplierRef && <span className="text-xs text-slate-500">Ref: {selected.supplierRef}</span>}
                </div>
                <h2 className="text-lg font-bold text-white mt-0.5">{selected.name}</h2>
                <div className="flex items-center gap-4 text-xs text-slate-400 mt-1">
                  <span>Existencias: <span className="font-mono text-slate-200">{totalStock(selected)}</span></span>
                  <span>Precio: <span className="font-mono text-slate-200">${selected.priceDetal.toFixed(2)}</span></span>
                  {rate > 0 && <span className="font-mono text-slate-500">Bs {fmtBs(selected.priceDetal * rate)}</span>}
                </div>
              </div>
              <button onClick={closeKardex} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            {/* Kardex */}
            <div className="p-5">
              <p className="text-sm font-medium text-slate-300 mb-3">Kardex — movimientos</p>
              {kLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-green-500" size={24} /></div>
              ) : movements.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">Sin movimientos</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="text-left px-2 py-2 text-slate-400 font-medium">Fecha</th>
                        <th className="text-left px-2 py-2 text-slate-400 font-medium">Tipo</th>
                        <th className="text-right px-2 py-2 text-slate-400 font-medium">Cant.</th>
                        <th className="text-right px-2 py-2 text-slate-400 font-medium">Saldo</th>
                        <th className="text-left px-2 py-2 text-slate-400 font-medium hidden sm:table-cell">Almacen</th>
                        <th className="text-left px-2 py-2 text-slate-400 font-medium">Referencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map(m => {
                        const ml = MOVEMENT_LABELS[m.type] || { label: m.type, color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' };
                        return (
                          <tr key={m.id} className="border-b border-slate-700/30">
                            <td className="px-2 py-2 text-slate-300 whitespace-nowrap">{fmtDateTime(m.createdAt)}</td>
                            <td className="px-2 py-2"><span className={`px-1.5 py-0.5 rounded-full border text-[10px] ${ml.color}`}>{ml.label}</span></td>
                            <td className={`px-2 py-2 text-right font-mono ${m.quantity >= 0 ? 'text-green-400' : 'text-red-400'}`}>{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
                            <td className="px-2 py-2 text-right font-mono text-white">{m.stockAfter}</td>
                            <td className="px-2 py-2 text-slate-400 hidden sm:table-cell">{m.warehouse.name}</td>
                            <td className="px-2 py-2 text-slate-400">{m.reference || m.reason || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {kTotalPages > 1 && (
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-slate-400">Pagina {kPage} de {kTotalPages}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => changeKardexPage(Math.max(1, kPage - 1))} disabled={kPage <= 1} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30">
                      <ChevronLeft size={15} />
                    </button>
                    <button onClick={() => changeKardexPage(Math.min(kTotalPages, kPage + 1))} disabled={kPage >= kTotalPages} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30">
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showScanner && (
        <BarcodeScanner
          onScan={(code) => { setSearch(code); setShowScanner(false); }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
