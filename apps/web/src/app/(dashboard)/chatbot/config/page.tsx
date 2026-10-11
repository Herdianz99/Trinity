'use client';

import { useState, useEffect, useMemo } from 'react';
import { Settings, Loader2, Save, AlertTriangle, Search, X } from 'lucide-react';

interface Config {
  enabled: boolean;
  apiKeyConfigured: boolean;
  model: string;
  effort: string;
  botName: string;
  greeting: string | null;
  addressText: string | null;
  hoursText: string | null;
  deliveryText: string | null;
  paymentText: string | null;
  partnersText: string | null;
  extraInfo: string | null;
  divisaDiscountPct: number;
  divisaExceptionCategoryIds: string[];
  divisaExceptionProductIds: string[];
  monthlyBudgetUsd: number;
}
interface CategoryNode { id: string; name: string; children?: CategoryNode[] }
interface ProductHit { id: string; code: string; name: string }

const TEXT_FIELDS: { key: keyof Config; label: string; placeholder: string; rows: number }[] = [
  { key: 'greeting', label: 'Saludo', placeholder: 'Ej: ¡Hola amig@! Bienvenido a Inversiones El Trébol, ¿en qué te ayudo?', rows: 2 },
  { key: 'addressText', label: 'Dirección', placeholder: 'Dirección de la tienda y punto de referencia', rows: 2 },
  { key: 'hoursText', label: 'Horario', placeholder: 'Ej: Lunes a sábado 8:00 am a 5:00 pm, domingos 8:00 am a 1:00 pm', rows: 2 },
  { key: 'deliveryText', label: 'Delivery', placeholder: 'Zonas, costo y condiciones. Si se deja vacío, el bot pasa esas preguntas a un asesor.', rows: 3 },
  { key: 'paymentText', label: 'Formas de pago', placeholder: 'Ej: Bolívares a tasa BCV, divisas en efectivo y Cashea', rows: 2 },
  { key: 'partnersText', label: 'Aliados (productos que no tenemos)', placeholder: 'Ej: Aceros Portuguesa 0424-5303516 (láminas, zunchos y acero que no tengamos)', rows: 2 },
  { key: 'extraInfo', label: 'Otra información que el bot puede dar', placeholder: 'Preguntas frecuentes: cortes de cabilla, ventas al mayor, garantías generales...', rows: 4 },
];

