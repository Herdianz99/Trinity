'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Bot, Send, Loader2, Plus, ImagePlus, X, Search, AlertTriangle, UserRound, RotateCcw, Wrench, Copy, Check, ThumbsUp, ThumbsDown, Image as ImageIcon } from 'lucide-react';

interface ToolCall { name: string; input: any; result: any }
interface ProductImage { code: string; name: string; url: string }
interface Msg {
  id: string;
  role: 'USER' | 'BOT' | 'SYSTEM';
  text: string;
  imageUrls?: string[];
  productImages?: ProductImage[] | null;
  toolCalls?: ToolCall[] | null;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  costUsd?: number;
  rating?: number | null;
  createdAt: string;
}
interface Conversation {
  id: string;
  status: 'BOT' | 'ESCALATED' | 'CLOSED';
  escalationReason: string | null;
  escalationSummary: string | null;
  costUsd: number;
  messages: Msg[];
}
interface ConfigView { enabled: boolean; apiKeyConfigured: boolean; model: string; botName: string }
interface Stats { monthCostUsd: number; monthlyBudgetUsd: number }

const STORAGE_KEY = 'chatbot-test-conversation';
const TOOL_LABEL: Record<string, string> = {
  buscar_productos: 'Buscó productos',
  enviar_foto: 'Envió foto',
  calcular_bolivares: 'Calculó bolívares',
  escalar_a_asesor: 'Pasó a un asesor',
};

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const EMPTY_CONV: Conversation = { id: '', status: 'BOT', escalationReason: null, escalationSummary: null, costUsd: 0, messages: [] };

const money = (n?: number) => `$${(n ?? 0).toFixed(4)}`;

