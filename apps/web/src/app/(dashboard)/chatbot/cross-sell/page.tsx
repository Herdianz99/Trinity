'use client';

import { useCallback, useEffect, useState } from 'react';
import { Shuffle, Plus, Loader2, Pencil, Trash2, X, FlaskConical, RefreshCw, Check } from 'lucide-react';

type Status = 'ACTIVE' | 'PAUSED' | 'SUGGESTED' | 'DISMISSED';
interface Rule {
  id: string; trigger: string; offerTerms: string[]; excludeTerms: string[]; useMeasure: boolean; status: Status;
  statsBaseCount: number | null; statsPairPct: number | null; statsLift: number | null; timesOffered: number;
}
interface Pick { code: string; name: string; priceDetal: number }
interface Offer { term: string; measure: string | null; count: number }
interface TestResult { matchCount: number; examples: { product: Pick; offers: Offer[] }[] }
interface FormState { id: string | null; trigger: string; offer1: string; offer2: string; exclude: string; useMeasure: boolean; fromSuggestion: boolean }

const EMPTY_FORM: FormState = { id: null, trigger: '', offer1: '', offer2: '', exclude: '', useMeasure: true, fromSuggestion: false };
const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`/api/proxy/chatbot/cross-sell${path}`, {
    ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((Array.isArray(data.message) ? data.message[0] : data.message) || 'Error');
  return data;
}