export default function ChatbotConfigPage() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [catFilter, setCatFilter] = useState('');
  const [prodQ, setProdQ] = useState('');
  const [prodHits, setProdHits] = useState<ProductHit[]>([]);

  useEffect(() => { document.title = 'Configuración del chatbot | Trinity ERP'; }, []);

  useEffect(() => {
    fetch('/api/proxy/chatbot/config').then((r) => (r.ok ? r.json() : null)).then(setCfg);
    fetch('/api/proxy/categories').then((r) => (r.ok ? r.json() : [])).then((roots: CategoryNode[]) => {
      const flat: { id: string; name: string }[] = [];
      for (const c of roots) {
        flat.push({ id: c.id, name: c.name });
        for (const ch of c.children || []) flat.push({ id: ch.id, name: `${c.name} › ${ch.name}` });
      }
      setCategories(flat);
    });
  }, []);

  // Nombres de los productos de excepcion ya guardados.
  useEffect(() => {
    if (!cfg) return;
    const missing = cfg.divisaExceptionProductIds.filter((id) => !productNames[id]);
    if (missing.length === 0) return;
    Promise.all(missing.map((id) => fetch(`/api/proxy/products/${id}`).then((r) => (r.ok ? r.json() : null))))
      .then((rows) => setProductNames((prev) => {
        const next = { ...prev };
        rows.forEach((p, i) => { next[missing[i]] = p ? `${p.code} · ${p.name}` : '(producto no encontrado)'; });
        return next;
      }));
  }, [cfg, productNames]);

  useEffect(() => {
    const q = prodQ.trim();
    if (q.length < 2) { setProdHits([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/proxy/products/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: ProductHit[]) => setProdHits(rows.slice(0, 15)));
    }, 300);
    return () => clearTimeout(t);
  }, [prodQ]);

  const filteredCats = useMemo(
    () => categories.filter((c) => c.name.toLowerCase().includes(catFilter.trim().toLowerCase())),
    [categories, catFilter],
  );

  function set<K extends keyof Config>(key: K, value: Config[K]) {
    setCfg((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function toggleCategory(id: string) {
    if (!cfg) return;
    const has = cfg.divisaExceptionCategoryIds.includes(id);
    set('divisaExceptionCategoryIds', has ? cfg.divisaExceptionCategoryIds.filter((c) => c !== id) : [...cfg.divisaExceptionCategoryIds, id]);
  }

  function addProduct(p: ProductHit) {
    if (!cfg || cfg.divisaExceptionProductIds.includes(p.id)) return;
    setProductNames((prev) => ({ ...prev, [p.id]: `${p.code} · ${p.name}` }));
    set('divisaExceptionProductIds', [...cfg.divisaExceptionProductIds, p.id]);
    setProdQ('');
    setProdHits([]);
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setMessage(null);
    const { apiKeyConfigured, ...rest } = cfg;
    const body: Record<string, unknown> = { ...rest };
    for (const f of TEXT_FIELDS) body[f.key] = (cfg[f.key] as string | null) ?? '';
    delete body.id;
    delete body.updatedAt;
    try {
      const res = await fetch('/api/proxy/chatbot/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setCfg(data); setMessage({ type: 'success', text: 'Configuración guardada' }); }
      else setMessage({ type: 'error', text: Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Error al guardar' });
    } catch {
      setMessage({ type: 'error', text: 'Error de conexión' });
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-green-500" size={28} /></div>;

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <Settings className="text-emerald-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Configuración del chatbot</h1>
            <p className="text-slate-400 text-sm">Lo que el bot puede decir y cómo cotiza</p>
          </div>
        </div>
        <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} Guardar
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}
      {!cfg.apiKeyConfigured && (
        <div className="mb-4 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-sm flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          Falta la API key de Anthropic en el servidor (variable ANTHROPIC_API_KEY del API). Sin ella el bot no responde aunque esté encendido.
        </div>
      )}

      <div className="space-y-5">
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">General</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="flex items-center gap-3 cursor-pointer md:col-span-4">
              <input type="checkbox" checked={cfg.enabled} onChange={(e) => set('enabled', e.target.checked)} className="accent-green-500 w-4 h-4" />
              <span className="text-white font-medium">Bot encendido</span>
              <span className="text-slate-500 text-sm">Apagado, no responde ni gasta.</span>
            </label>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">Nombre del bot</label>
              <input value={cfg.botName} onChange={(e) => set('botName', e.target.value)} className="input-field !py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Tope de gasto mensual (USD)</label>
              <input type="number" min={0} step="1" value={cfg.monthlyBudgetUsd} onChange={(e) => set('monthlyBudgetUsd', Number(e.target.value))} className="input-field !py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Modelo</label>
              <select value={cfg.model} onChange={(e) => set('model', e.target.value)} className="input-field !py-2 text-sm">
                <option value="claude-haiku-5-5">Claude Haiku 5.5 (recomendado)</option>
                <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (más caro)</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3">Al llegar al tope, el bot deja de usar la IA y pasa cada conversación a un asesor hasta el mes siguiente.</p>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-1">Precio en divisas</h2>
          <p className="text-xs text-slate-500 mb-4">El bot da el precio BCV y el precio en divisas con este descuento. Para los productos y categorías de excepción dice que el precio en divisas lo confirma un asesor.</p>
          <div className="w-48 mb-4">
            <label className="block text-xs font-medium text-slate-400 mb-1">Descuento en divisas (%)</label>
            <input type="number" min={0} max={100} step="0.5" value={cfg.divisaDiscountPct} onChange={(e) => set('divisaDiscountPct', Number(e.target.value))} className="input-field !py-2 text-sm" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Categorías de excepción <span className="text-slate-500">({cfg.divisaExceptionCategoryIds.length})</span>
              </label>
              <input value={catFilter} onChange={(e) => setCatFilter(e.target.value)} placeholder="Filtrar categorías..." className="input-field !py-1.5 text-sm mb-2" />
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-700/50 p-2 space-y-1">
                {filteredCats.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={cfg.divisaExceptionCategoryIds.includes(c.id)} onChange={() => toggleCategory(c.id)} className="accent-green-500" />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Productos de excepción <span className="text-slate-500">({cfg.divisaExceptionProductIds.length})</span>
              </label>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={prodQ} onChange={(e) => setProdQ(e.target.value)} placeholder="Buscar producto para agregar (ej. cemento gris)" className="input-field !pl-8 !py-1.5 text-sm" />
                {prodHits.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
                    {prodHits.map((p) => (
                      <button key={p.id} onClick={() => addProduct(p)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-800 text-slate-200">
                        <span className="font-mono text-slate-500 mr-2">{p.code}</span>{p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-700/50 p-2 space-y-1">
                {cfg.divisaExceptionProductIds.length === 0 && <p className="text-xs text-slate-500">Ninguno</p>}
                {cfg.divisaExceptionProductIds.map((id) => (
                  <div key={id} className="flex items-center justify-between gap-2 text-xs text-slate-300">
                    <span className="truncate">{productNames[id] ?? '…'}</span>
                    <button onClick={() => set('divisaExceptionProductIds', cfg.divisaExceptionProductIds.filter((x) => x !== id))} className="text-slate-500 hover:text-red-400"><X size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-1">Información de la tienda</h2>
          <p className="text-xs text-slate-500 mb-4">El bot solo da esta información tal cual. Lo que quede vacío lo responde un asesor.</p>
          <div className="space-y-4">
            {TEXT_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-slate-400 mb-1">{f.label}</label>
                <textarea
                  value={(cfg[f.key] as string | null) ?? ''}
                  onChange={(e) => set(f.key, e.target.value as never)}
                  placeholder={f.placeholder}
                  rows={f.rows}
                  className="input-field !py-2 text-sm"
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