export default function ChatbotTestPage() {
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Msg | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchRes, setSearchRes] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { document.title = 'Probar bot | Trinity ERP'; }, []);

  async function loadMeta() {
    const [c, s] = await Promise.all([
      fetch('/api/proxy/chatbot/config').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/proxy/chatbot/stats').then((r) => (r.ok ? r.json() : null)),
    ]);
    setConfig(c);
    setStats(s);
  }

  async function loadConversation(id: string) {
    const res = await fetch(`/api/proxy/chatbot/conversations/${id}`);
    if (!res.ok) { localStorage.removeItem(STORAGE_KEY); setConv(EMPTY_CONV); return; }
    setConv(await res.json());
  }

  // La conversacion se crea en el servidor al enviar el primer mensaje (no deja conversaciones vacias).
  function newConversation() {
    localStorage.removeItem(STORAGE_KEY);
    setConv(EMPTY_CONV);
    setSelected(null);
    setError('');
  }

  useEffect(() => {
    loadMeta();
    const id = localStorage.getItem(STORAGE_KEY);
    if (id) loadConversation(id); else newConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conv?.messages.length, sending]);

  async function send() {
    if (!conv || sending || (!text.trim() && images.length === 0)) return;
    let convId = conv.id;
    if (!convId) {
      const created = await fetch('/api/proxy/chatbot/conversations', { method: 'POST' });
      if (!created.ok) { setError('No se pudo crear la conversación'); return; }
      convId = (await created.json()).id as string;
      localStorage.setItem(STORAGE_KEY, convId);
    }
    const optimistic: Msg = { id: `tmp-${Date.now()}`, role: 'USER', text: text.trim(), imageUrls: images, createdAt: new Date().toISOString() };
    setConv({ ...conv, messages: [...conv.messages, optimistic] });
    const body = { text: text.trim(), images };
    setText('');
    setImages([]);
    setSending(true);
    setError('');
    try {
      const res = await fetch(`/api/proxy/chatbot/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Error');
      else setSelected(data.message);
    } catch {
      setError('Error de conexión');
    } finally {
      setSending(false);
      await loadConversation(convId);
      loadMeta();
    }
  }

  async function backToBot() {
    if (!conv?.id) return;
    await fetch(`/api/proxy/chatbot/conversations/${conv.id}/reset`, { method: 'POST' });
    await loadConversation(conv.id);
  }

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const list = await Promise.all(Array.from(files).slice(0, 4 - images.length).map(fileToDataUri));
    setImages((prev) => [...prev, ...list].slice(0, 4));
  }

  async function runSearch() {
    if (!searchQ.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/proxy/chatbot/tools/search?q=${encodeURIComponent(searchQ.trim())}`);
      setSearchRes(res.ok ? await res.json() : null);
    } finally {
      setSearching(false);
    }
  }

  const blocked = !!config && (!config.enabled || !config.apiKeyConfigured);

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      <div className="mb-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <Bot className="text-emerald-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Probar bot</h1>
            <p className="text-slate-400 text-sm">
              Escríbele como si fueras un cliente de WhatsApp. {config && <>Modelo: <span className="text-slate-300">{config.model}</span>.</>}
              {stats && <> Gasto del mes: <span className="text-slate-300">${stats.monthCostUsd.toFixed(2)}</span> de ${stats.monthlyBudgetUsd.toFixed(2)}.</>}
            </p>
          </div>
        </div>
        <button onClick={newConversation} className="btn-primary flex items-center gap-2 self-start lg:self-auto">
          <Plus size={18} /> Nueva conversación
        </button>
      </div>

      {blocked && (
        <div className="mb-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-sm flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            {!config!.apiKeyConfigured
              ? 'Falta la API key de Anthropic (ANTHROPIC_API_KEY en el .env del API). Mientras tanto puedes probar el buscador del bot a la derecha, que no gasta.'
              : <>El bot está apagado. Actívalo en <Link href="/chatbot/config" className="underline">Configuración</Link>.</>}
          </span>
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
        {/* Chat */}
        <div className="card flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.06)_1px,transparent_0)] [background-size:18px_18px]">
            {conv?.messages.length === 0 && (
              <p className="text-center text-slate-500 text-sm mt-10">Prueba con: &quot;buenas, precio del cemento&quot; o &quot;tienen cabilla de 3/8?&quot;</p>
            )}
            {conv?.messages.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.role === 'USER' ? 'items-end' : 'items-start'}`}>
                <button
                  type="button"
                  onClick={() => m.role === 'BOT' && setSelected(m)}
                  className={`max-w-[78%] text-left rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap shadow ${m.role === 'USER'
                    ? 'bg-emerald-700/70 text-white rounded-br-sm'
                    : `bg-slate-800 text-slate-100 rounded-bl-sm border ${selected?.id === m.id ? 'border-emerald-500/60' : 'border-slate-700/60'} hover:border-emerald-500/40`}`}
                >
                  {m.imageUrls && m.imageUrls.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {m.imageUrls.map((u) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={u} src={u} alt="" className="h-28 rounded-lg object-cover" />
                      ))}
                    </div>
                  )}
                  {m.text}
                  {m.productImages && m.productImages.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.productImages.map((p) => (
                        <figure key={p.code} className="w-36">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.url} alt={p.name} className="w-36 h-36 rounded-lg object-contain bg-white" />
                          <figcaption className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{p.name}</figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                  {m.role === 'BOT' && (m.costUsd ?? 0) > 0 && (
                    <span className="block text-[10px] text-slate-500 mt-1 text-right">{money(m.costUsd)}</span>
                  )}
                </button>
                {m.role === 'BOT' && !m.id.startsWith('tmp-') && (
                  <BotActions msg={m} onRated={(rating) => setConv((c) => c && { ...c, messages: c.messages.map((x) => (x.id === m.id ? { ...x, rating } : x)) })} />
                )}
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-slate-800 border border-slate-700/60 rounded-2xl rounded-bl-sm px-4 py-2.5">
                  <Loader2 className="animate-spin text-emerald-400" size={16} />
                </div>
              </div>
            )}
            {conv?.status === 'ESCALATED' && (
              <div className="mx-auto max-w-md p-3 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-200 text-xs">
                <div className="flex items-center gap-1.5 font-medium mb-1"><UserRound size={14} /> Pasada a un asesor · {conv.escalationReason}</div>
                {conv.escalationSummary && <p className="text-sky-300/80">{conv.escalationSummary}</p>}
                <button onClick={backToBot} className="mt-2 flex items-center gap-1 underline hover:text-white">
                  <RotateCcw size={12} /> Volver a modo bot (solo para pruebas)
                </button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {error && <div className="px-4 py-2 text-sm text-red-400 border-t border-slate-700/50">{error}</div>}

          {images.length > 0 && (
            <div className="flex gap-2 px-4 pt-3 border-t border-slate-700/50">
              {images.map((src, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  <button onClick={() => setImages((p) => p.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 bg-slate-900 rounded-full p-0.5 text-slate-300 hover:text-white">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 p-3 border-t border-slate-700/50">
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            <button onClick={() => fileRef.current?.click()} disabled={conv?.status !== 'BOT'} className="p-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-40" title="Adjuntar foto">
              <ImagePlus size={20} />
            </button>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={conv?.status === 'BOT' ? 'Escribe como cliente… (Enter para enviar)' : 'La conversación está con un asesor'}
              disabled={conv?.status !== 'BOT'}
              rows={1}
              className="input-field !py-2.5 text-sm resize-none flex-1 max-h-32"
            />
            <button onClick={send} disabled={sending || conv?.status !== 'BOT' || (!text.trim() && images.length === 0)} className="btn-primary !px-3 !py-2.5 disabled:opacity-40">
              {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
            </button>
          </div>
        </div>

        {/* Diagnostico */}
        <div className="card min-h-0 overflow-y-auto p-4 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Wrench size={14} /> Qué hizo el bot</h2>
            {!selected ? (
              <p className="text-sm text-slate-500">Toca una respuesta del bot para ver qué buscó, qué encontró y cuánto costó.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-slate-800/60 p-2"><div className="text-slate-500">Entrada</div><div className="text-white">{selected.inputTokens ?? 0}</div></div>
                  <div className="rounded-lg bg-slate-800/60 p-2"><div className="text-slate-500">Salida</div><div className="text-white">{selected.outputTokens ?? 0}</div></div>
                  <div className="rounded-lg bg-slate-800/60 p-2"><div className="text-slate-500">Costo</div><div className="text-white">{money(selected.costUsd)}</div></div>
                </div>
                {(selected.toolCalls ?? []).length === 0 && <p className="text-sm text-slate-500">No usó herramientas.</p>}
                {(selected.toolCalls ?? []).map((t, i) => <ToolCallView key={i} call={t} />)}
              </div>
            )}
          </div>

          <div className="border-t border-slate-700/50 pt-4">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Search size={14} /> Buscador del bot (sin IA)</h2>
            <div className="flex gap-2">
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                placeholder="Ej: cabilla 3/8"
                className="input-field !py-1.5 text-sm"
              />
              <button onClick={runSearch} disabled={searching} className="btn-secondary !py-1.5 text-sm">
                {searching ? <Loader2 className="animate-spin" size={14} /> : 'Buscar'}
              </button>
            </div>
            {searchRes && <ProductList result={searchRes} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductList({ result }: { result: any }) {
  const items: any[] = result?.productos ?? [];
  if (items.length === 0) return <p className="text-xs text-amber-400 mt-2">Sin resultados para &quot;{result?.consulta}&quot;.</p>;
  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-[11px] text-slate-500">{result.total_encontrados} encontrados · se muestran los {items.length} que ve el bot</p>
      {items.map((p) => (
        <div key={p.codigo} className="rounded-lg bg-slate-800/60 px-2.5 py-1.5 text-xs">
          <div className="text-slate-200">{p.nombre}</div>
          <div className="flex flex-wrap gap-x-2 text-slate-400 mt-0.5">
            <span className="font-mono">{p.codigo}</span>
            <span className="text-white">{p.precio_bcv}</span>
            <span>{p.precio_divisas}</span>
            <span className={p.disponible ? 'text-green-400' : 'text-red-400'}>{p.disponible ? 'disponible' : 'agotado'}</span>
            {p.en_oferta && <span className="text-amber-400">oferta</span>}
            {p.variante && <span className="text-slate-500">variante</span>}
            {p.tiene_foto && <span className="text-slate-500">foto</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function ToolCallView({ call }: { call: ToolCall }) {
  const input = call.input ?? {};
  return (
    <div className="rounded-lg border border-slate-700/60 p-2.5">
      <div className="text-xs font-medium text-emerald-300">{TOOL_LABEL[call.name] ?? call.name}</div>
      <div className="text-xs text-slate-400 mt-0.5 break-words">
        {Object.entries(input).map(([k, v]) => <span key={k} className="mr-2">{k}: <span className="text-slate-200">{String(v)}</span></span>)}
      </div>
      {call.name === 'buscar_productos' ? (
        <ProductList result={call.result} />
      ) : (
        <pre className="mt-1 text-[11px] text-slate-400 whitespace-pre-wrap break-words">{JSON.stringify(call.result, null, 1)}</pre>
      )}
    </div>
  );
}

// Acciones del piloto: quien atiende el WhatsApp copia la respuesta (y la foto) para pegarla en la
// conversacion real, y califica si la uso tal cual (1) o tuvo que corregirla (-1).
function BotActions({ msg, onRated }: { msg: Msg; onRated: (rating: number | null) => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const flash = (k: string) => { setCopied(k); setTimeout(() => setCopied(null), 1500); };

  async function copyText() {
    await navigator.clipboard.writeText(msg.text);
    flash('text');
  }

  async function copyImage(p: ProductImage) {
    try {
      const res = await fetch(`/api/proxy/chatbot/image.png?url=${encodeURIComponent(p.url)}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      flash(p.code);
    } catch {
      window.open(p.url, '_blank'); // respaldo: abrir la foto para guardarla a mano
    }
  }

  async function rate(value: number) {
    const next = msg.rating === value ? 0 : value;
    const res = await fetch(`/api/proxy/chatbot/messages/${msg.id}/rating`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: next }),
    });
    if (res.ok) onRated(next === 0 ? null : next);
  }

  const btn = 'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-slate-700/60 hover:bg-slate-700/60 transition-colors';
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1 ml-1">
      <button onClick={copyText} className={`${btn} text-slate-300`} title="Copiar el texto para pegarlo en WhatsApp">
        {copied === 'text' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />} {copied === 'text' ? 'Copiado' : 'Copiar'}
      </button>
      {(msg.productImages ?? []).map((p) => (
        <button key={p.code} onClick={() => copyImage(p)} className={`${btn} text-slate-300`} title={`Copiar la foto de ${p.name}`}>
          {copied === p.code ? <Check size={12} className="text-emerald-400" /> : <ImageIcon size={12} />} {copied === p.code ? 'Foto copiada' : 'Copiar foto'}
        </button>
      ))}
      <span className="w-px h-4 bg-slate-700 mx-0.5" />
      <button onClick={() => rate(1)} title="La usé tal cual" className={`${btn} ${msg.rating === 1 ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'text-slate-400'}`}>
        <ThumbsUp size={12} />
      </button>
      <button onClick={() => rate(-1)} title="Tuve que corregirla" className={`${btn} ${msg.rating === -1 ? 'bg-red-500/20 border-red-500/50 text-red-300' : 'text-slate-400'}`}>
        <ThumbsDown size={12} />
      </button>
    </div>
  );
}
