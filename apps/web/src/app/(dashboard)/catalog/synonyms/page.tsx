'use client';

import { useState, useEffect, useMemo } from 'react';
import { BookA, Plus, Pencil, Trash2, Loader2, X, Search, ArrowRight, CheckCircle2, Power } from 'lucide-react';

interface Synonym {
  id: string;
  terms: string[];
  matchTerms: string;
  categoryIds: string[];
  categories: { id: string; name: string }[];
  isActive: boolean;
  notes: string | null;
  productCount: number;
  createdBy?: { name: string } | null;
}

interface CategoryNode {
  id: string;
  name: string;
  children?: CategoryNode[];
}

interface PreviewItem {
  id: string;
  code: string;
  name: string;
  category: string | null;
}

type Tab = 'pending' | 'active' | 'all';

interface FormState {
  id?: string;
  terms: string[];
  termInput: string;
  matchTerms: string;
  categoryIds: string[];
  notes: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = { terms: [], termInput: '', matchTerms: '', categoryIds: [], notes: '', isActive: true };

export default function SynonymsPage() {
  const [rules, setRules] = useState<Synonym[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('pending');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => { document.title = 'Sinónimos de búsqueda | Trinity ERP'; }, []);

  // silent: refresca sin el spinner (al activar una regla la tabla no parpadea ni pierde el scroll).
  async function fetchRules(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/proxy/search-synonyms?status=all');
      if (res.ok) setRules(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRules();
    fetch('/api/proxy/categories')
      .then((r) => (r.ok ? r.json() : []))
      .then((roots: CategoryNode[]) => {
        const flat: { id: string; name: string }[] = [];
        for (const c of roots) {
          flat.push({ id: c.id, name: c.name });
          for (const ch of c.children || []) flat.push({ id: ch.id, name: `${c.name} › ${ch.name}` });
        }
        setCategories(flat);
      })
      .catch(() => {});
  }, []);

  const counts = useMemo(() => ({
    pending: rules.filter((r) => !r.isActive).length,
    active: rules.filter((r) => r.isActive).length,
    all: rules.length,
  }), [rules]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rules.filter((r) => {
      if (tab === 'pending' && r.isActive) return false;
      if (tab === 'active' && !r.isActive) return false;
      if (!q) return true;
      return r.matchTerms.toLowerCase().includes(q)
        || r.terms.some((t) => t.toLowerCase().includes(q))
        || (r.notes || '').toLowerCase().includes(q);
    });
  }, [rules, tab, search]);

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((r) => next.delete(r.id));
      else visible.forEach((r) => next.add(r.id));
      return next;
    });
  }

  async function setActive(ids: string[], isActive: boolean) {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch('/api/proxy/search-synonyms/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, isActive }),
      });
      if (res.ok) {
        const { updated } = await res.json();
        setMessage({ type: 'success', text: `${updated} regla(s) ${isActive ? 'activada(s)' : 'desactivada(s)'}` });
        setSelected(new Set());
        await fetchRules(true);
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: err.message || 'Error' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de conexión' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(rule: Synonym) {
    if (!confirm(`¿Eliminar la regla "${rule.terms.join(', ')}" → "${rule.matchTerms}"?`)) return;
    const res = await fetch(`/api/proxy/search-synonyms/${rule.id}`, { method: 'DELETE' });
    if (res.ok) {
      setMessage({ type: 'success', text: 'Regla eliminada' });
      fetchRules(true);
    } else {
      const err = await res.json().catch(() => ({}));
      setMessage({ type: 'error', text: err.message || 'Error al eliminar' });
    }
  }

  function openEdit(rule?: Synonym) {
    setForm(rule
      ? { id: rule.id, terms: rule.terms, termInput: '', matchTerms: rule.matchTerms, categoryIds: rule.categoryIds, notes: rule.notes || '', isActive: rule.isActive }
      : { ...EMPTY_FORM });
  }

  const selectedIds = Array.from(selected);

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
            <BookA className="text-cyan-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Sinónimos de búsqueda</h1>
            <p className="text-slate-400 text-sm">
              Palabras del cliente que también encuentran productos (POS, artículos, portal y tienda)
            </p>
          </div>
        </div>
        <button onClick={() => openEdit()} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nueva regla
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm flex items-center justify-between ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)}><X size={14} /></button>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        <div className="flex rounded-lg border border-slate-700/50 overflow-hidden text-sm">
          {([['pending', 'Pendientes'], ['active', 'Activas'], ['all', 'Todas']] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setTab(key); setSelected(new Set()); }}
              className={`px-4 py-2 transition-colors ${tab === key ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              {label} <span className="ml-1 text-xs text-slate-500">{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar palabra..."
            className="input-field !pl-9 !py-2 text-sm"
          />
        </div>
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 md:ml-auto">
            <span className="text-sm text-slate-400">{selectedIds.length} seleccionada(s)</span>
            <button onClick={() => setActive(selectedIds, true)} disabled={busy} className="btn-primary !py-1.5 text-sm flex items-center gap-1.5">
              {busy ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} Activar
            </button>
            <button onClick={() => setActive(selectedIds, false)} disabled={busy} className="btn-secondary !py-1.5 text-sm">
              Desactivar
            </button>
          </div>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="px-3 py-3 w-10">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} className="accent-green-500" />
              </th>
              <th className="text-left px-3 py-3 text-slate-400 font-medium">El cliente escribe</th>
              <th className="px-1 py-3 w-6"></th>
              <th className="text-left px-3 py-3 text-slate-400 font-medium">Encuentra productos que dicen</th>
              <th className="text-left px-3 py-3 text-slate-400 font-medium">Categorías</th>
              <th className="text-center px-3 py-3 text-slate-400 font-medium">Productos</th>
              <th className="text-center px-3 py-3 text-slate-400 font-medium">Estado</th>
              <th className="text-center px-3 py-3 text-slate-400 font-medium w-48">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-12">
                <Loader2 className="animate-spin text-green-500 mx-auto" size={28} />
              </td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-slate-500">
                {tab === 'pending' ? 'No hay reglas pendientes' : 'No hay reglas'}
              </td></tr>
            ) : visible.map((r) => (
              <tr key={r.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors group align-top">
                <td className="px-3 py-3">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} className="accent-green-500" />
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {r.terms.map((t) => (
                      <span key={t} className="px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs">{t}</span>
                    ))}
                  </div>
                  {r.notes && <p className="text-xs text-slate-500 mt-1.5">{r.notes}</p>}
                </td>
                <td className="px-1 py-3 text-slate-600"><ArrowRight size={14} className="mt-0.5" /></td>
                <td className="px-3 py-3 font-mono text-xs text-white uppercase">{r.matchTerms}</td>
                <td className="px-3 py-3 text-xs text-slate-400">
                  {r.categories.length === 0 ? <span className="text-slate-500">Todas</span> : r.categories.map((c) => c.name).join(', ')}
                </td>
                <td className={`px-3 py-3 text-center ${r.productCount === 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {r.productCount}
                </td>
                <td className="px-3 py-3 text-center">
                  <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${r.isActive
                    ? 'bg-green-500/10 border-green-500/30 text-green-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
                    {r.isActive ? 'Activa' : 'Pendiente'}
                  </span>
                </td>
                <td className="px-3 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={async () => { setTogglingId(r.id); await setActive([r.id], !r.isActive); setTogglingId(null); }}
                      disabled={busy}
                      title={r.isActive ? 'Desactivar regla' : 'Activar regla'}
                      className={`w-24 flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${r.isActive
                        ? 'border-slate-600 text-slate-300 hover:bg-slate-700'
                        : 'border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20'}`}
                    >
                      {togglingId === r.id ? <Loader2 className="animate-spin" size={12} /> : <Power size={12} />}
                      {r.isActive ? 'Desactivar' : 'Activar'}
                    </button>
                    <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white" title="Editar">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(r)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400" title="Eliminar">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <SynonymModal
          initial={form}
          categories={categories}
          onClose={() => setForm(null)}
          onSaved={(text) => { setForm(null); setMessage({ type: 'success', text }); fetchRules(true); }}
        />
      )}
    </div>
  );
}

