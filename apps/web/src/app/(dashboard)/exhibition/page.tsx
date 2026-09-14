'use client';

import { useState, useEffect, useCallback } from 'react';
import { Store, Search, Plus, X, Loader2, History, Camera } from 'lucide-react';
import { BarcodeScanner } from '@/components/barcode-scanner';

interface Prod {
  id: string;
  code: string;
  name: string;
  barcode: string | null;
  isExhibited: boolean;
  exhibitedSince: string | null;
  exhibitionLocation: string | null;
  daysExhibited: number | null;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
}

interface HistEntry {
  id: string;
  action: 'PLACED' | 'REMOVED';
  location: string | null;
  reason: string | null;
  note: string | null;
  createdAt: string;
  createdBy: { name: string } | null;
}

const REASONS = [
  { value: 'SOLD', label: 'Vendido' },
  { value: 'DAMAGED', label: 'Dañado' },
  { value: 'ROTATION', label: 'Rotación' },
  { value: 'OTHER', label: 'Otro' },
];
const REASON_LABEL: Record<string, string> = {
  SOLD: 'Vendido', DAMAGED: 'Dañado', ROTATION: 'Rotación', OTHER: 'Otro',
};

export default function ExhibitionPage() {
  const [rows, setRows] = useState<Prod[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [exhibitedFilter, setExhibitedFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  // Modal poner
  const [placeTarget, setPlaceTarget] = useState<Prod | null>(null);
  const [placeLocation, setPlaceLocation] = useState('');
  // Modal retirar
  const [removeTarget, setRemoveTarget] = useState<Prod | null>(null);
  const [removeReason, setRemoveReason] = useState('OTHER');
  const [removeNote, setRemoveNote] = useState('');
  // Modal historial
  const [historyTarget, setHistoryTarget] = useState<Prod | null>(null);
  const [historyEntries, setHistoryEntries] = useState<HistEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => { document.title = 'Exhibición | Trinity ERP'; }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '50');
      if (search) params.set('search', search);
      if (exhibitedFilter === 'yes') params.set('exhibited', 'true');
      if (exhibitedFilter === 'no') params.set('exhibited', 'false');
      const res = await fetch(`/api/proxy/exhibition/products?${params}`);
      const data = await res.json();
      setRows(data.data || []);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar artículos' });
    } finally {
      setLoading(false);
    }
  }, [search, exhibitedFilter]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 4000); return () => clearTimeout(t); }
  }, [message]);

  async function confirmPlace() {
    if (!placeTarget) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/proxy/exhibition/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: placeTarget.id, location: placeLocation || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Error');
      setMessage({ type: 'success', text: 'Artículo puesto en exhibición' });
      setPlaceTarget(null); setPlaceLocation('');
      await fetchRows();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally { setProcessing(false); }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/proxy/exhibition/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: removeTarget.id, reason: removeReason, note: removeNote || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Error');
      setMessage({ type: 'success', text: 'Artículo retirado de exhibición' });
      setRemoveTarget(null); setRemoveReason('OTHER'); setRemoveNote('');
      await fetchRows();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally { setProcessing(false); }
  }

  async function openHistory(p: Prod) {
    setHistoryTarget(p); setHistoryLoading(true); setHistoryEntries([]);
    try {
      const res = await fetch(`/api/proxy/exhibition/products/${p.id}/history`);
      const data = await res.json();
      setHistoryEntries(data.entries || []);
    } finally { setHistoryLoading(false); }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <Store size={22} className="text-green-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Exhibición</h1>
          <p className="text-sm text-slate-400">Control de artículos en exhibición</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-4">
        <form onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); }} className="w-full sm:flex-1 sm:min-w-[220px] relative order-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por código, nombre o barras…"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200"
          />
        </form>
        <button
          type="button"
          onClick={() => setShowScanner(true)}
          className="order-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm hover:bg-slate-700"
          title="Escanear código de barras"
        >
          <Camera size={16} /> Escanear
        </button>
        <select
          value={exhibitedFilter}
          onChange={(e) => setExhibitedFilter(e.target.value as any)}
          className="order-3 flex-1 sm:flex-none bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
        >
          <option value="all">Todos</option>
          <option value="yes">Exhibidos</option>
          <option value="no">No exhibidos</option>
        </select>
      </div>

      {message && (
        <div className={`mb-3 px-4 py-2 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center text-slate-500"><Loader2 className="animate-spin mx-auto" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center text-slate-500">Sin artículos</div>
      ) : (
        <>
          {/* Desktop: tabla */}
          <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800">
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Artículo</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Ubicación</th>
                  <th className="px-4 py-3 text-center">Días</th>
                  <th className="px-4 py-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className={`border-b border-slate-800/50 ${p.isExhibited ? 'bg-green-500/5' : ''}`}>
                    <td className="px-4 py-2.5 text-slate-300 font-mono text-xs">{p.code}</td>
                    <td className="px-4 py-2.5 text-slate-200">{p.name}</td>
                    <td className="px-4 py-2.5">
                      {p.isExhibited
                        ? <span className="text-green-400">Exhibido</span>
                        : <span className="text-slate-500">No exhibido</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400">{p.exhibitionLocation || '—'}</td>
                    <td className="px-4 py-2.5 text-center text-slate-400">{p.daysExhibited ?? '—'}</td>
                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                      {p.isExhibited ? (
                        <button onClick={() => setRemoveTarget(p)} className="px-3 py-1.5 rounded-lg text-red-400 bg-red-500/10 hover:bg-red-500/20 text-xs">
                          Retirar
                        </button>
                      ) : (
                        <button onClick={() => { setPlaceTarget(p); setPlaceLocation(''); }} className="px-3 py-1.5 rounded-lg text-green-400 bg-green-500/10 hover:bg-green-500/20 text-xs inline-flex items-center gap-1">
                          <Plus size={14} /> Exhibir
                        </button>
                      )}
                      <button onClick={() => openHistory(p)} title="Historial" className="ml-2 p-1.5 rounded-lg text-slate-400 hover:bg-slate-800">
                        <History size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: tarjetas */}
          <div className="md:hidden space-y-2">
            {rows.map((p) => (
              <div key={p.id} className={`bg-slate-900 border rounded-xl p-3 ${p.isExhibited ? 'border-green-500/30' : 'border-slate-800'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-slate-200 font-medium leading-tight">{p.name}</p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{p.code}</p>
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${p.isExhibited ? 'bg-green-500/15 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                    {p.isExhibited ? 'Exhibido' : 'No exhibido'}
                  </span>
                </div>
                {p.isExhibited && (
                  <p className="text-xs text-slate-400 mt-2">
                    {p.exhibitionLocation || 'Sin ubicación'}{p.daysExhibited != null ? ` · ${p.daysExhibited} día(s)` : ''}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-3">
                  {p.isExhibited ? (
                    <button onClick={() => setRemoveTarget(p)} className="flex-1 px-3 py-2 rounded-lg text-red-400 bg-red-500/10 hover:bg-red-500/20 text-sm">
                      Retirar
                    </button>
                  ) : (
                    <button onClick={() => { setPlaceTarget(p); setPlaceLocation(''); }} className="flex-1 px-3 py-2 rounded-lg text-green-400 bg-green-500/10 hover:bg-green-500/20 text-sm inline-flex items-center justify-center gap-1">
                      <Plus size={16} /> Exhibir
                    </button>
                  )}
                  <button onClick={() => openHistory(p)} title="Historial" className="px-3 py-2 rounded-lg text-slate-400 bg-slate-800 hover:bg-slate-700">
                    <History size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Escáner */}
      {showScanner && (
        <BarcodeScanner
          onScan={(code) => { setSearchInput(code); setSearch(code); setShowScanner(false); }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Modal poner */}
      {placeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPlaceTarget(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Exhibir: {placeTarget.name}</h3>
              <button onClick={() => setPlaceTarget(null)}><X size={18} className="text-slate-500" /></button>
            </div>
            <label className="block text-xs text-slate-500 mb-1">Ubicación (opcional)</label>
            <input value={placeLocation} onChange={(e) => setPlaceLocation(e.target.value)} placeholder="Ej. Vitrina 3, Entrada…" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 mb-4" />
            <button onClick={confirmPlace} disabled={processing} className="btn-primary w-full disabled:opacity-50">
              {processing ? 'Guardando…' : 'Confirmar exhibición'}
            </button>
          </div>
        </div>
      )}

      {/* Modal retirar */}
      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setRemoveTarget(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Retirar: {removeTarget.name}</h3>
              <button onClick={() => setRemoveTarget(null)}><X size={18} className="text-slate-500" /></button>
            </div>
            <label className="block text-xs text-slate-500 mb-1">Motivo</label>
            <select value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 mb-3">
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <label className="block text-xs text-slate-500 mb-1">Nota (opcional)</label>
            <input value={removeNote} onChange={(e) => setRemoveNote(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 mb-4" />
            <button onClick={confirmRemove} disabled={processing} className="btn-primary w-full disabled:opacity-50">
              {processing ? 'Guardando…' : 'Confirmar retiro'}
            </button>
          </div>
        </div>
      )}

      {/* Modal historial */}
      {historyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setHistoryTarget(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-lg max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white">Historial: {historyTarget.name}</h3>
              <button onClick={() => setHistoryTarget(null)}><X size={18} className="text-slate-500" /></button>
            </div>
            {historyLoading ? (
              <Loader2 className="animate-spin mx-auto text-slate-500" />
            ) : historyEntries.length === 0 ? (
              <p className="text-slate-500 text-sm">Sin movimientos.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {historyEntries.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3 border-b border-slate-800/50 pb-1.5">
                    <span className={e.action === 'PLACED' ? 'text-green-400' : 'text-red-400'}>
                      {e.action === 'PLACED' ? 'Puesto' : 'Retirado'}
                      {e.location ? ` · ${e.location}` : ''}
                      {e.reason ? ` · ${REASON_LABEL[e.reason] ?? e.reason}` : ''}
                    </span>
                    <span className="text-slate-500 text-right shrink-0">
                      {new Date(e.createdAt).toLocaleString('es-VE')}<br />{e.createdBy?.name || ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
