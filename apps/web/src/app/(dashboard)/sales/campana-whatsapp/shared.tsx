// Tipos y utilidades compartidas de la Campana de WhatsApp (Ventas > Campana WhatsApp).

export type Estado = 'Activo' | 'Enfriándose' | 'Inactivo' | 'Nuevo';

// Cotizacion pendiente (pestana "Cotizaciones sin comprar")
export interface QuoteInfo {
  id: string;
  number: string;
  at: string;
  ymd: string;
  daysAgo: number;
  usd: number;
  items: string[];
  nItems: number;
}
export type Segment = 'VIP' | 'Frecuente' | 'Recurrente' | 'Ocasional';

export interface CampaignCustomer {
  id: string;
  c: string;
  n: string;
  fn: string;
  t: 'Persona' | 'Empresa';
  wa: string;
  r: string;
  b: string;
  o: 0 | 1;
  sg: Segment;
  st: Estado;
  d: number;
  u: string;
  tot: number;
  dc: number;
  p: string;
  q?: QuoteInfo;
  lastSentAt: string | null;
  replied: boolean;
  noWhatsapp: boolean;
}

export interface ListResponse {
  generado: string;
  calculadoAt: string;
  totalClientes: number;
  items: CampaignCustomer[];
  total: number;
  page: number;
  pages: number;
  tabCounts: Record<string, number>;
  stats: { sentToday: number; dailyLimit: number; contacted: number; replied: number; noWhatsapp: number };
}

export interface TemplateInfo {
  key: string;
  label: string;
  description: string;
  text: string;
  edited: boolean;
}

export interface TemplatesResponse {
  storeName: string;
  dailyLimit: number;
  bases: { key: string; label: string; area: string }[];
  coolingKey: string;
  quoteKey: string;
  templates: TemplateInfo[];
}

export const isCooling = (c: { st: Estado }) => c.st === 'Enfriándose' || c.st === 'Inactivo';

// Con cotizacion pendiente manda la plantilla de cotizacion; si no, enfriandose/inactivo o la del rubro.
export const templateKeyFor = (c: CampaignCustomer, cfg: Pick<TemplatesResponse, 'coolingKey' | 'quoteKey'>) =>
  c.q ? cfg.quoteKey : isCooling(c) ? cfg.coolingKey : c.b;

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "ayer" / "martes 21-10" para el mensaje de cotizacion. */
export function quoteDateText(q: QuoteInfo): string {
  if (q.daysAgo === 1) return 'ayer';
  const d = new Date(q.ymd + 'T12:00:00Z');
  return `${DIAS[d.getUTCDay()]} ${q.ymd.slice(8, 10)}-${q.ymd.slice(5, 7)}`;
}

const prettyProduct = (s: string) => s.toLowerCase().replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();

/** "cemento gris, pego y cabilla 3/8 y 2 productos más" */
export function quoteProductsText(q: QuoteInfo): string {
  const names = q.items.slice(0, 2).map(prettyProduct);
  const rest = q.nItems - names.length;
  if (rest > 0) return `${names.join(', ')} y ${rest === 1 ? 'otro producto' : `${rest} productos más`}`;
  return names.length === 2 ? `${names[0]} y ${names[1]}` : names[0] ?? '';
}

/** Arma el mensaje reemplazando las variables de la plantilla con los datos del cliente. */
export function buildMessage(c: CampaignCustomer, cfg: TemplatesResponse): string {
  const key = templateKeyFor(c, cfg);
  const tpl = cfg.templates.find((t) => t.key === key)?.text ?? '';
  const base = cfg.bases.find((b) => b.key === c.b) ?? cfg.bases.find((b) => b.key === 'HOGAR');
  const vars: Record<string, string> = {
    saludo: c.fn ? `Hola ${c.fn}` : 'Hola',
    nombre: c.fn || '',
    empresa: cfg.storeName,
    area: base?.area ?? '',
    gracias: c.sg === 'VIP' || c.sg === 'Frecuente' ? '¡Gracias por tu preferencia!' : '',
    producto: c.p ? prettyProduct(c.p) : '',
    cotizacion: c.q?.number ?? '',
    fecha: c.q ? quoteDateText(c.q) : '',
    productos: c.q ? quoteProductsText(c.q) : '',
    monto: c.q ? '$' + fmt2(c.q.usd) : '',
  };
  return tpl
    .replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Donde abrir WhatsApp: preferencia de este dispositivo (en el telefono conviene la app).
export type OpenMode = 'web' | 'app';
const MODE_KEY = 'trinity-campana-wa-modo';

export function readOpenMode(): OpenMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === 'web' || v === 'app') return v;
  } catch {}
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches ? 'app' : 'web';
}

export function saveOpenMode(m: OpenMode) {
  try { localStorage.setItem(MODE_KEY, m); } catch {}
}

export function whatsappUrl(wa: string, text: string, mode: OpenMode) {
  const t = encodeURIComponent(text);
  return mode === 'app' ? `https://wa.me/${wa}?text=${t}` : `https://web.whatsapp.com/send?phone=${wa}&text=${t}`;
}

export const fmtUsd = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-VE');
export const fmt2 = (n: number) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtYmd = (ymd: string) => (ymd ? `${ymd.slice(8, 10)}-${ymd.slice(5, 7)}-${ymd.slice(0, 4)}` : '');
export const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';

/** YYYY-MM-DD local (navegador = Caracas para el usuario). */
export function localYmd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const SEG_STYLE: Record<Segment, string> = {
  VIP: 'bg-violet-500/15 border-violet-500/40 text-violet-200',
  Frecuente: 'bg-sky-500/15 border-sky-500/40 text-sky-200',
  Recurrente: 'bg-slate-700/60 border-slate-600 text-slate-200',
  Ocasional: 'bg-transparent border-slate-700 text-slate-400',
};

export const ESTADO_STYLE: Record<string, string> = {
  Activo: 'text-emerald-300',
  'Enfriándose': 'text-amber-300',
  Inactivo: 'text-rose-300',
  Nuevo: 'text-sky-300',
  'Cotización': 'text-violet-300',
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy/whatsapp-campaign${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) {
    let msg = 'Error de servidor';
    try { const j = await res.json(); msg = Array.isArray(j?.message) ? j.message.join(', ') : j?.message || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// Logo de WhatsApp (SVG inline, mismo que Recordatorios).
export function WhatsAppIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.157 5.335 5.492 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.82 9.82 0 001.599 5.339l-.999 3.648 3.889-.336zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.767.967-.94 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}

export function Modal({ title, onClose, children, footer, wide = false }: {
  title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        className={`bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-xl w-full ${wide ? 'sm:max-w-4xl' : 'sm:max-w-xl'} max-h-[92vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-700/60">
          <div className="min-w-0">{title}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none px-1" aria-label="Cerrar">✕</button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-700/60 flex flex-wrap gap-2 justify-end">{footer}</div>}
      </div>
    </div>
  );
}

export const btn = 'px-3 py-2 rounded-lg text-sm border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition-colors';
export const btnWa = 'px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors';
export const input = 'bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/60';
