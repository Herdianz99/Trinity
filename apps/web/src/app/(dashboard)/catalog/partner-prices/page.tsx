'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, RefreshCw, Download, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface PriceRow {
  code: string;
  name: string;
  myPriceDetal: number;
  myPriceMayor: number;
  partnerPriceDetal: number;
  partnerPriceMayor: number;
  differs: boolean;
}

interface Preview {
  enabled: boolean;
  available: boolean;
  partnerName: string;
  rows: PriceRow[];
  noMatchCount: number;
}

export default function PartnerPricesPage() {
  const [data, setData] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlyDiff, setOnlyDiff] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => { document.title = 'Precios socio | Trinity ERP'; }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/proxy/integration/partner/prices/preview');
      if (res.ok) {
        const d: Preview = await res.json();
        setData(d);
        // Por defecto, seleccionar las que difieren
        setSelected(new Set(d.rows.filter((r) => r.differs).map((r) => r.code)));
      } else {
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visibleRows = useMemo(() => {
    if (!data) return [];
    return onlyDiff ? data.rows.filter((r) => r.differs) : data.rows;
  }, [data, onlyDiff]);

  const diffCount = useMemo(() => (data ? data.rows.filter((r) => r.differs).length : 0), [data]);

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const allShown = visibleRows.every((r) => prev.has(r.code));
      const next = new Set(prev);
      if (allShown) visibleRows.forEach((r) => next.delete(r.code));
      else visibleRows.forEach((r) => next.add(r.code));
      return next;
    });
  }

  async function apply() {
    if (selected.size === 0) return;
    if (!confirm(`Se aplicarán los precios de ${data?.partnerName} a ${selected.size} producto(s) como precio manual. ¿Continuar?`)) return;
    setApplying(true);
    setMsg(null);
    try {
      const res = await fetch('/api/proxy/integration/partner/prices/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: Array.from(selected) }),
      });
      if (res.ok) {
        const r = await res.json();
        setMsg({ type: 'success', text: `Precios aplicados a ${r.applied} producto(s).` });
        await load();
      } else {
        setMsg({ type: 'error', text: 'No se pudieron aplicar los precios.' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Error al aplicar los precios.' });
    } finally {
      setApplying(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="animate-spin mr-2" size={20} /> Cargando…
      </div>
    );
  }

  if (!data || !data.enabled) {
    return (
      <div className="max-w-2xl mx-auto mt-10 bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 text-amber-400" size={28} />
        <p className="text-slate-300">La integración con la empresa socia no está configurada.</p>
      </div>
    );
  }

  const partnerName = data.partnerName;
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.code));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Precios de {partnerName}</h1>
          <p className="text-sm text-slate-400">Trae los precios de {partnerName} y aplícalos como precio manual.</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 px-3 py-2">
          <RefreshCw size={15} /> Refrescar
        </button>
      </div>

      {msg && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm flex items-center gap-2 ${msg.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'}`}>
          {msg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />} {msg.text}
        </div>
      )}

      {!data.available ? (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 text-center text-slate-400">
          {partnerName} no está disponible en este momento (sin conexión). Intenta de nuevo más tarde.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
            <label className="flex items-center gap-2 text-slate-300">
              <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
              Solo diferencias ({diffCount})
            </label>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400">{data.rows.length} coincidencias por código · {data.noMatchCount} sin match</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400">{selected.size} seleccionados</span>
            <button
              onClick={apply}
              disabled={applying || selected.size === 0}
              className="ml-auto bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-2 px-4 rounded-lg flex items-center gap-2"
            >
              {applying ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Aplicar seleccionados
            </button>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 text-slate-400">
                  <th className="px-3 py-2 text-left"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} /></th>
                  <th className="px-3 py-2 text-left">Código</th>
                  <th className="px-3 py-2 text-left">Artículo</th>
                  <th className="px-3 py-2 text-right">Mi detal</th>
                  <th className="px-3 py-2 text-right">{partnerName} detal</th>
                  <th className="px-3 py-2 text-right">Mi mayor</th>
                  <th className="px-3 py-2 text-right">{partnerName} mayor</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-500">No hay diferencias de precio.</td></tr>
                ) : visibleRows.slice(0, 2000).map((r) => (
                  <tr key={r.code} className="border-b border-slate-700/30">
                    <td className="px-3 py-2"><input type="checkbox" checked={selected.has(r.code)} onChange={() => toggle(r.code)} /></td>
                    <td className="px-3 py-2 font-mono text-green-400">{r.code}</td>
                    <td className="px-3 py-2 text-slate-200">{r.name}</td>
                    <td className="px-3 py-2 text-right text-slate-300">${r.myPriceDetal.toFixed(2)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${r.differs ? 'text-amber-400' : 'text-slate-400'}`}>${r.partnerPriceDetal.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-slate-300">${r.myPriceMayor.toFixed(2)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${r.differs ? 'text-amber-400' : 'text-slate-400'}`}>${r.partnerPriceMayor.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleRows.length > 2000 && (
              <div className="text-center py-2 text-xs text-slate-500">Mostrando 2000 de {visibleRows.length}. Usa "Solo diferencias" para acotar.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
