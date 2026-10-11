'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SearchX, Loader2, Plus } from 'lucide-react';

interface Row { query: string; times: number; lastAt: string }

export default function ChatbotMissedPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = 'Búsquedas sin resultado | Trinity ERP'; }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/proxy/chatbot/searches/missed?days=${days}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <SearchX className="text-amber-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Búsquedas sin resultado</h1>
            <p className="text-slate-400 text-sm">Lo que los clientes pidieron y el bot no encontró. Si el producto existe con otro nombre, crea un sinónimo.</p>
          </div>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="input-field !py-2 text-sm w-40">
          <option value={7}>Últimos 7 días</option>
          <option value={30}>Últimos 30 días</option>
          <option value={90}>Últimos 90 días</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 text-slate-400">
              <th className="text-left px-4 py-3 font-medium">El cliente buscó</th>
              <th className="text-center px-4 py-3 font-medium">Veces</th>
              <th className="text-left px-4 py-3 font-medium">Última vez</th>
              <th className="px-4 py-3 w-40"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="text-center py-12"><Loader2 className="animate-spin text-green-500 mx-auto" size={28} /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-12 text-slate-500">No hay búsquedas sin resultado en este período</td></tr>
            ) : rows.map((r) => (
              <tr key={r.query} className="border-b border-slate-700/30">
                <td className="px-4 py-3 text-white">{r.query}</td>
                <td className="px-4 py-3 text-center text-slate-300">{r.times}</td>
                <td className="px-4 py-3 text-slate-400">{new Date(r.lastAt).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/catalog/synonyms?nuevo=${encodeURIComponent(r.query)}`} className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300">
                    <Plus size={13} /> Crear sinónimo
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