export default function CrossSellPage() {
  const [tab, setTab] = useState<'rules' | 'suggested'>('rules');
  const [rules, setRules] = useState<Rule[]>([]);
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => { document.title = 'Venta cruzada | Trinity ERP'; }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/rules');
      setRules(data.rules); setAnalyzedAt(data.analyzedAt);
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const own = rules.filter((r) => r.status === 'ACTIVE' || r.status === 'PAUSED');
  // Primero lo que mas facturas llevan juntos (no el lift: arriba quedarian pares raros de pocas facturas).
  const together = (r: Rule) => ((r.statsBaseCount ?? 0) * (r.statsPairPct ?? 0)) / 100;
  const suggested = rules.filter((r) => r.status === 'SUGGESTED').sort((a, b) => together(b) - together(a));

  function openForm(r?: Rule, fromSuggestion = false) {
    setTest(null);
    setForm(r
      ? { id: r.id, trigger: r.trigger, offer1: r.offerTerms[0] || '', offer2: r.offerTerms[1] || '', exclude: r.excludeTerms.join(', '), useMeasure: r.useMeasure, fromSuggestion }
      : EMPTY_FORM);
  }

  function formBody(f: FormState) {
    return { trigger: f.trigger.trim(), offerTerms: [f.offer1, f.offer2].map((x) => x.trim()).filter(Boolean), excludeTerms: splitList(f.exclude), useMeasure: f.useMeasure };
  }

  async function runTest() {
    if (!form) return;
    setTesting(true); setTest(null);
    try { setTest(await api('/rules/test', { method: 'POST', body: JSON.stringify(formBody(form)) })); }
    catch (e: any) { setMessage({ type: 'error', text: e.message }); } finally { setTesting(false); }
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      const body = formBody(form);
      if (form.id) await api(`/rules/${form.id}`, { method: 'PATCH', body: JSON.stringify(form.fromSuggestion ? { ...body, status: 'ACTIVE' } : body) });
      else await api('/rules', { method: 'POST', body: JSON.stringify(body) });
      setForm(null);
      setMessage({ type: 'success', text: form.fromSuggestion ? 'Sugerencia activada' : 'Regla guardada (actívala con el interruptor)' });
      await load();
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); } finally { setBusy(false); }
  }

  async function setStatus(r: Rule, status: Status) {
    setBusy(true);
    try { await api(`/rules/${r.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load(); }
    catch (e: any) { setMessage({ type: 'error', text: e.message }); } finally { setBusy(false); }
  }

  async function remove(r: Rule) {
    if (!confirm(`¿Borrar la regla "${r.trigger} → ${r.offerTerms.join(', ')}"?`)) return;
    setBusy(true);
    try { await api(`/rules/${r.id}`, { method: 'DELETE' }); await load(); }
    catch (e: any) { setMessage({ type: 'error', text: e.message }); } finally { setBusy(false); }
  }

  async function analyze() {
    setBusy(true);
    try {
      const r = await api('/analyze', { method: 'POST' });
      setMessage({ type: 'success', text: `Análisis listo: ${r.suggestions} sugerencias a partir de ${r.invoices} facturas` });
      setTab('suggested'); await load();
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); } finally { setBusy(false); }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20"><Shuffle className="text-indigo-400" size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-white">Venta cruzada</h1>
            <p className="text-slate-400 text-sm">Cuando el bot cotiza un producto, ofrece un complemento disponible con su precio.</p>
          </div>
        </div>
        <button onClick={() => openForm()} className="btn-primary flex items-center gap-2"><Plus size={16} /> Nueva regla</button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm flex items-start justify-between gap-2 ${message.type === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-300' : 'bg-green-500/10 border border-green-500/20 text-green-300'}`}>
          <span>{message.text}</span><button onClick={() => setMessage(null)} aria-label="Cerrar"><X size={16} /></button>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {([['rules', `Reglas (${own.length})`], ['suggested', `Sugeridas (${suggested.length})`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === k ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>{label}</button>
        ))}
        {tab === 'suggested' && (
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-slate-500">{analyzedAt ? `Último análisis: ${new Date(analyzedAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}` : 'Sin análisis todavía'}</span>
            <button onClick={analyze} disabled={busy} className="btn-secondary !py-2 text-sm flex items-center gap-1.5 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Recalcular ahora
            </button>
          </div>
        )}
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-green-500" size={28} /></div>
        ) : tab === 'rules' ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 text-slate-400 text-left">
                <th className="px-4 py-3 font-medium">Si cotiza…</th>
                <th className="px-4 py-3 font-medium">Ofrecer…</th>
                <th className="px-4 py-3 font-medium">No aplicar si dice…</th>
                <th className="px-4 py-3 font-medium text-center">Activa</th>
                <th className="px-4 py-3 font-medium text-center">Veces ofrecida</th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {own.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-500">No hay reglas. Crea una o revisa las sugeridas.</td></tr>
              ) : own.map((r) => (
                <tr key={r.id} className="border-b border-slate-700/30">
                  <td className="px-4 py-3 text-white font-medium">{r.trigger}</td>
                  <td className="px-4 py-3 text-slate-200">
                    {r.offerTerms.join(' · ')}
                    {r.useMeasure && <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400">misma medida</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{r.excludeTerms.join(', ') || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <button disabled={busy} onClick={() => setStatus(r, r.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')}
                      className={`w-11 h-6 rounded-full relative transition-colors ${r.status === 'ACTIVE' ? 'bg-green-600' : 'bg-slate-600'}`}
                      aria-label={r.status === 'ACTIVE' ? 'Pausar' : 'Activar'}>
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${r.status === 'ACTIVE' ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-300">{r.timesOffered || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openForm(r)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700" aria-label="Editar"><Pencil size={15} /></button>
                      <button onClick={() => remove(r)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10" aria-label="Borrar"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 text-slate-400 text-left">
                <th className="px-4 py-3 font-medium">Si cotiza…</th>
                <th className="px-4 py-3 font-medium">Ofrecer…</th>
                <th className="px-4 py-3 font-medium">Datos</th>
                <th className="px-4 py-3 w-48"></th>
              </tr>
            </thead>
            <tbody>
              {suggested.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-12 text-slate-500">No hay sugerencias. Usa "Recalcular ahora".</td></tr>
              ) : suggested.map((r) => (
                <tr key={r.id} className="border-b border-slate-700/30">
                  <td className="px-4 py-3 text-white font-medium">{r.trigger}</td>
                  <td className="px-4 py-3 text-slate-200">{r.offerTerms.join(' · ')}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {Math.round(together(r))} facturas juntos ({r.statsPairPct}% de las {r.statsBaseCount} con {r.trigger}) · {r.statsLift}× más de lo normal
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openForm(r, true)} className="btn-primary !py-1.5 text-xs flex items-center gap-1"><Check size={13} /> Activar</button>
                      <button disabled={busy} onClick={() => setStatus(r, 'DISMISSED')} className="px-3 py-1.5 rounded-lg text-xs bg-slate-700 text-slate-300 hover:bg-slate-600">Descartar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setForm(null)}>
          <div className="card w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">{form.fromSuggestion ? 'Activar sugerencia' : form.id ? 'Editar regla' : 'Nueva regla'}</h2>
              <button onClick={() => setForm(null)} className="text-slate-400 hover:text-white" aria-label="Cerrar"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Si cotiza… (palabra del producto)</label>
                <input value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })} className="input-field !py-2 text-sm" placeholder="esmeril" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Ofrecer…</label>
                  <input value={form.offer1} onChange={(e) => setForm({ ...form, offer1: e.target.value })} className="input-field !py-2 text-sm" placeholder="disco de corte" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">y también (opcional)</label>
                  <input value={form.offer2} onChange={(e) => setForm({ ...form, offer2: e.target.value })} className="input-field !py-2 text-sm" placeholder="disco de desbaste" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">No aplicar si el producto dice… (opcional, separado por comas)</label>
                <input value={form.exclude} onChange={(e) => setForm({ ...form, exclude: e.target.value })} className="input-field !py-2 text-sm" placeholder="brocha, rodillo" />
              </div>
              <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-700/50 bg-slate-800/30 cursor-pointer">
                <input type="checkbox" checked={form.useMeasure} onChange={(e) => setForm({ ...form, useMeasure: e.target.checked })} className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-800 accent-indigo-500" />
                <span>
                  <span className="text-sm text-slate-200 block">Usar la medida del producto</span>
                  <span className="text-xs text-slate-500">Ej.: esmeril de 4-1/2&quot; → &quot;discos de corte para 4-1/2&quot;&quot;. Apágalo si la medida no aplica al complemento (un taladro de 1/2&quot; usa mechas de cualquier medida).</span>
                </span>
              </label>
            </div>

            <div className="mt-4">
              <button onClick={runTest} disabled={testing || !form.trigger.trim() || !form.offer1.trim()} className="btn-secondary !py-2 text-sm flex items-center gap-1.5 disabled:opacity-50">
                {testing ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />} Probar regla
              </button>
              {test && (
                <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-900/50 p-3 text-xs space-y-1.5">
                  <p className="text-slate-300">Se activa con <b className="text-white">{test.matchCount}</b> productos. Lo que diría el bot en los más vendidos:</p>
                  {test.examples.map((ex) => (
                    <p key={ex.product.code} className="text-slate-400">
                      <span className="text-slate-200">{ex.product.name}</span> →{' '}
                      {ex.offers.length
                        ? <>también tenemos <span className="text-slate-200">{ex.offers.map((o) => `${o.term}${o.measure ? ` para ${o.measure}` : ''}`).join(' y ')}</span> <span className="text-slate-500">({ex.offers.map((o) => o.count).join(' / ')} disponibles)</span></>
                        : <span className="text-amber-400">sin complemento disponible</span>}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setForm(null)} className="px-4 py-2 rounded-lg text-sm bg-slate-700/50 text-slate-300 hover:bg-slate-700">Cancelar</button>
              <button onClick={save} disabled={busy || !form.trigger.trim() || !form.offer1.trim()} className="btn-primary !py-2 text-sm disabled:opacity-50">
                {form.fromSuggestion ? 'Activar' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