function SynonymModal({ initial, categories, onClose, onSaved }: {
  initial: FormState;
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const [f, setF] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ total: number; items: PreviewItem[] } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [catFilter, setCatFilter] = useState('');

  // Vista previa en vivo de los productos que cumpliria la regla.
  useEffect(() => {
    const matchTerms = f.matchTerms.trim();
    if (!matchTerms) { setPreview(null); setPreviewError(''); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch('/api/proxy/search-synonyms/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matchTerms, categoryIds: f.categoryIds }),
          signal: ctrl.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) { setPreview(data); setPreviewError(''); } else { setPreview(null); setPreviewError(data.message || 'Error'); }
      } catch { /* abortado */ } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [f.matchTerms, f.categoryIds]);

  function addTerms(raw: string) {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    setF((prev) => {
      const existing = new Set(prev.terms.map((t) => t.toLowerCase()));
      const add = parts.filter((p) => !existing.has(p.toLowerCase()));
      return { ...prev, terms: [...prev.terms, ...add], termInput: '' };
    });
  }

  function toggleCategory(id: string) {
    setF((prev) => ({
      ...prev,
      categoryIds: prev.categoryIds.includes(id) ? prev.categoryIds.filter((c) => c !== id) : [...prev.categoryIds, id],
    }));
  }

  async function save() {
    const pending = f.termInput.trim();
    const terms = pending ? [...f.terms, ...pending.split(',').map((s) => s.trim()).filter(Boolean)] : f.terms;
    if (terms.length === 0) { setError('Agregue al menos una palabra del cliente'); return; }
    if (!f.matchTerms.trim()) { setError('Indique las palabras que debe tener el producto'); return; }
    setSaving(true);
    setError('');
    try {
      const body = { terms, matchTerms: f.matchTerms.trim(), categoryIds: f.categoryIds, notes: f.notes, isActive: f.isActive };
      const res = await fetch(f.id ? `/api/proxy/search-synonyms/${f.id}` : '/api/proxy/search-synonyms', {
        method: f.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) onSaved(f.id ? 'Regla actualizada' : 'Regla creada');
      else {
        const err = await res.json().catch(() => ({}));
        setError(Array.isArray(err.message) ? err.message.join(', ') : err.message || 'Error al guardar');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setSaving(false);
    }
  }

  const filteredCats = categories.filter((c) => c.name.toLowerCase().includes(catFilter.trim().toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => !saving && onClose()}>
      <div className="card w-full max-w-3xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">{f.id ? 'Editar regla' : 'Nueva regla'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">El cliente escribe</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {f.terms.map((t) => (
                <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs">
                  {t}
                  <button onClick={() => setF((p) => ({ ...p, terms: p.terms.filter((x) => x !== t) }))} className="hover:text-white"><X size={11} /></button>
                </span>
              ))}
            </div>
            <input
              value={f.termInput}
              onChange={(e) => setF((p) => ({ ...p, termInput: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTerms(f.termInput); } }}
              onBlur={() => addTerms(f.termInput)}
              placeholder='Ej: cabilla, 3/8, tres octavos (Enter o coma para agregar)'
              className="input-field !py-2 text-sm"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">Encuentra productos cuyo nombre dice</label>
            <input
              value={f.matchTerms}
              onChange={(e) => setF((p) => ({ ...p, matchTerms: e.target.value }))}
              placeholder="Ej: barra resalte 10mm"
              className="input-field !py-2 text-sm uppercase"
            />
            <p className="text-xs text-slate-500 mt-1">
              Palabras exactas del nombre, todas obligatorias y en cualquier orden. &quot;PEGO&quot; no toca &quot;PEGA&quot;; &quot;12MM&quot; no toca &quot;120MM&quot;.
            </p>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">
              Solo en estas categorías <span className="text-slate-500">({f.categoryIds.length === 0 ? 'ninguna marcada = todas' : `${f.categoryIds.length} marcada(s)`})</span>
            </label>
            <input
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              placeholder="Filtrar categorías..."
              className="input-field !py-1.5 text-sm mb-2"
            />
            <div className="max-h-32 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-slate-700/50 p-2">
              {filteredCats.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={f.categoryIds.includes(c.id)} onChange={() => toggleCategory(c.id)} className="accent-green-500" />
                  {c.name}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Notas</label>
              <input
                value={f.notes}
                onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Opcional"
                className="input-field !py-2 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300 pb-2 cursor-pointer">
              <input type="checkbox" checked={f.isActive} onChange={(e) => setF((p) => ({ ...p, isActive: e.target.checked }))} className="accent-green-500" />
              Activa
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-slate-300">Productos afectados</span>
              {previewLoading
                ? <Loader2 className="animate-spin text-slate-400" size={14} />
                : preview && <span className={`text-sm font-medium ${preview.total === 0 ? 'text-amber-400' : 'text-white'}`}>{preview.total}</span>}
            </div>
            <div className="rounded-lg border border-slate-700/50 max-h-56 overflow-y-auto">
              {previewError ? (
                <p className="p-3 text-sm text-red-400">{previewError}</p>
              ) : !preview ? (
                <p className="p-3 text-sm text-slate-500">Escriba las palabras del producto para ver a cuáles se aplica.</p>
              ) : preview.total === 0 ? (
                <p className="p-3 text-sm text-amber-400">Ningún producto activo cumple la regla.</p>
              ) : (
                <table className="w-full text-xs">
                  <tbody>
                    {preview.items.map((p) => (
                      <tr key={p.id} className="border-b border-slate-800 last:border-0">
                        <td className="px-3 py-1.5 font-mono text-slate-400 whitespace-nowrap">{p.code}</td>
                        <td className="px-3 py-1.5 text-slate-200">{p.name}</td>
                        <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{p.category || '—'}</td>
                      </tr>
                    ))}
                    {preview.total > preview.items.length && (
                      <tr><td colSpan={3} className="px-3 py-1.5 text-slate-500">… y {preview.total - preview.items.length} más</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-700/50">
          <button onClick={onClose} disabled={saving} className="btn-secondary">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving && <Loader2 className="animate-spin" size={16} />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
